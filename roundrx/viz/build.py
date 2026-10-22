"""Gera o painel interativo (um único HTML, offline) a partir das saídas do pipeline.

    python -m roundrx viz     ->  outputs/dashboard/roundrx_painel.html

O HTML embute: dados (JSON compacto), d3 (vendor/d3.min.js, licença ISC) e o app (app.js/app.css).
Todos os números exibidos vêm de outputs/metrics e outputs/derived — nada é calculado "à mão" no HTML
além de somas Σnum/Σden (a mesma regra de agregação do pipeline).
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent

# Direção "boa" de cada métrica: +1 maior é melhor, -1 menor é melhor, 0 neutra/contextual.
POLARITY = {
    "ECO-09": 1, "ECO-10": -1, "ECO-11": 1,
    "RET-01": 1, "RET-02": 1, "RET-03": 1, "RET-04": 1, "RET-07": 1,
    "POS-01": 1, "POS-02": 1, "POS-04": 1, "POS-05": 1, "POS-06": 1, "POS-07": -1, "POS-08": -1, "POS-09": 1,
    "POS-10": -1, "POS-12": 1,
    "TRD-01": 1, "TRD-02": -1, "TRD-03": -1, "TRD-05": 1, "TRD-06": 1, "TRD-07": -1, "TRD-08": -1, "TRD-09": 1,
    "TRD-12": 1, "SPC-10": 1, "SPC-08": -1,
    "OPN-01": 1, "OPN-02": 1, "OPN-03": 1, "OPN-05": 1, "OPN-06": 1, "OPN-07": 1, "OPN-08": -1, "OPN-09": 1,
    "OPN-10": -1, "OPN-11": 0, "OPN-12": -1,
    "KEY-01": 1, "KEY-02": 1, "KEY-03": 1, "KEY-06": 1, "KEY-07": 1, "KEY-08": -1, "KEY-09": 1, "KEY-10": 1,
    "KEY-11": 1, "KEY-12": 1, "KEY-13": 1, "KEY-14": 1,
    "DYN-01": 1, "DYN-02": 1, "DYN-03": 1, "DYN-04": -1, "DYN-05": -1, "DYN-06": 1, "DYN-08": -1,
    "DYN-09": 1, "DYN-10": 1, "DYN-11": -1, "DYN-12": 1, "DYN-13": 1, "OPN-13": -1, "OPN-14": 0, "OPN-15": -1,
    "KEY-15": 1, "KEY-16": 1, "ECO-13": 1, "TRD-13": -1, "TRD-14": -1, "POS-14": 0, "RET-11": 1, "RET-12": -1,
    "AGT-11": 1, "AGT-12": 1, "AGT-13": 1, "AGT-14": 1, "AGT-15": 1, "AGT-16": 1, "AGT-17": 1, "AGT-18": 1, "AGT-20": 1,
    "HAL-02": 1, "HAL-03": 1, "HAL-04": 1, "HAL-05": 1, "HAL-07": -1, "HAL-09": 1, "HAL-11": 1, "HAL-12": 1,
    "HAL-16": -1, "HAL-17": 1,
    "LEV-04": 0, "LEV-06": 0, "LEV-07": 0, "LEV-08": 1, "LEV-09": 1, "LEV-10": 1, "LEV-11": 0, "LEV-12": 1, "LEV-13": 1,
    "LEV-14": 1, "LEV-15": 1, "LEV-16": 1, "LEV-17": 1, "LEV-18": 1,
}
# Navegação lateral: (id, rótulo, lente do dicionário, grupo). Os grupos são categorias maiores que reúnem as seções.
def _ids(prefix, nums):
    return [f"{prefix}-{n:02d}" for n in nums]


G2, G3, G4 = ("Trade kill", "Pós-plant", "Retake")
# Seções do painel nas categorias definidas pelo time (21–22/10/2026; Vantagem e First blood viraram categorias próprias): (id, rótulo, métricas na ordem de exibição, grupo).
# Uma métrica aparece numa seção só; o lugar dela no dicionário (lente) não muda.
# Fora do painel por decisão do time (21–22/10/2026), mas ainda calculadas nas tabelas de saída: DYN-01, DYN-02, DYN-04, DYN-05, DYN-12, DYN-13,
# OPN-08, OPN-09, OPN-11, ECO-01, ECO-04, ECO-05, ECO-07, ECO-08, ECO-09, ECO-10, TRD-02, TRD-03, TRD-05, TRD-07, TRD-09, TRD-11,
# KEY-02..05, KEY-07, KEY-08, KEY-10..14, POS-08..12, RET-08, RET-09, SPC-01..07, SPC-09, ECO-02, ECO-03, ECO-06, ECO-11, ECO-12,
# HAL-01..18 (22/10/2026: a página de início de half é feita das sequências de rounds), DYN-06..08 (dano e consistência, 22/10/2026), as métricas LEV-01..18 (22/10/2026: a página de pressão usa os campos li/wp/wm/pp/lq de R;
# as médias de pressão não são estáveis por time e as ponderadas repetem a taxa de vitória) e toda a composição de agentes (AGT).
SECTIONS = [
    ("home", "Panorama", None, "Início"),
    ("overview", "Partida", None, "Início"),
    ("diag", "Fundamentos", None, "Diagnóstico"),   # rota das telas de padrão e de round (fora da barra lateral)
    ("ADV", "Vantagem", _ids("DYN", [9, 10, 3, 11]) + ["ECO-13"], "Vantagem"),
    ("FB", "First blood", _ids("OPN", [1, 2, 3, 4, 7, 13, 14, 15, 10, 12, 5, 6]), "First blood"),
    ("TRD", "Trade kill", _ids("TRD", [1, 13, 14, 8, 4, 6, 12]) + _ids("SPC", [8, 10]), G2),
    ("POS", "Pós-plant", _ids("POS", [1, 4, 14, 7, 3, 13, 2, 5, 6]), G3),
    ("RET", "Retake", _ids("RET", [1, 4, 11, 12, 7, 5, 6, 10, 2, 3]), G4),
    ("KEY", "Rounds-chave", _ids("KEY", [1, 15, 6, 9, 16]), "Rounds-chave"),
    ("HAL", "Início de half", [], "Início de half"),   # página própria: sequências pistol → round 2 → round 3 (campos de R)
    # página própria (curva do mapa, onde o time perde mapas, vitória sob pressão), calculada dos campos de pressão em R
    ("LEV", "Pressão", [], "Pressão"),
    ("REV", "Round", [], "Diagnóstico"),   # tela de um round (aberta da Partida, do padrão ou da faixa de rounds); fora da barra lateral
]
FB_ROUND_CUT = ["OPN-01", "OPN-02", "OPN-03", "OPN-04", "OPN-07", "OPN-10", "OPN-12", "OPN-13", "OPN-14", "OPN-15"]
TABLE_EXCLUDE = {"TRD-04", "SPC-08"}  # exibidas em visualizações próprias (matriz de duplas, mapa)
BUY = {"pistol": 0, "eco": 1, "half": 2, "full": 3}
RESULT = {"Eliminated": 0, "Bomb defused": 1, "Bomb detonated": 2, "Round timer expired": 3}
CEREMONY = ["CeremonyDefault", "CeremonyFlawless", "CeremonyCloser", "CeremonyClutch", "CeremonyThrifty",
            "CeremonyTeamAce", "CeremonyAce"]


def _r(x, nd=4):
    """Números para o JSON: inteiros saem sem casa decimal (payload menor)."""
    out = []
    for v in x:
        if v is None or (isinstance(v, float) and not np.isfinite(v)) or pd.isna(v):
            out.append(None)
            continue
        f = round(float(v), nd)
        out.append(int(f) if f == int(f) else f)
    return out


def _rle(vals) -> dict:
    """Run-length: colunas ordenadas (time, partida, lado) viram pares valor × repetições; o painel expande."""
    v, c = [], []
    for x in vals:
        if v and v[-1] == x:
            c[-1] += 1
        else:
            v.append(x)
            c.append(1)
    return {"rle": [v, c]}


def _i(x):
    return [None if pd.isna(v) else int(v) for v in x]


def build_payload(out: Path, cfg) -> dict:
    rd = lambda rel: pd.read_parquet(out / f"{rel}.parquet")  # noqa: E731
    matches = rd("canonical/matches").sort_values(["date", "game_start_ms"]).reset_index(drop=True)
    tr = rd("derived/team_rounds")
    tm = rd("metrics/metrics_team_match")
    team_lvl = rd("metrics/metrics_team")
    kills = rd("canonical/kills")
    kpos = rd("canonical/kill_positions")
    trades = rd("derived/trades")
    rounds = rd("canonical/rounds")
    players = rd("canonical/players")
    catalog = pd.read_csv(out / "metrics" / "metrics_catalog.csv")
    status = pd.read_csv(out / "coverage" / "metrics_status.csv").set_index("id")["status"]
    run_info = json.loads((out / "run_manifest.json").read_text(encoding="utf-8"))

    team_names = sorted(set(matches["red_name"]) | set(matches["blue_name"]))
    tix = {n: i for i, n in enumerate(team_names)}
    mix = {m: i for i, m in enumerate(matches["match_id"])}
    side_name = {(r.match_id, "Red"): r.red_name for r in matches.itertuples()}
    side_name.update({(r.match_id, "Blue"): r.blue_name for r in matches.itertuples()})

    def team_idx(mid_series, tid_series):
        return [tix[side_name[(m, t)]] if (m, t) in side_name else None for m, t in zip(mid_series, tid_series)]

    # ---- jogadores (nome curto, sem tag)
    pl = players[~players["is_observer"]]
    pu = sorted(pl["puuid"].unique())
    pix = {p: i for i, p in enumerate(pu)}
    pname = pl.groupby("puuid")["riot_id"].agg(lambda s: s.value_counts().index[0].split("#")[0])
    # ---- catálogo
    metrics = []
    for r in catalog.itertuples():
        metrics.append({"id": r.id, "name": r.metrica, "lens": r.lente, "cls": r.classe, "star": bool(r.destaque),
                        "unit": r.unidade if isinstance(r.unidade, str) else "", "agg": r.agregacao if isinstance(r.agregacao, str) else "",
                        "rule": r.regra_implementada if isinstance(r.regra_implementada, str) else r.como_calcular,
                        "use": r.possivel_uso, "params": r.parametros if isinstance(r.parametros, str) else "",
                        "pol": POLARITY.get(r.id, 0), "status": status.get(r.id, "")})
    kix = {m["id"]: i for i, m in enumerate(metrics)}

    # Por time × partida × LADO (0 = ataque, 1 = defesa): o painel soma os lados quando o filtro é "todos".
    mr = rd("metrics/metrics_round")
    mr = mr[~mr["metric_id"].isin(TABLE_EXCLUDE) & ~mr["metric_id"].str.startswith(("LEV-", "HAL-"))].copy()
    mr["stratum"] = mr["stratum"].fillna("")
    # recorte "tipo de round" nas métricas de first blood: as mesmas linhas, de novo, com estrato pistol / demais rounds
    # (só alimenta os recortes; o valor-resumo dessas métricas usa os estratos originais)
    fbx = mr[mr["metric_id"].isin(FB_ROUND_CUT)].copy()
    fbx["stratum"] = np.where(fbx["round_num"].isin([0, 12]), "rt_pistol", "rt_demais")
    mr = pd.concat([mr, fbx], ignore_index=True)
    tmx = mr.groupby(["team_name", "match_id", "side", "metric_id", "stratum"], as_index=False)[["num", "den"]].sum()
    strata = sorted(set(tmx["stratum"]))
    six = {s: i for i, s in enumerate(strata)}
    TM = {"t": _rle([tix[x] for x in tmx["team_name"]]), "m": _rle([mix[x] for x in tmx["match_id"]]),
          "sd": _rle([0 if x == "atk" else 1 for x in tmx["side"]]),
          "k": [kix[x] for x in tmx["metric_id"]], "s": [six[x] for x in tmx["stratum"]],
          "n": _r(tmx["num"]), "d": _r(tmx["den"])}
    # Liga por métrica × estrato × lado × mapa (aditivo: o painel soma o recorte pedido)
    maps = sorted(matches["map_name"].unique())
    mpix = {m: i for i, m in enumerate(maps)}
    lg = mr.groupby(["metric_id", "stratum", "side", "map_name"], as_index=False)[["num", "den"]].sum()
    LG = {"k": [kix[x] for x in lg["metric_id"]], "s": [six[x] for x in lg["stratum"]],
          "sd": [0 if x == "atk" else 1 for x in lg["side"]], "mp": [mpix[x] for x in lg["map_name"]],
          "n": _r(lg["num"]), "d": _r(lg["den"])}
    # métricas só de nível agregado (TRD-05, DYN-08): valor do time na base inteira
    ag = team_lvl[team_lvl["metric_id"].isin(["TRD-05", "DYN-08"])].copy()
    ag["stratum"] = ag["stratum"].fillna("")
    ag = ag[ag["stratum"].isin(["", *[m["id"] for m in metrics]])]
    for s in ag["stratum"]:
        if s not in six:
            six[s] = len(strata)
            strata.append(s)
    AG = {"t": [tix[x] for x in ag["team_name"]], "k": [kix[x] for x in ag["metric_id"]],
          "s": [six[x] for x in ag["stratum"]], "v": _r(ag["value"]), "d": _r(ag["n_rows"], 1)}

    # ---- rounds por time
    trs = tr.sort_values(["match_id", "round_num", "team_id"])
    lev_p = out / "derived" / "leverage.parquet"
    if lev_p.exists():
        lv = pd.read_parquet(lev_p)[["match_id", "round_num", "team_id", "LI", "W_plus", "W_minus", "p_pre", "li_q"]]
        trs = trs.merge(lv, on=["match_id", "round_num", "team_id"], how="left")
    else:
        trs = trs.assign(LI=np.nan, W_plus=np.nan, W_minus=np.nan, p_pre=np.nan, li_q=None)
    # situações do round para "onde o time perde mapas": teve vantagem / desvantagem numérica (DYN-09/10 'geral')
    dyn = mr[mr["metric_id"].isin(["DYN-09", "DYN-10"]) & (mr["stratum"] == "geral")]
    va = (dyn.assign(bit=np.where(dyn["metric_id"] == "DYN-09", 1, 2)).groupby(["match_id", "round_num", "team_id"])["bit"].sum())
    trs = trs.merge(va.rename("va").reset_index(), on=["match_id", "round_num", "team_id"], how="left")
    fk = kills[(kills["kill_type"] == "enemy") & kills["in_play"]].sort_values(["match_id", "round_num", "kill_idx"])
    first = fk.groupby(["match_id", "round_num"])["killer_team"].first()
    fb = [(1 if first.get((m, r)) == t else 0) if (m, r) in first.index else -1
          for m, r, t in zip(trs["match_id"], trs["round_num"], trs["team_id"])]
    R = {"m": [mix[x] for x in trs["match_id"]], "t": team_idx(trs["match_id"], trs["team_id"]),
         "r": _i(trs["round_num"]), "sd": [0 if s == "atk" else 1 for s in trs["side"]],
         "w": [int(x) for x in trs["won"]], "b": [BUY.get(x, None) for x in trs["buy_type"]],
         "ob": [BUY.get(x, None) for x in trs["opp_buy_type"]],
         "lo": _i(trs["team_loadout"]), "olo": _i(trs["opp_loadout"]),
         "pl": [int(p and pt == t) for p, pt, t in zip(trs["has_plant"], trs["planter_team"], trs["team_id"])],
         "res": [RESULT.get(x, None) for x in trs["result"]],
         "cer": [CEREMONY.index(x) if x in CEREMONY else 0 for x in trs["ceremony"]],
         "fb": fb, "fo": [int(x) for x in trs["is_force"]], "bo": [int(x) for x in trs["is_bonus"]],
         "dmg": _i(trs["team_damage"]),
         # pressão: LI × 100, P(vencer o mapa) se vencer / se perder × 1000, P(vencer o round) pré-round × 1000
         "li": _i((trs["LI"] * 100).round()), "wp": _i((trs["W_plus"] * 1000).round()), "wm": _i((trs["W_minus"] * 1000).round()),
         "pp": _i((trs["p_pre"] * 1000).round()),
         "lq": [None if not isinstance(x, str) else int(x[1]) - 1 for x in trs["li_q"]],   # quartil de pressão 0..3
         "va": [0 if pd.isna(x) else int(x) for x in trs["va"]],                            # bits: 1 vantagem, 2 desvantagem
         "opl": [int(bool(p) and pt != t) for p, pt, t in zip(trs["has_plant"], trs["planter_team"], trs["team_id"])]}

    # ---- mortes em jogo (posições da vítima e do killer)
    k = fk.merge(trades[["match_id", "round_num", "kill_idx", "traded", "trader", "trade_time_s"]], on=["match_id", "round_num", "kill_idx"], how="left")
    k = k.merge(rounds[["match_id", "round_num", "plant_time_ms"]], on=["match_id", "round_num"], how="left")
    rank = k.groupby(["match_id", "round_num"]).cumcount()
    k["ph"] = np.where(rank == 0, 0, np.where(k["plant_time_ms"].notna() & (k["t_ms"] > k["plant_time_ms"]), 2, 1))
    kxy = kpos.merge(k[["match_id", "round_num", "kill_idx", "killer"]], left_on=["match_id", "round_num", "kill_idx", "puuid"],
                     right_on=["match_id", "round_num", "kill_idx", "killer"])[["match_id", "round_num", "kill_idx", "x", "y"]]
    k = k.merge(kxy.rename(columns={"x": "kx", "y": "ky"}), on=["match_id", "round_num", "kill_idx"], how="left")
    R_ = cfg["spatial"]["near_radius"]
    allies = k[["match_id", "round_num", "kill_idx", "victim_team", "victim_x", "victim_y", "kx", "ky"]].merge(
        kpos, left_on=["match_id", "round_num", "kill_idx", "victim_team"], right_on=["match_id", "round_num", "kill_idx", "team_id"])
    allies["d"] = np.hypot(allies["x"] - allies["victim_x"], allies["y"] - allies["victim_y"])
    near = allies.groupby(["match_id", "round_num", "kill_idx"])["d"].min()
    k["iso"] = [None if sn == 0 else int(not (near.get((m, r, i), np.inf) <= R_))
                for m, r, i, sn in zip(k["match_id"], k["round_num"], k["kill_idx"], k["snapshot_n"])]
    # trade possível não feito (mesma regra de TRD-08): sem trade e aliado da vítima a ≤ R da vítima ou de quem matou
    allies["dk"] = np.hypot(allies["x"] - allies["kx"], allies["y"] - allies["ky"]) if "kx" in allies else np.inf
    near_k = allies.groupby(["match_id", "round_num", "kill_idx"])["dk"].min()
    k["op"] = [None if sn == 0 else int((not bool(tr)) and (near.get((m, r, i), np.inf) <= R_ or near_k.get((m, r, i), np.inf) <= R_))
               for m, r, i, sn, tr in zip(k["match_id"], k["round_num"], k["kill_idx"], k["snapshot_n"], k["traded"].fillna(False))]
    ev = rd("derived/round_events")
    ev = ev[ev["event"] == "kill"][["match_id", "round_num", "kill_idx", "red_alive", "blue_alive"]]
    k = k.merge(ev, on=["match_id", "round_num", "kill_idx"], how="left")
    k["va"] = np.where(k["victim_team"] == "Red", k["red_alive"], k["blue_alive"])
    k["ka"] = np.where(k["victim_team"] == "Red", k["blue_alive"], k["red_alive"])
    K = {"m": [mix[x] for x in k["match_id"]], "r": _i(k["round_num"]), "t": _r(k["t_ms"] / 1000, 1),
         "vt": team_idx(k["match_id"], k["victim_team"]), "v": [pix.get(x) for x in k["victim"]],
         "k": [pix.get(x) for x in k["killer"]], "vx": _i(k["victim_x"]), "vy": _i(k["victim_y"]),
         "kx": _i(k["kx"]), "ky": _i(k["ky"]), "tr": [int(bool(x)) for x in k["traded"].fillna(False)],
         "trd": [pix.get(x) for x in k["trader"]], "ph": _i(k["ph"]), "iso": [int(bool(x)) for x in k["iso"]], "op": [int(bool(x)) for x in k["op"]],
         "tt": _r(k["trade_time_s"], 2), "ki": _i(k["kill_idx"]), "va": _i(k["va"]), "ka": _i(k["ka"])}

    # ---- plants
    p = rounds[rounds["has_plant"]]
    P = {"m": [mix[x] for x in p["match_id"]], "r": _i(p["round_num"]), "t": team_idx(p["match_id"], p["planter_team"]),
         "st": p["plant_site"].fillna("?").tolist(), "x": _i(p["plant_x"]), "y": _i(p["plant_y"]),
         "w": [int(w == "Attacker") for w in p["winning_role"]], "df": [int(x) for x in p["has_defuse"]],
         "pt": _r(p["plant_time_ms"] / 1000, 1), "rs": [RESULT.get(x, None) for x in p["result"]]}

    # ---- composições: agentes de cada jogador por time-mapa (catálogo estático characterId -> agente/função)
    cat = pd.read_csv(cfg.agents_catalog_path, sep=";")
    agents = [{"name": a, "role": f} for a, f in zip(cat["agente"], cat["funcao"])]
    aix = {c.lower(): i for i, c in enumerate(cat["character_id"])}
    pc = pl.assign(cid=pl["character_id"].str.lower())
    pc = pc[pc["cid"].isin(aix)]
    cm, ct, cp = [], [], []
    for (mid_, tid_), g in pc.groupby(["match_id", "team_id"]):
        if (mid_, tid_) not in side_name:
            continue
        cm.append(mix[mid_])
        ct.append(tix[side_name[(mid_, tid_)]])
        cp.append([v for p_, c_ in sorted(zip(g["puuid"], g["cid"]), key=lambda x: aix[x[1]]) for v in (pix[p_], aix[c_])])
    C = {"m": cm, "t": ct, "pa": cp}

    # ---- placar da partida por jogador (como nos sites de estatística): K/D/A oficiais do JSON; ACS = score / rounds;
    # ADR e HS% pelo dano em adversários; FK/FD = 1ª kill em jogo de cada round; KAST = rounds com kill, assistência,
    # sobrevivência ou morte trocada (trade na janela de timing.trade_window_s) / rounds jogados
    SB = _scoreboard(pl, kills, trades, rd("canonical/damage"), rd("canonical/round_players"), rd("derived/team_rounds"), mix, pix, team_idx, aix)

    M = {"id": matches["match_id"].tolist(), "file": matches["file"].tolist(), "date": matches["date"].tolist(),
         "comp": matches["competition"].tolist(), "stage": matches["stage"].tolist(), "series": matches["series"].tolist(),
         "map": matches["map_name"].tolist(), "red": [tix[x] for x in matches["red_name"]],
         "blue": [tix[x] for x in matches["blue_name"]], "rs": _i(matches["red_score"]), "bs": _i(matches["blue_score"]),
         "nr": _i(matches["n_rounds"])}

    FUND = _fundamentals_payload(out, cfg, mix, tix, pix)

    # mapas oficiais (displayIcon de valorant-api.com, uso autorizado pela organização do hackathon) + transformação
    # coordenada do jogo -> imagem: u = y·xMultiplier + xScalarToAdd, v = x·yMultiplier + yScalarToAdd (0..1)
    mdir = HERE / "vendor" / "maps"
    MAPIMG = {}
    if (mdir / "maps.json").exists():
        mm = json.loads((mdir / "maps.json").read_text(encoding="utf-8"))
        for name in maps:
            f = mdir / f"{name.lower()}.png"
            if name in mm and f.exists():
                c = mm[name]
                MAPIMG[name] = {"png": base64.b64encode(f.read_bytes()).decode(), "xm": c["xm"], "ym": c["ym"], "xa": c["xa"], "ya": c["ya"],
                                "co": [[x["s"], x["r"], round(x["x"]), round(x["y"])] for x in c["callouts"]]}
    # telas de carregamento dos mapas (splash de valorant-api.com, recortadas 120×160 em JPEG; uso autorizado pela organização)
    SPLASH = {f.stem: base64.b64encode(f.read_bytes()).decode() for f in sorted((HERE / "vendor" / "splash").glob("*.jpg"))}
    # retratos dos agentes (displayIconSmall de valorant-api.com, 64×64 WebP; uso autorizado), na ordem do catálogo
    adir = HERE / "vendor" / "agents"
    AGIMG = [base64.b64encode((adir / f"{c.lower()}.webp").read_bytes()).decode() if (adir / f"{c.lower()}.webp").exists() else None
             for c in cat["character_id"]]
    rep_p = out / "leverage" / "model_report.csv"
    LEVREP = pd.read_csv(rep_p, keep_default_na=False).to_dict(orient="records") if rep_p.exists() else []
    # exemplos do índice de pressão para a explicação do painel (mesmo modelo, time médio, taxa global do ataque)
    LEVEX = []
    if LEVREP:
        from ..leverage import g_state
        pa, lref = float(LEVREP[0]["taxa_ataque_global"]), float(LEVREP[0]["l_ref"])
        for a_, b_, k_, lbl in ((0, 0, 0, "0–0 (pistol)"), (3, 0, 3, "3–0"), (6, 6, 12, "6–6 (pistol do 2º half)"),
                                (2, 9, 11, "2–9"), (11, 11, 22, "11–11"), (12, 11, 23, "12–11 (match point)"), (12, 12, 24, "12–12 (prorrogação)")):
            wp = g_state(a_ + 1, b_, k_ + 1, True, True, pa)
            wm = g_state(a_, b_ + 1, k_ + 1, True, True, pa)
            LEVEX.append({"s": lbl, "wp": round(wp, 3), "wm": round(wm, 3), "li": round(max(0.0, wp - wm) / lref, 2)})
    return {"MAPIMG": MAPIMG, "SPLASH": SPLASH, "AGIMG": AGIMG, "FUND": FUND, "LEVREP": LEVREP, "LEVEX": LEVEX, "run": run_info, "teams": team_names, "maps": maps, "players": [pname[p] for p in pu], "metrics": metrics,
            "strata": strata, "sections": [{"id": a, "label": b, "ids": c, "group": g} for a, b, c, g in SECTIONS],
            "M": M, "TM": TM, "LG": LG, "AG": AG, "R": R, "K": K, "P": P, "C": C, "SB": SB, "agents": agents,
            "cfg": {"trade_window_s": cfg["timing"]["trade_window_s"], "near_radius": R_, "episode_buckets_s": cfg["timing"]["episode_buckets_s"],
                    "team_eco_max": cfg["economy"]["team_eco_max"], "team_full_min": cfg["economy"]["team_full_min"]}}


def _scoreboard(pl, kills, trades, dmg, rp, tr, mix, pix, team_idx, aix) -> dict:
    """Placar por jogador e por lado (0 = ataque, 1 = defesa), uma linha por jogador-partida.

    Por lado: rounds, ACS (score / rounds), K (kills em adversários), D (mortes, menos spike), A, ADR (dano em
    adversários / rounds), acertos na cabeça e acertos totais em adversários (para HS%), rounds KAST, FK e FD (1ª kill em
    jogo do round). No total, K/D/A são os oficiais do JSON e o resto é a soma dos dois lados.
    KAST = round com kill, assistência, sobrevivência ou morte trocada (trade na janela de timing.trade_window_s)."""
    key = ["match_id", "puuid"]
    base = pl[pl["match_id"].isin(mix)].copy()
    base["ag"] = [aix.get(str(c).lower()) for c in base["character_id"]]
    side = tr[["match_id", "round_num", "team_id", "atk_team"]].copy()
    side["sd"] = (side["team_id"] != side["atk_team"]).astype(int)
    sd = side.set_index(["match_id", "round_num", "team_id"])["sd"]
    r = rp[["match_id", "round_num", "puuid", "team_id", "score"]].drop_duplicates(["match_id", "round_num", "puuid"])
    r = r[r["puuid"].isin(base["puuid"])]
    r["sd"] = sd.reindex(pd.MultiIndex.from_frame(r[["match_id", "round_num", "team_id"]])).to_numpy()
    r = r[r["sd"].notna()].copy()
    r["sd"] = r["sd"].astype(int)
    rk = ["match_id", "round_num", "puuid"]

    def per_round(df, who, name):
        g = df.groupby(["match_id", "round_num", who]).size().rename(name).reset_index().rename(columns={who: "puuid"})
        return g

    for g in (per_round(kills[kills["kill_type"] == "enemy"], "killer", "k"), per_round(kills[kills["kill_type"] != "bomb"], "victim", "d")):
        r = r.merge(g, on=rk, how="left")
    a = kills.assign(who=kills["assistants"].fillna("").str.split(",")).explode("who")
    r = r.merge(per_round(a[a["who"].fillna("") != ""], "who", "a"), on=rk, how="left")
    e = dmg[dmg["attacker_team"] != dmg["receiver_team"]].assign(sh=lambda x: x["headshots"] + x["bodyshots"] + x["legshots"])
    e = e.groupby(["match_id", "round_num", "attacker"])[["damage", "headshots", "sh"]].sum().reset_index().rename(columns={"attacker": "puuid", "headshots": "hs"})
    r = r.merge(e, on=rk, how="left")
    kp = kills[kills["in_play"].astype(bool)].sort_values(["match_id", "round_num", "t_ms"])
    first = kp.groupby(["match_id", "round_num"]).head(1)
    r = r.merge(per_round(first, "killer", "fk"), on=rk, how="left").merge(per_round(first, "victim", "fd"), on=rk, how="left")
    kr = set(zip(kp["match_id"], kp["round_num"], kp["killer"]))
    ar = {(m, n, x) for m, n, s_ in zip(kp["match_id"], kp["round_num"], kp["assistants"]) for x in str(s_ or "").split(",") if x}
    dr = set(zip(kp["match_id"], kp["round_num"], kp["victim"]))
    tt = trades[trades["traded"].fillna(False).astype(bool)]
    trr = set(zip(tt["match_id"], tt["round_num"], tt["victim"]))
    r["kast"] = [int(x in kr or x in ar or x not in dr or x in trr) for x in zip(r["match_id"], r["round_num"], r["puuid"])]
    r = r.fillna(0)
    g = r.groupby(key + ["sd"]).agg(rp=("round_num", "size"), sc=("score", "sum"), k=("k", "sum"), d=("d", "sum"), a=("a", "sum"),
                                     dm=("damage", "sum"), hs=("hs", "sum"), sh=("sh", "sum"), kast=("kast", "sum"),
                                     fk=("fk", "sum"), fd=("fd", "sum")).reset_index()
    g["acs"] = (g["sc"] / g["rp"]).round()
    g["adr"] = (g["dm"] / g["rp"]).round()
    out = {"m": [mix[x] for x in base["match_id"]], "t": team_idx(base["match_id"], base["team_id"]), "p": [pix.get(x) for x in base["puuid"]],
           "ag": base["ag"].tolist(), "k": _i(base["kills"]), "d": _i(base["deaths"]), "a": _i(base["assists"]),
           "acs": _i((base["score"] / base["rounds_played"].clip(lower=1)).round()), "ul": _i(base["ultimate_casts"])}
    tot = g.groupby(key)[["dm", "rp"]].sum().reindex(pd.MultiIndex.from_frame(base[key]))
    out["adr"] = [0 if pd.isna(x) or not n else int(round(x / n)) for x, n in zip(tot["dm"], tot["rp"])]
    idx = pd.MultiIndex.from_frame(base[key])
    for s_ in (0, 1):
        x = g[g["sd"] == s_].set_index(key).reindex(idx)
        for c in ("rp", "acs", "k", "d", "a", "adr", "hs", "sh", "kast", "fk", "fd"):
            out[f"{c}{s_}"] = [0 if pd.isna(v) else int(v) for v in x[c]]
    return out


DE_CATS = ["side", "phase", "numbers", "ally_dist", "allies_near_b", "economy", "fb_context"]
ADV_CATS = ["state", "side", "spike", "when", "economy"]
FB_CATS = ["side", "economy", "when", "duel_role"]
FUND_KEYS = ("trade", "advantage", "fb_open", "fb_rec", "post", "retake", "keyrounds", "halfopen", "pressure")
# fundamentos de round (fundamentals/rounds.py): arquivo de eventos, coluna de elegibilidade, esperado e dimensões
ROUND_FUND = {"post": ("plant_events", "eligible_post", "exp_post", ["numbers", "pstate", "site", "pwhen", "economy"]),
              "retake": ("plant_events", "eligible_ret", "exp_ret", ["numbers", "pstate", "site", "pwhen", "economy"]),
              "keyrounds": ("key_events", "eligible", "exp_key", ["round_type", "side", "half", "economy"]),
              "halfopen": ("half_events", "eligible", "exp_half", ["moment", "side", "half", "economy"]),
              "pressure": ("pressure_events", "eligible", "exp_press", ["lead", "phase", "side", "economy"])}
# alvo do relatório de baseline que corresponde ao desfecho usado pelo detector
FUND_TARGET = {"advantage": "converteu (venceu o round)", "fb_open": "fez o first blood", "fb_rec": "venceu depois de sofrer o FB",
               "post": "venceu depois de plantar", "retake": "venceu com a spike adversária plantada",
               "keyrounds": "venceu o round-chave", "halfopen": "venceu o round 2/3 do half",
               "pressure": "venceu o round decisivo"}


def _fd(show, tix):
    return {"id": show["pattern_id"].tolist(), "scope": show["scope"].tolist(), "t": [tix.get(x) for x in show["team"]],
            "dims": [json.loads(x) for x in show["dims"]], "level": _i(show["level"]), "label": show["label"].tolist(),
            "dir": show["direction"].tolist(), "obs": _r(show["observed"]), "exp": _r(show["expected"]), "gap": _r(show["gap_pp"], 2),
            "lo": _r(show["ci_lo_pp"], 2), "hi": _r(show["ci_hi_pp"], 2), "vs": _r(show["events_vs_expected"], 2),
            "n": _i(show["n_events"]), "nm": _i(show["n_matches"]), "rec": _r(show["recurrence"], 3), "nrec": _i(show["n_rec_matches"]),
            "z": _r(show["z"], 2), "sel": [int(x) for x in show["selected"]], "parent": show["parent_dims"].tolist()}


def _cats(el, cols):
    cats = {c: sorted(el[c].astype(str).unique().tolist()) for c in cols}
    cix = {c: {v: i for i, v in enumerate(vals)} for c, vals in cats.items()}
    return cats, {c: [cix[c][str(v)] for v in el[c]] for c in cols}


def _p1000(s):
    return [None if pd.isna(v) else int(round(1000 * v)) for v in s]


def _fundamentals_payload(out: Path, cfg, mix, tix, pix) -> dict | None:
    """Diagnóstico: por fundamento, padrões, eventos (compactos), evidências e o snapshot de posições das evidências.
    Posições (KP) trazem o time de cada jogador (`tc`); o navegador decide quem é aliado a partir do time escolhido."""
    fdir = out / "fundamentals"
    if not (fdir / "patterns.parquet").exists():
        return None
    pt = pd.read_parquet(fdir / "patterns.parquet")
    evd = pd.read_parquet(fdir / "evidence.parquet")
    rep = pd.read_parquet(fdir / "baseline_report.parquet")
    val = pd.read_parquet(fdir / "detector_validation.parquet")
    mt = pd.read_parquet(out / "canonical" / "matches.parquet")[["match_id", "red_name", "blue_name"]]
    kp_all = pd.read_parquet(out / "canonical" / "kill_positions.parquet")[["match_id", "round_num", "kill_idx", "puuid", "team_id", "x", "y"]]
    kp_all = kp_all.merge(mt, on="match_id", how="left")
    kp_all["tc"] = [tix.get(r if t == "Red" else b) for t, r, b in zip(kp_all["team_id"], kp_all["red_name"], kp_all["blue_name"])]
    fbe = pd.read_parquet(fdir / "fb_events.parquet") if (fdir / "fb_events.parquet").exists() else None
    F = cfg["fundamentals"]
    w = int(F["default_window_s"])
    windows = [int(x) for x in F["trade_windows_s"]]
    res = {}
    for fk in FUND_KEYS:
        p = pt[pt["fundamental"] == fk]
        if p.empty:
            continue
        show = p[(p["tier"] == "padrão") | (p["level"] == 0)].reset_index(drop=True)
        fid = {x: i for i, x in enumerate(show["pattern_id"])}
        base = lambda el: {"t": [tix.get(x) for x in el["team_name"]], "m": _rle([mix[x] for x in el["match_id"]]), "r": _i(el["round_num"])}
        if fk == "trade":
            de = pd.read_parquet(fdir / "death_events.parquet")
            el = de[de["eligible"] & de[f"exp_trade_{w}s"].notna()].sort_values(["match_id", "round_num", "kill_idx"])
            cats, codes = _cats(el, DE_CATS)
            yb = sum(el[f"traded_{x}s"].astype(int) * (1 << i) for i, x in enumerate(windows))
            E = {**base(el), "k": _i(el["kill_idx"]), "ts": _r(el["t_s"], 1), "yb": _i(yb), "v": [pix.get(x) for x in el["victim"]],
                 "a": [pix.get(x) for x in el["nearest_ally"]], **codes,
                 **{f"p{x}": _p1000(el[f"exp_trade_{x}s"]) for x in windows}}
        elif fk == "advantage":
            ae = pd.read_parquet(fdir / "advantage_episodes.parquet")
            el = ae[ae["eligible"] & ae["exp_adv_won"].notna()].sort_values(["match_id", "round_num", "team_id"])
            cats, codes = _cats(el, ADV_CATS)
            E = {**base(el), "k": _i(el["start_kill_idx"]), "ts": _r(el["t0_s"], 1), "y": [int(x) for x in el["won"]],
                 "p": _p1000(el["exp_adv_won"]), "lo": [int(x) for x in el["lost_adv"]],
                 "pl": _p1000(el["exp_adv_lost"]), "hs": _r(el["held_s"], 1),
                 "ce": [int(x) for x in el["censored"]], "co": [int(x) for x in el["collapse"]], "un": _i(el["unanswered"]), **codes}
        elif fk in ROUND_FUND:
            fname, elig, pcol, cols = ROUND_FUND[fk]
            re_ = pd.read_parquet(fdir / f"{fname}.parquet")
            el = re_[re_[elig] & re_[pcol].notna()].sort_values(["match_id", "round_num", "team_id"])
            cats, codes = _cats(el, cols)
            E = {**base(el), "y": [int(x) for x in el["won"]], "p": _p1000(el[pcol]), **codes}
        else:
            rec = fk == "fb_rec"
            pcol = "exp_fb_rec" if rec else "exp_fb_open"
            el = fbe[fbe["eligible_rec" if rec else "eligible"] & fbe[pcol].notna()].sort_values(["match_id", "round_num", "team_id"])
            cats, codes = _cats(el, FB_CATS)
            E = {**base(el), "k": _i(el["kill_idx"]), "ts": _r(el["t_s"], 1), "y": [int(x) for x in el["won" if rec else "got_fb"]],
                 "p": _p1000(el[pcol]), "v": [pix.get(x) for x in el["duel_player"]], "tr": [int(x) for x in el["fb_traded"]], **codes}
            if not rec:  # para os resumos do card: venceu o round, esperado depois de fazer / sofrer o FB
                E.update({"w": [int(x) for x in el["won"]], "pc": _p1000(el["exp_fb_conv"]), "pr": _p1000(el["exp_fb_rec"])})
        ev = evd[evd["pattern_id"].isin(fid) & (evd["rank"] < 8)]   # 8 rounds para revisar por padrão (limite de tamanho do painel)
        EV = {"f": [fid[x] for x in ev["pattern_id"]], "m": [mix[x] for x in ev["match_id"]], "r": _i(ev["round_num"]),
              "k": _i(ev["kill_idx"]), "why": ev["why_listed"].tolist()}
        keys = ev[["match_id", "round_num", "kill_idx"]].dropna(subset=["kill_idx"]).drop_duplicates().copy()
        keys["kill_idx"] = keys["kill_idx"].astype(int)
        kp = kp_all.merge(keys, on=["match_id", "round_num", "kill_idx"])
        KP = {"m": [mix[x] for x in kp["match_id"]], "r": _i(kp["round_num"]), "k": _i(kp["kill_idx"]),
              "p": [pix.get(x) for x in kp["puuid"]], "tc": list(kp["tc"]), "x": _i(kp["x"]), "y": _i(kp["y"])}
        target = f"trade em {w} s" if fk == "trade" else FUND_TARGET[fk]
        rr = rep[(rep["fundamental"] == fk) & (rep["target"] == target)]
        ch = rr[rr["chosen"]].iloc[0]
        nul = val[(val["fundamental"] == fk) & val["teste"].str.startswith("nulo")]
        pl = val[(val["fundamental"] == fk) & val["detectado"].notna()]
        meta = {"model": ch["model"], "cv_log_loss": round(float(ch["log_loss"]), 4), "cv_ece": round(float(ch["ece"]), 4),
                "m0_log_loss": round(float(rr[rr["model"] == "M0_global"]["log_loss"].iloc[0]), 4), "n_series": int(ch["n_series"]),
                "z_star": round(float(p["z_star"].iloc[0]), 2), "null_team_rate": round(float((nul["times_com_padrao"] / nul["times"]).mean()), 3),
                "null_watch_rate": round(float((nul["times_com_sinal_a_observar"] / nul["times"]).mean()), 3),
                "planted_hits": int(pl["detectado"].astype(bool).sum()), "planted_n": int(len(pl)),
                "planted_what": pl["teste"].iloc[0].split(", ", 1)[1] if len(pl) else "",
                "scopes": sorted(p["scope"].unique().tolist())}
        if fk == "trade":
            meta.update({"window": w, "windows": windows})
        res[fk] = {"FD": _fd(show, tix), "E": E, "cats": cats, "EV": EV, "KP": KP, "meta": meta}
    return {"F": res, "meta": {"criteria": {k: F["patterns"][k] for k in ("min_events", "min_matches", "min_recurrence", "min_excess_pp", "ci_level")},
                               "near_m": cfg["spatial"]["near_radius"] / 100}}


def build_html(out: Path, cfg) -> Path:
    payload = build_payload(out, cfg)
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    font = base64.b64encode((HERE / "vendor" / "fonts" / "archivo-latin-wdth-normal.woff2").read_bytes()).decode()
    fonts = ('@font-face { font-family: "Archivo"; font-style: normal; font-display: swap; font-weight: 100 900; '
             f'font-stretch: 62% 125%; src: url(data:font/woff2;base64,{font}) format("woff2"); }}')
    icons = (HERE / "vendor" / "icons.json").read_text(encoding="utf-8")
    html = (tpl.replace("/*__FONTS__*/", fonts).replace("/*__ICONS__*/", "window.RRX_ICONS=" + icons + ";")
               .replace("/*__CSS__*/", (HERE / "app.css").read_text(encoding="utf-8"))
               .replace("/*__D3__*/", (HERE / "vendor" / "d3.min.js").read_text(encoding="utf-8"))
               .replace("/*__DATA__*/", "window.RRX=" + data + ";")
               .replace("/*__APP__*/", (HERE / "app.js").read_text(encoding="utf-8")))
    dest = out / "dashboard" / "roundrx_painel.html"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding="utf-8")
    # Variante para publicação como página hospedada: sem <!doctype>/<html>/<head>/<body> (o host fornece o esqueleto).
    head = html.split("<head>", 1)[1].split("</head>", 1)[0]
    head = "\n".join(l for l in head.splitlines() if "charset" not in l and 'name="viewport"' not in l)
    body = html.split("<body>", 1)[1].rsplit("</body>", 1)[0]
    (dest.parent / "roundrx_painel_publicavel.html").write_text(head.strip() + "\n" + body.strip() + "\n", encoding="utf-8")
    # Cópia completa para o site estático (Vercel publica a pasta site/, ver vercel.json)
    site = Path(cfg.root) / "site"
    site.mkdir(exist_ok=True)
    (site / "index.html").write_text(html, encoding="utf-8")
    return dest
