"""Baselines contextuais: probabilidade esperada do desfecho de cada evento em situações comparáveis.

Regras:
- a referência de um time é sempre o conjunto dos OUTROS times (leave-one-team-out): o time avaliado nunca entra
  no ajuste do próprio esperado;
- só variáveis conhecidas no instante do evento (contexto de `death_events`), nunca o resultado do round;
- escada de modelos, do mais simples ao mais complexo, comparada fora da amostra com validação separada por série:
    M0  taxa global da referência
    M1  células de contexto com encolhimento hierárquico: p_k = (acertos_k + m · p_{k-1}) / (n_k + m)
    M2  regressão logística L2 com as mesmas variáveis (one-hot)
  o modelo mais simples é mantido, a menos que o seguinte ganhe em log-loss E seja bem calibrado (ECE ≤ 2 pp).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import OneHotEncoder

# ordem da hierarquia do M1 (do contexto que mais explica para o que menos explica)
TRADE_FEATURES = ["ally_dist", "allies_near_b", "phase", "numbers", "side", "economy", "killer_ally_b", "map_name"]
MODELS = ["M0_global", "M1_cells", "M2_logistic"]


def _killer_ally_bucket(d: pd.DataFrame) -> np.ndarray:
    v = d["killer_to_ally_cm"]
    return np.where(v.isna(), "sem posição", np.where(v <= 1000, "≤ 10 m", np.where(v <= 2000, "10–20 m", "> 20 m")))


class CellModel:
    """M1: médias por prefixo da hierarquia de contexto, encolhidas para o nível anterior."""

    def __init__(self, features, m):
        self.features, self.m = features, m

    def fit(self, X: pd.DataFrame, y: np.ndarray):
        self.p0 = float(y.mean())
        self.tables = []
        df = X[self.features].astype(str).copy()
        df["_y"] = y
        for k in range(1, len(self.features) + 1):
            g = df.groupby(self.features[:k], sort=False)["_y"].agg(["sum", "size"])
            self.tables.append(g)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        df = X[self.features].astype(str)
        p = np.full(len(df), self.p0)
        for k, g in enumerate(self.tables, start=1):
            keys = df[self.features[:k]]
            idx = pd.MultiIndex.from_frame(keys) if k > 1 else pd.Index(keys.iloc[:, 0])
            s = g["sum"].reindex(idx).to_numpy(dtype=float)
            n = g["size"].reindex(idx).to_numpy(dtype=float)
            s, n = np.nan_to_num(s), np.nan_to_num(n)
            p = (s + self.m * p) / (n + self.m)
        return p


class LogitModel:
    def __init__(self, features, C):
        self.features, self.C = features, C

    def fit(self, X, y):
        self.enc = OneHotEncoder(handle_unknown="ignore")
        Z = self.enc.fit_transform(X[self.features].astype(str))
        self.lr = LogisticRegression(C=self.C, max_iter=2000).fit(Z, y)
        return self

    def predict(self, X):
        return self.lr.predict_proba(self.enc.transform(X[self.features].astype(str)))[:, 1]


class GlobalModel:
    def fit(self, X, y):
        self.p = float(np.mean(y))
        return self

    def predict(self, X):
        return np.full(len(X), self.p)


def _make(name, cfg, features=TRADE_FEATURES):
    b = cfg["fundamentals"]["baseline"]
    if name == "M0_global":
        return GlobalModel()
    if name == "M1_cells":
        return CellModel(features, b["shrink_m"])
    return LogitModel(features, b["logistic_C"])


def _scores(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    ll = float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
    brier = float(np.mean((p - y) ** 2))
    bins = np.minimum((p * 10).astype(int), 9)
    ece = float(sum(abs(y[bins == b].mean() - p[bins == b].mean()) * (bins == b).mean() for b in range(10) if (bins == b).any()))
    return ll, brier, ece


def evaluate(X, y, groups, cfg, features=TRADE_FEATURES) -> pd.DataFrame:
    """Validação fora da amostra separada por série: cada série inteira fica num único fold."""
    k = cfg["fundamentals"]["baseline"]["cv_folds"]
    oof = {m: np.zeros(len(y)) for m in MODELS}
    for tr_i, te_i in GroupKFold(n_splits=k).split(X, y, groups):
        for m in MODELS:
            oof[m][te_i] = _make(m, cfg, features).fit(X.iloc[tr_i], y[tr_i]).predict(X.iloc[te_i])
    rows = []
    for m in MODELS:
        ll, br, ece = _scores(y, oof[m])
        rows.append({"model": m, "log_loss": ll, "brier": br, "ece": ece})
    return pd.DataFrame(rows)


def choose(report: pd.DataFrame, max_ece: float = 0.02) -> str:
    """Mantém o modelo mais simples, a menos que o próximo reduza o log-loss fora da amostra em ≥ 0,5% E seja bem
    calibrado (ECE ≤ 2 pp). A ECE do M0 não serve de régua: uma constante igual à média tem ECE ≈ 0 por construção."""
    r = report.set_index("model")
    best = "M0_global"
    for m in MODELS[1:]:
        gain = (r.loc[best, "log_loss"] - r.loc[m, "log_loss"]) / r.loc[best, "log_loss"]
        if gain >= 0.005 and r.loc[m, "ece"] <= max_ece:
            best = m
    return best


ADV_FEATURES = ["state", "spike", "side", "economy", "when", "map_name"]


def fit_baselines(events: pd.DataFrame, cfg, features: list[str], targets: dict[str, str], fundamental: str,
                  label: dict[str, str] | None = None, eligible: str = "eligible") -> tuple[pd.DataFrame, pd.DataFrame]:
    """Esperado leave-one-team-out para cada alvo {coluna_y: coluna_esperado}; só eventos `eligible`.
    O modelo que dá o esperado de um time é ajustado sem NENHUMA partida dele: nem as linhas do próprio time nem as
    do adversário naquelas partidas (em desfechos de soma zero, como o first blood, a linha do adversário é o espelho
    da do time). A escolha da classe de modelo (M0/M1/M2) é feita por alvo na validação separada por série."""
    d = events.copy()
    el = d[d[eligible]].copy()
    reports = []
    for ycol, pcol in targets.items():
        y = el[ycol].to_numpy(dtype=float)
        rep = evaluate(el, y, el["series_key"].to_numpy(), cfg, features)
        forced = cfg["fundamentals"]["baseline"].get("model", "auto")
        chosen = choose(rep) if forced == "auto" else forced
        rep["target"] = (label or {}).get(ycol, ycol)
        rep["chosen"] = rep["model"] == chosen
        rep["n_events"], rep["n_series"], rep["n_matches"] = len(el), el["series_key"].nunique(), el["match_id"].nunique()
        reports.append(rep)
        exp = np.full(len(el), np.nan)
        teams = el["team_name"].to_numpy()
        team_matches = el.groupby("team_name")["match_id"].unique()
        for team in np.unique(teams):
            mine = teams == team
            train = ~el["match_id"].isin(team_matches[team]).to_numpy()
            exp[mine] = _make(chosen, cfg, features).fit(el[train], y[train]).predict(el[mine])
        el[pcol] = exp
        el[pcol.replace("exp_", "model_", 1)] = chosen
    keys = [c for c in ("match_id", "round_num", "kill_idx", "team_id") if c in el.columns]
    keep = [c for c in el.columns if c in targets.values() or c in [v.replace("exp_", "model_", 1) for v in targets.values()]]
    d = d.merge(el[keys + keep], on=keys, how="left")
    report = pd.concat(reports, ignore_index=True)
    report.insert(0, "fundamental", fundamental)
    return d, report


def fit_trade_baselines(deaths: pd.DataFrame, cfg) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Acrescenta `exp_trade_{w}s` (esperado leave-one-team-out) às mortes elegíveis e devolve o relatório."""
    d = deaths.copy()
    d["killer_ally_b"] = _killer_ally_bucket(d)
    windows = [int(w) for w in cfg["fundamentals"]["trade_windows_s"]]
    d, rep = fit_baselines(d, cfg, TRADE_FEATURES, {f"traded_{w}s": f"exp_trade_{w}s" for w in windows}, "trade",
                           {f"traded_{w}s": f"trade em {w} s" for w in windows})
    rep["window_s"] = [int(t.split()[-2]) for t in rep["target"]]
    return d, rep


