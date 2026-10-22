"""Lente: Composição de agentes (AGT).

Composição = os 5 characterId dos jogadores ativos (sem observadores) de cada time num mapa.
- chave canônica (`comp_key`): UUIDs ordenados; rótulo legível (`comp`): nomes dos agentes em ordem alfabética.
- nomes e funções vêm de um catálogo estático (`reference/agents_catalog.csv`), sem estatísticas externas.

Métricas de nível MAPA (uma composição por time-mapa) são emitidas na linha do round 0 do time; o filtro de lado
não se aplica a elas. Métricas que cruzam composição com eventos (AGT-11..19) são emitidas por time-round com
estrato = composição, e o lado/mapa ficam nas dimensões normais do agregado.
"""
from __future__ import annotations

from itertools import combinations

import numpy as np
import pandas as pd

from .base import KEY, emit, metric

ROLES = ["Duelista", "Iniciador", "Controlador", "Sentinela"]
TRADE = ("timing.trade_window_s",)


def _catalog(ctx) -> dict:
    if "_agent_catalog" not in ctx.__dict__:
        try:
            c = pd.read_csv(ctx.cfg.agents_catalog_path, sep=";")
            ctx.__dict__["_agent_catalog"] = {r.character_id.lower(): (r.agente, r.funcao) for r in c.itertuples()}
        except (FileNotFoundError, AttributeError):
            ctx.__dict__["_agent_catalog"] = {}
    return ctx.__dict__["_agent_catalog"]


def player_agents(ctx) -> pd.DataFrame:
    """Uma linha por jogador ativo × mapa: match_id, team_id, puuid, agent, role."""
    if "_player_agents" in ctx.__dict__:
        return ctx.__dict__["_player_agents"]
    cat = _catalog(ctx)
    p = ctx.t["players"]
    p = p[~p["is_observer"] & p["team_id"].isin(["Red", "Blue"]) & p["character_id"].notna()].copy()
    p["cid"] = p["character_id"].str.lower()
    p["agent"] = p["cid"].map(lambda c: cat.get(c, (c[:8], "?"))[0])
    p["role"] = p["cid"].map(lambda c: cat.get(c, (c[:8], "?"))[1])
    out = p[["match_id", "team_id", "team_name", "puuid", "cid", "agent", "role"]].reset_index(drop=True)
    ctx.__dict__["_player_agents"] = out
    return out


def compositions(ctx) -> pd.DataFrame:
    """Uma linha por time-mapa: composição, funções, ordem cronológica do time e composição do adversário."""
    if "_comps" in ctx.__dict__:
        return ctx.__dict__["_comps"]
    pa = player_agents(ctx)
    m = ctx.t["matches"][["match_id", "map_name", "game_start_ms"]]
    rows = []
    for (mid, tid), g in pa.groupby(["match_id", "team_id"], sort=False):
        agents = sorted(g["agent"])
        roles = g["role"].value_counts().to_dict()
        rows.append({"match_id": mid, "team_id": tid, "team_name": g["team_name"].iloc[0], "n": len(g),
                     "comp_key": "|".join(sorted(g["cid"])), "comp": " · ".join(agents), "agents": agents,
                     **{f"n_{r}": int(roles.get(r, 0)) for r in ROLES},
                     "players": dict(zip(g["puuid"], g["agent"]))})
    c = pd.DataFrame(rows).merge(m, on="match_id", how="left")
    c = c[c["n"] == 5].copy()  # composição só existe com 5 agentes válidos
    opp = c[["match_id", "team_id", "comp_key", "agents"]].copy()
    opp["team_id"] = opp["team_id"].map({"Red": "Blue", "Blue": "Red"})
    c = c.merge(opp.rename(columns={"comp_key": "opp_key", "agents": "opp_agents"}), on=["match_id", "team_id"], how="left")
    c = c.sort_values(["team_name", "game_start_ms"]).reset_index(drop=True)
    c["seq"] = c.groupby("team_name").cumcount()
    prev = c.groupby("team_name")[["agents", "players", "comp_key"]].shift(1)
    c["prev_agents"], c["prev_players"], c["prev_key"] = prev["agents"], prev["players"], prev["comp_key"]
    c["round_num"] = 0
    ctx.__dict__["_comps"] = c
    return c


def _round_comp(ctx) -> pd.DataFrame:
    """Time-rounds com o rótulo da composição do time."""
    c = compositions(ctx)[["match_id", "team_id", "comp"]]
    return ctx.tr.merge(c, on=["match_id", "team_id"], how="inner")


# ============================================================ inventário
@metric("AGT-01", "count", "mapas", "Composição exata: estrato = 5 agentes do time no mapa (ordem alfabética); conta time-mapas. "
        "Só times com 5 agentes válidos (sem observadores).", level="round")
