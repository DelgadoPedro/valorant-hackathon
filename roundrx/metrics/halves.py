"""Lente: Abertura de half e ciclo econômico (HAL).

Half regulamentar: rounds 1–12 (índices 0–11) e 13–24 (12–23); prorrogação fora. Cada half começa num pistol
(índices 0 e 12) e os indicadores olham os 3 primeiros rounds (r1 = pistol, r2, r3). Métricas de half são
emitidas na linha do pistol do time, então o filtro de lado do painel funciona (o lado é o mesmo no half inteiro).
Se o mapa termina antes de r2/r3, o half não é elegível (N/A, nunca derrota).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .base import emit, metric

HALF_LBL = {1: "1º half", 2: "2º half"}
ECO = ("economy.team_eco_max", "economy.team_full_min")
FORCE = ("economy.force_player_available_max", "economy.force_min_players")


def halves(ctx) -> pd.DataFrame:
    """Uma linha por time-half com r1..r3 lado a lado (won_i, lo_i, olo_i, spent_i, cv_i, buy_i, force_i, ok_i)."""
    if "_halves" in ctx.__dict__:
        return ctx.__dict__["_halves"]
    tr = ctx.tr[~ctx.tr["is_overtime"] & (ctx.tr["round_num"] < 24)].copy()
    tr["half_id"] = np.where(tr["round_num"] < 12, 1, 2)
    tr["pos"] = tr["round_num"] - (tr["half_id"] - 1) * 12
    base = tr[tr["pos"] == 0][["match_id", "round_num", "team_id", "half_id", "side"]].copy()
    cols = {"won": "won", "team_loadout": "lo", "opp_loadout": "olo", "team_spent": "spent", "loadout_cv": "cv",
            "buy_type": "buy", "is_force": "force"}
    h = base
    for i in (1, 2, 3):
        x = tr[tr["pos"] == i - 1][["match_id", "team_id", "half_id"] + list(cols)].rename(columns={k: f"{v}_{i}" for k, v in cols.items()})
        x[f"ok_{i}"] = True
        h = h.merge(x, on=["match_id", "team_id", "half_id"], how="left")
        h[f"ok_{i}"] = h[f"ok_{i}"].fillna(False).astype(bool)
    for i in (1, 2, 3):
        h[f"won_{i}"] = h[f"won_{i}"].astype(float)
    # 1º full buy depois do pistol, dentro do half (HAL-16)
    full = tr[(tr["pos"] >= 1) & (tr["buy_type"] == "full")].groupby(["match_id", "team_id", "half_id"])["pos"].min()
    h = h.merge(full.rename("first_full").reset_index(), on=["match_id", "team_id", "half_id"], how="left")
    h["half_lbl"] = h["half_id"].map(HALF_LBL)
    ctx.__dict__["_halves"] = h
    return h


@metric("HAL-01", "count", "pistols", "Identificação dos pistols: rounds 1 e 13 (índices 0 e 12) existentes; estrato = half. Prorrogação fora.")
def hal01(ctx):
    h = halves(ctx)
    return emit(h, "HAL-01", 1.0, 1.0, stratum=h["half_lbl"])


@metric("HAL-02", "ratio", "taxa de vitória", "Pistols vencidos / disputados, estrato = half (o lado vem da dimensão side).")
def hal02(ctx):
    h = halves(ctx)
    return emit(h, "HAL-02", h["won_1"], stratum=h["half_lbl"])


@metric("HAL-03", "ratio", "taxa de vitória", "Elegível: half com pistol vencido e round 2/14 existente. Num: venceu o round 2/14. Estrato = half.")
def hal03(ctx):
    h = halves(ctx)
    h = h[(h["won_1"] == 1) & h["ok_2"]]
    return emit(h, "HAL-03", h["won_2"], stratum=h["half_lbl"])


@metric("HAL-04", "ratio", "taxa de vitória", "Round 3/15 vencido condicionado ao caminho r1–r2 do half: estrato 2-0, 1-1 ou 0-2 (vitórias-derrotas).")
def hal04(ctx):
    h = halves(ctx)
    h = h[h["ok_3"]]
    w = (h["won_1"] + h["won_2"]).astype(int)
    path = w.map({2: "2-0", 1: "1-1", 0: "0-2"})
    return emit(h, "HAL-04", h["won_3"], stratum=path)


@metric("HAL-05", "mean", "rounds", "Saldo (vitórias − derrotas) nos 3 primeiros rounds do half. Só halves com os 3 rounds, para comparar.")
def hal05(ctx):
    h = halves(ctx)
    h = h[h["ok_3"]]
    w = h["won_1"] + h["won_2"] + h["won_3"]
    return emit(h, "HAL-05", 2 * w - 3)


@metric("HAL-06", "mean", "créditos", "Investimento no round 2/14 após vencer o pistol: Σ spent (estrato 'gasto') e Σ loadoutValue ('loadout').")
def hal06(ctx):
    h = halves(ctx)
    h = h[(h["won_1"] == 1) & h["ok_2"]]
    return pd.concat([emit(h, "HAL-06", h["spent_2"], stratum="gasto"), emit(h, "HAL-06", h["lo_2"], stratum="loadout")], ignore_index=True)


@metric("HAL-07", "ratio", "taxa", "Falha de anti-eco: elegível = venceu o pistol e entrou no round 2/14 com Σloadout ≥ superior_ratio × adversário. "
        "Num: perdeu o round.", params=("halves.superior_ratio",))
def hal07(ctx):
    k = ctx.cfg["halves"]["superior_ratio"]
    h = halves(ctx)
    h = h[(h["won_1"] == 1) & h["ok_2"] & (h["lo_2"] >= k * h["olo_2"])]
    return emit(h, "HAL-07", 1 - h["won_2"])


@metric("HAL-08", "ratio", "proporção", "Force após pistol perdido: halves com pistol perdido e round 2/14 existente; num = round 2/14 "
        "classificado como force (mesma regra de KEY-09).", params=FORCE)
def hal08(ctx):
    h = halves(ctx)
    h = h[(h["won_1"] == 0) & h["ok_2"]]
    return emit(h, "HAL-08", h["force_2"].astype(float))


@metric("HAL-09", "ratio", "taxa de vitória", "Conversão do force pós-pistol: vitórias no round 2/14 classificado como force / forces.", params=FORCE)
def hal09(ctx):
    h = halves(ctx)
    h = h[(h["won_1"] == 0) & h["ok_2"] & (h["force_2"] == True)]  # noqa: E712
    return emit(h, "HAL-09", h["won_2"])


def _bonus3(ctx, h):
    full_min = ctx.cfg["economy"]["team_full_min"]
    return (h["lo_3"] < full_min) | (h["lo_3"] < h["olo_3"])


@metric("HAL-10", "ratio", "proporção", "Bonus provável no round 3/15: elegível = venceu r1 e r2 e r3 existe; num = entrou no r3 com Σloadout "
        "abaixo de full buy ou inferior ao adversário.", params=("economy.team_full_min",))
def hal10(ctx):
    h = halves(ctx)
    h = h[(h["won_1"] == 1) & (h["won_2"] == 1) & h["ok_3"]]
    return emit(h, "HAL-10", _bonus3(ctx, h).astype(float))


@metric("HAL-11", "ratio", "taxa de vitória", "Conversão do bonus: vitórias no round 3/15 classificado como bonus (HAL-10) / bonus.",
        params=("economy.team_full_min",))
def hal11(ctx):
    h = halves(ctx)
    h = h[(h["won_1"] == 1) & (h["won_2"] == 1) & h["ok_3"]]
    h = h[_bonus3(ctx, h)]
    return emit(h, "HAL-11", h["won_3"])


@metric("HAL-12", "ratio", "proporção", "Abertura limpa: halves em que o time venceu os 3 primeiros rounds / halves com 3 rounds.")
def hal12(ctx):
    h = halves(ctx)
    h = h[h["ok_3"]]
    return emit(h, "HAL-12", ((h["won_1"] + h["won_2"] + h["won_3"]) == 3).astype(float))


def _per_round(ctx, metric_id, fn):
    h = halves(ctx)
    out = []
    for i in (1, 2, 3):
        x = h[h[f"ok_{i}"]]
        out.append(emit(x, metric_id, fn(x, i), stratum=f"r{i}"))
    return pd.concat(out, ignore_index=True)


@metric("HAL-13", "mean", "log-razão", "Gap de equipamento em r1, r2, r3 do half: log((Σloadout_time + c) / (Σloadout_adv + c)); "
        "> 0 = time mais equipado. Estrato = r1/r2/r3.", params=("halves.log_gap_c",))
def hal13(ctx):
    c = ctx.cfg["halves"]["log_gap_c"]
    return _per_round(ctx, "HAL-13", lambda x, i: np.log((x[f"lo_{i}"] + c) / (x[f"olo_{i}"] + c)))


@metric("HAL-14", "mean", "créditos", "Ritmo de gastos: Σ spent do time em r1, r2, r3 do half (estrato). As diferenças sucessivas saem da comparação "
        "entre estratos.")
def hal14(ctx):
    return _per_round(ctx, "HAL-14", lambda x, i: x[f"spent_{i}"])


@metric("HAL-15", "mean", "coef. de variação", "Desigualdade de loadout: CV dos 5 loadouts em r1, r2, r3 do half (estrato). CV indefinido "
        "(média zero) fica fora.")
def hal15(ctx):
    return _per_round(ctx, "HAL-15", lambda x, i: x[f"cv_{i}"])


@metric("HAL-16", "mean", "rounds", "Recuperação após pistol perdido: nº de rounds depois do pistol até o 1º full buy do time no mesmo half "
        "(1 = já no round 2/14). Halves sem full buy até o fim ficam fora (censurados).", params=ECO)
def hal16(ctx):
    h = halves(ctx)
    h = h[(h["won_1"] == 0) & h["first_full"].notna()]
    return emit(h, "HAL-16", h["first_full"])


@metric("HAL-17", "ratio", "taxa de vitória", "Depois do upset no round 2/14 (venceu o pistol e perdeu o r2): vitórias no round 3/15. O gap de "
        "equipamento nesse r3 aparece em HAL-13.")
def hal17(ctx):
    h = halves(ctx)
    h = h[(h["won_1"] == 1) & (h["won_2"] == 0) & h["ok_3"]]
    return emit(h, "HAL-17", h["won_3"])


@metric("HAL-18", "ratio", "taxa de vitória", "Assimetria entre halves: vitórias nos 3 primeiros rounds / 3, por half (estrato). O valor da "
        "métrica é 2º half − 1º half (diferença em pontos); halves incompletos ficam fora.")
def hal18(ctx):
    h = halves(ctx)
    h = h[h["ok_3"]]
    return emit(h, "HAL-18", h["won_1"] + h["won_2"] + h["won_3"], 3.0, stratum=h["half_lbl"])
