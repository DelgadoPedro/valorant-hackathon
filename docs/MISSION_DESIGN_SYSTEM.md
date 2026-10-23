# RoundRx Tactical — design system atômico

Referência visual: a box original de métricas da missão. O gradiente azul-escuro translúcido,
a borda fina, o traço coral no canto superior esquerdo e a marca `+` no canto inferior direito
formam uma única superfície reutilizável. O cenário continua visível, com desfoque atrás do conteúdo.

O sistema está implementado em `roundrx/viz/mission.css` e `mission.js`. A missão é a primeira
aplicação; a migração do restante do painel pode ser gradual. As regras anteriores do dashboard
continuam documentadas em [DESIGN.md](DESIGN.md).

## 1. Fundações e tokens

Tokens ficam no escopo `.rx-mission` e `.rx-launch`, evitando mudanças involuntárias no dashboard.

| Família | Tokens implementados | Regra |
|---|---|---|
| Cor | `--rx-coral`, `--rx-ivory`, `--rx-dark`, `--rx-rule` | Coral indica ação ou destaque; o texto sempre explica o significado. |
| Texto | `--rx-text-primary`, `--rx-text-secondary`, `--rx-text-label`, `--rx-text-accent` | Hierarquia consistente em todos os painéis. |
| Espaço | `--rx-space-1/2/3/4/5/6/8` | 4, 8, 12, 16, 20, 24 e 32 px. |
| Tipografia | `--rx-type-label/small/body/title` | 11, 12, 14 e 15 px; Archivo. Títulos cinematográficos usam escala própria. |
| Superfície | `--rx-surface-panel`, `--rx-border-panel`, `--rx-blur-panel`, `--rx-shadow-panel` | Os valores da box original de métricas são a referência única. |
| Densidade | `--rx-panel-padding`, `--rx-panel-accent-width` | Permitem variar espaço e tamanho do detalhe, preservando a superfície. |
| Movimento | `--rx-duration-feedback` | Feedback de 200 ms; o passeio de câmera tem duração própria e respeita movimento reduzido. |

Não aplicar opacidade ao painel inteiro: isso também apaga o texto. A transparência pertence
somente ao fundo. Quando a leitura precisar melhorar, ajustar os tokens compartilhados ou a
tipografia, em vez de criar uma nova box para uma etapa.

## 2. Átomos

| Átomo | Implementação | Responsabilidade |
|---|---|---|
| Texto | `.rx-objective-text`, `.rx-metric-label`, `.rx-intel-note` | Texto primário, descrição e nota, com hierarquia explícita. |
| Botão | `button()`; `.rx-cta`, `.rx-prev`, `.rx-close` | Semântica nativa, foco visível, ação e estado desabilitado. |
| Número | `.rx-objective-num`, `.rx-gap`, `.rx-gap-unit` | Identificador de objetivo ou medida com unidade. |
| Tag | `.rx-tag` | Situação do dado, fundamento ou recorte. |
| Indicador | `.rx-bar-fill`, `.rx-map-marker` | Valor comparado ou posição na rota ilustrativa. |
| Divisor | `--rx-rule` | Separação discreta, sem criar outra superfície. |

## 3. Moléculas

### SurfacePanel — `panel(tag, classes, ...children)`

Gera `.rx-panel`: a mesma box original para qualquer conteúdo. A classe base é a única dona
do fundo, borda, desfoque, sombra e detalhes nos cantos.

```js
panel("section", "rx-intel", ...conteudoDasMetricas);
panel("aside", "rx-aside rx-panel--stack", ...conteudoDoPercurso);
panel("aside", "rx-aside rx-panel--stack", ...conteudoDoPlano);
panel("div", "rx-plan-card rx-panel--compact", ...resumoDoObjetivo);
```

Variantes permitidas:

- **Padrão:** conteúdo de análise; espaçamento de 24 px.
- **Stack:** lista vertical sem espaçamento adicional entre filhos; mesma superfície.
- **Compact:** resumo de objetivo; espaçamento e traço menores; mesma superfície.

Classes de conteúdo como `.rx-intel` e `.rx-plan-card` organizam o conteúdo. Não redefinem
fundo, borda, sombra ou transparência. Ajustes de notebook e mobile controlam densidade.

### PanelHeader — `panelLabel(title, meta)`

