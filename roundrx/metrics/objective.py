"""Lentes: Retake/recuperação defensiva (RET) e After-plant (POS)."""
import numpy as np
import pandas as pd

from .base import KEY, emit, metric


def _planted(ctx, side):
    """Time-rounds com plant, na perspectiva do lado pedido (atk = quem plantou; def = quem defende)."""
    tr = ctx.tr[ctx.tr["has_plant"]]
    tr = tr[tr["side"] == side]
    return tr.merge(ctx.alive_plant[KEY + ["alive", "opp_alive", "diff"]], on=KEY, how="left")


def _post_plant_kills(ctx):
    k = ctx.kills.merge(ctx.t["rounds"][["match_id", "round_num", "plant_time_ms", "atk_team", "def_team", "planter"]],
                        on=["match_id", "round_num"])
    return k[k["plant_time_ms"].notna() & (k["t_ms"] > k["plant_time_ms"])]


# ============================================================ RET
@metric("RET-01", "ratio", "taxa", "Defensores em rounds com plant adversário: defuses / plants sofridos.")
def ret01(ctx):
    d = _planted(ctx, "def")
    return emit(d, "RET-01", (d["defuser_team"] == d["team_id"]).astype(float))


@metric("RET-02", "ratio", "taxa", "RET-01 estratificado por bombsite (mapa está nas dimensões do agregado).")
def ret02(ctx):
    d = _planted(ctx, "def")
    return emit(d, "RET-02", (d["defuser_team"] == d["team_id"]).astype(float), stratum=d["plant_site"].fillna("?"))


@metric("RET-03", "ratio", "taxa", "RET-01 estratificado pela diferença de vivos no plant (defensores − atacantes).")
def ret03(ctx):
    d = _planted(ctx, "def")
    return emit(d, "RET-03", (d["defuser_team"] == d["team_id"]).astype(float),
                stratum=d["diff"].astype(int).map(lambda x: f"{x:+d}"))


@metric("RET-04", "ratio", "taxa", "Elegível: defensores em inferioridade numérica no plant. Num: defuse. (Σnum = contagem.)")
def ret04(ctx):
    d = _planted(ctx, "def")
    d = d[d["diff"] < 0]
    return emit(d, "RET-04", (d["defuser_team"] == d["team_id"]).astype(float))


@metric("RET-05", "mean", "segundos", "defuseRoundTime − plantRoundTime em rounds com defuse do time.")
def ret05(ctx):
    d = _planted(ctx, "def")
    d = d[d["defuser_team"] == d["team_id"]]
    return emit(d, "RET-05", (d["defuse_time_ms"] - d["plant_time_ms"]) / 1000)


def _final_diff(ctx, d):
    """Saldo de vivos (time − adversário) no último abate/revive do round; mortes pela explosão da spike não entram
    (não estão em round_events). Sem nenhum evento depois do plant, vale o saldo do plant."""
    last = ctx.diff_timeline.groupby(KEY)[["diff", "alive"]].last().reset_index().rename(columns={"diff": "end_diff", "alive": "end_alive"})
    d = d.merge(last, on=KEY, how="left")
    d["end_diff"] = d["end_diff"].fillna(d["diff"])
    d["end_alive"] = d["end_alive"].fillna(d["alive"])
    return d


@metric("RET-11", "mean", "jogadores", "Plants sofridos: saldo de vivos (defensores − atacantes) no fim do round, antes de qualquer morte "
        "pela explosão da spike. Estrato: 'defusou' ou 'não defusou'.")
def ret11(ctx):
    d = _final_diff(ctx, _planted(ctx, "def"))
    st = np.where(d["defuser_team"] == d["team_id"], "defusou", "não defusou")
    return emit(d, "RET-11", d["end_diff"], stratum=st)


@metric("RET-12", "ratio", "proporção", "Plants sofridos em que o retake foi abandonado: a spike explodiu e (a) nenhum defensor matou ou "
        "morreu em combate depois do plant ('sem combate') ou (b) houve combate, mas algum defensor sobreviveu à explosão, isto é, "
        "guardou a arma ('abandono parcial'). Explosões com combate em que os defensores restantes morreram na explosão contam "
        "como tentativa até o fim e ficam fora. Outra divisão, que também soma o total: 'guardou arma' × 'morreu para a spike'.")
