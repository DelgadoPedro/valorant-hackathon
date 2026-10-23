# ValoStrat.gg — pipeline de métricas coletivas (VALORANT / UNIVAVÁ)

> Nome do produto: **ValoStrat.gg** (antes RoundRx). O pacote Python, os comandos (`python -m roundrx …`) e os nomes
> de arquivo continuam `roundrx`. Logo em `roundrx/viz/vendor/logo/` (marca em SVG e PNG 512 px, assinatura clara e escura).

Este pipeline transforma os JSONs de partidas fornecidos pelo hackathon em **métricas coletivas observáveis**, seguindo o
dicionário `reference/metrics_dictionary.csv` (180 métricas: as 103 da v1.0, as 60 do complemento v1.1 — composição de
agentes, abertura de half e pressão/Leverage Index — e 17 complementares pedidas pelo time em 21–22/10/2026: DYN-09..13,
OPN-13..15, ECO-13, TRD-13, TRD-14, POS-13, POS-14, RET-11, RET-12, KEY-15 e KEY-16). Ele é reprodutível: mesma base + mesmo
`config.yaml` = mesmas saídas, com impressão digital (hash) das duas em `outputs/run_manifest.json`.

**Situação atual:** 165/165 métricas no escopo coletadas, incluindo as 18 de pressão/Leverage Index (76 validadas de forma independente).
Pressão/Leverage Index (LEV-01..18, classe M) já está implementado com modelo validado por série (ver "Pressão e
Leverage Index" abaixo). As 15 de classe M restantes (probabilidade de vitória dentro do round e AGT-24) ficam para a etapa de modelos.
O progresso detalhado fica em `outputs/coverage/COVERAGE.md` e em `coverage.html` (abre no navegador).

## Diagnóstico de fundamentos (Team Fundamentals Intelligence)

O painel abre no **diagnóstico**: em vez de listar métricas, ele procura situações em que o time troca menos (ou mais)
mortes do que outros times trocam **em situações parecidas**, e leva até os rounds para revisar. Fundamentos
implementados: **Trade kill**, **Preservação de vantagem** e **First blood** (abertura e recuperação depois de sofrer o
FB, como fundamento complementar). Pós-plant/retake vem depois.

| Camada | Módulo | Saída (`outputs/fundamentals/`) |
|---|---|---|
| Eventos com contexto: uma linha por morte por inimigo em jogo, com vivos, fase, spike, economia, distância e nº de aliados por perto (snapshot) e trade em 3/5/7 s | `fundamentals/events.py` | `death_events` |
| Episódios de vantagem: a 1ª vez no round em que o time fica com mais vivos (5v4, 4v3…), com lado, spike, quando começou, economia e os desfechos: converteu (venceu), perdeu a vantagem, tempo até perder, colapso (2 mortes em ≤ 5 s), mortes seguidas sem resposta. Conversão reproduz DYN-01 (+1) | `fundamentals/events.py` | `advantage_episodes` |
| First blood: duas linhas por round com FB (uma por time), com lado, mapa, economia, quando saiu o FB, quem do time disputou o duelo e a função do agente; desfechos: fez o FB (abertura) e venceu o round (recuperação, só quando sofreu). Reproduz OPN-01 e OPN-03. Vencer depois de FAZER o FB é a vantagem 5v4 do bloco anterior | `fundamentals/events.py` | `fb_events` |
| Esperado de cada evento, ajustado sem nenhuma partida do time (nem as linhas do adversário naquelas partidas); M0 (taxa global) × M1 (células com encolhimento) × M2 (logística), escolhido por validação separada por série | `fundamentals/baselines.py` | `baseline_report` |
| Detector: recortes de 1 ou 2 dimensões com observado × esperado, IC por bootstrap de partidas, recorrência e limiar z* calibrado por simulação nula | `fundamentals/patterns.py` | `patterns`, `null_calibration`, `detector_validation` |
| Evidências: mortes sem trade onde outros times mais trocam, com o motivo | `fundamentals/evidence.py` | `evidence` |

Regras que valem para todo número exibido: denominador visível, referência = outros times no mesmo contexto,
linguagem de "padrão observado / situação para revisão" (nunca erro ou causa), critérios em `config.yaml →
fundamentals`. Em dados simulados sem padrão real, o limiar (calibrado separadamente para cada fundamento) faz
~4–5% dos times receberem algum padrão; um déficit plantado de 12 pp é encontrado em 3 de 3 testes em trade, vantagem
e abertura, e em 1 de 3 na recuperação depois do FB (há metade dos eventos, então só diferenças maiores viram padrão). Diferenças "quase significativas" (|z| ≥ 2,5) aparecem em ~40% dos times mesmo sem
padrão real, por isso não são exibidas.

Só a camada de diagnóstico (usa `outputs/` já gerado): `python -m roundrx fundamentals`.

## Como rodar (Windows)

```bat
cd hack\roundrx
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m roundrx run          :: ~2 min: cenário sintético + base completa -> outputs\
python -m pytest -q            :: testes rápidos (não precisam da base)
python -m roundrx fundamentals :: só o diagnóstico de fundamentos + painel
```

O pipeline espera os JSONs em `dados\Dados .Json`, dentro do repositório (configurável em `config.yaml` → `paths.data_dir`;
se a pasta não existir, ele também procura em `..\dados\Dados .Json`, o layout antigo,
ou via `python -m roundrx run --data-dir "C:\...\Dados .Json"`). Requer Python ≥ 3.10.

## Colaboração (GitHub) e publicação (Vercel)

- **Repositório:** código, configuração, dicionário, testes, documentação e os JSONs do hackathon (`dados/Dados .Json`,
  336 partidas, ~194 MB; repositório privado). As saídas pesadas (`outputs/canonical`, `derived`, `metrics`, `fundamentals`,
  `dashboard`, `*.parquet`) são geradas por cada um com `python -m roundrx run`. Ficam versionados só os relatórios
  pequenos de validação (`outputs/quality`, `outputs/coverage`, `outputs/leverage`).
- **Painel na Vercel:** `python -m roundrx run` (ou `python -m roundrx viz`) grava também `site/index.html`, o painel
  completo num arquivo só. A Vercel publica a pasta `site/` sem build (`vercel.json`). Para atualizar o site: gere o
  painel, faça commit de `site/index.html` e dê push. Cada versão do painel tem ~15 MB; evite commits do painel a cada
  pequena mudança para o histórico não crescer demais.
- O painel contém nomes de times e jogadores da base do hackathon. Se o site não deve ser público, ative a proteção de
  acesso do projeto na Vercel (Settings → Deployment Protection).
- Fluxo sugerido: um branch por mudança, pull request, `python -m pytest -q` e `python -m roundrx selftest` passando
  antes do merge.

## Painel interativo por equipe

O botão **Iniciar missão**, no início do Panorama, abre um briefing imersivo de evolução: até três focos do time,
comparação observado × esperado, acesso às evidências e objetivos selecionáveis para o próximo treino. O cenário
ilustrativo tem movimentos de câmera e paralaxe. Ascent, Haven, Lotus ou Sunset é escolhido pelo hash do nome
do time e permanece igual entre sessões, independentemente do filtro de partidas. O fundo não representa
as partidas analisadas; o briefing não exibe minimapa nem nome do cenário.
Os focos priorizam padrões recorrentes abaixo do esperado. Pontos fortes e resultados dentro do esperado não
preenchem vagas: um time pode receber zero objetivos corretivos. Sem padrão confirmado, apenas diferenças negativas
visíveis na precisão do painel entram como investigação; amostras pequenas recebem orientação de observação.
O relatório preserva o recorte escolhido pelo diagnóstico, sem procurar um subgrupo pior para justificar a dica.
A seleção de objetivos é salva
apenas no navegador, por time, recorte e versão da base. O PDF segue o formato de um plano analítico: resumo do time,
indicadores Time × Esperado × Liga, contexto, rounds para VOD, ações de Scrim/VOD/Referências e acompanhamento.
Os números vêm dos eventos elegíveis; comparações descritivas não alteram o recorte nem os até três fundamentos
selecionados. As recomendações distinguem correção, investigação, observação e manutenção de pontos fortes.
A coluna de focos mostra apenas um resumo do mesmo plano, sem expansão de execução.
Prévia e download usam o mesmo PDF e funcionam offline. Setas navegam e Esc fecha; a experiência respeita movimento
reduzido. Interface em `viz/mission.js` e `mission.css`, recortes em `mission-report.js`, recomendações em
`mission-training.js` e documento em `mission-pdf.js`. A janela de trade acompanha a do diagnóstico.
O [design system atômico](docs/MISSION_DESIGN_SYSTEM.md) define os tokens, átomos, moléculas e organismos;
a box original de métricas é reutilizada em todas as etapas pelo componente `panel()`.
Os testes de seleção, recortes, recomendações e PDF podem ser executados com `node --test tests/mission*.test.cjs`
(sem dependências npm).

`python -m roundrx run` também gera **`outputs/dashboard/roundrx_painel.html`**: um único arquivo que abre no navegador e
funciona offline (dados e d3 embutidos). Para regenerar só o painel: `python -m roundrx viz`.

- **Diagnóstico de fundamentos** (tela inicial): padrões por fundamento → página do padrão (onde aparece mais,
  partida a partida, rounds para revisar) → reconstrução do round (posições no instante da morte e linha do tempo).
- **Mapas oficiais**: os mapas do painel usam as imagens oficiais (displayIcon de valorant-api.com, uso autorizado pela
  organização do hackathon) e a transformação oficial de coordenadas, com os nomes oficiais das regiões. Os PNGs e os
  parâmetros ficam em `roundrx/viz/vendor/maps/` e são embutidos no HTML (o painel continua funcionando offline).
- **Home** (tela de abertura e 1º item da barra lateral, que segue Home · Analisar resultados: Panorama e Partida · Explorar métricas): o que é o RoundRx, botões para o Panorama do time
  e a última partida, a base (partidas, rounds, times, período), "Depois de cada partida" (4 passos para o próprio time: o que pede atenção, onde acontece, revisar no VOD,
  treinar e acompanhar; sem passo de escolher equipe), os 8 fundamentos com uma frase sobre por que começar por eles (só nome e
  ícone; cada um abre a seção) e "Como ler" com a régua e os rótulos de verdade do painel.
- **Panorama** (o panorama do time): estado do time (mapas, vitórias, rounds, período); um cartão por mapa com a tela de
  carregamento, a campanha (V–D), o saldo, os rounds e o histórico naquele mapa (quadrados V/D, mais recente à esquerda,
  cada um abre a partida); "Pontos de atenção" (padrões abaixo do
  esperado, com denominador e recorrência) e "Pontos fortes", que só aparecem quando há algum padrão naquela direção;
  e o quadro dos fundamentos (cada um com um "i" que explica o fundamento e lista as métricas da seção, e "Ver análise detalhada"). Design system e arquitetura de informação em `docs/DESIGN.md`
  (fonte Archivo e ícones lucide embutidos; o painel não depende de internet).
- **Análise** (22/10/2026, substitui a antiga categoria "Fundamentos"): nas seções Trade kill, Vantagem e First blood,
  antes da lista de métricas, um bloco com observado × esperado (outros times nas mesmas situações), a leitura
  (padrão recorrente ou dentro do esperado), até 4 padrões recorrentes e "Onde aparece mais" (o mesmo indicador quebrado
  por distância ao aliado, lado, momento, nº de jogadores, mapa, jogador, economia…). Filtros: partidas e janela de trade.
- **Fundamentos de round** (22/10/2026, `fundamentals/rounds.py`): **Pós-plant**, **Retake**, **Rounds-chave** e
  **Início de half** passaram a ter a mesma análise dos demais (esperado leave-one-team-out com validação por série,
  padrões recorrentes com limiar calibrado por simulação nula, evidências), aparecem na Panorama e no bloco "Análise"
  das seções. Uma linha por time-round, desfecho = venceu o round:
  - pós-plant (o time plantou) e retake (o adversário plantou): contexto = vivos no plant, site, momento do plant,
    economia e mapa (regressão logística escolhida; erro de calibração 1,9 e 1,7 pp). Site nunca aparece somado entre
    mapas (22/10/2026): o detector usa o recorte "mapa e site" (`map_site`, ex. "Retakes no A de Haven"), e no painel
    a quebra "Site (por mapa)" e o recorte "Site" de POS-01/RET-01 pedem um mapa antes. O déficit plantado do teste
    do detector passou de "site A" para "plant entre 30 e 60 s" (detectado em 2 de 3 times, nos dois fundamentos);
  - rounds-chave: pistol, eco, anti-eco, force buy e armado (mesma regra das métricas KEY), contexto = tipo, lado,
    economia e mapa (células encolhidas);
  - início de half: rounds 2 e 3 de cada half pelo caminho até ali (2–0, 1–1, 0–2…), contexto = momento e economia
    (lado e mapa pioravam a calibração com ~2,6 mil eventos).
  - pressão: os rounds decisivos (25% da base com maior índice de pressão), contexto = placar (na frente, empatado,
    atrás), fase do half, economia, lado e mapa (regressão logística; erro de calibração 0,8 pp). Na base atual só 1
    time tem padrão recorrente, coerente com a revisão crítica (vencer mais "sob pressão" quase não se repete).
  Na simulação nula, 2–5% dos times recebem algum padrão por acaso. O teste de déficit plantado (−12 pp) é achado em
  3 de 3 times no pós-plant e em 1 de 3 no retake, rounds-chave e início de half (amostras menores por time): nessas
  três, um padrão é sinal forte, mas a ausência de padrão não garante que não haja problema.
- **Leitura de cada fundamento** (Panorama e Análise), pela diferença observado − esperado arredondada: 0 pp =
  "Dentro do esperado"; 1 a 3 pp = "Acima/Abaixo do esperado" (contorno); 4 pp ou mais = "Muito acima/abaixo"
  (preenchido = "sinal forte, diferença consistente"). Quando o intervalo de 90% da diferença cruza o zero, o rótulo
  fica tracejado ("sinal fraco ou variado"); o painel não mostra o intervalo em si. "Padrão recorrente" continua sendo o critério mais forte (limiar calibrado + recorrência entre partidas).
- **Janela de trade**: fixa em 4 s (`timing.trade_window_s`) nas métricas e no diagnóstico
  (`fundamentals.default_window_s`); a Análise de Trade kill abre em 4 s e deixa trocar para 3, 5, 6 ou 7 s
  (`fundamentals.trade_windows_s`). Os padrões recorrentes sempre usam 4 s.
- **TRD-10 (trade gap contextual)**: chegou a ser implementada (observado − esperado por morte com aliado vivo, mesmo
  modelo do fundamento Trade kill) e foi retirada em 22/10/2026 por decisão do time: a leitura no painel ficou confusa
  e repetia o que a Análise de Trade kill já mostra. Volta a constar como "adiada" na cobertura.
- **Diferença observado − esperado** (Análise e páginas de padrão): verde quando o time está melhor que o esperado e
  vermelho quando está pior.
- **Rounds para revisar** (3ª subseção da Partida, depois de "Análise"; duas colunas, "Mais custaram" e "Mais
  ganharam", 5 rounds cada, sem os motivos na lista: eles aparecem ao abrir o round): os 6 rounds que mais custaram (ou mais ganharam)
  chance de vencer o mapa, cada um com os motivos tirados dos dados (vantagem perdida ou virada, first blood sofrido e se
  foi trocado, mortes sem trade com aliado perto, plant e retake, tipo de compra, pressão do round). Clicar abre o
  round: mapa com as mortes e a linha do tempo (a mesma tela abre pela faixa de rounds da Partida e pelos padrões).
- **Explorar métricas** em 6 categorias definidas pelo time (cada métrica aparece em uma seção só; a lista está em
  `viz/build.py → SECTIONS`):
  1. **Vantagem** (DYN-09, 10, 03, 11 e ECO-13, vitória por vantagem de armamento) e **First blood** (todas com o recorte "Tipo de round": pistol × demais; OPN-01..04, 07, 10,
     12..15), cada uma uma categoria com uma seção só. Outras métricas desses temas seguem calculadas nas tabelas de
     saída; a lista das que ficaram fora do painel está em `viz/build.py`;
  2. **Trade kill**: uma seção só, com trades e cobertura (TRD-01, 08, 13, 14; TRD-04, 06, 12, SPC-08 e 10 como recortes);
  3. **Pós-plant** (POS-01, 03, 04, 07, POS-13, tempo até o 1º contato, e POS-14, plant em inferioridade; POS-02, 05, 06 como recortes). "Vitória após o plant" tem a aba "Por site": em que
     site o time planta, vitória por explosão e por eliminação, derrota por defuse (com a liga no mesmo mapa) e o mapa dos
     plants por desfecho, filtrável por site; 4. **Retake** (RET-01, 04..07, 10, RET-11, saldo de vivos no fim do retake, e RET-12, retake abandonado, total ou parcial; RET-02, 03 como recortes);
  5. **Rounds-chave** (KEY-01 pistol, KEY-15 eco, KEY-06 anti-eco, KEY-09 force, KEY-16 armados, cada uma com a aba
     "Onde ganha": vitória por site do plant ou "sem plant", por lado, com a liga e o mapa dos plants);
     clutches, flawless, bonus e thrifty saíram do painel (já aparecem no jogo e nos trackers); **Início de half** (página
     própria, sem métricas HAL; 22/10/2026): a unidade é a abertura de cada half (rounds 1–3 e 13–15) e a página mostra
     (a) os momentos da abertura — pistol, round 2 depois de vencer o pistol (anti-eco), round 3 depois de 2–0, round 2
     depois de perder o pistol, 1º round armado depois de 0–2 e round 3 depois de 1–1 — com "x de n", a liga no mesmo
     recorte e quanto vencer cada round pesa nos mapas ganhos da liga; (b) a árvore dos 8 caminhos (V/D) com a % a partir do
     round anterior, a % de mapas ganhos e de rounds do half vencidos depois de cada caminho; (c) a grade mapa × lado com a
     sequência de cada half, clicável. Filtros: lado (topo), mapa e partidas (todas/últimas 10). As métricas HAL-01..18
     seguem nas tabelas de saída;
  6. **Pressão** (página própria, sem lista de métricas; antes "Pressão e Leverage Index"): abre com "O que é a pressão de
     um round" (explicação curta e exemplos do modelo por placar) e a Análise do fundamento Pressão; depois:
     - "Onde o time ganha e perde mapas": por situação (pistol, eco, anti-eco, force, depois de first blood a favor/sofrido,
       com vantagem/desvantagem numérica, pós-plant e retake), rounds, saldo do time e da liga e a diferença, em mapas a
       cada 10, agrupados em "perde mais mapas que a liga: o que treinar" e "ganha mais". Comparação com a liga **no mesmo
       mapa ou em todos os mapas**, à escolha. A força do sinal (forte ou fraco/variado) e a recorrência
       ficam na dica de cada linha (linhas com poucos casos não ficam mais apagadas: o nº de casos já está na tabela);
     - "Fechar e reagir": mapas entregues (a chance de vencer o mapa chegou a 80% e o time perdeu; liga ≈ 13%), viradas
       (esteve com 20% ou menos e venceu) — os cartões de rounds decisivos na frente e atrás saíram em 22/10/2026 por
       não serem claros; lista dos mapas entregues e virados com o pico/mínimo e o round que mais mudou o mapa depois dele;
     - "Curva do mapa" (os rounds que mais mudaram o mapa ficam na seção "Rounds para revisar").
     As 14 métricas LEV que estavam na lista saíram do painel (médias de pressão não são estáveis por time; as
     ponderadas repetem a taxa de vitória, correlação 0,92–0,96) e seguem nas tabelas de saída;
  Dano e consistência (DYN-06..08), espaçamento, gestão econômica e composição de agentes saíram do painel, mas seguem
  calculados nas tabelas de saída. A seção "Outros" / "A implementar" saiu do painel (22/10/2026); as métricas que
  faltam (classe M adiadas, como WPR e AGT-24) seguem listadas em `outputs/coverage`.
  Em telas estreitas, a barra vira uma faixa horizontal no topo.
- **Nomes das métricas padronizados** (22/10/2026) nas seções Vantagem, First blood, Trade kill, Pós-plant, Retake e
  Rounds-chave: taxas de vitória começam com "Vitória…" (com vantagem numérica, após o plant, no pistol, em eco…), tempos
  com "Tempo até…" ou "Duração…", saldos com "Saldo de vivos…", first blood sempre "a favor" ou "sofrido", e "numérica"
  sempre explícito. A pergunta abaixo do nome segue o mesmo molde ("Quando…, o time…?").
- **Abas novas**: "Situações" (DYN-09/10: com que frequência o time chega a 5v4, 4v3… e quanto vence em cada uma) e
  "Mapas vencidos × perdidos" (a mesma métrica nos mapas que o time venceu e nos que perdeu, time e liga; descritivo,
  não causal). Mortes isoladas por jogador: aba "Por jogador" de TRD-07/TRD-14.
- **Equipe e partida** no topo (setas para navegar). O endereço guarda equipe, partida e aba (`#t=...&m=...&s=...`).
- **Filtros globais** (lembrados entre aberturas):
  - **Lado**: todos, só ataque ou só defesa;
  - **Comparar com**: média do time (todas as partidas da equipe) e liga (todas as equipes), cada uma liga e desliga;
  - **só no mapa desta partida**: as duas médias passam a considerar só esse mapa.
- **Cada seção é uma lista limpa de métricas**: nome em linguagem de coach, a pergunta que ela responde, o valor da
  partida **com os números absolutos** ("78% · 7 de 9 plants") e as referências ligadas com a variação colorida.
  As 4–5 principais vêm primeiro; as demais ficam em "Mais N métricas desta lente".
- **Clique numa métrica para expandir** as visualizações em abas. A primeira aba é a que mais ajuda naquela métrica, e o
  formato depende do tipo de dado (nem tudo é gráfico de barras):
  - **Evolução**: um ponto por partida (tamanho = nº de eventos), com as linhas da média do time e da liga;
  - **Recortes**, uma dimensão por vez: categorias sem ordem (lado, mapa, site, fase, situação de clutch) viram
    **tabela** com "% · x/N" e uma faixa que posiciona partida, time e liga; escalas ordenadas (saldo de vivos no plant,
    distância ao aliado, economia relativa) viram **linha**;
  - **tabelas por jogador**: quem faz e quem sofre o first blood (barra divergente), quem troca quem;
  - **lista de pistols** partida a partida (pistol → 2 → 3 e 13 → 14 → 15, com V/D);
  - **distribuições de tempo**: momento do first blood, tempo até o trade, momento do plant (convertido × perdido);
  - **mapas** de mortes e plants, **matriz de compras**, **curva de saldo numérico** e economia round a round;
  - **Como é calculada**: regra, parâmetros e status de validação.
- Métricas que são só recortes de outra (ex.: POS-05/06 = saldo no plant) não aparecem na lista: viram "Recortes" da métrica-mãe.
- **Aba Composição**: agentes desta partida (com jogador e função) contra os do adversário, o que mudou desde o mapa
  anterior, funções por mapa, métricas de variação de picks e uma tabela de composições da equipe (resultados, por
  economia e sites de plant), além de duplas/trios, trade por dupla, first blood com assistência e "quem faz o quê".
- **Aba Início de half**: pistol → round 2 → round 3 de cada half por partida, mais as métricas HAL. "Os momentos da abertura"
  é uma tabela ordenada pelo que mais custou mapas: taxa do time e da liga, diferença, peso no mapa (quanto vencer o round
  muda a chance de vencer o mapa, na liga) e mapas vs. liga ≈ diferença × casos × peso; o pior momento ganha o selo "prioridade". A árvore "Caminhos da
  abertura" tem filtro próprio de lado do half e mapa (o mesmo filtro da página, repetido junto da árvore).
- **Vantagem**: botão "O que é vantagem?" ao lado do título (como em Pressão) abre a explicação de vantagem numérica,
  conversão, virada, duração e esperado, com a taxa de conversão da liga por situação (5v4, 4v3, 3v2, 2v1).
- **Descrições e nomes (22/10/2026)**: as explicações de cada tabela e gráfico ficam numa caixa fechada "Saiba mais"
  (ícone de lupa); nomes de métricas, recortes e abas foram revistos para quem não conhece a ferramenta (ex.: "Mortes
  sem trade e sem aliado por perto", "Retakes com defuse", recortes "Por situação" e "Por mapa e site").
- **Partida**: no topo, a linha de partidas para escolher (mais recente à esquerda; só o que cabe na largura, seta "+N"
  abre o resto). Três subseções:
  - **Visão geral**: cabeçalho da partida e o bloco **Placar**: round a round e, abaixo, o placar por jogador dos dois
    times (retrato do agente, ACS, K / D / A, +/−, KAST, ADR, HS%, FK, FD, +/− de FK−FD), com filtro Todos / Ataque /
    Defesa (o round a round apaga os rounds do outro lado). No total, K/D/A, ACS e ADR batem com os oficiais do JSON;
    por lado, vêm dos rounds daquele lado (kills em adversários, mortes menos a da spike, assistências; a soma dos lados
    bate com o oficial em 100% / 99,9% / 99,8% dos jogadores). HS% pelos acertos em adversários; FK/FD = 1ª kill em jogo
    do round; KAST com trade na janela de `timing.trade_window_s` (`viz/build.py::_scoreboard`; Σ FK = Σ FD em todas
    as partidas). As tabelas ficam centralizadas no bloco. O cabeçalho da partida mostra só o placar (à esquerda) e os times (à direita); fica verde na vitória e vermelho carmim (`--loss`) na derrota.
    Retratos: `displayIconSmall` de valorant-api.com, 64×64 WebP em `roundrx/viz/vendor/agents/`;
  - **Análise**: filtro de lado e comparação, 6 indicadores (com números absolutos) e "o que mudou nesta partida" (taxas
    com |z| ≥ 1,5 em relação à média do time);
  - **Rounds para revisar** (ver acima).
- Toda média é Σnum ÷ Σden do recorte escolhido, a mesma regra do pipeline.

## O que acontece numa execução

| Etapa | Módulo | Saída |
|---|---|---|
| 0. Cenário sintético: partida de 3 rounds com resultados calculados à mão; o pipeline precisa reproduzi-los | `validation.py` | `quality/synthetic_scenario.csv` |
| 1. Ingestão: inventário (hash por arquivo) e JSON achatado em tabelas | `ingest.py` | `canonical/*.parquet` |
| 2. Qualidade: 18 testes estruturais da base | `quality.py` | `quality/quality_report.csv`, `quality/team_rosters.csv` |
| 3. Estados: linha do tempo de vivos (com revives), trades e economia por time-round | `states.py` | `derived/*.parquet` |
| 4. Métricas: uma função por ID do dicionário | `metrics/*.py` | `metrics/metrics_round.parquet` |
| 4b. Pressão: chance de vencer o mapa, LI e esperado do round (validação por série) | `leverage.py` | `derived/leverage.parquet`, `leverage/model_report.csv` |
| 5. Agregação por time, partida, mapa×lado e liga | `aggregate.py` | `metrics/metrics_*.parquet/.csv` |
| 6. Validação: sanidade, checagens cruzadas com campos oficiais e cobertura | `validation.py`, `coverage.py` | `quality/crosschecks.csv`, `coverage/*` |
| 7. Painel interativo | `viz/` | `dashboard/roundrx_painel.html` |

## Tabelas de saída

**Canônicas** (`outputs/canonical/`; chaves `match_id`, `round_num` 0-based, `puuid`, `team_id` = Red/Blue na partida):
`manifest`, `matches`, `teams`, `players`, `rounds`, `round_players` (economia/dano), `kills`,
`kill_positions` (snapshot dos vivos em cada kill), `objective_positions` (snapshots de plant/defuse) e `damage`.

**Derivadas** (`outputs/derived/`):
- `round_events`: vivos por time após cada evento;
- `trades`: cada morte, se foi trocada, por quem e em quanto tempo;
- `team_rounds`: uma linha por time-round com lado, resultado, economia, tipo de compra, force/bonus e sequências.

**Métricas** (`outputs/metrics/`). Todas usam o mesmo formato longo:

| coluna | significado |
|---|---|
| `metric_id` | ID do dicionário (ex.: `TRD-01`) |
| `stratum` | recorte da métrica (ex.: `+2` em POS-05, `A` em POS-02, `abertura` em TRD-12); vazio = sem recorte |
| `num`, `den` | numerador e denominador **somáveis** |
| `value` | `num/den` (taxas e médias) ou `num` (contagens; ver `agg`) |
| `n_rows`, `n_matches` | tamanho da amostra (use para esconder recortes pequenos na visualização) |

As tabelas variam pelo grão: `metrics_round` (time-round), `metrics_team_match`, `metrics_team`,
`metrics_team_map_side`, `metrics_league` e `metrics_league_map_side` (referência da liga).
`metrics_catalog.csv` junta o dicionário à regra efetivamente implementada, à unidade, ao tipo de agregação e aos
parâmetros usados. É o contrato com a etapa de visualização.

## Decisões de modelagem (afetam a leitura)

- **Identidade do time** = nome no arquivo (`..._timeA_9_x_13_timeB_mapa.json`), casado com Red/Blue pelo placar (336/336 conferem).
  Os elencos variam entre partidas. Confiram `quality/team_rosters.csv`, que mostra núcleo, reservas e jogadores que
  também jogaram por outro time.
- **Mapa**: o nome vem do arquivo e foi validado contra o codinome do JSON (Jam = Lotus, Triad = Haven, Bonsai = Split,
  Juliett = Sunset, Infinity = Abyss, Plummet = Summit, Foxtrot = Breeze, Pitt = Pearl, Canyon = Fracture).
- **Lado** de cada time em cada round vem direto de `winningTeam` + `winningTeamRole`; o padrão de troca foi checado em
  6618/6618 rounds.
- **Observadores** (22 partidas) são excluídos.
- **Kills fora de jogo** ficam fora das métricas táticas: morte pela spike e kills depois do defuse ou da detonação
  (fim do round = defuse, ou plant + 45 s).
- **Revives** são inferidos quando um jogador morto reaparece no snapshot ou morre de novo (107 casos).
- **Trade**: aliado da vítima mata o killer em ≤ 4 s.
- **Tipos de compra** usam as faixas do vlr.gg sobre Σ loadout do time: eco < 10k, half 10–18k, full ≥ 18k.
  Rounds 1 e 13 = pistol.
- **Distâncias** em unidades do Unreal (1 = 1 cm). Os snapshots são instantâneos: proximidade ≠ visão ou cobertura
  efetiva (todas as SPC/P são proxies).

## Composição de agentes e início de half (dicionário v1.1)

- **Catálogo de agentes** (`reference/agents_catalog.csv`): characterId → nome e função (duelista, iniciador,
  controlador, sentinela), copiado de valorant-api.com em 21/10/2026, com a fonte e a data em cada linha.
  É uma tabela estática, sem estatísticas de partidas. Cobre os 28 agentes que aparecem na base. Ao surgir agente novo,
  acrescente uma linha (a checagem "funções somam 5" acusa o que faltar).
- **Composição** = os 5 agentes do time no mapa (sem observadores). Métricas de nível mapa (AGT-01..10) não respondem
  ao filtro de lado. As que cruzam composição com eventos (AGT-11..19) usam o estrato = composição e as mesmas regras
  de TRD-01, POS-01, RET-01 e OPN-02. A soma por composição bate com essas métricas em todos os time-rounds.
- **Início de half**: rounds 1–3 e 13–15 (índices 0–2 e 12–14), sem prorrogação. Half que termina antes do round 2/3
  é N/A, nunca derrota. Métricas de half ficam na linha do pistol, então o lado é o do half.
- **HAL-18** é a diferença entre halves (2º − 1º). No agregado por time aparece como estrato `2º − 1º`.
- **Pressão e Leverage Index (LEV-01..18)**, em `roundrx/leverage.py` e `metrics/leverage.py`:
  - **Chance de vencer o mapa** antes de cada round: cadeia de Markov do placar com a taxa de vitória do ataque em cada
    mapa na liga (encolhida para a taxa global, `leverage.shrink_m`), 13 vence e prorrogação até abrir 2. Supõe dois
    times médios no resto do mapa; usa só placar, lado e rodada.
  - **W+ / W−** = chance de vencer o mapa se vencer / se perder o round; **L = W+ − W−**; **LI = L ÷ média da liga**
    (LI 1 = round típico). A referência e os limites dos quartis ficam em `outputs/leverage/model_report.csv`.
  - **Esperado do round (p_pre)**: regressão logística com lado, mapa, pistol e economia do round, estimada fora da
    amostra (GroupKFold por série, `leverage.folds`). Entra em LEV-09 (vitórias acima do esperado, ponderadas) e em
    LEV-10 (WPA = chance depois do round − W_pre, com W_pre = p_pre·W+ + (1 − p_pre)·W−).
  - **Validação** (séries fora do treino): log-loss, Brier e erro de calibração da chance de vencer o mapa contra o
    modelo só de placar e contra 50% fixo; e de p_pre contra "só lado e mapa". Em `outputs/leverage/model_report.csv`
    e no botão (?) da seção.
  - **Checagens**: W+ do time + W− do adversário = 1; 0 ≤ W− ≤ W+ ≤ 1; LI igual para os dois times; LI médio = 1;
    W+ = 1 no round final do vencedor; o modelo bate com uma implementação independente (testes e cenário sintético).
  - Métricas ponderadas (LEV-08, 09, 12..15) guardam também o mesmo recorte sem peso (estrato `bruto`), e o painel
    mostra a taxa sem peso e o número real de rounds ao lado do valor ponderado.
  - Revisão crítica (22/10/2026), dividindo as partidas de cada time em duas metades (44 times com 6+ mapas): pressão
    média, nas vitórias, nas derrotas e por fase têm estabilidade ≈ 0 (descrevem jogos apertados, não o time); vitória
    ponderada, saldo de abates ponderado e WPA médio repetem a taxa de vitória (correlação 0,92–0,96). Por isso o painel
    usa a pressão para **priorizar** (rounds e situações que mais mudam o mapa: o quartil de maior pressão concentra 45%
    de toda a variação de chance de mapa da liga) e não para dar nota ao time. A estabilidade do sinal "sob pressão" é
    recalculada a cada execução (`estab_pressao` no relatório do modelo).
  - Nas páginas de Fundamentos, os "rounds para revisar" de cada padrão vêm ordenados pelo peso do round no mapa (LI),
    com a opção de voltar à ordem do detector.
  - Leitura: LI mede o peso do round para o mapa, não o que aconteceu nele; vencer pouco em rounds de pressão alta é
    um ponto para revisar, não prova de que o time "sente a pressão".
- **AGT-24** depende de modelo (classe M): fica como adiada em `outputs/coverage`, junto com a probabilidade de vitória dentro do round.

## Parâmetros que precisam de revisão de um jogador/coach

Todos estão em `config.yaml`. As métricas afetadas aparecem com "revisão humana pendente" na cobertura.

| Parâmetro | Valor | Referência |
|---|---|---|
| `timing.trade_window_s` | 4 s | decidido pelo time (dicionário: ≤5 s; KAST da comunidade: 3–4 s) ✔ |
| `spatial.near_radius` | 1500 cm (15 m) | escolha inicial; testar 1000–2000 |
| `economy.team_eco_max` / `team_full_min` | 10 000 / 18 000 | faixas da aba Economy do vlr.gg |
| `economy.big_gap` | 8000 | ≈ largura de uma faixa econômica |
| `economy.force_*` | ≥3 jogadores sem 3900 créditos | rifle 2900 + escudo pesado 1000 |
| `economy.bonus_spent_max` | 6000 | calibrado na base (gasto mediano ≈ 5500 no 3º round após vencer o pistol) |
| `timing.collapse_window_s`, `chain_window_s`, `opening_kills` | 5 s, 3 s, 3 | escolhas iniciais |
| `composition.loadout_ratio_bands` | 0,67 / 1,5 | AGT-18: Σloadout time ÷ adversário (inferior / equilibrada / superior) |
| `halves.superior_ratio` | 1,5 | HAL-07: "anti-eco" = entrar no round 2 com ≥ 1,5× o equipamento do adversário |
| `halves.log_gap_c` | 1000 | HAL-13: constante do log da razão de equipamento |

## Como adicionar ou alterar uma métrica

1. Escreva uma função em `roundrx/metrics/<lente>.py` decorada com
   `@metric("ID", agg, unidade, definição, params=(...))` que devolva `emit(df, "ID", num, den, stratum)`.
2. Se houver resultado conhecido, acrescente-o em `EXPECTED` (`validation.py`) ou crie uma checagem cruzada.
3. Rode `python -m roundrx run`. A cobertura se atualiza sozinha a partir do dicionário.

## Limitações conhecidas

- Não há dados de habilidade por round (`ability.*Effects` vem nulo); só existe a contagem por partida.
- Não há trajetórias: as posições existem apenas nos instantes de kill, plant e defuse.
- `SPC-08` usa um grid de 15 m em vez de callouts, porque o JSON não traz regiões do mapa.
- O fim do round por timer ou eliminação não tem timestamp próprio. DYN-03 e OPN-09 tratam os casos sem fim
  observado como censurados.
- Force e bonus são heurísticas (classe P); não são rótulos oficiais.
