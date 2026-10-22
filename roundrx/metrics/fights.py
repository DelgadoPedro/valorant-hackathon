"""Lentes: Trade kills e cobertura (TRD) e Abertura / first blood (OPN)."""
import numpy as np
import pandas as pd

from .base import KEY, emit, metric, other_team

TRADE = ("timing.trade_window_s",)
RADIUS = ("spatial.near_radius",)


def _deaths_by_team(k, **agg):
    g = k.groupby(["match_id", "round_num", "victim_team"]).agg(**agg).reset_index()
    return g.rename(columns={"victim_team": "team_id"})


def _dist_bucket(d, edges):
    labels = [f"{a // 100}-{b // 100}m" for a, b in zip(edges[:-1], edges[1:])] + [f">{edges[-1] // 100}m"]
    idx = np.digitize(d, edges[1:], right=True)
    return np.where(np.isnan(d), "sem_aliado", np.array(labels, dtype=object)[np.minimum(idx, len(labels) - 1)])


# ============================================================ TRD
@metric("TRD-01", "ratio", "taxa", "Mortes por inimigo trocadas por aliado (aliado mata o killer) em ≤ janela / mortes elegíveis.",
        params=TRADE)
def trd01(ctx):
    g = _deaths_by_team(ctx.enemy_kills, num=("traded", "sum"), den=("traded", "size"))
    return emit(g, "TRD-01", g["num"], g["den"])


@metric("TRD-02", "ratio", "segundos", "Tempo médio entre a morte e a kill de troca (só trades concluídos).", params=TRADE)
def trd02(ctx):
    k = ctx.enemy_kills[ctx.enemy_kills["traded"] == True]  # noqa: E712
    g = _deaths_by_team(k, num=("trade_time_s", "sum"), den=("trade_time_s", "size"))
    return emit(g, "TRD-02", g["num"], g["den"])


@metric("TRD-03", "ratio", "taxa", "Mortes por inimigo NÃO trocadas em ≤ janela / mortes elegíveis.", params=TRADE)
def trd03(ctx):
    k = ctx.enemy_kills.assign(untraded=lambda x: (~x["traded"].astype(bool)).astype(float))
    g = _deaths_by_team(k, num=("untraded", "sum"), den=("untraded", "size"))
    return emit(g, "TRD-03", g["num"], g["den"])


@metric("TRD-04", "count", "trades", "Contagem de trades por dupla 'quem trocou → quem foi trocado' (Riot ID).", params=TRADE)
def trd04(ctx):
    k = ctx.enemy_kills[ctx.enemy_kills["traded"] == True].copy()  # noqa: E712
    rid = ctx.riot_id
    k["pair"] = k["trader"].map(rid) + " → " + k["victim"].map(rid)
    g = k.groupby(["match_id", "round_num", "victim_team", "pair"]).size().rename("n").reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "TRD-04", g["n"], 1, stratum=g["pair"])


@metric("TRD-05", "ratio", "índice 0–1", "Por dupla A,B do time: min(A→B, B→A) / max(A→B, B→A) somando a base inteira; "
        "linha sem estrato = reciprocidade agregada do time.", params=TRADE, level="aggregate")
def trd05(ctx):  # calculado em aggregate.py a partir de TRD-04
    return None


@metric("TRD-06", "ratio", "taxa", "Taxa de trade por faixa da distância vítima → aliado vivo mais próximo no snapshot da morte (proxy).",
        params=TRADE + ("spatial.distance_buckets",))
