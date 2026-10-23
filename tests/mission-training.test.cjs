// Pure training model checks: node --test tests/mission-training.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(readFileSync(resolve(__dirname, '../roundrx/viz/mission-training.js'), 'utf8'), context);
const create = context.window.RoundRxTraining.create;
const focus = (key, dims = {}, extra = {}) => ({ key, dims, label: 'Recorte analisado', confirmed: true, enough: true, events: 100, matches: 8, observed: .4, expected: .6, gap: -20, ...extra });

test('all nine fundamentals yield distinct executable sessions whose timing adds up', () => {
  const keys = ['trade', 'advantage', 'fb_open', 'fb_rec', 'post', 'retake', 'keyrounds', 'halfopen', 'pressure'];
  const titles = new Set();
  for (const key of keys) {
    const result = create(focus(key));
    titles.add(result.title);
    for (const field of ['title', 'summary', 'objective', 'context', 'setup', 'roles', 'repetitions', 'success', 'progression', 'watch']) {
      assert.ok(typeof result[field] === 'string' && result[field].length > 0, `${key}.${field}`);
    }
    assert.equal(result.steps.length, 3);
    assert.equal(result.steps.reduce((minutes, step) => minutes + step.minutes, 0), result.minutes);
    assert.match(result.success, /^Meta do exercício:/);
    assert.doesNotMatch(JSON.stringify(result), /undefined|null|NaN/);
  }
  assert.equal(titles.size, keys.length);
});

test('trade changes from first-contact training to post-plant and uses the diagnostic window', () => {
  const opening = create(focus('trade', { phase: '1ª morte do round' }, { tradeWindow: 3 }));
  const post = create(focus('trade', { phase: 'pós-plant', side: 'def' }, { tradeWindow: 7 }));
  assert.notEqual(opening.title, post.title);
  assert.match(opening.setup, /rota de primeiro contato/);
  assert.match(post.setup, /retake após o plant/);
  assert.match(post.summary, /7 s/);
  assert.match(post.report.actions[0].text, /7 s, a mesma janela do diagnóstico/);
  assert.match(post.steps[1].instruction, /7 s/);
  assert.match(post.success, /7 s/);
  assert.match(post.watch, /7 s/);
  assert.doesNotMatch(post.steps[1].instruction, /3 s|5 s/);
});

test('trade names and snapshot distance are used without asserting line of sight', () => {
  const result = create(focus('trade', { victim_name: 'Contato', nearest_ally_name: 'Apoio', ally_dist: '5–10 m' }));
  assert.match(result.roles, /Contato inicia/);
  assert.match(result.roles, /Apoio começa na cobertura/);
  assert.match(result.setup, /5–10 m/);
  assert.match(result.setup, /não comprova linha de visão nem oportunidade real/);
  assert.match(result.steps[1].instruction, /registrem o bloqueio em vez de forçar/);
});

test('invalid or missing trade window does not invent a duration', () => {
  for (const tradeWindow of [undefined, null, 0, -3, NaN, Infinity, '5']) {
    const result = create(focus('trade', {}, { tradeWindow }));
    assert.match(result.steps[1].instruction, /janela de tempo indicada no diagnóstico/);
    assert.doesNotMatch(result.summary, /NaN|Infinity|undefined|null/);
  }
});

test('missing trade phase or planted side is resolved in review rather than silently assumed', () => {
  const general = create(focus('trade'));
  assert.match(general.setup, /mantenham a mesma fase/);
  assert.doesNotMatch(general.setup, /antes do plant/);
  const post = create(focus('trade', { phase: 'pós-plant' }));
  assert.match(post.setup, /definir se a dupla defende a spike ou tenta a retomada/);
  const advantage = create(focus('advantage', { spike: 'plantada' }));
  assert.match(advantage.setup, /confiram no round revisado se o time plantou ou tenta o retake/);
});

