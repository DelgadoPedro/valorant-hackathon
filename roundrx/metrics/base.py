"""Registro de métricas + contexto compartilhado.

Cada métrica é registrada pelo ID do dicionário e devolve linhas no formato longo:
    match_id, round_num, team_id, metric_id, stratum, num, den
Agregação universal: valor = Σnum / Σden (taxas e médias) ou Σnum (contagens).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import cached_property
from typing import Callable

import numpy as np
import pandas as pd

KEY = ["match_id", "round_num", "team_id"]
OUT_COLS = KEY + ["metric_id", "stratum", "num", "den"]


@dataclass
class MetricSpec:
    metric_id: str
    agg: str                 # "ratio" | "mean" | "count"
    unit: str
    definition: str          # regra implementada (elegibilidade, numerador, denominador)
    params: tuple = ()       # chaves do config.yaml usadas (precisam de validação humana)
    level: str = "round"     # "round" (linha por time-round) ou "aggregate" (só no agregado)
    crosscheck: str = ""     # verificação independente disponível
    fn: Callable | None = field(default=None, repr=False)


REGISTRY: dict[str, MetricSpec] = {}


def metric(metric_id: str, agg: str, unit: str, definition: str, params=(), level="round", crosscheck=""):
    def deco(fn):
        REGISTRY[metric_id] = MetricSpec(metric_id, agg, unit, definition, tuple(params), level, crosscheck, fn)
        return fn
    return deco


def emit(df: pd.DataFrame, metric_id: str, num, den=1, stratum="") -> pd.DataFrame:
    """Monta linhas de saída a partir de um DataFrame que contém KEY."""
    if df is None or len(df) == 0:
        return pd.DataFrame(columns=OUT_COLS)
    out = df[KEY].copy()
    out["metric_id"] = metric_id
    out["stratum"] = stratum if np.isscalar(stratum) else np.asarray(stratum, dtype=object)
    out["num"] = np.asarray(num, dtype=float) if not np.isscalar(num) else float(num)
    out["den"] = np.asarray(den, dtype=float) if not np.isscalar(den) else float(den)
    out = out[np.isfinite(out["num"]) & np.isfinite(out["den"]) & (out["den"] > 0)]
    return out[OUT_COLS]


def other_team(s: pd.Series) -> pd.Series:
    return s.map({"Red": "Blue", "Blue": "Red"})


def pairwise_mean(xy: np.ndarray) -> float:
    if len(xy) < 2:
        return np.nan
    d = np.sqrt(((xy[:, None, :] - xy[None, :, :]) ** 2).sum(-1))
    iu = np.triu_indices(len(xy), 1)
    return float(d[iu].mean())


class Context:
    def __init__(self, t, events, trades, team_rounds, cfg):
        self.t, self.ev, self.trades, self.tr, self.cfg = t, events, trades, team_rounds, cfg

    # --------------------------------------------------------------- pressão (leverage)
    @cached_property
    def lev(self) -> tuple[pd.DataFrame, pd.DataFrame]:
        """(time-round com W+, W−, LI, p_pre, WPA…, relatório de validação). Ver roundrx/leverage.py."""
        from ..leverage import build
        return build(self)

    # --------------------------------------------------------------- kills
    @cached_property
    def kills(self) -> pd.DataFrame:
        """Kills em jogo: exclui mortes pela spike e kills após o fim do round (pós-defuse/detonação)."""
        return self.t["kills"][self.t["kills"]["in_play"]]

    @cached_property
    def enemy_kills(self) -> pd.DataFrame:
        k = self.kills[self.kills["kill_type"] == "enemy"]
        tr = self.trades[["match_id", "round_num", "kill_idx", "traded", "trader", "trade_time_s"]]
        k = k.merge(tr, on=["match_id", "round_num", "kill_idx"], how="left")
        r = self.t["rounds"][["match_id", "round_num", "plant_time_ms", "atk_team"]]
        k = k.merge(r, on=["match_id", "round_num"], how="left")
        k["post_plant"] = k["plant_time_ms"].notna() & (k["t_ms"] > k["plant_time_ms"])
        k["enemy_rank"] = k.groupby(["match_id", "round_num"]).cumcount()  # 0 = first blood
        return k

    @cached_property
    def first_kill(self) -> pd.DataFrame:
        return self.enemy_kills[self.enemy_kills["enemy_rank"] == 0].copy()

    @cached_property
    def deaths(self) -> pd.DataFrame:
        """Todas as mortes (qualquer causa) — para estado numérico/colapsos."""
        return self.kills[["match_id", "round_num", "kill_idx", "t_ms", "victim", "victim_team", "killer_team",
                           "kill_type", "victim_x", "victim_y"]]

    # --------------------------------------------------------------- estados numéricos
    @cached_property
    def alive_plant(self) -> pd.DataFrame:
        """Vivos do time e do adversário no instante do plant (por time-round)."""
        from ..states import alive_at
        r = self.t["rounds"]
        planted = r[r["has_plant"]].set_index(["match_id", "round_num"])["plant_time_ms"]
        a = alive_at(self.ev, planted).reset_index()
        rows = []
        for tid, oid in (("Red", "Blue"), ("Blue", "Red")):
            x = a[["match_id", "round_num"]].copy()
            x["team_id"] = tid
            x["alive"] = a[f"{tid.lower()}_alive"]
            x["opp_alive"] = a[f"{oid.lower()}_alive"]
            rows.append(x)
        out = pd.concat(rows, ignore_index=True)
        # rounds com plant sem kill anterior: 5v5
        base = self.tr[self.tr["has_plant"]][KEY]
        out = base.merge(out, on=KEY, how="left")
        npl = self.tr.set_index(KEY)["n_players"]
        opp = out[KEY].copy()
        opp["team_id"] = other_team(opp["team_id"])
        own_n = npl.reindex(pd.MultiIndex.from_frame(out[KEY])).to_numpy()
        opp_n = npl.reindex(pd.MultiIndex.from_frame(opp[KEY])).to_numpy()
        out["alive"] = out["alive"].fillna(pd.Series(own_n, index=out.index))
        out["opp_alive"] = out["opp_alive"].fillna(pd.Series(opp_n, index=out.index))
        out["diff"] = out["alive"] - out["opp_alive"]
        return out

    @cached_property
    def diff_timeline(self) -> pd.DataFrame:
        """Diferença de vivos (perspectiva de cada time) após cada evento de kill/revive."""
        ev = self.ev[self.ev["event"].isin(["kill", "revive"])]
        rows = []
        for tid, oid in (("Red", "Blue"), ("Blue", "Red")):
            x = ev[["match_id", "round_num", "seq", "t_ms", "event", "target_team"]].copy()
            x["team_id"] = tid
            x["alive"] = ev[f"{tid.lower()}_alive"].values
            x["opp_alive"] = ev[f"{oid.lower()}_alive"].values
            rows.append(x)
        d = pd.concat(rows, ignore_index=True).sort_values(KEY + ["seq"])
        d["diff"] = d["alive"] - d["opp_alive"]
        return d

    # --------------------------------------------------------------- espaço
    @cached_property
    def snapshot_full(self) -> pd.DataFrame:
        """Posições no instante de cada kill: vivos do snapshot + a própria vítima."""
        kp = self.t["kill_positions"][["match_id", "round_num", "kill_idx", "puuid", "team_id", "x", "y"]]
        k = self.kills
        vic = k[["match_id", "round_num", "kill_idx", "victim", "victim_team", "victim_x", "victim_y"]].rename(
            columns={"victim": "puuid", "victim_team": "team_id", "victim_x": "x", "victim_y": "y"})
        vic = vic[k["snapshot_n"].values > 0]
        return pd.concat([kp, vic], ignore_index=True).dropna(subset=["x", "y", "team_id"])

    @cached_property
    def death_space(self) -> pd.DataFrame:
        """Para cada morte por inimigo: distância ao aliado vivo mais próximo, aliados no raio,
        distância do killer ao aliado da vítima mais próximo. Snapshot vazio -> NaN."""
        R = self.cfg["spatial"]["near_radius"]
        k = self.enemy_kills[self.enemy_kills["snapshot_n"] > 0]
        kp = self.t["kill_positions"]
        allies = k[["match_id", "round_num", "kill_idx", "victim_team", "victim_x", "victim_y", "killer"]].merge(
            kp, left_on=["match_id", "round_num", "kill_idx", "victim_team"],
            right_on=["match_id", "round_num", "kill_idx", "team_id"])
        allies["d_victim"] = np.hypot(allies["x"] - allies["victim_x"], allies["y"] - allies["victim_y"])
        kxy = kp.merge(k[["match_id", "round_num", "kill_idx", "killer"]],
                       left_on=["match_id", "round_num", "kill_idx", "puuid"],
                       right_on=["match_id", "round_num", "kill_idx", "killer"])[
            ["match_id", "round_num", "kill_idx", "x", "y"]].rename(columns={"x": "kx", "y": "ky"})
        allies = allies.merge(kxy, on=["match_id", "round_num", "kill_idx"], how="left")
        allies["d_killer"] = np.hypot(allies["x"] - allies["kx"], allies["y"] - allies["ky"])
        g = allies.groupby(["match_id", "round_num", "kill_idx"])
        agg = pd.DataFrame({
            "n_allies_alive": g.size(),
            "nearest_ally": g["d_victim"].min(),
            "n_allies_near": g["d_victim"].apply(lambda s: int((s <= R).sum())),
            "killer_to_ally": g["d_killer"].min(),
        }).reset_index()
        out = k.merge(agg, on=["match_id", "round_num", "kill_idx"], how="left")
        out["n_allies_alive"] = out["n_allies_alive"].fillna(0)
        out["n_allies_near"] = out["n_allies_near"].fillna(0)
        return out

    @cached_property
    def team_spacing(self) -> pd.DataFrame:
        """Por snapshot de kill e time: distância média ao aliado mais próximo, nº médio de aliados no raio,
        distância média entre pares."""
        R = self.cfg["spatial"]["near_radius"]
        s = self.snapshot_full
        rows = []
        for (mid, rn, ki, tid), g in s.groupby(["match_id", "round_num", "kill_idx", "team_id"], sort=False):
            xy = g[["x", "y"]].to_numpy(float)
            if len(xy) < 2:
                continue
            d = np.sqrt(((xy[:, None, :] - xy[None, :, :]) ** 2).sum(-1))
            np.fill_diagonal(d, np.inf)
            nearest = d.min(1)
            near_cnt = (d <= R).sum(1)
            iu = np.triu_indices(len(xy), 1)
            rows.append((mid, rn, ki, tid, float(nearest.mean()), float(near_cnt.mean()), float(d[iu].mean()), len(xy)))
        return pd.DataFrame(rows, columns=["match_id", "round_num", "kill_idx", "team_id", "mean_nearest",
                                           "mean_near_count", "mean_pairwise", "n"])

    @cached_property
    def plant_space(self) -> pd.DataFrame:
        """No snapshot do plant: dispersão por time, distância de cada defensor à spike, defensores no raio."""
        R = self.cfg["spatial"]["near_radius"]
        op = self.t["objective_positions"]
        op = op[op["event"] == "plant"]
        r = self.t["rounds"][["match_id", "round_num", "plant_x", "plant_y", "def_team"]]
        op = op.merge(r, on=["match_id", "round_num"])
        op["d_spike"] = np.hypot(op["x"] - op["plant_x"], op["y"] - op["plant_y"])
        rows = []
        for (mid, rn, tid), g in op.groupby(["match_id", "round_num", "team_id"], sort=False):
            xy = g[["x", "y"]].to_numpy(float)
            rows.append((mid, rn, tid, pairwise_mean(xy), float(g["d_spike"].mean()),
                         int((g["d_spike"] <= R).sum()), len(g)))
        return pd.DataFrame(rows, columns=["match_id", "round_num", "team_id", "dispersion", "mean_d_spike",
                                           "n_near_spike", "n"])

    # --------------------------------------------------------------- jogadores
    @cached_property
    def riot_id(self) -> dict:
        p = self.t["players"]
        return p.groupby("puuid")["riot_id"].agg(lambda s: s.value_counts().index[0]).to_dict()


def run_all(ctx: Context, only: list[str] | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Executa todas as métricas de nível round. Devolve (linhas, log de execução)."""
    frames, log = [], []
    for mid, spec in sorted(REGISTRY.items()):
        if spec.level != "round" or (only and mid not in only):
            continue
        try:
            df = spec.fn(ctx)
            frames.append(df)
            log.append({"metric_id": mid, "ok": True, "rows": len(df), "error": ""})
        except Exception as exc:  # métrica com erro não derruba o pipeline; aparece na cobertura
            log.append({"metric_id": mid, "ok": False, "rows": 0, "error": f"{type(exc).__name__}: {exc}"})
    frames = [f for f in frames if f is not None and len(f)]
    rows = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=OUT_COLS)
    rows["num"] = rows["num"].astype(float)
    rows["den"] = rows["den"].astype(float)
    rows["stratum"] = rows["stratum"].fillna("").astype(str)
    return rows, pd.DataFrame(log)