Rótulo à esquerda e metadado opcional à direita. Usado para a condição dos focos,
a condição da evidência e a contagem dos objetivos selecionados. A tipografia e as cores são compartilhadas.

### ObjectiveRow — `objective(focus, index, toggle)`

Indicador + título + ação. A mesma linha navega para um foco no briefing ou
seleciona um objetivo no plano. O modo de seleção usa `aria-pressed`; o estado é descrito
em texto e por marca, além da cor.

### ComparisonBars — `.rx-bars`

Rótulo + valor + barra. “Seu time” e “Esperado” mantêm cores distintas e valores explícitos.
Diferença, denominador e quantidade de partidas acompanham a comparação.

## 4. Organismos

| Organismo | Composição |
|---|---|
| Briefing | Título curto + contexto em uma linha + SurfacePanel com minimapa e ObjectiveRows. |
| Evidência | Orientação prática + SurfacePanel com condição, diferença, ComparisonBars e detalhes expansíveis. |
| Plano | SurfacePanel + PanelHeader + ObjectiveRows selecionáveis + prévia e download em PDF + nota. |
| Resumo de treino | SurfacePanel compacto + ícone + nome + exercício contextualizado + duração e etapas. |
| Ficha de treino | Expansão dentro da orientação prática com preparação, funções, etapas e critérios de execução. |
| Prévia do PDF | Modal próprio com documento real, abertura em nova aba e download do mesmo arquivo. |

O conteúdo varia; a box e as moléculas permanecem as mesmas.

## 5. Template e páginas

**MissionShell** reúne cenário em paralaxe, cabeçalho, navegação de etapas, área de conteúdo
e controles fixos. `intro()`, `focusChapter()` e `plan()` preenchem esse template com os dados
do time e do recorte. Nenhuma etapa define um novo estilo de superfície.

### Hierarquia e divulgação progressiva

- Cada etapa tem um título de até 72 px no desktop, uma orientação curta e uma ação principal no rodapé.
- Nas etapas de foco, o título nomeia a habilidade a treinar, em vez de usar um slogan. O exercício sugerido
  aparece em `.rx-training-goal`, com texto maior e traço coral lateral, sem adicionar uma nova box.
  A mesma habilidade identifica os objetivos no briefing e no plano; a métrica funciona como evidência de apoio.
- O cabeçalho mantém marca, time, contador e fechamento. Segmentos pequenos substituem nomes repetidos de etapas;
  cada segmento mantém nome acessível, tooltip e estado atual. Setas e Esc continuam funcionando sem uma legenda fixa.
- O briefing usa uma linha de contexto, em vez de tags separadas, e informa a condição dos focos uma única vez.
  O minimapa é decorativo, identificado como cenário ilustrativo na descrição acessível, sem coordenadas.
- Evidências e detalhes são ações secundárias. `.rx-secondary` preserva foco visível e usa texto com sublinhado discreto.
- `.rx-details` usa `details`/`summary` nativos para “Como interpretar”, fechado inicialmente.
  Metodologia e recorrência ficam nessa expansão; condição, valores, denominador e partidas continuam visíveis.
- Seleção de treino usa marca e `aria-pressed`, sem repetir uma instrução sob cada objetivo.
- A expansão “Como executar” fica apenas na área do treino. A escolha dos focos, os painéis de métricas,
  o briefing e a navegação permanecem iguais. A duração se refere à sessão sugerida, não ao briefing.
- O PDF usa A4 com fundo branco, títulos azul-escuro e detalhes em coral, capa com visão da sessão,
  fichas com instruções, rounds reais de referência e espaço para anotações. Prévia e download usam
  o mesmo documento gerado no navegador; uma nova seleção invalida a versão anterior.
- Esc fecha primeiro a prévia e devolve o foco à ação que a abriu; outro Esc fecha a missão.

## 6. Regras de evolução

1. Procurar um átomo ou uma molécula existente antes de criar um componente.
2. Reutilizar `panel()` para novas boxes táticas; não copiar suas declarações CSS.
3. Criar variante apenas para uma diferença real de composição ou densidade.
4. Preservar contraste, foco, estados de seleção, navegação por teclado e movimento reduzido.
5. Conferir desktop de 1366×768 e mobile; permitir rolagem interna quando necessária.
6. Manter padrões confirmados, explorações e amostras insuficientes claramente distintos.

