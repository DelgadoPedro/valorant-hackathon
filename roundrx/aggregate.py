"""Camada 3b: agrega as linhas time-round em tabelas prontas para análise/visualização.

Regra universal: valor = Σnum / Σden (taxas e médias). Para métricas de contagem: valor = Σnum.
Sempre publicamos numerador, denominador e nº de partidas — taxa sem amostra não vai para a interface.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .metrics.base import KEY, REGISTRY

DIMS = ["team_name", "opponent_name", "side", "map_name", "competition", "stage", "date"]

LEVELS = {
    "team_match": ["competition", "stage", "date", "match_id", "map_name", "team_name", "opponent_name"],
    "team": ["team_name"],
    "team_map_side": ["team_name", "map_name", "side"],
    "league": [],
    "league_map_side": ["map_name", "side"],
}


def enrich(rows: pd.DataFrame, team_rounds: pd.DataFrame) -> pd.DataFrame:
    dims = team_rounds[KEY + DIMS]
    out = rows.merge(dims, on=KEY, how="left")
    out["value"] = np.where(out["den"] > 0, out["num"] / out["den"], np.nan)
    return out


def _finish(g: pd.DataFrame) -> pd.DataFrame:
    agg = g["metric_id"].map(lambda m: REGISTRY[m].agg if m in REGISTRY else "ratio")
    g["value"] = np.where(agg == "count", g["num"], g["num"] / g["den"].replace(0, np.nan))
    g["agg"] = agg
    return g


def aggregate(enriched: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    keys = by + ["metric_id", "stratum"]
    g = enriched.groupby(keys, dropna=False).agg(
        num=("num", "sum"), den=("den", "sum"), n_rows=("num", "size"), n_matches=("match_id", "nunique"),
    ).reset_index()
    return _finish(g)


def trd05_reciprocity(team: pd.DataFrame) -> pd.DataFrame:
    """TRD-05 a partir de TRD-04 (contagens A → B por time)."""
    p = team[team["metric_id"] == "TRD-04"].copy()
    if p.empty:
        return pd.DataFrame()
    ab = p["stratum"].str.split(" → ", n=1, expand=True)
    p["a"], p["b"] = ab[0], ab[1]
    rows = []
    for tname, g in p.groupby("team_name"):
        cnt = {(a, b): n for a, b, n in zip(g["a"], g["b"], g["num"])}
        seen = set()
        for (a, b), n_ab in cnt.items():
            pair = tuple(sorted((a, b)))
            if pair in seen:
                continue
            seen.add(pair)
            n_ba = cnt.get((b, a), 0)
            hi, lo = max(n_ab, n_ba), min(n_ab, n_ba)
            rows.append({"team_name": tname, "metric_id": "TRD-05", "stratum": f"{pair[0]} ↔ {pair[1]}",
                         "num": lo, "den": hi, "n_rows": n_ab + n_ba, "n_matches": np.nan})
    x = pd.DataFrame(rows)
    tot = x.groupby("team_name").agg(num=("num", "sum"), den=("den", "sum"), n_rows=("n_rows", "sum")).reset_index()
    tot["metric_id"], tot["stratum"], tot["n_matches"] = "TRD-05", "", np.nan
    return _finish(pd.concat([x, tot], ignore_index=True))


def dyn08_consistency(team_match: pd.DataFrame, cfg) -> pd.DataFrame:
    a = cfg["aggregation"]
    tm = team_match[team_match["metric_id"].isin(a["consistency_metrics"]) & (team_match["stratum"] == "")]
    g = tm.groupby(["team_name", "metric_id"]).agg(sd=("value", lambda s: s.std(ddof=1)), n=("value", "size"),
                                                  mean=("value", "mean")).reset_index()
    g = g[g["n"] >= a["min_matches_consistency"]]
    out = pd.DataFrame({"team_name": g["team_name"], "metric_id": "DYN-08", "stratum": g["metric_id"],
                        "num": g["sd"], "den": 1.0, "n_rows": g["n"], "n_matches": g["n"]})
    return _finish(out)


def hal18_difference(team: pd.DataFrame) -> pd.DataFrame:
    """HAL-18: taxa de vitória nos 3 primeiros rounds do 2º half − do 1º half, por time (estrato '2º − 1º')."""
    x = team[team["metric_id"] == "HAL-18"].pivot_table(index="team_name", columns="stratum", values="value")
    if not {"1º half", "2º half"} <= set(x.columns):
        return pd.DataFrame()
    x = x.dropna(subset=["1º half", "2º half"])
    out = pd.DataFrame({"team_name": x.index, "metric_id": "HAL-18", "stratum": "2º − 1º",
                        "num": (x["2º half"] - x["1º half"]).to_numpy(), "den": 1.0, "n_rows": np.nan, "n_matches": np.nan})
    g = _finish(out)
    g["value"] = g["num"]
    return g


def build_all(rows: pd.DataFrame, team_rounds: pd.DataFrame, cfg) -> dict[str, pd.DataFrame]:
    enriched = enrich(rows, team_rounds)
    out = {"metrics_round": enriched}
    for name, by in LEVELS.items():
        out[f"metrics_{name}"] = aggregate(enriched, by)
    extra = [trd05_reciprocity(out["metrics_team"]), dyn08_consistency(out["metrics_team_match"], cfg),
             hal18_difference(out["metrics_team"])]
    extra = [e for e in extra if len(e)]
    if extra:
        out["metrics_team"] = pd.concat([out["metrics_team"]] + extra, ignore_index=True)
    return out