test('advantage preserves exact live-player counts and differentiates planted defense', () => {
  const result = create(focus('advantage', { state: '2v1', spike: 'plantada', side: 'def' }));
  assert.match(result.title, /2v1/);
  assert.match(result.setup, /primeiro número é de jogadores do time/);
  assert.match(result.setup, /spike adversária plantada/);
  assert.doesNotMatch(result.setup, /5v4/);
  const beforePlant = create(focus('advantage', { state: '4v3', spike: 'não plantada' }));
  assert.match(beforePlant.setup, /sem spike plantada/);
});

test('plant scenarios retain our-team orientation and elapsed plant time', () => {
  for (const key of ['post', 'retake']) {
    const result = create(focus(key, { pstate: '2v3', site: 'B', pwhen: 'depois de 60 s' }));
    assert.match(result.title, /no B em 2v3/);
    assert.match(result.setup, /2 jogadores do time e 3 adversários/);
    assert.match(result.setup, /depois de 60 s de tempo decorrido/);
    assert.match(result.setup, /não é o tempo restante da spike/);
  }
  assert.match(create(focus('post')).setup, /time joga no ataque/);
  assert.match(create(focus('retake')).setup, /time joga na defesa/);
  assert.match(create(focus('post', { pstate: '1v2' })).roles, /apenas um sobrevivente/);
  assert.match(create(focus('retake', { pstate: '1v2' })).roles, /acumula funções em sequência/);
});

test('unknown sites or player counts are treated as practice choices', () => {
  const result = create(focus('post', { pstate: '?', site: '?', map_name: '?' }));
  assert.doesNotMatch(result.title, /\?|5v5/);
  assert.match(result.setup, /treinador escolhe a condição da prática/);
  assert.match(result.setup, /definam um site apenas para a prática/);
});

test('each economy round type yields a different tactical resource plan', () => {
  const practice = new Set();
  for (const round_type of ['pistol', 'eco', 'anti-eco', 'force buy', 'armado']) {
    const result = create(focus('keyrounds', { round_type }));
    assert.match(result.title, new RegExp(round_type));
    practice.add(result.steps[1].instruction);
  }
  assert.equal(practice.size, 5);
  const inferior = create(focus('keyrounds', { economy: 'equipamento inferior' }));
  assert.match(inferior.setup, /equipamento inferior, isoladamente, não significa eco/);
  assert.doesNotMatch(inferior.title, /eco/);
});

test('opening-half paths preserve win/loss and do not derive buys solely from score', () => {
  const won = create(focus('halfopen', { moment: 'round 2 depois de vencer o pistol' }));
  const lost = create(focus('halfopen', { moment: 'round 2 depois de perder o pistol' }));
  assert.match(won.setup, /após vencer o pistol/);
  assert.match(won.setup, /sem assumir que o adversário fará eco/);
  assert.match(lost.setup, /após perder o pistol/);
  assert.match(lost.setup, /poupar ou comprometer/);
  for (const path of ['2–0', '1–1', '0–2']) {
    const result = create(focus('halfopen', { moment: `round 3 depois de ${path}` }));
    assert.ok(result.setup.includes(`round 3 depois de ${path}`));
    assert.match(result.setup, /placar sozinho não determina a compra/);
  }
  assert.match(create(focus('halfopen')).steps[1].instruction, /três fichas após vitória no pistol e três após derrota/);
});

test('opening and recovery practice different decisions and use observed duel role', () => {
  const opening = create(focus('fb_open', { duel_name: 'Entrada', duel_role: 'Iniciador', when: 'depois de 35 s' }));
  const recovery = create(focus('fb_rec', { duel_name: 'Entrada', duel_role: 'Iniciador', side: 'def', when: 'depois de 35 s' }));
  assert.match(opening.setup, /Entrada começa na função de quem disputa/);
  assert.match(opening.setup, /Iniciador/);
  assert.match(opening.setup, /não obriga um duelo nesse instante/);
  assert.match(recovery.setup, /quatro jogadores do time contra cinco/);
  assert.match(recovery.setup, /impedir o plant ou organizar a retomada/);
  assert.match(recovery.setup, /depois de 35 s de tempo decorrido/);
  assert.notEqual(opening.steps[1].instruction, recovery.steps[1].instruction);
});

