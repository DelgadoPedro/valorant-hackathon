# RoundRx — design system e arquitetura de informação

Versão 1 (21/10/2026); paleta revista em 22/10/2026 (verde = melhor, roxo = marca). Vale para o painel offline (`roundrx/viz/`: template.html, app.css, app.js; d3 v7).

## 1. Auditoria da interface atual

| Problema | Onde aparece | Efeito |
|---|---|---|
| Não existe home: a página inicial é a lista completa de fundamentos | "Diagnóstico de fundamentos" abre com 3 cartões longos, um "em breve" e a nota de método | Não dá para ver em 5 s como o time está nem por onde começar |
| Mesmo peso visual para tudo | Cartões de fundamento com ~15 números cada (observado, esperado, diferença, Σ, IC, 4 descritivos, veredito, lista de padrões) | O olho não encontra a informação principal |
| Duas portas de entrada concorrentes | "Diagnóstico" e "Visão geral" (relatório da partida) | Fica ambíguo qual é o ponto de partida |
| Filtros sempre no topo | Seletor de partida, lado e "comparar com" ficam visíveis mesmo onde não se aplicam | Ruído, e dúvida sobre o que cada filtro afeta |
| Cor semântica ambígua | Verde = "bom" e também a cor da marca (teal); vermelho e verde lado a lado | Confusão de leitura, e o par vermelho/verde falha para daltônicos |
| Codificações diferentes para a mesma ideia | Observado × esperado aparece como faixa, barra, linha ordinal ou texto | Cada tela pede um aprendizado novo |
| Rótulos em caixa alta e notas longas por toda parte | "MÉTRICA", "NESTA PARTIDA", parágrafos abaixo de cada gráfico | Cansa a leitura; a explicação compete com o dado |
| A incerteza aparece só como texto | "IC 90%: −35 pp a −17 pp" | Dá para ler, mas não dá para ver |
| Fontes externas | Google Fonts não carregam offline | O painel perde a identidade fora da internet |

O que já funciona e fica: denominadores sempre visíveis, comparação com outros times em situações parecidas, linguagem de revisão (nunca "erro"), evidências até o round, filtros lembrados, layout responsivo e tema escuro.

## 2. Arquitetura de informação (progressive disclosure)

```
Nível 1  Panorama do time (home)
         ├─ quem é o time: mapas, vitórias, rounds, período; um cartão por mapa (foto, V–D, saldo, histórico V/D)
         ├─ o que pede atenção: até 4 padrões abaixo do esperado (só quando há)
         ├─ pontos fortes: padrões acima do esperado (só quando há)
         └─ quadro de fundamentos, cada um com "Ver análise detalhada"
Nível 2  Fundamento (seções Trades, Vantagem numérica, First blood, Pós-plant)
         ├─ diagnóstico: observado × esperado, padrões recorrentes
         └─ métricas principais; o restante fica em "mais métricas"
Nível 3  Profundidade
         ├─ padrão: onde aparece mais, partida a partida, rounds para revisar
         ├─ round: posições e linha do tempo
         └─ métrica: evolução, recortes, mapas vencidos × perdidos, como é calculada
```

Navegação lateral:
- **Início:** Panorama e Partida. A Partida abre com a linha de partidas para escolher (mais recente à esquerda, seta "+N")
  e tem três subseções: Visão geral (cabeçalho e o bloco Placar: round a round + placar por jogador com retrato do agente,
  números em células cinza, +/− em verde/vermelho e filtro Todos/Ataque/Defesa), Análise e Rounds para revisar.
- **As 6 categorias de métricas definidas pelo time.**

O padrão e o round continuam sendo rotas próprias, abertas a partir do Nível 2.

Regras:
- Filtros de partida e lado só aparecem onde se aplicam (Partida e métricas).
- Cada tela responde uma pergunta, escrita como título curto.
- Explicações longas ficam atrás de um botão de ajuda (?), nunca soltas na página.
- Denominador, intervalo e recorrência nunca somem: podem ficar compactos, mas estão sempre na tela.

## 3. Design system

### Direção
Uma folha de revisão tática, como o caderno de um analista de time universitário: papel claro e frio, tinta azul-ardósia e uma única forma visual para "observado × esperado". Não é estética "gamer" (neon, fundo preto), porque o trabalho é análise depois da partida.

