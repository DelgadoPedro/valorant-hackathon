# RoundRx — cobertura de métricas coletivas

Execução: `2026-10-22T19:29:04+00:00` · config v0.4.0 (`131aa49b5fd2`) · base `6fd3c4f46936` · 336 partidas · 6618 rounds · 68 times

**Coletadas: 165/165 métricas no escopo desta etapa** (180 no dicionário; 15 adiadas por dependerem de modelo).

| Status | Qtde | |
|---|---:|---|
| ✅ validada | 31 | `███░░░░░░░░░░░░░░░░░` |
| 🟡 implementada | 134 | `███████████████░░░░░` |
| ⚠️ alerta | 0 | `░░░░░░░░░░░░░░░░░░░░` |
| ❌ erro | 0 | `░░░░░░░░░░░░░░░░░░░░` |
| 🔵 adiada | 15 | `██░░░░░░░░░░░░░░░░░░` |
| ⬜ nao_iniciada | 0 | `░░░░░░░░░░░░░░░░░░░░` |

## Por lente

| Lente | ✅ | 🟡 | ⚠️ | ❌ | 🔵 | ⬜ | Progresso |
|---|---:|---:|---:|---:|---:|---:|---|
| Abertura de half e ciclo econômico | 3 | 15 | 0 | 0 | 0 | 0 | `██████████` 18/18 |
| Abertura e first blood | 3 | 12 | 0 | 0 | 0 | 0 | `██████████` 15/15 |
| After-plant / post-plant | 2 | 12 | 0 | 0 | 0 | 0 | `██████████` 14/14 |
| Composição de agentes | 8 | 15 | 0 | 0 | 1 | 0 | `██████████` 23/24 |
| Dinâmica coletiva e vantagens | 3 | 10 | 0 | 0 | 0 | 0 | `██████████` 13/13 |
| Economia coletiva | 2 | 11 | 0 | 0 | 0 | 0 | `██████████` 13/13 |
| Posicionamento e espaçamento coletivo | 0 | 10 | 0 | 0 | 0 | 0 | `██████████` 10/10 |
| Pressão e Leverage Index | 4 | 14 | 0 | 0 | 0 | 0 | `██████████` 18/18 |
| Probabilidade de vitória e momentos-chave | 0 | 0 | 0 | 0 | 13 | 0 | `░░░░░░░░░░` 0/13 |
| Retake e recuperação defensiva | 2 | 10 | 0 | 0 | 0 | 0 | `██████████` 12/12 |
| Rounds-chave e ciclos econômicos | 3 | 13 | 0 | 0 | 0 | 0 | `██████████` 16/16 |
| Trade kills e cobertura | 1 | 12 | 0 | 0 | 1 | 0 | `█████████░` 13/14 |

## Por classe

| Classe | ✅ | 🟡 | ⚠️ | ❌ | 🔵 | ⬜ |
|---|---:|---:|---:|---:|---:|---:|
| D — direta | 3 | 9 | 0 | 0 | 0 | 0 |
| R — derivada por regras | 23 | 78 | 0 | 0 | 0 | 0 |
| P — proxy | 1 | 33 | 0 | 0 | 0 | 0 |
| M — modelo | 4 | 14 | 0 | 0 | 15 | 0 |

## Qualidade da base

