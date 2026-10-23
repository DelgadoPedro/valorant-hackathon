# ValoStrat.gg — sala tática, dados em primeiro plano

Esta é a direção visual do dashboard. A identidade nasce de **MISSÃO DE EVOLUÇÃO**:
azul profundo, marfim, coral, tipografia condensada e superfícies retas. A experiência interna
da missão permanece definida em [MISSION_DESIGN_SYSTEM.md](MISSION_DESIGN_SYSTEM.md).

## 1. Fundações compartilhadas

`roundrx/viz/design-system.css` concentra os tokens `--rx-*` em `:root`. O build incorpora
esse arquivo antes de `app.css` e `mission.css`, sem solicitações externas. Os tokens originais
da missão mantêm os mesmos valores; os gráficos D3 continuam lendo os aliases do dashboard.

| Papel | Token / regra |
|---|---|
| Fundo | `--rx-dark`: `#0b141c`; tema escuro independente do sistema |
| Texto | `--rx-ivory`: `#f5f0e8`; secundário `--rx-text-secondary` |
| Ação | `--rx-coral`: `#ff4655`; seleção, botões e detalhes editoriais |
| Resultado | `--good`, `--bad`, `--neutral`; sempre acompanhados por texto ou sinal |
| Referências | `--ref` para liga; `--teamavg` para média do time |
| Superfície | Gradiente, borda e assinatura da missão; fundo estável nas análises |
| Espaço | Base de 4 px; densidade adequada ao conteúdo |
| Movimento | Feedback de 200 ms; entradas breves; respeitar movimento reduzido |

**Archivo** continua incorporada ao HTML. Títulos de abertura e nome do time usam peso forte
e largura condensada. Textos de leitura ficam em caixa normal; números são tabulares.
A escala monumental pertence à apresentação e à identidade do time, mantendo gráficos e
metodologia em escala de leitura. Coral de ação e status negativo têm contextos, rótulos e formas próprios.

A marca mantém o nome ValoStrat.gg e a geometria original do playbook. O SVG usado no cabeçalho
e no favicon aplica coral e marfim. PNGs legados do diretório de marca não são usados pelo site.

## 2. Composição e arquitetura de informação

### Home

A página inicial continua sendo uma apresentação. A abertura assimétrica combina “DO ROUND AO
PRÓXIMO TREINO”, uma explicação curta e o acesso ao Panorama com uma prévia real do time selecionado:
campanha e última partida. Imagens locais ocupam áreas de identidade, com recortes diagonais.
A dimensão da base, os quatro passos de revisão, os oito fundamentos e a orientação “Como ler”
continuam disponíveis abaixo da abertura. O exemplo de leitura é identificado como exemplo.

### Panorama

A ordem de leitura é: identidade e recorte → campanha → prioridades e convite à missão →
fundamentos → pontos fortes → campanha por mapa. Prioridades e missão dividem a composição no
desktop; no celular seguem a ordem do documento. A primeira evidência precisa aparecer sem
rolagem em 1366×768. Quando não há padrões negativos confirmados no recorte, “Pontos de atenção”
não é exibido e o banner da missão ocupa toda a largura. Amostra insuficiente e ausência de
eventos continuam explícitas nas análises e na missão.

### Fundamentos e profundidade

Diagnóstico, observado × esperado, diferença e contexto antecedem as métricas adicionais.
Valores, denominadores, recorrência e condição da evidência ficam próximos. As rotas de padrão,
evidência e round continuam acessíveis por suas ações existentes. Pressão e Início de half
mantêm suas visualizações específicas.

Na Partida, placar, sequência de rounds e estatísticas dos jogadores formam a leitura principal.
Análise, comparações e rounds para revisar continuam disponíveis. Um gráfico nunca recebe uma
imagem decorativa atrás dos dados.

### Navegação

No desktop, a lateral agrupa Home, análise e fundamentos. O seletor de equipe permanece no
cabeçalho; partida e filtros aparecem nos contextos em que se aplicam. Até 900 px, um botão com
a seção atual abre o menu lateral. O menu fecha por ação, fundo ou Esc, mantém o foco dentro
enquanto aberto e devolve o foco ao fechar. A seleção de destino leva o foco ao conteúdo.
Tabelas largas rolam dentro do próprio bloco, sem alargar a página.

## 3. Componentes e leitura dos dados

- Painéis principais compartilham borda fina, traço coral e marca de canto. Divisores e alinhamento
  organizam os conteúdos internos; cada célula não precisa de uma nova superfície.
- A régua preserva ponto observado, traço esperado, escala e texto acessível. O redesign não altera
  denominadores, diferenças em pp, recorrência, significância ou regras estatísticas.
- Status preservam texto e sinal; tracejado continua indicando evidência fraca ou variável.
- Botões, seletores, links, expansões e estados de seleção têm foco visível.
- Explicações extensas continuam em “Saiba mais” e ajuda; mensagens de estado ficam visíveis.
- Valores são apresentados imediatamente. Movimento decorativo não deve atrasar nem encobrir informação.
- A missão conserva briefing, focos, plano, seleção, cenário determinístico, teclado e PDF.

## 4. Contratos de implementação

A aplicação permanece JavaScript + D3 e um único HTML offline. `window.RRX`, as rotas de hash
`t/m/s`, as preferências `rrx-prefs-v4`, os cálculos e os contratos da missão são preservados.
`render()` reconstrói o conteúdo; efeitos e navegação precisam respeitar esse ciclo.
O helper de painéis do dashboard conserva as relações usadas por `collapseNotes()`.

A publicação continua pela pasta `site/` na Vercel. Para reconstrução exclusivamente visual
sem tabelas intermediárias, extrair o JSON `window.RRX` do HTML atual e chamar
`build_html(cfg.output_dir, cfg, payload=payload)`. Comparar o payload gerado ao original.
O comando `python -m roundrx viz` continua destinado a ambientes que possuem as tabelas intermediárias.

## 5. Validação

Conferir 1440 px, 1366×768 e 390 px: hierarquia, contraste, rolagem, textos completos e tabelas.
Percorrer Home, Panorama, Partida, fundamentos, padrão e round, filtros e expansões. Conferir
teclado, foco, menu mobile, movimento reduzido e funcionamento offline. Usar Azure Bears Black
para padrões positivos e negativos e UFMT Turuna para ausência de correções confirmadas.

A missão deve funcionar com zero, um e três focos e com seleção vazia/completa. Prévia e download
continuam usando o mesmo PDF. Rodar `node --test tests/mission*.test.cjs` e comparar os dados
embutidos antes/depois do build.
