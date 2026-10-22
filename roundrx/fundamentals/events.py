"""Camada de eventos com contexto (fundamentos).

`death_events`: uma linha por morte por inimigo EM JOGO (exclui team kill, autoeliminação, spike e kills depois do
fim do round). Cada linha traz o contexto observável NO INSTANTE da morte (antes do desfecho) e os desfechos de trade.

Contexto (só informação disponível até o instante da morte):
- estado de vivos imediatamente antes da morte (linha do tempo com revives de `round_events`);
- fase: 1ª morte do round, pré-plant ou pós-plant; spike plantada;
- first blood do round (quando a morte não é o próprio first blood);
- lado, mapa, economia do início do round (Σ loadout do time e do adversário);
- posições do snapshot da kill: aliado vivo mais próximo da vítima (quem e a que distância), aliados no raio,
  distância do killer ao aliado mais próximo dele. Snapshot vazio = posição desconhecida (nunca "longe").

Desfecho: `revenge_s` = segundos até um aliado da vítima matar o killer (no mesmo round, sem limite);
`traded_{w}s` = revenge_s ≤ w para cada janela de `fundamentals.trade_windows_s`.

Elegibilidade para trade (`eligible`): a vítima tinha pelo menos 1 aliado vivo. A morte do último vivo não pode ser
trocada e fica fora das taxas de trade do diagnóstico (TRD-01, por definição do dicionário, inclui todas).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

ALLY_DIST_EDGES = [500, 1000, 2000, 3000]  # cm -> ≤5 m, 5–10 m, 10–20 m, 20–30 m, >30 m
ALLY_DIST_LBL = ["≤ 5 m", "5–10 m", "10–20 m", "20–30 m", "> 30 m"]


def _dist_bucket(d: pd.Series, has_snapshot: pd.Series, allies_alive: pd.Series) -> np.ndarray:
    idx = np.digitize(d.fillna(-1).to_numpy(), ALLY_DIST_EDGES, right=True)
    lbl = np.array(ALLY_DIST_LBL, dtype=object)[np.minimum(idx, len(ALLY_DIST_LBL) - 1)]
    out = np.where(allies_alive.to_numpy() <= 0, "sem aliado vivo",
                   np.where(~has_snapshot.to_numpy() | d.isna().to_numpy(), "sem posição", lbl))
    return out


def _revenge(enemy: pd.DataFrame) -> pd.DataFrame:
    """Para cada morte: 1ª kill posterior, no mesmo round, em que um aliado da vítima mata o killer."""
    a = enemy[["match_id", "round_num", "kill_idx", "t_ms", "victim", "victim_team", "killer"]]
    b = enemy[["match_id", "round_num", "kill_idx", "t_ms", "victim", "killer", "killer_team"]].rename(
        columns={"kill_idx": "r_idx", "t_ms": "r_t", "victim": "r_victim", "killer": "trader", "killer_team": "r_team"})
    j = a.merge(b, left_on=["match_id", "round_num", "killer", "victim_team"],
                right_on=["match_id", "round_num", "r_victim", "r_team"])
    j = j[(j["r_idx"] > j["kill_idx"]) & (j["trader"] != j["victim"])]
    j = j.sort_values("r_t").drop_duplicates(["match_id", "round_num", "kill_idx"])
    j["revenge_s"] = (j["r_t"] - j["t_ms"]) / 1000
    return j[["match_id", "round_num", "kill_idx", "revenge_s", "trader", "r_idx"]]


def _alive_before(ctx, enemy: pd.DataFrame) -> pd.DataFrame:
    ev = ctx.ev[ctx.ev["event"] == "kill"][["match_id", "round_num", "kill_idx", "red_alive", "blue_alive"]]
    j = enemy[["match_id", "round_num", "kill_idx", "victim_team"]].merge(ev, on=["match_id", "round_num", "kill_idx"], how="left")
    own_after = np.where(j["victim_team"] == "Red", j["red_alive"], j["blue_alive"])
    opp = np.where(j["victim_team"] == "Red", j["blue_alive"], j["red_alive"])
    j["alive_before"] = own_after + 1
    j["opp_alive"] = opp
    return j[["match_id", "round_num", "kill_idx", "alive_before", "opp_alive"]]


def _spatial(ctx, enemy: pd.DataFrame) -> pd.DataFrame:
    """Aliado vivo mais próximo da vítima (snapshot da kill), aliados no raio e killer → aliado mais próximo."""
    R = ctx.cfg["spatial"]["near_radius"]
    kp = ctx.t["kill_positions"][["match_id", "round_num", "kill_idx", "puuid", "team_id", "x", "y"]]
    k = enemy[enemy["snapshot_n"] > 0][["match_id", "round_num", "kill_idx", "victim", "victim_team", "victim_x", "victim_y", "killer"]]
    al = k.merge(kp, left_on=["match_id", "round_num", "kill_idx", "victim_team"], right_on=["match_id", "round_num", "kill_idx", "team_id"])
    al = al[al["puuid"] != al["victim"]].copy()
    al["d"] = np.hypot(al["x"] - al["victim_x"], al["y"] - al["victim_y"])
    kxy = kp.merge(k[["match_id", "round_num", "kill_idx", "killer"]], left_on=["match_id", "round_num", "kill_idx", "puuid"],
                   right_on=["match_id", "round_num", "kill_idx", "killer"])[["match_id", "round_num", "kill_idx", "x", "y"]]
    al = al.merge(kxy.rename(columns={"x": "kx", "y": "ky"}), on=["match_id", "round_num", "kill_idx"], how="left")
    al["dk"] = np.hypot(al["x"] - al["kx"], al["y"] - al["ky"])
    al = al.sort_values("d")
    g = al.groupby(["match_id", "round_num", "kill_idx"], sort=False)
    out = pd.DataFrame({
        "nearest_ally_cm": g["d"].first(),
        "nearest_ally": g["puuid"].first(),
        "allies_in_snapshot": g.size(),
        "allies_near": g["d"].apply(lambda s: int((s <= R).sum())),
        "killer_to_ally_cm": g["dk"].min(),
    }).reset_index()
    has = k[["match_id", "round_num", "kill_idx"]].assign(has_snapshot=True)
    return has.merge(out, on=["match_id", "round_num", "kill_idx"], how="left")


def build_death_events(ctx) -> pd.DataFrame:
    cfg = ctx.cfg
    windows = cfg["fundamentals"]["trade_windows_s"]
    lo, hi = cfg["composition"]["loadout_ratio_bands"]
    enemy = ctx.enemy_kills.copy()  # in_play, kill_type == enemy, com enemy_rank e post_plant
    enemy["t_s"] = enemy["t_ms"] / 1000

    d = enemy[["match_id", "round_num", "kill_idx", "t_s", "t_ms", "victim", "victim_team", "killer", "killer_team",
               "enemy_rank", "post_plant", "plant_time_ms", "snapshot_n", "victim_x", "victim_y"]].copy()
    d = d.merge(_alive_before(ctx, enemy), on=["match_id", "round_num", "kill_idx"], how="left")
    d = d.merge(_spatial(ctx, enemy), on=["match_id", "round_num", "kill_idx"], how="left")
    d["has_snapshot"] = d["has_snapshot"].fillna(False).astype(bool)
    d = d.merge(_revenge(enemy), on=["match_id", "round_num", "kill_idx"], how="left")

    # contexto do time da vítima no round
    tr = ctx.tr[["match_id", "round_num", "team_id", "side", "map_name", "team_name", "opponent_name", "competition",
                 "stage", "date", "team_loadout", "opp_loadout", "is_pistol", "won"]].rename(columns={"team_id": "victim_team"})
    d = d.merge(tr, on=["match_id", "round_num", "victim_team"], how="left")
    m = ctx.t["matches"][["match_id", "series", "game_start_ms"]]
    d = d.merge(m, on="match_id", how="left")
    # série = mesmo confronto no mesmo dia (os mapas de uma MD3 compartilham elenco, adversário e preparação);
    # é a unidade de agrupamento da validação, para nenhum mapa de uma série vazar para o ajuste de outro
    pair = [" × ".join(sorted((a, b))) for a, b in zip(d["team_name"].astype(str), d["opponent_name"].astype(str))]
    d["series_key"] = d["competition"].astype(str) + "|" + d["date"].astype(str) + "|" + pd.Series(pair, index=d.index)

    # first blood do round, do ponto de vista da vítima
    fb = ctx.first_kill[["match_id", "round_num", "killer_team"]].rename(columns={"killer_team": "fb_team"})
    d = d.merge(fb, on=["match_id", "round_num"], how="left")
    d["fb_context"] = np.where(d["enemy_rank"] == 0, "é o first blood",
                               np.where(d["fb_team"] == d["victim_team"], "time fez o FB", "time sofreu o FB"))

    # buckets de contexto
    d["allies_alive"] = d["alive_before"] - 1
    d["eligible"] = d["allies_alive"] >= 1
    d["phase"] = np.where(d["enemy_rank"] == 0, "1ª morte do round", np.where(d["post_plant"], "pós-plant", "pré-plant"))
    d["spike"] = np.where(d["post_plant"], "plantada", "não plantada")
    d["state"] = d["alive_before"].astype("Int64").astype(str) + "v" + d["opp_alive"].astype("Int64").astype(str)
    diff = d["alive_before"] - d["opp_alive"]
    d["numbers"] = np.where(diff > 0, "em vantagem", np.where(diff < 0, "em desvantagem", "igualdade"))
    d["ally_dist"] = _dist_bucket(d["nearest_ally_cm"], d["has_snapshot"], d["allies_alive"])
    an = d["allies_near"]
    d["allies_near_b"] = np.where(~d["has_snapshot"] | an.isna(), "sem posição", np.where(an >= 2, "2+", an.fillna(0).astype(int).astype(str)))
    ratio = d["team_loadout"] / d["opp_loadout"].replace(0, np.nan)
    d["economy"] = np.where(d["is_pistol"], "pistol", np.where(ratio < lo, "equipamento inferior",
                            np.where(ratio > hi, "equipamento superior", "equipamento equilibrado")))
    for w in windows:
        d[f"traded_{int(w)}s"] = (d["revenge_s"] <= w).fillna(False).astype(bool)
    d["team_name"] = d["team_name"].astype(str)
    short = {k: str(v).split("#")[0] for k, v in ctx.riot_id.items()}
    for col in ("victim", "killer", "nearest_ally", "trader"):
        d[f"{col}_name"] = d[col].map(short)
    cols = ["match_id", "round_num", "kill_idx", "t_s", "victim", "victim_team", "killer", "killer_team", "team_name",
            "opponent_name", "competition", "stage", "series", "series_key", "date", "game_start_ms", "map_name", "side",
            "alive_before", "opp_alive", "allies_alive", "state", "numbers", "phase", "spike", "fb_context", "economy",
            "team_loadout", "opp_loadout", "has_snapshot", "nearest_ally", "nearest_ally_cm", "allies_near", "allies_near_b",
            "ally_dist", "killer_to_ally_cm", "victim_x", "victim_y", "eligible", "revenge_s", "trader", "won",
            "victim_name", "killer_name", "nearest_ally_name", "trader_name"] + \
           [f"traded_{int(w)}s" for w in windows]
    return d[cols].sort_values(["match_id", "round_num", "kill_idx"]).reset_index(drop=True)


# ============================================================================ preservação de vantagem
STATE_ORDER = ["5v4", "5v3", "5v2", "5v1", "4v3", "4v2", "4v1", "3v2", "3v1", "2v1"]


def _tbucket(t: float) -> str:
    """Quando a vantagem começa (segundos de jogo no round, como o JSON registra; quartis da base ≈ 11, 21, 42 s)."""
    return "até 15 s" if t <= 15 else ("15–35 s" if t <= 35 else "depois de 35 s")


def build_advantage_episodes(ctx) -> pd.DataFrame:
    """Uma linha por time-round em que o time passa a ter MAIS jogadores vivos que o adversário (1ª vez no round).

    Contexto no instante em que a vantagem começa (só informação até ali): estado (5v4, 4v3…), lado, mapa,
    spike plantada ou não, quando no round (segundos de jogo, como o JSON registra), se a vantagem veio do
    first blood do round, economia do round.
    Desfechos: `won` (venceu o round = converteu), `lost_adv` (voltou a igualdade ou desvantagem depois),
    `held_s` (até perder a vantagem; se não perdeu, até o último evento: censurado), `collapse` (perdeu 2 jogadores
    com intervalo ≤ collapse_window depois do início), `unanswered` (maior sequência de mortes do time sem resposta).
    Uma linha por time-round evita contar o mesmo round várias vezes; vantagens posteriores no mesmo round aparecem
    no `max_diff`.
    """
    cw = ctx.cfg["timing"]["collapse_window_s"] * 1000
    lo, hi = ctx.cfg["composition"]["loadout_ratio_bands"]
    ev = ctx.ev[ctx.ev["event"].isin(["kill", "revive"])][["match_id", "round_num", "seq", "kill_idx", "t_ms", "event",
                                                           "target_team", "red_alive", "blue_alive"]]
    rows = []
    for (mid, rn), g in ev.sort_values(["match_id", "round_num", "seq"]).groupby(["match_id", "round_num"], sort=False):
        t = g["t_ms"].to_numpy(dtype=float)
        evt = g["event"].to_numpy()
        tgt = g["target_team"].to_numpy()
        kidx = g["kill_idx"].to_numpy()
        kills_pos = np.flatnonzero(evt == "kill")
        first_kill = kills_pos[0] if len(kills_pos) else -1
        for team, own_col, opp_col in (("Red", "red_alive", "blue_alive"), ("Blue", "blue_alive", "red_alive")):
            own, opp = g[own_col].to_numpy(), g[opp_col].to_numpy()
            diff = own - opp
            pos = np.flatnonzero(diff > 0)
            if not len(pos):
                continue
            i = pos[0]
            after = slice(i + 1, None)
            lost_at = np.flatnonzero(diff[after] <= 0)
            lost = bool(len(lost_at))
            t_end = t[i + 1 + lost_at[0]] if lost else t[-1]
            own_deaths = t[after][(evt[after] == "kill") & (tgt[after] == team)]
            collapse = bool(len(own_deaths) >= 2 and (np.diff(own_deaths) <= cw).any())
            run, best = 0, 0
            for e, tt in zip(evt[after], tgt[after]):
                if e != "kill":
                    continue
                run = run + 1 if tt == team else 0
                best = max(best, run)
            rows.append({"match_id": mid, "round_num": rn, "team_id": team, "t0_s": t[i] / 1000,
                         "start_kill_idx": None if pd.isna(kidx[i]) else int(kidx[i]), "alive": int(own[i]), "opp_alive": int(opp[i]),
                         "from_fb": i == first_kill, "lost_adv": lost, "held_s": (t_end - t[i]) / 1000, "censored": not lost,
                         "collapse": collapse, "unanswered": best, "max_diff": int(diff[i:].max())})
    a = pd.DataFrame(rows)
    tr = ctx.tr[["match_id", "round_num", "team_id", "side", "map_name", "team_name", "opponent_name", "competition", "date",
                 "team_loadout", "opp_loadout", "is_pistol", "won", "plant_time_ms"]]
    a = a.merge(tr, on=["match_id", "round_num", "team_id"], how="left")
    m = ctx.t["matches"][["match_id", "game_start_ms"]]
    a = a.merge(m, on="match_id", how="left")
    pair = [" × ".join(sorted((x, y))) for x, y in zip(a["team_name"].astype(str), a["opponent_name"].astype(str))]
    a["series_key"] = a["competition"].astype(str) + "|" + a["date"].astype(str) + "|" + pd.Series(pair, index=a.index)
    a["state"] = a["alive"].astype(str) + "v" + a["opp_alive"].astype(str)
    d = a["alive"] - a["opp_alive"]
    a["margin"] = np.where(d >= 2, "2 ou mais", "1 jogador")
    a["spike"] = np.where(a["plant_time_ms"].notna() & (a["plant_time_ms"] < a["t0_s"] * 1000), "plantada", "não plantada")
    a["when"] = [_tbucket(x) for x in a["t0_s"]]
    a["origin"] = np.where(a["from_fb"], "first blood do time", "depois da abertura")
    ratio = a["team_loadout"] / a["opp_loadout"].replace(0, np.nan)
    a["economy"] = np.where(a["is_pistol"], "pistol", np.where(ratio < lo, "equipamento inferior",
                            np.where(ratio > hi, "equipamento superior", "equipamento equilibrado")))
    a["won"] = a["won"].astype(bool)
    # 1v0 = adversário já sem ninguém vivo: o round está praticamente decidido; fica fora da análise de preservação
    a["eligible"] = a["opp_alive"] >= 1
    a["team_name"] = a["team_name"].astype(str)
    return a.sort_values(["match_id", "round_num", "team_id"]).reset_index(drop=True)


# ============================================================================ first blood
def build_fb_events(ctx) -> pd.DataFrame:
    """Duas linhas por round com first blood (uma por time): o 1º abate em adversário, em jogo, do round.

    Contexto (só o que existe até o first blood): lado, mapa, economia do round, quando o FB saiu (segundos de jogo),
    quem do time disputou o duelo (quem matou, se o time fez o FB; quem morreu, se sofreu) e a função do agente dele.
    Desfechos: `got_fb` (o time venceu o duelo de abertura) e `won` (venceu o round).
    Elegibilidade: `eligible` = todas as linhas (abertura); `eligible_rec` = o time sofreu o FB (recuperação).
    A conversão depois de FAZER o FB é a vantagem 5v4 de `advantage_episodes` e não é recalculada aqui.
    """
    from ..metrics.agents import player_agents
    lo, hi = ctx.cfg["composition"]["loadout_ratio_bands"]
    w = int(ctx.cfg["fundamentals"]["default_window_s"])
    fk = ctx.first_kill[["match_id", "round_num", "kill_idx", "t_ms", "killer", "victim", "killer_team", "victim_team"]].copy()
    rev = _revenge(ctx.enemy_kills)
    fk = fk.merge(rev[["match_id", "round_num", "kill_idx", "revenge_s"]], on=["match_id", "round_num", "kill_idx"], how="left")
    tr = ctx.tr[["match_id", "round_num", "team_id", "side", "map_name", "team_name", "opponent_name", "competition", "date",
                 "team_loadout", "opp_loadout", "is_pistol", "won"]]
    d = tr.merge(fk, on=["match_id", "round_num"], how="inner")
    d = d.merge(ctx.t["matches"][["match_id", "game_start_ms"]], on="match_id", how="left")
    pair = [" × ".join(sorted((x, y))) for x, y in zip(d["team_name"].astype(str), d["opponent_name"].astype(str))]
    d["series_key"] = d["competition"].astype(str) + "|" + d["date"].astype(str) + "|" + pd.Series(pair, index=d.index)
    d["got_fb"] = (d["killer_team"] == d["team_id"]).astype(bool)
    d["won"] = d["won"].astype(bool)
    d["t_s"] = d["t_ms"] / 1000
    d["when"] = [_tbucket(x) for x in d["t_s"]]
    ratio = d["team_loadout"] / d["opp_loadout"].replace(0, np.nan)
    d["economy"] = np.where(d["is_pistol"], "pistol", np.where(ratio < lo, "equipamento inferior",
                            np.where(ratio > hi, "equipamento superior", "equipamento equilibrado")))
    # quem do time esteve no duelo de abertura, e quem do adversário
    d["duel_player"] = np.where(d["got_fb"], d["killer"], d["victim"])
    d["opp_player"] = np.where(d["got_fb"], d["victim"], d["killer"])
    pa = player_agents(ctx)[["match_id", "puuid", "agent", "role"]].drop_duplicates(["match_id", "puuid"])
    d = d.merge(pa.rename(columns={"puuid": "duel_player", "agent": "duel_agent", "role": "duel_role"}), on=["match_id", "duel_player"], how="left")
    d = d.merge(pa.rename(columns={"puuid": "opp_player", "agent": "opp_agent", "role": "opp_role"}), on=["match_id", "opp_player"], how="left")
    d["duel_role"] = d["duel_role"].fillna("?")
    short = {k: str(v).split("#")[0] for k, v in ctx.riot_id.items()}
    d["duel_name"] = d["duel_player"].map(short)
    d["opp_name"] = d["opp_player"].map(short)
    d["fb_traded"] = (d["revenge_s"] <= w).fillna(False).astype(bool)  # só descritivo (acontece depois do FB)
    d["eligible"] = True
    d["eligible_rec"] = ~d["got_fb"]
    d["team_name"] = d["team_name"].astype(str)
    cols = ["match_id", "round_num", "team_id", "team_name", "opponent_name", "competition", "date", "series_key", "game_start_ms",
            "map_name", "side", "economy", "team_loadout", "opp_loadout", "is_pistol", "kill_idx", "t_s", "when",
            "duel_player", "duel_name", "duel_agent", "duel_role", "opp_player", "opp_name", "opp_agent", "opp_role",
            "revenge_s", "fb_traded", "got_fb", "won", "eligible", "eligible_rec"]
    return d[cols].sort_values(["match_id", "round_num", "team_id"]).reset_index(drop=True)
