"""Lente: Pressão e Leverage Index (LEV). Modelo e validação em roundrx/leverage.py.

LI = (P(vencer o mapa | vence o round) − P(vencer o mapa | perde o round)) / média da liga.
LI = 1 é um round de pressão típica; 2 vale o dobro para o mapa. É prospectivo: só usa placar, lado e rodada.
"""
import numpy as np
import pandas as pd

from .base import KEY, emit, metric

PARAMS = ("leverage.shrink_m", "leverage.folds")


RAW = "bruto"  # mesmo recorte sem peso (contagens reais para o denominador visível no painel)


def _with_raw(d, mid, num_w, den_w, num_raw, den_raw, stratum=""):
    raw_st = RAW if np.isscalar(stratum) and stratum == "" else np.array([f"{RAW}|{x}" for x in stratum], dtype=object)
    return pd.concat([emit(d, mid, num_w, den_w, stratum=stratum), emit(d, mid, num_raw, den_raw, stratum=raw_st)], ignore_index=True)


def _lev(ctx):
    return ctx.lev[0]


def _kd(ctx) -> pd.DataFrame:
    k = ctx.enemy_kills
    kills = k.groupby(["match_id", "round_num", "killer_team"]).size().rename("K").reset_index().rename(columns={"killer_team": "team_id"})
    deaths = k.groupby(["match_id", "round_num", "victim_team"]).size().rename("D").reset_index().rename(columns={"victim_team": "team_id"})
    d = _lev(ctx)[KEY + ["LI", "won"]].merge(kills, on=KEY, how="left").merge(deaths, on=KEY, how="left")
    d[["K", "D"]] = d[["K", "D"]].fillna(0)
    return d


@metric("LEV-01", "mean", "probabilidade", "W+ = P(vencer o mapa) se vencer este round: cadeia de Markov do placar com a taxa "
        "de vitória do ataque no mapa (liga, encolhida para a global); 13 vence, prorrogação com 2 de vantagem.", params=PARAMS)
def lev01(ctx):
    d = _lev(ctx)
    return emit(d, "LEV-01", d["W_plus"])


@metric("LEV-02", "mean", "probabilidade", "W− = P(vencer o mapa) se perder este round (mesmo modelo de LEV-01).", params=PARAMS)
def lev02(ctx):
    d = _lev(ctx)
    return emit(d, "LEV-02", d["W_minus"])


@metric("LEV-03", "mean", "probabilidade", "L = max(0, W+ − W−): quanto o resultado do round pode mudar a chance de vencer o mapa.",
        params=PARAMS, crosscheck="W+ do time + W− do adversário = 1")
def lev03(ctx):
    d = _lev(ctx)
    return emit(d, "LEV-03", d["L"])


@metric("LEV-04", "mean", "× round típico", "LI = L / média de L na base (referência gravada em outputs/leverage/model_report.csv). "
        "Média por round; 1 = pressão típica.", params=PARAMS, crosscheck="LI igual para os dois times; média da liga = 1")
def lev04(ctx):
    d = _lev(ctx)
    return emit(d, "LEV-04", d["LI"])


@metric("LEV-05", "mean", "× round típico", "LI médio por número do round (estrato = round 01, 02, …): curva de pressão do mapa.",
        params=PARAMS)
def lev05(ctx):
    d = _lev(ctx)
    return emit(d, "LEV-05", d["LI"], stratum=[f"round {k + 1:02d}" for k in d["round_num"]])


@metric("LEV-06", "mean", "× round típico", "LI médio nos rounds que o time venceu.", params=PARAMS)
def lev06(ctx):
    d = _lev(ctx)
    d = d[d["won"].astype(bool)]
    return emit(d, "LEV-06", d["LI"])


@metric("LEV-07", "mean", "× round típico", "LI médio nos rounds que o time perdeu.", params=PARAMS)
def lev07(ctx):
    d = _lev(ctx)
    d = d[~d["won"].astype(bool)]
    return emit(d, "LEV-07", d["LI"])


@metric("LEV-08", "ratio", "taxa de vitória", "Taxa de vitória ponderada pela pressão: Σ(LI × venceu) / ΣLI. Estrato 'bruto' = "
        "mesma taxa sem peso.", params=PARAMS)
def lev08(ctx):
    d = _lev(ctx)
    w = d["won"].astype(float)
    return _with_raw(d, "LEV-08", d["LI"] * w, d["LI"], w, 1)


@metric("LEV-09", "ratio", "pp", "Vitórias acima do esperado, ponderadas: Σ LI × (venceu − p_pre) / ΣLI, com p_pre = P(vencer o round) "
        "por lado, mapa, pistol e economia do round (regressão logística fora da amostra, validação por série).", params=PARAMS)
