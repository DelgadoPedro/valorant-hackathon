/* RoundRx // Analytical training reports. Local fonts, selectable text, no PDF service. */
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
    const documentReport = model.report || {};
    let page, y = 0, currentLabel = "PLANO DE TREINO";
    const rect = (x, top, width, height, fill) => page.ops.push(`${rgb(fill)} rg ${fmt(x)} ${fmt(HEIGHT - top - height)} ${fmt(width)} ${fmt(height)} re f`);
    const rule = (x, top, width, color, weight = 0.6) => page.ops.push(`${rgb(color)} RG ${fmt(weight)} w ${fmt(x)} ${fmt(HEIGHT - top)} m ${fmt(x + width)} ${fmt(HEIGHT - top)} l S`);
    const text = (value, x, top, size = 10, bold = false, color = COLOR.ink) => {
      if (!value) return;
      page.ops.push(`BT /${bold ? "F2" : "F1"} ${fmt(size)} Tf ${rgb(color)} rg 1 0 0 1 ${fmt(x)} ${fmt(HEIGHT - top - size * 0.82)} Tm <${hex(value)}> Tj ET`);
    };
    const newPage = (opening = false) => {
      page = { ops: [], label: currentLabel, opening }; pages.push(page);
      if (!opening) {
        rect(MARGIN, 37, 4, 18, COLOR.coral);
        text("ROUND", MARGIN + 12, 39, 12, true, COLOR.navy);
        text("RX", MARGIN + 61, 39, 12, true, COLOR.coral);
        rule(MARGIN, 70, bodyWidth, COLOR.line);
      }
      y = opening ? 0 : 91;
    };
    const ensure = (height) => { if (y + height > BOTTOM) newPage(); };
    const startSection = (height, fresh = false) => {
      if (fresh || y + height + 35 > BOTTOM) { newPage(); return; }
      // Continue the report on a partially used page instead of leaving a short action page empty.
      page.label = "PLANO DE TREINO";
      y += 14; rule(MARGIN, y, bodyWidth, COLOR.line); y += 21;
    };
    const paragraph = (value, options = {}) => {
      const size = options.size || 10.2, leading = options.leading || 14.5;
      const x = options.x == null ? MARGIN : options.x, width = options.width || bodyWidth;
      const lines = wrap(value, width, size, !!options.bold);
      for (const line of lines) {
        ensure(leading);
        text(line, x, y, size, !!options.bold, options.color || COLOR.ink); y += leading;
      }
      y += options.after == null ? 9 : options.after;
    };
    const sectionTitle = (label, requiredSpace = 70) => {
      ensure(requiredSpace);
      text(label, MARGIN, y, 11, true, COLOR.navy); y += 20;
    };
    const bullets = (items) => {
      for (const item of items || []) {
        if (!content(item).trim()) continue;
        ensure(30);
        text("•", MARGIN + 1, y + 1, 10, true, COLOR.coral);
        paragraph(item, { x: MARGIN + 14, width: bodyWidth - 14, after: 7 });
      }
    };
    // Tables use measured rows and repeat their heading when a row continues on another page.
    const table = (headers, rows, proportions) => {
      if (!rows.length) return;
      const widths = proportions.map((part) => part * bodyWidth), padding = 9;
      const size = 9.1, leading = 12.5;
      const headerLines = headers.map((cell, i) => wrap(cell, widths[i] - padding * 2, 8, true));
      const headerHeight = Math.max(...headerLines.map((lines) => lines.length)) * 11 + 16;
      const drawHeader = () => {
        rect(MARGIN, y, bodyWidth, headerHeight, COLOR.navy);
        let x = MARGIN;
        headerLines.forEach((lines, column) => {
          lines.forEach((line, index) => text(line, x + padding, y + 8 + index * 11, 8, true, COLOR.white));
          x += widths[column];
        });
        y += headerHeight;
      };
      ensure(headerHeight + leading + 17); drawHeader();
      rows.forEach((row, rowIndex) => {
        const cells = headers.map((_, column) => wrap(content(row[column] == null || row[column] === "" ? "—" : row[column]), widths[column] - padding * 2, size, column === 0));
        const lineCount = Math.max(...cells.map((lines) => lines.length));
        let start = 0;
        while (start < lineCount) {
          const remainingHeight = (lineCount - start) * leading + 17;
          // Keep ordinary rows together; split a row only when it exceeds a fresh page.
          if (y + remainingHeight > BOTTOM && remainingHeight <= BOTTOM - 91 - headerHeight) {
            newPage(); drawHeader();
          }
          let capacity = Math.floor((BOTTOM - y - 17) / leading);
          if (capacity < 1) { newPage(); drawHeader(); capacity = Math.floor((BOTTOM - y - 17) / leading); }
          const length = Math.min(lineCount - start, capacity), height = length * leading + 17;
          rect(MARGIN, y, bodyWidth, height, rowIndex % 2 ? COLOR.white : COLOR.pale);
          let x = MARGIN;
          cells.forEach((lines, column) => {
            lines.slice(start, start + length).forEach((line, index) => text(line, x + padding, y + 8 + index * leading, size, column === 0, column === 1 ? COLOR.coral : COLOR.ink));
            x += widths[column];
          });
          y += height; rule(MARGIN, y, bodyWidth, COLOR.line, 0.4); start += length;
          if (start < lineCount) { newPage(); drawHeader(); }
        }
      });
      y += 18;
    };
    const labelFor = (focus) => content(focus.name || focus.label || focus.key || "Fundamento");
    const reportFor = (focus) => {
      const training = focus.training || {};
      if (training.report) return training.report;
      // Compatibility for saved plans from before the analytical report format.
      return {
        title: training.title || labelFor(focus),
        evidence: `${labelFor(focus)}: observado ${percent(focus.observed)}; esperado ${percent(focus.expected)}.`,
        indicators: [{ label: labelFor(focus), team: percent(focus.observed), expected: percent(focus.expected), league: "—" }],
        context: [training.context, focus.enough === false ? "Amostra limitada: sem conclusão de fragilidade." : focus.confirmed ? "Sinal recorrente; confirme a causa no VOD." : "Exploração: ainda não há fragilidade recorrente confirmada."].filter(Boolean),
        rounds: training.evidence || [],
        actions: [{ label: "Scrim", text: training.practice || training.objective }, { label: "VOD", text: training.review }].filter((item) => item.text),
        measurement: [{ point: labelFor(focus), today: percent(focus.observed), target: training.watch || "Comparar o mesmo recorte após a revisão do VOD." }],
      };
    };
    const reports = focuses.map(reportFor);

    newPage(true);
    rect(0, 0, WIDTH, 133, COLOR.navy);
    rect(0, 0, 7, 133, COLOR.coral);
    text("ROUND", MARGIN, 31, 12, true, COLOR.white);
    text("RX", MARGIN + 50, 31, 12, true, COLOR.coral);
    text("MISSÃO DE EVOLUÇÃO", WIDTH - MARGIN - textWidth("MISSÃO DE EVOLUÇÃO", 8, true), 34, 8, true, COLOR.soft);
    text("Plano de treino", MARGIN, 68, 30, true, COLOR.white);
    text(`${String(focuses.length).padStart(2, "0")} ${focuses.length === 1 ? "foco selecionado" : "focos selecionados"}  /  diagnóstico, revisão e prática`, MARGIN, 110, 9, false, COLOR.soft);
    y = 157;
    paragraph(model.team || "Sua equipe", { size: 23, leading: 28, bold: true, color: COLOR.navy, after: 8 });
    const meta = [model.scope, model.period, documentReport.date || model.date].filter(Boolean).join("  ·  ");
    if (meta) paragraph(meta, { size: 9, leading: 13, color: COLOR.muted, after: 10 });
    const sample = [Number.isFinite(model.matches) ? `${count(model.matches)} partidas analisadas` : "", Number.isFinite(model.rounds) ? `${count(model.rounds)} rounds no recorte` : ""].filter(Boolean).join("  ·  ");
    if (sample) paragraph(sample, { size: 8.6, leading: 13, color: COLOR.muted, after: 19 });
    const intro = documentReport.intro || (focuses.length ? `Os ${focuses.length} focos selecionados abaixo conectam os resultados observados a uma revisão do VOD e a um ajuste para o próximo scrim. Os indicadores orientam a investigação; a causa precisa ser confirmada nas imagens.` : "Selecione os focos da missão para compor o plano de treino.");
    paragraph(intro, { size: 11, leading: 16, after: 18 });
    const howToRead = documentReport.howToRead || "Observado = o que o time fez; esperado = a referência de outros times em situações parecidas. Liga = o resultado geral da liga, quando disponível. A diferença indica o que revisar, sem comprovar uma causa. Rounds numerados como no jogo (R1 = pistol).";
    const readLines = wrap(howToRead, bodyWidth - 26, 9.6, false);
    const readHeight = 44 + readLines.length * 14;
    if (readHeight < BOTTOM - 91) {
      ensure(readHeight + 16);
      rect(MARGIN, y, bodyWidth, readHeight, COLOR.pale);
      rect(MARGIN, y, 3, readHeight, COLOR.coral);
      text("Como ler", MARGIN + 13, y + 12, 10, true, COLOR.navy); y += 32;
      paragraph(howToRead, { x: MARGIN + 13, width: bodyWidth - 26, size: 9.6, leading: 14, color: COLOR.muted, after: 28 });
    } else {
      sectionTitle("Como ler", 51);
      paragraph(howToRead, { size: 9.6, leading: 14, color: COLOR.muted, after: 17 });
    }
    if (reports.length) {
      sectionTitle("Os focos do plano", 70);
      reports.forEach((report, index) => {
        ensure(36);
        paragraph(`${index + 1}. ${report.title || labelFor(focuses[index])}`, { size: 11, leading: 15, bold: true, after: 10 });
      });
    }

    reports.forEach((report, index) => {
      const focus = focuses[index];
      currentLabel = `FOCO ${String(index + 1).padStart(2, "0")}  /  ${labelFor(focus).toLocaleUpperCase("pt-BR")}`;
      const title = `${index + 1}. ${report.title || labelFor(focus)}`;
      const startHeight = 21 + wrap(title, bodyWidth, 23, true).length * 28 + 13
        + (report.evidence ? Math.min(4, wrap(report.evidence, bodyWidth, 10.8, false).length) * 15.6 + 13 : 0)
        + (report.caveat ? Math.min(3, wrap(report.caveat, bodyWidth, 9, false).length) * 13 + 16 : 0) + 57;
      startSection(Math.max(225, startHeight), index === 0);
      text(`FOCO ${String(index + 1).padStart(2, "0")} / ${String(focuses.length).padStart(2, "0")}`, MARGIN, y, 8.5, true, COLOR.coral); y += 21;
      paragraph(title, { size: 23, leading: 28, bold: true, color: COLOR.navy, after: 13 });
      if (report.evidence) paragraph(report.evidence, { size: 10.8, leading: 15.6, after: 13 });
      if (report.caveat) paragraph(report.caveat, { size: 9, leading: 13, color: COLOR.muted, after: 16 });
      const indicators = Array.isArray(report.indicators) ? report.indicators : [];
      table([report.indicatorLabel || "Indicador", "Time", "Esperado", "Liga"], indicators.map((row) => [row.label, row.team, row.expected, row.league]), [0.43, 0.21, 0.18, 0.18]);
      const context = Array.isArray(report.context) ? report.context.filter(Boolean) : report.context ? [report.context] : [];
      if (context.length) { sectionTitle("Contexto"); bullets(context); y += 6; }
      const rounds = Array.isArray(report.rounds) ? report.rounds : [];
      sectionTitle("Rounds para o VOD");
      if (rounds.length) {
        const evidenceLines = rounds.map((event) => {
          if (typeof event === "string") return event;
          const round = Number.isInteger(Number(event.round)) && Number(event.round) > 0 ? `R${event.round}` : "round a conferir";
          const meta = [event.map, round, event.opponent ? `vs ${event.opponent}` : "", event.date ? `(${event.date})` : ""].filter(Boolean).join(" ");
          return event.why ? `${meta}: ${event.why}` : meta;
        });
        bullets(evidenceLines);
      } else {
        paragraph("Abra Explorar evidências e selecione rounds do mesmo recorte para a revisão. Sem referência disponível, confirme o cenário antes de definir a correção.", { size: 9.6, leading: 14, color: COLOR.muted, after: 12 });
      }
      y += 5;
      const actions = Array.isArray(report.actions) ? report.actions : [];
      if (actions.length) {
        sectionTitle("O que fazer");
        actions.forEach((action) => {
          if (typeof action === "string") { bullets([action]); return; }
          if (!action.text) return;
          const actionLabel = `${action.label || "Ajuste"}:`;
          const labelHeight = wrap(actionLabel, bodyWidth - 14, 10, true).length * 14 + 3;
          const firstLines = Math.min(2, wrap(action.text, bodyWidth - 14, 10.1, false).length);
          ensure(labelHeight + firstLines * 14.5);
          text("•", MARGIN + 1, y + 1, 10, true, COLOR.coral);
          paragraph(actionLabel, { x: MARGIN + 14, width: bodyWidth - 14, size: 10, leading: 14, bold: true, after: 3 });
          paragraph(action.text, { x: MARGIN + 14, width: bodyWidth - 14, size: 10.1, leading: 14.5, after: 11 });
        });
      }
    });

    if (reports.length) {
      currentLabel = "ACOMPANHAMENTO";
      const introduction = "Registrem o mesmo indicador e o mesmo contexto do diagnóstico. Os alvos abaixo orientam o acompanhamento; confirmem a mudança no VOD e em uma nova amostra de partidas.";
      const rows = reports.flatMap((report, index) => {
        const measurement = Array.isArray(report.measurement) ? report.measurement : [];
        return measurement.map((row) => [row.point || report.title || labelFor(focuses[index]), row.today, row.target]);
      });
      const caveats = Array.isArray(documentReport.caveats) ? documentReport.caveats.slice() : documentReport.caveats ? [documentReport.caveats] : ["Com poucos rounds por scrim, olhem a soma de 3 a 4 mapas antes de concluir algo. Comparem situações equivalentes e anotem o que a revisão confirmou antes de mudar o foco."];
      reports.forEach((report) => { if (report.caveat) caveats.push(report.caveat); });
      const uniqueCaveats = [...new Set(caveats.filter(Boolean))];
      const rowHeight = rows.reduce((sum, row) => sum + Math.max(...row.map((cell, index) => wrap(cell || "—", [0.35, 0.18, 0.47][index] * bodyWidth - 18, 9.1, index === 0).length)) * 12.5 + 17, 0);
      const closingHeight = 22 + 30 + 15 + wrap(introduction, bodyWidth, 10.5, false).length * 15 + 18
        + (rows.length ? 27 + rowHeight + 18 : 0)
        + uniqueCaveats.reduce((sum, value) => sum + wrap(value, bodyWidth, 9.7, false).length * 14 + 12, 0);
      startSection(closingHeight <= BOTTOM - 91 ? closingHeight : 240);
      text("PRÓXIMA SESSÃO", MARGIN, y, 8.5, true, COLOR.coral); y += 22;
      paragraph("Como medir no próximo scrim", { size: 25, leading: 30, bold: true, color: COLOR.navy, after: 15 });
      paragraph(introduction, { size: 10.5, leading: 15, after: 18 });
      table(["Ponto", "Hoje", "Alvo de acompanhamento"], rows, [0.35, 0.18, 0.47]);
      uniqueCaveats.forEach((value) => paragraph(value, { size: 9.7, leading: 14, color: COLOR.muted, after: 12 }));
    }

    pages.forEach((item, index) => {
      page = item;
      if (!item.opening) {
        let header = item.label;
        while (textWidth(header, 8, false) > bodyWidth - 128 && header.length > 8) header = header.slice(0, -4) + "...";
        text(header, WIDTH - MARGIN - textWidth(header, 8, false), 42, 8, false, COLOR.muted);
      }
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
    const infoId = add(`<< /Title <${unicodeHex(`Plano de treino · ${team || "RoundRx"}`)}> /Creator (RoundRx) /Producer (RoundRx Mission PDF) >>`);
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
