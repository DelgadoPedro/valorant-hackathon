"""Evidências: os eventos que sustentam cada padrão exibido.

Padrão "abaixo do esperado": eventos do recorte em que o desfecho NÃO aconteceu, dos que outros times mais
conseguiriam (maior esperado) para os menos. Padrão "acima": desfechos que aconteceram onde o esperado era baixo.
O recorte geral de cada time (nível 0) também recebe evidências na direção do resultado, mesmo quando nenhum
padrão foi detectado. Pontos fortes mostram sucessos; resultados abaixo do esperado mostram oportunidades para
revisão. Cada linha diz por que está na lista, em linguagem de revisão, nunca como erro.
"""
from __future__ import annotations

import json

import pandas as pd

MAX_PER_PATTERN = 40


def _why_trade(r, w) -> str:
    near = f"aliado mais próximo ({r.nearest_ally_name}) a {r.nearest_ally_cm / 100:.0f} m" if pd.notna(r.nearest_ally_cm) else "posição do aliado desconhecida"
    if r.y:
        return f"trocada em {r.revenge_s:.1f} s; {near}; times parecidos trocam {100 * r.p:.0f}% dessas"
    return f"sem trade em {w} s; {near}; times parecidos trocam {100 * r.p:.0f}% dessas"


def _why_adv(r, w) -> str:
    spike = ", spike plantada" if r.spike == "plantada" else ""
    lado = "ataque" if r.side == "atk" else "defesa"
    lost = f"vantagem perdida {r.held_s:.0f} s depois" if r.lost_adv else "manteve a vantagem"
    res = "venceu o round" if r.y else "perdeu o round"
    return f"chegou a {r.state} aos {r.t0_s:.0f} s ({lado}{spike}); {lost}; {res}; times parecidos convertem {100 * r.p:.0f}% dessas"


def _fb_trade(r) -> str:
    return f"1ª morte trocada em {r.revenge_s:.1f} s" if r.fb_traded else "1ª morte sem trade"


def _agent(a) -> str:
    return f" ({a})" if isinstance(a, str) and a else ""


def _why_fbo(r, w) -> str:
    lado = "ataque" if r.side == "atk" else "defesa"
    if r.y:
        what = f"{r.duel_name}{_agent(r.duel_agent)} abriu o round matando {r.opp_name}{_agent(r.opp_agent)} aos {r.t_s:.0f} s"
    else:
        what = f"{r.duel_name}{_agent(r.duel_agent)} morreu para {r.opp_name}{_agent(r.opp_agent)} aos {r.t_s:.0f} s"
    res = "venceu o round" if r.won else "perdeu o round"
    return f"{what} ({lado}); {res}; times parecidos fazem o first blood em {100 * r.p:.0f}% desses rounds"


def _why_fbr(r, w) -> str:
    lado = "ataque" if r.side == "atk" else "defesa"
    res = "venceu o round" if r.y else "perdeu o round"
    return (f"{r.duel_name}{_agent(r.duel_agent)} morreu primeiro aos {r.t_s:.0f} s ({lado}); {_fb_trade(r)}; {res}; "
            f"times parecidos vencem {100 * r.p:.0f}% desses rounds")


def _why_round(r, spec_name) -> str:
    lado = "ataque" if r.side == "atk" else "defesa"
    res = "venceu o round" if r.y else "perdeu o round"
    if spec_name in ("post", "retake"):
        who = "o time plantou" if spec_name == "post" else "o adversário plantou"
        end = f" ({r.result.lower()})" if isinstance(r.result, str) else ""
        return f"{who} no {r.site} aos {r.t_s:.0f} s em {r.pstate} ({lado}); {res}{end}; times parecidos vencem {100 * r.p:.0f}% desses rounds"
    if spec_name == "pressure":
        return (f"round decisivo no {r.score} ({r.phase}, {lado}, {r.economy}; pressão {r.LI:.1f}×); {res}; "
                f"times parecidos vencem {100 * r.p:.0f}% desses rounds")
    if spec_name == "keyrounds":
        return f"{r.round_type} ({lado}, {r.economy}); {res}; times parecidos vencem {100 * r.p:.0f}% desses rounds"
    return f"{r.moment} ({lado}, {r.economy}); {res}; times parecidos vencem {100 * r.p:.0f}% desses rounds"