def ret12(ctx):
    d = _final_diff(ctx, _planted(ctx, "def"))
    k = _post_plant_kills(ctx)
    fought = k[(k["kill_type"] == "enemy") & k["in_play"] & ((k["killer_team"] == k["def_team"]) | (k["victim_team"] == k["def_team"]))]
    fought = set(zip(fought["match_id"], fought["round_num"]))
    kb = ctx.t["kills"]
    bomb = kb[kb["kill_type"] == "bomb"].groupby(["match_id", "round_num", "victim_team"]).size().rename("bomb_deaths").reset_index()
    d = d.merge(bomb.rename(columns={"victim_team": "team_id"}), on=KEY, how="left")
    d["bomb_deaths"] = d["bomb_deaths"].fillna(0)
    detonated = (d["result"] == "Bomb detonated").to_numpy()
    no_fight = np.array([(m, rn) not in fought for m, rn in zip(d["match_id"], d["round_num"])])
    saved = ((d["end_alive"] - d["bomb_deaths"]) > 0).to_numpy()
    # explosão sem combate (não tentou) ou com algum defensor guardando a arma (abandono parcial); explosão com combate em
    # que os defensores restantes morreram na explosão = tentaram até o fim, não conta
    abandoned = detonated & (no_fight | saved)
    parts = [emit(d, "RET-12", abandoned.astype(float))]
    for st, mask in (("sem combate", no_fight), ("abandono parcial", ~no_fight), ("guardou arma", saved), ("morreu para a spike", ~saved)):
        parts.append(emit(d, "RET-12", (abandoned & mask).astype(float), stratum=st))
    return pd.concat(parts, ignore_index=True)


@metric("RET-06", "mean", "segundos", "Tempo do plant até a 1ª kill pós-plant envolvendo um defensor (killer ou vítima). "
        "Rounds sem contato pós-plant ficam de fora.")
def ret06(ctx):
    k = _post_plant_kills(ctx)
    k = k[(k["killer_team"] == k["def_team"]) | (k["victim_team"] == k["def_team"])]
    first = k.sort_values("t_ms").groupby(["match_id", "round_num"]).first().reset_index()
    first["team_id"] = first["def_team"]
    return emit(first, "RET-06", (first["t_ms"] - first["plant_time_ms"]) / 1000)


@metric("RET-07", "ratio", "taxa de trade", "Mortes de defensores pós-plant trocadas em ≤ trade_window / mortes elegíveis.",
        params=("timing.trade_window_s",))
