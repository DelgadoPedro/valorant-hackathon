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
const model = {
  team: 'Águia (BR) \\ Academy', scope: 'Últimas 10 partidas', period: '15/09 a 22/10/2026', matches: 8, rounds: 167,
  report: {
    intro: 'Os três pontos abaixo mostram onde a equipe deve começar pela revisão do VOD.',
    howToRead: 'Observado = o que o time fez; esperado = outros times na mesma situação. R1 = pistol.',
    caveats: ['Olhem a soma de 3 a 4 mapas antes de concluir algo.'],
  },
};
const focus = (overrides = {}) => ({
  key: 'trade', name: 'Trocar kills em dupla', observed: 0.43, expected: 0.62, gap: -19,
  events: 93, matches: 8, confirmed: true, enough: true,
  training: {
    report: {
      title: 'Trocar kills com cobertura no ataque em Ascent',
      evidence: 'No ataque em Ascent, o time troca 40 de 93 mortes (43%); o esperado é 62%. Comecem pela revisão do VOD.',
      indicators: [{ label: 'Mortes trocadas no ataque em Ascent', team: '43% (40 de 93)', expected: '62%', league: '57%' }],
      context: ['São 93 eventos em 8 partidas; confirmem no VOD a cobertura possível.', 'Sinal recorrente; valide a causa nas imagens.'],
      rounds: [{ map: 'Ascent', round: 8, opponent: 'Equipe Ñ', date: '15/09', why: 'Primeira baixa sem troca: verificar distância e linha de visão.' }],
      actions: [
        { label: 'Scrim', text: 'Treinem contatos em dupla na mesma rota; quem cobre confirma a possibilidade de responder antes da entrada.' },
        { label: 'VOD', text: 'Pausem antes da morte e confiram obstáculos, utilitários e comunicação.' },
        { label: 'Referências', text: 'Observem contatos profissionais no mesmo mapa e lado, com atenção à cobertura.' },
      ],
      measurement: [{ point: 'Trades no ataque em Ascent', today: '43%', target: 'Acompanhar a diferença para 62% em situações equivalentes.' }],
    },
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

test('creates an actual A4 report with exact xref offsets and stream lengths', async () => {
  const blob = create(model, [focus(), focus({ name: 'Retake' }), focus({ name: 'Pós-plant' })]);
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'application/pdf');
  const pdf = await read(blob);
  const pages = assertValidStructure(pdf);
  assert.ok(pages >= 2 && pages <= 10, `opening and flowing analytical report: ${pages} pages`);
  const text = extractText(pdf);
  assert.match(text, /Plano de treino/);
  assert.match(text, /Como ler/);
  assert.match(text, /8 partidas analisadas/);
  assert.match(text, /15\/09 a 22\/10\/2026/);
  assert.match(text, /Indicador\nTime\nEsperado\nLiga/);
  assert.match(text, /Contexto/);
  assert.match(text, /Rounds para o VOD/);
  assert.match(text, /O que fazer/);
  assert.match(text, /Scrim:/);
  assert.match(text, /VOD:/);
  assert.match(text, /Referências:/);
  assert.match(text, /Como medir no próximo scrim/);
  assert.match(text, /Alvo de acompanhamento/);
  assert.ok(!text.includes('FICHA') && !text.includes('ROTEIRO DA PRÁTICA'), 'analytical report replaces exercise sheets');
  assert.match(text, new RegExp(`01 / ${String(pages).padStart(2, '0')}`));
});

test('preserves selectable Portuguese accents and safe literal punctuation', async () => {
  const pdf = await read(create(model, [focus()]));
  const text = extractText(pdf);
  assert.ok(text.includes(model.team));
  assert.ok(text.includes('MISSÃO DE EVOLUÇÃO'));
  assert.ok(text.includes('revisão do VOD'));
  assert.ok(text.includes('vs Equipe Ñ'));
  assert.ok(text.includes('Ascent R8'));
  assert.ok(text.includes('43% (40 de 93)'));
  assert.ok(text.includes('62%'));
  assert.match(pdf, /\/Encoding \/WinAnsiEncoding/);
  assert.match(pdf, /\/ToUnicode \d+ 0 R/);
  assert.match(pdf, /<e7> <00e7>/i);
  assert.match(pdf, /<e3> <00e3>/i);
  assert.ok(!source.toLowerCase().includes('<' + '/script'), 'can be safely embedded in the offline HTML template');
});

test('renders the supplied analytical content without adding rates or confirmed causes', async () => {
  const item = focus();
  item.training.report.indicators[0].league = null;
  item.training.report.context = ['Amostra limitada: sem conclusão de fragilidade.', 'Exploração: confirme se a cobertura era possível no VOD.'];
  item.training.report.measurement[0].target = 'Revisar mais partidas no mesmo contexto.';
  item.training.report.caveat = 'Amostra em formação: recorte exploratório, sem padrão recorrente confirmado.';
  const reportBefore = JSON.stringify(item.training.report);
  const modelBefore = JSON.stringify(model);
  const pdf = await read(create(model, [item]));
  const text = extractText(pdf);
  assert.ok(text.includes('Exploração'));
  assert.ok(text.includes('Amostra limitada'));
  assert.ok(text.includes('sem conclusão de fragilidade'));
  assert.ok(!text.includes('57%'));
  assert.ok(!text.includes('Sinal recorrente'));
  const focusText = text.slice(text.indexOf('FOCO 01 / 01'));
  assert.ok(focusText.indexOf('Amostra em formação') < focusText.indexOf('Indicador'), 'focus caveat appears before the evidence table');
  assert.equal(JSON.stringify(item.training.report), reportBefore, 'rendering does not mutate the training report');
  assert.equal(JSON.stringify(model), modelBefore, 'rendering does not mutate report caveats');
});

test('flows short focus sections and monitoring onto available page space', async () => {
  const concise = (name) => ({
    key: name, name,
    training: { report: {
      title: name, evidence: 'Confiram a cobertura no VOD.',
      indicators: [{ label: name, team: '43%', expected: '62%', league: null }],
      context: ['Comparar o mesmo recorte.'],
      rounds: ['Ascent R8: observar a cobertura.'],
      actions: [{ label: 'Scrim', text: 'Definam contato e apoio antes da entrada.' }],
      measurement: [{ point: name, today: '43%', target: 'Comparar o mesmo recorte.' }],
    } },
  });
  const pdf = await read(create(model, [concise('Cobertura'), concise('Retake'), concise('Pós-plant')]));
  assertValidStructure(pdf);
  const pageTexts = [...pdf.matchAll(/stream\n([\s\S]*?)endstream/g)]
    .filter((match) => match[1].includes('BT /')).map((match) => extractText(match[1]));
  assert.ok(pageTexts.some((text) => text.includes('FOCO 01 / 03') && text.includes('FOCO 02 / 03')), 'later focuses share remaining space on a page');
  const single = await read(create(model, [concise('Cobertura')]));
  const singleTexts = [...single.matchAll(/stream\n([\s\S]*?)endstream/g)]
    .filter((match) => match[1].includes('BT /')).map((match) => extractText(match[1]));
  assert.ok(singleTexts.some((text) => text.includes('FOCO 01 / 01') && text.includes('Como medir no próximo scrim')), 'monitoring follows the last focus when its complete block fits');
  assert.ok(pageTexts.some((text) => text.includes('PLANO DE TREINO')), 'mixed pages receive a generic running header');
});

test('paginates long titles, paragraphs, rows, and evidence within page bounds', async () => {
  const long = 'Coordenação e preparação para a próxima decisão. '.repeat(65);
  const item = focus();
  item.training.report.title = long;
  item.training.report.evidence = long;
  item.training.report.indicators[0].label = long;
  item.training.report.actions[1].text = long;
  item.training.report.rounds[0].opponent = 'Outro time ' + 'Á'.repeat(380);
  const pdf = await read(create({ ...model, team: 'Equipe ' + long }, [item]));
  const pages = assertValidStructure(pdf);
  assert.ok(pages > 4);
  for (const match of pdf.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
    const x = Number(match[1]), baseline = Number(match[2]);
    assert.ok(x >= 40 && x <= 550, `text x ${x} stays within margins`);
    assert.ok(baseline >= 24 && baseline <= 813, `text baseline ${baseline} stays within the page`);
  }
  const text = extractText(pdf);
  assert.ok(text.includes('Como medir no próximo scrim'), 'monitoring remains present after all long content');
  assert.ok(text.includes('Ponto') && text.includes('Alvo de acompanhamento'));
  assert.ok(text.split('Indicador').length >= 3, 'table heading repeats when an oversized row continues');
});

test('handles absent optional fields and saved older plans without placeholder exercises', async () => {
  const emptyPdf = await read(create({}, []));
  assert.equal(assertValidStructure(emptyPdf), 1);
  assert.ok(extractText(emptyPdf).includes('00'));
  assert.ok(!extractText(emptyPdf).includes('undefined'));
  const older = focus({ training: { title: 'Cobertura em dupla', evidence: [], objective: 'Preparar o contato com cobertura.', watch: 'Comparar o mesmo contexto.' } });
  const text = extractText(await read(create({}, [older])));
  assert.ok(text.includes('Cobertura em dupla'));
  assert.ok(text.includes('43%'));
  assert.ok(text.includes('Rounds para o VOD'));
  assert.ok(!text.includes('undefined'));
});