test('pressure uses half phase and never attributes a statistical context to nerves', () => {
  const result = create(focus('pressure', { lead: 'atrás', phase: 'prorrogação' }));
  assert.match(result.setup, /atrás no placar/);
  assert.match(result.setup, /fase do half: prorrogação/);
  assert.match(result.setup, /não comprova nervosismo nem uma causa psicológica/);
  assert.doesNotMatch(result.title, /pós-plant|pré-plant/);
});

test('insufficient samples and above-expected focuses remain exploratory', () => {
  const small = create(focus('trade', {}, { confirmed: false, enough: false, matches: 1 }));
  const positive = create(focus('trade', {}, { confirmed: false, enough: true, observed: .8, expected: .6, gap: 20 }));
  const descriptive = create(focus('trade', {}, { confirmed: false, enough: true }));
  assert.match(small.objective, /Amostra em formação/);
  assert.match(positive.objective, /Resultado no esperado ou acima dele/);
  assert.match(positive.objective, /sem fragilidade confirmada/);
  assert.match(descriptive.objective, /ainda não há fragilidade recorrente confirmada/);
  assert.match(create(focus('trade')).objective, /valide a causa na revisão/);
});

test('the exact analyzed slice stays separate from an evidence-map practice example', () => {
  const evidence = [{ map: 'Haven', round: 17, opponent: 'Time B', why: 'Uma pista para revisão' }];
  const result = create(focus('trade', {}, { label: 'Mortes com aliado vivo', evidence }));
  assert.equal(result.context, 'Mortes com aliado vivo');
  assert.match(result.setup, /Haven como exemplo de prática/);
  assert.match(result.setup, /recorte não está limitado a esse mapa/);
  assert.match(result.steps[0].instruction, /Haven round 17 vs Time B/);
  assert.equal(result.evidence[0], evidence[0]);
  const explicit = create(focus('trade', { map_name: 'Ascent', side: 'atk' }, { evidence }));
  assert.match(explicit.setup, /^Personalizada em Ascent, no ataque/);
  assert.doesNotMatch(explicit.setup, /Personalizada em Haven/);
  const sideOnly = create(focus('trade', { side: 'def' }, { evidence }));
  assert.match(sideOnly.setup, /Haven como exemplo de prática/);
  assert.match(sideOnly.setup, /time na defesa conforme o recorte/);
  const coachMap = create(focus('trade', { side: 'atk' }));
  assert.match(coachMap.setup, /mapa escolhido pelo treinador/);
  assert.match(coachMap.setup, /time no ataque conforme o recorte/);
});

test('full-team and reduced-player drills explain sparring participation', () => {
  assert.match(create(focus('fb_rec')).setup, /cinco sparrings.*quatro integrantes do time/);
  for (const key of ['keyrounds', 'pressure', 'halfopen']) {
    assert.match(create(focus(key)).setup, /cinco jogadores do time e cinco sparrings/);
  }
  for (const key of ['advantage', 'post', 'retake']) {
    const result = create(focus(key, { state: '3v2', pstate: '3v2' }));
    assert.match(result.setup, /3 jogadores do time e 2 sparrings/);
  }
});

test('missing inputs produce usable exploratory instructions and do not mutate supplied data', () => {
  for (const value of [undefined, null, {}, { key: 'toString' }, { key: '__proto__' }, { key: 'trade', evidence: [null, 3, {}], dims: null }]) {
    const result = create(value);
    assert.match(result.objective, /exploratório/);
    assert.match(result.steps[0].instruction, /Separem até dois rounds/);
    assert.doesNotMatch(JSON.stringify(result), /undefined|NaN/);
  }
  const input = focus('trade', { map_name: 'Ascent' }, { evidence: [{ map: 'Ascent', round: 1 }] });
  const before = JSON.stringify(input);
  const result = create(input);
  assert.equal(JSON.stringify(input), before);
  assert.notEqual(result.evidence, input.evidence);
});

