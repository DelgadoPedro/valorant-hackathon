"""Orquestração: JSON -> tabelas canônicas -> estados -> métricas -> agregados -> qualidade/cobertura."""
from __future__ import annotations

import hashlib
import os
import tempfile
import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from . import __version__
from .aggregate import build_all
from .ingest import ingest
from .metrics import REGISTRY, Context, run_all
from .quality import run_quality, team_rosters
from .states import build_round_events, build_team_rounds, build_trades
from .validation import crosschecks, sanity

CANONICAL = ["manifest", "matches", "teams", "players", "rounds", "round_players", "kills",
             "kill_positions", "objective_positions", "damage"]


def _log(quiet, msg):
    if not quiet:
        print(msg, flush=True)


def compute(cfg, data_dir: Path | None = None, quiet: bool = False) -> dict:
    timings = {}
    data_dir = Path(data_dir) if data_dir else cfg.data_dir

    def step(name, fn):
        t0 = time.time()
        _log(quiet, f"[roundrx] {name}…")
        out = fn()
        timings[name] = round(time.time() - t0, 2)
        return out

    t = step("ingestão", lambda: ingest(data_dir))
    events = step("linha do tempo (vivos/revives)", lambda: build_round_events(t))
    trades = step("trades", lambda: build_trades(t, cfg["timing"]["trade_window_s"]))
    team_rounds = step("time-round + economia", lambda: build_team_rounds(t, cfg))
    quality = step("qualidade", lambda: run_quality(t, events))
    ctx = Context(t, events, trades, team_rounds, cfg)
    rows, exec_log = step("métricas", lambda: run_all(ctx))
    agg = step("agregação", lambda: build_all(rows, team_rounds, cfg))
    san = step("sanidade", lambda: sanity(agg["metrics_round"], agg["metrics_team"]))
    xc = step("checagens cruzadas", lambda: crosschecks(t, agg["metrics_round"], team_rounds))

    data_fp = hashlib.sha256("".join(sorted(t["manifest"]["sha256"])).encode()).hexdigest()[:12]
    run_info = {
        "roundrx_version": __version__,
        "run_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "config_version": cfg["version"],
        "config_fingerprint": cfg.fingerprint,
        "data_fingerprint": data_fp,
        "data_dir": os.path.relpath(data_dir, cfg.root) if not str(data_dir).startswith(tempfile.gettempdir()) else "<temp>",
        "n_files": int(len(t["manifest"])),
        "n_matches": int(t["matches"]["match_id"].nunique()),
        "n_rounds": int(len(t["rounds"])),
        "n_teams": int(team_rounds["team_name"].nunique()),
        "n_metric_rows": int(len(rows)),
        "python": platform.python_version(),
        "pandas": pd.__version__,
        "timings_s": timings,
    }
    return {**{f"canonical/{k}": t[k] for k in CANONICAL},
            "derived/round_events": events, "derived/trades": trades, "derived/team_rounds": team_rounds,
            "derived/leverage": ctx.lev[0], "leverage_report": ctx.lev[1],
            **agg, "quality": quality, "team_rosters": team_rosters(t), "exec_log": exec_log, "sanity": san, "crosschecks": xc,
            "run_info": run_info}


def catalog(cfg) -> pd.DataFrame:
    """Catálogo das métricas implementadas (contrato com a etapa de visualização)."""
    rows = [{"metric_id": s.metric_id, "agregacao": s.agg, "unidade": s.unit, "nivel": s.level,
             "regra_implementada": s.definition, "parametros": ", ".join(s.params),
             "checagem_cruzada": s.crosscheck} for s in REGISTRY.values()]
    d = pd.read_csv(cfg.dictionary_path, sep=";", encoding="utf-8-sig")
    return d.merge(pd.DataFrame(rows), left_on="id", right_on="metric_id", how="left").drop(columns=["metric_id"])


def write_outputs(res: dict, cfg, scenario: pd.DataFrame | None = None) -> Path:
    from .coverage import build_coverage, write_coverage

    out = cfg.output_dir
    write_csv = cfg["output"]["write_csv"]
    for sub in ("canonical", "derived", "metrics", "quality", "coverage"):
        (out / sub).mkdir(parents=True, exist_ok=True)

    def save(df: pd.DataFrame, rel: str, csv: bool):
        df.to_parquet(out / f"{rel}.parquet", index=False)
        if csv:
            df.to_csv(out / f"{rel}.csv", index=False, encoding="utf-8-sig")

    for k in [k for k in res if k.startswith(("canonical/", "derived/"))]:
        save(res[k], k, cfg["output"]["write_canonical_csv"])
    for k in [k for k in res if k.startswith("metrics_")]:
        save(res[k], f"metrics/{k}", write_csv and k != "metrics_round")
    catalog(cfg).to_csv(out / "metrics" / "metrics_catalog.csv", index=False, encoding="utf-8-sig")
    res["quality"].to_csv(out / "quality" / "quality_report.csv", index=False, encoding="utf-8-sig")
    res["crosschecks"].to_csv(out / "quality" / "crosschecks.csv", index=False, encoding="utf-8-sig")
    (out / "leverage").mkdir(parents=True, exist_ok=True)
    res["leverage_report"].to_csv(out / "leverage" / "model_report.csv", index=False, encoding="utf-8-sig")
    res["team_rosters"].to_csv(out / "quality" / "team_rosters.csv", index=False, encoding="utf-8-sig")
    if scenario is not None:
        scenario.to_csv(out / "quality" / "synthetic_scenario.csv", index=False, encoding="utf-8-sig")

    status = build_coverage(cfg, res, scenario)
    write_coverage(status, res, cfg)
    with open(out / "run_manifest.json", "w", encoding="utf-8") as fh:
        json.dump(res["run_info"], fh, indent=2, ensure_ascii=False)
    return out
