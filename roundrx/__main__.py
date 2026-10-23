"""CLI do RoundRx.

    python -m roundrx run                 # pipeline completo: JSON -> métricas -> cobertura
    python -m roundrx run --data-dir X    # aponta para outra pasta de JSONs
    python -m roundrx selftest            # só o cenário sintético (rápido)
    python -m roundrx fundamentals        # só a camada de diagnóstico (usa outputs/ já gerado) + painel
    python -m roundrx viz                 # só o painel
    python -m roundrx private             # painéis privados por time, com código de acesso (../valostrat-times)
"""
from __future__ import annotations

import argparse
import sys
import time

from .config import load_config


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="roundrx")
    ap.add_argument("command", choices=["run", "selftest", "viz", "fundamentals", "private"])
    ap.add_argument("--config", default=None)
    ap.add_argument("--data-dir", default=None)
    ap.add_argument("--skip-selftest", action="store_true")
    ap.add_argument("--dest", default=None, help="private: pasta de saída (padrão: ../valostrat-times, fora do repositório)")
    a = ap.parse_args(argv)
    try:  # consoles Windows antigos: evita erro de encoding ao imprimir acentos
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass
    cfg = load_config(a.config, a.data_dir)

    from .validation import run_scenario

    if a.command == "selftest":
        sc = run_scenario(cfg)
        print(sc.to_string(index=False))
        return 0 if sc["passou"].all() else 1

    if a.command == "fundamentals":
        from .fundamentals import load_context, run as run_fund, write as write_fund
        from .viz.build import build_html
        out = write_fund(run_fund(load_context(cfg), cfg), cfg)
        print(f"[roundrx] diagnóstico: {out}")
        print(f"[roundrx] painel: {build_html(cfg.output_dir, cfg)}")
        return 0

    if a.command == "private":
        from pathlib import Path
        from .viz.private import build_private_site
        dest = Path(a.dest) if a.dest else Path(cfg.root).resolve().parent / "valostrat-times"
        codes = build_private_site(cfg.output_dir, cfg, dest)
        print(f"[roundrx] site privado: {dest / 'site'}  (publique só esta pasta)")
        print(f"[roundrx] códigos de acesso: {dest / 'CODIGOS.txt'}  (não publique)")
        for t, c in codes.items():
            print(f"  {t:<18} {c}")
        return 0

    if a.command == "viz":
        from .viz.build import build_html
        print(f"[roundrx] painel: {build_html(cfg.output_dir, cfg)}")
        return 0

    t0 = time.time()
    scenario = None
    if not a.skip_selftest:
        print("[roundrx] cenário sintético…", flush=True)
        scenario = run_scenario(cfg)
        print(f"[roundrx]   {int(scenario['passou'].sum())}/{len(scenario)} verificações passaram", flush=True)
    from .pipeline import compute, write_outputs

    res = compute(cfg)
    out = write_outputs(res, cfg, scenario)
    st = __import__("pandas").read_csv(out / "coverage" / "metrics_status.csv")
    c = st["status"].value_counts()
    print(f"[roundrx] pronto em {time.time() - t0:.0f}s -> {out}")
    print("[roundrx] cobertura: " + ", ".join(f"{k}={v}" for k, v in c.items()))
    print(f"[roundrx] relatório: {out / 'coverage' / 'COVERAGE.md'}")
    from .fundamentals import load_context, run as run_fund, write as write_fund
    print(f"[roundrx] diagnóstico: {write_fund(run_fund(load_context(cfg), cfg), cfg)}")
    from .viz.build import build_html
    print(f"[roundrx] painel: {build_html(out, cfg)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
