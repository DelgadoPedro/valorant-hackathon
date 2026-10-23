// Integration with the checked-in match snapshot and the current Mission code.
// Run: node --test tests/mission-data.test.cjs (no npm dependencies).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const read = (path) => readFileSync(resolve(__dirname, '..', path), 'utf8');
const html = read('site/index.html');
const start = html.indexOf('window.RRX=') + 'window.RRX='.length;
assert.ok(start >= 'window.RRX='.length, 'The published snapshot contains the match payload');
const data = JSON.parse(html.slice(start, html.indexOf(';</script>', start)));
const sandbox = { window: { RRX: data } };
vm.createContext(sandbox);
for (const file of ['mission-report.js', 'mission-training.js', 'mission.js']) {
  vm.runInContext(read(`roundrx/viz/${file}`), sandbox, { filename: file });
}

// Use the actual dashboard decoder, scope selection and candidate assembly.
// Only presentation helpers and banner rendering are replaced in this DOM-free test.
const app = read('roundrx/viz/app.js');
function between(from, to) {
  const first = app.indexOf(from), last = app.indexOf(to, first);
  assert.ok(first >= 0 && last > first, `Dashboard integration boundary: ${from}`);
  return app.slice(first, last);
}
vm.runInContext(`
  const D = window.RRX, M = D.M, state = { dscope: 'todas' };
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const unrle = (c) => c && c.rle ? c.rle[0].flatMap((v, i) => Array(c.rle[1][i]).fill(v)) : c;
  const teamMatches = D.teams.map(() => []);
  for (let i = 0; i < M.id.length; i++) { teamMatches[M.red[i]].push(i); teamMatches[M.blue[i]].push(i); }
  const prettyTeam = (s) => s, fmtDate = (s) => s;
  const opp = (m, team) => M.red[m] === team ? M.blue[m] : M.red[m];
  const scoreOf = (m, team) => M.red[m] === team ? [M.rs[m], M.bs[m]] : [M.bs[m], M.rs[m]];
  const NF1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const pct = (v) => Math.round(100 * v) + '%';
  ${between('  const FU = D.FUND', '  function yOf(')}
  ${between('  function scopeEvents(', '  const inSlice =')}
  ${between('  const fdRows =', '  const scopeName =')}
  ${between('  const fundName =', '\n')}
  ${between('  const missionReportCache =', '  function renderHome(')}
  window.RoundRxMission.banner = (model) => model;
  window.missionModel = (team, scope) => {
    state.dscope = scope;
    const matches = scope === 'todas' ? teamMatches[team] : teamMatches[team].slice(-Number(scope.split('_')[1]));
    return missionBanner(team, matches);
  };
`, sandbox, { filename: 'dashboard-mission-integration.js' });

const { RoundRxMission: mission, RoundRxTraining: training, missionModel } = sandbox.window;
const scopes = [...new Set(Object.values(data.FUND.F).flatMap((fund) => fund.FD.scope))];
const models = data.teams.flatMap((name, team) => scopes.map((scope) => ({ name, scope, model: missionModel(team, scope) })));

test('every team and scope receives only below-expected focuses, without filling slots with strengths', () => {
  let selected = 0, empty = 0;
  for (const { name, scope, model } of models) {
    const focuses = mission.selectFocus(model), context = `${name}/${scope}`;
    assert.ok(focuses.length <= 3, context);
    assert.equal(new Set(focuses.map((f) => f.key)).size, focuses.length, context);
    for (const focus of focuses) {
      assert.ok(focus.observed < focus.expected, `${context}/${focus.key}: ${focus.observed} >= ${focus.expected}`);
      assert.ok(focus.gap < 0, `${context}/${focus.key}`);
      selected++;
    }
    if (model.candidates.every((c) => c.observed >= c.expected)) {
      assert.equal(focuses.length, 0, `${context}: no deficit should produce no correction`);
      empty++;
    }
  }
  assert.ok(selected > 0, 'The real dataset still produces supported focuses');
  assert.ok(empty > 0, 'The audit includes teams with no deficits');
});

test('Azure Bears Golden and USCS Hawks keep their strong fundamentals out of corrective missions', () => {
  for (const name of ['azure_bears_golden', 'uscs_hawks']) {
    const model = models.find((row) => row.name === name && row.scope === 'todas')?.model;
    assert.ok(model, `Snapshot contains ${name}`);
    assert.ok(model.candidates.every((c) => c.observed >= c.expected), `${name} has no deficient diagnostic slice`);
    assert.equal(mission.selectFocus(model).length, 0, name);
  }
});

test('a confirmed contextual deficit remains actionable within an above-expected fundamental', () => {
  const model = models.find((row) => row.name === 'octacore_python' && row.scope === 'todas').model;
  const overall = model.candidates.find((c) => c.key === 'keyrounds' && Object.keys(c.dims).length === 0);
  assert.ok(overall.observed > overall.expected);
  const focus = mission.selectFocus(model).find((c) => c.key === 'keyrounds');
  assert.ok(focus?.confirmed, 'Ascent armed rounds have a confirmed deficit despite a positive overall result');
  assert.equal(focus.dims.map_name, 'Ascent');
  assert.equal(focus.dims.round_type, 'armado');
});

test('real selected focuses retain their diagnosed slice and below-expected result through report and training', () => {
  let checked = 0;
  const contradictions = [];
  for (const { name, scope, model } of models) {
    for (const focus of mission.selectFocus(model)) {
      const analysis = focus.analyze(), context = `${name}/${scope}/${focus.key}`;
      assert.deepEqual(JSON.parse(JSON.stringify(analysis.primary.dims)), focus.dims, `${context}: report changed the diagnosed slice`);
      assert.equal(analysis.primary.events, focus.events, `${context}: event samples differ`);
      assert.equal(analysis.primary.matches, focus.matches, `${context}: match samples differ`);
      assert.ok(Math.abs(analysis.primary.observed - focus.observed) <= 1e-4, `${context}: observed rates differ`);
      assert.ok(Math.abs(analysis.primary.expected - focus.expected) <= 1e-3, `${context}: expected rates differ`);
      if (!(analysis.primary.observed < analysis.primary.expected)) {
        contradictions.push(`${context}: selected ${focus.observed}/${focus.expected} over ${focus.events} events, report ${analysis.primary.observed}/${analysis.primary.expected} over ${analysis.primary.events} events`);
        continue;
      }
      const session = training.create(focus);
      assert.equal(session.confirmed, analysis.confirmed, `${context}: training changed the evidence strength`);
      assert.notEqual(session.mode, 'maintenance', `${context}: the selected focus should still be a deficit`);
      assert.equal(session.summary, session.report.summary, `${context}: popup and report diverged`);
      checked++;
    }
  }
  assert.ok(checked > 0);
  assert.deepEqual(contradictions, [], 'Selected deficits must agree with the report events');
});