def agt01(ctx):
    c = compositions(ctx)
    return emit(c, "AGT-01", 1.0, 1.0, stratum=c["comp"])


@metric("AGT-02", "count", "mapas", "Frequência da composição por mapa: mesmas linhas de AGT-01, lidas pela dimensão map_name "
        "(time-mapas por mapa × composição). Repetições do mesmo elenco não são amostras independentes.")
def agt02(ctx):
    c = compositions(ctx)
    return emit(c, "AGT-02", 1.0, 1.0, stratum=c["comp"])


@metric("AGT-03", "mean", "agentes por mapa", "Distribuição de funções: nº de agentes de cada função (catálogo estático) por time-mapa; "
        "estrato = função.")
def agt03(ctx):
    c = compositions(ctx)
    return pd.concat([emit(c, "AGT-03", c[f"n_{r}"], 1.0, stratum=r) for r in ROLES], ignore_index=True)


@metric("AGT-04", "ratio", "proporção de mapas", "Redundância de função: mapas com ≥ 2 agentes da mesma função. Sem estrato = qualquer função; "
        "estrato = função repetida.")
def agt04(ctx):
    c = compositions(ctx)
    anyr = (c[[f"n_{r}" for r in ROLES]] >= 2).any(axis=1)
    out = [emit(c, "AGT-04", anyr.astype(float))]
    out += [emit(c, "AGT-04", (c[f"n_{r}"] >= 2).astype(float), stratum=r) for r in ROLES]
    return pd.concat(out, ignore_index=True)


@metric("AGT-05", "ratio", "proporção", "Diversidade: composições distintas / mapas da equipe. Por mapa: 1 se a composição aparece pela "
        "primeira vez na sequência cronológica da equipe, 0 se repete — a soma dá o nº de composições distintas.")
def agt05(ctx):
    c = compositions(ctx)
    first = ~c.duplicated(["team_name", "comp_key"])
    return emit(c, "AGT-05", first.astype(float))


@metric("AGT-06", "mean", "índice de Jaccard", "Permanência: |C_atual ∩ C_anterior| / |C_atual ∪ C_anterior| entre mapas consecutivos "
        "da equipe (ordem por gameStartMillis). O 1º mapa da equipe não entra.")
def agt06(ctx):
    c = compositions(ctx)
    c = c[c["prev_agents"].notna()]
    j = [len(set(a) & set(b)) / len(set(a) | set(b)) for a, b in zip(c["agents"], c["prev_agents"])]
    return emit(c, "AGT-06", j)


@metric("AGT-07", "ratio", "proporção de jogadores", "Troca de agente: entre mapas consecutivos da equipe, jogadores presentes nos dois "
        "mapas que mudaram de agente / jogadores presentes nos dois. Substituição de jogador não conta como troca.")
def agt07(ctx):
    c = compositions(ctx)
    c = c[c["prev_players"].notna()]
    num, den = [], []
    for cur, prev in zip(c["players"], c["prev_players"]):
        common = set(cur) & set(prev)
        den.append(len(common))
        num.append(sum(cur[p] != prev[p] for p in common))
    return emit(c, "AGT-07", num, den)


@metric("AGT-08", "ratio", "proporção de mapas", "Composição espelhada: 1 se as chaves canônicas dos dois times no mapa são iguais.")
def agt08(ctx):
    c = compositions(ctx)
    c = c[c["opp_key"].notna()]
    return emit(c, "AGT-08", (c["comp_key"] == c["opp_key"]).astype(float))


@metric("AGT-09", "ratio", "proporção", "Sobreposição adversária: agentes em comum com o adversário / 5.")
def agt09(ctx):
    c = compositions(ctx)
    c = c[c["opp_agents"].notna()]
    return emit(c, "AGT-09", [len(set(a) & set(b)) for a, b in zip(c["agents"], c["opp_agents"])], 5.0)


@metric("AGT-10", "count", "mapas", "Duplas e trios recorrentes: para cada time-mapa, conta cada par e trio de agentes da composição. "
        "Estrato 'dupla: A + B' ou 'trio: A + B + C'.")
def agt10(ctx):
    c = compositions(ctx)
    rows = []
    for r in c.itertuples():
        for k, tag in ((2, "dupla"), (3, "trio")):
            for combo in combinations(r.agents, k):
                rows.append((r.match_id, 0, r.team_id, f"{tag}: {' + '.join(combo)}"))
    d = pd.DataFrame(rows, columns=KEY + ["s"])
    return emit(d, "AGT-10", 1.0, 1.0, stratum=d["s"])


