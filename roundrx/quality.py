"""Testes de qualidade da base (rodam a cada execução e viram outputs/quality/quality_report.csv)."""
from __future__ import annotations

import pandas as pd


def _check(rows, check_id, desc, failing: pd.DataFrame | int, level="erro", total=None, example_cols=None):
    n = failing if isinstance(failing, int) else len(failing)
    ex = ""
    if not isinstance(failing, int) and n and example_cols:
        ex = "; ".join(str(tuple(x)) for x in failing[example_cols].head(3).itertuples(index=False))
    rows.append({"check_id": check_id, "descricao": desc, "nivel": level, "falhas": n,
                 "total": total, "status": "ok" if n == 0 else level, "exemplos": ex})


def run_quality(t: dict[str, pd.DataFrame], events: pd.DataFrame | None = None) -> pd.DataFrame:
    rows: list[dict] = []
    m, r, rp, k, p = t["matches"], t["rounds"], t["round_players"], t["kills"], t["players"]

    _check(rows, "Q01", "nome do arquivo segue o padrão <fase>_<n>_<data>_<timeA>_<a>_x_<b>_<timeB>_<mapa>",
           t["manifest"][~t["manifest"]["parse_ok"]], total=len(m), example_cols=["file"])
    _check(rows, "Q02", "placar do nome do arquivo casa com teams[].roundsWon",
           t["manifest"][t["manifest"]["issues"] != ""], total=len(m), example_cols=["file"])
    _check(rows, "Q03", "codinome de mapa corresponde a um único nome", m[m["map_name_conflict"]], total=len(m),
           example_cols=["file", "map_code"])
    obs = m[m["n_observers"] > 0]
    _check(rows, "Q04", "partidas com observador (excluído das métricas)", obs, level="aviso", total=len(m),
           example_cols=["file"])
    per_team = (p[~p["is_observer"]].groupby(["match_id", "team_id"]).size())
    _check(rows, "Q05", "5 jogadores (não observadores) por time", per_team[per_team != 5].reset_index(),
           total=len(per_team), example_cols=["match_id", "team_id"])
    n_rounds = r.groupby("match_id").size()
    score = m.set_index("match_id")[["red_score", "blue_score"]].sum(axis=1)
    bad = (n_rounds != score.reindex(n_rounds.index))
    _check(rows, "Q06", "nº de rounds = soma do placar", bad[bad].reset_index(), total=len(m),
           example_cols=["match_id"])
    # lados: troca no round 12; prorrogação alterna a cada round
    rr = r.sort_values(["match_id", "round_num"]).copy()
    first_atk = rr.groupby("match_id")["atk_team"].transform("first")
    other = first_atk.map({"Red": "Blue", "Blue": "Red"})
    rn = rr["round_num"]
    expected = first_atk.where(rn < 12, other)
    ot = rn >= 24
    expected = expected.where(~ot, first_atk.where(((rn - 24) % 2) == 0, other))
    bad_side = rr[rr["atk_team"] != expected]
    _check(rows, "Q07", "lado atacante segue o padrão (troca no 13º round; alterna na prorrogação)",
           bad_side, level="aviso", total=len(rr), example_cols=["match_id", "round_num"])
    _check(rows, "Q08", "plantRoundTime > 0 sempre que há bombPlanter",
           r[r["has_plant"] & ~(r["plant_time_ms"] > 0)], total=int(r["has_plant"].sum()),
           example_cols=["match_id", "round_num"])
    _check(rows, "Q09", "defuse só ocorre em round com plant", r[r["has_defuse"] & ~r["has_plant"]],
           total=int(r["has_defuse"].sum()), example_cols=["match_id", "round_num"])
    _check(rows, "Q10", "round com defuse foi vencido pelos defensores",
           r[r["has_defuse"] & (r["winning_role"] != "Defender")], total=int(r["has_defuse"].sum()),
           example_cols=["match_id", "round_num"])
    _check(rows, "Q11", "kills com timestamp negativo", k[k["t_ms"] < 0], total=len(k),
           example_cols=["match_id", "round_num", "kill_idx"])
    _check(rows, "Q12", "economia presente (loadoutValue não nulo)", rp[rp["loadout_value"].isna()],
           total=len(rp), example_cols=["match_id", "round_num", "puuid"])
    _check(rows, "Q13", "kills não-combate (spike/suicídio/aliado) — excluídas de trades e first blood",
           k[k["kill_type"] != "enemy"], level="info", total=len(k), example_cols=["match_id", "round_num", "kill_type"])
    _check(rows, "Q14", "kill com snapshot de posições vazio (afeta métricas espaciais)",
           k[k["snapshot_n"] == 0], level="aviso", total=len(k), example_cols=["match_id", "round_num", "kill_idx"])
    kc = k[k["kill_type"] == "enemy"].groupby(["match_id", "killer"]).size()
    ps = p[~p["is_observer"]].set_index(["match_id", "puuid"])["kills"]
    joined = pd.concat([kc.rename("calc"), ps.rename("official")], axis=1).fillna(0)
    diff = joined[(joined["calc"] - joined["official"]).abs() > 1]
    _check(rows, "Q15", "kills reconstruídas ≈ players[].stats.kills (tolerância 1)",
           diff.reset_index(), level="aviso", total=len(joined), example_cols=["match_id", "level_1"]
           if "level_1" in diff.reset_index().columns else None)
    if events is not None and len(events):
        rev = events[events["event"] == "revive"]
        _check(rows, "Q16", "revives inferidos (jogador volta a aparecer vivo)", rev, level="info",
               total=int((events["event"] == "kill").sum()), example_cols=["match_id", "round_num", "note"])
        neg = events[(events["red_alive"] < 0) | (events["blue_alive"] < 0)]
        _check(rows, "Q17", "contagem de vivos nunca negativa", neg, total=len(events),
               example_cols=["match_id", "round_num"])
        # round por eliminação: o perdedor termina com 0 vivos
        last = events[events["event"] == "kill"].groupby(["match_id", "round_num"]).last()
        el = r[r["result"] == "Eliminated"].set_index(["match_id", "round_num"])
        j = el.join(last[["red_alive", "blue_alive"]], how="left")
        loser_alive = j.apply(lambda x: x["blue_alive"] if x["winning_team"] == "Red" else x["red_alive"], axis=1)
        bad = j[loser_alive != 0].reset_index()
        _check(rows, "Q18", "rounds 'Eliminated': time perdedor termina com 0 vivos", bad, level="aviso",
               total=len(j), example_cols=["match_id", "round_num"])
    return pd.DataFrame(rows)


def team_rosters(t: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Identidade de time = nome no arquivo. Este relatório mostra o elenco de cada nome para revisão humana:
    jogadores, em quantas partidas cada um aparece e se é 'núcleo' (≥50% das partidas do time)."""
    p = t["players"][~t["players"]["is_observer"]].merge(t["matches"][["match_id", "competition", "stage"]], on="match_id")
    n_team = p.groupby("team_name")["match_id"].nunique().rename("partidas_time")
    g = (p.groupby(["team_name", "puuid"]).agg(riot_id=("riot_id", lambda s: s.value_counts().index[0]),
                                               partidas=("match_id", "nunique"),
                                               competicoes=("stage", lambda s: ", ".join(sorted(set(s)))))
         .reset_index().merge(n_team.reset_index(), on="team_name"))
    g["nucleo"] = g["partidas"] / g["partidas_time"] >= 0.5
    other = p.groupby("puuid")["team_name"].agg(lambda s: ", ".join(sorted(set(s))))
    g["tambem_jogou_por"] = [", ".join(x for x in other[pu].split(", ") if x != tn) for pu, tn in zip(g["puuid"], g["team_name"])]
    return g.sort_values(["team_name", "partidas"], ascending=[True, False])
