"""Cobertura: cruza o dicionário (contrato) com o que o pipeline implementou e validou.

Status por métrica:
  validada      roda na base real, passa na sanidade e numa verificação independente
                (checagem cruzada com campo oficial e/ou cenário sintético calculado à mão)
  implementada  roda e passa na sanidade, ainda sem verificação independente
  alerta        roda, mas falhou em sanidade / checagem cruzada / cenário
  erro          a função quebrou nesta execução
  adiada        classe M (depende de modelo estatístico) — fora do escopo desta etapa
  nao_iniciada  ainda sem código
"""
from __future__ import annotations

import html

import pandas as pd

from .metrics.base import REGISTRY

ICON = {"validada": "✅", "implementada": "🟡", "alerta": "⚠️", "erro": "❌", "adiada": "🔵", "nao_iniciada": "⬜"}
ORDER = ["validada", "implementada", "alerta", "erro", "adiada", "nao_iniciada"]


def build_coverage(cfg, res: dict, scenario: pd.DataFrame | None) -> pd.DataFrame:
    d = pd.read_csv(cfg.dictionary_path, sep=";", encoding="utf-8-sig")
    log = res["exec_log"].set_index("metric_id") if len(res["exec_log"]) else pd.DataFrame()
    san = res["sanity"].set_index("metric_id")
    xc = res["crosschecks"]
    sc = scenario if scenario is not None else pd.DataFrame(columns=["metric_id", "passou"])

    rows = []
    for rec in d.itertuples(index=False):
        mid = rec.id
        spec = REGISTRY.get(mid)
        x = xc[xc["metric_id"] == mid]
        s = sc[sc["metric_id"] == mid]
        checks = []
        if len(x):
            checks.append(f"cruzada {int(x['passou'].sum())}/{len(x)}")
        if len(s):
            checks.append(f"cenário {int(s['passou'].sum())}/{len(s)}")
        msg = ""
        if spec is None:
            status = "adiada" if rec.classe == "M" else "nao_iniciada"
            linhas = times = None
        else:
            linhas = int(san.loc[mid, "linhas"]) if mid in san.index else 0
            times = int(san.loc[mid, "times_com_dado"]) if mid in san.index else 0
            failed_run = spec.level == "round" and mid in log.index and not bool(log.loc[mid, "ok"])
            if failed_run:
                status, msg = "erro", str(log.loc[mid, "error"])
            elif mid in san.index and not bool(san.loc[mid, "sanity_ok"]):
                status, msg = "alerta", str(san.loc[mid, "sanity_msg"])
            elif (len(x) and not x["passou"].all()) or (len(s) and not s["passou"].all()):
                status = "alerta"
                msg = "falhou: " + ", ".join(list(x.loc[~x["passou"], "check"]) +
                                             [f"cenário {r.time} {r.estrato}".strip() for r in s[~s["passou"]].itertuples()])
            elif len(x) or len(s):
                status = "validada"
            else:
                status = "implementada"
        rows.append({
            "id": mid, "lente": rec.lente, "metrica": rec.metrica, "classe": rec.classe,
            "destaque": rec.destaque, "status": status, "linhas": linhas, "times_com_dado": times,
            "validacao": "; ".join(checks), "parametros": ", ".join(spec.params) if spec else "",
            "revisao_humana": ("pendente" if spec and spec.params else ("n/a" if spec else "")),
            "nivel": spec.level if spec else "", "mensagem": msg,
        })
    return pd.DataFrame(rows)


def _bar(n, total, width=20):
    filled = round(width * n / total) if total else 0
    return "█" * filled + "░" * (width - filled)