| Check | Descrição | Status | Falhas |
|---|---|---|---:|
| Q01 | nome do arquivo segue o padrão <fase>_<n>_<data>_<timeA>_<a>_x_<b>_<timeB>_<mapa> | ok | 0/336 |
| Q02 | placar do nome do arquivo casa com teams[].roundsWon | ok | 0/336 |
| Q03 | codinome de mapa corresponde a um único nome | ok | 0/336 |
| Q04 | partidas com observador (excluído das métricas) | aviso | 22/336 |
| Q05 | 5 jogadores (não observadores) por time | ok | 0/672 |
| Q06 | nº de rounds = soma do placar | ok | 0/336 |
| Q07 | lado atacante segue o padrão (troca no 13º round; alterna na prorrogação) | ok | 0/6618 |
| Q08 | plantRoundTime > 0 sempre que há bombPlanter | ok | 0/4653 |
| Q09 | defuse só ocorre em round com plant | ok | 0/1349 |
| Q10 | round com defuse foi vencido pelos defensores | ok | 0/1349 |
| Q11 | kills com timestamp negativo | ok | 0/46753 |
| Q12 | economia presente (loadoutValue não nulo) | ok | 0/66180 |
| Q13 | kills não-combate (spike/suicídio/aliado) — excluídas de trades e first blood | info | 382/46753 |
| Q14 | kill com snapshot de posições vazio (afeta métricas espaciais) | aviso | 84/46753 |
| Q15 | kills reconstruídas ≈ players[].stats.kills (tolerância 1) | ok | 0/3360 |
| Q16 | revives inferidos (jogador volta a aparecer vivo) | info | 105/46173 |
| Q17 | contagem de vivos nunca negativa | ok | 0/52279 |
| Q18 | rounds 'Eliminated': time perdedor termina com 0 vivos | aviso | 10/4597 |

## Métricas

Legenda: **validação** = checagem cruzada com campo oficial da Riot e/ou cenário sintético calculado à mão. **Revisão humana pendente** = depende de limiar em `config.yaml` que um jogador/coach deve confirmar.

