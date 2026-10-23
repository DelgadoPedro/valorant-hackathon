// Run with node --test tests/mission-pdf.test.cjs; no npm dependencies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const context = { window: {}, Blob };
const source = readFileSync(resolve(__dirname, '../roundrx/viz/mission-pdf.js'), 'utf8');
vm.runInNewContext(source, context);
const create = context.window.RoundRxMissionPDF.create;
const decoder = new TextDecoder('windows-1252');
const extractText = (pdf) => [...pdf.matchAll(/<([0-9A-F]+)> Tj/g)].map((match) => decoder.decode(Buffer.from(match[1], 'hex'))).join('\n');
const read = async (blob) => Buffer.from(await blob.arrayBuffer()).toString('ascii');
const model = { team: 'Águia (BR) \\ Academy', scope: 'Últimas 10 partidas', matches: 8, rounds: 167 };
const focus = (overrides = {}) => ({
  key: 'trade', name: 'Trocar kills em dupla', observed: 0.43, expected: 0.62, gap: -19,
  events: 93, matches: 8, confirmed: true, enough: true,
  training: {
    title: 'Contato com cobertura', summary: 'Transforme a análise em uma rotina de comunicação e resposta.',
    minutes: 25, objective: 'Preparar uma resposta ao primeiro contato.', context: 'Ataque em Ascent, após a primeira eliminação.',
    setup: 'Servidor personalizado com duas duplas e um observador. Use o mesmo corredor do VOD.',
    roles: ['Dupla de entrada: abrir e cobrir.', 'Observador: registrar distância, tempo e comunicação.'],
    steps: [
      { title: 'Revisão e hipótese', minutes: 5, instruction: 'Assistam a três rounds. Confirmem a possibilidade de troca antes de apontar uma causa.' },
      { title: 'Prática com papéis alternados', minutes: 15, instruction: 'Façam duas séries de seis entradas. Alternem quem inicia e quem cobre.' },
      { title: 'Debrief e ajuste', minutes: 5, instruction: 'Comparem as séries e combinem uma regra para o próximo scrim.' },
    ],
    repetitions: 'Duas séries de seis entradas; inverta as funções na segunda série.',
    success: 'Em 8 de 12 entradas, o segundo jogador consegue responder sem perder a cobertura.',
    progression: 'Adicione um ângulo defensor depois de estabilizar a coordenação.',
    watch: 'Compare a taxa de trocas na mesma janela de tempo e no mesmo contexto.',
    evidence: [{ map: 'Ascent', round: 8, opponent: 'Equipe Ñ', date: '2026-09-15', why: 'Primeira baixa sem troca: verificar distância e linha de visão.' }],
  },
  ...overrides,
});

function assertValidStructure(pdf) {
  assert.ok(pdf.startsWith('%PDF-1.4\n'));
  assert.ok(pdf.endsWith('%%EOF\n'));
  const start = Number(pdf.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.equal(pdf.slice(start, start + 5), 'xref\n');
  const entries = pdf.slice(start).split('\n');
  const objectCount = Number(entries[1].split(' ')[1]) - 1;
  assert.equal(entries[2], '0000000000 65535 f ');
  for (let number = 1; number <= objectCount; number++) {
    const offset = Number(entries[number + 2].slice(0, 10));
    assert.ok(pdf.slice(offset).startsWith(`${number} 0 obj\n`), `xref for object ${number} points to its byte offset`);
  }
  for (const match of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const end = match.index + match[0].length + Number(match[1]);
    assert.ok(/^(?:\n)?endstream/.test(pdf.slice(end)), 'stream byte length matches its declared length');
  }
  const pageCount = Number(pdf.match(/\/Type \/Pages \/Count (\d+)/)[1]);
  assert.equal([...pdf.matchAll(/\/Type \/Page /g)].length, pageCount);
  assert.equal([...pdf.matchAll(/\/MediaBox \[0 0 595\.28 841\.89\]/g)].length, pageCount);
  return pageCount;
}

test('creates an actual A4 PDF with exact xref offsets and stream lengths', async () => {
  const blob = create(model, [focus(), focus({ name: 'Retake' }), focus({ name: 'Pós-plant' })]);
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'application/pdf');
  const pdf = await read(blob);
  const pages = assertValidStructure(pdf);
  assert.ok(pages >= 4 && pages <= 10, `cover and complete training sheets: ${pages} pages`);
  const text = extractText(pdf);
  assert.match(text, /75 min/);
  assert.match(text, /PARTIDAS ANALISADAS/);
  assert.match(text, /REGISTRO DA EQUIPE/);
  assert.match(text, new RegExp(`01 / ${String(pages).padStart(2, '0')}`));
});

test('preserves selectable Portuguese accents and safe literal punctuation', async () => {
  const pdf = await read(create(model, [focus()]));
  const text = extractText(pdf);
  assert.ok(text.includes(model.team));
  assert.ok(text.includes('MISSÃO DE EVOLUÇÃO'));
  assert.ok(text.includes('REVISÃO') || text.includes('Revisão e hipótese'));
  assert.ok(text.includes('PREPARAÇÃO'));
  assert.ok(text.includes('vs Equipe Ñ'));
  assert.ok(text.includes('Round 8'));
  assert.ok(text.includes('43%'));
  assert.ok(text.includes('62%'));
  assert.match(pdf, /\/Encoding \/WinAnsiEncoding/);
  assert.match(pdf, /\/ToUnicode \d+ 0 R/);
  assert.match(pdf, /<e7> <00e7>/i);
  assert.match(pdf, /<e3> <00e3>/i);
  assert.ok(!source.toLowerCase().includes('<' + '/script'), 'can be safely embedded in the offline HTML template');
});

test('distinguishes exploratory and limited samples without inventing weaknesses', async () => {
  const pdf = await read(create(model, [focus({ confirmed: false, enough: true, observed: 0.8 }), focus({ confirmed: false, enough: false, events: 7, matches: 1 })]));
  const text = extractText(pdf);
  assert.ok(text.includes('Exploração'));
  assert.ok(text.includes('Amostra limitada'));
  assert.ok(text.includes('sem conclusão de fragilidade'));
  assert.ok(!text.includes('Prioridade recorrente'));
});

test('paginates long names, titles, instructions, and evidence within page bounds', async () => {
  const long = 'Coordenação e preparação para a próxima decisão. '.repeat(65);
  const item = focus();
  item.training.title = long;
  item.training.setup = long;
  item.training.steps[0].title = long;
  item.training.steps[1].instruction = long;
  item.training.evidence[0].opponent = 'Outro time ' + 'Á'.repeat(380);
  const pdf = await read(create({ ...model, team: 'Equipe ' + long }, [item]));
  const pages = assertValidStructure(pdf);
  assert.ok(pages > 4);
  for (const match of pdf.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
    const x = Number(match[1]), baseline = Number(match[2]);
    assert.ok(x >= 40 && x <= 550, `text x ${x} stays within margins`);
    assert.ok(baseline >= 24 && baseline <= 813, `text baseline ${baseline} stays within the page`);
  }
  const text = extractText(pdf);
  assert.ok(text.includes('REGISTRO DA EQUIPE'), 'notes remain present after all long content');
  assert.ok(text.includes('EQUIPE'), 'full overflowing team name is also rendered in the body');
});

test('handles absent optional fields without adding placeholder exercises', async () => {
  const pdf = await read(create({}, []));
  assert.equal(assertValidStructure(pdf), 1);
  assert.ok(extractText(pdf).includes('00'));
  assert.ok(!extractText(pdf).includes('undefined'));
});
