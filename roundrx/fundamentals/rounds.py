"""Fundamentos de round: pós-plant, retake, rounds-chave e início de half.

Uma linha por time-round elegível; o desfecho é sempre `won` (o time venceu o round). O contexto usa só o que se sabe
no instante que define o evento (o plant, o início do round), nunca o que aconteceu depois.

- post       o time plantou (ataque). Contexto: vivos no plant (time × adversário), site, momento do plant, economia, mapa.
- retake     o adversário plantou (defesa). Mesmo contexto, do ponto de vista de quem defende.
- keyrounds  pistol, eco, anti-eco, force buy e round armado (full × full). Contexto: tipo de round, lado, mapa, economia.
- halfopen   rounds 2 e 3 de cada half, pelo caminho até ali: round 2 depois de vencer / perder o pistol, round 3 depois
             de 2–0, 0–2 ou 1–1. Contexto: momento, lado, mapa, economia.
Eventos de rounds-chave e de início de half são do mesmo round em lados opostos de uma partida (espelho); o esperado
de um time nunca usa nenhuma partida dele (ver baselines.fit_baselines).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

KEY = ["match_id", "round_num", "team_id"]


def _base(ctx) -> pd.DataFrame:
    lo, hi = ctx.cfg["composition"]["loadout_ratio_bands"]
    tr = ctx.tr.copy()
    tr = tr.merge(ctx.t["matches"][["match_id", "game_start_ms"]], on="match_id", how="left")
    pair = [" × ".join(sorted((x, y))) for x, y in zip(tr["team_name"].astype(str), tr["opponent_name"].astype(str))]
    tr["series_key"] = tr["competition"].astype(str) + "|" + tr["date"].astype(str) + "|" + pd.Series(pair, index=tr.index)
    ratio = tr["team_loadout"] / tr["opp_loadout"].replace(0, np.nan)
    tr["economy"] = np.where(tr["is_pistol"], "pistol", np.where(ratio < lo, "equipamento inferior",
                             np.where(ratio > hi, "equipamento superior", "equipamento equilibrado")))
    tr["won"] = tr["won"].astype(bool)
    tr["team_name"] = tr["team_name"].astype(str)
    return tr


def _pwhen(t: float) -> str:
    return "até 30 s" if t <= 30 else ("30–60 s" if t <= 60 else "depois de 60 s")


def build_plant_events(ctx) -> pd.DataFrame:
    """Time-rounds com spike plantada: `eligible_post` (o time plantou) e `eligible_ret` (o adversário plantou)."""
    tr = _base(ctx)
    tr = tr[tr["has_plant"].astype(bool)].copy()
    ap = ctx.alive_plant[KEY + ["alive", "opp_alive", "diff"]]
    d = tr.merge(ap, on=KEY, how="inner")
    d["alive"], d["opp_alive"] = d["alive"].astype(int), d["opp_alive"].astype(int)
    d["pstate"] = d["alive"].astype(str) + "v" + d["opp_alive"].astype(str)
    d["numbers"] = np.where(d["diff"] > 0, "em vantagem", np.where(d["diff"] < 0, "em desvantagem", "igualdade"))
    d["site"] = d["plant_site"].fillna("?").astype(str)
    d["map_site"] = d["map_name"].astype(str) + " · " + d["site"]   # site só faz sentido dentro de um mapa
    d["t_s"] = d["plant_time_ms"] / 1000
    d["pwhen"] = [_pwhen(x) for x in d["t_s"]]
    d["eligible_post"] = d["planter_team"] == d["team_id"]
    d["eligible_ret"] = ~d["eligible_post"]
    d["defused"] = d["has_defuse"].astype(bool)
    cols = KEY + ["team_name", "opponent_name", "series_key", "game_start_ms", "map_name", "side", "economy", "team_loadout",
                  "opp_loadout", "t_s", "pwhen", "site", "map_site", "alive", "opp_alive", "pstate", "numbers", "defused", "result", "won",
                  "eligible_post", "eligible_ret"]
    return d[cols].sort_values(KEY).reset_index(drop=True)


ROUND_TYPES = ["pistol", "eco", "anti-eco", "force buy", "armado"]


def build_key_events(ctx) -> pd.DataFrame:
    """Rounds-chave, com a mesma regra das métricas KEY: pistol (rounds 1 e 13), eco (fora dos pistols), anti-eco (o
    adversário em eco), force buy e armado (full × full). Um round fica num tipo só, nessa ordem de prioridade."""
    d = _base(ctx)
    pistol = d["round_num"].isin([0, 12])
    eco = (d["buy_type"] == "eco") & ~pistol
    anti = (d["opp_buy_type"] == "eco") & ~pistol & ~eco
    force = d["is_force"].astype(bool) & ~pistol & ~eco & ~anti
    armed = (d["buy_type"] == "full") & (d["opp_buy_type"] == "full") & ~pistol & ~force
    d["round_type"] = np.select([pistol, eco, anti, force, armed], ROUND_TYPES, "outro")
    d = d[d["round_type"] != "outro"].copy()
    d["half"] = np.where(d["round_num"] < 12, "1º half", np.where(d["round_num"] < 24, "2º half", "prorrogação"))
    d["eligible"] = True
    cols = KEY + ["team_name", "opponent_name", "series_key", "game_start_ms", "map_name", "side", "economy", "team_loadout",
                  "opp_loadout", "round_type", "half", "won", "eligible"]
    return d[cols].sort_values(KEY).reset_index(drop=True)


MOMENTS = ["round 2 depois de vencer o pistol", "round 2 depois de perder o pistol", "round 3 depois de 2–0",
           "round 3 depois de 1–1", "round 3 depois de 0–2"]


def build_half_events(ctx) -> pd.DataFrame:
    """Rounds 2 e 3 de cada half (índices 1, 2, 13, 14), com o caminho do half até ali."""
    d = _base(ctx)
    d = d[d["round_num"] < 24].sort_values(KEY)
    w = d.set_index(KEY)["won"]
    rows = []
    for (m, r, t), won in w.items():
        k = r % 12
        if k not in (1, 2):
            continue
        h0 = r - k
        prev = [w.get((m, h0 + j, t)) for j in range(k)]
        if any(p is None for p in prev):
            continue
        if k == 1:
            mom = MOMENTS[0] if prev[0] else MOMENTS[1]
        else:
            s = int(prev[0]) + int(prev[1])
            mom = MOMENTS[2] if s == 2 else (MOMENTS[4] if s == 0 else MOMENTS[3])
        rows.append((m, r, t, mom))
    mo = pd.DataFrame(rows, columns=KEY + ["moment"])
    d = d.merge(mo, on=KEY, how="inner")
    d["half"] = np.where(d["round_num"] < 12, "1º half", "2º half")
    d["eligible"] = True
    cols = KEY + ["team_name", "opponent_name", "series_key", "game_start_ms", "map_name", "side", "economy", "team_loadout",
                  "opp_loadout", "moment", "half", "won", "eligible"]
    return d[cols].sort_values(KEY).reset_index(drop=True)


def build_pressure_events(ctx) -> pd.DataFrame:
    """Rounds decisivos: os 25% de rounds da base que mais valem para o mapa (quartil 4 do Leverage Index, ver
    roundrx/leverage.py). Contexto conhecido antes do round: placar (na frente, empatado, atrás), fase do half, lado,
    economia e mapa. Desfecho: venceu o round."""
    lv = ctx.lev[0][KEY + ["a", "b", "phase", "li_q", "LI"]]
    d = _base(ctx).merge(lv, on=KEY, how="inner")
    d = d[d["li_q"].astype(str).str.startswith("Q4")].copy()
    d["lead"] = np.where(d["a"] > d["b"], "na frente", np.where(d["a"] < d["b"], "atrás", "empatado"))
    d["score"] = d["a"].astype(int).astype(str) + "–" + d["b"].astype(int).astype(str)
    d["eligible"] = True
    cols = KEY + ["team_name", "opponent_name", "series_key", "game_start_ms", "map_name", "side", "economy", "team_loadout",
                  "opp_loadout", "lead", "phase", "score", "LI", "won", "eligible"]
    return d[cols].sort_values(KEY).reset_index(drop=True)