def ret07(ctx):
    k = ctx.enemy_kills
    k = k[k["post_plant"] & (k["victim_team"] != k["atk_team"])]
    g = k.groupby(["match_id", "round_num", "victim_team"]).agg(num=("traded", "sum"), den=("traded", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "RET-07", g["num"], g["den"])


@metric("RET-08", "mean", "cm", "Distância média entre pares de defensores vivos no snapshot do plant (proxy).")
def ret08(ctx):
    d = _planted(ctx, "def").merge(ctx.plant_space, on=KEY)
    return emit(d, "RET-08", d["dispersion"])


@metric("RET-09", "mean", "cm", "Distância média de cada defensor vivo à spike no snapshot do plant (proxy).")
def ret09(ctx):
    d = _planted(ctx, "def").merge(ctx.plant_space, on=KEY)
    return emit(d, "RET-09", d["mean_d_spike"])


@metric("RET-10", "ratio", "proporção", "Elegível: defuses do time. Num: defensores sem nenhuma kill após o plant.")
def ret10(ctx):
    d = _planted(ctx, "def")
    d = d[d["defuser_team"] == d["team_id"]]
    k = _post_plant_kills(ctx)
    killers = k[k["killer_team"] == k["def_team"]].groupby(["match_id", "round_num"]).size().rename("n")
    d = d.merge(killers.reset_index(), on=["match_id", "round_num"], how="left")
    return emit(d, "RET-10", d["n"].isna().astype(float))


# ============================================================ POS
@metric("POS-01", "ratio", "taxa", "Atacantes: vitórias / rounds em que plantaram.")
def pos01(ctx):
    d = _planted(ctx, "atk")
    return emit(d, "POS-01", d["won"].astype(float))


@metric("POS-02", "ratio", "taxa", "POS-01 estratificado por bombsite.")
def pos02(ctx):
    d = _planted(ctx, "atk")
    return emit(d, "POS-02", d["won"].astype(float), stratum=d["plant_site"].fillna("?"))


@metric("POS-03", "mean", "segundos", "plantRoundTime: segundos de jogo no round, como o JSON registra.")
def pos03(ctx):
    d = _planted(ctx, "atk")
    return emit(d, "POS-03", d["plant_time_ms"] / 1000)


@metric("POS-04", "mean", "jogadores", "Vivos atacantes − vivos defensores no instante do plant.")
def pos04(ctx):
    d = _planted(ctx, "atk")
    return emit(d, "POS-04", d["diff"])


@metric("POS-05", "ratio", "taxa", "Elegível: plant com vantagem (+1, +2…). Num: venceu. Estrato = vantagem.")
def pos05(ctx):
    d = _planted(ctx, "atk")
    d = d[d["diff"] > 0]
    return emit(d, "POS-05", d["won"].astype(float), stratum=d["diff"].astype(int).map(lambda x: f"{x:+d}"))


@metric("POS-06", "ratio", "taxa", "Elegível: plant em inferioridade (−1, −2…). Num: venceu. Estrato = desvantagem.")
def pos06(ctx):
    d = _planted(ctx, "atk")
    d = d[d["diff"] < 0]
    return emit(d, "POS-06", d["won"].astype(float), stratum=d["diff"].astype(int).map(lambda x: f"{x:+d}"))


@metric("POS-07", "ratio", "proporção", "Elegível: rounds com plant do time e ≥1 morte pós-plant. "
        "Num: a 1ª morte pós-plant foi de um atacante (o time sofreu a 1ª perda).")
def pos07(ctx):
    k = _post_plant_kills(ctx)
    first = k.sort_values("t_ms").groupby(["match_id", "round_num"]).first().reset_index()
    first["team_id"] = first["atk_team"]
    return emit(first, "POS-07", (first["victim_team"] == first["atk_team"]).astype(float))


@metric("POS-13", "mean", "segundos", "Tempo do plant do time até a 1ª kill pós-plant (primeiro contato com os defensores, "
        "seja quem for que abata). Rounds sem contato pós-plant ficam de fora. É o RET-06 visto do lado de quem plantou.")
def pos13(ctx):
    k = _post_plant_kills(ctx)
    k = k[(k["killer_team"] == k["def_team"]) | (k["victim_team"] == k["def_team"])]
    first = k.sort_values("t_ms").groupby(["match_id", "round_num"]).first().reset_index()
    first["team_id"] = first["atk_team"]
    return emit(first, "POS-13", (first["t_ms"] - first["plant_time_ms"]) / 1000)


@metric("POS-14", "ratio", "proporção", "Plants do time feitos em inferioridade numérica (menos vivos que o adversário no instante do plant) / plants.")
def pos14(ctx):
    d = _planted(ctx, "atk")
    return emit(d, "POS-14", (d["diff"] < 0).astype(float))


@metric("POS-08", "mean", "mortes", "Mortes atacantes nos primeiros N s após o plant (N em post_plant_windows_s).",
        params=("timing.post_plant_windows_s",))
def pos08(ctx):
    d = _planted(ctx, "atk")
    k = _post_plant_kills(ctx)
    k = k[k["victim_team"] == k["atk_team"]]
    out = []
    for w in ctx.cfg["timing"]["post_plant_windows_s"]:
        kk = k[k["t_ms"] - k["plant_time_ms"] <= w * 1000].groupby(["match_id", "round_num"]).size().rename("n")
        dd = d.merge(kk.reset_index(), on=["match_id", "round_num"], how="left")
        out.append(emit(dd, "POS-08", dd["n"].fillna(0), stratum=f"{w}s"))
    return pd.concat(out, ignore_index=True)


@metric("POS-09", "ratio", "taxa de trade", "Mortes de atacantes pós-plant trocadas em ≤ trade_window / mortes elegíveis.",
        params=("timing.trade_window_s",))
def pos09(ctx):
    k = ctx.enemy_kills
    k = k[k["post_plant"] & (k["victim_team"] == k["atk_team"])]
    g = k.groupby(["match_id", "round_num", "victim_team"]).agg(num=("traded", "sum"), den=("traded", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "POS-09", g["num"], g["den"])


@metric("POS-10", "ratio", "proporção", "Elegível: rounds com plant do time. Num: perdeu ≥2 jogadores pós-plant em ≤ collapse_window.",
        params=("timing.collapse_window_s",))
def pos10(ctx):
    d = _planted(ctx, "atk")
    k = _post_plant_kills(ctx)
    k = k[k["victim_team"] == k["atk_team"]].sort_values(["match_id", "round_num", "t_ms"])
    k["gap"] = k.groupby(["match_id", "round_num"])["t_ms"].diff()
    hit = k[k["gap"] <= ctx.cfg["timing"]["collapse_window_s"] * 1000][["match_id", "round_num"]].drop_duplicates()
    hit["c"] = 1.0
    d = d.merge(hit, on=["match_id", "round_num"], how="left")
    return emit(d, "POS-10", d["c"].fillna(0))


@metric("POS-11", "mean", "cm", "Distância média entre pares de atacantes no snapshot do plant (proxy).")
def pos11(ctx):
    d = _planted(ctx, "atk").merge(ctx.plant_space, on=KEY)
    return emit(d, "POS-11", d["dispersion"])


@metric("POS-12", "ratio", "proporção", "Elegível: rounds com plant do time. Num: o planter não morreu após o plant.")
def pos12(ctx):
    d = _planted(ctx, "atk")
    k = _post_plant_kills(ctx)
    dead = k[k["victim"] == k["planter"]][["match_id", "round_num"]].drop_duplicates()
    dead["dead"] = 1.0
    d = d.merge(dead, on=["match_id", "round_num"], how="left")
    return emit(d, "POS-12", 1 - d["dead"].fillna(0))