def trd06(ctx):
    d = ctx.death_space
    d = d.assign(bucket=_dist_bucket(d["nearest_ally"].to_numpy(float), ctx.cfg["spatial"]["distance_buckets"]))
    g = d.groupby(["match_id", "round_num", "victim_team", "bucket"]).agg(num=("traded", "sum"), den=("traded", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "TRD-06", g["num"], g["den"], stratum=g["bucket"])


@metric("TRD-07", "ratio", "proporção", "Mortes sem aliado vivo a ≤ near_radius da vítima / mortes elegíveis com snapshot (proxy).",
        params=RADIUS)
def trd07(ctx):
    d = ctx.death_space.assign(isolated=lambda x: (x["n_allies_near"] == 0).astype(float))
    g = _deaths_by_team(d, num=("isolated", "sum"), den=("isolated", "size"))
    return emit(g, "TRD-07", g["num"], g["den"])


@metric("TRD-08", "ratio", "proporção", "Mortes com ≥1 aliado a ≤ near_radius da vítima ou do killer e sem trade / mortes elegíveis (proxy; "
        "candidatos a revisão, não erros).", params=TRADE + RADIUS)
def trd08(ctx):
    R = ctx.cfg["spatial"]["near_radius"]
    d = ctx.death_space
    opp = ((d["n_allies_near"] > 0) | (d["killer_to_ally"] <= R)) & (~d["traded"].astype(bool))
    d = d.assign(missed=opp.astype(float))
    g = _deaths_by_team(d, num=("missed", "sum"), den=("missed", "size"))
    return emit(g, "TRD-08", g["num"], g["den"])


@metric("TRD-09", "ratio", "aliados", "Média de aliados vivos a ≤ near_radius da vítima no instante da morte (proxy).", params=RADIUS)
def trd09(ctx):
    g = _deaths_by_team(ctx.death_space, num=("n_allies_near", "sum"), den=("n_allies_near", "size"))
    return emit(g, "TRD-09", g["num"], g["den"])


@metric("TRD-11", "mean", "chains por round", "Nº de sequências de ≥ chain_min_kills kills alternando entre os times, "
        "com intervalo ≤ chain_window_s entre kills consecutivas. Mesmo valor para os dois times do round.",
        params=("timing.chain_window_s", "timing.chain_min_kills"))
def trd11(ctx):
    w = ctx.cfg["timing"]["chain_window_s"] * 1000
    nmin = ctx.cfg["timing"]["chain_min_kills"]
    rows = []
    for (mid, rn), g in ctx.enemy_kills.groupby(["match_id", "round_num"], sort=False):
        teams, times = g["killer_team"].tolist(), g["t_ms"].tolist()
        chains, length = 0, 1
        for i in range(1, len(g)):
            if teams[i] != teams[i - 1] and times[i] - times[i - 1] <= w:
                length += 1
            else:
                chains += length >= nmin
                length = 1
        chains += length >= nmin
        rows.append((mid, rn, chains))
    c = pd.DataFrame(rows, columns=["match_id", "round_num", "chains"])
    tr = ctx.tr[KEY].merge(c, on=["match_id", "round_num"], how="left")
    return emit(tr, "TRD-11", tr["chains"].fillna(0))


@metric("TRD-12", "ratio", "taxa", "Taxa de trade por fase: abertura (1ª morte do round), pré-plant e pós-plant.", params=TRADE)
def trd12(ctx):
    k = ctx.enemy_kills
    phase = np.where(k["enemy_rank"] == 0, "abertura", np.where(k["post_plant"], "pos_plant", "pre_plant"))
    k = k.assign(phase=phase)
    g = k.groupby(["match_id", "round_num", "victim_team", "phase"]).agg(num=("traded", "sum"), den=("traded", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "TRD-12", g["num"], g["den"], stratum=g["phase"])


# ============================================================ OPN
def _fb(ctx):
    """time-rounds com flags de first blood (got_fb / lost_fb)."""
    fb = ctx.first_kill[["match_id", "round_num", "killer_team", "victim_team", "t_ms", "n_assists", "traded",
                         "victim", "kill_idx"]]
    tr = ctx.tr.merge(fb, on=["match_id", "round_num"], how="inner")
    tr["got_fb"] = tr["killer_team"] == tr["team_id"]
    return tr


@metric("OPN-01", "ratio", "taxa", "Rounds em que o time fez a 1ª kill em adversário / rounds com kill.")
def opn01(ctx):
    d = _fb(ctx)
    return emit(d, "OPN-01", d["got_fb"].astype(float))


@metric("OPN-02", "ratio", "taxa de vitória", "Elegível: o time fez o first blood. Num: venceu o round.")
def opn02(ctx):
    d = _fb(ctx)
    d = d[d["got_fb"]]
    return emit(d, "OPN-02", d["won"].astype(float))


@metric("OPN-03", "ratio", "taxa de vitória", "Elegível: o time sofreu o first blood. Num: venceu o round.")
def opn03(ctx):
    d = _fb(ctx)
    d = d[~d["got_fb"]]
    return emit(d, "OPN-03", d["won"].astype(float))


@metric("OPN-04", "mean", "segundos", "Instante da 1ª kill em adversário (s desde o início do round). "
        "Estrato: 'fez' ou 'sofreu' o first blood.")
def opn04(ctx):
    d = _fb(ctx)
    return emit(d, "OPN-04", d["t_ms"] / 1000, stratum=np.where(d["got_fb"], "fez", "sofreu"))


@metric("OPN-05", "ratio", "taxa", "OPN-01 estratificado pelo lado do time (atk/def).")
def opn05(ctx):
    d = _fb(ctx)
    return emit(d, "OPN-05", d["got_fb"].astype(float), stratum=d["side"])


@metric("OPN-06", "ratio", "taxa", "OPN-01 estratificado pela economia relativa (muito_superior / moderado / equilibrado / muito_inferior).",
        params=("economy.big_gap", "economy.even_gap"))
def opn06(ctx):
    d = _fb(ctx)
    strat = np.where(d["is_pistol"], "pistol", d["econ_rel"])
    return emit(d, "OPN-06", d["got_fb"].astype(float), stratum=strat)


@metric("OPN-07", "ratio", "taxa", "Elegível: o time sofreu o first blood. Num: a 1ª morte foi trocada em ≤ janela.", params=TRADE)
def opn07(ctx):
    d = _fb(ctx)
    d = d[~d["got_fb"]]
    return emit(d, "OPN-07", d["traded"].astype(bool).astype(float))


@metric("OPN-08", "ratio", "taxa de derrota", "Elegível: o time fez o first blood. Num: perdeu o round. (Σnum = contagem.)")
def opn08(ctx):
    d = _fb(ctx)
    d = d[d["got_fb"]]
    return emit(d, "OPN-08", (~d["won"]).astype(float))


@metric("OPN-09", "mean", "segundos", "Após fazer o first blood (5v4), segundos até o time perder o 1º jogador. "
        "Rounds em que o time não perdeu ninguém ficam de fora (censurados).")
def opn09(ctx):
    d = _fb(ctx)
    d = d[d["got_fb"]][KEY + ["t_ms"]]
    deaths = ctx.deaths.rename(columns={"victim_team": "team_id", "t_ms": "t_death"})
    x = d.merge(deaths[["match_id", "round_num", "team_id", "t_death"]], on=KEY)
    x = x[x["t_death"] >= x["t_ms"]].groupby(KEY).agg(t_fb=("t_ms", "first"), t_death=("t_death", "min")).reset_index()
    return emit(x, "OPN-09", (x["t_death"] - x["t_fb"]) / 1000)


@metric("OPN-10", "ratio", "proporção", "Rounds em que o time sofreu ≥2 das primeiras `opening_kills` mortes do round "
        "com intervalo ≤ collapse_window entre elas.", params=("timing.opening_kills", "timing.collapse_window_s"))
def opn10(ctx):
    n_open = ctx.cfg["timing"]["opening_kills"]
    w = ctx.cfg["timing"]["collapse_window_s"] * 1000
    k = ctx.enemy_kills[ctx.enemy_kills["enemy_rank"] < n_open].sort_values(["match_id", "round_num", "victim_team", "t_ms"])
    k["gap"] = k.groupby(["match_id", "round_num", "victim_team"])["t_ms"].diff()
    hit = k[k["gap"] <= w][["match_id", "round_num", "victim_team"]].drop_duplicates().rename(columns={"victim_team": "team_id"})
    hit["c"] = 1.0
    d = _fb(ctx)[KEY].merge(hit, on=KEY, how="left")
    return emit(d, "OPN-10", d["c"].fillna(0))


@metric("OPN-11", "mean", "assistências", "Nº de assistentes registrados no first blood feito pelo time.")
def opn11(ctx):
    d = _fb(ctx)
    d = d[d["got_fb"]]
    return emit(d, "OPN-11", d["n_assists"])


@metric("OPN-12", "ratio", "proporção", "Elegível: o time sofreu o first blood (com snapshot). Num: a vítima não tinha aliado vivo "
        "a ≤ near_radius (proxy).", params=RADIUS)
def opn12(ctx):
    ds = ctx.death_space[ctx.death_space["enemy_rank"] == 0][["match_id", "round_num", "victim_team", "n_allies_near"]]
    ds = ds.rename(columns={"victim_team": "team_id"})
    return emit(ds, "OPN-12", (ds["n_allies_near"] == 0).astype(float))


# ------------------------------------------------------------ complementares (pedido do time, 21/10/2026)
@metric("OPN-13", "ratio", "taxa", "Elegível: o time fez o first blood. Num: o adversário trocou (matou quem fez o FB) em ≤ janela. "
        "É o espelho de OPN-07 do adversário.", params=TRADE)
def opn13(ctx):
    d = _fb(ctx)
    d = d[d["got_fb"]]
    return emit(d, "OPN-13", d["traded"].astype(bool).astype(float))


@metric("OPN-14", "ratio", "proporção", "Elegível: o time fez o first blood. Num: a kill teve ≥1 assistente registrado.")
def opn14(ctx):
    d = _fb(ctx)
    d = d[d["got_fb"]]
    return emit(d, "OPN-14", (d["n_assists"].fillna(0) >= 1).astype(float))


@metric("OPN-15", "ratio", "proporção", "Primeiro duelo sem cobertura (proxy, snapshot do first blood): estrato 'fez' = quem matou "
        "não tinha aliado vivo a ≤ near_radius; 'sofreu' = quem morreu não tinha (mesma regra de OPN-12). Só rounds com snapshot.",
        params=RADIUS)
def opn15(ctx):
    R = ctx.cfg["spatial"]["near_radius"]
    fk = ctx.first_kill[ctx.first_kill["snapshot_n"] > 0][["match_id", "round_num", "kill_idx", "killer", "killer_team", "victim",
                                                           "victim_team", "victim_x", "victim_y"]]
    kp = ctx.t["kill_positions"][["match_id", "round_num", "kill_idx", "puuid", "team_id", "x", "y"]]
    kxy = fk.merge(kp, left_on=["match_id", "round_num", "kill_idx", "killer"], right_on=["match_id", "round_num", "kill_idx", "puuid"])
    kxy = kxy[["match_id", "round_num", "kill_idx", "x", "y"]].rename(columns={"x": "px", "y": "py"})
    vxy = fk[["match_id", "round_num", "kill_idx", "victim_x", "victim_y"]].rename(columns={"victim_x": "px", "victim_y": "py"})
    out = []
    for who, team_col, person, xy in (("fez", "killer_team", "killer", kxy), ("sofreu", "victim_team", "victim", vxy)):
        base = fk[["match_id", "round_num", "kill_idx", team_col, person]].merge(xy, on=["match_id", "round_num", "kill_idx"])
        al = base.merge(kp, left_on=["match_id", "round_num", "kill_idx", team_col], right_on=["match_id", "round_num", "kill_idx", "team_id"])
        al = al[al["puuid"] != al[person]]
        al["near"] = np.hypot(al["x"] - al["px"], al["y"] - al["py"]) <= R
        near = al.groupby(["match_id", "round_num", "kill_idx"])["near"].any()
        b = base.set_index(["match_id", "round_num", "kill_idx"])
        b["covered"] = near.reindex(b.index).fillna(False).astype(bool)
        b = b.reset_index().rename(columns={team_col: "team_id"})
        out.append(emit(b, "OPN-15", (~b["covered"]).astype(float), stratum=who))
    return pd.concat(out, ignore_index=True)


@metric("TRD-13", "ratio", "taxa", "Trade sofrido: kills do time em adversários (em jogo) em que um aliado da vítima matou quem fez "
        "a kill em ≤ janela / kills do time. É o TRD-01 do adversário, visto do lado do time.", params=TRADE)
def trd13(ctx):
    k = ctx.enemy_kills
    g = k.groupby(["match_id", "round_num", "killer_team"]).agg(num=("traded", "sum"), den=("traded", "size")).reset_index()
    g = g.rename(columns={"killer_team": "team_id"})
    return emit(g, "TRD-13", g["num"], g["den"])


@metric("TRD-14", "ratio", "proporção", "Elegível: mortes do time sem trade em ≤ janela (com snapshot). Num: a vítima não tinha aliado "
        "vivo a ≤ near_radius (proxy). Responde quantas mortes sem trade eram isoladas.", params=TRADE + RADIUS)
def trd14(ctx):
    d = ctx.death_space[~ctx.death_space["traded"].astype(bool)]
    d = d.assign(isolated=(d["n_allies_near"] == 0).astype(float))
    g = _deaths_by_team(d, num=("isolated", "sum"), den=("isolated", "size"))
    return emit(g, "TRD-14", g["num"], g["den"])
