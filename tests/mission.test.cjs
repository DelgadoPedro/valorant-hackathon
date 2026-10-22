// Optional UI model checks: node tests/mission.test.cjs (no npm dependencies).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(readFileSync(resolve(__dirname, '../roundrx/viz/mission.js'), 'utf8'), context);
const select = context.window.RoundRxMission.selectFocus;
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
test('above-expected patterns remain exploratory rather than weaknesses', () => {
  const rows = select(model([candidate('trade', { observed: .8, gap: 20, selected: true })]));
  assert.equal(rows[0].confirmed, false);
  assert.equal(rows[0].observed, .8);
});
test('missing/empty performance data produces no invented objectives', () => {
  assert.equal(select(model([])).length, 0);
  assert.equal(select(model([candidate('trade', { observed: null, events: 0 })])).length, 0);
});