def lev09(ctx):
    d = _lev(ctx)
    x = d["won"].astype(float) - d["p_pre"]
    return _with_raw(d, "LEV-09", d["LI"] * x, d["LI"], x, 1)


@metric("LEV-10", "mean", "pp do mapa", "WPA = W_pós − W_pre, com W_pre = p_pre·W+ + (1 − p_pre)·W−: quanto cada round mudou a chance "
        "de vencer o mapa além do esperado para a economia daquele round. Média por round.", params=PARAMS)
def lev10(ctx):
    d = _lev(ctx)
    return emit(d, "LEV-10", d["WPA"])


@metric("LEV-11", "mean", "× round típico", "LI médio por fase: abertura do half (rounds 1–3 do half), meio (4–9), fim (10–12) "
        "e prorrogação.", params=PARAMS)
def lev11(ctx):
    d = _lev(ctx)
    return emit(d, "LEV-11", d["LI"], stratum=d["phase"])


@metric("LEV-12", "ratio", "taxa de vitória", "Rounds em que o time fez o first blood: Σ(LI × venceu) / ΣLI.", params=PARAMS)
def lev12(ctx):
    fb = ctx.first_kill[["match_id", "round_num", "killer_team"]].rename(columns={"killer_team": "team_id"})
    d = _lev(ctx).merge(fb, on=KEY, how="inner")
    w = d["won"].astype(float)
    return _with_raw(d, "LEV-12", d["LI"] * w, d["LI"], w, 1)


@metric("LEV-13", "ratio", "taxa", "Mortes do time trocadas, ponderadas pela pressão do round: Σ(LI × trocadas) / Σ(LI × mortes).",
        params=PARAMS + ("timing.trade_window_s",), crosscheck="com LI = 1 reproduz TRD-01")
def lev13(ctx):
    k = ctx.enemy_kills
    g = k.groupby(["match_id", "round_num", "victim_team"]).agg(t=("traded", "sum"), n=("traded", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"}).merge(_lev(ctx)[KEY + ["LI"]], on=KEY, how="inner")
    return _with_raw(g, "LEV-13", g["LI"] * g["t"], g["LI"] * g["n"], g["t"], g["n"])


@metric("LEV-14", "ratio", "taxa de vitória", "Rounds com spike plantada, Σ(LI × venceu) / ΣLI; estrato 'pós-plant (ataque)' quando o "
        "time plantou e 'retake (defesa)' quando defendia a spike plantada.", params=PARAMS)
def lev14(ctx):
    d = _lev(ctx).merge(ctx.tr[KEY + ["has_plant"]], on=KEY)
    d = d[d["has_plant"].astype(bool)]
    st = np.where(d["side"] == "atk", "pós-plant (ataque)", "retake (defesa)")
    w = d["won"].astype(float)
    return _with_raw(d, "LEV-14", d["LI"] * w, d["LI"], w, 1, stratum=st)


@metric("LEV-15", "ratio", "taxa de vitória", "Rounds com armamento inferior (Σloadout próprio / adversário < 0,67, pistols fora): "
        "Σ(LI × venceu) / ΣLI.", params=PARAMS + ("composition.loadout_ratio_bands",))
def lev15(ctx):
    lo, _ = ctx.cfg["composition"]["loadout_ratio_bands"]
    tr = ctx.tr[~ctx.tr["is_pistol"] & (ctx.tr["opp_loadout"] > 0)]
    tr = tr[tr["team_loadout"] / tr["opp_loadout"] < lo]
    d = _lev(ctx).merge(tr[KEY], on=KEY, how="inner")
    w = d["won"].astype(float)
    return _with_raw(d, "LEV-15", d["LI"] * w, d["LI"], w, 1)


@metric("LEV-16", "mean", "abates por round", "Saldo de abates ponderado: média por round de LI × (kills − mortes) do time (só abates "
        "entre jogadores, em jogo).", params=PARAMS)
def lev16(ctx):
    d = _kd(ctx)
    return emit(d, "LEV-16", d["LI"] * (d["K"] - d["D"]))


@metric("LEV-17", "mean", "abates por round", "Ponderado − bruto: média por round de (LI − 1) × (kills − mortes). Positivo = o saldo "
        "do time é melhor nos rounds de maior pressão.", params=PARAMS)
def lev17(ctx):
    d = _kd(ctx)
    return emit(d, "LEV-17", (d["LI"] - 1) * (d["K"] - d["D"]))


@metric("LEV-18", "ratio", "taxa de vitória", "Taxa de vitória por quartil de pressão (LI); limites dos quartis fixos na base e "
        "gravados no relatório do modelo.", params=PARAMS)
def lev18(ctx):
    d = _lev(ctx)
    return emit(d, "LEV-18", d["won"].astype(float), stratum=d["li_q"])
