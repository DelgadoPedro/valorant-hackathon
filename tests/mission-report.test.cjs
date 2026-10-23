// Pure report facts: node --test tests/mission-report.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(resolve(__dirname, '../roundrx/viz/mission-report.js'), 'utf8'), sandbox);
const analyze = (input) => JSON.parse(JSON.stringify(sandbox.window.RoundRxReport.analyze(input)));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
function events(n, successes, expected, context = {}, extra = {}) {
  return Array.from({ length: n }, (_, i) => ({ matchId: i % 4, map: 'Haven', date: '2026-09-19', opponent: 'ufu saints',
    round: i + 1, outcome: Number(i < successes), expected, context, ...extra }));
}
function advantageFixture() {
  return { key: 'advantage', name: 'Vantagem numérica convertida', dims: {}, confirmed: false,
    events: [
      ...events(24, 9, .661, { side: 'def', spike: 'plantada', state: '2v1', when: 'depois de 35 s', economy: 'equipamento equilibrado' }),
      ...events(20, 18, .8, { side: 'atk', spike: 'plantada', state: '2v1', when: 'depois de 35 s', economy: 'equipamento equilibrado' }),
      ...events(40, 38, .8, { side: 'def', spike: 'não plantada', state: '2v1', when: 'depois de 35 s', economy: 'equipamento equilibrado' }),
    ], league: [
      ...events(100, 56, .8, { side: 'def', spike: 'plantada' }),
      ...events(200, 180, .8, { side: 'atk', spike: 'plantada' }),
    ] };
}

test('reports an explicitly selected 9/24 planted-defense slice and calculates the raw league', () => {
  const input = advantageFixture(); input.dims = { side: 'def', spike: 'plantada' };
  const report = analyze(input);
  assert.deepEqual(report.primary.dims, { side: 'def', spike: 'plantada' });
  assert.equal(report.primary.events, 24);
  assert.equal(report.primary.successes, 9);
  close(report.primary.observed, .375);
  close(report.primary.expected, .661);
  close(report.primary.deltaEvents, 6.864);
  close(report.primary.league, .56);
  assert.equal(report.primary.leagueEvents, 100);
  assert.match(report.primary.label, /defesa.*spike plantada/);
  assert.match(report.context[0], /descritivo.*sem padrão recorrente confirmado/);
});

test('keeps a confirmed slice exactly, without replacing it with a worse child', () => {
  const input = advantageFixture();
  input.confirmed = true; input.dims = { side: 'def', spike: 'plantada' }; input.label = 'Vantagens na defesa';
  const report = analyze(input);
  assert.deepEqual(report.primary.dims, { side: 'def', spike: 'plantada' });
  assert.equal(report.primary.label, 'Vantagens na defesa');
  assert.equal(report.primary.events, 24);
  assert.match(report.context[0], /padrão recorrente identificado/);
});

test('exploratory refinement cannot escape existing input dimensions', () => {
  const input = advantageFixture(); input.dims = { spike: 'não plantada' };
  const report = analyze(input);
  assert.equal(report.primary.dims.spike, 'não plantada');
  assert.equal(report.primary.events, 40);
  assert.match(report.context.join(' '), /no esperado ou acima/);
  assert.ok(report.evidence.every((e) => e.context.spike === 'não plantada' && e.outcome === 1));
});

test('reports scoped dates/opponents, distribution and a general comparator from actual events', () => {
  const input = advantageFixture(); input.dims = { side: 'def', spike: 'plantada' };
  const report = analyze(input);
  assert.equal(report.indicators.length, 3);
  assert.equal(report.indicators[1].events, 84);
  assert.deepEqual(report.indicators[2].dims, { spike: 'plantada', side: 'atk' });
  assert.match(report.context.join(' '), /15 das 15 derrotas.*ufu saints.*19\/09/);
  assert.match(report.context.join(' '), /Haven.*9 de 24/);
  assert.match(report.context.join(' '), /2v1 em 24 de 24 eventos/);
  assert.match(report.context.join(' '), /equipamento equilibrado/);
  assert.equal(report.measurement.today, report.primary.observed);
  assert.equal(report.measurement.target, report.primary.expected);
});