| ID | Métrica | Classe | Status | Linhas | Times | Validação | Parâmetros |
|---|---|---|---|---:|---:|---|---|
| ECO-01 | Valor total do equipamento | D | 🟡 implementada | 13236 | 68 |  |  |
| ECO-02 | Gasto total por round | D | 🟡 implementada | 13236 | 68 |  |  |
| ECO-03 | Créditos restantes | D | 🟡 implementada | 13236 | 68 |  |  |
| ECO-04 | Desigualdade de equipamento | R | 🟡 implementada | 13236 | 68 |  |  |
| ECO-05 | Jogadores subequipados | R | 🟡 implementada | 13236 | 68 |  | economy.player_eco_max, economy.team_eco_max, economy.team_full_min |
| ECO-06 | Sincronização de buy | R | 🟡 implementada | 13236 | 68 |  | economy.player_eco_max, economy.player_full_min |
| ECO-07 | Vantagem econômica relativa | R | ✅ validada | 13236 | 68 | cruzada 1/1 |  |
| ECO-08 | Conversão por faixa econômica | R | 🟡 implementada | 13236 | 68 |  | economy.team_eco_max, economy.team_full_min |
| ECO-09 | Vitórias em desvantagem | R | ✅ validada | 2215 | 68 | cruzada 1/1 | economy.big_gap |
| ECO-10 | Derrotas com superioridade | R | 🟡 implementada | 2215 | 65 |  | economy.big_gap |
| ECO-11 | Eficiência do investimento | P | 🟡 implementada | 26420 | 68 |  |  |
| ECO-12 | Persistência do arsenal | P | 🟡 implementada | 16910 | 68 |  |  |
| RET-01 | Frequência de defuse | D | ✅ validada | 4653 | 68 | cruzada 1/1 |  |
| RET-02 | Retake por bombsite | R | 🟡 implementada | 4653 | 68 |  |  |
| RET-03 | Retake por vantagem numérica | R | 🟡 implementada | 4653 | 68 |  |  |
| RET-04 | Retake em inferioridade | R | 🟡 implementada | 2475 | 68 |  |  |
| RET-05 | Tempo entre plant e defuse | D | 🟡 implementada | 1349 | 64 |  |  |
| RET-06 | Tempo até primeiro confronto defensivo | P | 🟡 implementada | 4353 | 68 |  |  |
| RET-07 | Trades no pós-plant defensivo | R | 🟡 implementada | 3870 | 68 |  | timing.trade_window_s |
| RET-08 | Agrupamento defensivo no plant | P | 🟡 implementada | 3869 | 68 |  |  |
| RET-09 | Distância defensiva à spike | P | 🟡 implementada | 4450 | 68 |  |  |
| RET-10 | Defuse sem eliminação defensiva | R | 🟡 implementada | 1349 | 64 |  |  |
| POS-01 | Conversão de plant | D | ✅ validada | 4653 | 68 | cruzada 1/1 |  |
| POS-02 | Conversão por bombsite | R | 🟡 implementada | 4653 | 68 |  |  |
| POS-03 | Tempo até o plant | D | 🟡 implementada | 4653 | 68 |  |  |
| POS-04 | Vantagem numérica no plant | R | 🟡 implementada | 4653 | 68 |  |  |
| POS-05 | Conversão com vantagem | R | 🟡 implementada | 2475 | 67 |  |  |
| POS-06 | Conversão em inferioridade | R | 🟡 implementada | 868 | 65 |  |  |
| POS-07 | Primeira morte pós-plant | R | 🟡 implementada | 4353 | 68 |  |  |
| POS-08 | Mortes logo após o plant | R | 🟡 implementada | 9306 | 68 |  | timing.post_plant_windows_s |
| POS-09 | Trades pós-plant | R | 🟡 implementada | 3371 | 68 |  | timing.trade_window_s |
| POS-10 | Colapso numérico rápido | R | 🟡 implementada | 4653 | 68 |  | timing.collapse_window_s |
| POS-11 | Dispersão espacial pós-plant | P | 🟡 implementada | 4422 | 68 |  |  |
| POS-12 | Sobrevivência do planter | R | 🟡 implementada | 4653 | 68 |  |  |
| TRD-01 | Trade rate | R | 🟡 implementada | 12532 | 68 |  | timing.trade_window_s |
| TRD-02 | Tempo de resposta ao trade | R | 🟡 implementada | 6335 | 68 |  | timing.trade_window_s |
| TRD-03 | Taxa de mortes sem trade | R | 🟡 implementada | 12532 | 68 |  | timing.trade_window_s |
| TRD-04 | Trades por dupla | R | 🟡 implementada | 8707 | 68 |  | timing.trade_window_s |
| TRD-05 | Reciprocidade de trades | R | 🟡 implementada | 1068 | 68 |  | timing.trade_window_s |
| TRD-06 | Trades com aliado próximo | P | 🟡 implementada | 34287 | 68 |  | timing.trade_window_s, spatial.distance_buckets |
| TRD-07 | Mortes isoladas | P | 🟡 implementada | 12532 | 68 |  | spatial.near_radius |
| TRD-08 | Oportunidades não convertidas | P | 🟡 implementada | 12532 | 68 |  | timing.trade_window_s, spatial.near_radius |
| TRD-09 | Densidade de cobertura | P | 🟡 implementada | 12532 | 68 |  | spatial.near_radius |
| TRD-10 | Trade Gap contextual | M | 🔵 adiada |  |  |  |  |
| TRD-11 | Chains de trade | R | 🟡 implementada | 13236 | 68 |  | timing.chain_window_s, timing.chain_min_kills |
| TRD-12 | Trades por fase do round | R | 🟡 implementada | 23354 | 68 |  | timing.trade_window_s |
| OPN-01 | First blood rate | R | ✅ validada | 13176 | 68 | cruzada 1/1 |  |
| OPN-02 | Conversão de first blood | R | 🟡 implementada | 6588 | 68 |  |  |
| OPN-03 | Recuperação após first death | R | 🟡 implementada | 6588 | 68 |  |  |
| OPN-04 | Tempo até o first blood | D | 🟡 implementada | 13176 | 68 |  |  |
| OPN-05 | First blood por lado | R | 🟡 implementada | 13176 | 68 |  |  |
| OPN-06 | First blood por economia | R | 🟡 implementada | 13176 | 68 |  | economy.big_gap, economy.even_gap |
| OPN-07 | First blood trocado | R | 🟡 implementada | 6588 | 68 |  | timing.trade_window_s |
| OPN-08 | Vantagem inicial perdida | R | 🟡 implementada | 6588 | 68 |  |  |
| OPN-09 | Tempo até perder 5v4 | R | 🟡 implementada | 5945 | 68 |  |  |
| OPN-10 | Múltiplas perdas na abertura | R | 🟡 implementada | 13176 | 68 |  | timing.opening_kills, timing.collapse_window_s |
| OPN-11 | Apoio à primeira kill | D | 🟡 implementada | 6588 | 68 |  |  |
| OPN-12 | Abertura sem cobertura | P | 🟡 implementada | 6588 | 68 |  | spatial.near_radius |
| KEY-01 | Taxa de vitória nos pistols | R | 🟡 implementada | 1344 | 68 |  |  |
| KEY-02 | Conversão após pistol | R | 🟡 implementada | 657 | 63 |  |  |
| KEY-03 | Recuperação após perder pistol | R | 🟡 implementada | 657 | 67 |  |  |
| KEY-04 | Investimento coletivo no pistol | D | 🟡 implementada | 1344 | 68 |  |  |
| KEY-05 | Sincronização do pistol | R | 🟡 implementada | 2685 | 68 |  |  |
| KEY-06 | Conversão de anti-eco | R | 🟡 implementada | 1445 | 64 |  | economy.team_eco_max, economy.team_full_min |
| KEY-07 | Thrifty / economic upset | R | ✅ validada | 13236 | 68 | cruzada 1/1 |  |
| KEY-08 | Derrota anti-eco | R | 🟡 implementada | 1445 | 64 |  | economy.team_eco_max, economy.team_full_min |
| KEY-09 | Efeito de force buy | P | 🟡 implementada | 2211 | 68 |  | economy.force_player_available_max, economy.force_min_players, economy.team_eco_max |
| KEY-10 | Eficiência do bonus round | P | 🟡 implementada | 209 | 60 |  | economy.bonus_spent_max, economy.team_eco_max, economy.team_full_min |
| KEY-11 | Conversão de clutch 1vX | R | ✅ validada | 6399 | 68 | cruzada 1/1 |  |
| KEY-12 | Flawless rate | R | ✅ validada | 6618 | 67 | cruzada 1/1 |  |
| KEY-13 | Recuperação após derrotas seguidas | R | 🟡 implementada | 5470 | 68 |  | rounds.loss_streaks |
| KEY-14 | Desempenho na prorrogação | R | 🟡 implementada | 160 | 24 |  |  |
| SPC-01 | Distância ao aliado mais próximo | P | 🟡 implementada | 13188 | 68 |  |  |
| SPC-02 | Distância ao aliado no momento da morte | P | 🟡 implementada | 12531 | 68 |  |  |
| SPC-03 | Distância do aliado ao killer | P | 🟡 implementada | 12523 | 68 |  |  |
| SPC-04 | Número de aliados próximos | P | 🟡 implementada | 13188 | 68 |  | spatial.near_radius |
| SPC-05 | Dispersão no início dos confrontos | P | 🟡 implementada | 13175 | 68 |  |  |
| SPC-06 | Dispersão no momento do plant | P | 🟡 implementada | 8291 | 68 |  |  |
| SPC-07 | Defensores próximos da spike no plant | P | 🟡 implementada | 4450 | 68 |  | spatial.near_radius |
| SPC-08 | Mortes sem trade por região | P | 🟡 implementada | 37406 | 68 |  | spatial.grid_cell, timing.trade_window_s |
| SPC-09 | Eliminações concentradas espacialmente | P | 🟡 implementada | 8372 | 68 |  | timing.spatial_cluster_window_s |
| SPC-10 | Relação proximidade–trade | P | 🟡 implementada | 34287 | 68 |  | spatial.distance_buckets, timing.trade_window_s |
| DYN-01 | Conversão de vantagem numérica | R | 🟡 implementada | 22296 | 68 |  |  |
| DYN-02 | Recuperação em desvantagem | R | 🟡 implementada | 22296 | 68 |  |  |
| DYN-03 | Tempo de preservação de vantagem | R | 🟡 implementada | 14634 | 68 |  |  |
| DYN-04 | Colapso numérico | R | 🟡 implementada | 13236 | 68 |  | timing.collapse_window_s |
| DYN-05 | Sequências de mortes sem resposta | R | 🟡 implementada | 13236 | 68 |  |  |
| DYN-06 | Dano coletivo por round | D | ✅ validada | 13236 | 68 | cruzada 1/1 |  |
| DYN-07 | Concentração do dano | R | 🟡 implementada | 26254 | 68 |  |  |
| DYN-08 | Consistência contextual | R | 🟡 implementada | 413 | 59 |  | aggregation.consistency_metrics, aggregation.min_matches_consistency |
| WPR-01 | Probabilidade de vencer o round | M | 🔵 adiada |  |  |  |  |
| WPR-02 | Evolução da probabilidade no round | M | 🔵 adiada |  |  |  |  |
| WPR-03 | Impacto contextual dos eventos | M | 🔵 adiada |  |  |  |  |
| WPR-04 | Microjanelas críticas | M | 🔵 adiada |  |  |  |  |
| WPR-05 | Probabilidade de vencer o mapa | M | 🔵 adiada |  |  |  |  |
| WPR-06 | Evolução da probabilidade no mapa | M | 🔵 adiada |  |  |  |  |
| WPR-07 | Rounds de maior impacto no mapa | M | 🔵 adiada |  |  |  |  |
| WPR-08 | Vantagens desperdiçadas | M | 🔵 adiada |  |  |  |  |
| WPR-09 | Recuperações improváveis | M | 🔵 adiada |  |  |  |  |
| WPR-10 | Estabilidade da vantagem | M | 🔵 adiada |  |  |  |  |
| WPR-11 | Volatilidade da equipe | M | 🔵 adiada |  |  |  |  |
| WPR-12 | Padrões recorrentes de queda | M | 🔵 adiada |  |  |  |  |
| WPR-13 | Desempenho versus expectativa | M | 🔵 adiada |  |  |  |  |
| AGT-01 | Composição exata | R | ✅ validada | 672 | 68 | cruzada 1/1 |  |
| AGT-02 | Frequência da composição por mapa | R | 🟡 implementada | 672 | 68 |  |  |
| AGT-03 | Distribuição de funções | R | ✅ validada | 2688 | 68 | cruzada 1/1 |  |
| AGT-04 | Redundância de função | R | 🟡 implementada | 3360 | 68 |  |  |
| AGT-05 | Diversidade da composição | R | 🟡 implementada | 672 | 68 |  |  |
| AGT-06 | Permanência de agentes | R | 🟡 implementada | 604 | 63 |  |  |
| AGT-07 | Troca de agente por jogador | R | 🟡 implementada | 604 | 63 |  |  |
| AGT-08 | Composição espelhada | R | 🟡 implementada | 672 | 68 |  |  |
| AGT-09 | Sobreposição adversária | R | 🟡 implementada | 672 | 68 |  |  |
| AGT-10 | Duplas/trios recorrentes | R | 🟡 implementada | 13440 | 68 |  |  |
| AGT-11 | Win rate de rounds por composição | R | ✅ validada | 13236 | 68 | cruzada 1/1 |  |
| AGT-12 | Win rate de lados por composição | R | 🟡 implementada | 13236 | 68 |  |  |
| AGT-13 | Win rate por composição e mapa | R | 🟡 implementada | 13236 | 68 |  |  |
| AGT-14 | Conversão de first blood por lineup | R | ✅ validada | 6588 | 68 | cruzada 1/1 |  |
| AGT-15 | Trade rate por lineup | R | ✅ validada | 12532 | 68 | cruzada 1/1 | timing.trade_window_s |
| AGT-16 | Conversão de plant por lineup | R | ✅ validada | 4653 | 68 | cruzada 1/1 |  |
| AGT-17 | Defuses por lineup | R | ✅ validada | 4653 | 68 | cruzada 1/1 |  |
| AGT-18 | Desempenho com vantagem econômica | R | 🟡 implementada | 11892 | 68 |  | composition.loadout_ratio_bands |
| AGT-19 | Distribuição de plants por site | R | 🟡 implementada | 4653 | 68 |  |  |
| AGT-20 | Taxa de trade por par de agentes | P | 🟡 implementada | 108939 | 68 |  | timing.trade_window_s |
| AGT-21 | Primeira kill com assistência por combinação | R | 🟡 implementada | 1831 | 66 |  |  |
| AGT-22 | Proximidade entre funções nos eventos | P | 🟡 implementada | 74745 | 68 |  |  |
| AGT-23 | Papéis operacionais observados | R | ✅ validada | 21297 | 68 | cruzada 2/2 |  |
| AGT-24 | Desempenho ajustado de composição | M | 🔵 adiada |  |  |  |  |
| HAL-01 | Identificação dos pistols | R | 🟡 implementada | 1344 | 68 |  |  |
| HAL-02 | Pistol win rate por half | R | ✅ validada | 1344 | 68 | cruzada 1/1 |  |
| HAL-03 | Conversão do round 2 após vencer pistol | R | ✅ validada | 657 | 63 | cruzada 1/1 |  |
| HAL-04 | Conversão do round 3 após sequência inicial | R | 🟡 implementada | 1292 | 68 |  |  |
| HAL-05 | Saldo de rounds na abertura do half | R | 🟡 implementada | 1292 | 68 |  |  |
| HAL-06 | Investimento após vencer pistol | R | 🟡 implementada | 1314 | 63 |  |  |
| HAL-07 | Falha de anti-eco contextual | P | 🟡 implementada | 621 | 63 |  | halves.superior_ratio |
| HAL-08 | Incidência de force pós-pistol perdido | P | 🟡 implementada | 657 | 67 |  | economy.force_player_available_max, economy.force_min_players |
| HAL-09 | Conversão do force pós-pistol | P | 🟡 implementada | 54 | 31 |  | economy.force_player_available_max, economy.force_min_players |
| HAL-10 | Identificação de bonus no round 3 | P | 🟡 implementada | 557 | 63 |  | economy.team_full_min |
| HAL-11 | Conversão do bonus | P | 🟡 implementada | 488 | 63 |  | economy.team_full_min |
| HAL-12 | Abertura limpa 3-0 | R | ✅ validada | 1292 | 68 | cruzada 1/1 |  |
| HAL-13 | Evolução do gap de equipamento | R | 🟡 implementada | 3950 | 68 |  | halves.log_gap_c |
| HAL-14 | Ritmo de gastos da abertura | R | 🟡 implementada | 3950 | 68 |  |  |
| HAL-15 | Desigualdade de loadout na abertura | R | 🟡 implementada | 3950 | 68 |  |  |
| HAL-16 | Recuperação econômica pós-pistol perdido | P | 🟡 implementada | 632 | 67 |  | economy.team_eco_max, economy.team_full_min |
| HAL-17 | Custo do upset no 2º round | P | 🟡 implementada | 89 | 44 |  |  |
| HAL-18 | Assimetria entre os dois halves | R | 🟡 implementada | 1292 | 68 |  |  |
| LEV-01 | P mapa condicionado a vencer o round | M | ✅ validada | 13236 | 68 | cruzada 2/2 | leverage.shrink_m, leverage.folds |
| LEV-02 | P mapa condicionado a perder o round | M | ✅ validada | 13236 | 68 | cruzada 1/1 | leverage.shrink_m, leverage.folds |
| LEV-03 | Swing potencial do round | M | 🟡 implementada | 13236 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-04 | Leverage Index normalizado | M | ✅ validada | 13236 | 68 | cruzada 2/2 | leverage.shrink_m, leverage.folds |
| LEV-05 | Curva de pressão do mapa | M | 🟡 implementada | 13236 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-06 | Pressão média nos rounds vencidos | M | 🟡 implementada | 6618 | 67 |  | leverage.shrink_m, leverage.folds |
| LEV-07 | Pressão média nos rounds perdidos | M | 🟡 implementada | 6618 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-08 | Win rate ponderado por pressão | M | 🟡 implementada | 26472 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-09 | Vitórias acima do esperado ponderadas | M | 🟡 implementada | 26472 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-10 | WPA realizada no mapa por round | M | 🟡 implementada | 13236 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-11 | Pressão média por fase/lado | M | 🟡 implementada | 13236 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-12 | Conversão de abertura ponderada | M | 🟡 implementada | 13176 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-13 | Trades ponderados por pressão | M | ✅ validada | 25064 | 68 | cruzada 1/1 | leverage.shrink_m, leverage.folds, timing.trade_window_s |
| LEV-14 | Conversão de plant/defuse ponderada | M | 🟡 implementada | 18612 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-15 | Upsets econômicos ponderados | M | 🟡 implementada | 4606 | 68 |  | leverage.shrink_m, leverage.folds, composition.loadout_ratio_bands |
| LEV-16 | K−D ponderado por pressão | M | 🟡 implementada | 13236 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-17 | Diferença entre K−D ponderado e bruto | M | 🟡 implementada | 13236 | 68 |  | leverage.shrink_m, leverage.folds |
| LEV-18 | Consistência por faixa de pressão | M | 🟡 implementada | 13236 | 68 |  | leverage.shrink_m, leverage.folds |
| DYN-09 | Conversão por situação de vantagem | R | ✅ validada | 17976 | 68 | cruzada 2/2 |  |
| DYN-10 | Recuperação por situação de desvantagem | R | ✅ validada | 17976 | 68 | cruzada 2/2 |  |
| DYN-11 | Tempo para sair da desvantagem | R | 🟡 implementada | 13696 | 68 |  |  |
| DYN-12 | Vitória pelo tempo de vantagem | R | 🟡 implementada | 13696 | 68 |  | timing.episode_buckets_s |
| DYN-13 | Vitória pelo tempo para sair da desvantagem | R | 🟡 implementada | 13696 | 68 |  | timing.episode_buckets_s |
| OPN-13 | First blood feito trocado pelo adversário | R | ✅ validada | 6588 | 68 | cruzada 1/1 | timing.trade_window_s |
| OPN-14 | First blood com assistência | D | 🟡 implementada | 6588 | 68 |  |  |
| OPN-15 | Primeiro duelo sem cobertura | P | ✅ validada | 13176 | 68 | cruzada 1/1 | spatial.near_radius |
| ECO-13 | Conversão por vantagem de armamento | R | 🟡 implementada | 11892 | 68 |  | composition.loadout_ratio_bands |
| TRD-13 | Trade sofrido | R | ✅ validada | 12532 | 68 | cruzada 1/1 | timing.trade_window_s |
| TRD-14 | Mortes sem trade isoladas | P | 🟡 implementada | 11439 | 68 |  | timing.trade_window_s, spatial.near_radius |
| POS-13 | Tempo até o primeiro contato pós-plant | R | ✅ validada | 4353 | 68 | cruzada 1/1 |  |
| POS-14 | Plant em inferioridade | R | 🟡 implementada | 4653 | 68 |  |  |
| RET-11 | Saldo de vivos no fim do retake | R | 🟡 implementada | 4653 | 68 |  |  |
| RET-12 | Retake abandonado | R | ✅ validada | 23265 | 68 | cruzada 1/1 |  |
| KEY-15 | Vitória em eco | R | 🟡 implementada | 1493 | 68 |  | economy.team_eco_max |
| KEY-16 | Vitória armado | R | 🟡 implementada | 6182 | 68 |  | economy.team_full_min |