def _last_sets(d, scopes):
    last = {}
    for sc in scopes:
        if sc.startswith("ultimas_"):
            n = int(sc.split("_")[1])
            order = d[["team_name", "match_id", "game_start_ms"]].drop_duplicates().sort_values("game_start_ms")
            last[sc] = set(map(tuple, order.groupby("team_name").tail(n)[["team_name", "match_id"]].to_numpy()))
    return last


def build_evidence(events: pd.DataFrame, patterns: pd.DataFrame, cfg, spec=None) -> pd.DataFrame:
    from .patterns import trade_spec
    spec = spec or trade_spec(cfg)
    w = int(cfg["fundamentals"]["default_window_s"])
    trade = spec.name == "trade"
    d = events[events[spec.eligible].astype(bool) & events[spec.p].notna()].copy()
    d["y"] = d[spec.y].astype(bool)
    d["p"] = d[spec.p]
    pts = patterns[(patterns["fundamental"] == spec.name) & ((patterns["tier"] == "padrão") | (patterns["level"] == 0))]
    last = _last_sets(d, pts["scope"].unique())
    rows = []
    for pt in pts.itertuples(index=False):
        e = d[d["team_name"] == pt.team]
        if pt.scope in last:
            keep = last[pt.scope]
            e = e[[(pt.team, m) in keep for m in e["match_id"]]]
        for k, v in json.loads(pt.dims).items():
            e = e[e[k].astype(str) == v]
        e = e[~e["y"]].sort_values("p", ascending=False) if pt.direction == "abaixo" else e[e["y"]].sort_values("p")
        for rank, r in enumerate(e.head(MAX_PER_PATTERN).itertuples(index=False)):
            base = {"pattern_id": pt.pattern_id, "fundamental": spec.name, "rank": rank, "match_id": r.match_id,
                    "round_num": int(r.round_num), "expected": float(r.p), "outcome": bool(r.y), "side": r.side, "map_name": r.map_name}
            if trade:
                base.update({"kill_idx": int(r.kill_idx), "t_s": float(r.t_s), "victim": r.victim_name, "killer": r.killer_name,
                             "nearest_ally": r.nearest_ally_name,
                             "nearest_ally_m": None if pd.isna(r.nearest_ally_cm) else round(float(r.nearest_ally_cm) / 100, 1),
                             "allies_near": None if pd.isna(r.allies_near) else int(r.allies_near), "state": r.state,
                             "why_listed": _why_trade(r, w)})
            elif spec.name == "advantage":
                base.update({"kill_idx": None if pd.isna(r.start_kill_idx) else int(r.start_kill_idx), "t_s": float(r.t0_s),
                             "team_id": r.team_id, "state": r.state, "why_listed": _why_adv(r, w)})
            elif spec.name in ("post", "retake", "keyrounds", "halfopen", "pressure"):
                base.update({"kill_idx": None, "t_s": float(getattr(r, "t_s", 0.0) or 0.0), "team_id": r.team_id,
                             "state": getattr(r, "pstate", None), "why_listed": _why_round(r, spec.name)})
            else:
                why = _why_fbo(r, w) if spec.name == "fb_open" else _why_fbr(r, w)
                base.update({"kill_idx": int(r.kill_idx), "t_s": float(r.t_s), "team_id": r.team_id,
                             "victim": r.opp_name if r.got_fb else r.duel_name, "killer": r.duel_name if r.got_fb else r.opp_name,
                             "state": "5v5", "why_listed": why})
            rows.append(base)
    return pd.DataFrame(rows)