test('context is concise, avoids fixed dimensions and implicit plant sides, and labels partial map lists', () => {
  const sample = events(30, 10, .6, { economy: 'equipamento equilibrado', side: 'def', pstate: '3v2', pwhen: 'depois de 60 s', site: 'A' })
    .map((e, i) => ({ ...e, map: ['Haven', 'Lotus', 'Ascent', 'Split', 'Sunset'][i % 5] }));
  const report = analyze({ key: 'retake', confirmed: true, dims: { economy: 'equipamento equilibrado' }, events: sample });
  assert.ok(report.context.length <= 6);
  assert.doesNotMatch(report.context.join(' '), /Economia:|Lado:|Lados:/);
  assert.match(report.context.join(' '), /Mapas com mais eventos:/);
  assert.match(report.context.join(' '), /Vivos no plant:|Momento do plant:/);
  const selected = advantageFixture(); selected.dims = { side: 'def', spike: 'plantada' };
  const advantage = analyze(selected);
  assert.ok(advantage.context.length <= 6);
  assert.doesNotMatch(advantage.context.join(' '), /Lado: defesa|Spike: spike plantada/);
});

test('tiny and single-match samples fall back to the base without invented evidence strength', () => {
  for (const sample of [events(5, 1, .7, { side: 'def' }), events(30, 1, .7, { side: 'def' }, { matchId: 1 })]) {
    const report = analyze({ key: 'advantage', events: sample, league: [] });
    assert.deepEqual(report.primary.dims, {});
    assert.match(report.context[0], /Amostra em formação/);
    assert.equal(report.primary.league, null);
  }
});

test('requested sample floors apply and can never fall below eight events / two matches', () => {
  const input = advantageFixture();
  input.minEvents = 30; input.dims = { side: 'def', spike: 'plantada' }; input.confirmed = true;
  assert.equal(analyze(input).enough, false);
  assert.equal(analyze(input).confirmed, false);
  const small = { key: 'post', minEvents: 1, minMatches: 1,
    events: [...events(5, 0, .9, { site: 'A' }), ...events(8, 8, .3, { site: 'B' })] };
  small.dims = { site: 'A' };
  assert.deepEqual(analyze(small).primary.dims, { site: 'A' });
  assert.equal(analyze(small).enough, false);
});

test('all-positive performance stays general and is never described as a weakness', () => {
  const report = analyze({ key: 'post', events: [...events(20, 20, .8, { site: 'A' }), ...events(12, 12, .5, { site: 'B' })] });
  assert.deepEqual(report.primary.dims, {});
  assert.equal(report.evidence.length, 4);
  assert.ok(report.evidence.every((e) => e.outcome === 1));
  assert.ok(report.primary.deltaEvents < 0);
  assert.match(report.context.join(' '), /não indicam uma fragilidade/);
});

test('evidence stays in the chosen context, sorts expected descending, and deduplicates rounds', () => {
  const input = { key: 'trade', confirmed: true, dims: { side: 'def' }, events: [
    ...events(20, 8, .5, { side: 'def' }),
    { matchId: 99, round: 1, outcome: 0, expected: .8, context: { side: 'def' }, why: 'Cobertura a revisar' },
    { matchId: 99, round: 1, outcome: 0, expected: .9, context: { side: 'def' }, why: 'Outra morte no mesmo round' },
    { matchId: 100, round: 13, outcome: 0, expected: .85, context: { side: 'def' } },
    { matchId: 101, round: 2, outcome: 0, expected: 1, context: { side: 'atk' } },
  ] };
  const report = analyze(input);
  assert.equal(report.evidence.length, 4);
  assert.equal(report.evidence[0].expected, .9);
  assert.equal(report.evidence[0].round, 1);
  assert.equal(report.evidence[0].why, 'Outra morte no mesmo round');
  assert.equal(report.evidence[1].round, 13);
  assert.equal(report.evidence.filter((e) => e.matchId === 99).length, 1);
  assert.ok(report.evidence.every((e) => e.context.side === 'def'));
});

