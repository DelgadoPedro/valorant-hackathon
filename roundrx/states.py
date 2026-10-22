"""Camada 2: tabelas intermediárias que destravam as métricas.

- round_events : linha do tempo do round (kills, plant, defuse, revives inferidos) com vivos por time
- trades       : cada morte elegível -> foi trocada? por quem? em quanto tempo?
- team_rounds  : 1 linha por (partida, round, time) com lado, resultado, economia e contexto
"""
from __future__ import annotations

import numpy as np
import pandas as pd


# ----------------------------------------------------------------------------- timeline
def build_round_events(t: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Reconstrói vivos por time após cada evento.

    Regras (auditáveis na coluna `note`):
    - toda morte (inimigo, aliado, suicídio, spike) reduz vivos;
    - revive inferido quando um jogador morto reaparece no snapshot `playerLocations`
      de uma kill posterior, ou quando morre de novo (Sage/Clove etc.);
    - kill feita por jogador morto e ausente do snapshot = kill póstuma (não revive).
    """
    kills = t["kills"][t["kills"]["in_play"]].sort_values(["match_id", "round_num", "kill_idx"])
    snaps = t["kill_positions"].groupby(["match_id", "round_num", "kill_idx"])["puuid"].agg(set).to_dict()
    roster = t["round_players"].groupby(["match_id", "round_num", "team_id"])["puuid"].agg(set).to_dict()
    rounds = t["rounds"].set_index(["match_id", "round_num"])[
        ["has_plant", "plant_time_ms", "has_defuse", "defuse_time_ms", "planter", "defuser"]].to_dict("index")

    rows = []
    for (mid, rn), grp in kills.groupby(["match_id", "round_num"], sort=False):
        teams = {tid: roster.get((mid, rn, tid), set()) for tid in ("Red", "Blue")}
        size = {tid: len(p) for tid, p in teams.items()}
        dead: dict[str, float] = {}
        team_of = {p: tid for tid, ps in teams.items() for p in ps}
        rinfo = rounds[(mid, rn)]
        events = [("kill", int(k.t_ms), k) for k in grp.itertuples(index=False)]
        if rinfo["has_plant"]:
            events.append(("plant", int(rinfo["plant_time_ms"]), None))
        if rinfo["has_defuse"]:
            events.append(("defuse", int(rinfo["defuse_time_ms"]), None))
        # kills antes de plant/defuse no mesmo ms
        order = {"kill": 0, "plant": 1, "defuse": 2}
        events.sort(key=lambda e: (e[1], order[e[0]], e[2].kill_idx if e[2] is not None else 0))

        def alive(tid):
            return size[tid] - sum(1 for p in dead if team_of.get(p) == tid)

        seq = 0
        for etype, tms, k in events:
            if etype == "kill":
                snap = snaps.get((mid, rn, k.kill_idx), set())
                for p in [p for p in dead if p in snap]:
                    dead.pop(p)
                    rows.append(_ev(mid, rn, seq, tms, "revive", None, None, p, team_of.get(p), alive("Red"), alive("Blue"), "reapareceu no snapshot"))
                    seq += 1
                if k.victim in dead:
                    dead.pop(k.victim)
                    rows.append(_ev(mid, rn, seq, tms, "revive", None, None, k.victim, team_of.get(k.victim), alive("Red"), alive("Blue"), "morreu duas vezes"))
                    seq += 1
                note = "kill póstuma" if (k.killer in dead and k.kill_type == "enemy") else ""
                dead[k.victim] = tms
                rows.append(_ev(mid, rn, seq, tms, "kill", k.kill_idx, k.killer, k.victim, k.victim_team, alive("Red"), alive("Blue"), note, k.killer_team, k.kill_type))
            else:
                actor = rinfo["planter"] if etype == "plant" else rinfo["defuser"]
                rows.append(_ev(mid, rn, seq, tms, etype, None, actor, None, None, alive("Red"), alive("Blue"), "", team_of.get(actor)))
            seq += 1

    ev = pd.DataFrame(rows)
    # rounds sem kills (raro) ainda podem ter plant
    return ev


def _ev(mid, rn, seq, t_ms, etype, kill_idx, actor, target, target_team, red, blue, note, actor_team=None, kill_type=None):
    return {
        "match_id": mid, "round_num": rn, "seq": seq, "t_ms": t_ms, "event": etype,
        "kill_idx": kill_idx, "actor": actor, "actor_team": actor_team, "target": target,
        "target_team": target_team, "kill_type": kill_type, "red_alive": red, "blue_alive": blue, "note": note,
    }


def alive_at(events: pd.DataFrame, t_ms_by_round: pd.Series, inclusive: bool = True) -> pd.DataFrame:
    """Vivos de cada time no instante t (após eventos com t ≤ instante). Índice (match_id, round_num)."""
    out = {}
    ev = events[events["event"] != "plant"]
    for (mid, rn), grp in ev.groupby(["match_id", "round_num"], sort=False):
        if (mid, rn) not in t_ms_by_round.index:
            continue
        tt = t_ms_by_round.loc[(mid, rn)]
        if pd.isna(tt):
            continue
        g = grp[grp["t_ms"] <= tt] if inclusive else grp[grp["t_ms"] < tt]
        if len(g):
            last = g.iloc[-1]
            out[(mid, rn)] = (int(last["red_alive"]), int(last["blue_alive"]))
    idx = pd.MultiIndex.from_tuples(list(out.keys()), names=["match_id", "round_num"]) if out else None
    return pd.DataFrame(list(out.values()), index=idx, columns=["red_alive", "blue_alive"])


# ----------------------------------------------------------------------------- trades
def build_trades(t: dict[str, pd.DataFrame], window_s: float) -> pd.DataFrame:
    """Para cada morte por inimigo: foi trocada (aliado da vítima matou o killer em ≤ janela)?"""
    k = t["kills"]
    enemy = k[(k["kill_type"] == "enemy") & k["in_play"]].sort_values(["match_id", "round_num", "kill_idx"])
    win_ms = window_s * 1000
    rows = []
    for (mid, rn), grp in enemy.groupby(["match_id", "round_num"], sort=False):
        recs = list(grp.itertuples(index=False))
        for i, d in enumerate(recs):
            traded, trader, dt, trade_idx = False, None, None, None
            for later in recs[i + 1:]:
                if later.t_ms - d.t_ms > win_ms:
                    break
                if later.victim == d.killer and later.killer_team == d.victim_team and later.killer != d.victim:
                    traded, trader, dt, trade_idx = True, later.killer, (later.t_ms - d.t_ms) / 1000, later.kill_idx
                    break
            rows.append({
                "match_id": mid, "round_num": rn, "kill_idx": d.kill_idx, "t_ms": d.t_ms,
                "victim": d.victim, "victim_team": d.victim_team, "killer": d.killer, "killer_team": d.killer_team,
                "traded": traded, "trader": trader, "trade_time_s": dt, "trade_kill_idx": trade_idx,
            })
    return pd.DataFrame(rows)


# ----------------------------------------------------------------------------- economy
def _band(v, eco_max, full_min):
    if pd.isna(v):
        return None
    return "eco" if v < eco_max else ("full" if v >= full_min else "half")


def build_team_rounds(t: dict[str, pd.DataFrame], cfg) -> pd.DataFrame:
    e = cfg["economy"]
    rp = t["round_players"].copy()
    rp["player_band"] = [_band(v, e["player_eco_max"], e["player_full_min"]) for v in rp["loadout_value"]]
    rp["available"] = rp["spent"].fillna(0) + rp["remaining"].fillna(0)

    def _cv(s):
        m = s.mean()
        return float(s.std(ddof=0) / m) if m and m > 0 else np.nan

    g = rp.groupby(["match_id", "round_num", "team_id"])
    tr = g.agg(
        n_players=("puuid", "size"),
        team_loadout=("loadout_value", "sum"),
        team_spent=("spent", "sum"),
        team_remaining=("remaining", "sum"),
        team_available=("available", "sum"),
        team_damage=("damage_to_enemies", "sum"),
    ).reset_index()
    tr["loadout_cv"] = g["loadout_value"].apply(_cv).values
    tr["spent_cv"] = g["spent"].apply(_cv).values
    tr["n_below_eco"] = g["player_band"].apply(lambda s: int((s == "eco").sum())).values
    tr["buy_sync"] = g["player_band"].apply(lambda s: s.value_counts().iloc[0] / len(s) if len(s) else np.nan).values
    tr["dmg_hhi"] = g["damage_to_enemies"].apply(
        lambda s: float(((s / s.sum()) ** 2).sum()) if s.sum() > 0 else np.nan).values
    tr["dmg_top2_share"] = g["damage_to_enemies"].apply(
        lambda s: float(s.nlargest(2).sum() / s.sum()) if s.sum() > 0 else np.nan).values

    r = t["rounds"]
    tr = tr.merge(r[["match_id", "round_num", "winning_team", "atk_team", "is_pistol", "is_overtime", "half",
                     "has_plant", "planter_team", "plant_site", "plant_time_ms", "has_defuse", "defuser_team",
                     "defuse_time_ms", "ceremony", "result", "map_name"]], on=["match_id", "round_num"], how="left")
    tr["side"] = np.where(tr["team_id"] == tr["atk_team"], "atk", "def")
    tr["won"] = tr["team_id"] == tr["winning_team"]

    names = t["teams"][["match_id", "team_id", "team_name", "opponent_name"]]
    tr = tr.merge(names, on=["match_id", "team_id"], how="left")
    meta = t["matches"][["match_id", "competition", "stage", "date"]]
    tr = tr.merge(meta, on="match_id", how="left")

    # adversário
    opp = tr[["match_id", "round_num", "team_id", "team_loadout", "team_spent"]].copy()
    opp["team_id"] = opp["team_id"].map({"Red": "Blue", "Blue": "Red"})
    opp = opp.rename(columns={"team_loadout": "opp_loadout", "team_spent": "opp_spent"})
    tr = tr.merge(opp, on=["match_id", "round_num", "team_id"], how="left")
    tr["loadout_diff"] = tr["team_loadout"] - tr["opp_loadout"]
    tr["buy_type"] = [_band(v, e["team_eco_max"], e["team_full_min"]) for v in tr["team_loadout"]]
    tr["opp_buy_type"] = [_band(v, e["team_eco_max"], e["team_full_min"]) for v in tr["opp_loadout"]]
    tr.loc[tr["is_pistol"], ["buy_type", "opp_buy_type"]] = "pistol"
    tr["econ_rel"] = np.select(
        [tr["loadout_diff"] >= e["big_gap"], tr["loadout_diff"] <= -e["big_gap"],
         tr["loadout_diff"].abs() <= e["even_gap"]],
        ["muito_superior", "muito_inferior", "equilibrado"], default="moderado")

    # histórico dentro do mapa
    tr = tr.sort_values(["match_id", "team_id", "round_num"]).reset_index(drop=True)
    grp = tr.groupby(["match_id", "team_id"])
    tr["prev_won"] = grp["won"].shift(1)
    tr["next_won"] = grp["won"].shift(-1)
    # sequência de derrotas imediatamente anterior ao round
    streaks = []
    for _, gg in grp:
        s = 0
        for w in gg["won"]:
            streaks.append(s)
            s = 0 if w else s + 1
    tr["loss_streak_before"] = streaks

    # force: após derrota, time compra (não-eco) sem dinheiro para kit completo na maioria dos jogadores
    poor = (rp.assign(poor=rp["available"] < e["force_player_available_max"])
              .groupby(["match_id", "round_num", "team_id"])["poor"].sum().rename("n_cant_afford_full"))
    tr = tr.merge(poor.reset_index(), on=["match_id", "round_num", "team_id"], how="left")
    after_loss = (tr["prev_won"] == False) & (~tr["is_pistol"])  # noqa: E712
    tr["is_force"] = (after_loss & (tr["buy_type"] != "eco")
                      & (tr["n_cant_afford_full"] >= e["force_min_players"]))
    # bonus: após vitória, time joga com arsenal carregado de valor médio gastando pouco
    tr["is_bonus"] = ((tr["prev_won"] == True) & (~tr["is_pistol"])  # noqa: E712
                      & (tr["buy_type"] == "half") & (tr["team_spent"] <= e["bonus_spent_max"]))
    return tr
