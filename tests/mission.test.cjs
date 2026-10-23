// Optional UI model checks: node tests/mission.test.cjs (no npm dependencies).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(readFileSync(resolve(__dirname, '../roundrx/viz/mission.js'), 'utf8'), context);
const select = context.window.RoundRxMission.selectFocus;
const sceneForTeam = context.window.RoundRxMission.sceneForTeam;
const candidate = (key, extra = {}) => ({ id: key, key, observed: .4, expected: .6, gap: -20, events: 100, matches: 8, selected: false, ...extra });
const model = (candidates) => ({ candidates, minEvents: 30, minMatches: 3 });

test('recurring deficits take precedence over larger unconfirmed differences', () => {
  const rows = select(model([candidate('trade', { selected: true }), candidate('post', { events: 1000 })]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'trade');
  assert.equal(rows[0].confirmed, true);
});
test('at most three different fundamentals are selected', () => {
  const rows = select(model(['trade', 'trade', 'post', 'retake', 'advantage'].map((key) => candidate(key, { selected: true }))));
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((f) => f.key)).size, 3);
});
test('a single match never becomes a confirmed weakness', () => {
  const rows = select(model([candidate('trade', { matches: 1, selected: true })]));
  assert.equal(rows[0].enough, false);
  assert.equal(rows[0].confirmed, false);
});
test('above-expected patterns never become correction objectives, even when selected', () => {
  const rows = select(model([candidate('trade', { observed: .8, gap: 20, selected: true })]));
  assert.equal(rows.length, 0);
});
test('a strong team receives no invented focus or compulsory three-item plan', () => {
  const rows = select(model(['trade', 'post', 'retake', 'advantage'].map((key) => candidate(key, { observed: .9, gap: 30 }))));
  assert.equal(rows.length, 0);
});
test('one exploratory deficit is not padded with strong or neutral fundamentals', () => {
  const rows = select(model([candidate('trade'), candidate('post', { observed: .8, gap: 20 }),
    candidate('retake', { observed: .6, gap: 0 })]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'trade');
  assert.equal(rows[0].confirmed, false);
});
test('unconfirmed differences that round to zero pp do not trigger a focus', () => {
  assert.equal(select(model([candidate('trade', { observed: .599, gap: -.1 })])).length, 0);
});
test('rates determine direction even when the stored gap contradicts them', () => {
  assert.equal(select(model([candidate('trade', { observed: .8, gap: -20, selected: true })])).length, 0);
  const rows = select(model([candidate('trade', { gap: 20, selected: true })]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].confirmed, true);
  assert.ok(rows[0].gap < 0);
});
test('a proven contextual weakness remains actionable within a strong fundamental', () => {
  const rows = select(model([candidate('trade', { observed: .8, gap: 20, selected: true }),
    candidate('trade', { id: 'trade-def', selected: true, dims: { side: 'def' }, events: 40 })]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'trade-def');
  assert.equal(rows[0].confirmed, true);
});
test('invalid rates and unsupported fundamentals do not receive unrelated tips', () => {
  const invalid = [candidate('unknown'), candidate('trade', { observed: -.2 }),
    candidate('post', { expected: 1.2 }), candidate('retake', { events: Infinity })];
  assert.equal(select(model(invalid)).length, 0);
});
test('missing/empty performance data produces no invented objectives', () => {
  assert.equal(select(model([])).length, 0);
  assert.equal(select(model([candidate('trade', { observed: null, events: 0 })])).length, 0);
});

test('backdrop assignments stay fixed for canonical team names and use all four scenes', () => {
  const expected = { a2e_uff: 'Haven', inatel_gray: 'Ascent', gdu_ufpb: 'Sunset', caap_auroras: 'Lotus' };
  for (const [team, scene] of Object.entries(expected)) assert.equal(sceneForTeam(team), scene);
});

test('a fresh session and normalized team spelling keep the same backdrop without storage', () => {
  const fresh = { window: {} };
  vm.runInNewContext(readFileSync(resolve(__dirname, '../roundrx/viz/mission.js'), 'utf8'), fresh);
  assert.equal(fresh.window.RoundRxMission.sceneForTeam('a2e_uff'), sceneForTeam('a2e_uff'));
  assert.equal(sceneForTeam('  INATEL_GRAY  '), sceneForTeam('inatel_gray'));
  assert.equal(sceneForTeam('e\u0301quipe'), sceneForTeam('équipe'));
});