test('trade differences and concentration refer to trades and untraded deaths', () => {
  const report = analyze({ key: 'trade', events: events(20, 4, .5), league: events(40, 12, .5) });
  assert.equal(report.primary.unit, 'trades');
  assert.equal(report.measurement.unit, 'trades');
  close(report.primary.deltaEvents, 6);
  assert.match(report.context.join(' '), /mortes sem trade/);
  assert.doesNotMatch(report.context.join(' '), /16 derrotas/);
});

test('Brazilian dates use chronological order for recent context and evidence ties', () => {
  const sample = [
    ...events(8, 4, .6, {}, { date: '27/06/2026', opponent: 'Time antigo' }),
    ...events(8, 4, .6, {}, { date: '19/09/2026', opponent: 'Time B' }).map((e) => ({ ...e, matchId: e.matchId + 10 })),
    ...events(8, 4, .6, {}, { date: '20/09/2026', opponent: 'Time C' }).map((e) => ({ ...e, matchId: e.matchId + 20 })),
  ];
  const report = analyze({ key: 'retake', events: sample });
  const recent = report.context.find((line) => line.includes('mais recentes'));
  assert.match(recent, /8 das 12 derrotas.*Time C.*20\/09\/2026.*Time B.*19\/09\/2026/);
  assert.doesNotMatch(recent, /Time antigo|27\/06/);
  assert.equal(report.evidence[0].date, '20/09/2026');
});

test('short Brazilian years and mixed ISO/full years share the same chronology', () => {
  const sample = [
    ...events(8, 4, .6, {}, { date: '28/06/26', opponent: 'Junho' }),
    ...events(8, 4, .6, {}, { date: '24/09/26', opponent: 'Setembro 24' }).map((e) => ({ ...e, matchId: e.matchId + 10 })),
    ...events(8, 4, .6, {}, { date: '20/09/2026', opponent: 'Setembro 20' }).map((e) => ({ ...e, matchId: e.matchId + 20 })),
    ...events(8, 4, .6, {}, { date: '2026-09-19', opponent: 'Setembro 19' }).map((e) => ({ ...e, matchId: e.matchId + 30 })),
  ];
  const report = analyze({ key: 'retake', events: sample });
  const recent = report.context.find((line) => line.includes('mais recentes'));
  assert.match(recent, /Setembro 24.*24\/09\/26.*Setembro 20.*20\/09\/2026/);
  assert.doesNotMatch(recent, /Junho|Setembro 19/);
  assert.equal(report.evidence[0].date, '24/09/26');
});

test('league needs only outcomes and context and never leaks unmatched contexts into the denominator', () => {
  const report = analyze({ key: 'post', confirmed: true, dims: { map_name: 'Ascent', site: 'A' },
    events: events(12, 6, .72, { site: 'A' }, { map: 'Ascent' }),
    league: [
      { outcome: 1, context: { map_name: 'Ascent', site: 'A' } },
      { outcome: 0, context: { map_name: 'Ascent', site: 'A' } },
      { outcome: 1, context: { map_name: 'Ascent', site: 'B' } },
      { outcome: 1, context: { map_name: 'Lotus', site: 'A' } },
    ] });
  assert.equal(report.primary.leagueEvents, 2);
  assert.equal(report.primary.league, .5);
});

test('invalid events are discarded; missing unrelated fields, optional arrays and unknown keys are graceful', () => {
  for (const input of [{}, { key: 'unknown', dims: null, events: null, league: null }, {
    key: 'trade', dims: { side: null, site: '?' }, events: [
      { outcome: 0, expected: .6, context: { side: 'def' } },
      { outcome: 1, expected: .4 }, { outcome: 0, expected: 2 }, { outcome: 4, expected: .3 }, null,
    ], league: [{ outcome: 1 }],
  }]) {
    const report = analyze(input);
    assert.ok(Array.isArray(report.context));
    assert.doesNotMatch(JSON.stringify(report), /NaN|undefined|Infinity/);
  }
  assert.equal(analyze({ events: [{ outcome: 0, expected: .6 }, { outcome: 1, expected: .4 }] }).primary.events, 2);
});