def write_coverage(status: pd.DataFrame, res: dict, cfg) -> None:
    out = cfg.output_dir / "coverage"
    out.mkdir(parents=True, exist_ok=True)
    status.to_csv(out / "metrics_status.csv", index=False, encoding="utf-8-sig")
    info = res["run_info"]
    total = len(status)
    counts = status["status"].value_counts().reindex(ORDER, fill_value=0)
    done = int(counts["validada"] + counts["implementada"])
    scope = total - int(counts["adiada"])

    by_lens = status.pivot_table(index="lente", columns="status", values="id", aggfunc="count", fill_value=0)
    by_lens = by_lens.reindex(columns=ORDER, fill_value=0)
    by_class = status.pivot_table(index="classe", columns="status", values="id", aggfunc="count", fill_value=0)
    by_class = by_class.reindex(columns=ORDER, fill_value=0).reindex(["D", "R", "P", "M"]).fillna(0).astype(int)

    q = res["quality"]
    md = [
        "# RoundRx — cobertura de métricas coletivas", "",
        f"Execução: `{info['run_at_utc']}` · config v{info['config_version']} (`{info['config_fingerprint']}`) · "
        f"base `{info['data_fingerprint']}` · {info['n_matches']} partidas · {info['n_rounds']} rounds · {info['n_teams']} times", "",
        f"**Coletadas: {done}/{scope} métricas no escopo desta etapa** ({total} no dicionário; {int(counts['adiada'])} adiadas por dependerem de modelo).", "",
        "| Status | Qtde | |", "|---|---:|---|",
    ]
    md += [f"| {ICON[s]} {s} | {int(counts[s])} | `{_bar(int(counts[s]), total)}` |" for s in ORDER]
    md += ["", "## Por lente", "", "| Lente | " + " | ".join(f"{ICON[s]}" for s in ORDER) + " | Progresso |",
           "|---|" + "---:|" * len(ORDER) + "---|"]
    for lens, r in by_lens.iterrows():
        n = int(r.sum())
        ok = int(r["validada"] + r["implementada"])
        md.append(f"| {lens} | " + " | ".join(str(int(r[s])) for s in ORDER) + f" | `{_bar(ok, n, 10)}` {ok}/{n} |")
    md += ["", "## Por classe", "", "| Classe | " + " | ".join(f"{ICON[s]}" for s in ORDER) + " |",
           "|---|" + "---:|" * len(ORDER)]
    labels = {"D": "D — direta", "R": "R — derivada por regras", "P": "P — proxy", "M": "M — modelo"}
    for c, r in by_class.iterrows():
        md.append(f"| {labels.get(c, c)} | " + " | ".join(str(int(r[s])) for s in ORDER) + " |")
    md += ["", "## Qualidade da base", "", "| Check | Descrição | Status | Falhas |", "|---|---|---|---:|"]
    md += [f"| {r.check_id} | {r.descricao} | {r.status} | {r.falhas}/{r.total} |" for r in q.itertuples()]
    md += ["", "## Métricas", "",
           "Legenda: **validação** = checagem cruzada com campo oficial da Riot e/ou cenário sintético calculado à mão. "
           "**Revisão humana pendente** = depende de limiar em `config.yaml` que um jogador/coach deve confirmar.", "",
           "| ID | Métrica | Classe | Status | Linhas | Times | Validação | Parâmetros |", "|---|---|---|---|---:|---:|---|---|"]
    for r in status.itertuples():
        md.append(f"| {r.id} | {r.metrica} | {r.classe} | {ICON[r.status]} {r.status} | "
                  f"{'' if pd.isna(r.linhas) else int(r.linhas)} | {'' if pd.isna(r.times_com_dado) else int(r.times_com_dado)} | "
                  f"{r.validacao} | {r.parametros} |")
    alerts = status[status["status"].isin(["alerta", "erro"])]
    if len(alerts):
        md += ["", "## Alertas", ""] + [f"- **{r.id}**: {r.mensagem}" for r in alerts.itertuples()]
    (out / "COVERAGE.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    (out / "coverage.html").write_text(_html(status, info, counts, done, scope, by_lens, q), encoding="utf-8")


def _html(status, info, counts, done, scope, by_lens, q) -> str:
    color = {"validada": "#1a7f37", "implementada": "#bf8700", "alerta": "#d1242f", "erro": "#d1242f",
             "adiada": "#0969da", "nao_iniciada": "#8c959f"}
    e = html.escape
    lens_rows = []
    for lens, r in by_lens.iterrows():
        n = int(r.sum())
        segs = "".join(f'<span style="width:{100 * int(r[s]) / n:.1f}%;background:{color[s]}" title="{s}: {int(r[s])}"></span>'
                       for s in ORDER if int(r[s]))
        ok = int(r["validada"] + r["implementada"])
        lens_rows.append(f"<tr><td>{e(lens)}</td><td><div class='bar'>{segs}</div></td><td class='n'>{ok}/{n}</td></tr>")
    metric_rows = "".join(
        f"<tr><td class='mono nw'>{e(r.id)}</td><td>{e(r.metrica)}</td><td>{e(r.lente)}</td><td>{e(r.classe)}</td>"
        f"<td><span class='pill' style='background:{color[r.status]}'>{e(r.status)}</span></td>"
        f"<td class='n'>{'' if pd.isna(r.linhas) else f'{int(r.linhas):,}'.replace(',', '.')}</td>"
        f"<td>{e(r.validacao)}</td><td class='mono small'>{e(r.parametros)}</td></tr>" for r in status.itertuples())
    legend = "".join(f"<span><i style='background:{color[s]}'></i>{s} ({int(counts[s])})</span>" for s in ORDER)
    qrows = "".join(f"<tr><td class='mono'>{e(r.check_id)}</td><td>{e(r.descricao)}</td><td>{e(r.status)}</td>"
                    f"<td class='n'>{r.falhas}/{r.total}</td></tr>" for r in q.itertuples())
    return f"""<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RoundRx — Cobertura</title><style>
:root{{--bg:#fff;--fg:#1f2328;--mut:#59636e;--line:#d1d9e0;--card:#f6f8fa}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0d1117;--fg:#e6edf3;--mut:#9198a1;--line:#30363d;--card:#151b23}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}}
main{{max-width:1100px;margin:0 auto;padding:24px 16px}} h1{{font-size:22px;margin:0 0 4px}} h2{{font-size:16px;margin:28px 0 8px}}
.mut{{color:var(--mut)}} .big{{font-size:34px;font-weight:700}} .card{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px}}
.legend span{{margin-right:14px;white-space:nowrap}} .legend i{{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}}
table{{width:100%;border-collapse:collapse}} td,th{{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}}
.n{{text-align:right;font-variant-numeric:tabular-nums}} .mono{{font-family:ui-monospace,Consolas,monospace}} .nw{{white-space:nowrap}} .small{{font-size:12px}}
.bar{{display:flex;height:12px;border-radius:3px;overflow:hidden;background:var(--line);min-width:160px}} .bar span{{display:block;height:100%}}
.pill{{color:#fff;border-radius:10px;padding:1px 8px;font-size:12px;white-space:nowrap}} .wrap{{overflow-x:auto}}
</style></head><body><main>
<h1>RoundRx — cobertura de métricas coletivas</h1>
<div class="mut">Execução {e(info['run_at_utc'])} · config v{e(info['config_version'])} ({e(info['config_fingerprint'])}) · base {e(info['data_fingerprint'])} ·
{info['n_matches']} partidas · {info['n_rounds']} rounds · {info['n_teams']} times</div>
<div class="card" style="margin-top:16px"><div class="big">{done}/{scope}</div><div class="mut">métricas coletadas no escopo desta etapa ({len(status)} no dicionário; {int(counts['adiada'])} adiadas por dependerem de modelo)</div>
<div class="legend" style="margin-top:8px">{legend}</div></div>
<h2>Por lente</h2><div class="wrap"><table>{''.join(lens_rows)}</table></div>
<h2>Métricas</h2><div class="wrap"><table><tr><th>ID</th><th>Métrica</th><th>Lente</th><th>Classe</th><th>Status</th><th class="n">Linhas</th><th>Validação</th><th>Parâmetros (revisão humana)</th></tr>{metric_rows}</table></div>
<h2>Qualidade da base</h2><div class="wrap"><table>{qrows}</table></div>
</main></body></html>"""
