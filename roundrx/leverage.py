"""Pressão e Leverage Index: probabilidade de vencer o mapa antes de cada round e quanto o resultado do round pode mudá-la.

Modelo do mapa (g): cadeia de Markov sobre o placar. Cada round é vencido pelo time com a probabilidade de um time
"médio" naquele lado e mapa (taxa de vitória do ataque na liga, por mapa, encolhida para a taxa global). Regras do
VALORANT: 13 vence; em 12–12 a prorrogação alterna os lados e exige 2 de vantagem, o que dá
P(empate) = pA·pD / (pA·pD + (1−pA)(1−pD)). Só usa informação disponível antes do round (placar, lado, rodada).

Por time-round:
  W+ = g(placar se vencer o round)      (LEV-01)
  W− = g(placar se perder o round)      (LEV-02)
  L  = max(0, W+ − W−)                  (LEV-03, swing potencial, prospectivo)
  LI = L / média de L na base           (LEV-04; referência fixa gravada no relatório)
  p_pre = P(vencer o round) com lado, mapa, pistol e economia do round, fora da amostra (validação por série)
  W_pre = p_pre·W+ + (1 − p_pre)·W−;  W_pós = W+ ou W− conforme o resultado;  WPA = W_pós − W_pre (LEV-10)

Validação (relatório `leverage_report`): log-loss, Brier e erro de calibração de W_pre contra o resultado do mapa,
com a taxa do ataque e p_pre estimadas sem a série avaliada, comparados com 0,5 constante e com o modelo só de placar.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd

KEY = ["match_id", "round_num", "team_id"]
SHRINK_M = 50  # rounds "virtuais" da taxa global ao estimar a taxa do ataque por mapa


def p_tie(pa: float, pd_: float) -> float:
    """Prorrogação a partir de 12–12 (lados alternam a cada round, vence quem abrir 2)."""
    w, l = pa * pd_, (1 - pa) * (1 - pd_)
    return w / (w + l) if (w + l) > 0 else 0.5


@lru_cache(maxsize=None)
def g_reg(a: int, b: int, k: int, first_atk: bool, pa: float) -> float:
    """P(vencer o mapa) no início do round k (0-based, regulamento) com placar a×b; pa = P(vencer o round no ataque)."""
    pd_ = 1 - pa
    if a >= 13:
        return 1.0
    if b >= 13:
        return 0.0
    if a == 12 and b == 12:
        return p_tie(pa, pd_)
    atk = (k < 12) == first_atk
    p = pa if atk else pd_
    return p * g_reg(a + 1, b, k + 1, first_atk, pa) + (1 - p) * g_reg(a, b + 1, k + 1, first_atk, pa)


def g_state(a: int, b: int, k: int, first_atk: bool, next_atk: bool, pa: float) -> float:
    """P(vencer o mapa) no estado (a, b) antes do round k; next_atk = lado do time no round k (usado na prorrogação)."""
    if k < 24 and not (a >= 12 and b >= 12):
        return g_reg(a, b, k, first_atk, pa)
    d = a - b
    pt = p_tie(pa, 1 - pa)
    if d >= 2:
        return 1.0
    if d <= -2:
        return 0.0
    if d == 0:
        return pt
    p = pa if next_atk else 1 - pa
    return p + (1 - p) * pt if d == 1 else p * pt


def atk_rates(rounds: pd.DataFrame, m: float = SHRINK_M) -> dict[str, float]:
    """Taxa de vitória do ataque por mapa, encolhida para a global."""
    w = (rounds["winning_role"] == "Attacker").astype(float)
    glob = float(w.mean()) if len(w) else 0.5
    g = pd.DataFrame({"map": rounds["map_name"], "w": w}).groupby("map")["w"].agg(["sum", "size"])
    return {mp: float((r["sum"] + m * glob) / (r["size"] + m)) for mp, r in g.iterrows()} | {"_global": glob}


def _features(d: pd.DataFrame, maps: list[str]) -> np.ndarray:
    lr = np.log((d["team_loadout"].fillna(0) + 1000) / (d["opp_loadout"].fillna(0) + 1000)).clip(-3, 3)
    cols = [(d["side"] == "atk").astype(float), d["is_pistol"].astype(float), lr, lr * (d["side"] == "atk")]
    cols += [(d["map_name"] == m).astype(float) for m in maps]
    return np.column_stack(cols)


def _series_key(tr: pd.DataFrame) -> pd.Series:
    pair = [" × ".join(sorted((a, b))) for a, b in zip(tr["team_name"].astype(str), tr["opponent_name"].astype(str))]
    return tr["competition"].astype(str) + "|" + tr["date"].astype(str) + "|" + pd.Series(pair, index=tr.index)


def _ece(p, y, bins=10) -> float:
    p, y = np.asarray(p, float), np.asarray(y, float)
    idx = np.minimum((p * bins).astype(int), bins - 1)
    return float(sum(abs(p[idx == b].mean() - y[idx == b].mean()) * (idx == b).mean() for b in range(bins) if (idx == b).any()))


def _metrics(p, y) -> dict:
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
    y = np.asarray(y, float)
    return {"log_loss": float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))), "brier": float(np.mean((p - y) ** 2)), "ece": _ece(p, y)}


def _pressure_stability(tr: pd.DataFrame, min_maps: int = 6) -> tuple[float, int]:
    """Estabilidade (Spearman-Brown entre metades alternadas das partidas de cada time) da diferença
    'vitória acima do esperado nos rounds Q4 de pressão − nos demais'. Perto de 0 = muda ao acaso entre partidas."""
    d = tr[["match_id", "team_name", "date", "won", "p_pre", "li_q"]].copy()
    order = d.drop_duplicates(["match_id", "team_name"]).sort_values(["date", "match_id"])
    order["half"] = order.groupby("team_name").cumcount() % 2
    n_maps = order.groupby("team_name").size()
    d = d.merge(order[["match_id", "team_name", "half"]], on=["match_id", "team_name"])
    d = d[d["team_name"].isin(n_maps[n_maps >= min_maps].index)]
    d["x"] = d["won"].astype(float) - d["p_pre"]
    d["hi"] = d["li_q"].str.startswith("Q4")
    g = d.groupby(["team_name", "half", "hi"])["x"].mean().unstack("hi")
    if g.shape[1] < 2:
        return float("nan"), 0
    diff = (g[True] - g[False]).unstack("half").dropna()
    if len(diff) < 5:
        return float("nan"), int(len(diff))
    r = float(diff[0].corr(diff[1]))
    return float(2 * r / (1 + r)) if r > -1 else float("nan"), int(len(diff))


def build(ctx, folds: int | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import GroupKFold

    cfg = getattr(ctx, "cfg", None)
    lcfg = (getattr(cfg, "raw", cfg) or {}).get("leverage", {})
    folds = folds or int(lcfg.get("folds", 5))
    shrink = float(lcfg.get("shrink_m", SHRINK_M))
    tr = ctx.tr.sort_values(["match_id", "team_id", "round_num"]).copy()
    rounds = ctx.t["rounds"]
    g = tr.groupby(["match_id", "team_id"])
    tr["a"] = g["won"].transform(lambda s: s.astype(int).cumsum().shift(fill_value=0))
    tr["b"] = g["won"].transform(lambda s: (~s.astype(bool)).astype(int).cumsum().shift(fill_value=0))
    first = tr[tr["round_num"] == 0].set_index(["match_id", "team_id"])["side"].eq("atk")
    tr["first_atk"] = [bool(first.get((m, t), True)) for m, t in zip(tr["match_id"], tr["team_id"])]
    tr["series_key"] = _series_key(tr)
    final = tr.groupby(["match_id", "team_id"])["won"].sum()
    opp = tr.groupby(["match_id", "team_id"])["won"].apply(lambda s: (~s.astype(bool)).sum())
    tr["map_won"] = [int(final[(m, t)] > opp[(m, t)]) for m, t in zip(tr["match_id"], tr["team_id"])]

    def wpm(df: pd.DataFrame, rates: dict) -> tuple[np.ndarray, np.ndarray]:
        wp, wm = [], []
        for a, b, k, fa, side, mp in zip(df["a"], df["b"], df["round_num"], df["first_atk"], df["side"], df["map_name"]):
            pa = rates.get(mp, rates["_global"])
            nxt = side != "atk"  # lado do time no round seguinte (prorrogação alterna a cada round)
            wp.append(g_state(int(a) + 1, int(b), int(k) + 1, bool(fa), nxt, pa))
            wm.append(g_state(int(a), int(b) + 1, int(k) + 1, bool(fa), nxt, pa))
        return np.array(wp), np.array(wm)

    maps = sorted(tr["map_name"].astype(str).unique())
    X, y = _features(tr, maps), tr["won"].astype(float).to_numpy()
    groups = tr["series_key"].to_numpy()
    # p_pre fora da amostra + W± de validação com a taxa do ataque estimada sem a série
    p_pre = np.full(len(tr), np.nan)
    wp_cv, wm_cv = np.full(len(tr), np.nan), np.full(len(tr), np.nan)
    match_series = tr.drop_duplicates("match_id").set_index("match_id")["series_key"]
    rates = atk_rates(rounds, shrink)
    n_split = min(folds, len(set(groups)))
    if n_split >= 2 and len(set(y)) == 2:
        for trn, tst in GroupKFold(n_splits=n_split).split(X, y, groups):
            if len(set(y[trn])) < 2:
                continue
            clf = LogisticRegression(C=1.0, max_iter=2000).fit(X[trn], y[trn])
            p_pre[tst] = clf.predict_proba(X[tst])[:, 1]
            rr = rounds[rounds["match_id"].map(match_series).isin(set(groups[trn]))]
            wp_cv[tst], wm_cv[tst] = wpm(tr.iloc[tst], atk_rates(rr, shrink))
    side_p = np.array([rates.get(m, rates["_global"]) if s == "atk" else 1 - rates.get(m, rates["_global"])
                       for m, s in zip(tr["map_name"], tr["side"])])
    # sem séries suficientes (ex.: partida sintética): cai para a taxa do lado no mapa
    miss = np.isnan(p_pre)
    p_pre[miss] = side_p[miss]
    tr["W_plus"], tr["W_minus"] = wpm(tr, rates)
    tr["L"] = np.maximum(0.0, tr["W_plus"] - tr["W_minus"])
    l_ref = float(tr["L"].mean())
    tr["LI"] = tr["L"] / l_ref
    tr["p_pre"] = p_pre
    tr["W_pre"] = tr["p_pre"] * tr["W_plus"] + (1 - tr["p_pre"]) * tr["W_minus"]
    tr["W_post"] = np.where(tr["won"], tr["W_plus"], tr["W_minus"])
    tr["WPA"] = tr["W_post"] - tr["W_pre"]
    k = tr["round_num"]
    tr["phase"] = np.where(k >= 24, "prorrogação", np.where(k % 12 < 3, "abertura do half", np.where(k % 12 < 9, "meio do half", "fim do half")))
    q = np.quantile(tr["LI"], [0.25, 0.5, 0.75])
    tr["li_q"] = np.select([tr["LI"] <= q[0], tr["LI"] <= q[1], tr["LI"] <= q[2]], ["Q1 (menor pressão)", "Q2", "Q3"], "Q4 (maior pressão)")

    # relatório de validação
    yb = tr["map_won"].to_numpy()
    ok = ~np.isnan(wp_cv)
    if not ok.any():
        wp_cv, wm_cv, ok = tr["W_plus"].to_numpy(), tr["W_minus"].to_numpy(), np.ones(len(tr), bool)
    w_pre_cv = p_pre * wp_cv + (1 - p_pre) * wm_cv
    w_score_cv = side_p * wp_cv + (1 - side_p) * wm_cv
    rep = []
    for name, p, desc in (("W_pre (placar + economia do round)", w_pre_cv, "modelo usado"),
                          ("W só de placar", w_score_cv, "sem a economia do round"),
                          ("constante 0,5", np.full(len(tr), 0.5), "referência")):
        rep.append({"alvo": "vencer o mapa", "modelo": name, **_metrics(p[ok], yb[ok]), "n": int(ok.sum()), "nota": desc})
    for name, p in (("p_pre (lado, mapa, pistol, economia)", p_pre), ("só lado e mapa", side_p), ("constante 0,5", np.full(len(tr), 0.5))):
        rep.append({"alvo": "vencer o round", "modelo": name, **_metrics(p, y), "n": len(tr), "nota": ""})
    rep = pd.DataFrame(rep)
    est, n_est = _pressure_stability(tr)
    rep["estab_pressao"] = est
    rep["estab_pressao_times"] = n_est
    rep["series"] = tr["series_key"].nunique()
    rep["l_ref"] = l_ref
    rep["li_quartis"] = ", ".join(f"{v:.3f}" for v in q)
    rep["taxa_ataque_global"] = rates["_global"]
    cols = KEY + ["team_name", "map_name", "side", "a", "b", "first_atk", "won", "map_won", "W_plus", "W_minus", "L", "LI",
                  "p_pre", "W_pre", "W_post", "WPA", "phase", "li_q", "series_key"]
    return tr[cols].reset_index(drop=True), rep