test('new data changes every reported count rather than repeating the example values', () => {
  const a = advantageFixture(), b = advantageFixture();
  b.events = b.events.map((e) => ({ ...e, outcome: e.context.spike === 'plantada' && e.context.side === 'def' ? 1 : e.outcome }));
  const before = analyze(a), after = analyze(b);
  assert.notEqual(before.primary.successes, after.primary.successes);
  assert.equal(before.measurement.target, after.measurement.target);
  assert.notEqual(before.measurement.today, after.measurement.today);
  assert.deepEqual(after.primary.dims, {});
});

test('analyzer does not mutate events, dimensions, or optional context', () => {
  const input = advantageFixture(); const original = JSON.stringify(input);
  analyze(input);
  assert.equal(JSON.stringify(input), original);
});


test('a strong overall fundamental never becomes its worst exploratory child', () => {
  const input = { key: 'post', confirmed: true, events: [
    ...events(10, 4, .7, { site: 'A' }), ...events(90, 90, .7, { site: 'B' }),
  ] };
  for (const confirmed of [false, true]) {
    const report = analyze({ ...input, confirmed });
    assert.deepEqual(report.primary.dims, {});
    assert.equal(report.primary.events, 100);
    close(report.primary.observed, .94);
    assert.equal(report.confirmed, false);
    assert.ok(report.evidence.every((e) => e.outcome === 1));
    assert.match(report.context.join(' '), /não indicam uma fragilidade/);
  }
});

test('a negative unconfirmed slice also keeps its exact sample instead of hunting a worse child', () => {
  const report = analyze({ key: 'post', dims: { map_name: 'Haven' }, label: 'Pós-plant em Haven', events: [
    ...events(10, 0, .8, { site: 'A' }), ...events(90, 60, .7, { site: 'B' }),
  ] });
  assert.deepEqual(report.primary.dims, { map_name: 'Haven' });
  assert.equal(report.primary.events, 100);
  assert.equal(report.primary.successes, 60);
  assert.equal(report.primary.label, 'Pós-plant em Haven');
});

test('unknown selected dimensions remain exact filters instead of broadening the sample', () => {
  const report = analyze({ key: 'post', dims: { site: '?' }, confirmed: true, events: [
    ...events(10, 1, .8, { site: '?' }), ...events(90, 90, .7, { site: 'A' }),
  ] });
  assert.deepEqual(report.primary.dims, { site: '?' });
  assert.equal(report.primary.events, 10);
  assert.equal(report.primary.successes, 1);
  assert.ok(report.evidence.every((e) => e.context.site === '?'));
});

test('the same site letter on another map is not offered as a like-for-like comparator', () => {
  const report = analyze({ key: 'post', dims: { map_name: 'Haven', site: 'A' }, events: [
    ...events(10, 1, .8, { site: 'A' }), ...events(90, 90, .7, { site: 'A' }, { map: 'Lotus' }),
  ] });
  assert.equal(report.indicators.length, 2);
  assert.deepEqual(report.indicators[1].dims, {});
});


test('compound map-site slices derive the detector category and preserve the selected map', () => {
  const report = analyze({ key: 'post', dims: { map_site: 'Haven · A' }, confirmed: true, events: [
    ...events(10, 1, .8, { site: 'A' }), ...events(90, 90, .7, { site: 'A' }, { map: 'Lotus' }),
  ], league: [
    { outcome: 0, context: { map_name: 'Haven', site: 'A' } },
    { outcome: 1, context: { map_name: 'Lotus', site: 'A' } },
  ] });
  assert.deepEqual(report.primary.dims, { map_site: 'Haven · A' });
  assert.equal(report.primary.events, 10);
  assert.equal(report.primary.successes, 1);
  assert.equal(report.primary.leagueEvents, 1);
  assert.equal(report.primary.league, 0);
  assert.ok(report.evidence.every((e) => e.map === 'Haven' && e.context.site === 'A'));
});