def fit_advantage_baselines(adv: pd.DataFrame, cfg) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Esperado de conversão (vencer o round) e de perder a vantagem, a partir do estado em que ela começou."""
    return fit_baselines(adv, cfg, ADV_FEATURES, {"won": "exp_adv_won", "lost_adv": "exp_adv_lost"}, "advantage",
                         {"won": "converteu (venceu o round)", "lost_adv": "perdeu a vantagem"})


FB_FEATURES = ["side", "economy", "when", "map_name"]


def fit_fb_baselines(fb: pd.DataFrame, cfg) -> tuple[pd.DataFrame, pd.DataFrame]:
    """First blood: esperado de vencer o duelo de abertura (todas as linhas) e de vencer o round depois de sofrer
    o FB (só as linhas em que o time sofreu), a partir de lado, economia, quando o FB saiu e mapa."""
    d, r1 = fit_baselines(fb, cfg, FB_FEATURES, {"got_fb": "exp_fb_open"}, "fb_open", {"got_fb": "fez o first blood"})
    d, r2 = fit_baselines(d, cfg, FB_FEATURES, {"won": "exp_fb_rec"}, "fb_rec", {"won": "venceu depois de sofrer o FB"},
                          eligible="eligible_rec")
    return d, pd.concat([r1, r2], ignore_index=True)


# ---------------------------------------------------------------- fundamentos de round (fundamentals/rounds.py)
PLANT_FEATURES = ["pstate", "site", "pwhen", "economy", "map_name"]
KEYR_FEATURES = ["round_type", "side", "economy", "map_name"]
HALF_FEATURES = ["moment", "economy"]  # lado e mapa pioram a calibração com ~2,6 mil eventos (validação por série)


def fit_plant_baselines(pe: pd.DataFrame, cfg) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Pós-plant (o time plantou) e retake (o adversário plantou): esperado de vencer o round a partir de vivos no
    plant, site, momento do plant, economia e mapa."""
    d, r1 = fit_baselines(pe, cfg, PLANT_FEATURES, {"won": "exp_post"}, "post", {"won": "venceu depois de plantar"},
                          eligible="eligible_post")
    d, r2 = fit_baselines(d, cfg, PLANT_FEATURES, {"won": "exp_ret"}, "retake", {"won": "venceu com a spike adversária plantada"},
                          eligible="eligible_ret")
    return d, pd.concat([r1, r2], ignore_index=True)


def fit_key_baselines(ke: pd.DataFrame, cfg) -> tuple[pd.DataFrame, pd.DataFrame]:
    return fit_baselines(ke, cfg, KEYR_FEATURES, {"won": "exp_key"}, "keyrounds", {"won": "venceu o round-chave"})


def fit_half_baselines(he: pd.DataFrame, cfg) -> tuple[pd.DataFrame, pd.DataFrame]:
    return fit_baselines(he, cfg, HALF_FEATURES, {"won": "exp_half"}, "halfopen", {"won": "venceu o round 2/3 do half"})
PRESS_FEATURES = ["lead", "phase", "economy", "side", "map_name"]


def fit_pressure_baselines(pe: pd.DataFrame, cfg) -> tuple[pd.DataFrame, pd.DataFrame]:
    return fit_baselines(pe, cfg, PRESS_FEATURES, {"won": "exp_press"}, "pressure", {"won": "venceu o round decisivo"})