test('analytical report and popup summary use the same detailed context and real counts', () => {
  const result = create(focus('advantage', {}, {
    confirmed: false, noun: 'vantagens', did: 'convertidas', observed: .7, expected: .68,
    analysis: {
      primary: { label: 'Vantagem na defesa com spike plantada', dims: { side: 'def', spike: 'plantada', state: '2v1' }, observed: .375, expected: .661, events: 24, matches: 4, successes: 9, league: .561, deltaEvents: 6.864 },
      indicators: [{ label: 'Vantagem na defesa com spike plantada', observed: .375, expected: .661, events: 24, successes: 9, league: .561 }],
      context: ['12 das 15 derrotas vieram das duas últimas séries.'],
      evidence: [{ map: 'Haven', round: 18, opponent: 'Time B', why: '2v1, perdeu o round' }],
    },
  }));
  assert.equal(result.summary, result.report.summary);
  assert.match(result.summary, /38%; esperado 66%/);
  assert.match(result.report.title, /Investigação/);
  assert.match(result.report.evidence, /converteu 9 de 24 vantagens/);
  assert.match(result.report.evidence, /7 rounds a menos/);
  assert.equal(result.report.indicators[0].team, '38% (9 de 24)');
  assert.equal(result.report.indicators[0].league, '56%');
  assert.equal(result.report.rounds[0].round, 18);
  assert.match(result.report.actions[0].text, /hipótese apenas se houver evidência/);
  assert.match(result.report.actions[1].text, /positivos e negativos/);
  assert.doesNotMatch(result.objective, /Resultado no esperado ou acima/);
  assert.match(result.report.caveat, /sem padrão recorrente confirmado/);
  assert.deepEqual(Array.from(result.report.actions, (a) => a.label), ['Scrim', 'VOD', 'Referências']);
});

test('trade differences remain trades and missing league is not fabricated', () => {
  const result = create(focus('trade', { map_name: 'Lotus', side: 'def' }, { events: 56, observed: 6 / 56, expected: .244, tradeWindow: 4 }));
  assert.match(result.report.evidence, /8 trades a menos/);
  assert.doesNotMatch(result.report.evidence, /8 rounds/);
  assert.equal(result.report.indicators[0].league, '—');
  assert.match(result.report.actions[0].text, /4 s, a mesma janela do diagnóstico/);
  assert.match(result.report.measurement[0].target, /referência de 24%/);
  assert.doesNotMatch(result.report.measurement[0].target, /garant|próximo scrim/);
});

test('plan introduction follows the selected team and explains the analytical reference', () => {
  const plan = context.window.RoundRxTraining.plan({ team: 'Outro time', wins: 4, matches: 9 }, [focus('trade', {}, { confirmed: false })]);
  assert.match(plan.intro, /^Outro time venceu 4 de 9 mapas/);
  assert.match(plan.intro, /Nenhum tem padrão recorrente confirmado/);
  assert.match(plan.howToRead, /incluindo o time analisado/);
  assert.match(plan.howToRead, /R1 = pistol/);
  assert.ok(plan.caveats.some((value) => /3 a 4 novos mapas/.test(value)));
  assert.doesNotMatch(plan.intro, /caap|Pedro|13 de 18/);
});


test('every strong or equal fundamental preserves execution even with a stale confirmed flag', () => {
  for (const key of ['trade', 'advantage', 'fb_open', 'fb_rec', 'post', 'retake', 'keyrounds', 'halfopen', 'pressure']) {
    for (const observed of [.6, .9]) {
      const result = create(focus(key, {}, { observed, expected: .6, confirmed: true,
        evidence: [{ round: 1, outcome: 0 }, { round: 2, outcome: 1 }] }));
      assert.equal(result.mode, 'maintenance', key);
      assert.equal(result.confirmed, false, key);
      assert.match(result.report.actions[0].text, /execução bem-sucedida/);
      assert.match(result.report.actions[1].text, /exemplos bem-sucedidos/);
      assert.match(result.report.measurement[0].target, /Manter a execução/);
      assert.doesNotMatch(result.success, /8 de 10|5 de 6|3 de 4/);
      assert.deepEqual(Array.from(result.evidence, (e) => e.round), [2]);
    }
  }
});

