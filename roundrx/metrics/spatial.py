"""Lente: Posicionamento e espaçamento coletivo (SPC). Todas são proxies (classe P):
posições são snapshots nos instantes de kill/plant — não há trajetória nem linha de visão."""
import numpy as np
import pandas as pd

from .base import KEY, emit, metric
from .fights import _dist_bucket

RADIUS = ("spatial.near_radius",)


def _per_team_round(df, col):
    g = df.groupby(KEY).agg(num=(col, "sum"), den=(col, "size")).reset_index()
    return g


@metric("SPC-01", "ratio", "cm", "Em cada snapshot de kill: média, entre os vivos do time, da distância ao aliado mais próximo; "
        "média dos snapshots do round.")
def spc01(ctx):
    g = _per_team_round(ctx.team_spacing.dropna(subset=["mean_nearest"]), "mean_nearest")
    return emit(g, "SPC-01", g["num"], g["den"])


@metric("SPC-02", "ratio", "cm", "Distância da vítima ao aliado vivo mais próximo no instante da morte (mortes com ≥1 aliado vivo).")
def spc02(ctx):
    d = ctx.death_space.dropna(subset=["nearest_ally"])
    g = d.groupby(["match_id", "round_num", "victim_team"]).agg(num=("nearest_ally", "sum"), den=("nearest_ally", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "SPC-02", g["num"], g["den"])


@metric("SPC-03", "ratio", "cm", "Distância do killer ao aliado vivo da vítima mais próximo dele no instante da morte.")
def spc03(ctx):
    d = ctx.death_space.dropna(subset=["killer_to_ally"])
    g = d.groupby(["match_id", "round_num", "victim_team"]).agg(num=("killer_to_ally", "sum"), den=("killer_to_ally", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "SPC-03", g["num"], g["den"])


@metric("SPC-04", "ratio", "aliados", "Em cada snapshot de kill: nº médio de aliados vivos a ≤ near_radius de cada jogador vivo do time.",
        params=RADIUS)
def spc04(ctx):
    g = _per_team_round(ctx.team_spacing, "mean_near_count")
    return emit(g, "SPC-04", g["num"], g["den"])


@metric("SPC-05", "mean", "cm", "Distância média entre pares de jogadores do time no snapshot do 1º confronto (first blood), "
        "incluindo a vítima.")
def spc05(ctx):
    fk = ctx.first_kill[["match_id", "round_num", "kill_idx"]]
    s = ctx.team_spacing.merge(fk, on=["match_id", "round_num", "kill_idx"])
    return emit(s, "SPC-05", s["mean_pairwise"])


@metric("SPC-06", "mean", "cm", "Distância média entre pares do time no snapshot do plant; estrato = lado (atk/def).")
def spc06(ctx):
    p = ctx.plant_space.dropna(subset=["dispersion"]).merge(ctx.tr[KEY + ["side"]], on=KEY)
    return emit(p, "SPC-06", p["dispersion"], stratum=p["side"])


@metric("SPC-07", "mean", "jogadores", "Defensores vivos a ≤ near_radius da spike no snapshot do plant.", params=RADIUS)
def spc07(ctx):
    p = ctx.plant_space.merge(ctx.tr[KEY + ["side"]], on=KEY)
    p = p[p["side"] == "def"]
    return emit(p, "SPC-07", p["n_near_spike"])


@metric("SPC-08", "ratio", "taxa", "Mortes sem trade / mortes, por célula de grid de grid_cell cm no mapa "
        "(estrato = mapa:célula). Proxy de região — o JSON não traz callouts.", params=("spatial.grid_cell", "timing.trade_window_s"))
def spc08(ctx):
    c = ctx.cfg["spatial"]["grid_cell"]
    k = ctx.enemy_kills.dropna(subset=["victim_x", "victim_y"])
    m = ctx.t["matches"].set_index("match_id")["map_name"]
    cell = (k["match_id"].map(m) + ":" + (k["victim_x"] // c).astype(int).astype(str) + "," +
            (k["victim_y"] // c).astype(int).astype(str))
    k = k.assign(cell=cell, untraded=(~k["traded"].astype(bool)).astype(float))
    g = k.groupby(["match_id", "round_num", "victim_team", "cell"]).agg(num=("untraded", "sum"), den=("untraded", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "SPC-08", g["num"], g["den"], stratum=g["cell"])


@metric("SPC-09", "ratio", "cm", "Para mortes consecutivas do mesmo time com intervalo ≤ spatial_cluster_window_s: "
        "distância média entre as posições das vítimas (menor = baixas concentradas).", params=("timing.spatial_cluster_window_s",))
def spc09(ctx):
    w = ctx.cfg["timing"]["spatial_cluster_window_s"] * 1000
    k = ctx.deaths.dropna(subset=["victim_x", "victim_y", "victim_team"]).sort_values(["match_id", "round_num", "victim_team", "t_ms"])
    grp = k.groupby(["match_id", "round_num", "victim_team"])
    k = k.assign(dt=grp["t_ms"].diff(), dx=grp["victim_x"].diff(), dy=grp["victim_y"].diff())
    k = k[k["dt"] <= w].assign(dist=lambda x: np.hypot(x["dx"], x["dy"]))
    g = k.groupby(["match_id", "round_num", "victim_team"]).agg(num=("dist", "sum"), den=("dist", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "SPC-09", g["num"], g["den"])


@metric("SPC-10", "ratio", "taxa", "Taxa de trade por faixa de distância ao aliado mais próximo (mesma regra de TRD-06; "
        "o dicionário lista as duas).", params=("spatial.distance_buckets", "timing.trade_window_s"))
def spc10(ctx):
    d = ctx.death_space
    d = d.assign(bucket=_dist_bucket(d["nearest_ally"].to_numpy(float), ctx.cfg["spatial"]["distance_buckets"]))
    g = d.groupby(["match_id", "round_num", "victim_team", "bucket"]).agg(num=("traded", "sum"), den=("traded", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "SPC-10", g["num"], g["den"], stratum=g["bucket"])
