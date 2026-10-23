"""Painéis privados por time (teste com equipes convidadas).

Gera um site estático em que cada time entra com um código de acesso e vê só o próprio painel:

- **Minimização:** cada time recebe um payload próprio. As partidas do time ficam completas (inclusive o lado do
  adversário, que é da mesma partida). As partidas entre outros times continuam no arquivo só para as comparações
  com a liga, mas anonimizadas: times viram "Outro time NN" em ordem aleatória, jogadores ficam sem nome, e
  data, arquivo, competição, fase e série são apagados. Um adversário recebe uma identidade anônima diferente nas
  partidas que não são contra o time, então não dá para ligar o nome dele aos outros jogos. Padrões de outros
  times (que trazem nomes de jogadores nos rótulos) são removidos.
- **Criptografia:** o payload de cada time vai em `data/<id>.bin`, cifrado com AES-GCM; a chave vem do código de
  acesso (PBKDF2-SHA256, 200 mil iterações) e o `<id>` do arquivo é um hash do código. Sem o código, o arquivo é
  ilegível e não se sabe qual arquivo é de qual time. Imagens públicas (mapas, agentes) ficam fora da cifra.

Uso: `python -m roundrx private` (padrão: grava em ../valostrat-times, fora do repositório).
A pasta `site/` é o que vai para a hospedagem; `CODIGOS.txt` fica fora dela e não deve ser publicado.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import os
import random
import secrets
from pathlib import Path

from .build import HERE, _team_logos, build_payload

# painel de demonstração (coaches): dados reais de um time, com nome fictício e todos os nomes ocultos
DEMOS = {"demo_esports": ("azure_bears_black", "Demo Esports")}   # chave do código: (time de origem, nome exibido)
TEAMS = ["axis_anteaters", "caap_auroras", "caap_hellhounds", "usp_stars", "usp_stars_gc", "fei_darkowls", "fei_whiteowls"]
# acessos extras: painel completo (admin) e grupos de times de uma organização
GROUPS = {"azure_bears (4 times)": ("AZURE", ["azure_bears_black", "azure_bears_golden", "azure_bears_silver", "azure_bears_white"]),
          "ceub (2 times)": ("CEUB", ["ceub_octopus", "ceub_octopus_vulgaris"])}
ADMIN = ("admin (todos os times)", "ADMIN")
PUBLIC_KEYS = ("MAPIMG", "SPLASH", "AGIMG")   # imagens oficiais, iguais para todos: ficam fora da cifra
ITER = 200_000
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # sem 0/O e 1/I


def _unrle(c):
    return [v for v, n in zip(*c["rle"]) for _ in range(n)] if isinstance(c, dict) and "rle" in c else list(c)


def anonymize(payload: dict, focal_name, seed: int = 0) -> dict:
    """`focal_name`: um time ou uma lista de times (ex.: todos os times de uma organização)."""
    p = json.loads(json.dumps(payload))   # cópia profunda
    teams, M = p["teams"], p["M"]
    ds = sorted(d for d in M["date"] if d)
    p["PERIOD"] = [ds[0], ds[-1]] if ds else None   # período da base inteira (as datas de outros jogos são apagadas)
    focals = [focal_name] if isinstance(focal_name, str) else list(focal_name)
    FOC = [teams.index(x) for x in focals]
    fset = set(FOC)
    nM = len(M["id"])
    fm = [M["red"][i] in fset or M["blue"][i] in fset for i in range(nM)]          # partidas do(s) time(s)
    opps = sorted({t for i in range(nM) if fm[i] for t in (M["red"][i], M["blue"][i]) if t not in fset}, key=lambda t: teams[t])
    others = [t for t in range(len(teams)) if t not in fset and t not in opps]
    # índices novos: time(s), adversários (nome real), depois um bloco anônimo embaralhado
    real = {**{t: k for k, t in enumerate(FOC)}, **{t: len(FOC) + k for k, t in enumerate(opps)}}
    anon_keys = [("o", t) for t in others] + [("d", t) for t in opps]   # "d" = identidade anônima do adversário fora dos jogos com o time
    random.Random(f"{seed}:{'+'.join(focals)}").shuffle(anon_keys)
    base = len(FOC) + len(opps)
    anon = {k: base + i for i, k in enumerate(anon_keys)}
    new_teams = [teams[t] for t in FOC] + [teams[t] for t in opps] + [f"Outro time {i + 1:02d}" for i in range(len(anon_keys))]

    def t_row(t, m):              # índice de time numa linha da partida m
        if t is None:
            return None
        if fm[m]:
            return real[t]
        return anon[("d", t)] if t in real else anon[("o", t)]

    def t_agg(t):                 # índice de time num agregado do time inteiro
        if t is None:
            return None
        if t in fset:
            return real[t]
        return anon[("d", t)] if t in real else anon[("o", t)]

    # jogadores: quem aparece nas partidas do time mantém o nome nelas; fora delas vira um id anônimo sem nome
    players = p["players"]
    sb_m, sb_p = p["SB"]["m"], p["SB"]["p"]
    seen = {sb_p[i] for i in range(len(sb_p)) if fm[sb_m[i]] and sb_p[i] is not None}
    for i, m in enumerate(p["K"]["m"]):
        if fm[m]:
            seen.update(x for x in (p["K"]["v"][i], p["K"]["k"][i], p["K"]["trd"][i]) if x is not None)
    for m, pa in zip(p["C"]["m"], p["C"]["pa"]):
        if fm[m]:
            seen.update(pa[0::2])
    n0 = len(players)
    dup = {q: n0 + k for k, q in enumerate(sorted(seen))}
    new_players = [players[q] if q in seen else "—" for q in range(n0)] + ["—"] * len(dup)

    def p_row(q, m):
        if q is None or fm[m]:
            return q
        return dup.get(q, q)

    # partidas
    for i in range(nM):
        M["red"][i], M["blue"][i] = t_row(M["red"][i], i), t_row(M["blue"][i], i)
        if not fm[i]:
            for k in ("file", "comp", "stage", "series", "date"):
                M[k][i] = ""
    # tabelas por linha de partida
    TM = p["TM"]
    TM["t"], TM["m"], TM["sd"] = _unrle(TM["t"]), _unrle(TM["m"]), _unrle(TM["sd"])
    TM["t"] = [t_row(t, m) for t, m in zip(TM["t"], TM["m"])]
    for key in ("R", "P"):
        p[key]["t"] = [t_row(t, m) for t, m in zip(p[key]["t"], p[key]["m"])]
    K = p["K"]
    K["vt"] = [t_row(t, m) for t, m in zip(K["vt"], K["m"])]
    for c in ("v", "k", "trd"):
        K[c] = [p_row(q, m) for q, m in zip(K[c], K["m"])]
    C = p["C"]
    C["t"] = [t_row(t, m) for t, m in zip(C["t"], C["m"])]
    C["pa"] = [[p_row(x, m) if j % 2 == 0 else x for j, x in enumerate(pa)] for pa, m in zip(C["pa"], C["m"])]
    SB = p["SB"]
    SB["t"] = [t_row(t, m) for t, m in zip(SB["t"], SB["m"])]
    SB["p"] = [p_row(q, m) for q, m in zip(SB["p"], SB["m"])]
    AG = p["AG"]
    AG["t"] = [t_agg(t) for t in AG["t"]]
    # fundamentos: eventos por linha de partida; padrões só do time (rótulos de outros times citam jogadores)
    if p.get("FUND"):
        for F in p["FUND"]["F"].values():
            E = F["E"]
            E["m"] = _unrle(E["m"])
            E["t"] = [t_row(t, m) for t, m in zip(E["t"], E["m"])]
            for c in ("v", "a"):
                if c in E:
                    E[c] = [p_row(q, m) for q, m in zip(E[c], E["m"])]
            FD = F["FD"]
            keep = [i for i, t in enumerate(FD["t"]) if t in fset]
            remap = {old: new for new, old in enumerate(keep)}
            for c in list(FD):
                FD[c] = [FD[c][i] for i in keep]
            FD["t"] = [real[t] for t in FD["t"]]
            EV = F["EV"]
            rows = [i for i, x in enumerate(EV["f"]) if x in remap]
            for c in list(EV):
                EV[c] = [EV[c][i] for i in rows]
            EV["f"] = [remap[x] for x in EV["f"]]
            KP = F["KP"]
            KP["tc"] = [t_row(t, m) for t, m in zip(KP["tc"], KP["m"])]
            KP["p"] = [p_row(q, m) for q, m in zip(KP["p"], KP["m"])]
    p["teams"], p["players"] = new_teams, new_players
    p["LOCK"] = 0 if len(FOC) == 1 else list(range(len(FOC)))
    return p


def demoize(p: dict, mock_name: str, src: str = "", seed: int = 0) -> dict:
    """Sobre um payload já anonimizado (time = índice 0): troca o nome do time por um fictício, os adversários por
    "Adversário NN" e todos os jogadores por "Jogador N" (time) / "Oponente NN" (adversários); apaga competição, fase,
    série, arquivo e logos, e desloca as datas para não casar com resultados públicos."""
    import datetime as dt
    import re
    teams, M, SB = p["teams"], p["M"], p["SB"]
    nM = len(M["id"])
    fm = [M["red"][i] == 0 or M["blue"][i] == 0 for i in range(nM)]
    nopp = len({(M["blue"][i] if M["red"][i] == 0 else M["red"][i]) for i in range(nM) if fm[i]})
    order = list(range(1, 1 + nopp))
    random.Random(f"{seed}:{mock_name}:opp").shuffle(order)
    new_teams = list(teams)
    new_teams[0] = mock_name
    for k, t in enumerate(order):
        new_teams[t] = f"Adversário {k + 1:02d}"
    # jogadores: do time por rounds jogados (Jogador 1 = quem mais jogou); adversários embaralhados
    rounds_by = {}
    side_of = {}
    for i, q in enumerate(SB["p"]):
        if q is None or not fm[SB["m"][i]]:
            continue
        side_of.setdefault(q, SB["t"][i] == 0)
        rounds_by[q] = rounds_by.get(q, 0) + sum(SB.get(c, [0] * len(SB["p"]))[i] or 0 for c in ("rp0", "rp1"))
    ours = sorted([q for q, mine in side_of.items() if mine], key=lambda q: -rounds_by[q])
    theirs = [q for q, mine in side_of.items() if not mine]
    random.Random(f"{seed}:{mock_name}:pl").shuffle(theirs)
    real = {q: p["players"][q] for q in side_of}
    pseudo = {**{q: f"Jogador {k + 1}" for k, q in enumerate(ours)}, **{q: f"Oponente {k + 1:02d}" for k, q in enumerate(theirs)}}
    players = list(p["players"])
    for q, name in pseudo.items():
        players[q] = name
    # nomes reais que aparecem em rótulos de padrões e motivos das evidências
    subs = sorted(((real[q], pseudo[q]) for q in pseudo if real[q] and real[q] != "—"), key=lambda x: -len(x[0]))
    def scrub(text):
        if not isinstance(text, str):
            return text
        for a, b in subs:
            text = re.sub(r"(?<![\w])" + re.escape(a) + r"(?![\w])", b, text)
        return text
    if p.get("FUND"):
        for F in p["FUND"]["F"].values():
            FD = F["FD"]
            FD["label"] = [scrub(x) for x in FD["label"]]
            FD["id"] = [scrub(x.replace(f"|{src}|", f"|{mock_name}|")) if src else scrub(x) for x in FD["id"]]
            FD["dims"] = [json.loads(scrub(json.dumps(d, ensure_ascii=False))) for d in FD["dims"]]
            FD["parent"] = [scrub(x) for x in FD["parent"]]
            F["EV"]["why"] = [scrub(x) for x in F["EV"]["why"]]
            F["cats"] = json.loads(scrub(json.dumps(F["cats"], ensure_ascii=False)))
    shift = dt.timedelta(days=random.Random(f"{seed}:{mock_name}:d").randint(-45, -25))
    for i in range(nM):
        for k in ("file", "comp", "stage", "series"):
            M[k][i] = ""
        if M["date"][i]:
            M["date"][i] = (dt.date.fromisoformat(str(M["date"][i])[:10]) + shift).isoformat()
    p["PERIOD"] = None
    p["teams"], p["players"] = new_teams, players
    p["TEAMLOGO"] = [None] * len(new_teams)
    p["DEMO"] = True
    return p


def _code(prefix: str) -> str:
    rnd = "".join(secrets.choice(ALPHABET) for _ in range(8))
    return f"{prefix}-{rnd[:4]}-{rnd[4:]}"


def _norm(code: str) -> str:
    return "".join(code.split()).upper()


def _file_id(code: str) -> str:
    return hashlib.sha256(("valostrat:" + _norm(code)).encode()).hexdigest()[:24]


def _encrypt(obj: dict, code: str) -> bytes:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    raw = gzip.compress(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9)
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(_norm(code).encode())
    return salt + iv + AESGCM(key).encrypt(iv, raw, None)


def _read_codes(path: Path) -> dict:
    codes = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "\t" in line and not line.startswith("#"):
                team, code = line.split("\t")[:2]
                codes[team.strip()] = code.strip()
    return codes


LOGIN = """
<div id="gate" class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
  <form class="gate-card" id="gate-form" autocomplete="off">
    <span class="gate-mark" aria-hidden="true"><!--__LOGO__--></span>
    <h1 id="gate-title">ValoStrat<span>.gg</span></h1>
    <p>Digite o código de acesso do seu time.</p>
    <input id="gate-code" name="code" type="text" inputmode="text" autocapitalize="characters" spellcheck="false"
           placeholder="EX.: TIME-ABCD-1234" aria-label="Código de acesso" required>
    <button id="gate-btn" type="submit">Entrar</button>
    <p class="gate-msg" id="gate-msg" role="status" aria-live="polite"></p>
    <p class="gate-note">Cada código abre só o painel do próprio time.</p>
  </form>