test('the analyzed sample can revoke a stale confirmed flag and supplies all status metrics', () => {
  const result = create(focus('post', {}, { analysis: {
    primary: { dims: {}, observed: .9, expected: .7, events: 100, matches: 8, successes: 90 },
    enough: true, confirmed: false,
  } }));
  assert.equal(result.mode, 'maintenance');
  assert.equal(result.confirmed, false);
  assert.match(result.summary, /90%; esperado 70%/);
  assert.match(result.objective, /Resultado no esperado ou acima/);
  assert.doesNotMatch(result.report.caveat, /Padrão recorrente no/);
});

test('small or missing samples only observe and never prescribe a corrective target', () => {
  for (const extra of [{ events: 7 }, { matches: 1 }, { enough: false }, { events: undefined, matches: undefined },
    { analysis: { primary: { observed: .1, expected: .8, events: 7, matches: 4 }, enough: false, confirmed: false } }]) {
    const result = create(focus('trade', {}, extra));
    assert.equal(result.mode, 'observation');
    assert.equal(result.confirmed, false);
    assert.equal(result.enough, false);
    assert.match(result.report.measurement[0].target, /Coletar novas situações/);
    assert.match(result.steps[1].instruction, /sem impor uma mudança/);
    assert.doesNotMatch(result.report.measurement[0].target, /Aproximar/);
  }
});

test('unconfirmed deficits investigate causes before any optional tactical change', () => {
  const result = create(focus('trade', {}, { confirmed: false }));
  assert.equal(result.mode, 'investigation');
  assert.equal(result.confirmed, false);
  assert.match(result.report.actions[0].text, /apenas se houver evidência/);
  assert.match(result.report.measurement[0].target, /investigar.*antes de definir/);
  assert.doesNotMatch(result.success, /8 de 10/);
});

test('plan confirmation counts use effective training evidence instead of stale input flags', () => {
  const f = focus('post', {}, { observed: .9 });
  const plan = context.window.RoundRxTraining.plan({ team: 'Time forte', wins: 8, matches: 8 }, [f]);
  assert.match(plan.intro, /Nenhum tem padrão recorrente confirmado/);
});


test('compound map-site scopes generate the correct location without changing report dimensions', () => {
  const result = create(focus('post', { map_site: 'Haven · A' }));
  assert.match(result.title, /no A/);
  assert.match(result.setup, /^Personalizada em Haven/);
  assert.match(result.report.actions[0].text, /no A/);
  assert.deepEqual(JSON.parse(JSON.stringify(result.primary.dims)), { map_site: 'Haven · A' });
  const exploratory = create(focus('post', { map_site: 'Haven · A' }, { confirmed: false }));
  assert.match(exploratory.title, /em Haven no site A/);
  assert.match(exploratory.report.actions[0].text, /em Haven no site A/);
});

test('an unconfirmed difference smaller than half a point remains maintenance', () => {
  const result = create(focus('post', {}, { confirmed: false, observed: .599, expected: .6 }));
  assert.equal(result.mode, 'maintenance');
  assert.match(result.objective, /próximo da referência/);
  assert.match(result.report.measurement[0].target, /Manter a execução/);
});


test('recent-scope plans distinguish overall campaign dates from eligible fundamental matches', () => {
  const plan = context.window.RoundRxTraining.plan({ team: 'Time', matches: 10, scope: 'Últimas 10 partidas com eventos de cada fundamento' }, []);
  assert.match(plan.howToRead, /campanha e o período.*últimas 10 partidas gerais/);
  assert.match(plan.howToRead, /até 10 partidas com eventos daquele fundamento/);
  assert.match(plan.howToRead, /partidas anteriores ao período do resumo/);
  const all = context.window.RoundRxTraining.plan({ team: 'Time', scope: 'Todas as partidas' }, []);
  assert.doesNotMatch(all.howToRead, /últimas 10/);
});
