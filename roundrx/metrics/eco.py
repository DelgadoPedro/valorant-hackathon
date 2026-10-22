"""Lente: Economia coletiva (ECO)."""
import numpy as np
import pandas as pd

from .base import emit, metric


@metric("ECO-01", "mean", "créditos", "Σ loadoutValue dos 5 jogadores do time no round.")
def eco01(ctx):
    return emit(ctx.tr, "ECO-01", ctx.tr["team_loadout"])


@metric("ECO-02", "mean", "créditos", "Σ economy.spent do time no round.")
def eco02(ctx):
    return emit(ctx.tr, "ECO-02", ctx.tr["team_spent"])


@metric("ECO-03", "mean", "créditos", "Σ economy.remaining do time no round.")
def eco03(ctx):
    return emit(ctx.tr, "ECO-03", ctx.tr["team_remaining"])


@metric("ECO-04", "mean", "coef. de variação", "Desvio-padrão / média de loadoutValue entre os jogadores do time.")
def eco04(ctx):
    return emit(ctx.tr, "ECO-04", ctx.tr["loadout_cv"])


@metric("ECO-05", "mean", "jogadores", "Nº de jogadores com loadoutValue < player_eco_max; estrato = tipo de compra do time.",
        params=("economy.player_eco_max", "economy.team_eco_max", "economy.team_full_min"))
def eco05(ctx):
    return emit(ctx.tr, "ECO-05", ctx.tr["n_below_eco"], stratum=ctx.tr["buy_type"])


@metric("ECO-06", "mean", "proporção", "Fração dos jogadores na faixa econômica individual mais comum do time (eco/half/full).",
        params=("economy.player_eco_max", "economy.player_full_min"))
def eco06(ctx):
    return emit(ctx.tr, "ECO-06", ctx.tr["buy_sync"])


@metric("ECO-07", "mean", "créditos", "Σ loadout próprio − Σ loadout adversário no round.")
def eco07(ctx):
    return emit(ctx.tr, "ECO-07", ctx.tr["loadout_diff"])


@metric("ECO-08", "ratio", "taxa de vitória", "Vitórias / rounds por par (faixa própria × faixa adversária); pistols à parte.",
        params=("economy.team_eco_max", "economy.team_full_min"))
def eco08(ctx):
    tr = ctx.tr
    return emit(tr, "ECO-08", tr["won"].astype(float), stratum=tr["buy_type"] + "_vs_" + tr["opp_buy_type"])


@metric("ECO-09", "ratio", "taxa de vitória", "Elegível: Σloadout próprio ≤ adversário − big_gap. Num: venceu. (Σnum = contagem.)",
        params=("economy.big_gap",), crosscheck="roundCeremony = CeremonyThrifty")
def eco09(ctx):
    tr = ctx.tr[ctx.tr["loadout_diff"] <= -ctx.cfg["economy"]["big_gap"]]
    return emit(tr, "ECO-09", tr["won"].astype(float))


@metric("ECO-10", "ratio", "taxa de derrota", "Elegível: Σloadout próprio ≥ adversário + big_gap. Num: perdeu. (Σnum = contagem.)",
        params=("economy.big_gap",))
def eco10(ctx):
    tr = ctx.tr[ctx.tr["loadout_diff"] >= ctx.cfg["economy"]["big_gap"]]
    return emit(tr, "ECO-10", (~tr["won"]).astype(float))


@metric("ECO-11", "ratio", "dano por 1000 créditos",
        "Σ dano em inimigos × 1000 / denominador; estrato 'gasto' (Σspent) e 'loadout' (Σloadout).")
def eco11(ctx):
    tr = ctx.tr
    a = emit(tr, "ECO-11", tr["team_damage"] * 1000, tr["team_spent"], stratum="gasto")
    b = emit(tr, "ECO-11", tr["team_damage"] * 1000, tr["team_loadout"], stratum="loadout")
    return pd.concat([a, b], ignore_index=True)


@metric("ECO-12", "ratio", "proporção", "Jogadores com o mesmo weapon ID do round anterior / jogadores. "
        "Exclui rounds 1 e 13 (reset). Estrato: gasto baixo (<1000) ou não — não afirma save.")
def eco12(ctx):
    rp = ctx.t["round_players"].sort_values(["match_id", "puuid", "round_num"])
    rp = rp.assign(prev_weapon=rp.groupby(["match_id", "puuid"])["weapon_id"].shift(1))
    rp = rp[~rp["round_num"].isin([0, 12]) & rp["prev_weapon"].notna()]
    rp["same"] = (rp["weapon_id"] == rp["prev_weapon"]).astype(float)
    rp["low_spend"] = np.where(rp["spent"] < 1000, "gasto_baixo", "gasto_normal")
    g = rp.groupby(["match_id", "round_num", "team_id", "low_spend"]).agg(num=("same", "sum"), den=("same", "size")).reset_index()
    return emit(g, "ECO-12", g["num"], g["den"], stratum=g["low_spend"])


@metric("ECO-13", "ratio", "taxa de vitória", "Vitórias / rounds por vantagem de armamento: razão Σloadout do time / Σloadout do adversário "
        "< 0,67 = 'inferior', > 1,5 = 'superior', entre as duas = 'equilibrado' (mesmas faixas do diagnóstico e da AGT-18). "
        "Pistols fora.", params=("composition.loadout_ratio_bands",))
def eco13(ctx):
    lo, hi = ctx.cfg["composition"]["loadout_ratio_bands"]
    tr = ctx.tr[~ctx.tr["is_pistol"] & (ctx.tr["opp_loadout"] > 0)]
    ratio = tr["team_loadout"] / tr["opp_loadout"]
    st = np.where(ratio < lo, "inferior", np.where(ratio > hi, "superior", "equilibrado"))
    return emit(tr, "ECO-13", tr["won"].astype(float), stratum=st)