</div>
<style>
.gate { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 16px; background: var(--bg, #0b141c); }
.gate-card { width: min(380px, 100%); display: grid; gap: 14px; justify-items: center; text-align: center; padding: 32px 28px;
  background: var(--panel, #101f2a); border: 1px solid var(--line, #2b414e); color: var(--ink, #f5f0e8); }
.gate-mark { width: 72px; height: 72px; display: inline-flex; } .gate-mark svg { width: 100%; height: 100%; }
.gate-card h1 { margin: 0; font: 800 34px/1 var(--f-display, sans-serif); letter-spacing: -.04em; } .gate-card h1 span { color: var(--accent, #ff4655); }
.gate-card p { margin: 0; color: var(--mut, #b2c1c9); font-size: 14px; }
.gate-card input { width: 100%; padding: 12px 14px; font: 600 16px/1.2 var(--f-mono, monospace); letter-spacing: .08em; text-align: center; text-transform: uppercase;
  color: var(--ink, #f5f0e8); background: var(--bg, #0b141c); border: 1px solid var(--line, #2b414e); }
.gate-card input:focus { outline: 2px solid var(--accent, #ff4655); outline-offset: 1px; }
.gate-card button { width: 100%; padding: 12px; font: 700 15px/1 var(--f-body, sans-serif); color: #fff; background: var(--accent, #ff4655); border: 0; cursor: pointer; }
.gate-card button[disabled] { opacity: .6; cursor: progress; }
.gate-msg { min-height: 1.2em; } .gate-msg.err { color: var(--bad, #ff8993) !important; }
.gate-note { font-size: 12px !important; color: var(--faint, #93a7b2) !important; }
</style>
<script>
document.addEventListener("DOMContentLoaded", function () {
  const STORE = "valostrat-code", ITER = __ITER__;
  const $ = (id) => document.getElementById(id), msg = $("gate-msg"), btn = $("gate-btn"), input = $("gate-code");
  const norm = (c) => c.replace(/\\s+/g, "").toUpperCase();
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  async function unlock(code) {
    const id = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("valostrat:" + code))).slice(0, 24);
    const r = await fetch("data/" + id + ".bin", { cache: "no-store" });
    if (!r.ok) throw new Error("codigo");
    const buf = new Uint8Array(await r.arrayBuffer());
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: buf.slice(0, 16), iterations: ITER, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const gz = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(16, 28) }, key, buf.slice(28));
    const text = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    window.RRX = Object.assign(JSON.parse(text), window.RRX_ASSETS || {});
    const s = document.createElement("script");
    s.textContent = $("rrx-app").textContent;
    document.body.appendChild(s);
    $("gate").remove();
  }
  async function go(code, remember) {
    btn.disabled = true; msg.className = "gate-msg"; msg.textContent = "Abrindo o painel…";
    try {
      await unlock(code);
      if (remember) { try { localStorage.setItem(STORE, code); } catch (e) { /* sem storage */ } }
    } catch (e) {
      try { localStorage.removeItem(STORE); } catch (e2) { /* ok */ }
      msg.className = "gate-msg err";
      msg.textContent = location.protocol === "file:" ? "Abra pelo endereço do site (ou por um servidor local), não pelo arquivo."
        : "Código inválido. Confira e tente de novo.";
      btn.disabled = false; input.focus();
    }
  }
  $("gate-form").addEventListener("submit", (ev) => { ev.preventDefault(); const c = norm(input.value); if (c) go(c, true); });
  if (/(^|[#&])sair\\b/.test(location.hash)) { try { localStorage.removeItem(STORE); } catch (e) { /* ok */ } history.replaceState(null, "", location.pathname); }
  let saved = null; try { saved = localStorage.getItem(STORE); } catch (e) { /* ok */ }
  if (saved) go(saved, true); else input.focus();
});
</script>
"""


def build_private_site(out: Path, cfg, dest: Path, teams=TEAMS) -> dict:
    payload = build_payload(out, cfg)
    public = {k: payload.pop(k) for k in PUBLIC_KEYS}
    public["MISSIONIMG"] = {f.stem.capitalize(): base64.b64encode(f.read_bytes()).decode()
                            for f in sorted((HERE / "vendor" / "mission").glob("*.jpg"))}
    site = dest / "site"
    (site / "data").mkdir(parents=True, exist_ok=True)
    for old in (site / "data").glob("*.bin"):
        old.unlink()
    codes_path = dest / "CODIGOS.txt"
    codes = _read_codes(codes_path)
    for t in teams:
        if t not in payload["teams"]:
            raise SystemExit(f"time não encontrado na base: {t}")
        codes.setdefault(t, _code(t.split("_")[0].upper()[:5]))
        pt = anonymize(payload, t)
        pt["TEAMLOGO"] = _team_logos(pt["teams"], HERE / "vendor" / "teams")
        (site / "data" / f"{_file_id(codes[t])}.bin").write_bytes(_encrypt(pt, codes[t]))
    for mock, (src, shown) in DEMOS.items():   # painéis de demonstração (coaches)
        key = f"{mock} ({src})"
        codes.setdefault(key, _code("COACH"))
        pt = demoize(anonymize(payload, src), shown, src)
        (site / "data" / f"{_file_id(codes[key])}.bin").write_bytes(_encrypt(pt, codes[key]))
    for key, (prefix, group) in GROUPS.items():   # vários times de uma organização, com seletor entre eles
        codes.setdefault(key, _code(prefix))
        pt = anonymize(payload, group)
        pt["TEAMLOGO"] = _team_logos(pt["teams"], HERE / "vendor" / "teams")
        (site / "data" / f"{_file_id(codes[key])}.bin").write_bytes(_encrypt(pt, codes[key]))
    akey, aprefix = ADMIN                          # painel completo, sem anonimização
    codes.setdefault(akey, _code(aprefix))
    pa = json.loads(json.dumps(payload))
    pa["TEAMLOGO"] = _team_logos(pa["teams"], HERE / "vendor" / "teams")
    (site / "data" / f"{_file_id(codes[akey])}.bin").write_bytes(_encrypt(pa, codes[akey]))
    keys = list(teams) + [f"{m} ({s})" for m, (s, _) in DEMOS.items()] + list(GROUPS) + [akey]
    codes_path.write_text("# Códigos de acesso (NÃO publicar este arquivo)\n# time\tcódigo\n"
                          + "".join(f"{t}\t{codes[t]}\n" for t in keys), encoding="utf-8")
    codes = {k: codes[k] for k in keys}
    # página: o mesmo template do painel, com o app guardado até o código abrir os dados
    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    font = base64.b64encode((HERE / "vendor" / "fonts" / "archivo-latin-wdth-normal.woff2").read_bytes()).decode()
    fonts = ('@font-face { font-family: "Archivo"; font-style: normal; font-display: swap; font-weight: 100 900; '
             f'font-stretch: 62% 125%; src: url(data:font/woff2;base64,{font}) format("woff2"); }}')
    logo = (HERE / "vendor" / "logo" / "valostrat-mark.svg").read_text(encoding="utf-8").strip()
    gate = LOGIN.replace("__ITER__", str(ITER)).replace("<!--__LOGO__-->", logo)
    app = (HERE / "app.js").read_text(encoding="utf-8")
    html = (tpl.replace("<!--__LOGO__-->", logo)
               .replace("__FAVICON__", "data:image/svg+xml;base64," + base64.b64encode(logo.encode()).decode())
               .replace("/*__FONTS__*/", fonts)
               .replace("/*__ICONS__*/", "window.RRX_ICONS=" + (HERE / "vendor" / "icons.json").read_text(encoding="utf-8") + ";")
               .replace("/*__DESIGN_SYSTEM_CSS__*/", (HERE / "design-system.css").read_text(encoding="utf-8"))
               .replace("/*__CSS__*/", (HERE / "app.css").read_text(encoding="utf-8"))
               .replace("/*__MISSION_CSS__*/", (HERE / "mission.css").read_text(encoding="utf-8"))
               .replace("/*__D3__*/", (HERE / "vendor" / "d3.min.js").read_text(encoding="utf-8"))
               .replace("/*__DATA__*/", "window.RRX_ASSETS=" + json.dumps(public, separators=(",", ":")).replace("</", "<\\/") + ";")
               .replace("/*__MISSION_REPORT_JS__*/", (HERE / "mission-report.js").read_text(encoding="utf-8"))
               .replace("/*__TRAINING_JS__*/", (HERE / "mission-training.js").read_text(encoding="utf-8"))
               .replace("/*__MISSION_PDF_JS__*/", (HERE / "mission-pdf.js").read_text(encoding="utf-8"))
               .replace("/*__MISSION_JS__*/", (HERE / "mission.js").read_text(encoding="utf-8"))
               .replace("<script>/*__APP__*/</script>", '<script type="text/plain" id="rrx-app">' + app + "</script>")
               .replace("<body>", "<body>" + gate, 1))
    (site / "index.html").write_text(html, encoding="utf-8")
    (site / "vercel.json").write_text(json.dumps({"headers": [{"source": "/data/(.*)", "headers": [
        {"key": "Cache-Control", "value": "no-store"}, {"key": "X-Robots-Tag", "value": "noindex"}]}]}, indent=2), encoding="utf-8")
    (site / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    (dest / ".gitignore").write_text("CODIGOS.txt\n", encoding="utf-8")
    return codes
