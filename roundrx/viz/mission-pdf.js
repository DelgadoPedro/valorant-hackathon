/* RoundRx // Portable, local training briefs. No remote fonts or PDF services. */
(function () {
  "use strict";

  const WIDTH = 595.28, HEIGHT = 841.89, MARGIN = 48, BOTTOM = 774;
  const COLOR = {
    navy: [0.067, 0.106, 0.169], coral: [0.94, 0.31, 0.29], ink: [0.13, 0.18, 0.23],
    muted: [0.39, 0.44, 0.49], line: [0.85, 0.88, 0.90], pale: [0.96, 0.97, 0.97],
    blush: [1, 0.94, 0.92], white: [1, 1, 1], soft: [0.72, 0.78, 0.83],
  };
  const CP1252 = {
    8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135,
    710: 136, 8240: 137, 352: 138, 8249: 139, 338: 140, 381: 142, 8216: 145,
    8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151, 732: 152,
    8482: 153, 353: 154, 8250: 155, 339: 156, 382: 158, 376: 159,
  };
  // Standard Helvetica widths, in thousandths of an em. Accent widths follow their base glyph.
  const REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,
    667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
    278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,
    722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
    333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  const clean = (value) => String(value == null ? "" : value).normalize("NFC")
    .replace(/\r\n?/g, "\n").replace(/[\t\u00a0]/g, " ")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").replace(/→|↗|➜/g, ">");
  const content = (value) => Array.isArray(value) ? value.map(content).filter(Boolean).join("\n")
    : value && typeof value === "object" ? Object.entries(value).map(([key, val]) => `${key}: ${content(val)}`).join("\n") : clean(value);
  const hex = (value) => Array.from(clean(value), (char) => {
    const n = char.codePointAt(0), byte = n < 128 || n >= 160 && n <= 255 ? n : CP1252[n] || 63;
    return byte.toString(16).padStart(2, "0");
  }).join("").toUpperCase();
  const unicodeHex = (value) => "FEFF" + Array.from(clean(value)).map((char) => {
    const code = char.codePointAt(0);
    if (code <= 65535) return code.toString(16).padStart(4, "0");
    const rest = code - 65536;
    return (55296 + (rest >> 10)).toString(16) + (56320 + (rest & 1023)).toString(16);
  }).join("").toUpperCase();
  const fmt = (value) => Number(value).toFixed(2).replace(/\.?0+$/, "") || "0";
  const rgb = (color) => color.map(fmt).join(" ");
  const percent = (value) => Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
  const count = (value) => Number.isFinite(value) ? value.toLocaleString("pt-BR") : "—";
  const minutes = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0;
  function textWidth(value, size, bold) {
    return Array.from(clean(value)).reduce((sum, char) => {
      const base = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "").charCodeAt(0);
      const table = bold ? BOLD : REGULAR;
      const special = { 8211: 556, 8212: 1000, 8230: 1000, 8226: 350, 8216: 222, 8217: 222, 8220: 333, 8221: 333, 215: 584 };
      return sum + (base >= 32 && base <= 126 ? table[base - 32] : special[base] || 556);
    }, 0) * size / 1000;
  }
  function wrap(value, maxWidth, size, bold) {
    const result = [];
    for (const paragraph of content(value).split("\n")) {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { result.push(""); continue; }
      let line = "";
      for (let word of words) {
        if (line && textWidth(`${line} ${word}`, size, bold) <= maxWidth) { line += " " + word; continue; }
        if (line) { result.push(line); line = ""; }
        // A match/team code can be longer than a whole line; split it without clipping.
        while (textWidth(word, size, bold) > maxWidth && word.length > 1) {
          let end = 1;
          while (end < word.length && textWidth(word.slice(0, end + 1), size, bold) <= maxWidth) end++;
          result.push(word.slice(0, end)); word = word.slice(end);
        }
        line = word;
      }
      if (line) result.push(line);
    }
    return result;
  }

  function create(model, focuses) {
    model = model || {};
    focuses = Array.isArray(focuses) ? focuses : [];
    const pages = [], bodyWidth = WIDTH - MARGIN * 2;
    let page, y = 0, currentLabel = "PLANO DE TREINO";
    const rect = (x, top, width, height, fill) => page.ops.push(`${rgb(fill)} rg ${fmt(x)} ${fmt(HEIGHT - top - height)} ${fmt(width)} ${fmt(height)} re f`);
    const rule = (x, top, width, color, weight = 0.6) => page.ops.push(`${rgb(color)} RG ${fmt(weight)} w ${fmt(x)} ${fmt(HEIGHT - top)} m ${fmt(x + width)} ${fmt(HEIGHT - top)} l S`);
    const text = (value, x, top, size = 10, bold = false, color = COLOR.ink) => {
      if (!value) return;
      page.ops.push(`BT /${bold ? "F2" : "F1"} ${fmt(size)} Tf ${rgb(color)} rg 1 0 0 1 ${fmt(x)} ${fmt(HEIGHT - top - size * 0.82)} Tm <${hex(value)}> Tj ET`);
    };
    const newPage = (cover = false) => {
      page = { ops: [], label: currentLabel }; pages.push(page);
      if (!cover) {
        rect(MARGIN, 37, 4, 18, COLOR.coral);
        text("ROUND", MARGIN + 12, 39, 12, true, COLOR.navy);
        text("RX", MARGIN + 61, 39, 12, true, COLOR.coral);
        let header = currentLabel;
        while (textWidth(header, 8, false) > bodyWidth - 128 && header.length > 8) header = header.slice(0, -4) + "...";
        text(header, WIDTH - MARGIN - textWidth(header, 8, false), 42, 8, false, COLOR.muted);
        rule(MARGIN, 70, bodyWidth, COLOR.line);
      }
      y = cover ? 0 : 91;
    };
    const ensure = (height) => { if (y + height > BOTTOM) newPage(); };
    const paragraph = (value, options = {}) => {
      const size = options.size || 10.2, leading = options.leading || 14.5;
      const x = options.x || MARGIN, width = options.width || bodyWidth;
      const lines = wrap(value, width, size, !!options.bold);
      for (const line of lines) {
        ensure(leading);
        text(line, x, y, size, !!options.bold, options.color || COLOR.ink); y += leading;
      }
      y += options.after == null ? 9 : options.after;
    };
    const section = (label, value) => {
      if (!content(value).trim()) return;
      ensure(48);
      text(label.toLocaleUpperCase("pt-BR"), MARGIN, y, 8.2, true, COLOR.muted); y += 17;
      paragraph(value);
    };
    const labelFor = (focus) => content(focus.name || focus.label || focus.training?.title || focus.key || "Fundamento");
    const totalMinutes = focuses.reduce((sum, focus) => sum + minutes(focus.training?.minutes), 0);

    // Cover: a quiet, printable editorial layout with all priorities visible at a glance.
    newPage(true);
    const team = content(model.team || "Sua equipe");
    let teamSize = 22, fullTeamLines = wrap(team, bodyWidth, teamSize, true);
    while (fullTeamLines.length > 4 && teamSize > 15) { teamSize--; fullTeamLines = wrap(team, bodyWidth, teamSize, true); }
    const truncatedTeam = fullTeamLines.length > 4;
    const teamLines = fullTeamLines.slice(0, 4);
    if (truncatedTeam) teamLines[3] = teamLines[3].slice(0, -3) + "...";
    const teamLeading = teamSize + 5;
    const coverBottom = 278 + Math.max(0, teamLines.length - 1) * teamLeading;
    rect(0, 0, WIDTH, coverBottom, COLOR.navy);
    rect(0, 0, 9, coverBottom, COLOR.coral);
    text("ROUND", MARGIN, 39, 14, true, COLOR.white);
    text("RX", MARGIN + 58, 39, 14, true, COLOR.coral);
    text("MISSÃO DE EVOLUÇÃO", MARGIN, 83, 9, true, COLOR.soft);
    text("O próximo treino", MARGIN, 109, 34, true, COLOR.white);
    text("começa aqui.", MARGIN, 150, 34, true, COLOR.coral);
    text("PREPARADO PARA", MARGIN, 211, 8, true, COLOR.soft);
    teamLines.forEach((line, i) => text(line, MARGIN, 229 + i * teamLeading, teamSize, true, COLOR.white));
    y = coverBottom + 24;
    const scopeLines = wrap(model.scope || "Partidas analisadas", bodyWidth, 10, false);
    for (const line of scopeLines) { text(line, MARGIN, y, 10, false, COLOR.muted); y += 14; }
    y += 12;
    if (truncatedTeam) section("Equipe", team);
    ensure(76);
    const metrics = [
      { value: String(focuses.length).padStart(2, "0"), label: focuses.length === 1 ? "FOCO DE TREINO" : "FOCOS DE TREINO" },
      { value: totalMinutes ? `${totalMinutes} min` : "—", label: "SESSÃO SUGERIDA" },
      { value: count(model.matches), label: "PARTIDAS ANALISADAS" },
      { value: count(model.rounds), label: "ROUNDS NO RECORTE" },
    ];
    const metricWidth = bodyWidth / 4;
    metrics.forEach((metric, i) => {
      const x = MARGIN + metricWidth * i;
      rect(x, y, metricWidth - 5, 61, COLOR.pale);
      text(metric.value, x + 10, y + 11, 19, true, COLOR.navy);
      text(metric.label, x + 10, y + 40, 6.8, true, COLOR.muted);
    });
    y += 86;
    text("A ROTA DA SESSÃO", MARGIN, y, 9, true, COLOR.muted); y += 24;
    focuses.forEach((focus, index) => {
      const training = focus.training || {};
      const lines = wrap(training.title || labelFor(focus), bodyWidth - 93, 12, true);
      const height = Math.max(62, lines.length * 16 + 27);
      ensure(Math.min(height, 65));
      text(String(index + 1).padStart(2, "0"), MARGIN, y, 19, true, COLOR.coral);
      const duration = minutes(training.minutes);
      const durationLabel = duration ? `${duration} min` : "";
      text(durationLabel, WIDTH - MARGIN - textWidth(durationLabel, 10, true), y + 2, 10, true, COLOR.muted);
      paragraph(training.title || labelFor(focus), { x: MARGIN + 38, width: bodyWidth - 93, size: 12, leading: 16, bold: true, color: COLOR.navy, after: 5 });
      const state = focus.confirmed ? "Prioridade recorrente" : focus.enough === false ? "Amostra limitada · exploração" : "Exploração";
      paragraph(`${state}  /  ${count(focus.events)} eventos analisados`, { x: MARGIN + 38, width: bodyWidth - 38, size: 8.6, leading: 12, color: COLOR.muted, after: 13 });
      ensure(14); rule(MARGIN, y, bodyWidth, COLOR.line); y += 13;
    });
    y += 7;
    paragraph("Revisem as evidências, executem os exercícios e anotem o ajuste combinado. Os indicadores apontam o que investigar; a causa deve ser confirmada no VOD.", { size: 10, color: COLOR.muted, after: 0 });

    focuses.forEach((focus, index) => {
      const training = focus.training || {};
      currentLabel = `TREINO ${String(index + 1).padStart(2, "0")} / ${String(focuses.length).padStart(2, "0")}  ·  ${labelFor(focus).toLocaleUpperCase("pt-BR")}`;
      newPage();
      text(`FICHA ${String(index + 1).padStart(2, "0")}  /  ${minutes(training.minutes) || "—"} MINUTOS`, MARGIN, y, 8.5, true, COLOR.coral); y += 21;
      paragraph(training.title || labelFor(focus), { size: 25, leading: 29, bold: true, color: COLOR.navy, after: 11 });
      if (training.summary) paragraph(training.summary, { size: 10.5, leading: 15, color: COLOR.muted, after: 16 });
      ensure(66);
      const metricTop = y;
      rect(MARGIN, metricTop, bodyWidth, 51, COLOR.pale);
      [
        { title: "OBSERVADO", value: percent(focus.observed) },
        { title: "REFERÊNCIA", value: percent(focus.expected) },
        { title: "EVENTOS", value: count(focus.events) },
        { title: "PARTIDAS", value: count(focus.matches) },
      ].forEach((metric, i) => {
        const x = MARGIN + 12 + i * metricWidth;
        text(metric.title, x, metricTop + 9, 6.9, true, COLOR.muted);
        text(metric.value, x, metricTop + 25, 15, true, i === 0 ? COLOR.coral : COLOR.navy);
      });
      y += 59;
      const status = focus.confirmed ? "Sinal recorrente · confirme a causa no VOD."
        : focus.enough === false ? "Amostra limitada · treino exploratório, sem conclusão de fragilidade."
        : "Exploração · valide uma hipótese de melhoria no VOD.";
      paragraph(status, { size: 8.6, leading: 12, color: COLOR.muted, after: 14 });
      section("Objetivo", training.objective);
      section("Contexto do exercício", training.context);
      section("Preparação", training.setup);
      section("Papéis do time", training.roles);
      if (Array.isArray(training.steps) && training.steps.length) {
        ensure(50);
        text("ROTEIRO DA PRÁTICA", MARGIN, y, 8.2, true, COLOR.muted); y += 22;
        training.steps.forEach((step, stepIndex) => {
          const title = content(step.title || `Etapa ${stepIndex + 1}`);
          const duration = minutes(step.minutes);
          ensure(46);
          rect(MARGIN, y - 3, 23, 23, COLOR.blush);
          text(String(stepIndex + 1).padStart(2, "0"), MARGIN + 5, y + 3, 9, true, COLOR.coral);
          if (duration) text(`${duration} min`, WIDTH - MARGIN - 37, y + 1, 9, true, COLOR.muted);
          paragraph(title, { x: MARGIN + 34, width: bodyWidth - 92, size: 11, leading: 15, bold: true, color: COLOR.navy, after: 5 });
          paragraph(step.instruction, { x: MARGIN + 34, width: bodyWidth - 34, size: 10.1, leading: 14.2, after: 12 });
        });
      }
      section("Repetições", training.repetitions);
      section("Critério de execução", training.success);
      section("Progressão", training.progression);
      section("Acompanhar no próximo scrim", training.watch);
      const evidence = Array.isArray(training.evidence) ? training.evidence : [];
      if (evidence.length) {
        ensure(54);
        text("ROUNDS PARA A REVISÃO", MARGIN, y, 8.2, true, COLOR.muted); y += 20;
        evidence.forEach((event) => {
          const round = Number.isFinite(Number(event.round)) && Number(event.round) > 0 ? `Round ${event.round}` : "Round a conferir";
          const meta = [event.map || "Mapa a conferir", round, event.opponent ? `vs ${event.opponent}` : "", event.date || ""].filter(Boolean).join("  /  ");
          ensure(44);
          rect(MARGIN, y, 3, 15, COLOR.coral);
          paragraph(meta, { x: MARGIN + 13, width: bodyWidth - 13, size: 9, leading: 13, bold: true, after: 4 });
          if (event.why) paragraph(event.why, { x: MARGIN + 13, width: bodyWidth - 13, size: 9.5, leading: 13.5, color: COLOR.muted, after: 12 });
        });
      }
      ensure(92);
      text("REGISTRO DA EQUIPE", MARGIN, y, 8.2, true, COLOR.muted); y += 19;
      text("O que funcionou? Qual ajuste levaremos para o próximo jogo?", MARGIN, y, 9, false, COLOR.muted); y += 26;
      rule(MARGIN, y, bodyWidth, COLOR.line); y += 23;
      rule(MARGIN, y, bodyWidth, COLOR.line);
    });

    pages.forEach((item, index) => {
      page = item;
      rule(MARGIN, 797, bodyWidth, COLOR.line);
      text("ROUND RX  /  MISSÃO DE EVOLUÇÃO", MARGIN, 810, 7, true, COLOR.muted);
      const pageNumber = `${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
      text(pageNumber, WIDTH - MARGIN - textWidth(pageNumber, 8, true), 809, 8, true, COLOR.navy);
    });
    return new Blob([serialize(pages, model.team)], { type: "application/pdf" });
  }

  function serialize(pages, team) {
    const objects = [], add = (value) => { objects.push(value); return objects.length; };
    const catalogId = add(""), pagesId = add("");
    const cmapPairs = [];
    const reverse = Object.fromEntries(Object.entries(CP1252).map(([code, byte]) => [byte, Number(code)]));
    for (let byte = 32; byte <= 255; byte++) {
      if (byte >= 127 && byte < 160 && !reverse[byte]) continue;
      const code = reverse[byte] || byte;
      cmapPairs.push(`<${byte.toString(16).padStart(2, "0")}> <${code.toString(16).padStart(4, "0")}>`);
    }
    const cmapGroups = [];
    for (let start = 0; start < cmapPairs.length; start += 100) {
      const group = cmapPairs.slice(start, start + 100);
      cmapGroups.push(`${group.length} beginbfchar\n${group.join("\n")}\nendbfchar`);
    }
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /RoundRx-WinAnsi-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${cmapGroups.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
    const cmapId = add(`<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`);
    const regularId = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode ${cmapId} 0 R >>`);
    const boldId = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding /ToUnicode ${cmapId} 0 R >>`);
    const pageIds = pages.map((page) => {
      const stream = page.ops.join("\n") + "\n";
      const streamId = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
      return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 ${regularId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${streamId} 0 R >>`);
    });
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /PageLayout /SinglePage /ViewerPreferences << /DisplayDocTitle true >> >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
    const infoId = add(`<< /Title <${unicodeHex(`Missão de evolução - ${team || "RoundRx"}`)}> /Creator (RoundRx) /Producer (RoundRx Mission PDF) >>`);
    let result = "%PDF-1.4\n%RoundRx\n";
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(result.length); result += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xrefOffset = result.length;
    result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) result += `${String(offset).padStart(10, "0")} 00000 n \n`;
    result += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    // Streams are ASCII operators + hex-encoded WinAnsi text, so string and byte offsets agree.
    return Uint8Array.from(result, (char) => char.charCodeAt(0));
  }

  window.RoundRxMissionPDF = { create };
})();
