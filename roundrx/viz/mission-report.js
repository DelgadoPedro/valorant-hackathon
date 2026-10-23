/* RoundRx — descriptive report facts, computed from the same scoped events as the panel. */
(function () {
  "use strict";
  const NAMES = { trade: "Mortes trocadas", advantage: "Vantagem numérica convertida", fb_open: "Duelos de abertura vencidos",
    fb_rec: "Vitórias após sofrer o first blood", post: "Pós-plant", retake: "Retake", keyrounds: "Rounds-chave",
    halfopen: "Rounds 2 e 3 do half", pressure: "Rounds decisivos" };
  const TITLES = { map_name: "Mapa", map_site: "Mapa e site", side: "Lado", state: "Situação de vivos", pstate: "Vivos no plant",
    economy: "Economia", when: "Momento do contato", pwhen: "Momento do plant", phase: "Momento",
    numbers: "Saldo de vivos", spike: "Spike", site: "Site", round_type: "Tipo de round", moment: "Caminho do half",
    half: "Half", lead: "Placar", ally_dist: "Distância do aliado", allies_near_b: "Aliados próximos",
    fb_context: "Abertura", duel_role: "Função no duelo", duel_name: "Jogadores nos duelos", victim_name: "Quem morreu" };
  const validValue = (v) => (typeof v === "string" && v.trim() !== "" && !["?", "null", "undefined", "nan"].includes(v.trim().toLowerCase()))
    || (typeof v === "number" && Number.isFinite(v));
  // Unknown categories still constrain a selected slice; dropping '?' would
  // silently expand it to known sites/players and change the reported sample.
  const cleanDims = (dims) => Object.fromEntries(Object.entries(dims && typeof dims === "object" ? dims : {})
    .filter(([, v]) => (typeof v === "string" && v.trim() !== "") || (typeof v === "number" && Number.isFinite(v))));
  const text = (v) => typeof v === "string" ? v.trim() : "";
  const matches = (event, dims) => Object.entries(dims).every(([k, v]) => event.context[k] === v);
  const pct = (value) => Math.round(100 * value) + "%";
  const humanValue = (dim, value) => dim === "side" ? ({ atk: "ataque", def: "defesa" }[value] || String(value))
    : dim === "site" ? "site " + value : dim === "spike" ? (value === "plantada" ? "spike plantada" : "sem spike plantada")
      : dim === "ally_dist" ? "aliado a " + value : String(value);
  const labelFor = (name, dims) => [name, ...Object.entries(dims).map(([k, v]) => humanValue(k, v))].join(" · ");
  const countMatches = (events) => new Set(events.map((e) => e.matchId).filter((id) => id != null)).size;
  const dateLabel = (value) => /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(8, 10) + "/" + value.slice(5, 7) : value;
  const dateOrder = (value) => {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(value);
    return m ? `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2]}-${m[1]}` : "";
  };
  function eventContext(event) {
    const context = cleanDims({ ...(event.context || {}), ...(text(event.map) && !event.context?.map_name ? { map_name: text(event.map) } : {}) });
    if (!context.map_site && text(context.map_name) && text(context.site)) context.map_site = `${context.map_name} · ${context.site}`;
    return context;
  }
  function normalize(events, league) {
    if (!Array.isArray(events)) return [];
    return events.filter((e) => e && (e.outcome === 0 || e.outcome === 1)
      && (league || (Number.isFinite(e.expected) && e.expected >= 0 && e.expected <= 1))).map((e) => ({
      ...e, matchId: e.matchId == null ? null : e.matchId, map: text(e.map) || text(e.context?.map_name),
      date: text(e.date), opponent: text(e.opponent), round: Number.isInteger(e.round) && e.round >= 1 ? e.round : null,
      context: eventContext(e),
      why: text(e.why),
    }));
  }
  function groups(events, dimensions) {
    const out = new Map();
    for (const e of events) {
      if (!dimensions.every((k) => validValue(e.context[k]))) continue;
      const values = dimensions.map((k) => e.context[k]), key = JSON.stringify(values);
      if (!out.has(key)) out.set(key, { dims: Object.fromEntries(dimensions.map((k, i) => [k, values[i]])), events: [] });
      out.get(key).events.push(e);
    }
    return [...out.values()];
  }
  function analyze(input = {}) {
    const all = normalize(input.events, false), league = normalize(input.league, true), initialDims = cleanDims(input.dims);
    const name = text(input.name) || NAMES[input.key] || "Indicador do time", unit = input.key === "trade" ? "trades" : "rounds";
    const minEvents = Math.max(8, Number.isFinite(input.minEvents) ? Math.floor(input.minEvents) : 8);
    const minMatches = Math.max(2, Number.isFinite(input.minMatches) ? Math.floor(input.minMatches) : 2);
    const baseEvents = all.filter((e) => matches(e, initialDims));
    const sufficient = (events) => events.length >= minEvents && countMatches(events) >= minMatches;
    // The diagnosis owns slice selection. Mining a worse child here would turn
    // ordinary variation inside a strong fundamental into an unsupported tip.
    const chosen = { dims: initialDims, events: baseEvents };
    function stats(dims, events, label) {
      const n = events.length, y = events.reduce((sum, e) => sum + e.outcome, 0), p = events.reduce((sum, e) => sum + e.expected, 0);
      const reference = league.filter((e) => matches(e, dims)), leagueY = reference.reduce((sum, e) => sum + e.outcome, 0);
      return { label: label || labelFor(name, dims), dims: { ...dims }, observed: n ? y / n : null, expected: n ? p / n : null,
        events: n, successes: y, matches: countMatches(events), expectedCount: p, deltaEvents: p - y,
        gap: n ? 100 * (y - p) / n : null, league: reference.length ? leagueY / reference.length : null,
        leagueEvents: reference.length, unit };
    }
    const primary = stats(chosen.dims, chosen.events, text(input.label) || null);
    const enough = input.enough !== false && sufficient(chosen.events);
    const below = primary.events > 0 && primary.expected - primary.observed > 1e-8;
    const confirmed = !!input.confirmed && enough && below;
    const indicators = [primary];
    if (Object.keys(primary.dims).length) indicators.push(stats({}, all, name + " no geral"));
    // A complementary site/side/map gives the reader a useful control, with the same other conditions.
    for (const dimension of ["site", "side", "map_name", "spike", "round_type", "moment"]) {
      if (!(dimension in primary.dims) || (dimension === "map_name" && "site" in primary.dims)) continue;
      const rest = { ...primary.dims }; delete rest[dimension];
      const alternatives = groups(all.filter((e) => matches(e, rest)), [dimension])
        .filter((g) => g.dims[dimension] !== primary.dims[dimension] && sufficient(g.events))
        .sort((a, b) => b.events.length - a.events.length || String(a.dims[dimension]).localeCompare(String(b.dims[dimension])));
      if (alternatives.length) {
        const g = alternatives[0]; indicators.push(stats({ ...rest, ...g.dims }, g.events)); break;
      }
    }
    const context = [], failed = chosen.events.filter((e) => !e.outcome);
    const failureNoun = input.key === "trade" ? "mortes sem trade" : "derrotas";
    if (!enough) context.push(`Amostra em formação: ${primary.events} eventos em ${primary.matches} partidas; use a revisão do VOD antes de definir um ajuste.`);
    else if (confirmed) context.push("O recorte mantém o padrão recorrente identificado no diagnóstico; a causa precisa ser validada no VOD.");
    else context.push("Recorte descritivo, sem padrão recorrente confirmado; comece pela revisão do VOD.");
    if (primary.events && primary.deltaEvents <= 1e-8) context.push("O resultado do recorte está no esperado ou acima dele; os dados não indicam uma fragilidade nesse ponto.");
    const dated = groups(chosen.events.filter((e) => e.date && e.opponent).map((e) => ({ ...e,
      context: { ...e.context, date_opponent: JSON.stringify([e.date, e.opponent]) } })), ["date_opponent"])
      .sort((a, b) => dateOrder(b.events[0].date).localeCompare(dateOrder(a.events[0].date))).slice(0, 2);
    if (dated.length && failed.length) {
      const recentFailed = dated.reduce((sum, g) => sum + g.events.filter((e) => !e.outcome).length, 0);
      context.push(`Nos ${dated.length === 1 ? "últimos confrontos da data disponível" : "dois confrontos por data mais recentes"}, ocorreram ${recentFailed} das ${failed.length} ${failureNoun}: `
        + dated.map((g) => `${g.events.filter((e) => !e.outcome).length} de ${g.events.length} eventos vs ${g.events[0].opponent} (${dateLabel(g.events[0].date)})`).join("; ") + ".");
    }
    for (const dimension of ["map_name", "side"]) {
      if (dimension in primary.dims || (dimension === "side" && (input.key === "post" || input.key === "retake")) || context.length >= 6) continue;
      const by = groups(chosen.events, [dimension]).sort((a, b) => b.events.length - a.events.length);
      const title = by.length > 4 ? `${TITLES[dimension]}s com mais eventos` : `${TITLES[dimension]}${by.length > 1 ? "s" : ""}`;
      if (by.length) context.push(`${title}: ` + by.slice(0, 4).map((g) =>
        `${humanValue(dimension, g.dims[dimension])}, ${g.events.reduce((sum, e) => sum + e.outcome, 0)} de ${g.events.length} ${input.key === "trade" ? "mortes trocadas" : "resultados convertidos"}`).join("; ") + ".");
    }
    const detailDims = input.key === "trade" ? ["ally_dist", "phase", "economy", "victim_name"]
      : input.key === "fb_open" || input.key === "fb_rec" ? ["when", "duel_role", "economy", "duel_name"]
        : input.key === "advantage" ? ["state", "when", "economy", "spike"]
          : input.key === "post" || input.key === "retake" ? ["pstate", "pwhen", "economy", "site"]
            : input.key === "pressure" ? ["phase", "lead", "economy"] : ["round_type", "moment", "half", "economy"];
    for (const dimension of detailDims) {
      if (context.length >= 6) break;
      if (dimension in primary.dims) continue;
      const by = groups(chosen.events, [dimension]).sort((a, b) => b.events.length - a.events.length);
      if (by.length) context.push(`${TITLES[dimension]}${by.length > 3 ? " — categorias mais frequentes" : ""}: ` + by.slice(0, 3).map((g) =>
        `${humanValue(dimension, g.dims[dimension])} em ${g.events.length} de ${primary.events} eventos`).join("; ") + ".");
    }
    const seen = new Set();
    // Strong slices illustrate what already works; a few lost rounds do not
    // establish a problem when the full slice meets its expectation.
    const investigate = below && (confirmed || primary.expected - primary.observed >= .005 - 1e-10);
    const examples = investigate ? failed : chosen.events.filter((e) => e.outcome === 1);
    const evidence = [...examples].sort((a, b) => (investigate ? b.expected - a.expected : a.expected - b.expected)
      || dateOrder(b.date).localeCompare(dateOrder(a.date)))
      .filter((e, i) => {
        const identity = e.round == null ? ["unknown", i] : e.matchId != null ? [e.matchId, e.round] : [e.map, e.date, e.opponent, e.round];
        const key = JSON.stringify(identity); if (seen.has(key)) return false; seen.add(key); return true;
      }).slice(0, 4).map((e) => ({ ...e, context: { ...e.context } }));
    return { primary, indicators: indicators.slice(0, 3), context, evidence, enough, confirmed, minEvents, minMatches,
      measurement: { point: primary.label, today: primary.observed, target: primary.expected,
        events: primary.events, matches: primary.matches, unit, dims: { ...primary.dims },
        instruction: "Compare a soma de 3 a 4 mapas novos no mesmo contexto antes de concluir; o esperado é uma referência, não uma promessa de resultado." } };
  }
  window.RoundRxReport = Object.freeze({ analyze });
})();