# ============================================================ resultados por composição
@metric("AGT-11", "ratio", "taxa de vitória", "Rounds vencidos / disputados, estrato = composição. Uma composição dura o mapa inteiro.")
def agt11(ctx):
    d = _round_comp(ctx)
    return emit(d, "AGT-11", d["won"].astype(float), stratum=d["comp"])


@metric("AGT-12", "ratio", "taxa de vitória", "AGT-11 lida por lado (dimensão side do agregado): rounds vencidos em ataque e em defesa por composição.")
def agt12(ctx):
    d = _round_comp(ctx)
    return emit(d, "AGT-12", d["won"].astype(float), stratum=d["comp"])


@metric("AGT-13", "ratio", "taxa de vitória", "AGT-11 lida por mapa (dimensão map_name): vitórias de rounds por (mapa, composição).")
def agt13(ctx):
    d = _round_comp(ctx)
    return emit(d, "AGT-13", d["won"].astype(float), stratum=d["comp"])


@metric("AGT-14", "ratio", "taxa de vitória", "Rounds em que a composição fez o first blood (kill em inimigo, em jogo): vitórias / rounds.")
def agt14(ctx):
    fb = ctx.first_kill[["match_id", "round_num", "killer_team"]].rename(columns={"killer_team": "team_id"})
    d = _round_comp(ctx).merge(fb, on=KEY, how="inner")
    return emit(d, "AGT-14", d["won"].astype(float), stratum=d["comp"])


@metric("AGT-15", "ratio", "taxa", "Mortes do time trocadas em ≤ janela / mortes por inimigo, estrato = composição (mesma regra de TRD-01).",
        params=TRADE)
def agt15(ctx):
    k = ctx.enemy_kills.groupby(["match_id", "round_num", "victim_team"]).agg(num=("traded", "sum"), den=("traded", "size"))
    k = k.reset_index().rename(columns={"victim_team": "team_id"})
    d = _round_comp(ctx)[KEY + ["comp"]].merge(k, on=KEY, how="inner")
    return emit(d, "AGT-15", d["num"].astype(float), d["den"], stratum=d["comp"])


@metric("AGT-16", "ratio", "taxa", "Atacantes que plantaram: vitórias / plants, estrato = composição (mesma regra de POS-01).")
def agt16(ctx):
    d = _round_comp(ctx)
    d = d[d["has_plant"] & (d["side"] == "atk")]
    return emit(d, "AGT-16", d["won"].astype(float), stratum=d["comp"])


@metric("AGT-17", "ratio", "taxa", "Defensores com plant adversário: defuses / plants sofridos, estrato = composição (regra de RET-01).")
def agt17(ctx):
    d = _round_comp(ctx)
    d = d[d["has_plant"] & (d["side"] == "def")]
    return emit(d, "AGT-17", (d["defuser_team"] == d["team_id"]).astype(float), stratum=d["comp"])


@metric("AGT-18", "ratio", "taxa de vitória", "Win rate por composição dentro de faixas de Σloadout time / adversário (inferior < 0,67 ≤ "
        "equilibrada ≤ 1,5 < superior). Estrato 'faixa | composição'. Pistols fora.", params=("composition.loadout_ratio_bands",))
def agt18(ctx):
    lo, hi = ctx.cfg["composition"]["loadout_ratio_bands"]
    d = _round_comp(ctx)
    d = d[~d["is_pistol"] & (d["opp_loadout"] > 0)]
    ratio = d["team_loadout"] / d["opp_loadout"]
    band = np.where(ratio < lo, "inferior", np.where(ratio > hi, "superior", "equilibrada"))
    return emit(d, "AGT-18", d["won"].astype(float), stratum=pd.Series(band, index=d.index) + " | " + d["comp"])


@metric("AGT-19", "count", "plants", "Plants por site e composição: estrato 'composição | site'.")
def agt19(ctx):
    d = _round_comp(ctx)
    d = d[d["has_plant"] & (d["side"] == "atk")]
    return emit(d, "AGT-19", 1.0, 1.0, stratum=d["comp"] + " | " + d["plant_site"].fillna("?"))


# ============================================================ combinações de agentes
@metric("AGT-20", "ratio", "taxa", "Trade por par de agentes (proxy): para cada morte por inimigo com snapshot, cada aliado vivo B forma o par "
        "(agente da vítima, agente de B). Num: B fez a troca em ≤ janela. Estrato 'A + B' (ordem alfabética).", params=TRADE)