### Cor

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` papel | #F1F0F4 | #10161B | fundo |
| `--panel` | #FFFFFF | #161E25 | blocos |
| `--ink` tinta | #17222C | #E3E9EE | texto e o traço do "esperado" |
| `--mut` | #59656F | #9AA6B0 | texto secundário |
| `--accent` marca e ação (roxo) | #6D3FC0 | #A98BF5 | navegação, botões, seleção. Nunca indica bom ou ruim |
| `--bad` abaixo do esperado | #C2362F | #EE6A61 | fragilidade potencial |
| `--good` acima do esperado | #1B8A4B | #4CC483 | ponto forte / aumento (verde; a cor nunca vem sozinha: sempre ícone e texto) |
| `--neutral` | #8A949B | #6F7B85 | sem evidência ou inconclusivo |
| `--band` | tinta a 9% | tinta a 12% | intervalo de confiança |
| `--ref` liga | #2F6DB5 | #7FB0EA | referência da liga |
| `--teamavg` | #B4791F | #E0A948 | média do time |

A cor nunca é a única pista: todo status leva ícone e texto ("Abaixo do esperado", "Dentro do esperado", "Acima do esperado"). Faixas: 0 pp = dentro; 1–3 pp = acima/abaixo (contorno); 4+ pp = muito acima/abaixo (preenchido); cheio = sinal forte, diferença consistente; tracejado = sinal fraco ou variado. O intervalo em si não aparece no painel; a régua não usa cursor de ajuda.

### Tipografia
**Archivo** (variável, eixos de peso e largura, OFL) embutida no HTML, com um só tipo e três larguras:
- **Expandida 125 / 800:** nome do time no Panorama. É o único elemento "ousado".
- **Normal 100 / 400–600:** texto e títulos, sempre em caixa normal (nunca em caixa alta).
- **Condensada 78 / 600, com algarismos tabulares:** números e placares, para que as colunas se alinhem.

Escala (razão ≈1,25): 12 · 14 · 16 · 20 · 25 · 31 · 48 px. Texto de leitura com no máximo cerca de 70 caracteres por linha.

### A régua (componente central)
Uma só codificação para observado × esperado em todo o painel:

```
0%  ░░░░░░▒▒▒▒▒▒▒▒░░░░░░░░░░░░  100%
            ●     │
         observado esperado     ▒ = intervalo de 90%
```

- **Ponto:** valor observado, na cor do status.
- **Traço vertical:** esperado (outros times, mesmo contexto).
- **Faixa:** intervalo de 90% do observado (esperado mais o intervalo da diferença).
- Ao lado, sempre: `52 de 136` e `9 de 12 partidas`.
- Leitores de tela recebem a frase completa (`aria-label`).

### Ícones (lucide, embutidos)
| Ícone | Uso |
|---|---|
| arrow-left-right | Trade |
| users | Vantagem numérica |
| crosshair | First blood |
| bomb | Pós-plant |
| shield | Retake |
| scale | Armamento |
| flag | Rounds-chave |
| gauge | Pressão e Leverage Index |
| house | Panorama |
| clipboard-list | Partida |
| trending-down / trending-up / minus | Status |
| film | Rounds para revisar |
| circle-help | Ajuda |

Ícones são funcionais: aparecem com o rótulo, nunca sozinhos (exceto o botão de ajuda, que tem `aria-label`).

### Forma e espaçamento
- Espaçamento em 4 px: 4 · 8 · 12 · 16 · 24 · 32 · 48.
- Raio de 10 px para blocos, 6 px para controles e 999 px para status.
- Sem sombras: a hierarquia vem de espaço, peso e uma régua de status de 3 px à esquerda nos itens de atenção.

### Texto
Títulos curtos em forma de pergunta ou de nome ("O que pede atenção", "Fundamentos"). Botões dizem o que fazem ("Ver rounds", "Abrir fundamento"). Nada de "→" no fim do texto: a direção vem de um ícone de chevron.

## 4. Plano incremental

1. **Tokens, fonte, ícones e componentes base:** régua, status e ajuda. Home "Panorama" como página inicial; navegação Início + 6 categorias.
2. **Páginas de fundamento:** cabeçalho com régua; padrões como lista com régua; métricas abaixo.
3. **Linhas de métrica com régua em vez de texto:** abas mais curtas e notas atrás do botão de ajuda.
4. **Partida, padrão e round no novo sistema.**
