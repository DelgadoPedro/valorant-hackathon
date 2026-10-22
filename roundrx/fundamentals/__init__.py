"""Fundamentos coletivos: eventos com contexto -> baselines -> padrões -> evidências.

Roda depois do pipeline de métricas (precisa das tabelas canônicas e derivadas). Pode ser executado sozinho a partir
de outputs/ com `python -m roundrx fundamentals`.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

CANONICAL = ["manifest", "matches", "teams", "players", "rounds", "round_players", "kills",
             "kill_positions", "objective_positions", "damage"]


def load_context(cfg):
    """Reconstrói o Context das métricas a partir de outputs/ (sem reprocessar os JSONs)."""
    from ..metrics.base import Context
    out = cfg.output_dir
    t = {k: pd.read_parquet(out / "canonical" / f"{k}.parquet") for k in CANONICAL}
    ev = pd.read_parquet(out / "derived" / "round_events.parquet")
    trades = pd.read_parquet(out / "derived" / "trades.parquet")
    tr = pd.read_parquet(out / "derived" / "team_rounds.parquet")
    return Context(t, ev, trades, tr, cfg)


def run(ctx, cfg, quiet: bool = False) -> dict[str, pd.DataFrame]:
    from .baselines import fit_advantage_baselines, fit_fb_baselines, fit_trade_baselines
    from .events import build_advantage_episodes, build_death_events, build_fb_events
    from .evidence import build_evidence
    from .patterns import (_prepare, adv_spec, calibrate_threshold, detect_patterns, fbo_spec, fbr_spec, trade_spec,
                           validate_detector)

    log = (lambda m: None) if quiet else (lambda m: print(f"[roundrx] {m}", flush=True))
    P = cfg["fundamentals"]["patterns"]
    log("fundamentos: eventos com contexto (mortes, vantagens numéricas e first blood)…")
    deaths = build_death_events(ctx)
    adv = build_advantage_episodes(ctx)
    fb = build_fb_events(ctx)
    log("fundamentos: baselines (validação por série, leave-one-team-out)…")
    deaths, rep_t = fit_trade_baselines(deaths, cfg)
    adv, rep_a = fit_advantage_baselines(adv, cfg)
    fb, rep_f = fit_fb_baselines(fb, cfg)
    # conversão depois de FAZER o FB = a vantagem 5v4 aberta pelo first blood (mesmo esperado do fundamento de vantagem)
    conv = adv.loc[adv["from_fb"] & adv["eligible"], ["match_id", "round_num", "team_id", "exp_adv_won"]]
    fb = fb.merge(conv.rename(columns={"exp_adv_won": "exp_fb_conv"}), on=["match_id", "round_num", "team_id"], how="left")
    out = {"death_events": deaths, "advantage_episodes": adv, "fb_events": fb,
           "baseline_report": pd.concat([rep_t, rep_a, rep_f], ignore_index=True)}
    pats, evs, vals, nulls = [], [], [], []
    for spec, events in ((trade_spec(cfg), deaths), (adv_spec(cfg), adv), (fbo_spec(cfg), fb), (fbr_spec(cfg), fb)):
        z_star, null = calibrate_threshold(_prepare(events, cfg, spec), cfg, spec)
        log(f"fundamentos: padrões de {spec.name} (z* = {z_star:.2f})…")
        pt = detect_patterns(events, cfg, z_star, spec)
        vals.append(validate_detector(events, cfg, z_star, n_null=P["validation_null_runs"], spec=spec))
        evs.append(build_evidence(events, pt, cfg, spec))
        nulls.append(null.assign(z_star=z_star, fundamental=spec.name))
        sel = pt[pt["scope"] == "todas"]
        log(f"fundamentos: {spec.name}: {int(sel['selected'].sum())} padrões em {sel.loc[sel['selected'], 'team'].nunique()} de "
            f"{sel['team'].nunique()} times (todas as partidas)")
        pats.append(pt)
    out.update({"patterns": pd.concat(pats, ignore_index=True), "evidence": pd.concat(evs, ignore_index=True),
                "detector_validation": pd.concat(vals, ignore_index=True), "null_calibration": pd.concat(nulls, ignore_index=True)})
    return out


def write(res: dict[str, pd.DataFrame], cfg) -> Path:
    out = cfg.output_dir / "fundamentals"
    out.mkdir(parents=True, exist_ok=True)
    for k, df in res.items():
        df.to_parquet(out / f"{k}.parquet", index=False)
        if k not in ("death_events", "advantage_episodes", "fb_events"):
            df.to_csv(out / f"{k}.csv", index=False, encoding="utf-8-sig")
    return out
