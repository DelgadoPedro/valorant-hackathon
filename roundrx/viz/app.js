/* RoundRx — painel por equipe. Todos os valores vêm de window.RRX (gerado por roundrx/viz/build.py).
   Regra única de agregação (a mesma do pipeline): valor = Σnum / Σden sobre o recorte (lado, partidas, mapa).
   Desenho: cada seção é uma lista limpa de métricas (valor + números absolutos + referências). Gráficos só
   aparecem ao clicar numa métrica, em abas: evolução, recortes (uma dimensão por vez), visão própria e definição. */
(function () {
  "use strict";
  const D = window.RRX;
  // colunas compactadas em run-length no build (valor × repetições)
  const unrle = (c) => (c && c.rle ? c.rle[0].flatMap((v, i) => Array(c.rle[1][i]).fill(v)) : c);
  for (const k of ["t", "m", "sd"]) D.TM[k] = unrle(D.TM[k]);
  const M = D.M, nM = M.id.length;
  const METRICS = D.metrics;
  const MI = Object.fromEntries(METRICS.map((m, i) => [m.id, i]));
  const S = D.strata;
  const SI = Object.fromEntries(S.map((s, i) => [s, i]));
  const MAPI = Object.fromEntries(D.maps.map((m, i) => [m, i]));
  const BUYS = ["pistol", "eco", "half", "full"];
  const BUY_LBL = { pistol: "Pistol", eco: "Eco", half: "Half", full: "Full" };
  const RES_LBL = ["Eliminação", "Defuse", "Detonação", "Tempo esgotado"];
  const CER = ["", "Flawless", "Closer", "Clutch", "Thrifty", "Team Ace", "Ace"];
  const PH_LBL = ["Abertura", "Pré-plant", "Pós-plant"];

  // ------------------------------------------------------------------ catálogo editorial
  // [rótulo para o coach, pergunta que a métrica responde, unidade do denominador]
  const L = {
    "OPN-01": ["First blood a favor", "Em quantos rounds o time faz a primeira kill?", "rounds"],
    "OPN-02": ["Vitória após first blood a favor", "Depois de fazer a primeira kill, o time vence o round?", "first bloods a favor"],
    "OPN-03": ["Vitória após first blood sofrido", "Depois de perder o primeiro jogador, o time ainda vence o round?", "first bloods sofridos"],
    "OPN-04": ["Tempo até o first blood", "Em que segundo do round sai a primeira kill?", "rounds"],
    "OPN-07": ["First blood sofrido trocado", "Quando o time sofre o first blood, alguém troca em seguida?", "first bloods sofridos"],
    "OPN-08": ["Desperdiça o first blood", "Fez a primeira kill e mesmo assim perdeu o round?", "first bloods"],
    "OPN-09": ["Segura o 5v4", "Quantos segundos o time fica em 5v4 até perder alguém?", "5v4"],
    "OPN-10": ["Duas mortes na abertura", "Em quantos rounds o time perde dois jogadores logo no início?", "rounds"],
    "OPN-11": ["Assistências no first blood", "O primeiro abate é feito com apoio de companheiros?", "first bloods"],
    "OPN-12": ["First blood sofrido sem cobertura", "A primeira vítima do time morre sem aliado por perto?", "first bloods sofridos"],
    "TRD-01": ["Mortes trocadas", "Quando um jogador morre, um companheiro troca em seguida?", "mortes"],
    "TRD-02": ["Tempo até o trade", "Quanto tempo o time leva para trocar uma morte?", "trades"],
    "TRD-03": ["Mortes sem trade", "Quantas mortes ficam sem resposta?", "mortes"],
    "TRD-05": ["Reciprocidade entre duplas", "As duplas trocam uma à outra de forma equilibrada?", "duplas"],
    "TRD-07": ["Mortes isoladas", "O jogador morre sem nenhum aliado por perto?", "mortes"],
    "TRD-08": ["Mortes sem trade com aliado perto", "Havia aliado perto e mesmo assim a morte ficou sem trade?", "mortes"],
    "TRD-09": ["Aliados por perto na morte", "Quantos aliados estavam perto de quem morreu?", "mortes"],
    "TRD-11": ["Trocas em sequência", "Quantas sequências de kills alternadas acontecem por round?", "rounds"],
    "POS-01": ["Vitória após o plant", "Depois de plantar, o time vence o round?", "plants"],
    "POS-03": ["Tempo até o plant", "Em que segundo do round o time planta?", "plants"],
    "POS-04": ["Saldo de vivos no plant", "Com quantos jogadores a mais (ou a menos) o time planta?", "plants"],
    "POS-13": ["Tempo até o 1º contato pós-plant", "Depois do plant, quanto tempo até a primeira kill?", "plants com contato"],
    "POS-14": ["Plants em inferioridade numérica", "Em quantos plants o time tem menos jogadores vivos?", "plants"],
    "RET-11": ["Saldo de vivos no fim do retake", "Quantos vivos a mais (ou a menos) o time tem no fim do retake?", "plants sofridos"],
    "RET-12": ["Retakes abandonados", "A spike explodiu sem tentativa de retake ou com arma guardada?", "plants sofridos"],
    "POS-07": ["1ª morte pós-plant sofrida", "Depois do plant, o primeiro a cair é do time?", "plants com morte depois"],
    "POS-08": ["Mortes logo após o plant", "Quantos atacantes morrem nos primeiros segundos após plantar?", "plants"],
    "POS-09": ["Trades pós-plant", "As mortes depois do plant são trocadas?", "mortes"],
    "POS-10": ["Colapso pós-plant", "O time perde dois jogadores em sequência depois de plantar?", "plants"],
    "POS-11": ["Espalhamento no plant", "Quão espalhados estão os atacantes no momento do plant?", "plants"],
    "POS-12": ["Planter sobrevive", "Quem plantou continua vivo até o fim do round?", "plants"],
    "RET-01": ["Defuses no retake", "Quando o adversário planta, o time defusa?", "plants sofridos"],
    "RET-04": ["Defuses em inferioridade numérica", "Com menos jogadores vivos no plant adversário, o time defusa?", "plants sofridos"],
    "RET-05": ["Tempo até o defuse", "Quanto tempo depois do plant sai o defuse?", "defuses"],
    "RET-06": ["Tempo até o 1º contato no retake", "Após o plant adversário, quanto tempo até o 1º duelo?", "plants sofridos"],
    "RET-07": ["Mortes trocadas no retake", "Depois do plant adversário, as mortes do time são trocadas?", "mortes"],
    "RET-08": ["Agrupamento no plant", "Quão juntos estão os defensores no momento do plant?", "plants sofridos"],
    "RET-09": ["Distância até a spike", "Quão longe da spike estão os defensores no plant?", "plants sofridos"],
    "RET-10": ["Defuses sem kill", "Em quantos defuses o time não fez nenhuma kill depois do plant?", "defuses"],
    "ECO-01": ["Valor do equipamento", "Σ do loadout dos 5 jogadores no round.", "rounds"],
    "ECO-02": ["Gasto por round", "Quanto o time gasta por round.", "rounds"],
    "ECO-03": ["Créditos guardados", "Quanto sobra no banco depois da compra.", "rounds"],
    "ECO-04": ["Desigualdade do equipamento", "Os cinco compram parecido ou há grandes diferenças?", "rounds"],
    "ECO-05": ["Jogadores subequipados", "Quantos jogadores ficam com equipamento de eco no round?", "rounds"],
    "ECO-06": ["Sincronia da compra", "Que fração do time está na mesma faixa de compra?", "rounds"],
    "ECO-07": ["Vantagem de equipamento", "Loadout do time menos o do adversário.", "rounds"],
    "ECO-08": ["Vitórias por situação econômica", "Taxa de vitória em cada par de compras (time × adversário).", "rounds"],
    "ECO-09": ["Vence em desvantagem", "Vence rounds com equipamento bem pior que o do adversário?", "rounds em desvantagem"],
    "ECO-10": ["Perde em vantagem", "Perde rounds com equipamento bem melhor que o do adversário?", "rounds em vantagem"],
    "ECO-11": ["Dano por crédito", "Quanto dano o time causa a cada 1000 créditos.", "rounds"],
    "ECO-12": ["Mantém o arsenal", "Que fração dos jogadores repete a arma do round anterior?", "jogadores-round"],
    "KEY-01": ["Vitória no pistol", "O time vence os pistols (rounds 1 e 13)?", "pistols"],
    "KEY-02": ["Após vencer o pistol", "Vence o round seguinte ao pistol vencido?", "rounds"],
    "KEY-03": ["Após perder o pistol", "Vence o round seguinte ao pistol perdido?", "rounds"],
    "KEY-04": ["Gasto no pistol", "Quanto o time investe no pistol.", "pistols"],
    "KEY-05": ["Sincronia no pistol", "Dispersão do gasto entre os cinco no pistol.", "pistols"],
    "KEY-06": ["Vitória em anti-eco", "Quando o adversário está em eco, o time vence o round?", "rounds"],
    "KEY-15": ["Vitória em eco", "Quando o time está em eco (fora dos pistols), vence o round?", "rounds em eco"],
    "KEY-16": ["Vitória em round armado", "Quando os dois times estão em full buy, o time vence o round?", "rounds armados"],
    "KEY-07": ["Thrifty", "Vitórias marcadas como Thrifty pelo jogo.", "rounds"],
    "KEY-08": ["Perde anti-eco", "Perde para um adversário em eco?", "rounds"],
    "KEY-09": ["Vitória em force buy", "Quando força a compra após uma derrota, o time vence?", "forces"],
    "KEY-10": ["Bonus round", "Vence o round jogado com o arsenal carregado?", "bonus"],
    "KEY-11": ["Clutch", "O último jogador vivo vence contra 2 ou mais?", "situações"],
    "KEY-12": ["Vitórias flawless", "Vence sem perder ninguém?", "vitórias"],
    "KEY-13": ["Reação a derrotas seguidas", "Vence depois de perder rounds em sequência?", "rounds"],
    "KEY-14": ["Prorrogação", "Taxa de vitória nos rounds de prorrogação.", "rounds"],
    "DYN-01": ["Converte vantagem numérica", "Quando fica com mais jogadores, o time vence?", "rounds"],
    "DYN-02": ["Vira em desvantagem", "Quando fica com menos jogadores, o time ainda vence?", "rounds"],
    "DYN-03": ["Duração da vantagem numérica", "Por quanto tempo o time segura uma vantagem numérica?", "vantagens"],
    "DYN-04": ["Rounds com colapso", "O time perde dois jogadores em poucos segundos?", "rounds"],
    "DYN-05": ["Mortes sem resposta", "Maior sequência de mortes do time sem abater ninguém.", "rounds"],
    "DYN-06": ["Dano por round", "Dano total causado pelo time por round.", "rounds"],
    "DYN-07": ["Concentração do dano", "O dano depende de poucos jogadores? (0,2 = igual entre os 5)", "rounds"],
    "DYN-08": ["Consistência", "Quanto as principais métricas variam de partida para partida.", "partidas"],
    "SPC-01": ["Distância média ao aliado", "Distância de cada jogador ao aliado mais próximo nas kills.", "kills"],
    "SPC-02": ["Aliado mais próximo na morte", "A que distância estava o aliado mais próximo de quem morreu?", "mortes"],
    "SPC-03": ["Aliado até o killer", "A que distância o aliado mais próximo estava de quem matou?", "mortes"],
    "SPC-04": ["Aliados por perto", "Quantos aliados cada jogador tem por perto nas kills.", "kills"],
    "SPC-05": ["Espalhamento no 1º duelo", "Quão espalhado o time está no primeiro duelo do round?", "rounds"],
    "SPC-06": ["Espalhamento no plant", "Quão espalhado o time está no momento do plant?", "plants"],
    "SPC-07": ["Defensores perto da spike", "Quantos defensores estão perto da spike no plant?", "plants sofridos"],
    "SPC-09": ["Mortes agrupadas", "Distância entre mortes do time que acontecem em sequência.", "pares de mortes"],
    "AGT-01": ["Composição", "Quais 5 agentes o time usou no mapa.", "mapas"],
    "AGT-02": ["Composições por mapa", "Quais composições o time usa em cada mapa.", "mapas"],
    "AGT-03": ["Funções na composição", "Quantos duelistas, iniciadores, controladores e sentinelas o time usa.", "mapas"],
    "AGT-04": ["Função repetida", "O time joga com 2 ou mais agentes da mesma função?", "mapas"],
    "AGT-05": ["Composição nova", "Em que fração dos mapas o time estreou uma composição? (mede a diversidade)", "mapas"],
    "AGT-06": ["Permanência dos agentes", "Quanto a composição se mantém de um mapa para o seguinte? (1 = idêntica)", "trocas de mapa"],
    "AGT-07": ["Jogadores que trocaram de agente", "Entre mapas seguidos, quantos jogadores mudaram de agente?", "jogadores"],
    "AGT-08": ["Composição espelhada", "O adversário usou exatamente a mesma composição?", "mapas"],
    "AGT-09": ["Agentes em comum com o adversário", "Quantos dos 5 agentes o adversário também usou?", "agentes"],
    "AGT-10": ["Duplas e trios recorrentes", "Quais agentes aparecem juntos com mais frequência.", "mapas"],
    "AGT-11": ["Vitórias por composição", "Taxa de vitória de rounds com cada composição.", "rounds"],
    "AGT-12": ["Vitórias por composição e lado", "Taxa de vitória de cada composição no ataque e na defesa.", "rounds"],
    "AGT-13": ["Vitórias por composição e mapa", "Taxa de vitória de cada composição em cada mapa.", "rounds"],
    "AGT-14": ["First blood convertido por composição", "Com cada composição, o time vence depois de abrir o round?", "first bloods"],
    "AGT-15": ["Trades por composição", "Com cada composição, as mortes são trocadas?", "mortes"],
    "AGT-16": ["Plant convertido por composição", "Com cada composição, o time segura o plant?", "plants"],
    "AGT-17": ["Defuses por composição", "Com cada composição, o time defusa?", "plants sofridos"],
    "AGT-18": ["Composição × economia", "Taxa de vitória de cada composição com equipamento inferior, equilibrado ou superior.", "rounds"],
    "AGT-19": ["Sites de plant por composição", "Onde cada composição planta.", "plants"],
    "AGT-20": ["Trade por dupla de agentes", "Quando um morre e o outro está vivo, o outro troca?", "situações"],
    "AGT-21": ["First blood com assistência", "Quem abre o round e quem ajuda.", "first bloods"],
    "AGT-22": ["Distância entre funções", "Quão perto ficam aliados de funções diferentes nos momentos de kill.", "pares"],
    "AGT-23": ["Quem faz o quê", "Fatia de cada agente em first kills, trades, plants e defuses.", "eventos"],
    "HAL-01": ["Pistols jogados", "Pistols de cada half (rounds 1 e 13).", "pistols"],
    "HAL-02": ["Vence o pistol", "Taxa de vitória nos pistols de cada half.", "pistols"],
    "HAL-03": ["Converte o round 2", "Depois de vencer o pistol, vence o round seguinte?", "halves"],
    "HAL-04": ["Vence o round 3", "Taxa de vitória no 3º round, conforme o começo do half (2-0, 1-1, 0-2).", "halves"],
    "HAL-05": ["Saldo na abertura do half", "Vitórias − derrotas nos 3 primeiros rounds do half.", "halves"],
    "HAL-06": ["Investimento no round 2", "Quanto o time gasta no round 2 depois de vencer o pistol.", "halves"],
    "HAL-07": ["Perde o anti-eco", "Venceu o pistol, entrou no round 2 bem mais equipado e perdeu?", "halves"],
    "HAL-08": ["Force após perder o pistol", "Depois de perder o pistol, o time força a compra no round 2?", "halves"],
    "HAL-09": ["Converte o force pós-pistol", "Vence o round 2 quando força a compra?", "forces"],
    "HAL-10": ["Bonus no round 3", "Depois de abrir 2-0, entra no round 3 com equipamento abaixo de full ou do adversário?", "halves 2-0"],
    "HAL-11": ["Converte o bonus", "Vence o round 3 jogado como bonus?", "bonus"],
    "HAL-12": ["Abertura 3-0", "Vence os 3 primeiros rounds do half?", "halves"],
    "HAL-13": ["Gap de equipamento na abertura", "Razão (log) entre o equipamento do time e o do adversário; > 0 = time mais equipado.", "rounds"],
    "HAL-14": ["Gasto na abertura", "Quanto o time gasta nos rounds 1, 2 e 3 do half.", "rounds"],
    "HAL-15": ["Compra desigual na abertura", "Diferença de equipamento entre os 5 nos rounds 1–3 (coeficiente de variação).", "rounds"],
    "HAL-16": ["Recuperação após perder o pistol", "Quantos rounds até o 1º full buy depois de perder o pistol.", "halves"],
    "HAL-17": ["Reação ao upset no round 2", "Venceu o pistol e perdeu o round 2: vence o round 3?", "halves"],
    "HAL-18": ["Diferença entre os halves", "Taxa de vitória nos 3 primeiros rounds: 2º half − 1º half.", "rounds"],
    // complementares pedidos pelo time (21/10/2026)
    "DYN-09": ["Vitória com vantagem numérica", "Com mais jogadores vivos, o time vence? Em que situação começa?", "rounds"],
    "DYN-10": ["Vitória em desvantagem numérica", "Com menos jogadores vivos, o time vira? Em que situação começa?", "rounds"],
    "DYN-11": ["Tempo até sair da desvantagem numérica", "Quanto tempo o time leva para empatar ou virar a desvantagem?", "desvantagens"],
    "DYN-12": ["Vitória pelo tempo de vantagem", "O time vence mais quando segura a vantagem por mais tempo antes de ela ser anulada?", "vantagens"],
    "DYN-13": ["Vitória pelo tempo de reação", "O time vence mais quando sai rápido da desvantagem?", "desvantagens"],
    "OPN-13": ["First blood a favor devolvido", "Quando o time faz o first blood, o adversário troca em seguida?", "first bloods a favor"],
    "OPN-14": ["First blood a favor com assistência", "Em quantos first bloods do time algum companheiro ajudou?", "first bloods a favor"],
    "OPN-15": ["1º duelo sem cobertura", "No 1º duelo do round, o jogador do time estava sem aliado perto?", "primeiros duelos"],
    "ECO-13": ["Vitória por armamento", "Com equipamento melhor, parecido ou pior, o time vence o round?", "rounds"],
    "TRD-13": ["Kills trocadas pelo adversário", "Quando o time mata, o adversário mata o autor em seguida?", "kills"],
    "TRD-14": ["Mortes sem trade isoladas", "Das mortes sem trade, quantas não tinham nenhum aliado por perto?", "mortes sem trade"],
    // pressão e Leverage Index (22/10/2026): LI = quanto o resultado do round pode mudar a chance de vencer o mapa, ÷ média da liga
    "LEV-04": ["Pressão média dos rounds", "Os rounds deste time valem mais ou menos para o mapa que um round típico (LI = 1)?", "rounds"],
    "LEV-08": ["Vence nos rounds que mais valem", "Pesando cada round pelo quanto vale para o mapa, o time vence mais ou menos que na taxa sem peso?", "rounds"],
    "LEV-09": ["Vence acima do esperado sob pressão", "Descontados lado, mapa e economia de cada round, o time vence mais que o esperado nos rounds que mais valem?", "rounds"],
    "LEV-10": ["Chance de mapa ganha por round", "Em média, quanto cada round mudou a chance de vencer o mapa além do esperado para aquele round?", "rounds"],
    "LEV-06": ["Pressão nas vitórias", "Os rounds que o time vence valem quanto para o mapa?", "rounds vencidos"],
    "LEV-07": ["Pressão nas derrotas", "Os rounds que o time perde valem quanto para o mapa?", "rounds perdidos"],
    "LEV-11": ["Pressão por fase do half", "Em que parte do half estão os rounds que mais valem?", "rounds"],
    "LEV-18": ["Vence por faixa de pressão", "A taxa de vitória muda entre os rounds de menor e de maior pressão?", "rounds"],
    "LEV-12": ["Converte o first blood sob pressão", "Depois de abrir o round, o time vence, pesando pela pressão?", "first bloods"],
    "LEV-13": ["Trades sob pressão", "As mortes são trocadas nos rounds que mais valem?", "mortes"],
    "LEV-14": ["Spike plantada sob pressão", "Com a spike plantada (pós-plant e retake), o time vence, pesando pela pressão?", "rounds"],
    "LEV-15": ["Vence com armamento inferior sob pressão", "Com equipamento bem pior que o do adversário, o time vence, pesando pela pressão?", "rounds"],
    "LEV-16": ["Saldo de abates ponderado", "Kills − mortes por round, pesando cada round pela pressão.", "rounds"],
    "LEV-17": ["Saldo de abates: ponderado − sem peso", "O saldo de abates é melhor (> 0) ou pior (< 0) nos rounds de maior pressão?", "rounds"],
  };
  // Métricas principais (aparecem primeiro); o restante fica em "mais métricas".
  const MAIN = {
    ADV: ["DYN-09", "DYN-10", "DYN-03", "DYN-11", "DYN-12", "DYN-13"],
    FB: ["OPN-01", "OPN-02", "OPN-03", "OPN-04", "OPN-07", "OPN-13", "OPN-14", "OPN-15"],
    ARM: ["ECO-13", "ECO-09", "ECO-10", "ECO-07", "ECO-08"],
    TRD: ["TRD-01", "TRD-13", "TRD-14", "TRD-08"],
    POS: ["POS-01", "POS-04", "POS-07", "POS-12"], RET: ["RET-01", "RET-04", "RET-07", "RET-05"],
    KEY: ["KEY-01", "KEY-15", "KEY-06", "KEY-09", "KEY-16"], CLU: ["KEY-11", "KEY-12", "KEY-13"],
    GEC: ["ECO-02", "ECO-03", "ECO-06"], SPC: ["SPC-01", "SPC-05", "SPC-09"],
    AGT: ["AGT-05", "AGT-06", "AGT-07", "AGT-09"], HAL: ["HAL-02", "HAL-03", "HAL-12", "HAL-05", "HAL-07"],
  };
  // Métricas que são recortes de outra (não aparecem na lista; viram "Recortes" da métrica-mãe).
  const HIDDEN = new Set(["OPN-05", "OPN-06", "TRD-04", "TRD-06", "TRD-12", "SPC-08", "SPC-10", "POS-02", "POS-05", "POS-06", "RET-02", "RET-03",
    // composição: exibidas nos painéis próprios da aba (tabela de composições, funções, duplas, quem faz o quê)
    "AGT-01", "AGT-02", "AGT-03", "AGT-10", "AGT-11", "AGT-12", "AGT-13", "AGT-14", "AGT-15", "AGT-16", "AGT-17", "AGT-18", "AGT-19",
    "AGT-20", "AGT-21", "AGT-23"]);
  // métricas de nível mapa (uma composição por time-mapa): o filtro de lado não se aplica
  const MAPLEVEL = new Set(["AGT-01", "AGT-02", "AGT-03", "AGT-04", "AGT-05", "AGT-06", "AGT-07", "AGT-08", "AGT-09", "AGT-10"]);
  // valor-resumo = diferença entre dois estratos
  const DIFF = { "HAL-18": ["2º half", "1º half"] };
  // Valor-resumo de métricas que só existem por estrato: estrato fixo (recortes que se sobrepõem) ou soma de todos.
  const HEAD = { "OPN-04": ["fez", "sofreu"], "OPN-15": ["fez", "sofreu"], "DYN-09": ["geral"], "DYN-10": ["geral"], "DYN-11": ["revertida"], "ECO-13": ["superior"], "KEY-09": ["round_atual"], "KEY-13": ["apos_2_derrotas"], "POS-08": ["5s"], "DYN-01": ["+1"], "DYN-02": ["-1"],
                 "DYN-07": ["hhi"], "ECO-11": ["gasto"], "DYN-03": ["anulada"], "KEY-05": ["gasto"], "HAL-06": ["gasto"],
                 "LEV-14": ["pós-plant (ataque)", "retake (defesa)"], "LEV-18": ["Q4 (maior pressão)"], "LEV-11": ["fim do half"] };
  const HEAD_NOTE = { "DYN-09": "qualquer vantagem", "DYN-10": "qualquer desvantagem", "DYN-11": "desvantagens revertidas",
                      "DYN-12": "todas as vantagens", "DYN-13": "todas as desvantagens", "ECO-13": "com armamento superior", "OPN-15": "fez e sofreu",
                      "KEY-09": "no próprio round do force", "KEY-13": "após 2+ derrotas", "POS-08": "nos 5 s após o plant", "DYN-01": "ao ficar com 1 a mais",
                      "DYN-02": "ao ficar com 1 a menos", "DYN-07": "índice HHI", "ECO-11": "por crédito gasto", "DYN-03": "vantagens anuladas", "KEY-05": "desvio do gasto", "ECO-08": "geral · abra para a matriz", "HAL-06": "Σ gasto", "HAL-13": "média dos rounds 1–3",
                      "HAL-14": "média dos rounds 1–3", "HAL-15": "média dos rounds 1–3", "HAL-18": "2º − 1º half",
                      "LEV-08": "ponderada", "LEV-09": "ponderado", "LEV-14": "pós-plant e retake", "LEV-18": "no quartil de maior pressão", "LEV-11": "fim do half (rounds 10–12)" };
  const SL = { // rótulos de estratos
    atk: "ataque", def: "defesa", muito_inferior: "bem inferior", moderado: "diferença moderada", equilibrado: "equilibrada", muito_superior: "bem superior",
    pistol: "pistol", abertura: "abertura", pre_plant: "pré-plant", pos_plant: "pós-plant", fez: "fez", sofreu: "sofreu",
    round_atual: "no round do force", round_seguinte: "no round seguinte", "3o_round_apos_pistol": "3º round (clássico)", outros: "outros",
    apos_2_derrotas: "após 2+ derrotas", apos_3_derrotas: "após 3+ derrotas", anulada: "anulada", mantida: "mantida até o fim",
    hhi: "HHI", top2: "2 maiores", gasto: "por gasto", loadout: "por loadout", gasto_baixo: "gastou pouco", gasto_normal: "gastou normal",
    eco: "eco", half: "half", full: "full", sem_aliado: "sem aliado vivo", r1: "round 1 (pistol)", r2: "round 2", r3: "round 3",
    rt_pistol: "rounds de pistol", rt_demais: "demais rounds",
    geral: "qualquer", inferior: "inferior", equilibrado: "equilibrado", superior: "superior",
  };
  const sl = (s) => SL[s] ?? s;
  // Recortes específicos (além de Lado e Mapa, que valem para todas): [rótulo, itens {id, s, label}]
  const seq = (id, ss) => ss.map((s) => ({ id, s, label: sl(s) }));
  // tipo do recorte: "nom" = categorias sem ordem (tabela), "ord" = escala ordenada (linha)
  const [EB1, EB2] = D.cfg.episode_buckets_s || [5, 15];
  const EBK = [`até ${EB1} s`, `${EB1}–${EB2} s`, `mais de ${EB2} s`];
  const ADV_STATES = ["5v4", "4v3", "3v2", "2v1", "5v3", "4v2", "3v1", "5v2", "4v1", "5v1"];
  const DIS_STATES = ["4v5", "3v4", "2v3", "1v2", "3v5", "2v4", "1v3", "2v5", "1v4", "1v5"];
  const CUTS = {
    "DYN-09": [["Situação", seq("DYN-09", ADV_STATES), "nom"]],
    "DYN-10": [["Situação", seq("DYN-10", DIS_STATES), "nom"]],
    "DYN-11": [["Desfecho", seq("DYN-11", ["revertida", "não revertida"]), "nom"]],
    "DYN-12": [["Quanto a vantagem durou", seq("DYN-12", [...EBK, "mantida até o fim"]), "ord"]],
    "DYN-13": [["Quanto levou para sair", seq("DYN-13", [...EBK, "não revertida"]), "ord"]],
    "ECO-13": [["Armamento", seq("ECO-13", ["inferior", "equilibrado", "superior"]), "ord"]],
    "OPN-15": [["No duelo, o time", seq("OPN-15", ["fez", "sofreu"]), "nom"]],
    "RET-11": [["Desfecho", seq("RET-11", ["defusou", "não defusou"]), "nom"]],
    "RET-12": [["Tentativa", seq("RET-12", ["sem combate", "abandono parcial"]), "nom"], ["Desfecho", seq("RET-12", ["guardou arma", "morreu para a spike"]), "nom"]],
    "OPN-01": [["Economia relativa", seq("OPN-06", ["muito_inferior", "moderado", "equilibrado", "muito_superior"]), "ord"]],
    "TRD-01": [["Fase do round", seq("TRD-12", ["abertura", "pre_plant", "pos_plant"]), "nom"], ["Distância ao aliado", seq("TRD-06", ["0-10m", "10-20m", "20-30m", "30-50m", ">50m"]), "ord"]],
    "TRD-03": [["Fase do round", seq("TRD-12", ["abertura", "pre_plant", "pos_plant"]), "nom"]],
    "POS-01": [["Saldo de vivos no plant", seq("POS-06", ["-3", "-2", "-1"]).concat(seq("POS-05", ["+1", "+2", "+3", "+4"])), "ord"], ["Site", seq("POS-02", ["A", "B", "C"]).map((x) => ({ ...x, label: "site " + x.s })), "nom"]],
    "RET-01": [["Saldo de vivos no plant", seq("RET-03", ["-3", "-2", "-1", "+0", "+1", "+2", "+3"]), "ord"], ["Site", seq("RET-02", ["A", "B", "C"]).map((x) => ({ ...x, label: "site " + x.s })), "nom"]],
    "KEY-11": [["Situação", seq("KEY-11", ["1v2", "1v3", "1v4", "1v5"]), "nom"]],
    "KEY-13": [["Sequência", seq("KEY-13", ["apos_2_derrotas", "apos_3_derrotas"]), "nom"]],
    "KEY-09": [["Momento", seq("KEY-09", ["round_atual", "round_seguinte"]), "nom"]],
    "ECO-05": [["Compra do time", seq("ECO-05", ["eco", "half", "full", "pistol"]), "nom"]],
    // estratos que são medidas diferentes (não categorias) ou já têm visão própria: só Lado e Mapa
    "DYN-01": [], "DYN-02": [], "DYN-07": [], "ECO-11": [], "KEY-05": [], "ECO-08": [],
    "HAL-01": [["Half", seq("HAL-01", ["1º half", "2º half"]), "nom"]],
    "HAL-02": [["Half", seq("HAL-02", ["1º half", "2º half"]), "nom"]],
    "HAL-03": [["Half", seq("HAL-03", ["1º half", "2º half"]), "nom"]],
    "HAL-18": [["Half", seq("HAL-18", ["1º half", "2º half"]), "nom"]],
    "HAL-04": [["Caminho r1–r2", seq("HAL-04", ["2-0", "1-1", "0-2"]), "nom"]],
    "HAL-06": [["Medida", seq("HAL-06", ["gasto", "loadout"]), "nom"]],
    "HAL-13": [["Round do half", seq("HAL-13", ["r1", "r2", "r3"]), "nom"]],
    "HAL-14": [["Round do half", seq("HAL-14", ["r1", "r2", "r3"]), "nom"]],
    "HAL-15": [["Round do half", seq("HAL-15", ["r1", "r2", "r3"]), "nom"]],
    "AGT-04": [["Função repetida", seq("AGT-04", ["Duelista", "Iniciador", "Controlador", "Sentinela"]), "nom"]],
    "LEV-11": [["Fase do half", seq("LEV-11", ["abertura do half", "meio do half", "fim do half", "prorrogação"]), "ord"]],
    "LEV-18": [["Faixa de pressão", seq("LEV-18", ["Q1 (menor pressão)", "Q2", "Q3", "Q4 (maior pressão)"]), "ord"]],
    "LEV-14": [["Situação", seq("LEV-14", ["pós-plant (ataque)", "retake (defesa)"]), "nom"]],
  };
  // tipo de round (pistol × demais) em todas as métricas de first blood; Momento do FB mantém o recorte fez/sofreu
  CUTS["OPN-04"] = [["Fez ou sofreu", seq("OPN-04", ["fez", "sofreu"]), "nom"]];
  for (const id of ["OPN-01", "OPN-02", "OPN-03", "OPN-04", "OPN-07", "OPN-10", "OPN-12", "OPN-13", "OPN-14", "OPN-15"])
    CUTS[id] = [...(CUTS[id] || []), ["Tipo de round", seq(id, ["rt_pistol", "rt_demais"]), "nom"]];
  // recorte aberto por padrão na aba Recortes
  const DEFAULT_CUT = { "DYN-12": "Quanto a vantagem durou", "DYN-13": "Quanto levou para sair", "ECO-13": "Armamento", "OPN-15": "No duelo, o time",
                        "DYN-11": "Desfecho", "RET-12": "Tentativa", "HAL-02": "Half", "HAL-03": "Half", "HAL-18": "Half", "HAL-04": "Caminho r1–r2", "HAL-13": "Round do half",
                        "HAL-14": "Round do half", "HAL-15": "Round do half", "AGT-04": "Função repetida",
                        "LEV-11": "Fase do half", "LEV-18": "Faixa de pressão", "LEV-14": "Situação" };
  // Abas de cada métrica, na ordem em que aparecem (a primeira abre por padrão). Padrão: evolução + recortes.
  const VIEWS = {
    "DYN-09": ["states", "cuts", "evo"], "DYN-10": ["states", "cuts", "evo"],
    "DYN-03": ["cuts", "evo"], "DYN-11": ["cuts", "evo"],
    "DYN-12": ["cuts", "mapresult", "evo"], "DYN-13": ["cuts", "mapresult", "evo"],
    "ECO-13": ["cuts", "evo"], "ECO-09": ["cuts", "evo"], "ECO-10": ["evo", "mapresult", "cuts"],
    "OPN-13": ["evo", "fbplayers", "cuts"], "OPN-14": ["evo", "fbplayers", "cuts"], "OPN-15": ["cuts", "evo"],
    "TRD-13": ["cuts", "evo"], "TRD-14": ["cuts", "pdeaths", "deaths", "evo"],
    "OPN-01": ["evo", "fbplayers", "cuts", "fbtime"], "OPN-03": ["evo", "fbplayers", "cuts"], "OPN-07": ["evo", "fbplayers", "cuts"],
    "OPN-12": ["evo", "fbplayers", "cuts"], "OPN-04": ["fbtime", "evo", "cuts"],
    "TRD-01": ["cuts", "evo"], "TRD-03": ["evo", "players", "cuts"], "TRD-05": ["players", "evo"], "TRD-02": ["tradetime", "evo", "cuts"],
    "TRD-07": ["evo", "players", "deaths", "cuts"], "TRD-08": ["cuts", "pdeaths", "deaths", "evo"], "TRD-09": ["evo", "deaths", "cuts"],
    "SPC-02": ["evo", "deaths", "cuts"], "SPC-03": ["evo", "deaths", "cuts"], "SPC-04": ["evo", "deaths", "cuts"],
    "POS-01": ["sites", "cuts", "evo"], "POS-03": ["cuts", "evo", "planttime"], "POS-04": ["cuts", "evo"], "POS-07": ["cuts", "evo"], "POS-13": ["cuts", "evo"], "POS-14": ["cuts", "evo"], "RET-11": ["cuts", "evo"], "RET-12": ["cuts", "evo"], "RET-01": ["retmap", "evo", "cuts"],
    "ECO-01": ["loadout", "evo", "cuts"], "ECO-02": ["loadout", "evo", "cuts"], "ECO-07": ["loadout", "evo", "cuts"], "ECO-08": ["buymatrix", "cuts", "evo"],
    "KEY-01": ["pistolsites", "cuts", "evo"], "KEY-15": ["ecosites", "cuts", "evo"], "KEY-06": ["antiecosites", "cuts", "evo"],
    "KEY-09": ["forcesites", "cuts", "evo"], "KEY-16": ["armadosites", "cuts", "evo"], "KEY-02": ["pistols", "evo", "cuts"], "KEY-03": ["pistols", "evo", "cuts"], "KEY-11": ["cuts", "evo"],
    "DYN-01": ["curve", "evo", "cuts"], "DYN-02": ["curve", "evo", "cuts"], "DYN-08": ["consistency"],
    "HAL-04": ["cuts", "evo"], "HAL-13": ["cuts", "evo"], "HAL-14": ["cuts", "evo"], "HAL-15": ["cuts", "evo"], "HAL-18": ["cuts"],
    "AGT-04": ["cuts", "evo"],
  };
  const VIEW_LBL = { evo: "Evolução", cuts: "Recortes", fbtime: "Quando acontece", fbplayers: "Quem abre", players: "Por jogador", tradetime: "Tempo do trade",
                     deaths: "Mapa de mortes", plants: "Mapa de plants", planttime: "Quando planta", retmap: "Mapa de plants sofridos", loadout: "Round a round",
                     buymatrix: "Matriz de compras", pistols: "Pistols", curve: "Curva de saldo", consistency: "Consistência", how: "Como é calculada",
                     states: "Situações", mapresult: "Mapas vencidos × perdidos", pdeaths: "Por jogador", sites: "Por site", pistolsites: "Onde ganha", ecosites: "Onde ganha", antiecosites: "Onde ganha", forcesites: "Onde ganha", armadosites: "Onde ganha" };
  const OVERVIEW = [["OPN-01"], ["OPN-02"], ["TRD-01"], ["POS-01"], ["RET-01"], ["KEY-01"]];
  // seções do painel: lista explícita de métricas (6 categorias do time); cada métrica está em uma seção só
  const SEC_IDS = Object.fromEntries(D.sections.filter((s) => s.ids).map((s) => [s.id, s.ids]));
  const SECTION_OF = (id) => D.sections.find((s) => s.ids && s.ids.includes(id))?.id;

  // ------------------------------------------------------------------ índices globais
  const teamMatches = D.teams.map(() => []);
  for (let i = 0; i < nM; i++) { teamMatches[M.red[i]].push(i); teamMatches[M.blue[i]].push(i); }
  const tmByTeam = D.teams.map(() => []);
  for (let i = 0; i < D.TM.t.length; i++) tmByTeam[D.TM.t[i]].push(i);
  const LGI = new Map();
  for (let i = 0; i < D.LG.k.length; i++) { const key = D.LG.k[i] + "|" + D.LG.s[i]; (LGI.get(key) || LGI.set(key, []).get(key)).push(i); }
  const AG = new Map();
  for (let i = 0; i < D.AG.k.length; i++) AG.set(D.AG.t[i] + "|" + D.AG.k[i] + "|" + D.AG.s[i], { v: D.AG.v[i], d: D.AG.d[i] });
  const byMatch = (T, n) => { const a = Array.from({ length: nM }, () => []); for (let i = 0; i < n; i++) a[T.m[i]].push(i); return a; };
  const R_by_m = byMatch(D.R, D.R.m.length);
  const K_by_m = byMatch(D.K, D.K.m.length);
  const P_by_m = byMatch(D.P, D.P.m.length);
  const sideOf = new Map();
  for (let i = 0; i < D.R.m.length; i++) sideOf.set(D.R.m[i] + "|" + D.R.r[i] + "|" + D.R.t[i], D.R.sd[i]);
  const matchesByMap = {};
  for (let i = 0; i < nM; i++) (matchesByMap[M.map[i]] = matchesByMap[M.map[i]] || []).push(i);

  // ------------------------------------------------------------------ utilidades
  const $ = (s, el = document) => el.querySelector(s);
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "checked" || k === "value") e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return e;
  }
  const NF0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const NF1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const NF2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const NF3 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const prettyTeam = (n) => n.replace(/_/g, " ");
  const fmtDate = (s) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(2, 4) : "";
  const range = (a, b) => { const r = []; for (let i = a; i < b; i++) r.push(i); return r; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const lbl = (m) => (L[m.id] ? L[m.id][0] : m.name);
  const question = (m) => (L[m.id] ? L[m.id][1] : m.use);
  const denUnit = (m) => (L[m.id] ? L[m.id][2] : "eventos");

  function kind(m) {
    const u = (m.unit || "").toLowerCase();
    if (u.includes("taxa") || u.includes("proporção")) return "pct";
    if (u === "segundos") return "sec";
    if (u === "cm") return "m";
    if (u === "créditos") return "cred";
    if (u.includes("round típico")) return "x";
    if (u === "pp" || u.startsWith("pp ")) return "pp";
    return "num";
  }
  const SIGNED = new Set(["ECO-07", "POS-04", "RET-11", "LEV-16", "LEV-17"]);
  function fmt(m, v) {
    if (v == null || !isFinite(v)) return "—";
    if (SIGNED.has(m.id) && v > 0) return "+" + fmt({ ...m, id: "" }, v);
    switch (kind(m)) {
      case "pct": return NF0.format(v * 100) + "%";
      case "sec": return NF1.format(v) + " s";
      case "m": return NF1.format(v / 100) + " m";
      case "cred": return NF0.format(v);
      case "x": return NF2.format(v) + "×";
      case "pp": { const a = v * 100; return (a > 0.05 ? "+" : a < -0.05 ? "−" : "") + NF1.format(Math.abs(a)) + " pp"; }
      default: return Math.abs(v) >= 100 ? NF0.format(v) : NF2.format(v);
    }
  }
  // números absolutos ao lado do valor: "7 de 9 plants" (taxas) ou "em 9 plants" (médias)
  function absText(m, o) {
    if (o && o.cmp && o.cmp[0] && o.cmp[0].d) return `${NF0.format(100 * o.cmp[0].v)}% trocadas · esperado ${NF0.format(100 * o.cmp[1].v)}% · ${NF0.format(o.cmp[0].d)} ${denUnit(m)}`;
    if (o && o.raw && o.raw.d) {  // métricas ponderadas pela pressão: contagens reais + a mesma medida sem peso
      const r = o.raw;
      return (kind(m) === "pct" ? `${NF0.format(Math.round(r.n))} de ${NF0.format(r.d)} ${denUnit(m)}` : `em ${NF0.format(r.d)} ${denUnit(m)}`) + ` · sem peso ${fmt(m, r.v)}`;
    }
    if (o && o.parts) return o.parts[0].v == null || o.parts[1].v == null ? "" : `2º half ${fmt(m, o.parts[0].v)} · 1º half ${fmt(m, o.parts[1].v)}`;
    if (!o || !o.d) return "";
    if (kind(m) === "pct") return `${NF0.format(Math.round(o.n))} de ${NF0.format(o.d)} ${denUnit(m)}`;
    return `em ${NF0.format(o.d)} ${denUnit(m)}`;
  }
  const absShort = (m, o) => (o && o.raw && o.raw.d ? (kind(m) === "pct" ? `${NF0.format(Math.round(o.raw.n))}/${NF0.format(o.raw.d)}` : `n ${NF0.format(o.raw.d)}`) : !o || !o.d ? "" : kind(m) === "pct" ? `${NF0.format(Math.round(o.n))}/${NF0.format(o.d)}` : `n ${NF0.format(o.d)}`);
  const fmtHead = (m, v) => (DIFF[m.id] ? fmtDelta(m, v) : fmt(m, v));
  function fmtDelta(m, d) {
    if (d == null || !isFinite(d)) return "";
    const zero = { pct: 0.005, sec: 0.05, m: 5, cred: 0.5 }[kind(m)] ?? 0.005;
    const s = Math.abs(d) < zero ? "±" : d > 0 ? "+" : "−";
    const a = Math.abs(d);
    switch (kind(m)) {
      case "pct": return s + NF0.format(a * 100) + " pp";
      case "sec": return s + NF1.format(a) + " s";
      case "m": return s + NF1.format(a / 100) + " m";
      case "cred": return s + NF0.format(a);
      case "x": return s + NF2.format(a) + "×";
      case "pp": return s + NF1.format(a * 100) + " pp";
      default: return s + (a >= 100 ? NF0.format(a) : NF2.format(a));
    }
  }
  function deltaClass(m, d) {
    if (d == null || !isFinite(d) || m.pol === 0) return "d-neu";
    if (Math.abs(d) < (kind(m) === "pct" ? 0.005 : kind(m) === "pp" ? 0.0005 : 1e-9)) return "d-neu";
    return d * m.pol > 0 ? "d-good" : "d-bad";
  }
  const pctTop = (vals) => { const mx = d3.max(vals.filter((v) => v != null)) || 0; return mx > 0.6 ? 1 : Math.max(0.1, Math.ceil(mx * 1.25 * 10) / 10); };

  const tip = $("#tip");
  function showTip(ev, html) {
    tip.innerHTML = html; tip.hidden = false;
    const pad = 12, w = tip.offsetWidth, hgt = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y + hgt > window.innerHeight - 8) y = ev.clientY - hgt - pad;
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  const tipOn = (sel, html) => sel.on("mousemove", (ev) => showTip(ev, typeof html === "function" ? html() : html)).on("mouseleave", hideTip);

  // ------------------------------------------------------------------ estado
  const state = {
    team: 0, pos: 0, section: "home", dscope: "todas", dwin: Math.round(D.cfg.trade_window_s) || 4, dfund: "trade", dfb: "fb_open", dmore: {}, pat: null, rv: null, pdim: null,
    side: "all", show: { team: true, league: true }, sameMap: false, scope: "all",
    open: {}, view: {}, cut: {}, more: {}, phase: -1, lines: false, pistAll: false,
    levScope: "todas", levCmp: "map", levLS: "match", levOrd: "cost", evOrd: "peso", halScope: "todas", halMap: null, adim: {}, rvr: null, revOrd: "cost", revScope: "match",
  };
  const PREF_KEYS = ["side", "show", "sameMap", "scope", "levCmp"], PREF_STORE = "rrx-prefs-v4";
  try { const p = JSON.parse(localStorage.getItem(PREF_STORE) || "{}"); for (const k of PREF_KEYS) if (p[k] != null) state[k] = p[k]; } catch (e) { /* sem storage */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_STORE, JSON.stringify(Object.fromEntries(PREF_KEYS.map((k) => [k, state[k]])))); } catch (e) { /* ok */ } };

  let T = null;
  function buildTeam(t) {
    const ms = teamMatches[t];
    const pos = new Map(ms.map((m, i) => [m, i]));
    const ks = new Map();
    for (const i of tmByTeam[t]) {
      const key = D.TM.k[i] + "|" + D.TM.s[i];
      let e = ks.get(key);
      if (!e) { e = { k: D.TM.k[i], s: D.TM.s[i], n: [new Array(ms.length).fill(0), new Array(ms.length).fill(0)], d: [new Array(ms.length).fill(0), new Array(ms.length).fill(0)] }; ks.set(key, e); }
      const p = pos.get(D.TM.m[i]), sd = D.TM.sd[i];
      e.n[sd][p] += D.TM.n[i]; e.d[sd][p] += D.TM.d[i];
    }
    return { t, ms, pos, ks };
  }
  const curMatch = () => T.ms[state.pos];
  const curMap = () => M.map[curMatch()];
  const opp = (m, t) => (M.red[m] === t ? M.blue[m] : M.red[m]);
  const scoreOf = (m, t) => (M.red[m] === t ? [M.rs[m], M.bs[m]] : [M.bs[m], M.rs[m]]);
  const sideOk = (sd, side = state.side) => side === "all" || (side === "atk" ? sd === 0 : sd === 1);

  // ------------------------------------------------------------------ motor de estatísticas
  // o = { side?, map? } sobrescreve os filtros globais (usado nos recortes por lado/mapa)
  const optSide = (o) => o.side ?? state.side;
  const optMap = (o) => (o.map !== undefined ? o.map : state.sameMap ? curMap() : null);
  function strataOf(id) {
    const k = MI[id]; const out = [];
    for (const e of T.ks.values()) if (e.k === k) out.push(S[e.s]);
    return out;
  }
  function headStrata(id) {
    if (HEAD[id]) return HEAD[id];
    const ss = strataOf(id);
    if (!ss.length || ss.includes("")) return [""];
    return ss; // soma de todos os estratos (cada evento cai em um só)
  }
  function sumE(entries, ps, side) {
    let n = 0, d = 0, nm = 0;
    for (const p of ps) {
      let pd = 0;
      for (const e of entries) {
        if (side !== "def") { n += e.n[0][p]; d += e.d[0][p]; pd += e.d[0][p]; }
        if (side !== "atk") { n += e.n[1][p]; d += e.d[1][p]; pd += e.d[1][p]; }
      }
      if (pd) nm++;
    }
    return { v: d > 0 ? n / d : null, n, d, nm };
  }
  const teamPositions = (map) => range(0, T.ms.length).filter((p) => !map || M.map[T.ms[p]] === map);
  function leagueSum(k, sList, side, map) {
    let n = 0, d = 0;
    const mp = map ? MAPI[map] : null;
    for (const s of sList) {
      const rows = LGI.get(k + "|" + (SI[s] ?? -1)); if (!rows) continue;
      for (const i of rows) {
        if (!sideOk(D.LG.sd[i], side)) continue;
        if (mp != null && D.LG.mp[i] !== mp) continue;
        n += D.LG.n[i]; d += D.LG.d[i];
      }
    }
    return d > 0 ? { v: n / d, n, d } : null;
  }
  function stat(id, sList, o = {}) {
    if (sList == null && DIFF[id]) {
      const a = stat(id, [DIFF[id][0]], o), b = stat(id, [DIFF[id][1]], o);
      const comb = (x, y) => (x && y ? { v: x.v != null && y.v != null ? x.v - y.v : null, n: x.n + y.n, d: Math.min(x.d, y.d), nm: x.nm, parts: [x, y] } : null);
      return { entries: a.entries.concat(b.entries), match: comb(a.match, b.match), team: comb(a.team, b.team), league: comb(a.league, b.league) };
    }
    sList = sList ?? headStrata(id);
    const k = MI[id], side = MAPLEVEL.has(id) ? "all" : optSide(o), map = optMap(o);
    const entries = sList.map((s) => T.ks.get(k + "|" + (SI[s] ?? -1))).filter(Boolean);
    const league = leagueSum(k, sList, side, map);
    const empty = { v: null, n: 0, d: 0, nm: 0 };
    if (!entries.length) return { entries, match: empty, team: empty, league };
    const inMap = !map || M.map[curMatch()] === map;
    const res = { entries, match: inMap ? sumE(entries, [state.pos], side) : empty,
                  team: sumE(entries, teamPositions(map), side), league };
    if (COMPANION[id] && !o._raw && sList.length === 1 && sList[0] === "") {
      const [a, b] = COMPANION[id].map((s) => stat(id, [s], { ...o, _raw: true }));
      res.match = { ...res.match, cmp: [a.match, b.match] }; res.team = { ...res.team, cmp: [a.team, b.team] };
      if (res.league) res.league = { ...res.league, cmp: [a.league, b.league] };
    }
    if (WEIGHTED.has(id) && !o._raw) {  // ponderadas pela pressão: anexa o mesmo recorte sem peso (denominador real)
      const r = stat(id, sList.map(rawS), { ...o, _raw: true });
      res.match = { ...res.match, raw: r.match }; res.team = { ...res.team, raw: r.team };
      if (res.league) res.league = { ...res.league, raw: r.league };
    }
    return res;
  }
  const WEIGHTED = new Set(["LEV-08", "LEV-09", "LEV-12", "LEV-13", "LEV-14", "LEV-15"]);
  // métricas "observado − esperado": guardam as duas taxas como estratos e o painel mostra ambas ao lado da diferença
  const COMPANION = {};
  const rawS = (s) => (s === "" ? "bruto" : "bruto|" + s);
  // referências de comparação: média do time (todas as partidas da equipe) e liga (todas as equipes)
  function refs() {
    const out = [], mp = state.sameMap ? " em " + curMap() : "";
    if (state.show.team) out.push({ key: "team", label: "Média do time" + mp, short: "time", color: "--teamavg" });
    if (state.show.league) out.push({ key: "league", label: "Liga" + mp, short: "liga", color: "--ref" });
    return out;
  }
  const deltaRef = () => refs()[0] || null;

  // ------------------------------------------------------------------ hash
  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    const t = D.teams.indexOf(q.get("t"));
    if (t >= 0) state.team = t;
    T = buildTeam(state.team);
    const m = M.id.indexOf(q.get("m"));
    state.pos = m >= 0 && T.pos.has(m) ? T.pos.get(m) : T.ms.length - 1;
    const s = q.get("s");
    if (s && D.sections.some((x) => x.id === s)) state.section = s;
  }
  function writeHash() {
    const q = new URLSearchParams({ t: D.teams[state.team], m: M.id[curMatch()], s: state.section });
    try { history.replaceState(null, "", "#" + q.toString()); } catch (e) { /* página publicada */ }
  }

  // ------------------------------------------------------------------ cabeçalho e filtros
  const selTeam = $("#sel-team"), selMatch = $("#sel-match");
  function fillTeams() {
    const order = D.teams.map((n, i) => i).sort((a, b) => D.teams[a].localeCompare(D.teams[b]));
    selTeam.replaceChildren(...order.map((i) => h("option", { value: String(i) }, `${prettyTeam(D.teams[i])} (${teamMatches[i].length})`)));
    selTeam.value = String(state.team);
  }
  function fillMatches() {
    selMatch.replaceChildren(...T.ms.map((m, p) => {
      const [a, b] = scoreOf(m, state.team);
      return h("option", { value: String(p) }, `#${p + 1} · ${fmtDate(M.date[m])} · ${M.map[m]} · vs ${prettyTeam(D.teams[opp(m, state.team)])} · ${a}–${b} ${a > b ? "V" : "D"}`);
    }));
    selMatch.value = String(state.pos);
    $("#prev-match").disabled = state.pos === 0;
    $("#next-match").disabled = state.pos === T.ms.length - 1;
  }
  selTeam.addEventListener("change", () => { state.team = +selTeam.value; state.pat = null; state.rv = null; T = buildTeam(state.team); state.pos = T.ms.length - 1; fillMatches(); render(); });
  selMatch.addEventListener("change", () => { state.pos = +selMatch.value; fillMatches(); render(); });
  $("#prev-match").addEventListener("click", () => setPos(state.pos - 1));
  $("#next-match").addEventListener("click", () => setPos(state.pos + 1));
  function setPos(p) { if (p < 0 || p >= T.ms.length) return; state.pos = p; fillMatches(); render(); }
  function setPref(k, v) { state[k] = v; savePrefs(); render(); }

  function seg(options, value, onChange, label) {
    return h("div", { class: "seg", role: "group", "aria-label": label || null },
      options.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(v === value), onclick: () => onChange(v) }, l)));
  }
  function check(id, label, checked, onChange, swatch) {
    return h("label", { class: "chk", for: id }, h("input", { type: "checkbox", id, checked, onchange: (ev) => onChange(ev.target.checked) }),
      swatch ? h("i", { class: "sw", style: `background:var(${swatch})` }) : null, label);
  }
  // filtros de lado e de comparação: ficam junto do conteúdo que eles afetam (tabela de métricas, partida), não no topo
  function filterBar(withCompare = true) {
    return h("div", { class: "tbar", "aria-label": "Filtros" },
      h("div", { class: "fgroup" }, h("span", { class: "flbl" }, "Rounds"),
        seg([["all", "Todos"], ["atk", "Ataque"], ["def", "Defesa"]], state.side, (v) => setPref("side", v), "Lado")),
      withCompare ? h("div", { class: "fgroup" }, h("span", { class: "flbl" }, "Comparar com"),
        check("ck-team", "média do time", state.show.team, (v) => setPref("show", { ...state.show, team: v }), "--teamavg"),
        check("ck-league", "liga", state.show.league, (v) => setPref("show", { ...state.show, league: v }), "--ref"),
        check("ck-map", "só no mapa desta partida", state.sameMap, (v) => setPref("sameMap", v))) : null);
  }
  function renderFilters() { const f = $("#filters"); f.replaceChildren(); f.hidden = true; }
  // navegação lateral agrupada por categoria
  const GROUP_NOTE = { Fundamentos: "padrões recorrentes e rounds para revisar", Vantagem: "numérica e de armamento", "First blood": "abertura do round", "Trade kill": "trocas e cobertura",
                       "Pós-plant": "depois de plantar", Retake: "depois do plant adversário",
                       "Rounds-chave": "pistol, eco, anti-eco, force e armados", Clutches: "clutches, perfeitos, bonus e thrifty", "Início de half": "os 3 primeiros rounds de cada half",
                       "Pressão": "quanto cada round vale para o mapa", "Rounds para revisar": "os rounds que mais mudaram o mapa, com o motivo" };
  const GROUP_ICON = { Fundamentos: "fund", Vantagem: "adv", "First blood": "fb", "Trade kill": "trade", "Pós-plant": "post", Retake: "retake", "Rounds-chave": "key", Clutches: "trophy", "Início de half": "calendar", "Pressão": "gauge", "Rounds para revisar": "film" };
  const ITEM_ICON = { home: "home", overview: "match" };
  function renderSide() {
    const groups = d3.groups(D.sections.filter((s) => s.group !== "Diagnóstico"), (s) => s.group);
    const go = (id) => () => { state.section = id; state.pat = null; state.rv = null; state.rvr = null; state.rvrFrom = null; render(); window.scrollTo({ top: 0 }); };
    const cur = state.section === "diag" ? (state.patFrom || "home") : state.section;
    let firstCat = true;
    $("#side").replaceChildren(...groups.flatMap(([g, items]) => {
      const isStart = g === "Início";
      const head = isStart ? null : h("div", { class: "side-h", title: GROUP_NOTE[g] || null }, GROUP_ICON[g] ? icon(GROUP_ICON[g]) : null, h("span", null, g));
      const sup = !isStart && g !== "Fundamentos" && firstCat ? (firstCat = false, h("div", { class: "side-super" }, "Explorar métricas")) : null;
      // categoria com uma seção só e mesmo nome (Pós-plant, Retake): o próprio item vira a entrada da categoria
      if (!isStart && items.length === 1 && items[0].label === g)
        return [sup, h("div", { class: "side-group solo" }, h("button", { class: "side-item", type: "button", title: GROUP_NOTE[g] || null,
          "aria-current": cur === items[0].id ? "page" : null, onclick: go(items[0].id) }, icon(GROUP_ICON[g]), g))];
      return [sup, h("div", { class: "side-group" + (isStart ? " start" : g === "Fundamentos" ? " fund" : "") }, head,
        items.map((s) => h("button", { class: "side-item", type: "button", "aria-current": cur === s.id ? "page" : null, onclick: go(s.id) },
          ITEM_ICON[s.id] ? icon(ITEM_ICON[s.id]) : null, s.label)))];
    }).filter(Boolean));
    const side = $("#side"), curEl = side.querySelector('[aria-current="page"]');
    if (curEl && side.scrollWidth > side.clientWidth + 4) {
      const l = curEl.offsetLeft - side.offsetLeft, r = l + curEl.offsetWidth;
      if (l < side.scrollLeft || r > side.scrollLeft + side.clientWidth) side.scrollLeft = Math.max(0, l - 40);
    }
  }

  // ------------------------------------------------------------------ blocos genéricos
  const drawers = [];
  function chartBox(height, draw) {
    const box = h("div", { class: "chart" });
    const run = () => {
      if (!box.isConnected || box.offsetParent === null) return;
      const w = Math.max(240, box.clientWidth || 600);
      const hh = typeof height === "function" ? height(w) : height;
      box.replaceChildren();
      const svg = d3.select(box).append("svg").attr("viewBox", `0 0 ${w} ${hh}`).attr("width", "100%").attr("preserveAspectRatio", "xMinYMin meet");
      draw(svg, w, hh);
    };
    drawers.push(run);
    return box;
  }
  function panel(title, sub, ...kids) {
    return h("section", { class: "panel" }, title ? h("div", { class: "panel-head" }, h("div", null, h("h2", null, title), sub ? h("p", { class: "sub" }, sub) : null)) : null, ...kids);
  }
  const scopeSeg = () => seg([["match", "Esta partida"], ["all", "Todas as partidas"]], state.scope, (v) => setPref("scope", v), "Partidas");
  function scopeMatches(sameMap) {
    let list = state.scope === "match" ? [curMatch()] : T.ms.slice();
    if (sameMap) list = list.filter((m) => M.map[m] === curMap());
    return list;
  }
  const sideNote = () => (state.side === "all" ? "" : ` · só rounds de ${state.side === "atk" ? "ataque" : "defesa"}`);
  const legendRow = (items) => h("div", { class: "legend" }, items.map(([label, color, cls]) => h("span", null, h("i", { class: cls || "", style: cls === "dash" ? "" : `background:var(${color})` }), label)));

  // ------------------------------------------------------------------ recortes: tabela (categorias sem ordem) ou linha (escala ordenada)
  // rows = [{ label, m, st }] com st = stat(...)
  function domainOf(m, vals) {
    const pct = kind(m) === "pct";
    const mn = Math.min(0, d3.min(vals) ?? 0), mx = Math.max(0, d3.max(vals) ?? 0);
    const lo = pct ? mn : mn * 1.1;
    const hi = pct ? pctTop(vals) : mx > 0 ? mx * 1.1 : mn < 0 ? 0 : 1;
    return [lo, hi];
  }
  function stripSvg(f, marks) {
    const W = 132, H = 18, X = (v) => 5 + Math.max(0, Math.min(1, f(v))) * (W - 10);
    let out = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><line x1="5" x2="${W - 5}" y1="9" y2="9" style="stroke:var(--line)" stroke-width="2" stroke-linecap="round"/>`;
    for (const k of marks) {
      if (k.v == null) continue;
      const x = X(k.v);
      if (k.type === "dot") out += `<circle cx="${x}" cy="9" r="5" style="fill:var(${k.color});stroke:var(--panel)" stroke-width="1.5"/>`;
      else out += `<rect x="${x - 1.5}" y="${k.type === "tick" ? 2 : 4}" width="3" height="${k.type === "tick" ? 14 : 10}" rx="1" style="fill:var(${k.color})" ${k.type === "thin" ? 'fill-opacity=".85"' : ""}/>`;
    }
    return out + "</svg>";
  }
  function cutsTable(rows) {
    const m0 = rows[0].m, rs = refs();
    const vals = rows.flatMap((r) => [r.st.match.v, ...rs.map((x) => r.st[x.key]?.v)]).filter((v) => v != null);
    const [lo, hi] = domainOf(m0, vals), f = (v) => (v - lo) / ((hi - lo) || 1);
    const cell = (o, withN = true) => (o && o.v != null
      ? h("td", { class: "num" }, fmt(m0, o.v), withN ? h("span", { class: "n" }, " " + absShort(m0, o)) : null)
      : h("td", { class: "num mut" }, "—"));
    const body = rows.map((r) => {
      const strip = h("td", { class: "strip" });
      strip.innerHTML = stripSvg(f, [...rs.map((x) => ({ v: r.st[x.key]?.v, color: x.color, type: x.key === "team" ? "tick" : "thin" })), { v: r.st.match.v, color: "--accent", type: "dot" }]);
      return h("tr", null, h("td", null, r.label), cell(r.st.match), rs.map((x) => cell(r.st[x.key], x.key === "team")), strip);
    });
    return h("div", null,
      h("div", { class: "tbl-wrap" }, h("table", { class: "mt cuts" },
        h("thead", null, h("tr", null, h("th", null, ""), h("th", { class: "num" }, h("i", { class: "sw", style: "background:var(--accent);border-radius:50%" }), "Esta partida"),
          rs.map((x) => h("th", { class: "num" }, h("i", { class: "sw", style: `background:var(${x.color})` }), x.key === "team" ? "Time" : "Liga")),
          h("th", { class: "strip" }, `${fmt(m0, lo)} → ${fmt(m0, hi)}`))),
        h("tbody", null, body))),
      h("p", { class: "note" }, kind(m0) === "pct" ? "Números pequenos ao lado = eventos (ex.: 7/9). Na faixa: ● esta partida, traço grosso = média do time, traço fino = liga." : "n = nº de eventos. Na faixa: ● esta partida, traço grosso = média do time, traço fino = liga."));
  }
  function ordinalChart(rows, o = {}) {
    const m0 = rows[0].m, rs = refs();
    const unit = o.unit || denUnit(m0);
    const box = chartBox(240, (svg, w, hh) => {
      const mg = { t: 12, r: 12, b: o.xTitle ? 52 : 40, l: 44 };
      const x = d3.scalePoint().domain(rows.map((r, i) => i)).range([mg.l + 18, w - mg.r - 18]);
      const vals = rows.flatMap((r) => [r.st.match.v, ...rs.map((k) => r.st[k.key]?.v)]).filter((v) => v != null);
      const y = d3.scaleLinear().domain(domainOf(m0, vals)).nice().range([hh - mg.b, mg.t]);
      svg.append("g").attr("class", "grid-line").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - mg.l - mg.r)).tickFormat(""));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => fmt(m0, v)));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${hh - mg.b})`).call(d3.axisBottom(x).tickFormat((i) => rows[i].label).tickSizeOuter(0));
      rows.forEach((r, i) => svg.append("text").attr("class", "lbl-m").style("font-size", "10px").attr("x", x(i)).attr("y", hh - mg.b + 30).attr("text-anchor", "middle")
        .text(r.st.team.d ? `n ${NF0.format(r.st.team.d)}` : ""));
      if (o.xTitle) svg.append("text").attr("class", "lbl-m").attr("x", (mg.l + w - mg.r) / 2).attr("y", hh - 4).attr("text-anchor", "middle").text(o.xTitle);
      const tipFor = (r) => `<b>${esc(r.label)}</b><br>esta partida: ${r.st.match.v == null ? "—" : `<b>${esc(fmt(r.m, r.st.match.v))}</b> (${esc(absText(r.m, r.st.match))})`}`
        + rs.map((k) => `<br>${esc(k.label)}: ${esc(fmt(r.m, r.st[k.key]?.v))}${k.key === "team" && r.st.team.d ? ` (${esc(absText(r.m, r.st.team))})` : ""}`).join("");
      rs.forEach((k) => {
        const pts = rows.map((r, i) => ({ i, v: r.st[k.key]?.v, d: r.st[k.key]?.d || 0 }));
        svg.append("path").attr("d", d3.line().defined((p) => p.v != null).x((p) => x(p.i)).y((p) => y(p.v))(pts)).attr("fill", "none")
          .attr("stroke", css(k.color)).attr("stroke-width", k.key === "team" ? 2.2 : 1.6).attr("stroke-dasharray", k.key === "league" ? "6 4" : null);
        if (k.key === "team") pts.forEach((p) => { if (p.v != null) svg.append("circle").attr("cx", x(p.i)).attr("cy", y(p.v)).attr("r", 3).attr("fill", css(k.color)); });
      });
      const dmax = d3.max(rows, (r) => r.st.match.d) || 1;
      rows.forEach((r, i) => {
        const g = svg.append("g");
        g.append("rect").attr("x", x(i) - x.step() / 2).attr("width", x.step()).attr("y", mg.t).attr("height", hh - mg.b - mg.t).attr("fill", "transparent");
        if (r.st.match.v != null) {
          const rad = 4 + 4 * Math.sqrt(r.st.match.d / dmax);
          g.append("circle").attr("cx", x(i)).attr("cy", y(r.st.match.v)).attr("r", rad).attr("fill", css("--accent")).attr("fill-opacity", .9).attr("stroke", css("--panel")).attr("stroke-width", 1.5);
          if (x.step() > 46) g.append("text").attr("class", "lbl-v").style("font-weight", 500).attr("x", x(i) + rad + 4).attr("y", y(r.st.match.v) + 3.5).text(absShort(r.m, r.st.match));
        }
        tipOn(g, tipFor(r));
      });
    });
    return h("div", null, legendRow([[`esta partida (maior = mais ${unit})`, "--accent"], ...rs.map((k) => [k.label, k.color, k.key === "league" ? "dash" : "line"])]), box,
      h("p", { class: "note" }, "n = eventos da equipe em cada ponto (todas as partidas). Passe o mouse para ver os números."));
  }

  // ------------------------------------------------------------------ evolução partida a partida (pontos: tamanho = nº de eventos)
  function evolutionChart(id) {
    const m = METRICS[MI[id]], k = MI[id];
    const entries = headStrata(id).map((s) => T.ks.get(k + "|" + (SI[s] ?? -1))).filter(Boolean);
    if (!entries.length) return h("div", { class: "empty" }, "A equipe não tem dados desta métrica.");
    const st = stat(id), rs = refs();
    const n = T.ms.length, side = MAPLEVEL.has(id) ? "all" : state.side, mp = state.sameMap ? curMap() : null;
    const box = chartBox(220, (svg, w, hh) => {
      const mg = { t: 12, r: 12, b: 26, l: 46 };
      const rawEnt = WEIGHTED.has(id) ? headStrata(id).map((s) => T.ks.get(k + "|" + (SI[rawS(s)] ?? -1))).filter(Boolean) : null;
      const vals = range(0, n).map((p) => { if (mp && M.map[T.ms[p]] !== mp) return null; const o = sumE(entries, [p], side); if (rawEnt) o.raw = sumE(rawEnt, [p], side); return o.d ? o : null; });
      const all = vals.filter(Boolean).map((o) => o.v).concat(rs.map((r) => st[r.key]?.v)).filter((v) => v != null);
      const x = d3.scalePoint().domain(range(0, n)).range([mg.l + 8, w - mg.r - 8]);
      const y = d3.scaleLinear().domain(domainOf(m, all)).nice().range([hh - mg.b, mg.t]);
      const dmax = d3.max(vals.filter(Boolean), (o) => o.d) || 1;
      svg.append("g").attr("class", "grid-line").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - mg.l - mg.r)).tickFormat(""));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => fmt(m, v)));
      const every = Math.ceil(n / Math.max(1, Math.floor((w - 60) / 34)));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${hh - mg.b})`).call(d3.axisBottom(x).tickFormat((i) => (i % every === 0 || i === state.pos ? "#" + (i + 1) : "")).tickSizeOuter(0));
      rs.forEach((r) => { const v = st[r.key]?.v; if (v != null) svg.append("line").attr("x1", mg.l).attr("x2", w - mg.r).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", css(r.color)).attr("stroke-width", r.key === "team" ? 2 : 1.5).attr("stroke-dasharray", r.key === "league" ? "6 4" : null); });
      svg.append("path").attr("d", d3.line().defined((o) => o).x((o, i) => x(i)).y((o) => y(o.v))(vals)).attr("fill", "none").attr("stroke", css("--faint")).attr("stroke-opacity", .45);
      vals.forEach((o, i) => {
        const mt = T.ms[i]; const [a, b] = scoreOf(mt, state.team);
        const g = svg.append("g").style("cursor", "pointer").on("click", () => setPos(i));
        g.append("rect").attr("x", x(i) - x.step() / 2).attr("width", x.step()).attr("y", mg.t).attr("height", hh - mg.b - mg.t).attr("fill", "transparent");
        tipOn(g, `<b>#${i + 1} · ${esc(fmtDate(M.date[mt]))} · ${esc(M.map[mt])}</b><br>vs ${esc(prettyTeam(D.teams[opp(mt, state.team)]))} · ${a}–${b}<br>${o ? `<b>${esc(fmt(m, o.v))}</b> <span class="t-mut">(${esc(absText(m, o))})</span>` : "sem eventos"}<br><span class="t-mut">clique para abrir esta partida</span>`);
        if (!o) return;
        const sel = i === state.pos;
        g.append("circle").attr("cx", x(i)).attr("cy", y(o.v)).attr("r", (sel ? 2 : 0) + 2.5 + 4 * Math.sqrt(o.d / dmax))
          .attr("fill", sel ? css("--accent") : css("--faint")).attr("fill-opacity", sel ? 1 : .75).attr("stroke", css("--panel")).attr("stroke-width", sel ? 2 : 1);
      });
    });
    return h("div", null, legendRow([["cada partida (maior = mais eventos)", "--faint"], ["partida selecionada", "--accent"], ...rs.map((r) => [r.label, r.color, r.key === "league" ? "dash" : "line"])]),
      box, h("p", { class: "note" }, "Clique num ponto para abrir aquela partida." + (mp ? ` Só partidas em ${mp}.` : "")));
  }

  // ------------------------------------------------------------------ recortes (uma dimensão por vez)
  function cutsFor(id) {
    const dims = MAPLEVEL.has(id) ? [] : [["Lado", [{ id, label: "ataque", o: { side: "atk" } }, { id, label: "defesa", o: { side: "def" } }], "nom"]];
    const maps = [...new Set(T.ms.map((m) => M.map[m]))].sort();
    if (maps.length > 1) dims.push(["Mapa", maps.map((mp) => ({ id, label: mp, o: { map: mp } })), "nom"]);
    for (const c of CUTS[id] || []) dims.push(c);
    const own = strataOf(id).filter((s) => s !== "");
    if (!(id in CUTS) && own.length > 1) dims.push(["Categoria", own.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).map((s) => ({ id, s, label: sl(s) })), "nom"]);
    return dims;
  }
  function cutsView(id) {
    const dims = cutsFor(id);
    if (!dims.length) return h("div", { class: "empty" }, "Sem recortes para esta métrica.");
    const cur = Math.min(state.cut[id] ?? Math.max(0, dims.findIndex((d) => d[0] === DEFAULT_CUT[id])), dims.length - 1);
    const [name, items, type] = dims[cur];
    const rows = items.map((it) => ({ label: it.label, m: METRICS[MI[it.id]], st: stat(it.id, it.s != null ? [it.s] : undefined, it.o || {}) }))
      .filter((r) => r.st.entries.length || r.st.league);
    const notes = { Lado: "Ignora o filtro de lado da tabela.", Mapa: "“Esta partida” só aparece no mapa em que foi jogada; ignora o filtro de mapa da tabela." };
    return h("div", null,
      dims.length > 1 ? h("div", { class: "ctl-row" }, h("span", { class: "flbl" }, "Recortar por"), seg(dims.map((d, i) => [i, d[0]]), cur, (v) => { state.cut[id] = v; render(); })) : null,
      !rows.length ? h("div", { class: "empty" }, "Sem dados neste recorte.") : type === "ord" && rows.length >= 4 ? ordinalChart(rows) : cutsTable(rows),
      notes[name] ? h("p", { class: "note" }, notes[name]) : null);
  }

  // ------------------------------------------------------------------ mapa
  const silCache = {};
  function silhouette(mapName) {
    if (silCache[mapName]) return silCache[mapName];
    const pts = [];
    for (const m of matchesByMap[mapName] || []) {
      for (const i of K_by_m[m]) { if (D.K.vx[i] != null) pts.push([D.K.vx[i], D.K.vy[i]]); if (D.K.kx[i] != null) pts.push([D.K.kx[i], D.K.ky[i]]); }
      for (const i of P_by_m[m]) pts.push([D.P.x[i], D.P.y[i]]);
    }
    const xs = pts.map((p) => p[0]).sort(d3.ascending), ys = pts.map((p) => p[1]).sort(d3.ascending);
    const ext = { x: [d3.quantile(xs, 0.002), d3.quantile(xs, 0.998)], y: [d3.quantile(ys, 0.002), d3.quantile(ys, 0.998)] };
    const sites = {};
    for (const m of matchesByMap[mapName] || []) for (const i of P_by_m[m]) (sites[D.P.st[i]] = sites[D.P.st[i]] || []).push([D.P.x[i], D.P.y[i]]);
    const siteC = Object.entries(sites).map(([s, a]) => ({ s, x: d3.median(a, (p) => p[0]), y: d3.median(a, (p) => p[1]) }));
    return (silCache[mapName] = { pts, ext, siteC });
  }
  // mapa oficial (PNG do jogo via valorant-api.com, autorizado pela organização) com a transformação oficial de coordenadas;
  // sem imagem para o mapa, cai na silhueta reconstruída a partir das posições da base
  const MAPIMG = D.MAPIMG || {};
  const imgCache = {};
  function mapImage(name) {
    if (!imgCache[name]) { const im = new Image(); im.src = "data:image/png;base64," + MAPIMG[name].png; imgCache[name] = im; }
    return imgCache[name];
  }
  const CO_SIDE = new Set(["A", "B", "C"]);
  function mapView(mapName, layers, maxH = 460, focus = null) {
    const sil0 = silhouette(mapName);
    // focus = {x:[min,max], y:[min,max]} em unidades do jogo: recorta o mapa em volta do lance
    const sil = focus ? { ...sil0, ext: focus } : sil0;
    const wrap = h("div", { class: "map-wrap" });
    const MI_ = MAPIMG[mapName];
    const run = () => {
      if (!wrap.isConnected || wrap.offsetParent === null) return;
      const w = Math.max(240, wrap.clientWidth || 600), pad = 10;
      let X, Y, hh, drawBg;
      if (MI_) {
        const img = mapImage(mapName);
        if (!img.complete) { img.addEventListener("load", run, { once: true }); }
        const U = (gx, gy) => gy * MI_.xm + MI_.xa, V = (gx) => gx * MI_.ym + MI_.ya;
        const e = sil.ext, m = focus ? 0 : 0.03;
        let u0 = Math.min(U(0, e.y[0]), U(0, e.y[1])) - m, u1 = Math.max(U(0, e.y[0]), U(0, e.y[1])) + m;
        let v0 = Math.min(V(e.x[0]), V(e.x[1])) - m, v1 = Math.max(V(e.x[0]), V(e.x[1])) + m;
        if (!isFinite(u0) || !isFinite(v0)) { u0 = 0; u1 = 1; v0 = 0; v1 = 1; }
        u0 = Math.max(0, u0); v0 = Math.max(0, v0); u1 = Math.min(1, u1); v1 = Math.min(1, v1);
        const rw = u1 - u0, rh = v1 - v0, sc = Math.min((w - 2 * pad) / rw, (maxH - 2 * pad) / rh);
        hh = rh * sc + 2 * pad;
        const ox = (w - 2 * pad - rw * sc) / 2;
        X = (gx, gy) => pad + ox + (U(gx, gy) - u0) * sc;
        Y = (gx) => pad + (V(gx) - v0) * sc;
        drawBg = (ctx) => { if (img.complete && img.naturalWidth) { const N = img.naturalWidth; ctx.drawImage(img, u0 * N, v0 * N, rw * N, rh * N, pad + ox, pad, rw * sc, rh * sc); } };
      } else {
        const rx = sil.ext.y[1] - sil.ext.y[0], ry = sil.ext.x[1] - sil.ext.x[0];
        const sc = Math.min((w - 2 * pad) / rx, (maxH - 2 * pad) / ry);
        hh = ry * sc + 2 * pad;
        const ox = (w - 2 * pad - rx * sc) / 2;
        X = (gx, gy) => pad + ox + (gy - sil.ext.y[0]) * sc;
        Y = (gx) => pad + (sil.ext.x[1] - gx) * sc;
        drawBg = (ctx) => { ctx.fillStyle = css("--silhouette"); for (const [gx, gy] of sil.pts) { ctx.beginPath(); ctx.arc(X(gx, gy), Y(gx), 2.1, 0, 6.283); ctx.fill(); } };
      }
      wrap.style.height = hh + "px";
      wrap.replaceChildren();
      const cv = h("canvas"); const dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr; cv.height = hh * dpr; wrap.append(cv);
      const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr); drawBg(ctx);
      const svg = d3.select(wrap).append("svg").attr("viewBox", `0 0 ${w} ${hh}`);
      const inside = (x, y) => x > 0 && x < w && y > 0 && y < hh;
      if (MI_ && w >= 380) for (const [sup, reg, cx, cy] of MI_.co) {
        const x = X(cx, cy), y = Y(cx); if (!inside(x, y)) continue;
        svg.append("text").attr("class", "callout" + (reg === "Site" ? " site" : "")).attr("x", x).attr("y", y).attr("text-anchor", "middle").attr("dy", ".35em")
          .text(reg === "Site" ? sup : CO_SIDE.has(sup) ? `${sup} ${reg}` : reg);
      }
      for (const Ly of layers) {
        if (Ly.lines) for (const p of Ly.points) if (p.x2 != null) svg.append("line").attr("x1", X(p.x, p.y)).attr("y1", Y(p.x)).attr("x2", X(p.x2, p.y2)).attr("y2", Y(p.x2)).attr("stroke", p.color).attr("stroke-opacity", p.op ?? .35).attr("stroke-width", p.lw ?? 1).attr("stroke-dasharray", p.dash ?? null);
        for (const p of Ly.points) if (!p.noDot) tipOn(svg.append("circle").attr("cx", X(p.x, p.y)).attr("cy", Y(p.x)).attr("r", p.r || 4).attr("fill", p.color).attr("fill-opacity", .9).attr("stroke", css("--panel")).attr("stroke-width", 1.2), p.tip);
      }
      if (!MI_) for (const c of sil.siteC) if (inside(X(c.x, c.y), Y(c.x))) svg.append("text").attr("class", "site-lbl").attr("x", X(c.x, c.y) + 30).attr("y", Y(c.x)).attr("text-anchor", "middle").attr("dy", ".35em").text(c.s);
    };
    drawers.push(run);
    return wrap;
  }
  const mapNote = () => h("p", { class: "note" }, "Mapa oficial do jogo (via valorant-api.com, uso autorizado pela organização), com os nomes oficiais das regiões.");
  function statList(items) { return h("div", { class: "statlist" }, items.map(([l, v, cls]) => h("div", null, h("span", null, l), h("b", { class: cls || "" }, v)))); }
  const scopeBar = (extra) => h("div", { class: "ctl-row" }, h("span", { class: "flbl" }, "Partidas"), scopeSeg(), extra || null);

  // ------------------------------------------------------------------ visões próprias
  function viewFbTime() {
    const t = state.team; const got = [], lost = [];
    for (const m of scopeMatches(false)) for (const i of K_by_m[m]) {
      if (D.K.ph[i] !== 0 || !sideOk(sideOf.get(m + "|" + D.K.r[i] + "|" + t))) continue;
      (D.K.vt[i] === t ? lost : got).push(D.K.t[i]);
    }
    const body = !got.length && !lost.length ? h("div", { class: "empty" }, "Sem first bloods no recorte.") : chartBox(170, (svg, w, hh) => {
      const mg = { t: 8, r: 6, b: 24, l: 32 };
      const bins = d3.bin().domain([0, 120]).thresholds(d3.range(0, 120, 5));
      const bg = bins(got), bl = bins(lost);
      const x = d3.scaleLinear().domain([0, 120]).range([mg.l, w - mg.r]);
      const y = d3.scaleLinear().domain([0, d3.max(bg.concat(bl), (b) => b.length) || 1]).nice().range([hh - mg.b, mg.t]);
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${hh - mg.b})`).call(d3.axisBottom(x).ticks(8).tickFormat((v) => v + " s"));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(3));
      const draw = (bb, col, off) => bb.forEach((b) => {
        const bw = Math.max(0, (x(b.x1) - x(b.x0)) / 2 - 1); if (!bw) return;
        tipOn(svg.append("rect").attr("x", x(b.x0) + off * bw + 1).attr("width", bw).attr("y", y(b.length)).attr("height", y(0) - y(b.length)).attr("fill", col), `${b.x0}–${b.x1} s: <b>${b.length}</b> ${off ? "sofridos" : "feitos"}`);
      });
      draw(bg, css("--accent"), 0); draw(bl, css("--bad"), 1);
    });
    return h("div", null, scopeBar(), legendRow([[`first bloods feitos (${got.length})`, "--accent"], [`sofridos (${lost.length})`, "--bad"]]), body,
      h("p", { class: "note" }, "Segundos de jogo no round, como o JSON registra (timeSinceRoundStartMillis)" + sideNote() + "."));
  }
  // quem faz e quem sofre o first blood (tabela por jogador com barra divergente)
  function viewFbPlayers() {
    const t = state.team, made = new Map(), lost = new Map(), inc = (mp, k) => mp.set(k, (mp.get(k) || 0) + 1);
    let rounds = 0;
    for (const m of scopeMatches(false)) {
      for (const i of R_by_m[m]) if (D.R.t[i] === t && sideOk(D.R.sd[i])) rounds++;
      for (const i of K_by_m[m]) {
        if (D.K.ph[i] !== 0 || !sideOk(sideOf.get(m + "|" + D.K.r[i] + "|" + t))) continue;
        if (D.K.vt[i] === t) inc(lost, D.K.v[i]); else inc(made, D.K.k[i]);
      }
    }
    const ps = [...new Set([...made.keys(), ...lost.keys()])].sort((a, b) => ((made.get(b) || 0) - (lost.get(b) || 0)) - ((made.get(a) || 0) - (lost.get(a) || 0)) || (made.get(b) || 0) - (made.get(a) || 0));
    if (!ps.length) return h("div", null, scopeBar(), h("div", { class: "empty" }, "Sem first bloods no recorte."));
    const totM = d3.sum([...made.values()]), totL = d3.sum([...lost.values()]);
    const mx = d3.max(ps, (p) => Math.max(made.get(p) || 0, lost.get(p) || 0)) || 1;
    const bar = (a, b) => h("td", { class: "dbar-td" }, h("div", { class: "dbar" },
      h("span", { class: "l" }, h("i", { style: `width:${(100 * b) / mx}%` })), h("span", { class: "r" }, h("i", { style: `width:${(100 * a) / mx}%` }))));
    return h("div", null, scopeBar(),
      h("div", { class: "tbl-wrap" }, h("table", { class: "mt fbp" },
        h("thead", null, h("tr", null, h("th", null, "Jogador"), h("th", { class: "num" }, "Fez o FB"), h("th", { class: "num" }, "Foi a 1ª vítima"), h("th", { class: "num" }, "Saldo"),
          h("th", { class: "dbar-td" }, h("span", { class: "d-bad" }, "◀ vítima"), " · ", h("span", { class: "d-good" }, "fez ▶")))),
        h("tbody", null, ps.map((p) => {
          const a = made.get(p) || 0, b = lost.get(p) || 0;
          return h("tr", null, h("td", null, D.players[p] ?? "?"),
            h("td", { class: "num" }, a, h("span", { class: "n" }, totM ? ` · ${NF0.format((100 * a) / totM)}%` : "")),
            h("td", { class: "num" }, b, h("span", { class: "n" }, totL ? ` · ${NF0.format((100 * b) / totL)}%` : "")),
            h("td", { class: "num " + (a > b ? "d-good" : a < b ? "d-bad" : "d-neu") }, (a - b > 0 ? "+" : a - b < 0 ? "−" : "") + Math.abs(a - b)), bar(a, b));
        })),
        h("tfoot", null, h("tr", null, h("td", null, "Time"), h("td", { class: "num" }, totM, h("span", { class: "n" }, ` de ${rounds} rounds`)),
          h("td", { class: "num" }, totL), h("td", { class: "num " + (totM >= totL ? "d-good" : "d-bad") }, (totM - totL > 0 ? "+" : totM - totL < 0 ? "−" : "") + Math.abs(totM - totL)), h("td", null))))),
      h("p", { class: "note" }, "% = participação do jogador nos first bloods do time. Ajuda a ver quem está sendo usado (ou exposto) na abertura" + sideNote() + "."));
  }
  // histograma simples: bins de largura fixa, séries empilhadas
  function stackedHist(series, o) {
    return chartBox(180, (svg, w, hh) => {
      const mg = { t: 8, r: 8, b: 26, l: 32 };
      const bins = d3.range(o.min, o.max, o.step);
      const idx = (v) => Math.min(bins.length - 1, Math.max(0, Math.floor((v - o.min) / o.step)));
      const cnt = series.map((s) => { const c = bins.map(() => 0); s.values.forEach((v) => c[idx(v)]++); return c; });
      const tot = bins.map((b, i) => d3.sum(cnt, (c) => c[i]));
      const x = d3.scaleLinear().domain([o.min, o.max]).range([mg.l, w - mg.r]);
      const y = d3.scaleLinear().domain([0, d3.max(tot) || 1]).nice().range([hh - mg.b, mg.t]);
      svg.append("g").attr("class", "grid-line").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-(w - mg.l - mg.r)).tickFormat(""));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${hh - mg.b})`).call(d3.axisBottom(x).ticks(8).tickFormat((v) => NF1.format(v).replace(",0", "") + " s"));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(3).tickFormat(d3.format("d")));
      bins.forEach((b, i) => {
        let acc = 0;
        const bw = Math.max(1, x(b + o.step) - x(b) - 1.5);
        const g = svg.append("g");
        series.forEach((s, k) => {
          const c = cnt[k][i]; if (!c) return;
          g.append("rect").attr("x", x(b) + 0.75).attr("width", bw).attr("y", y(acc + c)).attr("height", y(acc) - y(acc + c)).attr("fill", css(s.color));
          acc += c;
        });
        if (tot[i]) tipOn(g.append("rect").attr("x", x(b)).attr("width", bw + 1.5).attr("y", mg.t).attr("height", hh - mg.b - mg.t).attr("fill", "transparent"),
          `<b>${NF1.format(b)}–${NF1.format(b + o.step)} s</b>` + series.map((s, k) => `<br>${esc(s.label)}: <b>${cnt[k][i]}</b>`).join("") + (series.length > 1 ? `<br>total: ${tot[i]}` : ""));
      });
    });
  }
  function viewTradeTime() {
    const t = state.team, vals = [];
    for (const m of scopeMatches(false)) for (const i of K_by_m[m]) {
      if (D.K.vt[i] !== t || !D.K.tr[i] || D.K.tt[i] == null || !sideOk(sideOf.get(m + "|" + D.K.r[i] + "|" + t))) continue;
      vals.push(D.K.tt[i]);
    }
    if (!vals.length) return h("div", null, scopeBar(), h("div", { class: "empty" }, "Sem trades no recorte."));
    const fast = vals.filter((v) => v <= 2).length;
    return h("div", null, scopeBar(), h("div", { class: "map-grid" },
      h("div", null, stackedHist([{ label: "trades", color: "--accent", values: vals }], { min: 0, max: D.cfg.trade_window_s, step: 0.5 })),
      h("div", null, statList([["Trades", String(vals.length)], ["Mediana", NF1.format(d3.median(vals)) + " s"], ["Em até 2 s", `${NF0.format((100 * fast) / vals.length)}% · ${fast} de ${vals.length}`]]),
        h("p", { class: "note" }, `Tempo entre a morte do companheiro e a kill de troca (janela de ${NF1.format(D.cfg.trade_window_s)} s)${sideNote()}.`))));
  }
  function viewPlantTime() {
    const t = state.team, won = [], lost = [];
    for (const m of scopeMatches(false)) for (const i of P_by_m[m]) if (D.P.t[i] === t) (D.P.w[i] ? won : lost).push(D.P.pt[i]);
    const all = won.concat(lost);
    if (!all.length) return h("div", null, scopeBar(), h("div", { class: "empty" }, "Nenhum plant no recorte."));
    const med = d3.median(all);
    const rate = (a) => { const w = won.filter(a).length, n = all.filter(a).length; return n ? `${NF0.format((100 * w) / n)}% · ${w} de ${n}` : "—"; };
    return h("div", null, scopeBar(), legendRow([["convertido", "--good"], ["perdido", "--bad"]]), h("div", { class: "map-grid" },
      h("div", null, stackedHist([{ label: "convertidos", color: "--good", values: won }, { label: "perdidos", color: "--bad", values: lost }], { min: 0, max: Math.max(100, Math.ceil((d3.max(all) + 1) / 5) * 5), step: 5 })),
      h("div", null, statList([["Plants", String(all.length)], ["Mediana do plant", NF1.format(med) + " s"],
        [`Converte plant cedo (≤ ${NF0.format(med)} s)`, rate((v) => v <= med)], [`Converte plant tarde (> ${NF0.format(med)} s)`, rate((v) => v > med)]]),
        h("p", { class: "note" }, "Segundos de jogo no round, como o JSON registra (plantRoundTime). Plants são sempre do ataque."))));
  }
  // pistols e os dois rounds seguintes, partida a partida
  function viewPistols() {
    const t = state.team;
    const list = scopeMatches(false).slice().reverse();
    const chip = (i) => (i == null ? h("span", { class: "rc na" }, "·") : h("span", { class: "rc " + (D.R.w[i] ? "w" : "l"), title: `${D.R.w[i] ? "venceu" : "perdeu"} · compra ${BUY_LBL[BUYS[D.R.b[i]]] ?? "—"} × ${BUY_LBL[BUYS[D.R.ob[i]]] ?? "—"}` }, D.R.w[i] ? "V" : "D"));
    let pw = 0, pn = 0, aw = 0, an = 0, lw = 0, ln = 0;
    const rows = list.map((m, idx) => {
      const at = (r) => R_by_m[m].find((i) => D.R.t[i] === t && D.R.r[i] === r);
      const half = (r0) => {
        const a = at(r0), b = at(r0 + 1), c = at(r0 + 2);
        const on = a != null && sideOk(D.R.sd[a]);
        if (on) { pn++; pw += D.R.w[a]; if (b != null) { if (D.R.w[a]) { an++; aw += D.R.w[b]; } else { ln++; lw += D.R.w[b]; } } }
        return h("td", { class: "pist" + (on ? "" : " off") }, h("div", { class: "pist-in" }, h("span", { class: "sd " + (a != null && D.R.sd[a] === 0 ? "atk" : "def") }, a == null ? "" : D.R.sd[a] === 0 ? "ATK" : "DEF"), chip(a), h("span", { class: "arr" }, "→"), chip(b), chip(c)));
      };
      const [x, y] = scoreOf(m, t);
      const h1 = half(0), h2 = half(12);
      if (idx >= 10 && !state.pistAll && m !== curMatch()) return null;
      return h("tr", { class: m === curMatch() ? "cur" : null, onclick: () => setPos(T.pos.get(m)), style: "cursor:pointer" },
        h("td", null, `#${T.pos.get(m) + 1}`, h("span", { class: "n" }, " " + fmtDate(M.date[m]))), h("td", null, M.map[m]), h("td", { class: "mut" }, prettyTeam(D.teams[opp(m, t)]), h("span", { class: "n" }, ` ${x}–${y}`)),
        h1, h2);
    });
    const pct = (a, n) => (n ? `${NF0.format((100 * a) / n)}% · ${a} de ${n}` : "—");
    return h("div", null, scopeBar(),
      statList([["Pistols vencidos", pct(pw, pn)], ["Venceu o round seguinte após vencer o pistol", pct(aw, an)], ["Venceu o round seguinte após perder o pistol", pct(lw, ln)]]),
      h("div", { class: "tbl-wrap", style: "margin-top:10px" }, h("table", { class: "mt pistols" },
        h("thead", null, h("tr", null, h("th", null, "Partida"), h("th", null, "Mapa"), h("th", null, "Adversário"), h("th", null, "1º half: pistol → 2 → 3"), h("th", null, "2º half: pistol → 14 → 15"))),
        h("tbody", null, rows))),
      list.length > 10 ? h("button", { class: "more-btn", type: "button", onclick: () => { state.pistAll = !state.pistAll; render(); } }, state.pistAll ? "Mostrar só as 10 mais recentes" : `Mostrar todas as ${list.length} partidas`) : null,
      h("p", { class: "note" }, "Os totais acima contam todas as partidas do recorte. V/D = resultado do round (passe o mouse para ver a compra). Clique numa linha para abrir a partida." + (state.side !== "all" ? " Halves do outro lado ficam apagados." : "")));
  }
  function viewPlayers() {
    const t = state.team;
    const cnt = new Map(), deaths = new Map(), traded = new Map(), iso = new Map();
    for (const m of scopeMatches(false)) for (const i of K_by_m[m]) {
      if (D.K.vt[i] !== t || !sideOk(sideOf.get(m + "|" + D.K.r[i] + "|" + t))) continue;
      const v = D.K.v[i];
      deaths.set(v, (deaths.get(v) || 0) + 1);
      if (D.K.tr[i]) { traded.set(v, (traded.get(v) || 0) + 1); const key = D.K.trd[i] + "|" + v; cnt.set(key, (cnt.get(key) || 0) + 1); }
      if (D.K.iso[i] === 1) iso.set(v, (iso.get(v) || 0) + 1);
    }
    const ps = [...deaths.keys()].sort((a, b) => deaths.get(b) - deaths.get(a));
    if (!ps.length) return h("div", null, scopeBar(), h("div", { class: "empty" }, "Sem mortes no recorte."));
    const name = (p) => D.players[p] ?? "?";
    const maxC = d3.max([...cnt.values()]) || 1;
    const per = h("table", { class: "mt compact" }, h("thead", null, h("tr", null, h("th", null, "Jogador"), h("th", { class: "num" }, "Mortes"), h("th", { class: "num" }, "Trocadas"), h("th", { class: "num" }, "Isoladas"))),
      h("tbody", null, ps.map((p) => {
        const dn = deaths.get(p), tn = traded.get(p) || 0, inn = iso.get(p) || 0;
        return h("tr", null, h("td", null, name(p)), h("td", { class: "num" }, dn),
          h("td", { class: "num" }, `${NF0.format(100 * tn / dn)}%`, h("span", { class: "n" }, ` · ${tn}`)),
          h("td", { class: "num" }, `${NF0.format(100 * inn / dn)}%`, h("span", { class: "n" }, ` · ${inn}`)));
      })));
    const mat = h("table", { class: "matrix" }, h("thead", null, h("tr", null, h("th", { class: "rh" }, "quem troca ↓ / trocado →"), ps.map((p) => h("th", null, name(p))))),
      h("tbody", null, ps.map((a) => h("tr", null, h("th", { class: "rh" }, name(a)), ps.map((b) => {
        const c = cnt.get(a + "|" + b) || 0;
        return h("td", { style: c ? `background:color-mix(in srgb, var(--accent) ${Math.round(12 + 60 * c / maxC)}%, transparent)` : "" }, a === b ? "·" : c || "");
      })))));
    const rec = AG.get(state.team + "|" + MI["TRD-05"] + "|" + (SI[""] ?? -1));
    return h("div", null, scopeBar(), h("div", { class: "grid" },
      h("div", { class: "tbl-wrap" }, h("h3", null, "Cobertura de cada jogador"), per, h("p", { class: "note" }, `Isolada = sem aliado vivo a ≤ ${NF0.format(D.cfg.near_radius / 100)} m na hora da morte.`)),
      h("div", { class: "tbl-wrap" }, h("h3", null, "Quem troca quem"), mat, h("p", { class: "note" }, "Linha = quem fez a kill de troca; coluna = quem foi trocado." + (rec ? ` Reciprocidade das duplas (base inteira): ${NF2.format(rec.v)} (1 = equilibrada).` : "")))));
  }
  // por jogador (sem a matriz de quem troca quem): TRD-14 = isoladas entre as mortes sem trade; TRD-08 = trade possível não feito
  function viewPlayerDeaths(id) {
    const t = state.team, iso = id === "TRD-14";
    const den = new Map(), num = new Map(), inc = (mp, k) => mp.set(k, (mp.get(k) || 0) + 1);
    for (const m of scopeMatches(false)) for (const i of K_by_m[m]) {
      if (D.K.vt[i] !== t || !sideOk(sideOf.get(m + "|" + D.K.r[i] + "|" + t))) continue;
      if (iso) { if (D.K.tr[i] || D.K.iso[i] == null) continue; inc(den, D.K.v[i]); if (D.K.iso[i] === 1) inc(num, D.K.v[i]); }
      else { if (D.K.op[i] == null) continue; inc(den, D.K.v[i]); if (D.K.op[i] === 1) inc(num, D.K.v[i]); }
    }
    const ps = [...den.keys()].sort((a, b) => (num.get(b) || 0) - (num.get(a) || 0) || den.get(b) - den.get(a));
    if (!ps.length) return h("div", null, scopeBar(), h("div", { class: "empty" }, "Sem mortes no recorte."));
    const mx = d3.max(ps, (p) => num.get(p) || 0) || 1;
    return h("div", null, scopeBar(), h("div", { class: "tbl-wrap" }, h("table", { class: "mt compact pdeaths" },
      h("thead", null, h("tr", null, h("th", null, "Jogador"), h("th", { class: "num" }, iso ? "Mortes sem trade" : "Mortes"),
        h("th", { class: "num" }, iso ? "Isoladas" : "Com aliado perto"), h("th", null, ""))),
      h("tbody", null, ps.map((p) => {
        const d = den.get(p), n = num.get(p) || 0;
        return h("tr", null, h("td", null, D.players[p] ?? "?"), h("td", { class: "num" }, d),
          h("td", { class: "num" }, `${NF0.format(100 * n / d)}%`, h("span", { class: "n" }, ` ${n}/${d}`)),
          h("td", { class: "bar-td" }, h("span", { class: "pbar", style: `width:${(100 * n / mx).toFixed(1)}%` })));
      })))),
      h("p", { class: "note" }, iso ? `Isolada = sem aliado vivo a ≤ ${NF0.format(D.cfg.near_radius / 100)} m na hora da morte; só mortes sem trade com posição registrada.`
        : `Com aliado perto = morte sem trade com um aliado a ≤ ${NF0.format(D.cfg.near_radius / 100)} m de quem morreu ou de quem matou.`));
  }
  function viewDeaths() {
    const t = state.team; const map = curMap();
    const pts = []; let tr_ = 0, iso = 0, near = 0;
    const who = new Map();
    for (const m of scopeMatches(true)) for (const i of K_by_m[m]) if (D.K.vt[i] === t && D.K.vx[i] != null) who.set(D.K.v[i], (who.get(D.K.v[i]) || 0) + 1);
    if (state.dplayer != null && !who.has(state.dplayer)) state.dplayer = null;
    const pSel = h("select", { class: "psel", "aria-label": "Jogador", onchange: (e) => { state.dplayer = e.target.value === "" ? null : Number(e.target.value); render(); } },
      h("option", { value: "" }, "Todos os jogadores"),
      [...who.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => h("option", { value: String(p), selected: state.dplayer === p ? true : null }, `${D.players[p] ?? "?"} (${n})`)));
    for (const m of scopeMatches(true)) for (const i of K_by_m[m]) {
      if (D.K.vt[i] !== t || D.K.vx[i] == null) continue;
      if (state.dplayer != null && D.K.v[i] !== state.dplayer) continue;
      if (state.phase >= 0 && D.K.ph[i] !== state.phase) continue;
      if (!sideOk(sideOf.get(m + "|" + D.K.r[i] + "|" + t))) continue;
      const c = D.K.tr[i] ? "--good" : D.K.iso[i] === 1 ? "--bad" : D.K.iso[i] === 0 ? "--warn" : "--faint";
      if (D.K.tr[i]) tr_++; else if (D.K.iso[i] === 1) iso++; else if (D.K.iso[i] === 0) near++;
      pts.push({ x: D.K.vx[i], y: D.K.vy[i], x2: D.K.kx[i], y2: D.K.ky[i], color: css(c), r: 4,
        tip: `<b>${esc(D.players[D.K.v[i]] ?? "?")}</b> · round ${D.K.r[i] + 1} · ${NF1.format(D.K.t[i])} s<br>${esc(fmtDate(M.date[m]))} · ${PH_LBL[D.K.ph[i]]}<br>${D.K.tr[i] ? "trocada por " + esc(D.players[D.K.trd[i]] ?? "?") : "sem trade"}${D.K.iso[i] === 1 ? " · isolada" : D.K.iso[i] === 0 ? " · havia aliado perto" : ""}<br><span class="t-mut">killer: ${esc(D.players[D.K.k[i]] ?? "?")}</span>` });
    }
    const n = pts.length || 1;
    return h("div", null,
      scopeBar([seg([[-1, "Todas as fases"], [0, "Abertura"], [1, "Pré-plant"], [2, "Pós-plant"]], state.phase, (v) => { state.phase = v; render(); }), pSel]),
      h("div", { class: "map-grid" },
        h("div", null, pts.length ? mapView(map, [{ points: pts, lines: state.lines }]) : h("div", { class: "empty" }, "Sem mortes no recorte."), mapNote()),
        h("div", null, statList([[`Mortes em ${map}`, String(pts.length)], ["Trocadas", `${NF0.format(100 * tr_ / n)}% · ${tr_}`, "d-good"],
          [`Sem trade, com aliado a ≤ ${NF0.format(D.cfg.near_radius / 100)} m`, `${NF0.format(100 * near / n)}% · ${near}`, "d-warn"],
          ["Sem trade, isoladas", `${NF0.format(100 * iso / n)}% · ${iso}`, "d-bad"]]),
          h("div", { style: "margin-top:10px" }, check("chk-lines", "ligar cada morte ao killer", state.lines, (v) => { state.lines = v; render(); })),
          h("p", { class: "note" }, "Amarelo = havia companheiro perto e não houve trade: bons lances para revisar no VOD."))));
  }
  // pós-plant por site: onde o time planta, como o round termina (explosão, eliminação, defuse) e onde a spike foi plantada
  const PO = { 2: ["Explosão", "--good"], 0: ["Eliminação", "--ref"], 1: ["Defuse", "--bad"] };  // código do resultado do round
  function viewSites() {
    const t = state.team, mine = [];
    for (const m of scopeMatches(false)) for (const i of P_by_m[m]) if (D.P.t[i] === t) mine.push(i);
    if (!mine.length) return h("div", null, scopeBar(), h("div", { class: "empty" }, "O time não plantou no recorte."));
    const byMap = d3.rollups(mine, (v) => v.length, (i) => M.map[D.P.m[i]]).sort((a, b) => b[1] - a[1]);
    const maps = byMap.map((x) => x[0]);
    const mp = maps.includes(state.siteMap) ? state.siteMap : maps.includes(curMap()) ? curMap() : maps[0];
    const here = mine.filter((i) => M.map[D.P.m[i]] === mp);
    const sites = [...new Set(here.map((i) => D.P.st[i]))].sort();
    const fs = sites.includes(state.siteSel) ? state.siteSel : null;
    // liga no mesmo mapa (todos os times que plantaram)
    const lg = new Map();
    for (const m of matchesByMap[mp] || []) for (const i of P_by_m[m]) {
      const st = D.P.st[i], o = lg.get(st) || lg.set(st, { n: 0, w: 0, x: 0, e: 0, d: 0 }).get(st);
      o.n++; o.w += D.P.w[i]; if (D.P.rs[i] === 2) o.x++; else if (D.P.rs[i] === 0) o.e++; else if (D.P.rs[i] === 1) o.d++;
    }
    const lgTot = d3.sum([...lg.values()], (o) => o.n) || 1;
    const pc = (a, b) => (b ? NF0.format(100 * a / b) + "%" : "—");
    const cell = (a, b, l, lb) => h("td", { class: "num" }, h("b", null, pc(a, b)), h("span", { class: "n" }, ` ${a}/${b}`), h("span", { class: "lg" }, `liga ${pc(l, lb)}`));
    const rows = sites.map((st) => {
      const v = here.filter((i) => D.P.st[i] === st), n = v.length, L = lg.get(st) || { n: 0, w: 0, x: 0, e: 0, d: 0 };
      const c = (code) => v.filter((i) => D.P.rs[i] === code).length;
      return h("tr", { class: (fs && fs !== st ? "dim" : "") + (n < 5 ? " thin" : ""), onclick: () => { state.siteSel = fs === st ? null : st; render(); }, style: "cursor:pointer" },
        h("td", null, h("b", null, "Site " + st)),
        cell(n, here.length, L.n, lgTot), cell(d3.sum(v, (i) => D.P.w[i]), n, L.w, L.n), cell(c(2), n, L.x, L.n), cell(c(0), n, L.e, L.n), cell(c(1), n, L.d, L.n));
    });
    const pts = here.filter((i) => !fs || D.P.st[i] === fs).map((i) => {
      const o = PO[D.P.rs[i]] || ["Outro", "--faint"], m = D.P.m[i];
      return { x: D.P.x[i], y: D.P.y[i], color: css(o[1]), r: 5,
        tip: `<b>${esc(fmtDate(M.date[m]))} · round ${D.P.r[i] + 1}</b><br>vs ${esc(prettyTeam(D.teams[opp(m, t)]))}<br>site ${esc(D.P.st[i])} · plant aos ${NF1.format(D.P.pt[i])} s<br>${o[0] === "Defuse" ? "perdeu: adversário defusou" : "venceu por " + o[0].toLowerCase()}` };
    });
    return h("div", null,
      scopeBar(maps.length > 1 ? seg(byMap.map(([mm, n]) => [mm, `${mm} (${n})`]), mp, (v) => { state.siteMap = v; state.siteSel = null; render(); }) : null),
      h("div", { class: "tbl-wrap" }, h("table", { class: "mt states sites" },
        h("thead", null, h("tr", null, h("th", null, mp), h("th", { class: "num" }, "Plants"), h("th", { class: "num" }, "Vitória"),
          h("th", { class: "num" }, "Por explosão"), h("th", { class: "num" }, "Por eliminação"), h("th", { class: "num" }, "Derrota por defuse"))),
        h("tbody", null, rows))),
      h("div", { class: "map-grid" },
        h("div", null, pts.length ? mapView(mp, [{ points: pts }]) : h("div", { class: "empty" }, "Sem plants."), mapNote()),
        h("div", null, h("h3", null, fs ? `Plants no site ${fs}` : `Todos os plants em ${mp}`),
          legendRow([["venceu por explosão", "--good"], ["venceu por eliminação", "--ref"], ["perdeu por defuse", "--bad"]]),
          h("p", { class: "note" }, "Clique num site na tabela para ver só os plants dele; clique de novo para voltar a todos. Plants do time (sempre no ataque); o filtro de lado do topo não se aplica."))));
  }
  // por site: onde o round aconteceu (site do plant, ou "sem plant") e quanto o time vence, por lado, num tipo de round
  // (pistol, eco, anti-eco, force, armados); os filtros são as mesmas regras das métricas KEY-01/15/06/09/16
  const ROUND_KIND = {
    pistol: { ok: (i) => D.R.r[i] === 0 || D.R.r[i] === 12, n: "pistols", one: "pistol" },
    eco: { ok: (i) => D.R.b[i] === 1, n: "rounds em eco", one: "round em eco" },
    antieco: { ok: (i) => D.R.ob[i] === 1 && (D.R.b[i] === 2 || D.R.b[i] === 3), n: "anti-ecos", one: "anti-eco" },
    force: { ok: (i) => D.R.fo[i] === 1, n: "forces", one: "force" },
    armado: { ok: (i) => D.R.b[i] === 3 && D.R.ob[i] === 3, n: "rounds armados", one: "round armado" },
  };
  function viewRoundSites(kind) {
    const K = ROUND_KIND[kind], t = state.team, isP = (r, i) => K.ok(i);
    const siteOf = (m, r) => { const i = P_by_m[m].find((j) => D.P.r[j] === r); return i == null ? null : i; };
    const mine = [];
    for (const m of scopeMatches(false)) for (const i of R_by_m[m]) if (D.R.t[i] === t && isP(D.R.r[i], i)) mine.push(i);
    if (!mine.length) return h("div", null, scopeBar(), h("div", { class: "empty" }, `Sem ${K.n} no recorte.`));
    const byMap = d3.rollups(mine, (v) => v.length, (i) => M.map[D.R.m[i]]).sort((a, b) => b[1] - a[1]);
    const maps = byMap.map((x) => x[0]);
    const mp = maps.includes(state.siteMap) ? state.siteMap : maps.includes(curMap()) ? curMap() : maps[0];
    const here = mine.filter((i) => M.map[D.R.m[i]] === mp);
    const key = (i) => { const p = siteOf(D.R.m[i], D.R.r[i]); return p == null ? "sem plant" : "Site " + D.P.st[p]; };
    const lg = new Map();  // liga no mesmo mapa: chave|lado -> [vitórias, pistols]
    for (const m of matchesByMap[mp] || []) for (const i of R_by_m[m]) if (isP(D.R.r[i], i)) {
      const k = key(i) + "|" + D.R.sd[i], o = lg.get(k) || lg.set(k, [0, 0]).get(k); o[0] += D.R.w[i]; o[1]++;
    }
    const keys = [...new Set(here.map(key))].sort((a, b) => (a === "sem plant") - (b === "sem plant") || a.localeCompare(b));
    const pc = (a, b) => (b ? NF0.format(100 * a / b) + "%" : "—");
    const sideCells = (k, sd) => {
      const v = here.filter((i) => key(i) === k && D.R.sd[i] === sd), w = d3.sum(v, (i) => D.R.w[i]), L = lg.get(k + "|" + sd) || [0, 0];
      return [h("td", { class: "num" }, v.length || "—"),
        h("td", { class: "num" }, v.length ? [h("b", { class: "wv" }, pc(w, v.length)), h("span", { class: "n" }, ` ${w}/${v.length}`)] : "—", h("span", { class: "lg" }, `liga ${pc(L[0], L[1])}`))];
    };
    const tot = (sd) => { const v = here.filter((i) => D.R.sd[i] === sd); return [v.length, d3.sum(v, (i) => D.R.w[i])]; };
    const [na, wa] = tot(0), [nd, wd] = tot(1);
    const fs = state.pistSide ?? -1;
    const pts = here.filter((i) => fs < 0 || D.R.sd[i] === fs).map((i) => ({ i, p: siteOf(D.R.m[i], D.R.r[i]) })).filter((x) => x.p != null).map(({ i, p }) => {
      const m = D.R.m[i];
      return { x: D.P.x[p], y: D.P.y[p], color: css(D.R.w[i] ? "--good" : "--bad"), r: 5,
        tip: `<b>${esc(fmtDate(M.date[m]))} · round ${D.R.r[i] + 1}</b><br>vs ${esc(prettyTeam(D.teams[opp(m, t)]))} · time no ${D.R.sd[i] === 0 ? "ataque" : "defesa"}<br>spike no site ${esc(D.P.st[p])} aos ${NF1.format(D.P.pt[p])} s<br>${D.R.w[i] ? "venceu" : "perdeu"}` };
    });
    const noPlant = here.filter((i) => (fs < 0 || D.R.sd[i] === fs) && siteOf(D.R.m[i], D.R.r[i]) == null);
    return h("div", null,
      scopeBar(maps.length > 1 ? seg(byMap.map(([mm, n]) => [mm, `${mm} (${n})`]), mp, (v) => { state.siteMap = v; render(); }) : null),
      h("div", { class: "tbl-wrap" }, h("table", { class: "mt states pist" },
        h("thead", null,
          h("tr", null, h("th", { rowspan: 2 }, mp), h("th", { colspan: 2, class: "grp-h" }, "Ataque"), h("th", { colspan: 2, class: "grp-h" }, "Defesa")),
          h("tr", null, h("th", { class: "num" }, "Rounds"), h("th", { class: "num" }, "Vitória"), h("th", { class: "num" }, "Rounds"), h("th", { class: "num" }, "Vitória"))),
        h("tbody", null, keys.map((k) => h("tr", null, h("td", null, k === "sem plant" ? "Sem plant" : k), sideCells(k, 0), sideCells(k, 1))),
          h("tr", { class: "tot" }, h("td", null, "Total"), h("td", { class: "num" }, na || "—"), h("td", { class: "num" }, pc(wa, na), na ? h("span", { class: "n" }, ` ${wa}/${na}`) : null),
            h("td", { class: "num" }, nd || "—"), h("td", { class: "num" }, pc(wd, nd), nd ? h("span", { class: "n" }, ` ${wd}/${nd}`) : null))))),
      h("p", { class: "note" }, `Site = onde a spike foi plantada naquele ${K.one} (por qualquer time). "Sem plant" = o round acabou antes de alguém plantar.`),
      h("div", { class: "map-grid" },
        h("div", null, pts.length ? mapView(mp, [{ points: pts }]) : h("div", { class: "empty" }, `Nenhum plant nesses ${K.n}.`), mapNote()),
        h("div", null,
          seg([[-1, "Os dois lados"], [0, "Ataque"], [1, "Defesa"]], fs, (v) => { state.pistSide = v; render(); }),
          legendRow([["time venceu", "--good"], ["time perdeu", "--bad"]]),
          h("p", { class: "note" }, `Cada ponto é onde a spike caiu num ${K.one}. Sem plant (fora do mapa): ${noPlant.length} ${K.n}, ${d3.sum(noPlant, (i) => D.R.w[i])} vencidos.`))));
  }
  function viewPlants(attack) {
    const t = state.team; const map = curMap(); const pts = [];
    for (const m of scopeMatches(true)) for (const i of P_by_m[m]) {
      if (attack !== (D.P.t[i] === t)) continue;
      const good = attack ? D.P.w[i] === 1 : D.P.df[i] === 1;
      pts.push({ x: D.P.x[i], y: D.P.y[i], color: css(good ? "--good" : "--bad"), r: 5, site: D.P.st[i], good,
        tip: `<b>${esc(fmtDate(M.date[m]))} · round ${D.P.r[i] + 1}</b><br>site ${esc(D.P.st[i])} · plant aos ${NF1.format(D.P.pt[i])} s<br>${attack ? (D.P.w[i] ? "converteu" : "perdeu") : (D.P.df[i] ? "defusou" : "não defusou")}` });
    }
    const bySite = d3.rollups(pts, (v) => [v.filter((p) => p.good).length, v.length], (p) => p.site).sort((a, b) => a[0].localeCompare(b[0]));
    const ok = pts.filter((p) => p.good).length;
    return h("div", null, scopeBar(),
      h("div", { class: "map-grid" },
        h("div", null, pts.length ? mapView(map, [{ points: pts }]) : h("div", { class: "empty" }, `Nenhum plant no recorte em ${map}.`), mapNote()),
        h("div", null, legendRow([[attack ? "convertido" : "defusou", "--good"], [attack ? "perdido" : "não defusou", "--bad"]]),
          statList([[`Total em ${map}`, pts.length ? `${NF0.format(100 * ok / pts.length)}% · ${ok} de ${pts.length}` : "—"],
            ...bySite.map(([s, [g, n]]) => [`Site ${s}`, `${NF0.format(100 * g / n)}% · ${g} de ${n}`])]),
          h("p", { class: "note" }, `Plants ${attack ? "do time (sempre no ataque)" : "do adversário (time na defesa)"}; o filtro de lado não se aplica.`))));
  }
  function viewLoadout() {
    const m = curMatch(), t = state.team;
    const rows = R_by_m[m].filter((i) => D.R.t[i] === t).sort((a, b) => D.R.r[a] - D.R.r[b]);
    return h("div", null, legendRow([["Σ loadout do time", "--accent", "line"], ["adversário", "--opp", "line"]]),
      chartBox(210, (svg, w, hh) => {
        const mg = { t: 8, r: 8, b: 24, l: 40 };
        const x = d3.scalePoint().domain(rows.map((i) => D.R.r[i])).range([mg.l + 6, w - mg.r - 6]);
        const y = d3.scaleLinear().domain([0, (d3.max(rows, (i) => Math.max(D.R.lo[i], D.R.olo[i])) || 1) * 1.08]).nice().range([hh - mg.b, mg.t]);
        [D.cfg.team_eco_max, D.cfg.team_full_min].forEach((v) => svg.append("line").attr("x1", mg.l).attr("x2", w - mg.r).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", css("--line")).attr("stroke-dasharray", "4 4"));
        svg.append("g").attr("class", "axis").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => NF0.format(v / 1000) + "k"));
        svg.append("g").attr("class", "axis").attr("transform", `translate(0,${hh - mg.b})`).call(d3.axisBottom(x).tickFormat((r) => (r % 2 === 0 ? r + 1 : "")));
        const ln = (acc) => d3.line().x((i) => x(D.R.r[i])).y((i) => y(acc(i)));
        svg.append("path").attr("d", ln((i) => D.R.olo[i])(rows)).attr("fill", "none").attr("stroke", css("--opp")).attr("stroke-width", 1.8);
        svg.append("path").attr("d", ln((i) => D.R.lo[i])(rows)).attr("fill", "none").attr("stroke", css("--accent")).attr("stroke-width", 2.2);
        rows.forEach((i) => tipOn(svg.append("circle").attr("cx", x(D.R.r[i])).attr("cy", y(D.R.lo[i])).attr("r", 4).attr("opacity", sideOk(D.R.sd[i]) ? 1 : .3)
          .attr("fill", D.R.w[i] ? css("--accent") : css("--panel")).attr("stroke", css("--accent")).attr("stroke-width", 1.6),
          `<b>Round ${D.R.r[i] + 1}</b> · ${D.R.w[i] ? "venceu" : "perdeu"}<br>time ${NF0.format(D.R.lo[i])} (${BUY_LBL[BUYS[D.R.b[i]]]}) × adv. ${NF0.format(D.R.olo[i])} (${BUY_LBL[BUYS[D.R.ob[i]]]})`));
      }), h("p", { class: "note" }, `Esta partida. ● venceu ○ perdeu. Tracejado: eco < ${NF0.format(D.cfg.team_eco_max / 1000)}k e full ≥ ${NF0.format(D.cfg.team_full_min / 1000)}k.`));
  }
  function viewBuyMatrix() {
    const k8 = MI["ECO-08"];
    const ps = state.scope === "match" ? [state.pos] : teamPositions(state.sameMap ? curMap() : null);
    const types = ["eco", "half", "full"];
    const cell = (a, b) => { const e = T.ks.get(k8 + "|" + (SI[a + "_vs_" + b] ?? -1)); if (!e) return null; const s = sumE([e], ps, state.side); return s.d ? s : null; };
    return h("div", null, scopeBar(), h("div", { class: "tbl-wrap" }, h("table", { class: "matrix big" },
      h("thead", null, h("tr", null, h("th", { class: "rh" }, "time ↓ / adversário →"), types.map((b) => h("th", null, BUY_LBL[b])))),
      h("tbody", null, types.map((a) => h("tr", null, h("th", { class: "rh" }, BUY_LBL[a]), types.map((b) => {
        const c = cell(a, b), l = leagueSum(k8, [a + "_vs_" + b], state.side, state.sameMap ? curMap() : null);
        if (!c) return h("td", { class: "mut" }, "—");
        const dl = l ? c.v - l.v : 0;
        return h("td", { style: `background:color-mix(in srgb, var(${dl >= 0 ? "--good" : "--bad"}) ${Math.round(Math.min(55, Math.abs(dl) * 140))}%, transparent)` },
          h("b", null, NF0.format(c.v * 100) + "%"), h("div", { class: "cell-sub" }, `${NF0.format(c.n)} de ${c.d} · liga ${l ? NF0.format(l.v * 100) + "%" : "—"}`));
      })))))), h("p", { class: "note" }, "Taxa de vitória por par de compras; cor = diferença para a liga no mesmo par. Pistols ficam fora."));
  }
  function viewCurve() {
    const ks = [-4, -3, -2, -1, 1, 2, 3, 4];
    const rows = ks.map((k) => ({ label: (k > 0 ? "+" : "−") + Math.abs(k), m: METRICS[MI[k > 0 ? "DYN-01" : "DYN-02"]], st: stat(k > 0 ? "DYN-01" : "DYN-02", [(k > 0 ? "+" : "") + k]) }));
    return h("div", null, ordinalChart(rows, { unit: "rounds", xTitle: "saldo de jogadores vivos alcançado no round" }),
      h("p", { class: "note" }, "Taxa de vitória nos rounds em que o time chegou a cada saldo. À direita, quanto converte vantagem; à esquerda, quanto vira desvantagem."));
  }
  // situações de vantagem / desvantagem: cada round conta uma vez (situação em que a 1ª vantagem começa); só a % de vitória
  function viewStates(id) {
    const list = id === "DYN-09" ? ADV_STATES : DIS_STATES, m = METRICS[MI[id]];
    const rows = list.map((st) => ({ st, x: stat(id, [st]) })).filter((r) => r.x.team.d || r.x.league);
    if (!rows.length) return h("div", { class: "empty" }, "Sem situações no recorte.");
    const row = (label, x, cls) => h("tr", { class: cls || null }, h("td", null, label),
      h("td", { class: "num" }, h("b", { class: "wv" }, fmt(m, x.team.v)), h("span", { class: "n" }, x.team.d ? ` ${NF0.format(x.team.n)}/${x.team.d}` : "")),
      h("td", { class: "num mut" }, fmt(m, x.league?.v)));
    return h("div", { class: "tbl-wrap" }, h("table", { class: "mt states" },
      h("thead", null, h("tr", null, h("th", null, "Situação"), h("th", { class: "num" }, "Vitória"), h("th", { class: "num" }, "Liga"))),
      h("tbody", null, rows.map((r) => row(r.st, r.x)),
        row(id === "DYN-09" ? "Qualquer vantagem" : "Qualquer desvantagem", stat(id, ["geral"]), "tot"))));
  }
  // relação com o resultado do mapa: a mesma métrica nos mapas vencidos e nos perdidos (time e liga)
  const MAPREL = { "DYN-09": [["geral", "Com vantagem numérica"]], "DYN-10": [["geral", "Com desvantagem numérica"]],
                   "ECO-13": [["superior", "Com armamento superior"], ["equilibrado", "Com armamento equilibrado"], ["inferior", "Com armamento inferior"]] };
  const mapWon = (m, t) => { const [a, b] = scoreOf(m, t); return a > b; };
  const LG_RES = new Map();
  function leagueByResult(k, s, side, mp) {
    const key = [k, s, side, mp].join("|");
    if (LG_RES.has(key)) return LG_RES.get(key);
    const acc = { w: { n: 0, d: 0, maps: new Set() }, l: { n: 0, d: 0, maps: new Set() } };
    const si = SI[s] ?? -1;
    for (let i = 0; i < D.TM.k.length; i++) {
      if (D.TM.k[i] !== k || D.TM.s[i] !== si || !sideOk(D.TM.sd[i], side)) continue;
      const m = D.TM.m[i];
      if (mp && M.map[m] !== mp) continue;
      const b = mapWon(m, D.TM.t[i]) ? acc.w : acc.l;
      b.n += D.TM.n[i]; b.d += D.TM.d[i]; b.maps.add(m + "|" + D.TM.t[i]);
    }
    LG_RES.set(key, acc);
    return acc;
  }
  function viewMapResult(id) {
    const m = METRICS[MI[id]], k = MI[id], side = MAPLEVEL.has(id) ? "all" : state.side, mp = state.sameMap ? curMap() : null;
    const items = MAPREL[id] || [[null, lbl(m)]];
    const ps = teamPositions(mp), won = ps.filter((p) => mapWon(T.ms[p], state.team)), lost = ps.filter((p) => !mapWon(T.ms[p], state.team));
    const val = (o) => (o && o.d ? o.n / o.d : null);
    const cell = (o, maps) => h("td", { class: "num" }, fmt(m, val(o)), h("span", { class: "n" }, o && o.d ? ` ${absShort(m, { v: val(o), n: o.n, d: o.d })} · ${maps} mapas` : ` · ${maps} mapas`));
    const dcell = (a, b) => { const x = val(a), y = val(b); return h("td", { class: "num " + (x != null && y != null ? deltaClass(m, x - y) : "") }, x != null && y != null ? fmtDelta(m, x - y) : "—"); };
    const body = items.flatMap(([st, label]) => {
      const sl_ = st == null ? headStrata(id) : [st];
      const ents = sl_.map((s) => T.ks.get(k + "|" + (SI[s] ?? -1))).filter(Boolean);
      const tw = ents.length ? sumE(ents, won, side) : null, tl = ents.length ? sumE(ents, lost, side) : null;
      let lw = { n: 0, d: 0, maps: new Set() }, ll = { n: 0, d: 0, maps: new Set() };
      for (const s of sl_) { const r = leagueByResult(k, s, side, mp); lw.n += r.w.n; lw.d += r.w.d; r.w.maps.forEach((x) => lw.maps.add(x)); ll.n += r.l.n; ll.d += r.l.d; r.l.maps.forEach((x) => ll.maps.add(x)); }
      return [h("tr", { class: "grp" }, h("td", { colspan: 4 }, h("b", null, label))),
        h("tr", null, h("td", null, "Time"), cell(tw, tw ? tw.nm : 0), cell(tl, tl ? tl.nm : 0), dcell(tw, tl)),
        h("tr", null, h("td", { class: "mut" }, "Liga"), cell(lw, lw.maps.size), cell(ll, ll.maps.size), dcell(lw, ll))];
    });
    return h("div", null, h("div", { class: "tbl-wrap" }, h("table", { class: "mt cuts" },
      h("thead", null, h("tr", null, h("th", null, ""), h("th", { class: "num" }, `Mapas vencidos (${won.length})`), h("th", { class: "num" }, `Mapas perdidos (${lost.length})`),
        h("th", { class: "num" }, "Vencidos − perdidos"))), h("tbody", null, body))),
      h("p", { class: "note" }, `Mesma métrica separada pelo resultado do mapa${state.sameMap ? " (só " + curMap() + ")" : ""}${sideNote()}. É uma comparação descritiva: vencer rounds e vencer o mapa andam juntos por construção, então a diferença mostra o quanto essa situação acompanha o resultado, não que ela o causou. Com poucos mapas de um lado, leia junto com a liga.`));
  }
  function viewConsistency() {
    const rows = [];
    for (const [key, a] of AG) {
      const [t, k, s] = key.split("|").map(Number);
      if (t !== state.team || METRICS[k].id !== "DYN-08") continue;
      const ref = METRICS[MI[S[s]]];
      if (ref) rows.push(h("tr", null, h("td", null, lbl(ref)), h("td", { class: "num" }, fmt(ref, a.v)), h("td", { class: "num" }, a.d)));
    }
    if (!rows.length) return h("div", { class: "empty" }, "A equipe precisa de pelo menos 3 partidas.");
    return h("div", { class: "tbl-wrap" }, h("table", { class: "mt compact" }, h("thead", null, h("tr", null, h("th", null, "Métrica"), h("th", { class: "num" }, "Variação entre partidas (desvio-padrão)"), h("th", { class: "num" }, "Partidas"))), h("tbody", null, rows)),
      h("p", { class: "note" }, "Base inteira, sem filtros. Quanto menor, mais estável o time de uma partida para outra."));
  }
  function viewHow(m) {
    return h("div", { class: "def" }, h("div", null, m.rule), m.params ? h("div", null, h("b", null, "Parâmetros: "), m.params) : null,
      h("div", null, h("b", null, "ID: "), `${m.id} · classe ${m.cls} · `, h("span", { class: "pill st-" + m.status }, m.status)),
      CUTS[m.id] ? h("div", null, h("b", null, "Recortes vindos de: "), [...new Set(CUTS[m.id].flatMap((c) => c[1].map((x) => x.id)))].join(", ")) : null);
  }

  // ------------------------------------------------------------------ linha de métrica + expansão
  // métricas sem a aba "Como é calculada": a definição fica no botão de ajuda ao lado das abas
  const NO_HOW = new Set(["DYN-09", "DYN-10", "DYN-03", "DYN-11", "ECO-13", "ECO-09", "ECO-08",
    "OPN-01", "OPN-02", "OPN-03", "OPN-04", "OPN-07", "OPN-10", "OPN-12", "OPN-13", "OPN-14", "OPN-15",
    "TRD-01", "TRD-13", "TRD-07", "TRD-14", "TRD-08", "SPC-02", "SPC-03", "POS-01", "POS-03", "POS-04", "POS-07", "POS-13", "POS-14", "RET-11", "RET-12", "KEY-01", "KEY-15", "KEY-06", "KEY-09", "KEY-16"]);
  // First blood: só Recortes e Evolução (Tempo até o first blood mantém também "Quando acontece")
  for (const id of ["OPN-01", "OPN-02", "OPN-03", "OPN-07", "OPN-10", "OPN-12", "OPN-13", "OPN-14", "OPN-15"]) VIEWS[id] = ["cuts", "evo"];
  VIEWS["OPN-04"] = ["cuts", "evo", "fbtime"];
  for (const id of ["LEV-04", "LEV-06", "LEV-07", "LEV-08", "LEV-09", "LEV-10", "LEV-11", "LEV-12", "LEV-13", "LEV-14", "LEV-15", "LEV-16", "LEV-17", "LEV-18"]) {
    NO_HOW.add(id); VIEWS[id] = ["cuts", "evo"];
  }
  const viewsFor = (m) => [...(VIEWS[m.id] || ["evo", "cuts"]), ...(NO_HOW.has(m.id) ? [] : ["how"])];
  function expansion(m) {
    const vs = viewsFor(m);
    const cur = vs.includes(state.view[m.id]) ? state.view[m.id] : vs[0];
    const V = { evo: () => evolutionChart(m.id), cuts: () => cutsView(m.id), fbtime: viewFbTime, fbplayers: viewFbPlayers, players: viewPlayers,
                tradetime: viewTradeTime, deaths: viewDeaths, plants: () => viewPlants(true), planttime: viewPlantTime, retmap: () => viewPlants(false),
                loadout: viewLoadout, buymatrix: viewBuyMatrix, pistols: viewPistols, curve: viewCurve, consistency: viewConsistency, how: () => viewHow(m),
                states: () => viewStates(m.id), mapresult: () => viewMapResult(m.id), pdeaths: () => viewPlayerDeaths(m.id), sites: viewSites, pistolsites: () => viewRoundSites("pistol"), ecosites: () => viewRoundSites("eco"),
                antiecosites: () => viewRoundSites("antieco"), forcesites: () => viewRoundSites("force"), armadosites: () => viewRoundSites("armado") };
    const body = V[cur]();
    return h("div", { class: "expand" },
      h("div", { class: "vtabs", role: "tablist" }, vs.map((v) => h("button", { type: "button", role: "tab", class: "vtab", "aria-selected": String(v === cur),
        onclick: (ev) => { ev.stopPropagation(); state.view[m.id] = v; render(); } }, VIEW_LBL[v])),
        NO_HOW.has(m.id) ? helpBtn("Como é calculada", h("p", null, m.rule), m.params ? h("p", null, h("b", null, "Parâmetros: "), m.params) : null) : null),
      h("div", { class: "vbody" }, body));
  }
  function metricRow(m, sectionId) {
    const st = stat(m.id);
    const dr = deltaRef();
    const dl = dr && st.match?.v != null && st[dr.key]?.v != null ? st.match.v - st[dr.key].v : null;
    const isOpen = state.open[sectionId] === m.id;
    const toggle = () => { state.open[sectionId] = isOpen ? null : m.id; render(); if (!isOpen) setTimeout(() => document.getElementById("row-" + m.id)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0); };
    const aggOnly = m.id === "DYN-08";
    const head = h("div", { class: "mrow" + (isOpen ? " open" : ""), id: "row-" + m.id, role: "button", tabindex: 0, "aria-expanded": String(isOpen),
      onclick: toggle, onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); } } },
      h("div", { class: "mname" }, h("span", { class: "caret" }, isOpen ? "▾" : "▸"),
        h("div", null, h("div", { class: "mtitle" }, lbl(m), HEAD_NOTE[m.id] ? h("span", { class: "hn" }, HEAD_NOTE[m.id]) : null), h("div", { class: "mq", title: question(m) }, question(m)))),
      aggOnly ? h("div", { class: "mval" }, h("span", { class: "mq" }, "ver detalhes")) :
      h("div", { class: "mval" }, h("span", { class: "big" }, fmtHead(m, st.match?.v)), h("span", { class: "abs" }, st.match?.d ? absText(m, st.match) : "sem eventos nesta partida")),
      aggOnly ? h("div", { class: "mref" }) :
      h("div", { class: "mref" }, refs().map((r) => h("span", null, h("i", { class: "sw", style: `background:var(${r.color})` }), `${r.short} ${fmtHead(m, st[r.key]?.v)}`)),
        dl == null ? null : h("span", { class: "dchip " + deltaClass(m, dl) }, fmtDelta(m, dl))));
    return h("div", { class: "mitem" + (isOpen ? " open" : "") }, head, isOpen ? expansion(m) : null);
  }
  const SHOW_ALL = new Set(["ADV", "FB", "TRD", "POS", "RET", "KEY", "CLU", "LEV"]);  // seções que mostram todas as métricas, sem "mais métricas"
  function lensList(sectionId) {
    const all = (SEC_IDS[sectionId] || []).map((id) => METRICS[MI[id]]).filter((m) => m && !HIDDEN.has(m.id) && m.status !== "adiada");
    const main = SHOW_ALL.has(sectionId) ? all : (MAIN[sectionId] || []).map((id) => METRICS[MI[id]]).filter((m) => all.includes(m));
    const rest = all.filter((m) => !main.includes(m));
    const showMore = !!state.more[sectionId] || rest.some((m) => m.id === state.open[sectionId]);
    return h("section", { class: "panel list" }, filterBar(),
      h("div", { class: "list-head" }, h("span", null, "Métrica"), h("span", { class: "r" }, "Nesta partida"), h("span", { class: "r" }, refs().length ? "Comparação" : "")),
      main.map((m) => metricRow(m, sectionId)),
      rest.length ? h("button", { class: "more-btn", type: "button", onclick: () => { state.more[sectionId] = !showMore; render(); } },
        showMore ? "Mostrar só as principais" : `Mais ${rest.length} métricas desta seção`) : null,
      showMore ? rest.map((m) => metricRow(m, sectionId)) : null);
  }

  // ------------------------------------------------------------------ visão geral
  function firstSide(m, t) {
    for (const i of R_by_m[m]) if (D.R.t[i] === t && D.R.r[i] === 0) return D.R.sd[i] === 0 ? "ataque" : "defesa";
    return "—";
  }
  function historyStrip() {
    const t = state.team;
    return chartBox(40, (svg, w, hh) => {
      const n = T.ms.length;
      const x = d3.scaleBand().domain(range(0, n)).range([0, w]).padding(0.18);
      const y = d3.scaleLinear().domain([-13, 13]).range([hh - 2, 2]);
      svg.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", css("--line"));
      T.ms.forEach((m, i) => {
        const [a, b] = scoreOf(m, t); const dlt = a - b;
        const dim = state.sameMap && M.map[m] !== curMap();
        const g = svg.append("g").style("cursor", "pointer").on("click", () => setPos(i));
        tipOn(g, `<b>#${i + 1} · ${esc(fmtDate(M.date[m]))}</b> · ${esc(M.stage[m])}<br>${esc(M.map[m])} · vs ${esc(prettyTeam(D.teams[opp(m, t)]))}<br><b>${a}–${b}</b>`);
        g.append("rect").attr("x", x(i)).attr("width", x.bandwidth()).attr("y", 0).attr("height", hh).attr("fill", "transparent");
        g.append("rect").attr("x", x(i)).attr("width", x.bandwidth()).attr("y", Math.min(y(dlt), y(0))).attr("height", Math.max(2, Math.abs(y(dlt) - y(0)))).attr("rx", 1.5)
          .attr("fill", dlt > 0 ? css("--good") : css("--bad")).attr("fill-opacity", i === state.pos ? 1 : dim ? 0.15 : 0.45);
        if (i === state.pos) g.append("rect").attr("x", x(i) - 2).attr("width", x.bandwidth() + 4).attr("y", 0).attr("height", hh).attr("fill", "none").attr("stroke", css("--accent")).attr("stroke-width", 2).attr("rx", 3);
      });
    });
  }
  function matchCard() {
    const m = curMatch(), t = state.team, o = opp(m, t);
    const [a, b] = scoreOf(m, t);
    const rows = R_by_m[m].filter((i) => D.R.t[i] === t);
    const won = (sd) => rows.filter((i) => D.R.sd[i] === sd && D.R.w[i]).length, tot = (sd) => rows.filter((i) => D.R.sd[i] === sd).length;
    return h("section", { class: "panel match " + (a > b ? "w" : "l") },
      h("div", { class: "match-card" },
        h("div", null,
          h("div", { class: "vs" }, h("span", { class: "us" }, prettyTeam(D.teams[t])), h("span", { class: "them" }, "vs " + prettyTeam(D.teams[o]))),
          h("div", { class: "meta" }, h("span", null, h("b", null, `#${state.pos + 1}`), ` de ${T.ms.length}`), h("span", null, fmtDate(M.date[m])),
            h("span", null, M.stage[m]), h("span", null, h("b", null, M.map[m])), h("span", null, "começou na " + firstSide(m, t)),
            h("span", null, `ataque ${won(0)}/${tot(0)}`), h("span", null, `defesa ${won(1)}/${tot(1)}`))),
        h("div", { class: "score" }, `${a}–${b}`, h("span", { class: "res " + (a > b ? "w" : "l") }, a > b ? "V" : "D"))));
  }
  // round a round em uma olhada (como nos sites de resultado): quem venceu cada round, de que lado e como
  const RES_IC = ["r_elim", "r_defuse", "r_boom", "r_time"], RES_TXT = ["eliminação", "defuse", "spike detonada", "tempo esgotado"];
  function roundTimeline(m, t, only) {   // only: "atk" / "def" apaga os rounds do outro lado
    const o = opp(m, t), mine = new Map(), theirs = new Map();
    for (const i of R_by_m[m]) (D.R.t[i] === t ? mine : theirs).set(D.R.r[i], i);
    const rs = [...mine.keys()].sort((a, b) => a - b);
    const groups = [rs.filter((r) => r < 12), rs.filter((r) => r >= 12 && r < 24), rs.filter((r) => r >= 24)].filter((g) => g.length);
    const cell = (i, won) => {
      if (i == null) return h("span", { class: "rtl-c e" });
      const sd = D.R.sd[i] === 0 ? "atk" : "def", res = D.R.res[i];
      return won ? h("span", { class: `rtl-c w ${sd}` }, icon(RES_IC[res] || "r_elim")) : h("span", { class: "rtl-c e" });
    };
    const col = (r) => {
      const a = mine.get(r), b = theirs.get(r), weWon = D.R.w[a] === 1;
      const tip = `Round ${r + 1} · ${weWon ? prettyTeam(D.teams[t]) : prettyTeam(D.teams[o])} venceu (${(weWon ? D.R.sd[a] : D.R.sd[b]) === 0 ? "ataque" : "defesa"}) · ${RES_TXT[D.R.res[a]] ?? "—"} · compra ${buyTxt(a)} · clique para abrir o round`;
      const off = only && only !== "all" ? D.R.sd[a] !== (only === "atk" ? 0 : 1) : !sideOk(D.R.sd[a]);
      return h("button", { class: "rtl-col" + (off ? " dim" : ""), type: "button", title: tip, "aria-label": tip,
        onclick: () => { state.rvrFrom = { section: "overview" }; state.rvr = { m, r }; state.section = "REV"; render(); window.scrollTo({ top: 0 }); } },
        h("span", { class: "rtl-n" }, String(r + 1)), cell(a, weWon), cell(b, !weWon));
    };
    const hs = (g) => { let w = 0; for (const r of g) w += D.R.w[mine.get(r)]; return `${w}–${g.length - w}`; };
    return h("div", { class: "rtl-wrap" },
      h("div", { class: "rtl" },
        h("div", { class: "rtl-names" }, h("span", { class: "rtl-n" }, ""), h("span", { class: "us" }, prettyTeam(D.teams[t])), h("span", null, prettyTeam(D.teams[o]))),
        (() => { const [sa, sb] = scoreOf(m, t);   // placar final em destaque ao lado dos nomes; o vencedor na cor de vitória
          return h("div", { class: "rtl-score", "aria-label": `placar ${sa} a ${sb}` }, h("span", { class: "rtl-n" }, ""),
            h("b", { class: sa > sb ? "w" : "l" }, sa), h("b", { class: sb > sa ? "w" : "l" }, sb)); })(),
        groups.flatMap((g, k) => [k ? h("span", { class: "rtl-swap", title: k === 1 ? "troca de lado" : "prorrogação" }, icon("swap")) : null,
          h("div", { class: "rtl-grp" }, g.map(col), h("span", { class: "rtl-hs", title: "placar do time nesse trecho" }, hs(g)))]).filter(Boolean)),
      h("div", { class: "rtl-legend" },
        h("span", null, h("i", { class: "sw", style: "background:var(--atk)" }), "venceu no ataque"),
        h("span", null, h("i", { class: "sw", style: "background:var(--def)" }), "venceu na defesa"),
        RES_IC.map((ic, k) => h("span", null, icon(ic), RES_TXT[k])), h("span", { class: "mut" }, "· clique num round para abrir")));
  }
  function kpiCards() {
    const dr = deltaRef();
    return h("div", { class: "kpis" }, OVERVIEW.map(([id]) => {
      const m = METRICS[MI[id]]; const st = stat(id);
      const dl = dr && st.match.v != null && st[dr.key]?.v != null ? st.match.v - st[dr.key].v : null;
      return h("button", { class: "kpi", type: "button", onclick: () => { const sec = SECTION_OF(id); state.section = sec; state.open[sec] = id; render(); window.scrollTo({ top: 0 }); } },
        h("span", { class: "lbl" }, lbl(m)),
        h("span", { class: "kv" }, h("span", { class: "val" }, fmt(m, st.match.v)), dl == null ? null : h("span", { class: "dchip " + deltaClass(m, dl) }, fmtDelta(m, dl))),
        h("span", { class: "abs" }, absText(m, st.match) || "sem eventos"),
        h("span", { class: "cmp" }, refs().map((r) => h("span", null, h("i", { class: "sw", style: `background:var(${r.color})` }), `${r.short} ${fmt(m, st[r.key]?.v)}`))));
    }));
  }
  function roundStrip() {
    const m = curMatch(), t = state.team;
    const rows = R_by_m[m].filter((i) => D.R.t[i] === t).sort((a, b) => D.R.r[a] - D.R.r[b]);
    const box = chartBox(118, (svg, w, hh) => {
      const n = rows.length;
      const x = d3.scaleBand().domain(range(0, n)).range([0, w]).padding(0.12);
      const maxLo = d3.max(rows, (i) => Math.max(D.R.lo[i], D.R.olo[i])) || 1;
      const yb = d3.scaleLinear().domain([0, maxLo]).range([0, 26]);
      rows.forEach((i, k) => {
        const bw = x.bandwidth(); const won = D.R.w[i] === 1;
        const g = svg.append("g").attr("transform", `translate(${x(k)},0)`).attr("opacity", sideOk(D.R.sd[i]) ? 1 : 0.25);
        g.append("rect").attr("width", bw).attr("height", 4).attr("fill", D.R.sd[i] === 0 ? css("--atk") : css("--def"));
        g.append("text").attr("class", "lbl-m").attr("x", bw / 2).attr("y", 17).attr("text-anchor", "middle").style("font-size", "10px").text(D.R.r[i] + 1);
        g.append("rect").attr("x", 1).attr("y", 50 - yb(D.R.lo[i])).attr("width", bw - 2).attr("height", yb(D.R.lo[i])).attr("fill", css("--accent")).attr("fill-opacity", .7);
        g.append("rect").attr("x", 1).attr("y", 52).attr("width", bw - 2).attr("height", yb(D.R.olo[i])).attr("fill", css("--opp")).attr("fill-opacity", .4);
        g.append("rect").attr("y", 84).attr("width", bw).attr("height", 12).attr("rx", 2).attr("fill", won ? css("--good") : css("--bad"));
        g.append("text").attr("class", "lbl-t").attr("x", bw / 2).attr("y", 110).attr("text-anchor", "middle").style("font-size", bw < 16 ? "8px" : "10px").text((D.R.fb[i] === 1 ? "▲" : "") + (D.R.pl[i] ? "◆" : ""));
        tipOn(g.append("rect").attr("width", bw).attr("height", hh).attr("fill", "transparent"),
          `<b>Round ${D.R.r[i] + 1}</b> · ${D.R.sd[i] === 0 ? "ataque" : "defesa"} · <b>${won ? "venceu" : "perdeu"}</b><br>${RES_LBL[D.R.res[i]] ?? ""}${CER[D.R.cer[i]] ? " · " + CER[D.R.cer[i]] : ""}<br>compra: ${BUY_LBL[BUYS[D.R.b[i]]] ?? "—"} (${NF0.format(D.R.lo[i])}) × ${BUY_LBL[BUYS[D.R.ob[i]]] ?? "—"} (${NF0.format(D.R.olo[i])})<br>first blood: ${D.R.fb[i] === 1 ? "do time" : D.R.fb[i] === 0 ? "do adversário" : "—"}${D.R.pl[i] ? " · time plantou" : ""}${D.R.fo[i] ? " · force" : ""}${D.R.bo[i] ? " · bonus" : ""}`);
        if (D.R.r[i] === 11 || (D.R.r[i] >= 23 && k < n - 1)) {
          const xx = x(k) + bw + x.step() * x.paddingInner() / 2;
          svg.append("line").attr("x1", xx).attr("x2", xx).attr("y1", 0).attr("y2", hh).attr("stroke", css("--ink")).attr("stroke-opacity", D.R.r[i] === 11 ? .4 : .15).attr("stroke-dasharray", "3 3");
        }
      });
    });
    return h("div", null, legendRow([["ataque", "--atk"], ["defesa", "--def"], ["loadout do time", "--accent"], ["do adversário", "--opp"], ["venceu", "--good"], ["perdeu", "--bad"]]),
      box, h("p", { class: "note" }, "▲ first blood do time · ◆ time plantou. Passe o mouse para detalhes."));
  }
  const COMPLEMENT = new Set(["TRD-03", "OPN-08", "KEY-08"]); // = 1 − outra métrica já listada
  function highlights() {
    if (T.ms.length < 3) return h("div", { class: "empty" }, "A equipe precisa de pelo menos 3 partidas para comparar.");
    const out = [];
    for (const m of METRICS) {
      if (m.pol === 0 || kind(m) !== "pct" || HIDDEN.has(m.id) || COMPLEMENT.has(m.id) || DIFF[m.id] || m.status === "adiada" || !SECTION_OF(m.id)) continue;
      const st = stat(m.id);
      if (st.match.v == null || st.team.v == null || st.match.d < 4 || st.team.d < 20) continue;
      const p = Math.min(0.97, Math.max(0.03, st.team.v));
      out.push({ m, st, z: (st.match.v - st.team.v) / Math.sqrt((p * (1 - p)) / st.match.d) * m.pol });
    }
    out.sort((a, b) => b.z - a.z);
    const li = (r) => h("li", { onclick: () => { const sec = SECTION_OF(r.m.id); state.section = sec; state.open[sec] = r.m.id; render(); window.scrollTo({ top: 0 }); } },
      h("span", { class: "what" }, lbl(r.m), h("small", null, `${fmt(r.m, r.st.match.v)} (${absText(r.m, r.st.match)}) · média do time ${fmt(r.m, r.st.team.v)}`)),
      h("span", { class: "how-v " + (r.z > 0 ? "d-good" : "d-bad") }, fmtDelta(r.m, r.st.match.v - r.st.team.v)));
    const best = out.filter((r) => r.z >= 1.5).slice(0, 4), worst = out.filter((r) => r.z <= -1.5).slice(-4).reverse();
    return h("div", { class: "grid" },
      h("div", null, h("h3", null, "Acima do normal do time"), best.length ? h("ul", { class: "hl" }, best.map(li)) : h("div", { class: "empty" }, "Nada fora do padrão.")),
      h("div", null, h("h3", null, "Abaixo do normal do time"), worst.length ? h("ul", { class: "hl" }, worst.map(li)) : h("div", { class: "empty" }, "Nada fora do padrão.")));
  }
  // placar por jogador (como nos sites de estatística), um quadro por time, ordenado por ACS
  const SB_by_m = new Map();
  if (D.SB) for (let i = 0; i < D.SB.m.length; i++) { const k = D.SB.m[i] + "|" + D.SB.t[i]; (SB_by_m.get(k) || SB_by_m.set(k, []).get(k)).push(i); }
  // números de um jogador no lado escolhido: "all" soma os dois lados (K/D/A oficiais da partida)
  function sbStats(i, sd) {
    const S = D.SB, g = (c, k) => S[c + k][i];
    if (sd !== "all") {
      const k = sd === "atk" ? 0 : 1, rp = g("rp", k);
      return { rp, acs: g("acs", k), k: g("k", k), d: g("d", k), a: g("a", k), adr: g("adr", k), hs: g("hs", k), sh: g("sh", k), kast: g("kast", k), fk: g("fk", k), fd: g("fd", k) };
    }
    const rp = g("rp", 0) + g("rp", 1), sum = (c) => g(c, 0) + g(c, 1);
    return { rp, acs: S.acs[i], k: S.k[i], d: S.d[i], a: S.a[i], adr: S.adr[i], hs: sum("hs"), sh: sum("sh"), kast: sum("kast"), fk: sum("fk"), fd: sum("fd") };
  }
  // referências da liga para a leitura do placar (todas as partidas): conversão do first blood, ataque por mapa, anti-eco
  let LREF = null;
  function leagueRef() {
    if (LREF) return LREF;
    const fb = [0, 1, 2].map(() => [[0, 0], [0, 0]]), atk = new Map(), anti = [0, 0];   // fb[lado: 0 ataque, 1 defesa, 2 todos][sofreu, fez]
    for (let i = 0; i < D.R.m.length; i++) {
      const w = D.R.w[i];
      const f = D.R.fb[i];
      if (f === 0 || f === 1) for (const k of [D.R.sd[i], 2]) { fb[k][f][0] += w; fb[k][f][1]++; }
      if (D.R.sd[i] === 0) { const mp = M.map[D.R.m[i]], a = atk.get(mp) || atk.set(mp, [0, 0]).get(mp); a[0] += w; a[1]++; }
      if (D.R.ob[i] === 1 && D.R.b[i] >= 2) { anti[0] += w; anti[1]++; }
    }
    LREF = { fb: fb.map(([l, w_]) => [l[0] / l[1], w_[0] / w_[1]]), atk: new Map([...atk].map(([k, [w, n]]) => [k, w / n])), anti: anti[0] / anti[1] };
    return LREF;
  }
  // comentários do placar: curtos, cada um com uma referência (liga, o próprio time, o próprio jogador)
  function sbNotes(m, t, sd) {
    const S = D.SB, L = leagueRef(), o = opp(m, t), sdi = sd === "atk" ? 0 : sd === "def" ? 1 : null, mp = M.map[m];
    const us = (SB_by_m.get(m + "|" + t) || []).map((i) => [i, sbStats(i, sd)]), them = SB_by_m.get(m + "|" + o) || [];
    if (!us.length) return null;
    const name = (i) => D.players[S.p[i]] ?? "—", P = (v) => NF0.format(100 * v) + "%", B = (txt) => h("b", null, txt);
    const sg = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + NF0.format(Math.abs(v));
    const item = (k, ...body) => h("li", null, h("span", { class: "k" }, k), h("span", null, ...body));
    const rows = (tm) => R_by_m[m].filter((i) => D.R.t[i] === tm).sort((a, b) => D.R.r[a] - D.R.r[b]);
    const mine = rows(t), wn = (l) => l.filter((i) => D.R.w[i] === 1).length;
    const items = [];
    // lado do mapa
    const la = L.atk.get(mp);
    if (la != null) {
      const sideL = (k) => mine.filter((i) => D.R.sd[i] === k), A = sideL(0), Df = sideL(1), strong = la >= 0.5 ? 0 : 1, nm = ["ataque", "defesa"];
      const tr = [A.length ? wn(A) / A.length : null, Df.length ? wn(Df) / Df.length : null], lg = [la, 1 - la];
      const off = (k) => (tr[k] == null ? 0 : tr[k] - lg[k]);
      const v = Math.abs(la - 0.5) < 0.02 ? "" : off(strong) <= -0.08 ? ` Ficou abaixo justamente na ${nm[strong]}.` : off(1 - strong) >= 0.08 ? ` Foi bem no lado mais difícil (${nm[1 - strong]}).` : off(1 - strong) <= -0.08 ? ` Ficou abaixo no lado mais difícil (${nm[1 - strong]}).` : "";
      items.push(item("Lado do mapa", Math.abs(la - 0.5) < 0.02 ? `${mp} é equilibrado na liga. ` : `${mp} favorece a ${nm[strong]} na liga (${P(lg[strong])}). `,
        "Time: ataque ", B(`${wn(A)}/${A.length}`), ", defesa ", B(`${wn(Df)}/${Df.length}`), "." + v));
    }
    // jogadores contra o próprio normal (ACS nas outras partidas do time; segue o filtro de lado)
    const hist = us.map(([i, x]) => {
      let a = 0, n = 0, k = 0;
      for (let j = 0; j < S.p.length; j++) {
        if (S.p[j] !== S.p[i] || S.t[j] !== t || S.m[j] === m) continue;
        const y = sbStats(j, sd); if (!y.rp) continue; a += y.acs * y.rp; n += y.rp; k++;
      }
      return k >= 2 ? { i, dl: x.acs - a / n } : null;
    }).filter(Boolean);
    const up = hist.filter((r) => r.dl >= 25).sort((a, b) => b.dl - a.dl), dn = hist.filter((r) => r.dl <= -25).sort((a, b) => a.dl - b.dl);
    const lst = (l) => l.map((r) => `${name(r.i)} (${sg(r.dl)})`).join(", ");
    if (up.length || dn.length) items.push(item("Contra o próprio normal" + (sdi == null ? "" : sdi === 0 ? " (ataque)" : " (defesa)"),
      up.length ? ["Acima: ", B(lst(up)), dn.length ? ". " : "."] : "", dn.length ? ["Abaixo: ", B(lst(dn)), "."] : "", h("small", null, " ACS contra a média do jogador nas outras partidas do time")));
    // economia: round comprado perdido seguido de eco ou force (quebra)
    const theirs = new Map(rows(o).map((i) => [D.R.r[i], i]));
    const broke = (row, next) => row != null && next != null && D.R.b[row] === 3 && D.R.w[row] === 0 && (D.R.b[next] === 1 || D.R.fo[next] === 1);
    let suf = 0, cau = 0;
    for (let k = 0; k < mine.length - 1; k++) {
      const r = D.R.r[mine[k]]; if (r === 11 || r >= 23) continue;
      const nx = mine[k + 1]; if (D.R.r[nx] !== r + 1) continue;
      if (broke(mine[k], nx)) suf++;
      if (broke(theirs.get(r), theirs.get(r + 1))) cau++;
    }
    items.push(item("Economia", "Quebrou a economia do adversário ", B(`${cau}×`), " e teve a sua quebrada ", B(`${suf}×`), ".",
      h("small", null, " quebra = perder um round com compra completa e ir de eco ou force no seguinte")));
    // sequências
    const streak = (wv) => { let best = [0, 0, 0], cur = 0, st = 0;
      mine.forEach((i, k) => { if (D.R.w[i] === wv) { if (!cur) st = D.R.r[i]; cur++; if (cur > best[0]) best = [cur, st, D.R.r[i]]; } else cur = 0; });
      return best; };
    const [wl, ws, we] = streak(1), [ll, ls, le] = streak(0);
    const sq = [];
    if (wl >= 3) sq.push(["venceu ", B(`${wl} seguidos`), ` (R${ws + 1}–R${we + 1})`]);
    if (ll >= 3) sq.push([sq.length ? "; perdeu " : "Perdeu ", B(`${ll} seguidos`), ` (R${ls + 1}–R${le + 1})`]);
    if (sq.length) { if (sq[0][0] === "venceu ") sq[0][0] = "Venceu "; items.push(item("Sequências", ...sq.flat(), ".")); }
    // composição no mapa: do time e na liga
    const comp = compOf(m, t);
    if (comp && comp.length) {
      const lab = compLabel(comp);
      let tN = 0, tS = 0, lN = 0, lW = 0;
      for (let i = 0; i < D.C.m.length; i++) {
        const mm = D.C.m[i], tt = D.C.t[i]; if (mm === m || M.map[mm] !== mp) continue;
        const c = compOf(mm, tt); if (!c) continue; const same = compLabel(c) === lab;
        if (tt === t) { tN++; if (same) tS++; }
        if (same) { lN++; const [a, b] = scoreOf(mm, tt); if (a > b) lW++; }
      }
      items.push(item("Composição", tN ? (tS ? `Usada pelo time em ${tS} de ${tN} outros mapas em ${mp}. ` : `Nova para o time em ${mp} (${tN} outros mapas lá). `) : `Primeiro ${mp} do time. `,
        lN ? ["Na liga: ", B(`${lW} vitórias em ${lN}`), " mapas com ela."] : "Ninguém mais usou essa comp nesse mapa."));
    }
    // clutches: o último vivo do time contra 1 ou mais
    const ids = (tm) => new Set((SB_by_m.get(m + "|" + tm) || []).map((i) => S.p[i]));
    const pu = ids(t), po = ids(o);
    const cl = { us: [], them: [] };
    for (const i of mine) {
      const r = D.R.r[i], ks = (K_by_m[m] || []).filter((k) => D.K.r[k] === r).sort((a, b) => D.K.t[a] - D.K.t[b]);
      const dead = new Set(); let a = 5, b = 5, fu = false, fo = false;
      for (const k of ks) {
        dead.add(D.K.v[k]); if (D.K.vt[k] === t) a--; else b--;
        if (!fu && a === 1 && b >= 1) { fu = true; const who = [...pu].find((p) => !dead.has(p)); cl.us.push({ r, n: b, won: D.R.w[i] === 1, who }); }
        if (!fo && b === 1 && a >= 1) { fo = true; cl.them.push({ won: D.R.w[i] === 0 }); }
      }
    }
    if (cl.us.length || cl.them.length) {
      const wonUs = cl.us.filter((c) => c.won), best = wonUs.sort((x, y) => y.n - x.n)[0];
      items.push(item("Clutches", "Último vivo contra 1 ou mais: o time venceu ", B(`${wonUs.length} de ${cl.us.length}`),
        best ? ` (${D.players[best.who] ?? "—"} 1v${best.n} no R${best.r + 1})` : "", `; o adversário, ${cl.them.filter((c) => c.won).length} de ${cl.them.length}.`));
    }
    // ultimates: total do time × adversário × o normal do time
    if (S.ul) {
      const tot = (l) => l.reduce((a, i) => a + (S.ul[i] || 0), 0);
      const mu = tot(SB_by_m.get(m + "|" + t) || []), mo = tot(them);
      let a = 0, n = 0; for (const mm of teamMatches[t]) if (mm !== m) { const l = SB_by_m.get(mm + "|" + t); if (l) { a += tot(l); n++; } }
      items.push(item("Ultimates", "Usou ", B(String(mu)), ` × ${mo} do adversário`, n ? `; o time costuma usar ${NF0.format(a / n)} por mapa.` : "."));
    }
    return h("aside", { class: "sb-notes" }, h("h3", null, "Leitura do placar"), h("ul", null, items));
  }
  function scoreboard(m, t) {
    const o = opp(m, t), [a, b] = scoreOf(m, t), sd = state.sbSide || "all";
    const sgn = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + NF0.format(Math.abs(v));
    const tone = (v) => (v > 0 ? " up" : v < 0 ? " dn" : "");
    const c = (v, cls) => h("td", { class: "num" }, h("span", { class: "sbc" + (cls || "") }, v));
    const COLS = [["ACS", "pontuação média de combate por round"], ["K / D / A", "kills / mortes / assistências"], ["+/−", "kills − mortes"],
      ["KAST", "% de rounds com kill, assistência, sobrevivência ou morte trocada"], ["ADR", "dano médio em adversários por round"],
      ["HS%", "acertos na cabeça / acertos em adversários"], ["FK", "first kills: 1ª kill do round"], ["FD", "first deaths: 1ª morte do round"], ["+/−", "first kills − first deaths"]];
    const table = (tm, sc, won, us) => {
      const rows = (SB_by_m.get(m + "|" + tm) || []).map((i) => [i, sbStats(i, sd)]).sort((x, y) => y[1].acs - x[1].acs);
      return h("table", { class: "mt sb" + (us ? " us" : "") },
        h("colgroup", null, h("col", { class: "c-pl" }), h("col", { class: "c-ag" }), COLS.map(([lb], k) => h("col", { class: k === 1 ? "c-kda" : k === 0 || k === 3 ? "c-w" : "c-n" }))),
        h("thead", null, h("tr", null,
          h("th", { class: "sb-team", colspan: 2 }, h("span", { class: "sb-name" }, prettyTeam(D.teams[tm])), h("span", { class: "sb-score " + (won ? "w" : "l") }, sc)),
          COLS.map(([lb, tip]) => h("th", { class: "num", title: tip }, lb)))),
        h("tbody", null, rows.map(([i, x]) => {
          const ag = D.SB.ag[i] != null ? D.agents[D.SB.ag[i]] : null, img = D.SB.ag[i] != null && D.AGIMG ? D.AGIMG[D.SB.ag[i]] : null;
          return h("tr", null,
            h("td", { class: "sb-pl" }, h("b", null, D.players[D.SB.p[i]] ?? "—")),
            h("td", { class: "sb-ag" }, img ? h("img", { src: "data:image/webp;base64," + img, alt: ag ? ag.name : "", title: ag ? `${ag.name} (${ag.role})` : "", width: 28, height: 28 }) : null),
            c(NF0.format(x.acs), " strong"), c(`${x.k} / ${x.d} / ${x.a}`, " kda"), c(sgn(x.k - x.d), tone(x.k - x.d)),
            c(x.rp ? NF0.format((100 * x.kast) / x.rp) + "%" : "—"), c(NF0.format(x.adr)),
            c(x.sh ? NF0.format((100 * x.hs) / x.sh) + "%" : "—"), c(x.fk), c(x.fd), c(sgn(x.fk - x.fd), tone(x.fk - x.fd)));
        })));
    };
    const tw = Number.isInteger(+D.cfg.trade_window_s) ? NF0.format(D.cfg.trade_window_s) : NF1.format(D.cfg.trade_window_s);
    return h("section", { class: "panel sb-panel" },
      h("div", { class: "sec-sub-row" }, h("div", null, h("h2", null, "Placar"), h("p", { class: "sub" }, "Round a round e os números de cada jogador.")),
        helpBtn("Como o placar é calculado",
          h("p", null, "K, D e A do total são os oficiais da partida; por lado, contam as kills em adversários, as mortes (menos a da spike) e as assistências dos rounds daquele lado."),
          h("p", null, "ACS = pontuação de combate por round. ADR = dano em adversários por round; HS% = acertos na cabeça entre os acertos em adversários."),
          h("p", null, `KAST = % de rounds em que o jogador teve kill, assistência, sobreviveu ou teve a morte trocada (em até ${tw} s). FK / FD = 1ª kill / 1ª morte do round; o último +/− é FK − FD.`))),
      roundTimeline(m, t, sd),
      h("div", { class: "ctl-row sb-ctl" }, seg([["all", "Todos"], ["atk", "Ataque"], ["def", "Defesa"]], sd, (v) => { state.sbSide = v; render(); }, "Lado")),
      h("div", { class: "sb-grid" }, h("div", { class: "sb-tables" }, h("div", { class: "tbl-wrap" }, table(t, a, a > b, true)), h("div", { class: "tbl-wrap" }, table(o, b, b > a, false))),
        sbNotes(m, t, sd)));
  }
  function renderOverview(main) {
    const m = curMatch(), t = state.team;
    main.append(h("div", { class: "sec-head" }, h("h1", null, "Partida")),
      matchTape(t, teamMatches[t]),
      h("p", { class: "hint" }, "Escolha a partida: do mais recente (à esquerda) ao mais antigo."),
      h("h2", { class: "sec-sub" }, "Visão geral"), matchCard(), D.SB ? scoreboard(m, t) : null,
      h("h2", { class: "sec-sub" }, "Análise"), filterBar(), kpiCards(),
      panel("O que mudou nesta partida", `Comparado à média do time${state.sameMap ? " em " + curMap() : ""}${sideNote()}; só diferenças maiores do que o acaso explicaria para o nº de rounds. Clique para abrir.`, highlights()),
      ...revSection());
  }

  // ------------------------------------------------------------------ seções
  const SEC_TEXT = {
    ADV: "Quando fica com mais (ou menos) jogadores vivos, ou com equipamento melhor, o time vence? Em que situações, por quanto tempo segura e quanto demora para reagir.",
    FB: "Quem faz a primeira kill do round, o que acontece depois, se ela é devolvida e se o duelo tinha cobertura.",
    ARM: "Quanto o time vence com equipamento melhor, parecido ou pior que o do adversário.",
    TRD: `Quando alguém morre, um companheiro mata o autor em até ${NF1.format(D.cfg.trade_window_s)} s? Quando o time mata, o adversário devolve? E havia companheiro por perto? (posições só nos instantes de kill)`,
    POS: "Depois de plantar, o time segura a spike até o fim?",
    RET: "Quando o adversário planta, o time consegue defusar?",
    KEY: "Quanto o time vence em cada tipo de round (pistol, eco, anti-eco, force e armados) e em que site.",
    CLU: "Clutches, vitórias sem baixas, reação a derrotas seguidas, prorrogação, bonus e thrifty.",
    GEC: "Quanto o time gasta, quanto guarda e se a compra é sincronizada.",
    LEV: "Quanto cada round vale para o mapa, em que situações o time ganha ou perde mapas e quais rounds revisar primeiro.",
    SPC: "Espalhamento do time e mortes concentradas. Aproximações: posições só nos instantes de kill e plant.",
    AGT: "Que agentes o time escolhe, como muda de um mapa para outro e como cada composição se sai. Nomes e funções vêm de um catálogo estático dos agentes; os resultados são observados, não efeito causal da composição.",
    HAL: "Pistol, round 2 e round 3 de cada half: onde a abertura falha (pistol perdido, anti-eco entregue, 1º armado perdido) e quanto isso pesa no resultado do mapa. Use o filtro de lado no topo para ver só o ataque ou a defesa.",
  };
  function renderLens(main, id) {
    const sec = D.sections.find((s) => s.id === id);
    const an = analysisPanel(id);
    main.append(...[h("div", { class: "sec-head" }, h("h1", null, sec.label)), ...(an || []),
      an ? h("h2", { class: "sec-sub" }, "Métricas") : null, lensList(id),
      h("p", { class: "note center" }, "Clique numa métrica para ver evolução, recortes e visualizações.")].filter(Boolean));
  }
  // ------------------------------------------------------------------ pressão e Leverage Index (LEV)
  // Campos de R: li = LI × 100; wp / wm = P(vencer o mapa) se vencer / se perder × 1000; pp = P(vencer o round) antes do round × 1000;
  // lq = quartil de pressão (0..3); va = bits (1 teve vantagem numérica, 2 teve desvantagem); opl = adversário plantou.
  const RIDX = new Map();
  for (let i = 0; i < D.R.m.length; i++) RIDX.set(D.R.m[i] + "|" + D.R.r[i] + "|" + D.R.t[i], i);
  const hasLev = (i) => D.R.wp && D.R.wp[i] != null && D.R.pp[i] != null;
  function levOf(i) {
    const wp = D.R.wp[i] / 1000, wm = D.R.wm[i] / 1000, p = D.R.pp[i] / 1000, won = D.R.w[i] === 1;
    const pre = p * wp + (1 - p) * wm, post = won ? wp : wm;
    return { li: D.R.li[i] / 100, wp, wm, p, pre, post, wpa: post - pre, won };
  }
  function levRounds(m, t) {
    const rows = R_by_m[m].filter((i) => D.R.t[i] === t && hasLev(i)).sort((a, b) => D.R.r[a] - D.R.r[b]);
    let a = 0, b = 0;
    return rows.map((i) => { const o = { i, m, r: D.R.r[i], a, b, side: D.R.sd[i], ...levOf(i) }; if (o.won) a++; else b++; return o; });
  }
  const NF0p = (v) => NF0.format(100 * v) + "%";
  const ppS = (v) => (v >= 0.0005 ? "+" : v <= -0.0005 ? "−" : "") + NF1.format(Math.abs(v * 100)) + " pp";
  const buyTxt = (i) => `${BUY_LBL[BUYS[D.R.b[i]]] ?? "—"} × ${BUY_LBL[BUYS[D.R.ob[i]]] ?? "—"}`;
  function ctxTags(i) {
    const t = [];
    if (D.R.fb[i] === 1) t.push("FB a favor"); else if (D.R.fb[i] === 0) t.push("FB sofrido");
    if (D.R.pl[i]) t.push("plantou"); else if (D.R.opl && D.R.opl[i]) t.push("plant sofrido");
    if (D.R.va && D.R.va[i] & 1) t.push("teve vantagem");
    if (D.R.va && D.R.va[i] & 2) t.push("teve desvantagem");
    return t.join(" · ");
  }
  // reamostragem por partida com semente fixa (mesmo resultado a cada abertura)
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function bootCI(n, statFn, B = 1000) {
    if (n < 2) return [null, null];
    const rnd = rng(20261022), out = [];
    for (let b = 0; b < B; b++) { const idx = Array.from({ length: n }, () => Math.floor(rnd() * n)); const v = statFn(idx); if (v != null && isFinite(v)) out.push(v); }
    out.sort((x, y) => x - y);
    return out.length ? [d3.quantile(out, 0.05), d3.quantile(out, 0.95)] : [null, null];
  }

  // ---- bloco 1: curva do mapa + rounds que mais custaram / ganharam
  function levCurve() {
    const m = curMatch(), t = state.team, rows = levRounds(m, t);
    if (!rows.length) return h("div", { class: "empty" }, "Sem dados de pressão nesta partida.");
    const tip = (o) => `<b>Round ${o.r + 1}</b> · placar ${o.a}–${o.b} · ${o.side === 0 ? "ataque" : "defesa"} · compra ${buyTxt(o.i)}`
      + `<br>chance de vencer o mapa antes do round: <b>${NF0p(o.pre)}</b><br>se vencer: ${NF0p(o.wp)} · se perder: ${NF0p(o.wm)}`
      + `<br>pressão: <b>${NF2.format(o.li)}×</b> um round típico<br><b>${o.won ? "venceu" : "perdeu"}</b> → ${NF0p(o.post)} (${ppS(o.wpa)} além do esperado)`;
    const box = chartBox(300, (svg, w, hh) => {
      const mg = { t: 10, r: 14, l: 44 }, top = [mg.t, 168], bot = [196, hh - 22];
      const n = rows.length;
      const x = d3.scaleBand().domain(range(0, n + 1)).range([mg.l, w - mg.r]).padding(0.18);
      const cx = (k) => x(k) + x.bandwidth() / 2;
      const y = d3.scaleLinear().domain([0, 1]).range([top[1], top[0]]);
      const yl = d3.scaleLinear().domain([0, Math.max(2, d3.max(rows, (o) => o.li))]).range([bot[1], bot[0]]);
      svg.append("g").attr("class", "grid-line").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).tickValues([0, 0.25, 0.5, 0.75, 1]).tickSize(-(w - mg.l - mg.r)).tickFormat(""));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).tickValues([0, 0.5, 1]).tickFormat((v) => NF0.format(v * 100) + "%"));
      svg.append("line").attr("x1", mg.l).attr("x2", w - mg.r).attr("y1", y(0.5)).attr("y2", y(0.5)).attr("stroke", css("--ink")).attr("stroke-opacity", .35).attr("stroke-dasharray", "4 4");
      svg.append("g").attr("class", "axis").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(yl).ticks(2).tickFormat((v) => NF0.format(v) + "×"));
      svg.append("line").attr("x1", mg.l).attr("x2", w - mg.r).attr("y1", yl(1)).attr("y2", yl(1)).attr("stroke", css("--ink")).attr("stroke-opacity", .45).attr("stroke-dasharray", "2 3");
      svg.append("text").attr("class", "lbl-m").attr("x", w - mg.r).attr("y", yl(1) - 4).attr("text-anchor", "end").style("font-size", "10px").text("round típico (1×)");
      svg.append("text").attr("class", "lbl-m").attr("x", mg.l + 4).attr("y", top[0] + 10).style("font-size", "10px").text("chance de vencer o mapa");
      svg.append("text").attr("class", "lbl-m").attr("x", mg.l + 4).attr("y", bot[0] - 6).style("font-size", "10px").text("pressão do round (LI)");
      const pts = rows.map((o, k) => [cx(k), y(o.pre)]).concat([[cx(n), y(rows[n - 1].post)]]);
      svg.append("path").attr("d", d3.line()(pts)).attr("fill", "none").attr("stroke", css("--ink")).attr("stroke-width", 2);
      const every = Math.ceil(n / Math.max(1, Math.floor((w - 60) / 22)));
      rows.forEach((o, k) => {
        if (o.r === 11 || o.r === 23) {
          const xx = x(k) + x.bandwidth() + x.step() * x.paddingInner() / 2;
          svg.append("line").attr("x1", xx).attr("x2", xx).attr("y1", top[0]).attr("y2", bot[1]).attr("stroke", css("--ink")).attr("stroke-opacity", .3).attr("stroke-dasharray", "3 3");
        }
        const g = svg.append("g");
        g.append("rect").attr("x", x(k)).attr("y", yl(o.li)).attr("width", x.bandwidth()).attr("height", Math.max(1, yl(0) - yl(o.li))).attr("rx", 1.5)
          .attr("fill", css(o.won ? "--good" : "--bad")).attr("fill-opacity", .75);
        g.append("circle").attr("cx", cx(k)).attr("cy", y(o.pre)).attr("r", 3.2).attr("fill", css("--panel")).attr("stroke", css("--ink")).attr("stroke-width", 1.5);
        if (k % every === 0) svg.append("text").attr("class", "lbl-m").attr("x", cx(k)).attr("y", hh - 6).attr("text-anchor", "middle").style("font-size", "10px").text(o.r + 1);
        g.append("rect").attr("x", x(k) - x.step() * x.paddingInner() / 2).attr("y", top[0]).attr("width", x.step()).attr("height", bot[1] - top[0]).attr("fill", "transparent");
        tipOn(g, tip(o));
      });
      svg.append("circle").attr("cx", cx(n)).attr("cy", y(rows[n - 1].post)).attr("r", 4.5).attr("fill", css("--ink"));
      svg.append("text").attr("class", "lbl-m").attr("x", cx(n)).attr("y", hh - 6).attr("text-anchor", "middle").style("font-size", "10px").text("fim");
    });
    return h("div", null,
      legendRow([["chance de vencer o mapa antes do round", "--ink"], ["pressão do round: venceu", "--good"], ["perdeu", "--bad"]]), box,
      h("p", { class: "note" }, `Pressão média nesta partida: ${NF2.format(d3.mean(rows, (o) => o.li))}× em ${rows.length} rounds. Linha tracejada vertical = troca de lado. Passe o mouse para ver cada round.`));
  }
  function levReviewList() {
    const t = state.team, all = state.levLS === "all", cost = state.levOrd !== "gain";
    const ms = all ? (state.levScope === "todas" ? T.ms : T.ms.slice(-10)) : [curMatch()];
    let rows = ms.flatMap((m) => levRounds(m, t)).filter((o) => sideOk(o.side));
    rows.sort((p, q) => (cost ? p.wpa - q.wpa : q.wpa - p.wpa));
    rows = rows.slice(0, all ? 10 : 5);
    const ctl = h("div", { class: "ctl-row" },
      seg([["cost", "Mais custaram"], ["gain", "Mais ganharam"]], cost ? "cost" : "gain", (v) => { state.levOrd = v; render(); }, "Ordem"),
      seg([["match", "Esta partida"], ["all", state.levScope === "todas" ? "Todas as partidas" : "Últimas 10"]], all ? "all" : "match", (v) => { state.levLS = v; render(); }, "Partidas"));
    if (!rows.length) return h("div", null, ctl, h("div", { class: "empty" }, "Sem rounds no recorte."));
    return h("div", null, ctl,
      h("div", { class: "tbl-wrap" }, h("table", { class: "mt compact" },
        h("thead", null, h("tr", null, all ? h("th", null, "Partida") : null, h("th", null, "Round"), h("th", null, "Placar antes"), h("th", null, "Lado"), h("th", null, "Compra"), h("th", null, "Contexto"),
          h("th", { class: "num" }, "Pressão"), h("th", { class: "num" }, "Chance antes"), h("th", null, "Resultado"), h("th", { class: "num" }, "Δ além do esperado"))),
        h("tbody", null, rows.map((o) => h("tr", all ? { class: "click", title: "Abrir esta partida", onclick: () => setPos(T.pos.get(o.m)) } : null,
          all ? h("td", null, `#${T.pos.get(o.m) + 1} · ${M.map[o.m]} · vs ${prettyTeam(D.teams[opp(o.m, t)])}`) : null,
          h("td", null, String(o.r + 1)), h("td", null, `${o.a}–${o.b}`), h("td", null, o.side === 0 ? "ataque" : "defesa"), h("td", null, buyTxt(o.i)),
          h("td", { class: "mut" }, ctxTags(o.i) || "—"), h("td", { class: "num" }, NF2.format(o.li) + "×"), h("td", { class: "num" }, NF0p(o.pre)),
          h("td", null, h("span", { class: "rc " + (o.won ? "w" : "l") }, o.won ? "V" : "D"), o.won ? " venceu" : " perdeu"),
          h("td", { class: "num " + (o.wpa >= 0 ? "d-good" : "d-bad") }, ppS(o.wpa))))))),
      h("p", { class: "note" }, "Δ além do esperado = chance de vencer o mapa depois do round − chance esperada antes dele (com a economia daquele round). É a fila de VOD: os rounds que mais mudaram o mapa."
        + (all ? " Clique numa linha para abrir a partida." : "")));
  }

  // ---- bloco 2: onde o time perde mapas (Σ variação de chance de vencer o mapa por situação, por mapa jogado, contra a liga)
  const isPistolR = (i) => D.R.r[i] === 0 || D.R.r[i] === 12;
  const LEV_SIT = [
    ["pistol", "Pistol", (i) => isPistolR(i)],
    ["eco", "Em eco", (i) => D.R.b[i] === 1 && !isPistolR(i)],
    ["antieco", "Anti-eco", (i) => D.R.ob[i] === 1 && !isPistolR(i)],
    ["force", "Force buy", (i) => D.R.fo[i] === 1],
    ["fbf", "Após first blood a favor", (i) => D.R.fb[i] === 1],
    ["fbs", "Após first blood sofrido", (i) => D.R.fb[i] === 0],
    ["adv", "Com vantagem numérica", (i) => (D.R.va[i] & 1) > 0],
    ["dis", "Em desvantagem numérica", (i) => (D.R.va[i] & 2) > 0],
    ["post", "Pós-plant (o time plantou)", (i) => D.R.pl[i] === 1],
    ["ret", "Retake (o adversário plantou)", (i) => D.R.opl[i] === 1],
  ];
  const LEV_LG = new Map();   // liga: Σ variação por situação e mapa, e nº de time-mapas por mapa (por filtro de lado)
  function levLeague(side) {
    if (LEV_LG.has(side)) return LEV_LG.get(side);
    const S = LEV_SIT.map(() => ({ all: 0, map: {} })), nMaps = { all: 0, map: {} };
    for (let m = 0; m < nM; m++) { nMaps.all += 2; nMaps.map[M.map[m]] = (nMaps.map[M.map[m]] || 0) + 2; }
    for (let i = 0; i < D.R.m.length; i++) {
      if (!hasLev(i) || !sideOk(D.R.sd[i], side)) continue;
      const v = levOf(i).wpa, mp = M.map[D.R.m[i]];
      LEV_SIT.forEach(([, , f], c) => { if (f(i)) { S[c].all += v; S[c].map[mp] = (S[c].map[mp] || 0) + v; } });
    }
    const out = { S, nMaps };
    LEV_LG.set(side, out);
    return out;
  }
  function levSituations() {
    const t = state.team, side = state.side, cmpMap = state.levCmp !== "all";
    const ms = state.levScope === "todas" ? T.ms : T.ms.slice(-10);
    const LG = levLeague(side);
    const leagueFor = (c, m) => (cmpMap ? (LG.S[c].map[M.map[m]] || 0) / LG.nMaps.map[M.map[m]] : LG.S[c].all / LG.nMaps.all);
    const rows = LEV_SIT.map(([key, label, f], c) => {
      const per = ms.map((m) => {
        let s = 0, n = 0;
        for (const i of R_by_m[m]) if (D.R.t[i] === t && hasLev(i) && sideOk(D.R.sd[i], side) && f(i)) { s += levOf(i).wpa; n++; }
        return { s, n, e: leagueFor(c, m) };
      });
      const nm = per.length, d = per.map((p) => p.s - p.e);
      const mean = nm ? d3.mean(d) : null;
      // incerteza fica na dica da linha (IC 90% por reamostragem das partidas e recorrência)
      const [lo, hi] = bootCI(nm, (idx) => d3.mean(idx, (k) => d[k]));
      const rec = mean == null ? 0 : d.filter((v) => Math.sign(v) === Math.sign(mean) && v !== 0).length;
      return { key, label, n: d3.sum(per, (p) => p.n), nm, team: nm ? d3.mean(per, (p) => p.s) : null, lg: nm ? d3.mean(per, (p) => p.e) : null, mean, lo, hi, rec };
    }).filter((r) => r.mean != null && r.n > 0).sort((a, b) => a.mean - b.mean);
    const x10 = (v) => (v == null ? "—" : (v * 10 >= 0.005 ? "+" : v * 10 <= -0.005 ? "−" : "") + NF2.format(Math.abs(v * 10)));
    const ext = Math.max(0.005, d3.max(rows, (r) => Math.abs(r.mean)));
    const bar = (r) => {
      const W = 160, H = 16, half = W / 2, len = Math.max(2, (Math.abs(r.mean) / ext) * (half - 4));
      const neg = r.mean < 0;
      return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><line x1="${half}" x2="${half}" y1="0" y2="${H}" style="stroke:var(--ink)" stroke-opacity=".45"/>`
        + `<rect x="${neg ? half - len : half}" y="3" width="${len}" height="10" rx="2" style="fill:var(${neg ? "--bad" : "--good"})" fill-opacity=".85"/></svg>`;
    };
    const tipTxt = (r) => `${r.lo > 0 || r.hi < 0 ? SIG_STRONG : SIG_WEAK} · mesma direção em ${r.rec} de ${r.nm} mapas`;
    const row = (r) => {
      const b = h("td", { class: "strip" }); b.innerHTML = bar(r);
      return h("tr", { class: r.n < 20 ? "thin" : null, title: tipTxt(r) }, h("td", null, r.label), h("td", { class: "num" }, NF0.format(r.n)),
        h("td", { class: "num" }, x10(r.team)), h("td", { class: "num mut" }, x10(r.lg)),
        h("td", { class: "num " + (r.mean < 0 ? "d-bad" : "d-good") }, h("b", null, x10(r.mean))), b);
    };
    const neg = rows.filter((r) => r.mean < 0), pos = rows.filter((r) => r.mean >= 0).reverse();
    const head = h("thead", null, h("tr", null, h("th", null, "Situação"), h("th", { class: "num" }, "Rounds"), h("th", { class: "num" }, "Time"),
      h("th", { class: "num" }, "Liga"), h("th", { class: "num" }, "Diferença"), h("th", { class: "strip" }, "")));
    const grp = (txt, cls, n) => h("tr", { class: "grp " + cls }, h("td", { colspan: 6 }, icon(cls === "bad" ? "down" : "up"), h("b", null, txt), h("span", { class: "mut" }, ` · ${n} situaç${n === 1 ? "ão" : "ões"}`)));
    const ctl = h("div", { class: "ctl-row" },
      h("span", { class: "flbl" }, "Comparar com"), seg([["map", "Liga no mesmo mapa"], ["all", "Liga em todos os mapas"]], cmpMap ? "map" : "all", (v) => setPref("levCmp", v), "Comparar com"),
      h("span", { class: "flbl" }, "Partidas"), seg([["todas", `Todas (${T.ms.length})`], ["ultimas_10", "Últimas 10"]], state.levScope, (v) => { state.levScope = v; render(); }, "Partidas"));
    return h("div", null, ctl,
      h("div", { class: "tbl-wrap" }, h("table", { class: "mt cuts lev-sit" }, head,
        h("tbody", null, neg.length ? grp("Perde mais mapas que a liga: o que treinar", "bad", neg.length) : null, neg.map(row),
          pos.length ? grp("Ganha mais mapas que a liga", "good", pos.length) : null, pos.map(row)))),
      h("p", { class: "note" }, "Time e liga = mapas ganhos (+) ou perdidos (−) a cada 10 jogados nos rounds daquela situação, além do esperado para a economia do round. "
        + `Diferença −0,30 = a cada 10 mapas, nessa situação, o time perde 0,3 mapa a mais que ${cmpMap ? "a liga nos mesmos mapas" : "a liga"}. `
        + "Uma situação pode pesar porque acontece muito ou porque o time converte pouco. Linhas apagadas têm menos de 20 rounds. Passe o mouse para ver a margem de erro. As situações se sobrepõem: não some as linhas."));
  }

  // ---- bloco 3: fechar e reagir — mapas entregues, viradas e rounds decisivos na frente / atrás
  const LEV_HI = 0.8, LEV_LO = 0.2;
  function mapArc(m, t) {
    const rows = levRounds(m, t); if (!rows.length) return null;
    const [a, b] = scoreOf(m, t), won = a > b;
    let pk = rows[0], lw = rows[0];
    for (const o of rows) { if (o.pre > pk.pre) pk = o; if (o.pre < lw.pre) lw = o; }
    const ref = won ? lw : pk, after = rows.filter((o) => o.r >= ref.r);
    const turn = after.reduce((x, o) => (won ? (o.wpa > x.wpa ? o : x) : (o.wpa < x.wpa ? o : x)), after[0]);
    return { m, won, a, b, pk, lw, turn, thrown: !won && pk.pre >= LEV_HI, comeback: won && lw.pre <= LEV_LO, reachedHi: pk.pre >= LEV_HI, reachedLo: lw.pre <= LEV_LO };
  }
  let LEV_LG_ARC = null;
  function levLeagueArcs() {
    if (LEV_LG_ARC) return LEV_LG_ARC;
    let hi = 0, th = 0, lo = 0, cb = 0;
    for (let m = 0; m < nM; m++) for (const t of [M.red[m], M.blue[m]]) { const x = mapArc(m, t); if (!x) continue; if (x.reachedHi) { hi++; if (x.thrown) th++; } if (x.reachedLo) { lo++; if (x.comeback) cb++; } }
    return (LEV_LG_ARC = { hi, th, lo, cb });
  }
  function levPressure() {
    const t = state.team, side = state.side;
    const ms = state.levScope === "todas" ? T.ms : T.ms.slice(-10);
    const arcs = ms.map((m) => mapArc(m, t)).filter(Boolean);
    const hi = arcs.filter((x) => x.reachedHi), th = arcs.filter((x) => x.thrown), lo = arcs.filter((x) => x.reachedLo), cb = arcs.filter((x) => x.comeback);
    const L = levLeagueArcs();
    const rate = (a, b) => (b ? NF0.format(100 * a / b) + "%" : "—");
    // rounds decisivos (25% de maior pressão), separados por quem estava na frente no mapa antes do round
    const dec = (ahead, rowsSrc) => {
      let n = 0, w = 0, e = 0;
      for (const i of rowsSrc) {
        if (D.R.lq[i] !== 3 || !sideOk(D.R.sd[i], side)) continue;
        const o = levOf(i); if ((o.pre >= 0.5) !== ahead) continue;
        n++; w += D.R.w[i]; e += o.p;
      }
      return { n, w, e: n ? e / n : null, v: n ? w / n : null };
    };
    const teamRows = ms.flatMap((m) => R_by_m[m].filter((i) => D.R.t[i] === t && hasLev(i) && D.R.lq[i] != null));
    const fr = dec(true, teamRows), bk = dec(false, teamRows);
    const card = (k, big, small, tone) => h("div", null, h("span", { class: "k" }, k), h("b", { class: tone || "" }, big), h("small", null, small));
    const decTxt = (x) => (x.n ? `${NF0.format(100 * x.v)}% · esperado pela economia ${NF0.format(100 * x.e)}%` : "sem rounds");
    const decTone = (x) => (!x.n ? "" : x.v - x.e <= -0.05 ? "d-bad" : x.v - x.e >= 0.05 ? "d-good" : "");
    const list = th.concat(cb).sort((x, y) => T.pos.get(y.m) - T.pos.get(x.m));
    const li = (x) => {
      const ref = x.won ? x.lw : x.pk;
      return h("tr", { class: "click", title: "Abrir esta partida (a curva do mapa mostra a virada)", onclick: () => { setPos(T.pos.get(x.m)); document.querySelector(".lev-curve")?.scrollIntoView({ behavior: "smooth" }); } },
        h("td", null, h("span", { class: "status " + (x.won ? "good" : "bad") }, icon(x.won ? "up" : "down"), x.won ? "Virada" : "Entregue")),
        h("td", null, `#${T.pos.get(x.m) + 1} · ${fmtDate(M.date[x.m])} · ${M.map[x.m]} · vs ${prettyTeam(D.teams[opp(x.m, t)])}`),
        h("td", { class: "num" }, `${x.a}–${x.b}`),
        h("td", null, `${x.won ? "mínimo" : "pico"} de ${NF0p(ref.pre)} no round ${ref.r + 1} (${ref.a}–${ref.b})`),
        h("td", null, `round ${x.turn.r + 1} (${x.turn.a}–${x.turn.b}, ${x.turn.side === 0 ? "ataque" : "defesa"}): ${ppS(x.turn.wpa)}`));
    };
    return h("div", null,
      h("div", { class: "bigstats" },
        card("Mapas entregues", `${th.length} de ${hi.length}`, `chegou a ${NF0.format(100 * LEV_HI)}% de chance e perdeu · ${rate(th.length, hi.length)} · liga ${rate(L.th, L.hi)}`, th.length / (hi.length || 1) > L.th / L.hi + 0.05 ? "d-bad" : ""),
        card("Viradas", `${cb.length} de ${lo.length}`, `esteve com ${NF0.format(100 * LEV_LO)}% ou menos e venceu · ${rate(cb.length, lo.length)} · liga ${rate(L.cb, L.lo)}`, cb.length / (lo.length || 1) > L.cb / L.lo + 0.05 ? "d-good" : ""),
        card("Rounds decisivos na frente", fr.n ? `${fr.w} de ${fr.n}` : "—", decTxt(fr), decTone(fr)),
        card("Rounds decisivos atrás", bk.n ? `${bk.w} de ${bk.n}` : "—", decTxt(bk), decTone(bk))),
      h("p", { class: "interp" }, `Na frente = o time tinha 50% ou mais de chance de vencer o mapa antes do round; rounds decisivos = os 25% que mais valiam para o mapa. `
        + `“Esperado pela economia” é a chance média de vencer esses rounds com o equipamento que os dois times tinham.${side === "all" ? "" : " Rounds decisivos: só " + (side === "atk" ? "ataque" : "defesa") + "; mapas entregues e viradas usam o mapa inteiro."}`),
      list.length ? h("div", null, h("h3", { class: "sub-h" }, "Mapas para revisar"),
        h("div", { class: "tbl-wrap" }, h("table", { class: "mt compact" },
          h("thead", null, h("tr", null, h("th", null, ""), h("th", null, "Partida"), h("th", { class: "num" }, "Placar"), h("th", null, "Ponto de partida"), h("th", null, "Round que mais mudou o mapa depois disso"))),
          h("tbody", null, list.map(li)))),
        h("p", { class: "note" }, "Clique numa linha para abrir a partida: a curva do mapa mostra onde a chance virou."))
        : h("p", { class: "note" }, "Nenhum mapa entregue ou virado nas partidas selecionadas."));
  }
  function levHelp() {
    const rep = D.LEVREP || [];
    const row = (alvo, modelo) => rep.find((r) => r.alvo === alvo && r.modelo.startsWith(modelo));
    const used = row("vencer o mapa", "W_pre"), score = row("vencer o mapa", "W só"), cst = row("vencer o mapa", "constante");
    const rp = row("vencer o round", "p_pre"), rs = row("vencer o round", "só lado");
    const f3 = (v) => (v == null ? "—" : NF3.format(v));
    const r0 = rep[0] || {};
    return helpBtn("Como ler a pressão",
      h("p", null, h("b", null, "Pressão (LI): "), "antes de cada round, calculamos a chance de vencer o mapa se o time vencer o round e se perder. A diferença é o quanto o round vale para o mapa; o LI divide esse valor pela média da liga (1 = round típico; 2 = vale o dobro). Usa só placar, lado e rodada: mede o peso do round, não o que aconteceu nele."),
      h("p", null, h("b", null, "Δ além do esperado: "), "chance de vencer o mapa depois do round − chance esperada antes dele, com a economia do round. Somado por situação, vira “mapas ganhos ou perdidos” e põe todos os fundamentos na mesma unidade."),
      h("p", null, h("b", null, "Modelo do mapa: "), "cadeia de Markov do placar com a taxa de vitória do ataque em cada mapa na liga (13 vence; prorrogação até abrir 2). Supõe dois times médios no resto do mapa. Chance do round: regressão logística com lado, mapa, pistol e economia, estimada sem a série avaliada."),
      rep.length ? h("p", null, h("b", null, "Validação "), `(séries fora do treino; ${NF0.format(r0.n || 0)} time-rounds, ${NF0.format(r0.series || 0)} séries). Vencer o mapa, log-loss: modelo ${f3(used?.log_loss)} · só placar ${f3(score?.log_loss)} · 50% fixo ${f3(cst?.log_loss)}; erro de calibração ${NF1.format(100 * (used?.ece ?? 0))} pp. Vencer o round: ${f3(rp?.log_loss)} contra ${f3(rs?.log_loss)} só com lado e mapa.`) : null,
      h("p", null, h("b", null, "Fechar e reagir: "), "mapa entregue = antes de algum round a chance de vencer o mapa chegou a 80% e o time perdeu; virada = esteve com 20% ou menos e venceu. Na liga, cerca de 13% dos mapas que chegam a 80% são entregues. A chance supõe times médios, então um adversário muito mais forte deixa uma “entrega” menos surpreendente."),
      h("p", null, "Médias de pressão por time e taxas “ponderadas pela pressão” ficaram fora do painel: não são estáveis entre partidas ou repetem a taxa de vitória. Seguem nas tabelas de saída (LEV-01..18)."));
  }
  // o que é o índice de pressão: explicação curta com exemplos do próprio modelo
  function levExplain() {
    const ex = D.LEVEX || [];
    const bar = (li) => { const w = Math.min(100, (li / 3.5) * 100); return h("span", { class: "lx-bar" }, h("i", { style: `width:${w.toFixed(0)}%` })); };
    return h("section", { class: "panel lev-explain" },
      h("div", { class: "lx-text" },
        h("h2", null, "O que é a pressão de um round"),
        h("p", null, "Antes de cada round, o modelo calcula a chance de vencer o mapa em dois cenários: se o time vencer o round e se perder. ",
          h("b", null, "A diferença é o quanto aquele round vale para o mapa"), ". O índice de pressão compara esse valor com o de um round típico da liga."),
        h("ul", null,
          h("li", null, h("b", null, "1×"), " = round de peso normal; ", h("b", null, "2×"), " = vale o dobro; abaixo de 1× = pouco muda no mapa."),
          h("li", null, "Depende só do placar, do lado e da rodada. Mede o peso do round, não o que aconteceu nele."),
          h("li", null, h("b", null, "Rounds decisivos"), " = os 25% de rounds da liga com mais pressão: é neles que a análise abaixo compara o time com outros times."))),
      ex.length ? h("div", { class: "lx-ex" }, h("table", { class: "mt compact" },
        h("thead", null, h("tr", null, h("th", null, "Placar antes"), h("th", { class: "num" }, "Se vencer"), h("th", { class: "num" }, "Se perder"), h("th", null, "Pressão"))),
        h("tbody", null, ex.map((x) => h("tr", null, h("td", null, x.s), h("td", { class: "num" }, NF0p(x.wp)), h("td", { class: "num" }, NF0p(x.wm)),
          h("td", { class: "lx-li" }, bar(x.li), h("b", null, NF1.format(x.li) + "×")))))),
        h("p", { class: "note" }, "Chance de vencer o mapa para um time médio, começando no ataque.")) : null);
  }
  function renderLev(main) {
    const sec = D.sections.find((s) => s.id === "LEV");
    const m = curMatch(), [a, b] = scoreOf(m, state.team);
    const an = analysisPanel("LEV");
    const exBtn = h("button", { class: "lnk sm ex-toggle", type: "button", "aria-expanded": String(!!state.levEx),
      onclick: () => { state.levEx = !state.levEx; render(); } }, icon("info"), state.levEx ? "Esconder explicação" : "O que é pressão?");
    main.append(h("div", { class: "sec-head fund-head-page" }, h("h1", null, sec.label), exBtn, levHelp()),
      ...(state.levEx ? [levExplain()] : []),
      ...(an ? [...an, h("h2", { class: "sec-sub" }, "Mapas e rounds")] : []),
      filterBar(false),
      panel("Onde o time ganha e perde mapas", "Por situação, quanto de chance de vencer o mapa o time ganhou ou perdeu além do esperado, comparado com a liga. Responde: qual fundamento custa mais mapas?" + sideNote(), levSituations()),
      panel("Fechar e reagir", "O time fecha os mapas que tem na mão e busca os que estão perdidos? Mapas entregues, viradas e os rounds decisivos na frente e atrás.", levPressure()),
      h("div", { class: "lev-curve" }, panel("Curva do mapa", `${M.map[m]} · vs ${prettyTeam(D.teams[opp(m, state.team)])} · ${a}–${b}`, levCurve())));
  }

  // ------------------------------------------------------------------ análise (antigo "fundamento") dentro das seções de métricas
  const ANALYSIS = { TRD: "trade", ADV: "advantage", FB: "fb", POS: "post", RET: "retake", KEY: "keyrounds", HAL: "halfopen", LEV: "pressure" };
  function analysisPanel(secId) {
    if (!FU || !ANALYSIS[secId]) return null;
    const fk = ANALYSIS[secId] === "fb" ? (FB_KEYS.includes(state.dfb) ? state.dfb : FB_KEYS[0]) : ANALYSIS[secId];
    if (!fk || !FU.F[fk]) return null;
    const team = state.team, F = Fd(fk), FD = F.FD, U = FUI[fk];
    const rows = fdRows(fk, team, state.dscope), g0 = rows.find((i) => FD.level[i] === 0);
    const ev = scopeEvents(fk, team, state.dscope), a = agg(fk, ev);
    const isDef = fk !== "trade" || state.dwin === F.meta.window;
    const sig = g0 != null && FD.sel[g0] && isDef;
    const nm = new Set(ev.map((i) => F.E.m[i])).size;
    const pats = isDef ? rows.filter((i) => FD.sel[i] && FD.level[i] > 0).sort((x, y) => FD.gap[x] - FD.gap[y]).slice(0, 4) : [];
    const dims = U.dims, dim = dims.includes(state.adim[fk]) ? state.adim[fk] : dims[0];
    const tone = a.gap == null || Math.abs(a.gap) < 0.5 ? "" : a.gap > 0 ? "d-good" : "d-bad";  // verde = melhor que o esperado, vermelho = pior
    // "Análise" no mesmo nível de "Métricas": título + filtros e, abaixo, dois blocos (padrões recorrentes, onde aparece mais)
    return [
      h("div", { class: "sec-sub-row" }, h("div", null, h("h2", { class: "sec-sub" }, "Análise"), h("p", { class: "sub" }, U.q())), methodHelp()),
      h("div", { class: "ctl-row an-ctl" }, FB_KEYS.includes(fk) && FB_KEYS.length > 1 ? fbToggle(team) : null, diagControls(team, fk === "trade")),
      panel("Padrões recorrentes", "O time comparado com outros times nas mesmas situações; um padrão só aparece quando se repete entre partidas.",
        h("div", { class: "bigstats" },
          h("div", null, h("span", { class: "k" }, "Observado"), h("b", null, pct(a.obs)), h("small", null, `${a.y} de ${a.n} ${U.noun} em ${nm} partidas`)),
          h("div", null, h("span", { class: "k" }, "Esperado em situações parecidas"), h("b", { class: "mut" }, pct(a.exp)), h("small", null, "outros times, mesmo contexto")),
          h("div", null, h("span", { class: "k" }, "Diferença"), h("b", { class: tone }, pp(a.gap)),
            h("small", null, a.gap == null || Math.abs(a.gap) < 0.5 ? "igual ao esperado" : a.gap > 0 ? `melhor que o esperado` : `pior que o esperado`)),
          h("div", null, h("span", { class: "k" }, "Leitura"), statusChip(tierOf(a.gap), isDef && g0 != null && !(FD.lo[g0] > 0 || FD.hi[g0] < 0)),
            h("small", null, sig ? `padrão recorrente: na mesma direção em ${Math.round(FD.rec[g0] * FD.nrec[g0])} de ${FD.nrec[g0]} partidas`
              : !isDef ? `padrões usam a janela de ${F.meta.window} s`
              : tierOf(a.gap) === "dentro" ? "diferença pequena"
              : g0 != null && (FD.lo[g0] > 0 || FD.hi[g0] < 0) ? SIG_STRONG.toLowerCase() : SIG_WEAK.toLowerCase()))),
        pats.length ? h("ul", { class: "pats compact" }, pats.map((i) => h("li", { class: "pat " + FD.dir[i], onclick: openPat(fk, i, false) },
          h("div", { class: "pat-main" }, h("span", { class: "pat-lbl" }, FD.label[i]),
            h("span", { class: "pat-sub" }, `${pct(FD.obs[i])} ${U.did} · esperado ${pct(FD.exp[i])} · ${FD.n[i]} ${U.noun} · em ${Math.round(FD.rec[i] * FD.nrec[i])} de ${FD.nrec[i]} partidas`)),
          h("div", { class: "pat-num" }, h("b", { class: FD.gap[i] < 0 ? "d-bad" : "d-good" }, pp(FD.gap[i])), h("span", null, unitsVs(fk, FD.vs[i]))))))
          : h("p", { class: "note" }, isDef ? "Nenhum recorte com diferença recorrente entre partidas neste período." : `Padrões recorrentes usam a janela de ${F.meta.window} s.`)),
      panel("Onde aparece mais", "O mesmo indicador quebrado por uma dimensão: onde o time fica acima ou abaixo de outros times.",
        h("div", { class: "ctl-row" }, h("span", { class: "flbl" }, "Quebrar por"), seg(dims.map((d) => [d, dimName(fk, d)]), dim, (v) => { state.adim[fk] = v; render(); })),
        breakdownTable(fk, ev, dim)),
    ];
  }

  // ------------------------------------------------------------------ rounds para revisar: os que mais mudaram o mapa, com o motivo
  function roundReasons(m, r, t, o) {
    const i = RIDX.get(m + "|" + r + "|" + t); if (i == null) return [];
    const won = D.R.w[i] === 1, out = [];
    const kills = K_by_m[m].filter((k) => D.K.r[k] === r).sort((a, b) => D.K.t[a] - D.K.t[b]);
    let best = null, worst = null;
    for (const k of kills) {
      const ours = D.K.vt[k] === t, us = ours ? D.K.va[k] : D.K.ka[k], th = ours ? D.K.ka[k] : D.K.va[k];
      if (us == null || th == null) continue;
      if (!best || us - th > best.d) best = { d: us - th, us, th, t: D.K.t[k] };
      if (!worst || us - th < worst.d) worst = { d: us - th, us, th, t: D.K.t[k] };
    }
    if (!won && best && best.d >= 1) out.push(`Perdeu depois de ficar ${best.us}v${best.th} (aos ${NF0.format(best.t)} s)`);
    if (won && worst && worst.d <= -1) out.push(`Virou depois de ficar ${worst.us}v${worst.th}`);
    const b = D.R.b[i], ob = D.R.ob[i], pistol = r === 0 || r === 12;
    if (pistol) out.push(won ? "Pistol vencido" : "Pistol perdido");
    else if (b >= 2 && ob === 1 && !won) out.push("Anti-eco perdido (adversário em eco)");
    else if (b === 1 && won) out.push("Vitória em eco");
    else if (D.R.fo[i]) out.push(won ? "Force buy vencido" : "Force buy perdido");
    const k0 = kills[0];
    if (k0 != null) {
      if (D.K.vt[k0] === t) out.push(`First blood sofrido: ${D.players[D.K.v[k0]] ?? "?"} aos ${NF0.format(D.K.t[k0])} s` + (D.K.iso[k0] ? ", sem aliado por perto" : "") + (D.K.tr[k0] ? ", trocado" : ", sem trade"));
      else if (!won) out.push(`Fez o first blood (${D.players[D.K.k[k0]] ?? "?"}) e perdeu o round`);
    }
    const op = kills.filter((k) => D.K.vt[k] === t && D.K.op[k]).length;
    if (op) out.push(`${op} ${op === 1 ? "morte" : "mortes"} sem trade com aliado perto`);
    const pl = P_by_m[m].find((p) => D.P.r[p] === r);
    if (pl != null) {
      const ourPlant = D.P.t[pl] === t, site = D.P.st[pl];
      if (ourPlant && !won) out.push(`Plantou no ${site} e perdeu` + (D.P.df[pl] ? " (defuse do adversário)" : ""));
      else if (!ourPlant && won) out.push(D.P.df[pl] ? `Defusou no ${site}` : `Venceu o retake no ${site}`);
      else if (!ourPlant && !won) out.push(D.P.rs[pl] === 2 ? `Spike explodiu no ${site}` : `Perdeu o retake no ${site}`);
      else if (ourPlant && won) out.push(`Plantou no ${site} e segurou`);
    }
    if (o && o.li >= 1.2) out.push(`Round decisivo: pressão ${NF2.format(o.li)}× no ${o.a}–${o.b}`);
    return out;
  }
  function revRounds(m, t) { return levRounds(m, t).filter((o) => sideOk(o.side)); }
  function revCard(o, t, showMatch) {
    const i = o.i;
    const openR = () => { state.rvrFrom = { section: "overview" }; state.rvr = { m: o.m, r: o.r }; state.section = "REV"; render(); window.scrollTo({ top: 0 }); };
    return h("li", { class: "rev-item", tabindex: 0, role: "button", onclick: openR, onkeydown: (ev) => { if (ev.key === "Enter") openR(); } },
      h("div", { class: "rev-r" }, h("b", null, `R${o.r + 1}`), h("span", null, `${o.a}–${o.b}`)),
      h("div", { class: "rev-body" },
        h("div", { class: "rev-meta" }, showMatch ? h("b", null, `#${T.pos.get(o.m) + 1} · ${M.map[o.m]} · vs ${prettyTeam(D.teams[opp(o.m, t)])} · `) : null,
          `${o.side === 0 ? "ataque" : "defesa"} · ${buyTxt(i)} · `, h("span", { class: "rc " + (o.won ? "w" : "l") }, o.won ? "V" : "D"), o.won ? " venceu" : " perdeu"),
        null),
      h("div", { class: "rev-d" }, h("b", { class: o.wpa >= 0 ? "d-good" : "d-bad" }, ppS(o.wpa)), h("span", { class: "mut" }, `chance de vencer o mapa ${NF0p(o.pre)} → ${NF0p(o.post)}`)));
  }
  // a tela de um round é a única rota própria que sobrou; a lista vive dentro da Partida (revSection)
  function renderRev(main) {
    if (state.rvr) return renderRevRound(main);
    state.section = "overview"; renderOverview(main);
  }
  // subseção da Partida: os rounds que mais mudaram a chance de vencer o mapa, com o motivo
  function revSection() {
    const t = state.team, m = curMatch(), all = revRounds(m, t);
    const cost = all.filter((x) => x.wpa < 0).sort((p, q) => p.wpa - q.wpa).slice(0, 5), gain = all.filter((x) => x.wpa > 0).sort((p, q) => q.wpa - p.wpa).slice(0, 5);
    const col = (title, l) => h("section", { class: "panel rev-col" }, h("h3", null, title),
      l.length ? h("ol", { class: "rev-list" }, l.map((x) => revCard(x, t, false))) : h("div", { class: "empty" }, "Nenhum round."));
    return [h("div", { class: "sec-sub-row" }, h("div", null, h("h2", { class: "sec-sub" }, "Rounds para revisar"),
        h("p", { class: "sub" }, `Os rounds que mais mudaram a chance de vencer o mapa${sideNote()}. Clique num round para ver o que aconteceu e os motivos.`)),
        helpBtn("Como a lista é feita",
          h("p", null, "Cada round muda a chance de vencer o mapa. As listas ordenam os rounds pelo quanto essa chance mudou além do esperado para a economia daquele round: à esquerda os que mais custaram, à direita os que mais ganharam."),
          h("p", null, "Ao abrir um round aparecem os motivos tirados dos dados: vantagem ou desvantagem numérica, first blood, mortes sem trade com aliado perto, plant e retake, tipo de compra e pressão do round. São pistas para o VOD, não a causa comprovada."))),
      h("div", { class: "rev-cols" }, col("Mais custaram", cost), col("Mais ganharam", gain))];
  }
  function renderRevRound(main) {
    const { m, r } = state.rvr, t = state.team, o = opp(m, t);
    const lr = levRounds(m, t).find((x) => x.r === r), i = RIDX.get(m + "|" + r + "|" + t);
    const kills = K_by_m[m].filter((k) => D.K.r[k] === r).sort((a, b) => D.K.t[a] - D.K.t[b]);
    const pl = P_by_m[m].find((p) => D.P.r[p] === r);
    const [sa, sb] = scoreOf(m, t);
    const from = state.rvrFrom;
    const back = h("button", { class: "back", type: "button", onclick: () => { state.rvr = null; if (from) { Object.assign(state, from); state.rvrFrom = null; } render(); } },
      from ? (from.section === "overview" ? "← Voltar à partida" : "← Voltar ao padrão") : "← Voltar à partida");
    const head = h("div", { class: "sec-head" }, h("h1", null, `Round ${r + 1} · ${M.map[m]}`),
      h("p", null, `${fmtDate(M.date[m])} · ${prettyTeam(D.teams[t])} ${sa}–${sb} ${prettyTeam(D.teams[o])}` +
        (i != null ? ` · ${D.R.sd[i] === 0 ? "ataque" : "defesa"} · ${D.R.w[i] ? "venceu o round" : "perdeu o round"} · ${buyTxt(i)} (${NF0.format(D.R.lo[i])} × ${NF0.format(D.R.olo[i])})` : "")));
    const why = roundReasons(m, r, t, lr);
    const pts = [], lines = [];
    kills.forEach((k, n) => {
      if (D.K.vx[k] == null) return;
      const ours = D.K.vt[k] === t;
      if (D.K.kx[k] != null) lines.push({ x: D.K.vx[k], y: D.K.vy[k], x2: D.K.kx[k], y2: D.K.ky[k], color: css(ours ? "--bad" : "--accent"), lw: 1.6, op: 0.75, dash: "4 3", noDot: true });
      pts.push({ x: D.K.vx[k], y: D.K.vy[k], r: 6.5, color: css(ours ? "--accent" : "--opp"),
        tip: `<b>${n + 1}. ${esc(D.players[D.K.v[k]] ?? "?")}</b> (${ours ? "time" : "adversário"}) morreu aos ${NF1.format(D.K.t[k])} s<br>por ${esc(D.players[D.K.k[k]] ?? "?")}${D.K.tr[k] ? " · trocado" : ""}${ours && D.K.op[k] ? " · sem trade com aliado perto" : ""}` });
    });
    if (pl != null && D.P.x[pl] != null) pts.push({ x: D.P.x[pl], y: D.P.y[pl], r: 7, color: css("--ink"), tip: `<b>Spike</b> plantada no ${esc(D.P.st[pl])} aos ${NF1.format(D.P.pt[pl])} s` });
    const mapBox = pts.length ? h("div", null, mapView(M.map[m], [{ points: lines, lines: true }, { points: pts }], 460),
      legendRow([["morte do time", "--accent"], ["morte do adversário", "--opp"], ["spike", "--ink"]]),
      h("p", { class: "note" }, "Onde cada jogador morreu; a linha tracejada vai até quem matou. Passe o mouse para ver a ordem.")) : h("div", { class: "empty" }, "Sem posições neste round.");
    const tl = h("ol", { class: "tl" }, [
      ...kills.map((k) => {
        const ours = D.K.vt[k] === t, us = ours ? D.K.va[k] : D.K.ka[k], them = ours ? D.K.ka[k] : D.K.va[k];
        return { t: D.K.t[k], node: h("li", { class: ours ? "ours" : "theirs" }, h("span", { class: "tl-t" }, NF1.format(D.K.t[k]) + " s"),
          h("span", { class: "tl-what" }, h("b", null, D.players[D.K.k[k]] ?? "?"), " matou ", h("b", null, D.players[D.K.v[k]] ?? "?"),
            D.K.tr[k] ? h("span", { class: "tag good" }, "trocado") : null, ours && D.K.op[k] ? h("span", { class: "tag" }, "sem trade, aliado perto") : null),
          h("span", { class: "tl-st" + (us > them ? " up" : us < them ? " down" : "") }, us != null ? `${us}v${them}` : "")) };
      }),
      ...(pl != null ? [{ t: D.P.pt[pl], node: h("li", { class: "obj" }, h("span", { class: "tl-t" }, NF1.format(D.P.pt[pl]) + " s"), h("span", { class: "tl-what" }, `Spike plantada no ${D.P.st[pl]}`), h("span", { class: "tl-st" }, "")) }] : []),
    ].sort((a, b) => a.t - b.t).map((x) => x.node));
    main.append(back, head,
      h("section", { class: "panel" }, h("div", { class: "rev-top" },
        h("div", null, h("h3", null, "Por que revisar"), h("ul", { class: "rev-why big" }, (why.length ? why : ["Sem um motivo claro nos dados."]).map((x) => h("li", null, x)))),
        lr ? h("div", { class: "rev-d big" }, h("b", { class: lr.wpa >= 0 ? "d-good" : "d-bad" }, ppS(lr.wpa)), h("span", null, `chance de vencer o mapa ${NF0p(lr.pre)} → ${NF0p(lr.post)}`),
          h("span", { class: "mut" }, `pressão ${NF2.format(lr.li)}× · placar antes ${lr.a}–${lr.b}`)) : null)),
      h("div", { class: "map-grid rv" }, h("section", { class: "panel" }, h("h3", null, "Mortes no round"), mapBox),
        h("section", { class: "panel" }, h("h3", null, "Linha do tempo do round"), tl, h("p", { class: "note" }, `Vivos do ${prettyTeam(D.teams[t])} × adversário depois de cada kill.`))));
  }

  // ------------------------------------------------------------------ composição de agentes (AGT)
  const ROLE_ORDER = ["Duelista", "Iniciador", "Controlador", "Sentinela"];
  const ROLE_KEY = { Duelista: "duel", Iniciador: "init", Controlador: "ctrl", Sentinela: "sent" };
  const ROLE_PL = { Duelista: "duelistas", Iniciador: "iniciadores", Controlador: "controladores", Sentinela: "sentinelas" };
  const C_by = new Map();
  for (let i = 0; i < D.C.m.length; i++) C_by.set(D.C.m[i] + "|" + D.C.t[i], D.C.pa[i]);
  function compOf(m, t) {
    const pa = C_by.get(m + "|" + t); if (!pa) return null;
    const out = [];
    for (let i = 0; i < pa.length; i += 2) out.push({ p: pa[i], a: D.agents[pa[i + 1]] });
    return out.sort((x, y) => ROLE_ORDER.indexOf(x.a.role) - ROLE_ORDER.indexOf(y.a.role) || x.a.name.localeCompare(y.a.name));
  }
  const compLabel = (c) => c.map((x) => x.a.name).sort((a, b) => a.localeCompare(b)).join(" · ");
  const roleOfAgent = Object.fromEntries(D.agents.map((a) => [a.name, a.role]));
  const agentChip = (name, sub) => h("span", { class: "agent r-" + (ROLE_KEY[roleOfAgent[name]] || "x"), title: roleOfAgent[name] || "" }, name, sub ? h("small", null, sub) : null);
  const compChips = (label) => h("span", { class: "chips" }, label.split(" · ").sort((a, b) => ROLE_ORDER.indexOf(roleOfAgent[a]) - ROLE_ORDER.indexOf(roleOfAgent[b]) || a.localeCompare(b)).map((n) => agentChip(n)));
  const pick = (st) => (state.scope === "match" ? st.match : st.team);
  const pctCell = (m, o, cls) => (o && o.d ? h("td", { class: "num " + (cls || "") }, fmt(m, o.v), h("span", { class: "n" }, " " + absShort(m, o))) : h("td", { class: "num mut" }, "—"));
  const roleLegend = () => h("div", { class: "legend" }, ROLE_ORDER.map((r) => h("span", null, h("i", { class: "rl r-" + ROLE_KEY[r] }), r)));

  function compCard() {
    const m = curMatch(), t = state.team, o = opp(m, t);
    const mine = compOf(m, t), theirs = compOf(m, o);
    if (!mine) return panel("Composição nesta partida", null, h("div", { class: "empty" }, "Sem composição válida nesta partida."));
    const row = (who, c, cls) => h("div", { class: "comp-row " + cls }, h("span", { class: "who" }, who),
      h("span", { class: "chips" }, c ? c.map((x) => agentChip(x.a.name, D.players[x.p])) : "—"));
    const facts = [];
    const cnt = Object.fromEntries(ROLE_ORDER.map((r) => [r, mine.filter((x) => x.a.role === r).length]));
    facts.push(["Funções", ROLE_ORDER.filter((r) => cnt[r]).map((r) => `${cnt[r]} ${cnt[r] > 1 ? ROLE_PL[r] : r.toLowerCase()}`).join(" · ")]);
    if (theirs) {
      const common = mine.filter((x) => theirs.some((y) => y.a.name === x.a.name)).map((x) => x.a.name);
      facts.push(["Agentes em comum com o adversário", `${common.length} de 5` + (common.length ? ` (${common.join(", ")})` : "")]);
      if (common.length === 5) facts.push(["Composição espelhada", "sim"]);
    }
    if (state.pos > 0) {
      const pm = T.ms[state.pos - 1], prev = compOf(pm, t);
      if (prev) {
        const inn = mine.filter((x) => !prev.some((y) => y.a.name === x.a.name)).map((x) => x.a.name);
        const out = prev.filter((x) => !mine.some((y) => y.a.name === x.a.name)).map((x) => x.a.name);
        const swaps = mine.filter((x) => prev.some((y) => y.p === x.p && y.a.name !== x.a.name)).map((x) => `${D.players[x.p]}: ${prev.find((y) => y.p === x.p).a.name} → ${x.a.name}`);
        facts.push([`Mudança desde a partida #${state.pos} (${M.map[pm]})`, inn.length ? `entrou ${inn.join(", ")} · saiu ${out.join(", ")}` : "mesma composição"]);
        if (swaps.length) facts.push(["Jogadores que trocaram de agente", swaps.join(" · ")]);
      }
    }
    const label = compLabel(mine);
    const used = stat("AGT-01", [label], { map: null }).team.n, usedMap = stat("AGT-01", [label], { map: curMap() }).team.n;
    facts.push(["Vezes que o time usou esta composição", `${used} ${used === 1 ? "mapa" : "mapas"} · ${usedMap} em ${curMap()}`]);
    return panel("Composição nesta partida", null, roleLegend(), row(prettyTeam(D.teams[t]), mine, "us"), row("vs " + prettyTeam(D.teams[o]), theirs, "them"), statList(facts));
  }
  function rolesPanel() {
    const m3 = METRICS[MI["AGT-03"]], m4 = METRICS[MI["AGT-04"]], rs = refs();
    const rows = ROLE_ORDER.map((r) => ({ r, a: stat("AGT-03", [r]), b: stat("AGT-04", [r]) }));
    const num = (o) => (o && o.v != null ? NF1.format(o.v) : "—");
    return panel("Funções na composição", `Agentes de cada função por mapa${state.sameMap ? " em " + curMap() : ""}; e em quantos mapas a função aparece repetida (2 ou mais).`,
      h("div", { class: "tbl-wrap" }, h("table", { class: "mt cuts" },
        h("thead", null, h("tr", null, h("th", null, "Função"), h("th", { class: "num" }, "Esta partida"), rs.map((x) => h("th", { class: "num" }, h("i", { class: "sw", style: `background:var(${x.color})` }), x.key === "team" ? "Média do time" : "Liga")),
          h("th", { class: "num" }, "Repetida (time)"), state.show.league ? h("th", { class: "num" }, "Repetida (liga)") : null)),
        h("tbody", null, rows.map(({ r, a, b }) => h("tr", null, h("td", null, h("i", { class: "rl r-" + ROLE_KEY[r] }), r),
          h("td", { class: "num strong" }, a.match.d ? NF0.format(a.match.v) : "—"), rs.map((x) => h("td", { class: "num" }, num(a[x.key]))),
          pctCell(m4, b.team), state.show.league ? h("td", { class: "num" }, fmt(m4, b.league?.v)) : null))))));
  }
  function compTable() {
    const comps = strataOf("AGT-01").map((c) => ({ c, maps: stat("AGT-01", [c]).team.n })).filter((x) => x.maps > 0).sort((a, b) => b.maps - a.maps || a.c.localeCompare(b.c));
    if (!comps.length) return panel("Composições da equipe", null, h("div", { class: "empty" }, "Sem composições no recorte."));
    const cur = compOf(curMatch(), state.team), curLbl = cur ? compLabel(cur) : "";
    const view = state.compView || "res";
    const shown = state.compAll ? comps : comps.slice(0, 8);
    if (!state.compAll && curLbl && !shown.some((x) => x.c === curLbl) && comps.some((x) => x.c === curLbl)) shown.push(comps.find((x) => x.c === curLbl));
    const mm = (id) => METRICS[MI[id]];
    let head, body, foot = null;
    if (view === "res") {
      const cols = [["AGT-11", "Rounds", {}], ["AGT-12", "Ataque", { side: "atk" }], ["AGT-12", "Defesa", { side: "def" }], ["AGT-14", "Converte FB", {}],
                    ["AGT-15", "Trades", {}], ["AGT-16", "Converte plant", {}], ["AGT-17", "Defusa", {}]];
      head = [h("th", { class: "num" }, "Mapas"), cols.map(([, l]) => h("th", { class: "num" }, l))];
      body = (x) => [h("td", { class: "num" }, x.maps), cols.map(([id, , o]) => pctCell(mm(id), stat(id, [x.c], o).team))];
      const all = comps.map((x) => x.c);
      const parent = { "AGT-14": "OPN-02", "AGT-15": "TRD-01", "AGT-16": "POS-01", "AGT-17": "RET-01" };
      foot = [h("tr", null, h("td", null, "Time (todas as composições)"), h("td", { class: "num" }, d3.sum(comps, (x) => x.maps)),
        cols.map(([id, , o]) => pctCell(mm(id), stat(id, all, o).team))),
        state.show.league ? h("tr", { class: "lg" }, h("td", null, "Liga"), h("td", null), cols.map(([id, , o]) => {
          const p = parent[id]; const l = p ? stat(p, undefined, o).league : null;
          return h("td", { class: "num" }, l ? fmt(mm(id), l.v) : "—");
        })) : null];
    } else if (view === "eco") {
      const bands = [["inferior", "Equipamento inferior"], ["equilibrada", "Equilibrado"], ["superior", "Superior"]];
      head = [h("th", { class: "num" }, "Mapas"), bands.map(([, l]) => h("th", { class: "num" }, l))];
      body = (x) => [h("td", { class: "num" }, x.maps), bands.map(([b]) => pctCell(mm("AGT-18"), stat("AGT-18", [`${b} | ${x.c}`]).team))];
    } else {
      const sites = [...new Set(strataOf("AGT-19").map((s) => s.split(" | ").pop()))].sort();
      head = [h("th", { class: "num" }, "Plants"), sites.map((s) => h("th", { class: "num" }, "Site " + s))];
      body = (x) => {
        const per = sites.map((s) => stat("AGT-19", [`${x.c} | ${s}`]).team.n);
        const tot = d3.sum(per);
        return [h("td", { class: "num" }, tot || "—"), per.map((n) => h("td", { class: "num" + (tot ? "" : " mut") }, tot ? `${NF0.format((100 * n) / tot)}%` : "—", tot ? h("span", { class: "n" }, " " + n) : null))];
      };
    }
    const note = { res: "Taxas com “x/N” = eventos (rounds, first bloods, mortes, plants). Composições com poucos mapas variam muito: leia junto com a coluna Mapas.",
                   eco: "Taxa de vitória por composição em cada faixa de Σloadout do time ÷ adversário (inferior < 0,67; superior > 1,5). Pistols ficam fora.",
                   site: "Onde cada composição planta: % dos plants do time com essa composição." }[view];
    return panel("Composições da equipe", `Todas as partidas da equipe${state.sameMap ? " em " + curMap() : ""}${sideNote()}. Em destaque, a composição desta partida.`,
      h("div", { class: "ctl-row" }, h("span", { class: "flbl" }, "Ver"), seg([["res", "Resultados"], ["eco", "Por economia"], ["site", "Sites de plant"]], view, (v) => { state.compView = v; render(); })),
      h("div", { class: "tbl-wrap" }, h("table", { class: "mt comps" },
        h("thead", null, h("tr", null, h("th", null, "Composição"), head)),
        h("tbody", null, shown.map((x) => h("tr", { class: x.c === curLbl ? "cur" : null }, h("td", null, compChips(x.c)), body(x)))),
        foot ? h("tfoot", null, foot) : null)),
      comps.length > 8 ? h("button", { class: "more-btn", type: "button", onclick: () => { state.compAll = !state.compAll; render(); } }, state.compAll ? "Mostrar só as 8 mais usadas" : `Mostrar todas as ${comps.length} composições`) : null,
      h("p", { class: "note" }, note));
  }
  function pairsPanel() {
    const view = state.pairView || "dupla";
    let rows, head, note;
    if (view === "dupla" || view === "trio") {
      const tot = d3.sum(strataOf("AGT-01"), (c) => pick(stat("AGT-01", [c])).n);
      rows = strataOf("AGT-10").filter((s) => s.startsWith(view + ": ")).map((s) => ({ s, n: pick(stat("AGT-10", [s])).n })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 10);
      head = [h("th", { class: "num" }, "Mapas juntos"), h("th", { class: "num" }, "% dos mapas")];
      rows = rows.map((x) => h("tr", null, h("td", null, h("span", { class: "chips" }, x.s.split(": ")[1].split(" + ").map((n) => agentChip(n)))), h("td", { class: "num" }, x.n), h("td", { class: "num" }, tot ? `${NF0.format((100 * x.n) / tot)}%` : "—")));
      note = "Pares e trios de agentes que aparecem juntos na composição.";
    } else if (view === "trade") {
      const m20 = METRICS[MI["AGT-20"]];
      const xs = strataOf("AGT-20").map((s) => ({ s, st: stat("AGT-20", [s]) })).filter((x) => pick(x.st).d >= (state.scope === "match" ? 1 : 10)).sort((a, b) => pick(b.st).d - pick(a.st).d).slice(0, 12);
      head = [h("th", { class: "num" }, "Trade"), state.show.league ? h("th", { class: "num" }, "Liga") : null];
      rows = xs.map((x) => h("tr", null, h("td", null, h("span", { class: "chips" }, x.s.split(" + ").map((n) => agentChip(n)))), pctCell(m20, pick(x.st)),
        state.show.league ? h("td", { class: "num" }, fmt(m20, x.st.league?.v)) : null));
      note = "Quando um dos dois morre e o outro está vivo, com que frequência o outro faz a troca. Aproximação: não sabemos se ele tinha ângulo. Pares com pelo menos 10 situações, mais frequentes primeiro.";
    } else {
      const xs = strataOf("AGT-21").map((s) => ({ s, n: pick(stat("AGT-21", [s])).n })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 10);
      head = [h("th", { class: "num" }, "First bloods")];
      rows = xs.map((x) => { const [k, a] = x.s.split(" ← "); return h("tr", null, h("td", null, h("span", { class: "chips" }, agentChip(k, "kill"), h("span", { class: "arr" }, "←"), agentChip(a, "assist"))), h("td", { class: "num" }, x.n)); });
      note = "First bloods do time com assistência registrada: quem matou e quem assistiu. A assistência não diz qual habilidade foi usada.";
    }
    return panel("Agentes que jogam juntos", null,
      h("div", { class: "ctl-row" }, h("span", { class: "flbl" }, "Ver"), seg([["dupla", "Duplas"], ["trio", "Trios"], ["trade", "Trade por dupla"], ["fb", "First blood com assistência"]], view, (v) => { state.pairView = v; render(); }),
        h("span", { class: "flbl" }, "Partidas"), scopeSeg()),
      rows.length ? h("div", { class: "tbl-wrap" }, h("table", { class: "mt cuts" }, h("thead", null, h("tr", null, h("th", null, view === "fb" ? "Combinação" : "Agentes"), head)), h("tbody", null, rows))) : h("div", { class: "empty" }, "Sem dados no recorte."),
      h("p", { class: "note" }, note + (view === "dupla" || view === "trio" ? "" : sideNote())));
  }
  function opsPanel() {
    const evs = [["first kill", "First kills"], ["trade", "Kills de troca"], ["plant", "Plants"], ["defuse", "Defuses"]];
    const strata = strataOf("AGT-23");
    const agents = [...new Set(strata.map((s) => s.split(" | ")[1]))];
    const cnt = (ev, a) => pick(stat("AGT-23", [`${ev} | ${a}`])).n;
    const tot = Object.fromEntries(evs.map(([ev]) => [ev, d3.sum(agents, (a) => cnt(ev, a))]));
    const all = agents.map((a) => ({ a, c: evs.map(([ev]) => cnt(ev, a)) })).filter((x) => d3.sum(x.c) > 0)
      .sort((x, y) => d3.sum(y.c) - d3.sum(x.c));
    const rows = state.opsAll ? all : all.slice(0, 10);
    return panel("Quem faz o quê", "Fatia de cada agente nos eventos do time. Mostra o papel desempenhado, que pode ser diferente da função nominal.",
      h("div", { class: "ctl-row" }, h("span", { class: "flbl" }, "Partidas"), scopeSeg()),
      rows.length ? h("div", { class: "tbl-wrap" }, h("table", { class: "mt cuts" },
        h("thead", null, h("tr", null, h("th", null, "Agente"), evs.map(([, l]) => h("th", { class: "num" }, l)))),
        h("tbody", null, rows.map((x) => h("tr", null, h("td", null, agentChip(x.a)), x.c.map((n, i) => {
          const t = tot[evs[i][0]];
          return h("td", { class: "num" + (n ? "" : " mut") }, t ? `${NF0.format((100 * n) / t)}%` : "—", h("span", { class: "n" }, " " + n));
        })))),
        h("tfoot", null, h("tr", null, h("td", null, "Time"), evs.map(([ev]) => h("td", { class: "num" }, tot[ev])))))) : h("div", { class: "empty" }, "Sem eventos no recorte."),
      all.length > 10 ? h("button", { class: "more-btn", type: "button", onclick: () => { state.opsAll = !state.opsAll; render(); } }, state.opsAll ? "Mostrar só os 10 mais ativos" : `Mostrar todos os ${all.length} agentes`) : null,
      h("p", { class: "note" }, "Kills de troca = o agente matou quem tinha acabado de matar um companheiro" + sideNote() + "."));
  }
  function renderAGT(main) {
    main.append(h("div", { class: "sec-head" }, h("h1", null, "Composição de agentes")),
      compCard(), rolesPanel(), lensList("AGT"), compTable(), pairsPanel(), opsPanel());
  }
  // ------------------------------------------------------------------ início de half: pistol → round 2 → round 3 e o efeito no mapa
  // Unidade = abertura de um half (rounds 1–3 ou 13–15) de um time num mapa. Tudo vem de R (vitória, lado, compra) e do placar final.
  function halvesOfTeam(t, ms) {
    const out = [];
    for (const m of ms) {
      const byR = new Map();
      for (const i of R_by_m[m]) if (D.R.t[i] === t) byR.set(D.R.r[i], i);
      const [a, b] = scoreOf(m, t);
      for (const h0 of [0, 12]) {
        const ii = [h0, h0 + 1, h0 + 2].map((r) => byR.get(r));
        if (ii.some((x) => x == null)) continue;
        let hw = 0, hn = 0;
        for (let r = h0; r < h0 + 12; r++) { const i = byR.get(r); if (i != null) { hn++; hw += D.R.w[i]; } }
        out.push({ m, t, h0, ii, side: D.R.sd[ii[0]], seq: ii.map((i) => (D.R.w[i] ? "V" : "D")).join(""), hw, hn, mapWon: a > b, a, b });
      }
    }
    return out;
  }
  let HAL_LG = null;
  const halLeagueAll = () => HAL_LG || (HAL_LG = D.teams.flatMap((_, t) => halvesOfTeam(t, teamMatches[t])));
  const halFilter = (list) => list.filter((x) => sideOk(x.side) && (!state.halMap || M.map[x.m] === state.halMap));
  // os momentos da abertura: condição (prefixo da sequência) e o round que decide
  const HAL_MOMENTS = [
    { key: "pistol", label: "Pistol", q: "Vence o pistol?", pre: "", k: 0 },
    { key: "antieco", label: "Round 2 depois de vencer o pistol", q: "Converte o anti-eco?", pre: "V", k: 1 },
    { key: "bonus", label: "Round 3 depois de abrir 2–0", q: "Fecha o 3–0 (o adversário costuma estar no 1º armado)?", pre: "VV", k: 2 },
    { key: "r2loss", label: "Round 2 depois de perder o pistol", q: "Rouba o round 2 em eco ou force?", pre: "D", k: 1 },
    { key: "armado", label: "1º round armado depois de 0–2", q: "Vence o 1º round com armas completas (o adversário costuma estar em bonus)?", pre: "DD", k: 2 },
    { key: "oneone", label: "Round 3 depois de 1–1", q: "Desempata o 3º round?", pre: "1-1", k: 2 },
  ];
  const momentIn = (mo, x) => (mo.pre === "1-1" ? (x.seq.slice(0, 2) === "VD" || x.seq.slice(0, 2) === "DV") : x.seq.startsWith(mo.pre));
  function momentStat(mo, list) {
    const el = list.filter((x) => momentIn(mo, x));
    const ok = el.filter((x) => x.seq[mo.k] === "V");
    const mw = (l) => (l.length ? l.filter((x) => x.mapWon).length / l.length : null);
    return { n: el.length, w: ok.length, v: el.length ? ok.length / el.length : null, mapOk: mw(ok), mapKo: mw(el.filter((x) => x.seq[mo.k] === "D")), nOk: ok.length, nKo: el.length - ok.length };
  }
  const pctOrDash = (v) => (v == null ? "—" : NF0.format(100 * v) + "%");

  function halMoments(team, lg) {
    const cards = HAL_MOMENTS.map((mo) => {
      const s = momentStat(mo, team), L = momentStat(mo, lg);
      const gap = s.v != null && L.v != null ? s.v - L.v : null;
      const weak = gap != null && s.n >= 5 && gap <= -0.1, strong = gap != null && s.n >= 5 && gap >= 0.1;
      const swing = L.mapOk != null && L.mapKo != null ? L.mapOk - L.mapKo : null;
      return h("div", { class: "hal-card" + (weak ? " weak" : strong ? " strong" : "") },
        h("div", { class: "hc-top" }, h("span", { class: "hc-l" }, mo.label), weak ? statusChip("abaixo") : strong ? statusChip("acima") : null),
        h("div", { class: "hc-q" }, mo.q),
        h("div", { class: "hc-v" }, h("b", null, s.n ? `${s.w} de ${s.n}` : "—"), h("span", null, s.n ? ` ${pctOrDash(s.v)}` : ""), h("span", { class: "mut" }, ` · liga ${pctOrDash(L.v)}`)),
        h("div", { class: "hc-sw" }, swing == null ? "" : `Na liga, vencer este round leva a ${pctOrDash(L.mapOk)} de mapas ganhos; perder, a ${pctOrDash(L.mapKo)} (${swing >= 0 ? "+" : "−"}${NF0.format(Math.abs(swing * 100))} pp).`),
        s.n ? h("div", { class: "hc-sw mut" }, `Com o time: ${pctOrDash(s.mapOk)} quando vence (${s.nOk}) · ${pctOrDash(s.mapKo)} quando perde (${s.nKo}).`) : null);
    });
    return h("div", null, h("div", { class: "hal-cards" }, cards),
      h("p", { class: "note" }, "Abaixo/Acima do esperado = 10 pp ou mais de diferença para a liga, com pelo menos 5 halves. Os pp em cada cartão mostram quanto aquele round costuma pesar no resultado do mapa: ajuda a decidir o que treinar primeiro."));
  }

  // árvore de caminhos: half → pistol → round 2 → round 3 → % de mapas ganhos
  function halTree(team, lg) {
    const nodes = [];
    const walk = (pre) => {
      const el = team.filter((x) => x.seq.startsWith(pre)), le = lg.filter((x) => x.seq.startsWith(pre));
      return { pre, n: el.length, ln: le.length, mw: el.length ? el.filter((x) => x.mapWon).length / el.length : null,
               lmw: le.length ? le.filter((x) => x.mapWon).length / le.length : null,
               hw: el.length ? d3.sum(el, (x) => x.hw) / d3.sum(el, (x) => x.hn) : null, lhw: le.length ? d3.sum(le, (x) => x.hw) / d3.sum(le, (x) => x.hn) : null };
    };
    for (const p of ["", "V", "D", "VV", "VD", "DV", "DD", "VVV", "VVD", "VDV", "VDD", "DVV", "DVD", "DDV", "DDD"]) nodes.push(walk(p));
    const N = new Map(nodes.map((x) => [x.pre, x]));
    const leaves = nodes.filter((x) => x.pre.length === 3);
    const box = chartBox((w) => (w < 560 ? 520 : 440), (svg, w, hh) => {
      const narrow = w < 560;
      const cols = narrow ? [8, w * 0.2, w * 0.4, w * 0.6] : [10, w * 0.16, w * 0.34, w * 0.52];
      const leafX = narrow ? w * 0.6 : w * 0.52;
      const top = 30, bot = hh - 10;
      const yLeaf = d3.scalePoint().domain(leaves.map((x) => x.pre)).range([top + 14, bot - 14]);
      const yOf = (pre) => { const ls = leaves.filter((x) => x.pre.startsWith(pre)).map((x) => yLeaf(x.pre)); return d3.mean(ls); };
      const xOf = (pre) => cols[pre.length];
      const maxN = Math.max(1, N.get("").n);
      ["Half", "Pistol", "Round 2", "Round 3"].forEach((t, k) => svg.append("text").attr("class", "lbl-m").attr("x", cols[k] + (k ? 0 : 0)).attr("y", 14).style("font-size", "11px").text(t));
      svg.append("text").attr("class", "lbl-m").attr("x", leafX + 70).attr("y", 14).style("font-size", "11px").text(narrow ? "Mapas ganhos" : "Mapas ganhos · time × liga   ·   rounds vencidos no half");
      // arestas
      for (const x of nodes) {
        if (!x.pre) continue;
        const par = N.get(x.pre.slice(0, -1));
        const won = x.pre.endsWith("V");
        const share = par.n ? x.n / par.n : null, lshare = par.ln ? x.ln / par.ln : null;
        const sw = x.n ? 1.5 + 12 * Math.sqrt(x.n / maxN) : 1;
        const x0 = xOf(par.pre) + (par.pre ? 14 : 30), y0 = yOf(par.pre), x1 = xOf(x.pre) - 14, y1 = yOf(x.pre);
        const path = d3.linkHorizontal()({ source: [x0, y0], target: [x1, y1] });
        const g = svg.append("g");
        g.append("path").attr("d", path).attr("fill", "none").attr("stroke", css(won ? "--good" : "--bad")).attr("stroke-opacity", x.n ? 0.38 : 0.12).attr("stroke-width", sw);
        // rótulo: % do time a partir do nó-pai (e liga)
        if (par.n || par.ln) {
          const weak = won && share != null && lshare != null && par.n >= 5 && share - lshare <= -0.1;
          const fx = par.pre.length === 2 ? 0.72 : 0.5, lx = x0 + fx * (x1 - x0), ly = y0 + fx * (y1 - y0);
          g.append("text").attr("class", "lbl-v").attr("x", lx).attr("y", ly - 5).attr("text-anchor", "middle").style("font-size", "11px")
            .style("font-weight", weak ? 700 : 500).style("fill", weak ? css("--bad") : null)
            .text(`${x.n}${share != null ? ` · ${NF0.format(100 * share)}%` : ""}`);
          if (!narrow) g.append("text").attr("class", "lbl-m").attr("x", lx).attr("y", ly + 9).attr("text-anchor", "middle").style("font-size", "9.5px").text(`liga ${pctOrDash(lshare)}`);
        }
        tipOn(g, `<b>${x.pre.split("").map((c, k) => `${["pistol", "round 2", "round 3"][k]} ${c === "V" ? "venceu" : "perdeu"}`).join(" → ")}</b><br>time: ${x.n} de ${par.n} halves (${pctOrDash(share)})<br>liga: ${pctOrDash(lshare)}<br>mapas ganhos depois desse caminho: time ${pctOrDash(x.mw)} · liga ${pctOrDash(x.lmw)}`);
      }
      // nós
      for (const x of nodes) {
        const cx = xOf(x.pre), cy = yOf(x.pre);
        if (!x.pre) {
          svg.append("rect").attr("x", cx).attr("y", cy - 13).attr("width", 30).attr("height", 26).attr("rx", 6).attr("fill", css("--panel-2")).attr("stroke", css("--line"));
          svg.append("text").attr("class", "lbl-v").attr("x", cx + 15).attr("y", cy + 4).attr("text-anchor", "middle").style("font-size", "11px").text(x.n);
          continue;
        }
        const won = x.pre.endsWith("V");
        svg.append("rect").attr("x", cx - 13).attr("y", cy - 11).attr("width", 26).attr("height", 22).attr("rx", 5).attr("fill", css(won ? "--good" : "--bad")).attr("fill-opacity", x.n ? 1 : 0.25);
        svg.append("text").attr("x", cx).attr("y", cy + 4).attr("text-anchor", "middle").style("font", "600 11px var(--f-body)").style("fill", css("--panel")).text(won ? "V" : "D");
      }
      // folhas: mapas ganhos
      const bx = d3.scaleLinear().domain([0, 1]).range([0, narrow ? w - leafX - 70 : Math.min(180, w * 0.22)]);
      for (const x of leaves) {
        const y = yLeaf(x.pre), x0 = leafX + 22;
        const g = svg.append("g").attr("opacity", x.n ? 1 : 0.35);
        g.append("text").attr("class", "lbl-m").attr("x", x0).attr("y", y + 4).style("font-size", "11px").style("font-family", "var(--f-mono)").text(x.pre.split("").join("·"));
        const bx0 = x0 + 46;
        g.append("rect").attr("x", bx0).attr("y", y - 6).attr("width", bx(1)).attr("height", 12).attr("rx", 3).attr("fill", css("--line")).attr("fill-opacity", .5);
        if (x.mw != null) g.append("rect").attr("x", bx0).attr("y", y - 6).attr("width", bx(x.mw)).attr("height", 12).attr("rx", 3).attr("fill", css("--accent")).attr("fill-opacity", .8);
        if (x.lmw != null) g.append("rect").attr("x", bx0 + bx(x.lmw) - 1).attr("y", y - 9).attr("width", 2.5).attr("height", 18).attr("fill", css("--ref"));
        g.append("text").attr("class", "lbl-v").attr("x", bx0 + bx(1) + 6).attr("y", y + 4).style("font-size", "11px")
          .text(x.n ? `${pctOrDash(x.mw)} (${x.n})` + (narrow ? "" : `   ·   ${pctOrDash(x.hw)} dos rounds do half`) : "—");
        tipOn(g, `<b>${x.pre}</b> nos 3 primeiros rounds<br>time: ${x.n} halves · mapas ganhos ${pctOrDash(x.mw)} · venceu ${pctOrDash(x.hw)} dos rounds do half<br>liga: mapas ganhos ${pctOrDash(x.lmw)} · ${pctOrDash(x.lhw)} dos rounds do half`);
      }
    });
    return h("div", null, legendRow([["round vencido", "--good"], ["round perdido", "--bad"], ["mapas ganhos pelo time", "--accent"], ["liga", "--ref"]]), box,
      h("p", { class: "note" }, "Cada caminho é a sequência dos 3 primeiros rounds de um half (V = venceu, D = perdeu). Nas linhas: quantos halves seguiram por ali e a % a partir do round anterior (em vermelho quando o time fica 10 pp ou mais abaixo da liga). À direita: % de mapas ganhos depois de cada caminho (traço roxo = liga) e % dos rounds do half que o time venceu."));
  }

  // grade por mapa × lado com as aberturas de cada partida
  function halGrid(team) {
    const t = state.team;
    const maps = [...new Set(team.map((x) => M.map[x.m]))].sort();
    if (!maps.length) return h("div", { class: "empty" }, "Sem halves no recorte.");
    const sides = state.side === "all" ? [0, 1] : [state.side === "atk" ? 0 : 1];
    const cell = (mp, sd) => {
      const l = team.filter((x) => M.map[x.m] === mp && x.side === sd).sort((a, b) => T.pos.get(a.m) - T.pos.get(b.m));
      if (!l.length) return h("td", { class: "mut" }, "—");
      const st = (mo) => momentStat(HAL_MOMENTS.find((x) => x.key === mo), l);
      const p = st("pistol"), ae = st("antieco"), ar = st("armado");
      const chip = (x) => h("button", { class: "hseq " + (x.mapWon ? "mw" : "ml"), type: "button", onclick: () => setPos(T.pos.get(x.m)),
        title: `#${T.pos.get(x.m) + 1} · ${fmtDate(M.date[x.m])} · vs ${prettyTeam(D.teams[opp(x.m, t)])} · ${x.h0 ? "2º" : "1º"} half: ${x.hw} de ${x.hn} rounds · mapa ${x.a}–${x.b} ${x.mapWon ? "(venceu)" : "(perdeu)"} · clique para abrir` },
        x.seq.split("").map((c) => h("i", { class: c === "V" ? "w" : "l" })), h("span", null, x.mapWon ? "V" : "D"));
      return h("td", null,
        h("div", { class: "hg-stats" },
          h("span", null, h("b", null, `${p.w}/${p.n}`), " pistol"),
          ae.n ? h("span", { class: ae.n >= 3 && ae.v < 0.6 ? "d-bad" : null }, h("b", null, `${ae.w}/${ae.n}`), " anti-eco") : null,
          ar.n ? h("span", { class: ar.n >= 3 && ar.v < 0.4 ? "d-bad" : null }, h("b", null, `${ar.w}/${ar.n}`), " 1º armado") : null),
        h("div", { class: "hg-chips" }, l.map(chip)));
    };
    return h("div", null, h("div", { class: "tbl-wrap" }, h("table", { class: "mt hal-grid" },
      h("thead", null, h("tr", null, h("th", null, "Mapa"), sides.map((sd) => h("th", null, sd === 0 ? "Half no ataque" : "Half na defesa")))),
      h("tbody", null, maps.map((mp) => h("tr", null, h("td", null, h("b", null, mp)), sides.map((sd) => cell(mp, sd))))))),
      h("p", { class: "note" }, "Cada bloco é uma abertura de half: 3 quadrados = rounds 1–3 (ou 13–15), verde venceu e vermelho perdeu; a letra ao lado é o resultado do mapa. Clique para abrir a partida. Em vermelho: anti-eco abaixo de 60% ou 1º armado abaixo de 40% com 3+ casos (na liga: 86% e 57%)."));
  }

  function renderHAL(main) {
    const ms = state.halScope === "ultimas_10" ? T.ms.slice(-10) : T.ms;
    const maps = [...new Set(T.ms.map((m) => M.map[m]))].sort();
    if (state.halMap && !maps.includes(state.halMap)) state.halMap = null;
    const team = halFilter(halvesOfTeam(state.team, ms)), lg = halFilter(halLeagueAll());
    const ctl = h("div", { class: "ctl-row" },
      h("span", { class: "flbl" }, "Lado do half"), seg([["all", "Todos"], ["atk", "Ataque"], ["def", "Defesa"]], state.side, (v) => setPref("side", v), "Lado"),
      h("span", { class: "flbl" }, "Partidas"), seg([["todas", `Todas (${T.ms.length})`], ["ultimas_10", "Últimas 10"]], state.halScope, (v) => { state.halScope = v; render(); }, "Partidas"),
      h("span", { class: "flbl" }, "Mapa"), seg([["", "Todos"], ...maps.map((m) => [m, m])], state.halMap || "", (v) => { state.halMap = v || null; render(); }, "Mapa"));
    const scopeTxt = `${team.length} halves${state.halMap ? " em " + state.halMap : ""}${state.side === "all" ? "" : state.side === "atk" ? " no ataque" : " na defesa"}; liga no mesmo recorte.`;
    const an = analysisPanel("HAL");
    main.append(h("div", { class: "sec-head" }, h("h1", null, "Início de half")),
      ...(an ? [...an, h("h2", { class: "sec-sub" }, "Aberturas")] : []),
      ctl,
      panel("Os momentos da abertura", "Em cada passo do pistol ao 3º round, quanto o time converte, comparado com a liga, e quanto esse round pesa no mapa. " + scopeTxt, halMoments(team, lg)),
      panel("Caminhos da abertura e o resultado do mapa", "Para onde vão os halves do time depois do pistol, e com que resultado.", halTree(team, lg)),
      panel("Por mapa e lado", "Onde a abertura falha: pistol, anti-eco e 1º armado por mapa e pelo lado do half.", halGrid(team)));
  }
  // ================================================================== DIAGNÓSTICO: fundamentos coletivos
  // Tudo aqui vem de outputs/fundamentals (eventos com contexto, esperado leave-one-team-out, padrões e evidências).
  // No navegador só há somas (Σy, Σp) sobre os eventos do recorte, como no resto do painel.
  const FU = D.FUND || null;
  const FK = FU ? Object.keys(FU.F) : [];
  const FX = {};  // índices por fundamento
  for (const fk of FK) {
    FU.F[fk].E.m = unrle(FU.F[fk].E.m);
    const F = FU.F[fk], E = F.E, byTeam = D.teams.map(() => []);
    for (let i = 0; i < E.t.length; i++) if (E.t[i] != null) byTeam[E.t[i]].push(i);
    const kp = new Map(), ev = new Map();
    for (let i = 0; i < F.KP.m.length; i++) { const key = F.KP.m[i] + "|" + F.KP.r[i] + "|" + F.KP.k[i]; (kp.get(key) || kp.set(key, []).get(key)).push(i); }
    for (let i = 0; i < F.EV.f.length; i++) (ev.get(F.EV.f[i]) || ev.set(F.EV.f[i], []).get(F.EV.f[i])).push(i);
    FX[fk] = { byTeam, kp, ev };
  }
  const KIDX = new Map();
  for (let i = 0; i < D.K.m.length; i++) KIDX.set(D.K.m[i] + "|" + D.K.r[i] + "|" + D.K.ki[i], i);
  // textos de cada fundamento
  const FUI = {
    trade: { title: "Trade kill", noun: "mortes", nounSing: "morte", unit: "trades", unitSing: "trade", did: "trocadas",
             q: () => `Quando alguém morre com um aliado vivo, o time mata o autor em até ${state.dwin} s?`,
             none: "Mortes com aliado vivo", expWord: "trocam",
             dims: ["ally_dist", "allies_near_b", "side", "phase", "numbers", "map_name", "victim_name", "nearest_ally_name", "economy", "fb_context"] },
    advantage: { title: "Preservação de vantagem", noun: "vantagens", nounSing: "vantagem", unit: "rounds", unitSing: "round", did: "convertidas",
                 q: () => "Quando o time passa a ter mais jogadores vivos que o adversário, ele vence o round?",
                 none: "Vantagens numéricas", expWord: "convertem",
                 dims: ["state", "side", "spike", "when", "map_name", "economy"],
                 evBelow: "Vantagens que viraram derrota nas situações em que outros times mais convertem.",
                 evAbove: "Vantagens convertidas onde outros times raramente convertem.",
                 limit: "A vantagem é medida pelo nº de vivos; utilitários, posição e economia restante do round não entram no esperado.",
                 mapTitle: "Posições quando a vantagem começou", tag: "vantagem começa",
                 mapNote: "Snapshot do jogo na kill que deu a vantagem. A linha liga quem morreu a quem matou." },
    fb_open: { title: "First blood", tab: "Abertura", noun: "aberturas", nounSing: "abertura", unit: "first bloods", unitSing: "first blood", did: "vencidas",
               q: () => "O time vence o primeiro duelo do round com a frequência de times parecidos?",
               none: "Duelos de abertura", expWord: "vencem",
               dims: ["duel_name", "duel_role", "side", "when", "map_name", "economy"], dimNames: { duel_name: "Jogador no duelo", duel_role: "Função no duelo", when: "Quando saiu o FB" },
               evBelow: "Duelos de abertura perdidos nas situações em que outros times mais fazem o first blood.",
               evAbove: "First bloods feitos onde outros times raramente fazem.",
               limit: "O duelo de abertura é registrado pelo abate; quem estava em posição de risco sem morrer, utilitários e informação prévia não aparecem nos dados.",
               mapTitle: "Posições no first blood", tag: "first blood",
               mapNote: "Snapshot do jogo no first blood. A linha liga quem morreu a quem matou." },
    fb_rec: { title: "First blood", tab: "Depois de sofrer", noun: "rounds", nounSing: "round", unit: "rounds", unitSing: "round", did: "vencidos",
              q: () => "Depois de sofrer o first blood (4v5), o time ainda vence o round como times parecidos?",
              none: "Rounds depois de sofrer o first blood", expWord: "vencem",
              dims: ["side", "when", "map_name", "economy", "duel_name", "duel_role"], dimNames: { duel_name: "Quem morreu primeiro", duel_role: "Função de quem morreu primeiro", when: "Quando saiu o FB" },
              evBelow: "Rounds perdidos depois do first blood sofrido, nas situações em que outros times mais se recuperam.",
              evAbove: "Rounds vencidos depois do first blood sofrido, onde outros times raramente se recuperam.",
              limit: "O esperado considera lado, economia, momento do first blood e mapa; não considera quem morreu nem a economia restante depois dele.",
              mapTitle: "Posições no first blood", tag: "first blood sofrido",
              mapNote: "Snapshot do jogo no first blood. A linha liga quem morreu a quem matou." },
  };
  // fundamentos de round (pós-plant, retake, rounds-chave, início de half): uma linha por time-round, desfecho = venceu o round
  const ROUND_FK = new Set(["post", "retake", "keyrounds", "halfopen", "pressure"]);
  Object.assign(FUI, {
    post: { title: "Pós-plant", noun: "plants", nounSing: "plant", unit: "rounds", unitSing: "round", did: "convertidos",
            q: () => "Depois de plantar, o time vence o round como times parecidos (mesmos vivos, site e momento)?",
            none: "Rounds em que o time plantou", expWord: "vencem",
            dims: ["numbers", "pstate", "site", "pwhen", "map_name", "economy"],
            dimNames: { numbers: "Saldo de vivos no plant", pstate: "Vivos no plant", site: "Site", pwhen: "Momento do plant" },
            evBelow: "Plants que viraram derrota nas situações em que outros times mais convertem.",
            evAbove: "Plants convertidos onde outros times raramente convertem.",
            limit: "O esperado considera vivos no plant, site, momento do plant, economia e mapa; posições depois do plant e utilitários não entram." },
    retake: { title: "Retake", noun: "plants sofridos", nounSing: "plant sofrido", unit: "rounds", unitSing: "round", did: "vencidos",
              q: () => "Quando o adversário planta, o time vence o round como times parecidos (mesmos vivos, site e momento)?",
              none: "Rounds com a spike adversária plantada", expWord: "vencem",
              dims: ["numbers", "pstate", "site", "pwhen", "map_name", "economy"],
              dimNames: { numbers: "Saldo de vivos no plant", pstate: "Vivos no plant", site: "Site", pwhen: "Momento do plant" },
              evBelow: "Retakes perdidos nas situações em que outros times mais vencem.",
              evAbove: "Retakes vencidos onde outros times raramente vencem.",
              limit: "O esperado considera vivos no plant, site, momento do plant, economia e mapa; kit de defuse e utilitários não estão nos dados." },
    keyrounds: { title: "Rounds-chave", noun: "rounds", nounSing: "round", unit: "rounds", unitSing: "round", did: "vencidos",
                 q: () => "Em pistol, eco, anti-eco, force buy e rounds armados, o time vence como times parecidos?",
                 none: "Rounds-chave", expWord: "vencem",
                 dims: ["round_type", "side", "map_name", "half", "economy"], dimNames: { round_type: "Tipo de round", half: "Half" },
                 evBelow: "Rounds-chave perdidos nas situações em que outros times mais vencem.",
                 evAbove: "Rounds-chave vencidos onde outros times raramente vencem.",
                 limit: "O esperado considera tipo de round, lado, economia e mapa; a força do adversário não entra." },
    pressure: { title: "Pressão", noun: "rounds decisivos", nounSing: "round decisivo", unit: "rounds", unitSing: "round", did: "vencidos",
                q: () => "Nos rounds que mais valem para o mapa, o time vence como times parecidos (mesmo placar, fase, lado e economia)?",
                none: "Rounds decisivos", expWord: "vencem",
                dims: ["lead", "phase", "side", "map_name", "economy"], dimNames: { lead: "Placar", phase: "Fase do half" },
                evBelow: "Rounds decisivos perdidos nas situações em que outros times mais vencem.",
                evAbove: "Rounds decisivos vencidos onde outros times raramente vencem.",
                limit: "Rounds decisivos = os 25% da base com maior índice de pressão. O esperado considera placar, fase do half, economia, lado e mapa; a força do adversário não entra." },
    halfopen: { title: "Início de half", noun: "rounds", nounSing: "round", unit: "rounds", unitSing: "round", did: "vencidos",
                q: () => "Nos rounds 2 e 3 de cada half, o time converte o caminho do pistol como times parecidos?",
                none: "Rounds 2 e 3 de cada half", expWord: "vencem",
                dims: ["moment", "side", "map_name", "half"], dimNames: { moment: "Momento", half: "Half" },
                evBelow: "Rounds 2 e 3 perdidos nas situações em que outros times mais vencem.",
                evAbove: "Rounds 2 e 3 vencidos onde outros times raramente vencem.",
                limit: "O esperado considera o caminho do half até ali (pistol e round 2) e a economia; lado e mapa não melhoraram o modelo." },
  });
  FUI.trade.evBelow = null; FUI.trade.evAbove = "Trocas que aconteceram onde outros times raramente trocam.";
  FUI.trade.limit = "Distâncias vêm do snapshot no instante da morte: proximidade não prova linha de visão nem oportunidade real de trade.";
  const FB_KEYS = ["fb_open", "fb_rec"].filter((k) => FK.includes(k));
  const dimName = (fk, d) => (FUI[fk].dimNames && FUI[fk].dimNames[d]) || DIM_NAME[d];
  const CATDIMS = new Set(["side", "phase", "numbers", "ally_dist", "allies_near_b", "economy", "fb_context", "state", "spike", "when", "duel_role",
    "pstate", "site", "pwhen", "round_type", "half", "moment", "lead"]);
  const DIM_NAME = { side: "Lado", map_name: "Mapa", phase: "Momento do round", numbers: "Nº de jogadores", ally_dist: "Distância do aliado mais próximo",
                     allies_near_b: "Aliados a até 15 m", economy: "Economia", fb_context: "First blood", victim_name: "Quem morreu", nearest_ally_name: "Aliado mais próximo",
                     state: "Situação", spike: "Spike", when: "Quando começou", duel_role: "Função", duel_name: "Jogador" };
  const VAL_ORDER = { ally_dist: ["≤ 5 m", "5–10 m", "10–20 m", "20–30 m", "> 30 m", "sem posição"], allies_near_b: ["0", "1", "2+", "sem posição"],
                      phase: ["1ª morte do round", "pré-plant", "pós-plant"], numbers: ["em vantagem", "igualdade", "em desvantagem"],
                      state: ["5v4", "4v3", "3v2", "2v1", "5v3", "4v2", "3v1", "5v2", "4v1", "5v1"], when: ["até 15 s", "15–35 s", "depois de 35 s"],
                      spike: ["não plantada", "plantada"], duel_role: ["Duelista", "Iniciador", "Controlador", "Sentinela", "?"],
                      economy: ["pistol", "equipamento inferior", "equipamento equilibrado", "equipamento superior"],
                      pwhen: ["até 30 s", "30–60 s", "depois de 60 s"], site: ["A", "B", "C"], round_type: ["pistol", "eco", "anti-eco", "force buy", "armado"],
                      half: ["1º half", "2º half", "prorrogação"], lead: ["na frente", "empatado", "atrás"],
                      moment: ["round 2 depois de vencer o pistol", "round 2 depois de perder o pistol", "round 3 depois de 2–0", "round 3 depois de 1–1", "round 3 depois de 0–2"] };
  const VAL_LBL = { side: { atk: "ataque", def: "defesa" }, allies_near_b: { "0": "nenhum", "1": "1 aliado", "2+": "2 ou mais" } };
  const vlbl = (dim, v) => (VAL_LBL[dim] && VAL_LBL[dim][v]) || v;

  const Fd = (fk) => FU.F[fk];
  function dval(fk, dim, i) {
    const F = Fd(fk), E = F.E;
    if (CATDIMS.has(dim) && F.cats[dim]) return F.cats[dim][E[dim][i]];
    if (dim === "map_name") return M.map[E.m[i]];
    if (dim === "victim_name" || dim === "duel_name") return D.players[E.v[i]];
    if (dim === "nearest_ally_name") return E.a[i] == null ? null : D.players[E.a[i]];
    return null;
  }
  function yOf(fk, i) { const E = Fd(fk).E; return fk === "trade" ? (E.yb[i] >> Fd(fk).meta.windows.indexOf(state.dwin)) & 1 : E.y[i]; }
  function pOf(fk, i) { const E = Fd(fk).E; return (fk === "trade" ? E["p" + state.dwin][i] : E.p[i]) / 1000; }
  function scopeEvents(fk, team, scope) {
    let ev = FX[fk].byTeam[team];
    if (scope && scope.startsWith("ultimas_")) {
      const keep = new Set(teamMatches[team].slice(-Number(scope.split("_")[1])));
      ev = ev.filter((i) => keep.has(Fd(fk).E.m[i]));
    }
    return ev;
  }
  const inSlice = (fk, dims) => (i) => Object.entries(dims).every(([k, v]) => dval(fk, k, i) === v);
  function agg(fk, ev) {
    let n = 0, y = 0, p = 0;
    for (const i of ev) { n++; y += yOf(fk, i); p += pOf(fk, i); }
    return { n, y, p, obs: n ? y / n : null, exp: n ? p / n : null, gap: n ? (100 * (y - p)) / n : null, vs: y - p };
  }
  const pct = (v) => (v == null ? "—" : NF0.format(100 * v) + "%");
  const pp = (v) => (v == null || !isFinite(v) ? "—" : (Math.abs(v) < 0.5 ? "±" : v > 0 ? "+" : "−") + NF0.format(Math.abs(v)) + " pp");
  const unitsVs = (fk, vs) => { const a = Math.round(Math.abs(vs)), u = FUI[fk]; return a === 0 ? `o mesmo número de ${u.unit}` : `${a} ${a === 1 ? u.unitSing : u.unit} a ${vs < 0 ? "menos" : "mais"}`; };
  const fdRows = (fk, team, scope) => { const FD = Fd(fk).FD; return range(0, FD.id.length).filter((i) => FD.t[i] === team && FD.scope[i] === scope); };
  const scopeName = (sc) => (sc === "todas" ? "todas as partidas" : `últimas ${sc.split("_")[1]} partidas`);
  const openPat = (fk, i, rv) => () => {
    state.patFrom = state.section !== "diag" ? state.section : null;  // volta para a seção de onde veio
    state.section = "diag"; state.dfund = fk; state.pat = i; state.rv = rv && !ROUND_FK.has(fk) ? { j: 0 } : null; render(); window.scrollTo({ top: 0 });
  };

  // ------------------------------------------------------------------ tela 1: fundamentos
  function fbMinis(fk, ev) {
    const E = Fd(fk).E;
    if (fk === "fb_open") {
      let gN = 0, gW = 0, gP = 0, lN = 0, lW = 0, lP = 0, du = 0, ts = 0;
      const duel = Fd(fk).cats.duel_role.indexOf("Duelista");
      for (const i of ev) {
        ts += E.ts[i]; if (E.duel_role[i] === duel) du++;
        if (E.y[i]) { if (E.pc[i] != null) { gN++; gW += E.w[i]; gP += E.pc[i] / 1000; } }
        else if (E.pr[i] != null) { lN++; lW += E.w[i]; lP += E.pr[i] / 1000; }
      }
      const n = ev.length || 1;
      return h("div", { class: "minis" },
        h("div", null, h("span", { class: "k" }, "Venceu o round depois de fazer o FB"), h("b", null, pct(gN ? gW / gN : null)), h("small", null, `${gW} de ${gN} · esperado ${pct(gN ? gP / gN : null)}`)),
        h("div", null, h("span", { class: "k" }, "Venceu o round depois de sofrer o FB"), h("b", null, pct(lN ? lW / lN : null)), h("small", null, `${lW} de ${lN} · esperado ${pct(lN ? lP / lN : null)}`)),
        h("div", null, h("span", { class: "k" }, "Duelos de abertura com duelistas"), h("b", null, pct(du / n)), h("small", null, `${du} de ${ev.length} aberturas`)),
        h("div", null, h("span", { class: "k" }, "Momento médio do first blood"), h("b", null, NF1.format(ts / n) + " s"), h("small", null, "segundos de jogo no round")));
    }
    let tN = 0, tW = 0, uN = 0, uW = 0;
    for (const i of ev) { if (E.tr[i]) { tN++; tW += E.y[i]; } else { uN++; uW += E.y[i]; } }
    return h("div", { class: "minis" },
      h("div", null, h("span", { class: "k" }, `1ª morte trocada em ${FU.F.trade ? FU.F.trade.meta.window : 5} s`), h("b", null, pct(ev.length ? tN / ev.length : null)), h("small", null, `${tN} de ${ev.length} rounds`)),
      h("div", null, h("span", { class: "k" }, "Venceu quando a 1ª morte foi trocada"), h("b", null, pct(tN ? tW / tN : null)), h("small", null, `${tW} de ${tN}`)),
      h("div", null, h("span", { class: "k" }, "Venceu quando não foi trocada"), h("b", null, pct(uN ? uW / uN : null)), h("small", null, `${uW} de ${uN}`)));
  }
  function fbToggle(team) {
    const count = (fk) => fdRows(fk, team, state.dscope).filter((i) => Fd(fk).FD.sel[i]).length;
    return seg(FB_KEYS.map((k) => { const c = count(k); return [k, FUI[k].tab + (c ? ` · ${c} ${c === 1 ? "padrão" : "padrões"}` : "")]; }), state.dfb,
      (v) => { state.dfb = v; render(); });
  }
  function fundCard(fk, team) {
    const F = Fd(fk), FD = F.FD, U = FUI[fk];
    const rows = fdRows(fk, team, state.dscope);
    const g0 = rows.find((i) => FD.level[i] === 0);
    const ev = scopeEvents(fk, team, state.dscope);
    const a = agg(fk, ev);
    const isDef = fk !== "trade" || state.dwin === F.meta.window;
    const sig = g0 != null && FD.sel[g0] && isDef;
    const pats = rows.filter((i) => FD.sel[i] && FD.level[i] > 0);
    const below = pats.filter((i) => FD.dir[i] === "abaixo"), above = pats.filter((i) => FD.dir[i] === "acima");
    const nm = new Set(ev.map((i) => F.E.m[i])).size;
    const verdict = sig ? h("p", { class: "verdict " + (FD.dir[g0] === "abaixo" ? "bad" : "good") },
      `Padrão observado: ${FD.dir[g0]} do esperado de forma recorrente, em ${Math.round(FD.rec[g0] * FD.nrec[g0])} de ${FD.nrec[g0]} partidas.`)
      : h("p", { class: "verdict" }, isDef ? "No geral, a diferença ainda não se distingue do acaso para esse tamanho de amostra."
        : `Janela de ${state.dwin} s: só observado e esperado; o detector de padrões usa ${F.meta.window} s.`);
    const pr = (i) => h("li", { class: "pat " + FD.dir[i], onclick: openPat(fk, i, false) },
      h("div", { class: "pat-main" }, h("span", { class: "pat-lbl" }, FD.label[i]),
        h("span", { class: "pat-sub" }, `${pct(FD.obs[i])} ${U.did} · esperado ${pct(FD.exp[i])} · ${FD.n[i]} ${U.noun} em ${FD.nm[i]} partidas · aparece em ${Math.round(FD.rec[i] * FD.nrec[i])} de ${FD.nrec[i]}`)),
      h("div", { class: "pat-num" }, h("b", null, pp(FD.gap[i])), h("span", null, unitsVs(fk, FD.vs[i]))));
    const cap = 6;
    const list = (arr) => h("ul", { class: "pats" }, arr.slice(0, state.dmore[fk] ? arr.length : cap).map(pr));
    let extra = FB_KEYS.includes(fk) ? fbMinis(fk, ev) : null;
    if (fk === "advantage") {  // descritivos: perder a vantagem, colapso, sequências sem resposta
      const E = F.E; let lo = 0, pl = 0, co = 0, un = 0, hs = 0, hn = 0;
      for (const i of ev) { lo += E.lo[i]; pl += E.pl[i] / 1000; co += E.co[i]; un += E.un[i]; if (E.lo[i]) { hs += E.hs[i]; hn++; } }
      const n = ev.length || 1;
      extra = h("div", { class: "minis" },
        h("div", null, h("span", { class: "k" }, "Perdeu a vantagem depois"), h("b", null, pct(lo / n)), h("small", null, `${lo} de ${ev.length} · esperado ${pct(pl / n)}`)),
        h("div", null, h("span", { class: "k" }, "Perdeu 2 em ≤ 5 s depois"), h("b", null, pct(co / n)), h("small", null, `${co} de ${ev.length} vantagens`)),
        h("div", null, h("span", { class: "k" }, "Tempo até perder a vantagem"), h("b", null, hn ? NF1.format(hs / hn) + " s" : "—"), h("small", null, `média nas ${hn} perdidas`)),
        h("div", null, h("span", { class: "k" }, "Mortes seguidas sem resposta"), h("b", null, NF1.format(un / n)), h("small", null, "maior sequência, média")));
    }
    return h("section", { class: "panel fund" },
      h("div", { class: "fund-head" }, h("div", null, h("h2", null, U.title), h("p", { class: "sub" }, U.q())),
        FB_KEYS.includes(fk) ? h("span", { class: "chip-p mut" }, "complementar") : h("span", { class: "chip-p" }, "prioridade")),
      FB_KEYS.includes(fk) && FB_KEYS.length > 1 ? h("div", { class: "ctl-row fb-tabs" }, fbToggle(team)) : null,
      h("div", { class: "bigstats" },
        h("div", null, h("span", { class: "k" }, "Observado"), h("b", null, pct(a.obs)), h("small", null, `${a.y} de ${a.n} ${U.noun}`)),
        h("div", null, h("span", { class: "k" }, "Esperado em situações parecidas"), h("b", { class: "mut" }, pct(a.exp)), h("small", null, "outros times, mesmo contexto")),
        h("div", null, h("span", { class: "k" }, "Diferença"), h("b", { class: sig ? (a.gap < 0 ? "d-bad" : "d-good") : "" }, pp(a.gap)),
          h("small", null, isDef && g0 != null && FD.lo[g0] != null && tierOf(a.gap) !== "dentro" ? ((FD.lo[g0] > 0 || FD.hi[g0] < 0) ? SIG_STRONG : SIG_WEAK) : "")),
        h("div", null, h("span", { class: "k" }, `Em ${nm} partidas`), h("b", { class: sig ? (a.vs < 0 ? "d-bad" : "d-good") : "" }, (a.vs < 0 ? "−" : "+") + NF0.format(Math.abs(a.vs))),
          h("small", null, `${U.unit} vs. o esperado`))),
      extra, verdict,
      isDef ? h("div", null,
        below.length ? h("div", null, h("h3", null, "Fragilidades potenciais"), list(below)) : null,
        above.length ? h("div", null, h("h3", null, "Pontos fortes"), list(above)) : null,
        Math.max(below.length, above.length) > cap ? h("button", { class: "more-btn", type: "button", onclick: () => { state.dmore[fk] = !state.dmore[fk]; render(); } },
          state.dmore[fk] ? "Mostrar só os principais" : `Mostrar todos os ${pats.length} padrões`) : null,
        !pats.length ? h("div", { class: "nopat" }, h("b", null, "Nenhum recorte com evidência suficiente."),
          ` O detector só aponta um padrão quando a diferença é grande, se repete entre partidas e passa no limiar calibrado (em dados simulados sem padrão real, ${NF0.format(100 * F.meta.null_team_rate)}% dos times recebem algum padrão).`) : null) : null,
      g0 != null ? h("div", { class: "fund-actions" },
        h("button", { class: "btn", type: "button", onclick: openPat(fk, g0, false) }, "Onde a diferença é maior →"),
        h("button", { class: "btn ghost", type: "button", onclick: openPat(fk, g0, true) }, "Rounds para revisar →")) : null);
  }
  function soonCard(title, q, when) {
    return h("section", { class: "panel fund soon" }, h("div", { class: "fund-head" }, h("div", null, h("h2", null, title), h("p", { class: "sub" }, q)), h("span", { class: "chip-p mut" }, when)));
  }
  function methodNote() {
    const C = FU.meta.criteria, T = FU.F.trade ? FU.F.trade.meta : null, A = FU.F.advantage ? FU.F.advantage.meta : null;
    const FBO = FU.F.fb_open ? FU.F.fb_open.meta : null, FBR = FU.F.fb_rec ? FU.F.fb_rec.meta : null;
    const mline = (name, m) => `${name}: regressão logística (${m.model}) escolhida contra a taxa global e médias por célula em validação separada por série (${m.n_series} séries): log-loss ${NF2.format(m.cv_log_loss)} vs ${NF2.format(m.m0_log_loss)}, erro de calibração ${NF1.format(100 * m.cv_ece)} pp. Limiar |z| ≥ ${NF2.format(m.z_star)}; em dados sem padrão real, ${NF1.format(100 * m.null_team_rate)}% dos times recebem algum padrão; déficit plantado de 12 pp (${m.planted_what.replace(/, .*$/, "")}) encontrado em ${m.planted_hits} de ${m.planted_n} testes.`;
    return h("details", { class: "method" }, h("summary", null, "Como o esperado e os padrões são calculados"),
      h("ul", null,
        T ? h("li", null, `Trade kill: cada morte por inimigo em jogo em que a vítima tinha pelo menos 1 aliado vivo; trade = um aliado mata o autor em até ${T.windows.join(", ")} s. Esperado a partir do contexto no instante da morte (distância e nº de aliados por perto, momento, nº de vivos, lado, economia, mapa).`) : null,
        A ? h("li", null, "Preservação de vantagem: a 1ª vez no round em que o time fica com mais jogadores vivos (5v4, 4v3…), sem contar quando o adversário já não tem ninguém. Converteu = venceu o round. Esperado a partir da situação, lado, spike, quando a vantagem começou, economia e mapa.") : null,
        FBO ? h("li", null, "First blood: o 1º abate em adversário do round. Abertura = o time fez o first blood (duas linhas por round, uma por time). Depois de sofrer = rounds em que o time sofreu o first blood; recuperou = venceu o round. Esperado a partir do lado, economia, momento do first blood e mapa. Vencer depois de FAZER o first blood é a vantagem 5v4 do bloco anterior.") : null,
        h("li", null, "O esperado de cada time é estimado sem nenhuma partida dele: nem as linhas do próprio time nem as do adversário naquelas partidas."),
        T ? h("li", null, mline("Trade kill", T)) : null, A ? h("li", null, mline("Vantagem", A)) : null,
        FBO ? h("li", null, mline("First blood (abertura)", FBO)) : null, FBR ? h("li", null, mline("First blood (depois de sofrer)", FBR) +
          (FBR.planted_hits < FBR.planted_n ? " Há menos rounds desse tipo (só os de first blood sofrido), então o detector precisa de diferenças maiores para apontar um padrão aqui." : "")) : null,
        h("li", null, `Padrão: ≥ ${C.min_events} eventos em ≥ ${C.min_matches} partidas, |z| acima do limiar, sinal forte (diferença consistente entre partidas) e a mesma direção em ≥ ${NF0.format(100 * C.min_recurrence)}% das partidas. Diferenças "quase significativas" não são exibidas: em dados sem padrão real elas aparecem em muitos times.`),
        h("li", null, "Linguagem: padrão observado e situação para revisão. Proximidade vem de snapshots no instante da kill e não prova linha de visão; habilidades, comunicação e intenção não estão nos dados.")));
  }
  function renderDiag(main) {
    if (!FU) { main.append(panel("Diagnóstico", null, h("div", { class: "empty" }, "Rode `python -m roundrx fundamentals` para gerar o diagnóstico."))); return; }
    if (state.pat != null && state.rv) return renderEvidenceRound(main);
    if (state.pat != null) return renderPattern(main);
    const team = state.team;
    main.append(
      h("div", { class: "sec-head" }, h("h1", null, "Fundamentos coletivos"),
        h("p", null, "Onde o time fica abaixo (ou acima) do que outros times fazem em situações parecidas, e os rounds para revisar.")),
      diagControls(team), ...FK.filter((fk) => !FB_KEYS.includes(fk)).map((fk) => fundCard(fk, team)),
      FB_KEYS.length ? fundCard(FB_KEYS.includes(state.dfb) ? state.dfb : FB_KEYS[0], team) : null,
      h("div", { class: "grid three" },
        soonCard("Pós-plant e retake", "Execução depois do plant.", "depois")),
      methodNote());
  }
  function diagControls(team, withWin = true) {
    const nAll = teamMatches[team].length, T0 = FU.F.trade && FU.F.trade.meta;
    const scopes = (T0 || Fd(FK[0]).meta).scopes;
    return h("div", { class: "ctl-row diag-ctl" },
      h("span", { class: "flbl" }, "Partidas"), seg(scopes.map((sc) => [sc, sc === "todas" ? `Todas (${nAll})` : `Últimas ${sc.split("_")[1]}`]), state.dscope,
        (v) => { state.dscope = v; state.pat = null; state.rv = null; render(); }),
      T0 && withWin ? h("span", { class: "flbl" }, "Janela de trade") : null, T0 && withWin ? seg(T0.windows.map((w) => [w, `${w} s`]), state.dwin, (v) => { state.dwin = v; render(); }) : null);
  }

  // ------------------------------------------------------------------ tela 2: padrão
  function renderPattern(main) {
    const fk = state.dfund, F = Fd(fk), FD = F.FD, U = FUI[fk], fi = state.pat, team = state.team;
    const dims = FD.dims[fi];
    const ev = scopeEvents(fk, team, FD.scope[fi]).filter(inSlice(fk, dims));
    const a = agg(fk, ev);
    const isDef = fk !== "trade" || state.dwin === F.meta.window;
    const general = FD.level[fi] === 0;
    const from = state.patFrom ? D.sections.find((x) => x.id === state.patFrom) : null;
    const back = h("button", { class: "back", type: "button", onclick: () => { state.pat = null; state.rv = null; if (from) { state.section = from.id; state.patFrom = null; } render(); } },
      "← " + (from ? from.label : "Panorama"));
    const recTxt = FD.rec[fi] != null ? `${Math.round(FD.rec[fi] * FD.nrec[fi])} de ${FD.nrec[fi]} partidas` : "—";
    const status = general ? (FD.sel[fi] ? "Padrão geral do time" : "Visão geral: sem padrão detectado") : (FD.dir[fi] === "abaixo" ? "Fragilidade potencial" : "Ponto forte");
    const nmt = new Set(ev.map((i) => F.E.m[i])).size;
    const interp = general && !FD.sel[fi]
      ? `No conjunto, o time tem ${pct(a.obs)} das ${U.noun} ${U.did}; outros times, em situações parecidas, ${U.expWord} ${pct(a.exp)}. A diferença ainda não se distingue do acaso: use os recortes abaixo para explorar, sem tratá-los como padrão.`
      : `Nessas situações o time tem ${pct(a.obs)} das ${U.noun} ${U.did}; outros times, no mesmo contexto, ${U.expWord} ${pct(a.exp)}. São ${unitsVs(fk, a.vs)} do que o esperado em ${nmt} partidas, e a diferença aparece na mesma direção em ${recTxt}.`;
    const dimsAvail = U.dims.filter((d) => !(d in dims));
    const bd = state.pdim && dimsAvail.includes(state.pdim) ? state.pdim : dimsAvail[0];
    main.append(back,
      h("div", { class: "sec-head" }, h("h1", null, FD.label[fi]), h("p", null, h("span", { class: "badge " + (general && !FD.sel[fi] ? "neutral" : FD.dir[fi]) }, status),
        ` · ${U.title}${U.tab ? " (" + U.tab.toLowerCase() + ")" : ""} · ${scopeName(FD.scope[fi])}${fk === "trade" ? ` · trade em ${state.dwin} s` : ""}`)),
      h("section", { class: "panel" },
        h("div", { class: "bigstats" },
          h("div", null, h("span", { class: "k" }, "Observado"), h("b", null, pct(a.obs)), h("small", null, `${a.y} de ${a.n} ${U.noun}`)),
          h("div", null, h("span", { class: "k" }, "Esperado"), h("b", { class: "mut" }, pct(a.exp)), h("small", null, "outros times, mesmo contexto")),
          h("div", null, h("span", { class: "k" }, "Diferença"), h("b", { class: Math.abs(a.gap) < 0.5 ? "" : a.gap < 0 ? "d-bad" : "d-good" }, pp(a.gap)), h("small", null, Math.abs(a.gap) < 0.5 ? "igual ao esperado" : a.gap > 0 ? "melhor que o esperado" : "pior que o esperado")),
          h("div", null, h("span", { class: "k" }, "Recorrência"), h("b", null, recTxt), h("small", null, "partidas na mesma direção"))),
        h("p", { class: "interp" }, interp)),
      panel("Onde aparece mais", `O mesmo recorte quebrado por outra dimensão. Linhas com menos de 10 ${U.noun} ficam apagadas: servem para localizar, não para concluir.`,
        h("div", { class: "ctl-row" }, h("span", { class: "flbl" }, "Quebrar por"), seg(dimsAvail.map((d) => [d, dimName(fk, d)]), bd, (v) => { state.pdim = v; render(); })),
        breakdownTable(fk, ev, bd)),
      panel("Partida a partida", `${U.unit[0].toUpperCase() + U.unit.slice(1)} a mais (verde) ou a menos (vermelho) do que o esperado em cada partida, nesse recorte.`, perMatchChart(fk, ev, team)),
      evidencePanel(fk, fi),
      h("section", { class: "panel limits" }, h("h3", null, "Limites desta leitura"),
        h("ul", null,
          h("li", null, U.limit),
          h("li", null, "Não há dados de habilidades, comunicação ou intenção: um padrão é uma situação para revisar, não um erro comprovado."),
          h("li", null, "O esperado vem de outros times do mesmo campeonato; times muito mais fortes ou fracos que a média distorcem a comparação."))));
  }
  function breakdownTable(fk, ev, dim) {
    const groups = new Map();
    for (const i of ev) { const v = dval(fk, dim, i); if (v == null) continue; (groups.get(v) || groups.set(v, []).get(v)).push(i); }
    let rows = [...groups.entries()].map(([v, e]) => ({ v, a: agg(fk, e) }));
    const ord = VAL_ORDER[dim];
    rows.sort(ord ? (x, y) => (ord.indexOf(x.v) + 99 * (ord.indexOf(x.v) < 0)) - (ord.indexOf(y.v) + 99 * (ord.indexOf(y.v) < 0)) : (x, y) => x.a.vs - y.a.vs);
    if (!ord && rows.length > 12) rows = rows.filter((r) => r.a.n >= 5);
    const all = rows.flatMap((r) => [r.a.obs, r.a.exp]).filter((v) => v != null);
    const hi = pctTop(all), f = (v) => v / hi, U = FUI[fk];
    return h("div", { class: "tbl-wrap" }, h("table", { class: "mt cuts" },
      h("thead", null, h("tr", null, h("th", null, dimName(fk, dim)), h("th", { class: "num" }, U.noun[0].toUpperCase() + U.noun.slice(1)), h("th", { class: "num" }, U.did[0].toUpperCase() + U.did.slice(1)),
        h("th", { class: "num" }, "Esperado"), h("th", { class: "num" }, "Diferença"), h("th", { class: "num" }, "vs. esperado"), h("th", { class: "strip" }, `0% → ${NF0.format(100 * hi)}%`))),
      h("tbody", null, rows.map((r) => {
        const strip = h("td", { class: "strip" });
        strip.innerHTML = stripSvg(f, [{ v: r.a.exp, color: "--ref", type: "tick" }, { v: r.a.obs, color: Math.abs(r.a.gap) < 0.5 ? "--neutral" : r.a.gap < 0 ? "--bad" : "--good", type: "dot" }]);
        return h("tr", { class: r.a.n < 10 ? "thin" : null }, h("td", null, vlbl(dim, r.v)), h("td", { class: "num" }, r.a.n),
          h("td", { class: "num" }, pct(r.a.obs), h("span", { class: "n" }, ` ${r.a.y}/${r.a.n}`)), h("td", { class: "num" }, pct(r.a.exp)),
          h("td", { class: "num " + (Math.abs(r.a.gap) < 0.5 ? "d-neu" : r.a.gap < 0 ? "d-bad" : "d-good") }, pp(r.a.gap)),
          h("td", { class: "num" }, (r.a.vs < 0 ? "−" : "+") + NF1.format(Math.abs(r.a.vs))), strip);
      }))),
      h("p", { class: "note" }, `Na faixa: traço = esperado, ponto = observado. “vs. esperado” = ${U.unit} a mais (+) ou a menos (−) do que outros times teriam nas mesmas situações.`));
  }
  function perMatchChart(fk, ev, team) {
    const E = Fd(fk).E, by = new Map(), U = FUI[fk];
    for (const i of ev) (by.get(E.m[i]) || by.set(E.m[i], []).get(E.m[i])).push(i);
    const ms = teamMatches[team].filter((m) => by.has(m));
    if (!ms.length) return h("div", { class: "empty" }, "Sem eventos.");
    const rows = ms.map((m) => ({ m, a: agg(fk, by.get(m)) }));
    return chartBox(190, (svg, w, hh) => {
      const mg = { t: 10, r: 10, b: 26, l: 40 };
      const x = d3.scaleBand().domain(rows.map((r) => r.m)).range([mg.l, w - mg.r]).padding(0.25);
      const ext = d3.max(rows, (r) => Math.abs(r.a.vs)) || 1;
      const y = d3.scaleLinear().domain([-ext, ext]).nice().range([hh - mg.b, mg.t]);
      svg.append("g").attr("class", "grid-line").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - mg.l - mg.r)).tickFormat(""));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => (v > 0 ? "+" : v < 0 ? "−" : "") + NF0.format(Math.abs(v))));
      svg.append("line").attr("x1", mg.l).attr("x2", w - mg.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", css("--ink")).attr("stroke-opacity", 0.4);
      const every = Math.ceil(rows.length / Math.max(1, Math.floor((w - 60) / 40)));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${hh - mg.b})`).call(d3.axisBottom(x).tickFormat((m, i) => (i % every === 0 ? "#" + (T.pos.get(m) + 1) : "")).tickSize(0)).select(".domain").remove();
      rows.forEach((r) => {
        const v = r.a.vs, g = svg.append("g");
        g.append("rect").attr("x", x(r.m)).attr("width", x.bandwidth()).attr("y", Math.min(y(0), y(v))).attr("height", Math.max(1, Math.abs(y(v) - y(0))))
          .attr("rx", 1.5).attr("fill", css(v < 0 ? "--bad" : "--good")).attr("fill-opacity", Math.min(1, 0.35 + r.a.n / 30));
        tipOn(g.append("rect").attr("x", x(r.m) - 2).attr("width", x.bandwidth() + 4).attr("y", mg.t).attr("height", hh - mg.b - mg.t).attr("fill", "transparent"),
          `<b>#${T.pos.get(r.m) + 1} · ${esc(fmtDate(M.date[r.m]))} · ${esc(M.map[r.m])}</b><br>vs ${esc(prettyTeam(D.teams[opp(r.m, team)]))}<br>${r.a.y} de ${r.a.n} ${U.did} (${pct(r.a.obs)}) · esperado ${pct(r.a.exp)}<br><b>${(v < 0 ? "−" : "+") + NF1.format(Math.abs(v))}</b> ${U.unit} vs. o esperado`);
      });
    });
  }
  // rounds para revisar: ordem do detector ("relevância") ou pelo peso do round no mapa (LI), padrão
  const evLI = (fk, e) => { const F = Fd(fk), i = RIDX.get(F.EV.m[e] + "|" + F.EV.r[e] + "|" + state.team); return i != null && D.R.li && D.R.li[i] != null ? D.R.li[i] / 100 : null; };
  function evList(fk, fi) {
    const list = (FX[fk].ev.get(fi) || []).slice();
    if (state.evOrd === "peso") list.sort((a, b) => (evLI(fk, b) ?? -1) - (evLI(fk, a) ?? -1));
    return list;
  }
  function evidencePanel(fk, fi) {
    const F = Fd(fk), list = evList(fk, fi), FD = F.FD;
    const title = FD.level[fi] === 0 ? "Rounds para revisar: maiores chances perdidas" : "Rounds para revisar";
    const U = FUI[fk];
    const sub = FD.dir[fi] === "acima" && FD.level[fi] > 0 ? U.evAbove
      : (fk === "trade" ? `Mortes sem trade (janela de ${F.meta.window} s) nas situações em que outros times mais trocam.` : U.evBelow) + " Situações para revisar no VOD, não erros comprovados.";
    if (!list.length) return panel(title, sub, h("div", { class: "empty" }, "Sem eventos listados para este recorte."));
    const ord = h("div", { class: "ctl-row" }, h("span", { class: "flbl" }, "Ordenar por"),
      seg([["peso", "Peso do round no mapa"], ["rel", "Relevância no padrão"]], state.evOrd, (v) => { state.evOrd = v; render(); }, "Ordenar rounds"));
    return panel(title, sub, ord, h("ol", { class: "evlist" }, list.map((e, j) => {
      const m = F.EV.m[e], r = F.EV.r[e], li = evLI(fk, e);
      const open = ROUND_FK.has(fk)
        ? () => { state.rvrFrom = { section: "diag", dfund: fk, pat: fi, patFrom: state.patFrom }; state.rvr = { m, r }; state.section = "REV"; render(); window.scrollTo({ top: 0 }); }
        : () => { state.rv = { j }; render(); window.scrollTo({ top: 0 }); };
      return h("li", { onclick: open },
        h("div", { class: "ev-where" }, h("b", null, `#${T.pos.get(m) + 1} · ${M.map[m]} · round ${r + 1}`), h("span", null, `${fmtDate(M.date[m])} · vs ${prettyTeam(D.teams[opp(m, state.team)])}`
          + (li != null ? ` · pressão ${NF2.format(li)}×` : ""))),
        h("div", { class: "ev-why" }, F.EV.why[e]), h("span", { class: "ev-go" }, "abrir →"));
    })));
  }

  // ------------------------------------------------------------------ tela 3: round
  function renderEvidenceRound(main) {
    const fk = state.dfund, F = Fd(fk), fi = state.pat, list = evList(fk, fi);
    const j = Math.max(0, Math.min(state.rv.j, list.length - 1)), e = list[j];
    if (e == null) { state.rv = null; return renderPattern(main); }
    const m = F.EV.m[e], r = F.EV.r[e], kidx = F.EV.k[e], team = state.team, o = opp(m, team);
    const ki = kidx == null ? undefined : KIDX.get(m + "|" + r + "|" + kidx);
    const kills = K_by_m[m].filter((i) => D.K.r[i] === r).sort((a, b) => D.K.t[a] - D.K.t[b]);
    const rr = R_by_m[m].find((i) => D.R.t[i] === team && D.R.r[i] === r);
    const pl = P_by_m[m].find((i) => D.P.r[i] === r);
    const isTrade = fk === "trade", U = FUI[fk];
    const ally = (i) => F.KP.tc[i] === team;
    const nav = h("div", { class: "rv-nav" },
      h("button", { class: "back", type: "button", onclick: () => { state.rv = null; render(); } }, "← " + F.FD.label[fi]),
      h("span", { class: "mut" }, `${j + 1} de ${list.length}`),
      h("button", { class: "btn ghost", type: "button", disabled: j === 0, onclick: () => { state.rv = { j: j - 1 }; render(); } }, "‹ anterior"),
      h("button", { class: "btn ghost", type: "button", disabled: j === list.length - 1, onclick: () => { state.rv = { j: j + 1 }; render(); } }, "próximo ›"));
    const [sa, sb] = scoreOf(m, team);
    const head = h("div", { class: "sec-head" }, h("h1", null, `Round ${r + 1} · ${M.map[m]}`),
      h("p", null, `${fmtDate(M.date[m])} · ${prettyTeam(D.teams[team])} ${sa}–${sb} ${prettyTeam(D.teams[o])}` +
        (rr != null ? ` · ${D.R.sd[rr] === 0 ? "ataque" : "defesa"} · ${D.R.w[rr] ? "venceu o round" : "perdeu o round"} · equipamento ${NF0.format(D.R.lo[rr])} × ${NF0.format(D.R.olo[rr])}` : "")));
    const pts = (FX[fk].kp.get(m + "|" + r + "|" + kidx) || []);
    const layers = [];
    let focus = null;
    if (ki != null) {
      const vx = D.K.vx[ki], vy = D.K.vy[ki];
      const lines = [];
      var killerOurs = D.K.vt[ki] !== team, kCol = css(killerOurs ? "--accent" : "--bad");
      if (D.K.kx[ki] != null) lines.push({ x: vx, y: vy, x2: D.K.kx[ki], y2: D.K.ky[ki], color: kCol, lw: 2, op: 0.9, dash: "5 4", noDot: true });
      if (isTrade) {
        const near = pts.filter((i) => ally(i)).map((i) => ({ i, d: Math.hypot(F.KP.x[i] - vx, F.KP.y[i] - vy) })).sort((a, b) => a.d - b.d)[0];
        if (near) lines.push({ x: vx, y: vy, x2: F.KP.x[near.i], y2: F.KP.y[near.i], color: css("--accent"), lw: 2, op: 0.9, noDot: true });
      }
      layers.push({ points: lines, lines: true });
      layers.push({ points: pts.filter((i) => F.KP.p[i] !== D.K.k[ki]).map((i) => ({ x: F.KP.x[i], y: F.KP.y[i], r: 5,
        color: css(ally(i) ? "--accent" : "--opp"), tip: `<b>${esc(D.players[F.KP.p[i]] ?? "?")}</b> · ${ally(i) ? "aliado" : "adversário"}` })) });
      if (D.K.kx[ki] != null) layers.push({ points: [{ x: D.K.kx[ki], y: D.K.ky[ki], r: 6.5, color: kCol, tip: `<b>${esc(D.players[D.K.k[ki]] ?? "?")}</b> · matou` }] });
      layers.push({ points: [{ x: vx, y: vy, r: 7, color: css("--ink"), tip: `<b>${esc(D.players[D.K.v[ki]] ?? "?")}</b> · morreu aos ${NF1.format(D.K.t[ki])} s` }] });
      const xs = [vx, D.K.kx[ki], ...pts.map((i) => F.KP.x[i])].filter((v) => v != null), ys = [vy, D.K.ky[ki], ...pts.map((i) => F.KP.y[i])].filter((v) => v != null);
      focus = { x: [Math.min(...xs) - 1800, Math.max(...xs) + 1800], y: [Math.min(...ys) - 1800, Math.max(...ys) + 1800] };
    }
    const mapTitle = isTrade ? "Posições no instante da morte" : U.mapTitle;
    const kOurs = ki != null && D.K.vt[ki] !== team;
    const mapBox = layers.length ? h("div", null, mapView(M.map[m], layers, 460, focus),
      legendRow([["quem morreu", "--ink"], [kOurs ? "quem matou (do time)" : "quem matou (adversário)", kOurs ? "--accent" : "--bad"], ["aliados vivos", "--accent"], ["adversários vivos", "--opp"]]),
      h("p", { class: "note" }, isTrade ? "Snapshot do jogo no instante da morte. Linha vermelha = até quem matou; linha roxa = até o aliado mais próximo."
        : U.mapNote)) : h("div", { class: "empty" }, "Sem snapshot de posições para este momento.");
    const tl = h("ol", { class: "tl" }, [
      ...kills.map((i) => {
        const ours = D.K.vt[i] === team;
        const us = ours ? D.K.va[i] : D.K.ka[i], them = ours ? D.K.ka[i] : D.K.va[i];
        const isEv = i === ki, isTr = isTrade && ki != null && D.K.v[i] === D.K.k[ki] && D.K.t[i] >= D.K.t[ki];
        return { t: D.K.t[i], node: h("li", { class: (ours ? "ours" : "theirs") + (isEv ? " ev" : "") },
          h("span", { class: "tl-t" }, NF1.format(D.K.t[i]) + " s"),
          h("span", { class: "tl-what" }, h("b", null, D.players[D.K.k[i]] ?? "?"), " matou ", h("b", null, D.players[D.K.v[i]] ?? "?"),
            isEv ? h("span", { class: "tag" + (isTrade || (fk !== "advantage" && D.K.vt[i] === team) ? "" : " good") }, isTrade ? "morte avaliada" : U.tag) : null, isTr ? h("span", { class: "tag good" }, "trade") : null),
          h("span", { class: "tl-st" + (us > them ? " up" : us < them ? " down" : "") }, us != null ? `${us}v${them}` : "")) };
      }),
      ...(pl != null ? [{ t: D.P.pt[pl], node: h("li", { class: "obj" }, h("span", { class: "tl-t" }, NF1.format(D.P.pt[pl]) + " s"), h("span", { class: "tl-what" }, `Spike plantada no ${D.P.st[pl]}`), h("span", { class: "tl-st" }, "")) }] : []),
    ].sort((a, b) => a.t - b.t).map((x) => x.node));
    main.append(nav, head,
      h("section", { class: "panel" }, h("p", { class: "interp" }, h("b", null, "Por que está na lista: "), F.EV.why[e])),
      h("div", { class: "map-grid rv" }, h("section", { class: "panel" }, h("h3", null, mapTitle), mapBox),
        h("section", { class: "panel" }, h("h3", null, "Linha do tempo do round"), tl, h("p", { class: "note" }, `Vivos do ${prettyTeam(D.teams[team])} × adversário depois de cada kill.`))));
  }
  // ================================================================== DESIGN SYSTEM: componentes base (docs/DESIGN.md)
  const ICONS = window.RRX_ICONS || {};
  function icon(name, cls) { const s = h("span", { class: "icw" + (cls ? " " + cls : "") }); s.innerHTML = ICONS[name] || ""; return s; }
  // ajuda: explicações longas ficam atrás do botão (?), sem sair da tela
  function helpBtn(title, ...kids) {
    const sm = h("summary", { "aria-label": "Ajuda: " + title, title: "Como ler" }, icon("help"));
    return h("details", { class: "help" }, sm, h("div", { class: "help-pop", role: "note" }, h("b", { class: "help-t" }, title), ...kids));
  }
  document.addEventListener("click", (e) => { document.querySelectorAll("details.help[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; }); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll("details.help[open]").forEach((d) => { d.open = false; }); });
  // status: sempre ícone + texto (a cor nunca é a única pista)
  const STATUS = {
    muito_abaixo: ["down", "Muito abaixo do esperado", "bad"], muito_acima: ["up", "Muito acima do esperado", "good"],
    abaixo: ["down", "Abaixo do esperado", "bad soft"], acima: ["up", "Acima do esperado", "good soft"],
    recortes: ["alert", "Abaixo em alguns recortes", "bad soft"], dentro: ["flat", "Dentro do esperado", "neutral"],
    sem: ["info", "Comparado só com a liga", "neutral"],
  };
  // weak = o intervalo de 90% da diferença cruza o zero (rótulo tracejado: "sinal fraco ou variado"); cheio = sinal forte
  const SIG_WEAK = "Sinal fraco ou variado", SIG_STRONG = "Sinal forte, diferença consistente";
  const statusChip = (k, weak, tip) => h("span", { class: "status " + STATUS[k][2] + (weak && k !== "dentro" ? " weak" : ""),
    title: tip || (k === "dentro" || k === "sem" ? null : weak ? SIG_WEAK : SIG_STRONG) }, icon(STATUS[k][0]), STATUS[k][1]);
  // faixas de leitura pela diferença observado − esperado (pp, arredondada): 0 = dentro; 1–3 = acima/abaixo; 4+ = muito
  const tierOf = (gap) => { if (gap == null || !isFinite(gap)) return "dentro"; const r = Math.round(Math.abs(gap));
    return r < 1 ? "dentro" : (gap > 0 ? (r >= 4 ? "muito_acima" : "acima") : (r >= 4 ? "muito_abaixo" : "abaixo")); };
  // régua: observado (ponto) × esperado (traço) com o intervalo de 90% (faixa), escala 0–100%
  function ruler(o) {
    const P = (v) => `${Math.max(0, Math.min(100, 100 * v)).toFixed(2)}%`;
    const el = h("div", { class: "ruler " + (o.tone || "neutral"), role: "img", "aria-label": o.aria || "", title: o.aria || "" });
    const tr = h("div", { class: "r-track" });
    if (o.band !== false && o.exp != null && o.lo != null && o.hi != null) {
      const a = o.exp + o.lo / 100, b = o.exp + o.hi / 100;
      tr.append(h("span", { class: "r-band", style: `left:${P(Math.min(a, b))};width:calc(${P(Math.abs(b - a))} + 2px)` }));
    }
    if (o.exp != null) tr.append(h("span", { class: "r-exp" + (o.expRef ? " ref" : ""), style: `left:${P(o.exp)}` }));
    if (o.obs != null) tr.append(h("span", { class: "r-obs", style: `left:${P(o.obs)}` }));
    el.append(tr);
    if (o.scale !== false) el.append(h("div", { class: "r-scale" }, h("span", null, "0%"), h("span", null, "50%"), h("span", null, "100%")));
    return el;
  }
  const ppTxt = (v) => { if (v == null) return "—"; const r = Math.round(v); return (r > 0 ? "+" : r < 0 ? "−" : "") + NF0.format(Math.abs(r)) + " pp"; };

  // ================================================================== PANORAMA (home)
  const FUND_SECTION = { trade: "TRD", advantage: "ADV", fb_open: "FB", fb_rec: "FB", post: "POS", retake: "RET", keyrounds: "KEY", halfopen: "HAL", pressure: "LEV" };
  const FUND_ICON = { trade: "trade", advantage: "adv", fb_open: "fb", fb_rec: "fb", post: "post", retake: "retake", keyrounds: "key", halfopen: "calendar", pressure: "gauge" };
  const fundName = (fk) => (FUI[fk].tab ? `${FUI[fk].title}: ${FUI[fk].tab.toLowerCase()}` : FUI[fk].title);
  function goSection(id, extra) { return () => { Object.assign(state, extra || {}); state.section = id; state.pat = null; state.rv = null; render(); window.scrollTo({ top: 0 }); }; }
  function homeMatches(team) {
    const sc = state.dscope, all = teamMatches[team];
    return sc && sc.startsWith("ultimas_") ? all.slice(-Number(sc.split("_")[1])) : all;
  }
  function fundStatus(fk, team) {
    const FD = Fd(fk).FD, rows = fdRows(fk, team, state.dscope), g0 = rows.find((i) => FD.level[i] === 0);
    if (g0 == null) return { g0, k: "dentro", weak: true };
    const weak = !(FD.lo[g0] > 0 || FD.hi[g0] < 0);
    return { g0, k: tierOf(FD.gap[g0]), weak, sig: !!FD.sel[g0] };
  }
  const TIER_RANK = { muito_abaixo: 0, abaixo: 1, muito_acima: 2, acima: 3, dentro: 4 };
  const toneOf = (k) => (k === "abaixo" || k === "muito_abaixo" ? "bad" : k === "acima" || k === "muito_acima" ? "good" : "neutral");
  // uma linha de fundamento: valor, régua e números que sustentam a leitura
  function fundLine(fk, team, label) {
    const F = Fd(fk), FD = F.FD, U = FUI[fk], st = fundStatus(fk, team), i = st.g0;
    if (i == null) return h("div", { class: "fline" }, h("span", { class: "mut" }, "Sem eventos no período."));
    const y = Math.round(FD.obs[i] * FD.n[i]);
    const aria = `${label || U.title}: ${pct(FD.obs[i])} observado, esperado ${pct(FD.exp[i])}, ${y} de ${FD.n[i]} ${U.noun}.`;
    return h("div", { class: "fline" },
      label ? h("div", { class: "fl-label" }, label) : null,
      h("div", { class: "fl-nums" }, h("b", { class: "fl-obs t-" + toneOf(st.k) }, pct(FD.obs[i])),
        h("span", { class: "fl-exp" }, "esperado ", h("b", null, pct(FD.exp[i])))),
      ruler({ obs: FD.obs[i], exp: FD.exp[i], lo: FD.lo[i], hi: FD.hi[i], tone: toneOf(st.k), aria, band: false }),
      h("div", { class: "facts" },
        h("span", null, h("b", null, `${y} de ${FD.n[i]}`), ` ${U.noun} ${U.did}`)));
  }
  function fundTile(fks, team, title, iconName, section, extra) {
    // várias leituras (First blood: abertura e depois de sofrer): mostra a mais preocupante, depois a mais forte
    const sts = fks.map((fk) => fundStatus(fk, team)).sort((a, b) => TIER_RANK[a.k] - TIER_RANK[b.k]);
    const k = sts[0].k, weakAll = sts[0].weak;
    const nPat = fks.reduce((a, fk) => a + fdRows(fk, team, state.dscope).filter((i) => Fd(fk).FD.sel[i]).length, 0);
    return h("article", { class: "ftile" },
      h("header", { class: "ft-head" }, h("h3", null, icon(iconName), title), statusChip(k, weakAll)),
      h("div", { class: "flines" }, fks.map((fk) => fundLine(fk, team, fks.length > 1 ? FUI[fk].tab : null))),
      h("footer", { class: "ft-foot" },
        h("span", { class: "mut" }, nPat ? `${nPat} ${nPat === 1 ? "padrão recorrente" : "padrões recorrentes"}` : "Nenhum padrão recorrente"),
        h("button", { class: "lnk", type: "button", onclick: goSection(section, extra) }, "Ver análise detalhada", icon("next"))));
  }
  function postTile(team, ms) {
    const k = MI["POS-01"], e = T.ks.get(k + "|" + (SI[""] ?? -1)), ps = ms.map((m) => T.pos.get(m)).filter((p) => p != null);
    const o = e ? sumE([e], ps, "all") : { v: null, n: 0, d: 0 }, lg = leagueSum(k, [""], "all", null);
    const aria = `Pós-plant: ${pct(o.v)} dos plants convertidos (${NF0.format(o.n)} de ${o.d}); liga ${pct(lg?.v)}.`;
    return h("article", { class: "ftile" },
      h("header", { class: "ft-head" }, h("h3", null, icon("post"), "Pós-plant"), statusChip("sem")),
      h("div", { class: "fline" },
        h("div", { class: "fl-nums" }, h("b", { class: "fl-obs t-neutral" }, pct(o.v)), h("span", { class: "fl-exp" }, "liga ", h("b", null, pct(lg?.v)))),
        ruler({ obs: o.v, exp: lg?.v, tone: "neutral", expRef: true, aria }),
        h("div", { class: "facts" }, h("span", null, h("b", null, `${NF0.format(o.n)} de ${o.d}`), " plants convertidos"),
          h("span", null, "sem ajuste de contexto"))),
      h("footer", { class: "ft-foot" }, h("span", { class: "mut" }, "Detector de padrões ainda não roda aqui"),
        h("button", { class: "lnk", type: "button", onclick: goSection("POS") }, "Abrir pós-plant", icon("next"))));
  }
  function attentionItem(fk, i, kind) {
    const FD = Fd(fk).FD, U = FUI[fk], y = Math.round(FD.obs[i] * FD.n[i]);
    const tone = kind === "abaixo" ? "bad" : "good";
    const aria = `${FD.label[i]}: ${pct(FD.obs[i])} contra ${pct(FD.exp[i])} esperado; ${y} de ${FD.n[i]} ${U.noun}; em ${Math.round(FD.rec[i] * FD.nrec[i])} de ${FD.nrec[i]} partidas.`;
    return h("li", { class: "att " + tone },
      h("div", { class: "att-main" },
        h("div", { class: "att-fund" }, icon(FUND_ICON[fk]), fundName(fk)),
        h("h3", { class: "att-t" }, FD.label[i]),
        h("div", { class: "att-row" },
          ruler({ obs: FD.obs[i], exp: FD.exp[i], lo: FD.lo[i], hi: FD.hi[i], tone, aria, scale: false, band: false }),
          h("div", { class: "facts" },
            h("span", null, h("b", { class: "t-" + tone }, pct(FD.obs[i])), " observado"),
            h("span", null, h("b", null, pct(FD.exp[i])), " esperado"),
            h("span", null, h("b", null, `${y} de ${FD.n[i]}`), ` ${U.noun}`),
            h("span", null, "em ", h("b", null, `${Math.round(FD.rec[i] * FD.nrec[i])} de ${FD.nrec[i]}`), " partidas")))),
      h("div", { class: "att-side" },
        h("div", { class: "att-gap t-" + tone }, ppTxt(FD.gap[i])),
        h("div", { class: "att-vs" }, unitsVs(fk, FD.vs[i])),
        h("div", { class: "att-acts" },
          h("button", { class: "btn ghost sm", type: "button", onclick: openPat(fk, i, false) }, "Ver padrão"),
          kind === "abaixo" ? h("button", { class: "btn sm", type: "button", onclick: openPat(fk, i, true) }, icon("film"), "Ver rounds") : null)));
  }
  function collectPatterns(team, dir) {
    const out = [];
    for (const fk of FK) {
      const FD = Fd(fk).FD;
      const rows = fdRows(fk, team, state.dscope).filter((i) => FD.sel[i] && FD.dir[i] === dir).sort((a, b) => Math.abs(FD.vs[b]) - Math.abs(FD.vs[a]));
      rows.slice(0, 2).forEach((i) => out.push([fk, i]));
    }
    return out.sort((a, b) => Math.abs(Fd(b[0]).FD.vs[b[1]]) - Math.abs(Fd(a[0]).FD.vs[a[1]]));
  }
  function methodHelp() {
    const C = FU.meta.criteria;
    const z = FK.map((fk) => `${fundName(fk)} ${NF1.format(100 * Fd(fk).meta.null_team_rate)}%`).join("; ");
    return helpBtn("Como ler",
      h("p", null, h("b", null, "Esperado: "), "o que outros times fazem nas mesmas situações (lado, economia, momento, mapa…). O próprio time e as partidas dele nunca entram no cálculo."),
      h("p", null, h("b", null, "Leitura: "), "pela diferença observado − esperado: 0 pp = dentro do esperado; 1 a 3 pp = acima/abaixo; 4 pp ou mais = muito acima/abaixo. Rótulo cheio = sinal forte, diferença consistente; rótulo tracejado = sinal fraco ou variado (pode ser acaso); padrão recorrente = a diferença também se repete entre partidas."),
            h("p", null, h("b", null, "Régua: "), "ponto = observado; traço = esperado. Quanto mais longe o ponto do traço, maior a diferença."),
      h("p", null, h("b", null, "Padrão recorrente: "), `≥ ${C.min_events} eventos em ≥ ${C.min_matches} partidas, diferença acima de um limiar calibrado e na mesma direção em ≥ ${NF0.format(100 * C.min_recurrence)}% das partidas. Em dados simulados sem padrão real, os times que recebem algum padrão por acaso: ${z}.`),
      h("p", null, "É um ponto para revisar no VOD, não um erro comprovado: habilidades, comunicação e intenção não estão nos dados."));
  }
  // fundo de cada mapa (minimapa oficial) definido uma vez em CSS; os quadrados só referenciam a classe
  const mapSlug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  (function mapBgStyles() {
    // tela de carregamento do mapa (como no jogo); sem ela, o minimapa oficial
    const names = new Set([...Object.keys(D.SPLASH || {}), ...Object.keys(D.MAPIMG || {})]);
    const css_ = [...names].map((n) => (D.SPLASH && D.SPLASH[n]
      ? `.mbg-${mapSlug(n)}::before{background-image:url(data:image/jpeg;base64,${D.SPLASH[n]})}`
      : `.mbg-${mapSlug(n)}::before{background-image:url(data:image/png;base64,${D.MAPIMG[n].png});filter:grayscale(1);opacity:.22}`)).join("\n");
    if (css_) document.head.append(h("style", null, css_));
  })();
  // uma linha de quadrados (o que couber na largura), do mais recente (esquerda) ao mais antigo; a seta mostra o resto
  function matchTape(team, ms) {
    const cur = curMatch(), open = !!state.tapeOpen;
    const tiles = h("div", { class: "mtiles" + (open ? "" : " collapsed"), role: "list", "aria-label": "Resultados por mapa, do mais recente ao mais antigo" },
      [...ms].reverse().map((m) => {
        const [a, b] = scoreOf(m, team), won = a > b;
        const lab = `${fmtDate(M.date[m])} · ${M.map[m]} · vs ${prettyTeam(D.teams[opp(m, team)])}: ${a}–${b}, ${won ? "vitória" : "derrota"}`;
        return h("button", { class: `mtile ${won ? "w" : "l"} mbg-${mapSlug(M.map[m])}${m === cur ? " cur" : ""}`, type: "button", role: "listitem", title: lab + " · clique para abrir a partida",
          "aria-label": lab + ". Abrir relatório da partida.", onclick: () => { state.pos = T.pos.get(m); state.section = "overview"; render(); window.scrollTo({ top: 0 }); } },
          h("span", { class: "mt-top" }, h("span", { class: "mt-res" }, won ? "V" : "D"), h("span", { class: "mt-date" }, fmtDate(M.date[m]).slice(0, 5))),
          h("b", { class: "mt-score" }, `${a}–${b}`), h("span", { class: "mt-map" }, M.map[m]));
      }));
    const lbl = h("span", { class: "mt-more-n" });
    const more = h("button", { class: "mt-more" + (open ? " open" : ""), type: "button", hidden: true, "aria-expanded": String(open),
      onclick: () => { state.tapeOpen = !open; render(); } }, icon("next"), lbl);
    // quantos ficaram fora da 1ª linha: medido depois do layout e de novo quando a largura muda
    const measure = () => {
      const k = [...tiles.children], top = k.length ? k[0].offsetTop : 0, hiddenN = k.filter((e) => e.offsetTop > top + 2).length;
      more.hidden = !hiddenN;
      lbl.textContent = open ? "menos" : `+${hiddenN}`;
      more.title = open ? "Mostrar só a última linha" : `Mostrar mais ${hiddenN} ${hiddenN === 1 ? "mapa" : "mapas"}`;
    };
    requestAnimationFrame(measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(tiles);
    return h("div", { class: "mtape" }, tiles, more);
  }
  // um cartão por mapa: foto, campanha (vitórias–derrotas), saldo e o histórico (mais recente à esquerda)
  function mapCards(team, ms) {
    const by = new Map();
    for (const m of ms) (by.get(M.map[m]) || by.set(M.map[m], []).get(M.map[m])).push(m);
    const cards = [...by.entries()].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0])).map(([mp, list]) => {
      let w = 0, ra = 0, rb = 0;
      for (const m of list) { const [a, b] = scoreOf(m, team); if (a > b) w++; ra += a; rb += b; }
      const l = list.length - w, df = w - l;
      return h("div", { class: `mcard mbg-${mapSlug(mp)}`, role: "listitem" },
        h("div", { class: "mc-name" }, mp),
        h("div", { class: "mc-rec" }, h("b", null, `${w}–${l}`), h("span", { class: "mc-diff " + (df > 0 ? "t-good" : df < 0 ? "t-bad" : "mut") }, (df > 0 ? "+" : df < 0 ? "−" : "±") + Math.abs(df))),
        h("div", { class: "mc-sub" }, `${list.length} ${list.length === 1 ? "mapa" : "mapas"} · rounds ${ra}–${rb}`),
        h("div", { class: "mc-hist", "aria-label": `Histórico em ${mp}, do mais recente ao mais antigo` }, [...list].reverse().map((m) => {
          const [a, b] = scoreOf(m, team), won = a > b;
          const lab = `${fmtDate(M.date[m])} · vs ${prettyTeam(D.teams[opp(m, team)])}: ${a}–${b}, ${won ? "vitória" : "derrota"} · clique para abrir a partida`;
          return h("button", { class: "mc-g " + (won ? "w" : "l"), type: "button", title: lab, "aria-label": lab,
            onclick: () => { state.pos = T.pos.get(m); state.section = "overview"; render(); window.scrollTo({ top: 0 }); } }, won ? "V" : "D");
        })));
    });
    return h("div", { class: "mcards", role: "list", "aria-label": "Campanha por mapa" }, cards);
  }
  // The immersive briefing uses the same scoped patterns and evidence as the dashboard.
  // No new performance score is invented for the presentation.
  function missionBanner(team, ms) {
    if (!window.RoundRxMission || !FU) return null;
    const candidates = [];
    for (const fk of FK) {
      const F = Fd(fk), FD = F.FD;
      for (const i of fdRows(fk, team, state.dscope)) {
        if (!(FD.n[i] > 0) || !Number.isFinite(FD.obs[i]) || !Number.isFinite(FD.exp[i])) continue;
        if (!FD.sel[i] && FD.level[i] !== 0) continue;
        candidates.push({ id: FD.id[i], key: fk, label: FD.label[i], name: fundName(fk),
          selected: !!FD.sel[i], observed: FD.obs[i], expected: FD.exp[i], gap: FD.gap[i],
          events: FD.n[i], matches: FD.nm[i], recurrence: FD.rec[i], recurrenceMatches: FD.nrec[i],
          noun: FUI[fk].noun, did: FUI[fk].did, scope: FD.scope[i],
          dims: FD.dims[i], tradeWindow: fk === "trade" ? F.meta.window : null,
          evidence: (FX[fk].ev.get(i) || []).slice(0, 3).map((e) => {
            const m = F.EV.m[e];
            return { map: M.map[m], round: F.EV.r[e] + 1,
              opponent: prettyTeam(D.teams[opp(m, team)]), date: fmtDate(M.date[m]), why: F.EV.why[e] };
          }),
          review: () => { if (fk === "trade") state.dwin = F.meta.window; openPat(fk, i, true)(); },
        });
      }
    }
    const min = FU.meta.criteria;
    return window.RoundRxMission.banner({
      team: prettyTeam(D.teams[team]), scope: state.dscope === "todas" ? "Todas as partidas" : "Últimas 10 partidas",
      matches: ms.length, rounds: ms.reduce((n, m) => n + M.rs[m] + M.bs[m], 0),
      storageKey: [D.run.data_fingerprint, D.teams[team], state.dscope].join("|"),
      minEvents: min.min_events, minMatches: min.min_matches, candidates,
      scene: D.MISSIONIMG?.Ascent ? `data:image/jpeg;base64,${D.MISSIONIMG.Ascent}` : null,
      minimap: D.MAPIMG?.Ascent ? `data:image/png;base64,${D.MAPIMG.Ascent.png}` : null,
    });
  }
  function renderHome(main) {
    const team = state.team, ms = homeMatches(team), nAll = teamMatches[team].length;
    let w = 0, rw = 0, rl = 0;
    for (const m of ms) { const [a, b] = scoreOf(m, team); if (a > b) w++; rw += a; rl += b; }
    const scopes = (FU ? (Fd(FK[0]).meta.scopes) : ["todas"]);
    const hero = h("section", { class: "hero" },
      h("div", { class: "hero-top" },
        h("h1", { class: "team" }, prettyTeam(D.teams[team])),
        seg(scopes.map((sc) => [sc, sc === "todas" ? `Todas (${nAll})` : `Últimas ${sc.split("_")[1]}`]), state.dscope, (v) => { state.dscope = v; render(); }, "Partidas")),
      h("dl", { class: "hero-kpis" },
        h("div", null, h("dt", null, "Mapas"), h("dd", null, ms.length)),
        h("div", null, h("dt", null, "Vitórias"), h("dd", null, `${w}–${ms.length - w}`)),
        h("div", null, h("dt", null, "Rounds"), h("dd", null, `${rw}–${rl}`)),
        h("div", null, h("dt", null, "Período"), h("dd", { class: "sm" }, ms.length ? `${fmtDate(M.date[ms[0]])} a ${fmtDate(M.date[ms[ms.length - 1]])}` : "—"))),
      missionBanner(team, ms), mapCards(team, ms));
    if (!FU) { main.append(hero); return; }
    const bad = collectPatterns(team, "abaixo").slice(0, 4), good = collectPatterns(team, "acima").slice(0, 3);
    // "O que pede atenção" e "Pontos fortes" só aparecem quando há padrão recorrente naquela direção
    const attention = bad.length ? h("section", { class: "block" },
      h("div", { class: "block-head" }, h("h2", null, "O que pede atenção")),
      h("ol", { class: "att-list" }, bad.map(([fk, i]) => attentionItem(fk, i, "abaixo")))) : null;
    const board = h("section", { class: "block" },
      h("div", { class: "block-head" }, h("h2", null, "Fundamentos"), h("p", { class: "sub" }, "Observado × esperado em situações parecidas"), methodHelp()),
      h("div", { class: "board" },
        FU.F.trade ? fundTile(["trade"], team, "Trade kill", "trade", "TRD") : null,
        FU.F.advantage ? fundTile(["advantage"], team, "Preservação de vantagem", "adv", "ADV") : null,
        FB_KEYS.length ? fundTile(FB_KEYS, team, "First blood", "fb", "FB") : null,
        FU.F.post ? fundTile(["post"], team, "Pós-plant", "post", "POS") : postTile(team, ms),
        FU.F.retake ? fundTile(["retake"], team, "Retake", "retake", "RET") : null,
        FU.F.keyrounds ? fundTile(["keyrounds"], team, "Rounds-chave", "key", "KEY") : null,
        FU.F.halfopen ? fundTile(["halfopen"], team, "Início de half", "calendar", "HAL") : null,
        FU.F.pressure ? fundTile(["pressure"], team, "Pressão", "gauge", "LEV") : null));
    const strengths = good.length ? h("section", { class: "block" },
      h("div", { class: "block-head" }, h("h2", null, "Pontos fortes")),
      h("ol", { class: "att-list" }, good.map(([fk, i]) => attentionItem(fk, i, "acima")))) : null;
    main.append(...[hero, attention, strengths, board].filter(Boolean));
  }

  if (FU && FU.F.trade) state.dwin = FU.F.trade.meta.window;

  function render() {
    drawers.length = 0; hideTip();
    renderFilters(); renderSide();
    const main = $("#main"); main.replaceChildren();
    if (state.section === "diag" && state.pat == null) state.section = "home";
    document.body.classList.toggle("diag-mode", state.section === "diag" || state.section === "home");
    document.body.classList.toggle("home-mode", state.section === "home");
    if (state.section === "home") renderHome(main);
    else if (state.section === "diag") renderDiag(main);
    else if (state.section === "overview") renderOverview(main);
    else if (state.section === "LEV") renderLev(main);
    else if (state.section === "REV") renderRev(main);
    else if (state.section === "AGT") renderAGT(main);
    else if (state.section === "HAL") renderHAL(main);
    else renderLens(main, state.section);
    const sec = D.sections.find((x) => x.id === state.section);
    if (sec && sec.group !== "Início" && sec.group !== "Diagnóstico" && sec.group !== sec.label) main.prepend(h("div", { class: "crumb" }, sec.group, h("span", null, "›"), sec.label));
    drawers.forEach((f) => f());
    writeHash();
  }
  let rT;
  window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => drawers.forEach((f) => f()), 120); });

  const r = D.run;
  $("#foot").textContent = `RoundRx · base ${r.data_fingerprint} (${r.n_matches} partidas, ${r.n_rounds} rounds) · config v${r.config_version} (${r.config_fingerprint}) · trade ≤ ${D.cfg.trade_window_s} s · gerado ${r.run_at_utc}`;
  // altura do cabeçalho fixo -> a barra lateral gruda logo abaixo dele
  const topEl = $("#top");
  const setTopH = () => document.documentElement.style.setProperty("--top-h", (getComputedStyle(topEl).position === "sticky" ? topEl.offsetHeight : 0) + "px");
  try { new ResizeObserver(setTopH).observe(topEl); } catch (e) { /* navegador antigo */ }
  window.addEventListener("resize", setTopH);
  setTopH();
  readHash(); fillTeams(); fillMatches(); render();
})();