def agt20(ctx):
    pa = player_agents(ctx)[["match_id", "puuid", "agent"]]
    k = ctx.enemy_kills[ctx.enemy_kills["snapshot_n"] > 0][["match_id", "round_num", "kill_idx", "victim", "victim_team", "trader"]]
    kp = ctx.t["kill_positions"][["match_id", "round_num", "kill_idx", "puuid", "team_id"]]
    a = k.merge(kp, left_on=["match_id", "round_num", "kill_idx", "victim_team"], right_on=["match_id", "round_num", "kill_idx", "team_id"])
    a = a[a["puuid"] != a["victim"]]
    a = a.merge(pa.rename(columns={"puuid": "victim", "agent": "va"}), on=["match_id", "victim"])
    a = a.merge(pa.rename(columns={"agent": "ba"}), on=["match_id", "puuid"])
    a["pair"] = [" + ".join(sorted((x, y))) for x, y in zip(a["va"], a["ba"])]
    a["hit"] = (a["trader"] == a["puuid"]).astype(float)
    g = a.groupby(["match_id", "round_num", "victim_team", "pair"]).agg(num=("hit", "sum"), den=("hit", "size")).reset_index()
    g = g.rename(columns={"victim_team": "team_id"})
    return emit(g, "AGT-20", g["num"], g["den"], stratum=g["pair"])


@metric("AGT-21", "count", "first bloods", "First blood (kill em inimigo, em jogo) com assistência: conta cada par 'agente que matou ← agente que "
        "assistiu'. Assistência não diz qual habilidade a gerou.")
def agt21(ctx):
    pa = player_agents(ctx)[["match_id", "puuid", "agent"]]
    fk = ctx.first_kill[ctx.first_kill["n_assists"] > 0][["match_id", "round_num", "killer", "killer_team", "assistants"]].copy()
    fk["assist"] = fk["assistants"].str.split(",")
    fk = fk.explode("assist")
    fk = fk.merge(pa.rename(columns={"puuid": "killer", "agent": "ka"}), on=["match_id", "killer"])
    fk = fk.merge(pa.rename(columns={"puuid": "assist", "agent": "aa"}), on=["match_id", "assist"])
    fk["team_id"] = fk["killer_team"]
    return emit(fk, "AGT-21", 1.0, 1.0, stratum=fk["ka"] + " ← " + fk["aa"])


@metric("AGT-22", "mean", "cm", "Proximidade entre funções (proxy): nos snapshots de kill, distância média entre aliados vivos de funções "
        "diferentes. Estrato = par de funções. Snapshots não dão trajetória nem visão.")
def agt22(ctx):
    pa = player_agents(ctx)[["match_id", "puuid", "role"]]
    s = ctx.snapshot_full.merge(pa, on=["match_id", "puuid"])
    rows = []
    for (mid, rn, ki, tid), g in s.groupby(["match_id", "round_num", "kill_idx", "team_id"], sort=False):
        if len(g) < 2:
            continue
        xy, rl = g[["x", "y"]].to_numpy(float), g["role"].to_numpy()
        for i, j in combinations(range(len(g)), 2):
            if rl[i] != rl[j]:
                rows.append((mid, rn, tid, "–".join(sorted((rl[i], rl[j]))), float(np.hypot(*(xy[i] - xy[j])))))
    d = pd.DataFrame(rows, columns=KEY + ["pair", "d"])
    g = d.groupby(KEY + ["pair"]).agg(num=("d", "sum"), den=("d", "size")).reset_index()
    return emit(g, "AGT-22", g["num"], g["den"], stratum=g["pair"])


@metric("AGT-23", "count", "eventos", "Papéis operacionais observados: por agente, nº de first kills, plants, defuses e kills de troca do time. "
        "Estrato 'evento | agente'. Nenhum papel é obrigação tática.")
def agt23(ctx):
    pa = player_agents(ctx)[["match_id", "puuid", "agent"]]
    fk = ctx.first_kill[["match_id", "round_num", "killer", "killer_team"]].rename(columns={"killer": "puuid", "killer_team": "team_id"})
    fk["ev"] = "first kill"
    tr = ctx.enemy_kills[ctx.enemy_kills["traded"] == True][["match_id", "round_num", "trader", "victim_team"]]  # noqa: E712
    tr = tr.rename(columns={"trader": "puuid", "victim_team": "team_id"})
    tr["ev"] = "trade"
    r = ctx.t["rounds"]
    pl = r[r["has_plant"]][["match_id", "round_num", "planter", "planter_team"]].rename(columns={"planter": "puuid", "planter_team": "team_id"})
    pl["ev"] = "plant"
    df = r[r["has_defuse"]][["match_id", "round_num", "defuser", "defuser_team"]].rename(columns={"defuser": "puuid", "defuser_team": "team_id"})
    df["ev"] = "defuse"
    e = pd.concat([fk, tr, pl, df], ignore_index=True).merge(pa, on=["match_id", "puuid"])
    return emit(e, "AGT-23", 1.0, 1.0, stratum=e["ev"] + " | " + e["agent"])
