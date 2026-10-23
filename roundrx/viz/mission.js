/* RoundRx // Próximo nível. Local, data-driven, deliberately paced by the player. */
(function () {
  "use strict";
  const $el = (tag, cls, ...children) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    for (const child of children.flat(Infinity)) if (child != null) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return el;
  };
  const button = (cls, text, action, label) => {
    const el = $el("button", cls, text); el.type = "button";
    if (label) el.setAttribute("aria-label", label);
    el.addEventListener("click", action); return el;
  };
  // Shared molecules: surfaces and headers have one implementation across chapters.
  const panel = (tag, cls, ...children) => $el(tag, `rx-panel ${cls}`, ...children);
  const panelLabel = (title, meta) => $el("div", "rx-panel-label", title,
    meta == null ? null : $el("span", "", meta));
  const pct = (value) => new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 }).format(value);
  const number = (value) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
  const pad = (n) => String(n).padStart(2, "0");
  const ARROW = "↗";
  // Keep this order stable: a team's backdrop depends only on its canonical name.
  const SCENES = Object.freeze(["Ascent", "Haven", "Lotus", "Sunset"]);
  function sceneForTeam(teamName) {
    const seed = String(teamName ?? "").normalize("NFC").trim().toLowerCase();
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619) >>> 0;
    }
    return SCENES[hash % SCENES.length];
  }
  const COPY = {
    trade: { title: ["Trade", "kill"], action: "Aproximar. Cobrir. Trocar.",
      description: "A próxima jogada começa antes da primeira queda. Revejam como a dupla se posiciona para responder ao contato.",
      check: "Revisar distância, linha de visão e timing das duplas.",
      watch: "Acompanhar mortes trocadas no mesmo contexto e na mesma janela de tempo." },
    advantage: { title: ["Preservação", "de vantagem"], action: "Transformem vantagem em round.",
      description: "Ter um jogador a mais muda o round. O próximo passo é entender o que acontece entre abrir a vantagem e fechar a vitória.",
      check: "Revisar os contatos que aconteceram depois de abrir vantagem.",
      watch: "Acompanhar a conversão das vantagens em situações semelhantes." },
    fb_open: { title: ["First blood:", "abertura"], action: "Preparem a abertura juntos.",
      description: "Uma abertura pode começar muito antes do duelo. Investiguem o apoio e a preparação de quem disputa o primeiro contato.",
      check: "Revisar apoio, informação e possibilidade de troca na abertura.",
      watch: "Acompanhar first blood a favor nos mesmos mapas, lados e compras." },
    fb_rec: { title: ["First blood:", "recuperação"], action: "Reorganizem antes de responder.",
      description: "Sofrer a primeira baixa não encerra o round. Revejam como o time se reorganiza para criar a próxima oportunidade.",
      check: "Revisar a reação coletiva imediatamente depois da primeira baixa.",
      watch: "Acompanhar vitórias depois de sofrer o first blood no mesmo contexto." },
    post: { title: ["Pós-plant"], action: "Plantem com o próximo passo pronto.",
      description: "Depois do plant, espaço e tempo viram recursos do time. Revejam como as posições se complementam até o fim do round.",
      check: "Revisar posições, primeiro contato e resposta ao início do defuse.",
      watch: "Acompanhar conversão de plants com site e saldo de vivos semelhantes." },
    retake: { title: ["Retake"], action: "Sincronizem a retomada.",
      description: "Cada segundo importa, mas entrar separado pode custar a tentativa. Revejam como o time decide e executa o retake.",
      check: "Revisar o tempo disponível e a sequência de entrada na retomada.",
      watch: "Acompanhar vitórias no retake com condições de plant semelhantes." },
    keyrounds: { title: ["Rounds-chave"], action: "Comprem a mesma ideia.",
      description: "Pistol, eco, force ou armado: revejam se o plano do round conversa com os recursos que o time tem.",
      check: "Revisar compras, recursos e plano coletivo nos rounds selecionados.",
      watch: "Acompanhar a conversão por tipo de round e economia." },
    halfopen: { title: ["Início", "de half"], action: "Preparem a sequência, não só o pistol.",
      description: "As primeiras decisões do half se conectam. Revejam como o resultado de um round muda a compra e o plano do próximo.",
      check: "Revisar compras e decisões dos três primeiros rounds de cada half.",
      watch: "Acompanhar os rounds 2 e 3 pelo caminho de abertura do half." },
    pressure: { title: ["Pressão"], action: "Deixem a próxima decisão clara.",
      description: "Alguns rounds mudam mais a chance de vencer o mapa. Usem esses momentos para revisar decisões e comunicação em conjunto.",
      check: "Revisar as decisões coletivas nos rounds de maior impacto estimado.",
      watch: "Acompanhar decisões e resultados em contextos decisivos semelhantes." },
  };
  const trainingName = (f) => f.name || f.copy.title.join(" ").replace(/\.$/, "");

  function selectFocus(model) {
    const valid = model.candidates.filter((c) => c.events > 0 && Number.isFinite(c.observed) && Number.isFinite(c.expected));
    const enough = (c) => c.matches >= model.minMatches && c.events >= model.minEvents;
    const recurring = valid.filter((c) => c.selected && c.gap < 0 && enough(c));
    const eligible = valid.filter(enough);
    // Recurring deficits come first. Without one, this is explicitly exploratory.
    const pool = recurring.length ? recurring : eligible.length ? eligible : valid;
    const sorted = [...pool].sort((a, b) => ((b.expected - b.observed) * b.events) - ((a.expected - a.observed) * a.events));
    const keys = new Set();
    return sorted.filter((c) => { if (keys.has(c.key)) return false; keys.add(c.key); return true; }).slice(0, 3)
      .map((c) => ({ ...c, confirmed: !!c.selected && c.gap < 0 && enough(c),
        enough: enough(c), copy: COPY[c.key] || COPY.keyrounds }));
  }

  function banner(model) {
    const focuses = selectFocus(model);
    const count = focuses.filter((f) => f.confirmed).length;
    const bannerEl = $el("section", "rx-launch");
    bannerEl.setAttribute("aria-label", "Missão de evolução do time");
    const art = $el("div", "rx-launch-art"); art.setAttribute("aria-hidden", "true");
    if (model.scene) art.style.backgroundImage = `url("${model.scene}")`;
    const mark = $el("span", "rx-launch-mark", "R / X"); mark.setAttribute("aria-hidden", "true");
    const title = $el("h2", "rx-launch-title", "O próximo nível ", $el("em", "", "do seu time."));
    const launch = button("rx-launch-button", ["Iniciar missão ", ARROW].join(""), () => open(model, focuses));
    bannerEl.append(art, mark, $el("div", "rx-launch-copy",
      $el("div", "rx-launch-kicker", "ValoStrat.gg  /  MISSÃO DE EVOLUÇÃO"), title,
      $el("p", "rx-launch-sub", count ? `${count} ${count === 1 ? "foco de atenção" : "focos de atenção"}. Uma nova forma de preparar o próximo treino.` : "Conheça seus indicadores. Escolha o foco do próximo treino.")),
      launch, $el("span", "rx-launch-code", "BRIEFING INTERATIVO  //  ~2 MIN"));
    return bannerEl;
  }

  let active = null;
  function open(model, focuses = selectFocus(model)) {
    if (active) return;
    focuses = focuses.map((f) => ({ ...f, training: window.RoundRxTraining.create(f) }));
    const opener = document.activeElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dialog = $el("dialog", "rx-mission");
    dialog.setAttribute("aria-labelledby", "rx-mission-title");
    const shell = $el("div", "rx-shell");
    const scene = $el("div", "rx-scene"); scene.setAttribute("aria-hidden", "true");
    const image = $el("div", "rx-scene-image"), foreground = $el("div", "rx-scene-foreground");
    if (model.scene) for (const el of [image, foreground]) el.style.backgroundImage = `url("${model.scene}")`;
    scene.append(image, foreground, $el("div", "rx-scene-shade"), $el("div", "rx-scene-grid"));
    const abort = new AbortController();
    let step = 0, frame = 0, pdfDocument = null, pdfDialog = null;
    const releasePdf = () => {
      if (pdfDocument) URL.revokeObjectURL(pdfDocument.url);
      pdfDocument = null;
    };
    const storageKey = "rrx-mission-v1|" + model.storageKey;
    let checked = new Set();
    try { const ids = JSON.parse(localStorage.getItem(storageKey) || "[]"); if (Array.isArray(ids)) checked = new Set(ids.filter((id) => focuses.some((f) => f.id === id))); } catch (_) { /* storage is optional */ }
    const save = () => { try { localStorage.setItem(storageKey, JSON.stringify([...checked])); } catch (_) { /* memory-only */ } };
    const maxStep = focuses.length + 1;
    const counter = $el("span", "rx-counter");
    const closeButton = button("rx-close", "×", () => dialog.close(), "Fechar missão (Esc)");
    const top = $el("header", "rx-topbar", $el("div", "rx-wordmark", "ROUND", $el("b", "", "RX")),
      $el("span", "rx-top-team", model.team), $el("div", "rx-top-actions", counter, closeButton));
    const route = $el("nav", "rx-route"); route.setAttribute("aria-label", "Etapas da missão");
    const body = $el("div", "rx-body");
    const prev = button("rx-prev", "Voltar", () => move(-1), "Etapa anterior");
    const next = button("rx-next rx-cta", "", () => move(1));
    const bottom = $el("footer", "rx-bottom", $el("div", "rx-controls", prev, next));
    shell.append(scene, top, route, body, bottom); dialog.append(shell); document.body.append(dialog);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const cleanup = () => {
      if (pdfDialog) pdfDialog.close();
      releasePdf();
      abort.abort(); cancelAnimationFrame(frame); dialog.remove();
      document.body.style.overflow = oldOverflow; active = null;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    dialog.addEventListener("close", cleanup, { once: true });
    dialog.addEventListener("click", (e) => { if (e.target === dialog) { const r = shell.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
    dialog.addEventListener("keydown", (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    });
    if (!reduced) {
      shell.addEventListener("pointermove", (e) => {
        if (e.pointerType === "touch") return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const r = shell.getBoundingClientRect();
          shell.style.setProperty("--rx-px", `${((e.clientX - r.left) / r.width - 0.5) * 28}px`);
          shell.style.setProperty("--rx-py", `${((e.clientY - r.top) / r.height - 0.5) * 18}px`);
        });
      }, { signal: abort.signal });
      shell.addEventListener("pointerleave", () => { cancelAnimationFrame(frame); shell.style.setProperty("--rx-px", "0px"); shell.style.setProperty("--rx-py", "0px"); }, { signal: abort.signal });
    }
    function move(delta) {
      if (step === maxStep && delta > 0) { dialog.close(); return; }
      go(Math.max(0, Math.min(maxStep, step + delta)));
    }
    function go(n) { step = n; paint(); }
    function heading(lines) {
      const title = $el("h2", "rx-title", ...lines.map((line, i) => $el(i === lines.length - 1 ? "em" : "span", "", line)));
      title.id = "rx-mission-title"; title.tabIndex = -1; return title;
    }
    function objective(f, i, toggle) {
      const el = button("rx-objective" + (checked.has(f.id) ? " is-checked" : ""), "", () => {
        if (!toggle) { go(i + 1); return; }
        if (checked.has(f.id)) checked.delete(f.id); else checked.add(f.id);
        const scrollTop = body.scrollTop;
        releasePdf(); save(); paint(); body.scrollTop = scrollTop;
        body.querySelectorAll(".rx-objective")[i]?.focus({ preventScroll: true });
      });
      if (toggle) {
        el.setAttribute("aria-pressed", String(checked.has(f.id)));
        el.setAttribute("aria-label", `${checked.has(f.id) ? "Remover" : "Adicionar"} ${trainingName(f)} ${checked.has(f.id) ? "do" : "ao"} plano de treino`);
      }
      const marker = $el("span", "rx-objective-num", toggle ? (checked.has(f.id) ? "✓" : "") : pad(i + 1));
      marker.setAttribute("aria-hidden", "true");
      el.append(marker, $el("span", "rx-objective-text", $el("b", "", trainingName(f))));
      if (!toggle) { const arrow = $el("span", "rx-objective-arrow", "↗"); arrow.setAttribute("aria-hidden", "true"); el.append(arrow); }
      return el;
    }
    function intro() {
      const recurring = focuses.filter((f) => f.confirmed).length;
      const enough = focuses.some((f) => f.enough);
      const condition = recurring ? "Padrões recorrentes" : enough ? "Exploração" : "Amostra em formação";
      const description = recurring ? "Escolha por onde começar a revisão do time." : enough ? "Explore os indicadores; ainda não há fragilidades confirmadas." : "Mais partidas ajudam a encontrar padrões do time.";
      const copy = $el("div", "rx-copy", heading(["Prepare o", "próximo treino."]),
        $el("p", "rx-description", description),
        $el("p", "rx-context", `${model.matches} mapas · ${number(model.rounds)} rounds · ${model.scope}`));
      const aside = panel("aside", "rx-aside rx-panel--stack", panelLabel(condition, `${focuses.length} ${focuses.length === 1 ? "foco" : "focos"}`),
        ...focuses.map((f, i) => objective(f, i, false)));
      if (!focuses.length) aside.append($el("p", "rx-empty", "Ainda não há eventos suficientes para montar os focos. Explore mais partidas no Panorama."));
      body.append(copy, aside);
    }
    function focusChapter(f, idx) {
      const status = f.confirmed ? "PADRÃO RECORRENTE" : f.enough ? "PONTO PARA INVESTIGAR" : "AMOSTRA EM FORMAÇÃO";
      const copy = $el("div", "rx-copy", $el("p", "rx-eyebrow", `Foco de treino ${idx + 1} de ${focuses.length}`), heading(f.copy.title),
        $el("p", "rx-training-goal", f.training.report.summary),
        button("rx-secondary rx-evidence", "Explorar evidências " + ARROW, () => { dialog.close(); f.review(); }));
      const delta = f.gap;
      const gap = $el("div", "rx-gap", `${delta < 0 ? "−" : delta > 0 ? "+" : ""}${number(Math.abs(delta))}`, $el("span", "rx-gap-unit", "pp"));
      const interpretation = $el("details", "rx-details", $el("summary", "", "Como interpretar"),
        $el("p", "", "Esperado: o que outros times fazem em situações parecidas, sem usar as partidas do próprio time."),
        $el("p", "", `Na revisão: ${f.copy.check}`),
        f.confirmed && f.recurrenceMatches > 0 ? $el("p", "", `Mesma direção em ${Math.round(f.recurrence * f.recurrenceMatches)} de ${f.recurrenceMatches} partidas com amostra no recorte.`) : null,
        $el("p", "", f.confirmed ? "Uma pista consistente para revisar; os dados não comprovam a causa." : f.enough ? "Diferença descritiva, sem padrão recorrente confirmado." : "Poucas partidas para sustentar uma conclusão; use como ponto de observação."));
      const intel = panel("section", "rx-intel", panelLabel(status),
        $el("h3", "rx-focus-name", trainingName(f)), gap, $el("p", "rx-metric-label", "diferença para o esperado em situações parecidas"),
        $el("div", "rx-bars", ...[["Seu time", f.observed, "observed"], ["Esperado", f.expected, "expected"]].map(([label, value, cls]) => {
          const fill = $el("span", "rx-bar-fill " + cls); fill.style.width = `${Math.max(0, Math.min(100, value * 100))}%`;
          return $el("div", "rx-bar-row", $el("div", "rx-bar-label", label, $el("b", "", pct(value))), $el("div", "rx-bar-track", fill));
        })),
        $el("p", "rx-facts", `${number(Math.round(f.observed * f.events))} de ${number(f.events)} ${f.noun} ${f.did} · ${f.matches} ${f.matches === 1 ? "partida" : "partidas"}`),
        interpretation);
      body.append(copy, $el("aside", "rx-aside", intel));
    }
    function getPlanDocument() {
      const selected = focuses.filter((f) => checked.has(f.id));
      if (!selected.length) return null;
      if (!pdfDocument) {
        const blob = window.RoundRxMissionPDF.create({ ...model, report: window.RoundRxTraining.plan(model, selected) }, selected);
        pdfDocument = { url: URL.createObjectURL(blob), filename: `roundrx-plano-${model.team.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf` };
      }
      return pdfDocument;
    }
    function pdfAction(action) {
      try {
        const doc = getPlanDocument();
        if (doc) action(doc);
      } catch (_) {
        const status = body.querySelector(".rx-plan-status");
        if (status) status.textContent = "Não foi possível gerar o PDF. Tente novamente.";
      }
    }
    function downloadPlan() {
      pdfAction((doc) => {
        const link = $el("a", ""); link.href = doc.url; link.download = doc.filename;
        document.body.append(link); link.click(); link.remove();
      });
    }
    function previewPlan() {
      pdfAction((doc) => {
        if (pdfDialog) return;
        const opener = document.activeElement;
        const preview = $el("dialog", "rx-mission rx-pdf-dialog");
        preview.setAttribute("aria-labelledby", "rx-pdf-title");
        const title = $el("h2", "", "Prévia do plano"); title.id = "rx-pdf-title";
        const close = button("rx-close", "×", () => preview.close(), "Fechar prévia do PDF");
        const download = button("rx-cta", "Baixar PDF ↓", downloadPlan);
        const external = $el("a", "rx-pdf-external", "Abrir PDF em nova aba");
        external.href = doc.url; external.target = "_blank"; external.rel = "noopener";
        const iframe = $el("iframe", "rx-pdf-frame");
        iframe.title = `Plano de treino de ${model.team} em PDF`; iframe.src = doc.url;
        const viewer = $el("div", "rx-pdf-shell",
          $el("header", "rx-pdf-header", $el("div", "", $el("p", "rx-eyebrow", "ValoStrat.gg / MISSÃO DE EVOLUÇÃO"), title), close),
          $el("div", "rx-pdf-toolbar", $el("p", "", "Diagnóstico, rounds para VOD e plano de scrim do seu time."), external, download),
          iframe, $el("p", "rx-pdf-hint", "Se a prévia não aparecer neste navegador, abra o PDF em nova aba ou faça o download."));
        preview.append(viewer); document.body.append(preview); pdfDialog = preview;
        preview.addEventListener("close", () => {
          preview.remove(); pdfDialog = null;
          if (opener?.isConnected) opener.focus({ preventScroll: true });
        }, { once: true });
        preview.showModal(); close.focus({ preventScroll: true });
      });
    }
    function plan() {
      const selected = focuses.filter((f) => checked.has(f.id)), count = selected.length;
      const copy = $el("div", "rx-copy", heading(["Escolha o foco", "do treino."]),
        $el("p", "rx-description", focuses.length ? "Escolha o que levar para o próximo treino." : "Explore mais partidas para encontrar focos de treino."),
        $el("div", "rx-plan-list", ...selected.map((f) => panel("div", "rx-panel--compact rx-plan-card", $el("span", "rx-plan-icon", "↗"),
          $el("div", "rx-plan-copy", $el("b", "", trainingName(f)), $el("p", "", f.training.report.summary))))));
      const preview = button("rx-cta", "Visualizar PDF ↗", previewPlan); preview.disabled = !count;
      const download = button("rx-secondary rx-pdf-download", "Baixar plano em PDF ↓", downloadPlan); download.disabled = !count;
      const status = $el("p", "rx-plan-status"); status.setAttribute("role", "status");
      const aside = panel("aside", "rx-aside rx-panel--stack", panelLabel("Seu plano", `${count} de ${focuses.length} selecionados`),
        ...focuses.map((f, i) => objective(f, i, true)), preview, download, status,
        $el("p", "rx-intel-note", count ? "PDF com contexto, indicadores, rounds para VOD e ações para o próximo scrim." : "Selecionar adiciona o objetivo ao plano."));
      body.append(copy, aside);
    }
    function paint() {
      counter.textContent = `${pad(step + 1)} / ${pad(maxStep + 1)}`;
      counter.setAttribute("aria-label", `Etapa ${step + 1} de ${maxStep + 1}`);
      route.replaceChildren();
      const labels = ["Briefing", ...focuses.map((f) => f.name), "Plano de treino"];
      labels.forEach((label, i) => {
        const node = button("rx-route-step" + (i === step ? " is-active" : i < step ? " is-done" : ""), "", () => go(i), `Etapa ${i + 1}: ${label}`);
        node.title = label; if (i === step) node.setAttribute("aria-current", "step");
        route.append(node);
      });
      const cameras = [["50%", "50%", 1.06], ["22%", "66%", 1.32], ["64%", "34%", 1.42], ["88%", "65%", 1.36], ["52%", "45%", 1.08]];
      const camera = cameras[step === maxStep ? 4 : Math.min(step, 3)];
      shell.style.setProperty("--rx-cam-x", camera[0]); shell.style.setProperty("--rx-cam-y", camera[1]); shell.style.setProperty("--rx-zoom", camera[2]);
      body.className = "rx-body " + (step === 0 ? "is-intro" : step === maxStep ? "is-plan" : "is-focus");
      body.replaceChildren(); body.scrollTop = 0;
      if (step === 0) intro(); else if (step === maxStep) plan(); else focusChapter(focuses[step - 1], step - 1);
      prev.disabled = step === 0; next.textContent = step === 0 ? (focuses.length ? "Explorar focos" : "Continuar") : step === maxStep ? "Voltar ao Panorama" : step === maxStep - 1 ? "Montar plano" : "Próximo foco";
      body.querySelector("h2")?.focus({ preventScroll: true });
    }
    active = dialog; paint(); dialog.showModal(); body.querySelector("h2")?.focus({ preventScroll: true });
  }
  window.RoundRxMission = { banner, open, selectFocus, sceneForTeam };
})();
