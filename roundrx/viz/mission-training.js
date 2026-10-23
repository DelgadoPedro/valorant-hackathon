/* Executable training hypotheses for the existing Mission focuses. No DOM or network. */
(function () {
  "use strict";

  const text = (value) => typeof value === "string" ? value.trim() : "";
  const known = (value) => {
    const valueText = text(value);
    return valueText && !["?", "null", "undefined", "nan", "sem posição"].includes(valueText.toLowerCase()) ? valueText : "";
  };
  const side = (value) => ({ atk: "ataque", def: "defesa" }[value] || "");
  const sidePhrase = (value) => ({ atk: "no ataque", def: "na defesa" }[value] || "");
  const DIM_NAMES = {
    map_name: "Mapa", side: "Lado", phase: "Momento", numbers: "Saldo de vivos", state: "Vivos do time × adversário",
    pstate: "Vivos do time × adversário no plant", site: "Site", pwhen: "Momento do plant", when: "Momento do evento",
    economy: "Economia", spike: "Spike", round_type: "Tipo de round", moment: "Caminho do half", half: "Half",
    lead: "Placar", victim_name: "Quem morreu", nearest_ally_name: "Aliado mais próximo", duel_name: "Jogador no duelo",
    duel_role: "Função no duelo", ally_dist: "Distância do aliado", allies_near_b: "Aliados a até 15 m", fb_context: "First blood",
  };
  const state = (value) => /^[1-5]v[1-5]$/.test(text(value)) ? text(value) : "";
  const join = (...parts) => parts.filter(Boolean).join(" ");

  function analyzedContext(f, dims) {
    if (text(f.label)) return text(f.label);
    const values = Object.entries(dims).filter(([, value]) => known(value));
    return values.length ? values.map(([dim, value]) => `${DIM_NAMES[dim] || dim}: ${side(value) || value}`).join(" · ")
      : "Recorte geral do fundamento; mapa, lado e cenário serão definidos na revisão.";
  }

  function practiceLocation(dims, evidence) {
    if (known(dims.map_name)) return `Personalizada em ${dims.map_name}${sidePhrase(dims.side) ? `, ${sidePhrase(dims.side)}` : ""}.`;
    const example = evidence.find((ev) => known(ev.map));
    const location = example ? `Personalizada em ${example.map} como exemplo de prática; o recorte não está limitado a esse mapa.`
      : "Personalizada no mapa escolhido pelo treinador para este exercício.";
    return join(location, sidePhrase(dims.side) ? `Mantenham o time ${sidePhrase(dims.side)} conforme o recorte.` : "");
  }

  function participants(key, dims) {
    if (key === "fb_rec") return "Providenciem cinco sparrings para o adversário; quatro integrantes do time jogam e o quinto observa, com revezamento entre séries.";
    if (["keyrounds", "pressure", "halfopen"].includes(key)) return "Preparem cinco jogadores do time e cinco sparrings para os contatos em personalizada; a revisão de compra pode ser feita antes, só com o elenco.";
    if (["advantage", "post", "retake"].includes(key)) {
      const alive = state(key === "advantage" ? dims.state : dims.pstate);
      return alive ? `Reservem ${alive.split("v")[0]} jogadores do time e ${alive.split("v")[1]} sparrings adversários; os demais observam ou revezam fora do cenário.`
        : "Providenciem sparrings para representar o adversário no efetivo escolhido; os integrantes sem função no cenário observam e revezam entre tentativas.";
    }
    return "";
  }

  function openingReview(evidence) {
    const refs = evidence.filter((ev) => Number.isInteger(ev.round) && ev.round > 0).slice(0, 2);
    if (!refs.length) return "Separem até dois rounds do recorte em Explorar evidências; se não houver VOD, façam uma repetição diagnóstica antes de corrigir.";
    return `Revisem ${refs.map((ev) => join(known(ev.map), `round ${ev.round}`, known(ev.opponent) ? `vs ${ev.opponent}` : "")).join(" e ")}.`;
  }

  function uncertainty(f) {
    if (f.enough === false) return "Amostra em formação: use o treino para observar o comportamento antes de concluir que existe uma fragilidade.";
    if (!f.confirmed) return Number.isFinite(f.observed) && Number.isFinite(f.expected) && f.observed >= f.expected
      ? "Resultado no esperado ou acima dele: exercício exploratório para testar consistência, sem fragilidade confirmada."
      : "Exercício exploratório: valide a hipótese na revisão; ainda não há fragilidade recorrente confirmada.";
    return "Hipótese de treino: valide a causa na revisão antes de escolher a correção.";
  }

  function trade(d, f) {
    const post = d.phase === "pós-plant", opening = d.phase === "1ª morte do round", pre = d.phase === "pré-plant";
    const windowSeconds = typeof f.tradeWindow === "number" && Number.isFinite(f.tradeWindow) && f.tradeWindow > 0 ? f.tradeWindow : null;
    const timing = windowSeconds ? `em até ${windowSeconds} s, a mesma janela do diagnóstico` : "na janela de tempo indicada no diagnóstico";
    const pair = known(d.victim_name) || known(d.nearest_ally_name)
      ? join(known(d.victim_name) ? `${d.victim_name} inicia o contato.` : "Um jogador inicia o contato.", known(d.nearest_ally_name) ? `${d.nearest_ally_name} começa na cobertura.` : "O segundo jogador cobre.")
      : "Um jogador inicia o contato, outro cobre e um adversário varia a posição; os demais observam ou alternam nas funções.";
    const scenario = post
      ? d.side === "def" ? "Recriem um contato de retake após o plant, com a dupla entrando por acessos combinados."
        : d.side === "atk" ? "Recriem uma defesa de spike plantada, com posições complementares para responder ao contato."
          : "Recriem um contato após o plant; usem o round revisado para definir se a dupla defende a spike ou tenta a retomada."
      : opening ? "Marquem uma rota de primeiro contato e duas posições possíveis para o adversário."
        : pre ? "Escolham um trecho de tomada de espaço antes do plant e duas posições possíveis para o adversário."
          : "Escolham um contato de um round revisado e mantenham a mesma fase nas duas séries; sem VOD, o treinador define esse cenário de prática.";
    return {
      title: post ? "Cobertura e trade após o plant" : opening ? "Primeiro contato com resposta em dupla" : pre ? "Tomada de espaço com trade em dupla" : "Contato com resposta em dupla",
      summary: `Duas séries de cinco contatos para ajustar cobertura e medir a resposta ${timing}.`,
      objective: "Construir uma oportunidade real de resposta ao primeiro contato e separar falha de cobertura de falha de execução.",
      setup: join(scenario, known(d.ally_dist) ? `Reproduzam inicialmente a faixa de distância do recorte (${d.ally_dist}); ajustem apenas após observar o contato.` : "A dupla define distância e linha de visão antes da primeira repetição.",
        "A proximidade no snapshot não comprova linha de visão nem oportunidade real de trade; confirmem ambas no VOD."),
      roles: pair,
      review: "Pausem antes da morte: o segundo jogador podia ver e atingir o mesmo adversário sem se expor a outro ângulo? Confiram obstáculos, utilitários e a comunicação.",
      practice: `Façam o contato sem avisar a posição do adversário. Se o primeiro jogador cair, o parceiro tenta a troca ${timing}; se não houver linha segura, registrem o bloqueio em vez de forçar uma morte. Após cinco contatos, invertam as funções e alterem uma única variável de cobertura.`,
      debrief: "Comparem as duas séries: quantas quedas tinham cobertura possível e quantas foram trocadas? Escolham um ajuste de distância, ângulo ou chamada para o scrim.",
      repetitions: "2 séries de 5 contatos curtos; reiniciar posições após cada tentativa e alternar quem inicia na segunda série.",
      success: `Meta do exercício: 8 de 10 contatos iniciados com cobertura validada pelo observador. Nas quedas, registrar oportunidades reais e trades ${timing}; não usar todas as quedas como oportunidades automáticas.`,
      progression: "Se a cobertura se mantiver nas duas séries, adicionem um segundo ângulo ou utilitário adversário; se cair, repitam a série com apenas uma posição inimiga.",
      watch: `Nas próximas partidas, comparar mortes trocadas ${timing} no mesmo recorte. Registrar também a viabilidade de cobertura no VOD.`,
    };
  }

  function advantage(d) {
    const alive = state(d.state);
    const planted = d.spike === "plantada", unplanted = d.spike === "não plantada";
    const spike = planted ? d.side === "def" ? "Comecem com a spike adversária plantada e definam quem libera e quem executa o defuse."
      : d.side === "atk" ? "Comecem com a spike do time plantada; definam cobertura do primeiro contato e resposta ao defuse."
        : "Comecem com a spike plantada; confiram no round revisado se o time plantou ou tenta o retake antes de distribuir as funções."
      : unplanted ? "Comecem sem spike plantada; definam quem controla a spike e qual objetivo obriga o próximo movimento."
        : "O treinador escolhe uma condição de spike para a série e a mantém igual nas seis tentativas; é uma condição de prática.";
    return {
      title: alive ? `Fechar a vantagem em ${alive}` : "Fechar a vantagem com uma decisão coletiva",
      summary: "Seis cenários de vantagem para ensaiar reagrupamento, cobertura e a próxima decisão.",
      objective: "Manter contatos cobertos e transformar a vantagem de vivos em um plano que respeite spike e relógio.",
      setup: join(alive ? `Montem ${alive}: o primeiro número é de jogadores do time, o segundo do adversário.` : "Copiem o número de vivos de um round revisado; se não estiver disponível, o treinador define uma vantagem para a prática.", spike),
      roles: "Um jogador chama a próxima ação, um observa contatos isolados e os jogadores vivos executam. Os adversários variam entre recuar e buscar uma pick.",
      review: "Pausem na kill que abriu a vantagem: qual era o objetivo do round e quais contatos posteriores ficaram sem cobertura? Confiram spike, posição e tempo.",
      practice: "Reiniciem o cenário. Antes de avançar, comuniquem número de vivos, condição da spike e próxima ação. Joguem até resolver o round ou por até 60 s; ao fim do limite, registrem como inconclusivo. Após três tentativas, ajustem uma regra de cobertura e repitam.",
      debrief: "Separem execução do plano e resultado. Escolham uma chamada que ajudou a evitar um contato isolado e expliquem quando ela deve mudar.",
      repetitions: "2 séries de 3 cenários, até 60 s por tentativa, com o mesmo número de vivos e condição da spike.",
      success: "Meta do exercício: em 5 de 6 tentativas, todos confirmam a próxima ação e nenhum jogador busca contato sem cobertura combinada. Anotar vitórias separadamente.",
      progression: "Acrescentem uma rotação adversária ou menos informação; mantenham a mesma regra de comunicação e comparem com a série anterior.",
      watch: "Comparar conversão de vantagens no mesmo estado de vivos, lado e condição da spike; revisar também os contatos isolados.",
    };
  }

  function firstBlood(d, recovery) {
    const player = known(d.duel_name), role = known(d.duel_role);
    const anchor = join(player ? `${player} começa na função de quem ${recovery ? "caiu primeiro" : "disputa a abertura"}.` : "", role ? `A função do recorte é ${role}.` : "");
    if (recovery) return {
      title: "Reorganização após a primeira baixa",
      summary: "Seis reinícios em 4v5 para treinar informação, decisão e um contato com apoio.",
      objective: "Substituir respostas individuais à primeira baixa por uma decisão coletiva baseada na informação disponível.",
      setup: join("Recriem um primeiro abate sofrido e iniciem com quatro jogadores do time contra cinco adversários.", anchor, known(d.when) ? `Reproduzam o momento da primeira baixa (${d.when} de tempo decorrido).` : "Usem o momento de um round revisado; sem VOD, o treinador define o instante como condição de prática.", d.side === "def" ? "Na defesa, mantenham o objetivo de impedir o plant ou organizar a retomada." : d.side === "atk" ? "No ataque, mantenham a spike acessível e escolham onde produzir o próximo contato." : "O treinador fixa lado e condição da spike antes da série."),
      roles: "O jogador retirado observa a comunicação; um sobrevivente decide o plano, dois executam o próximo contato com apoio e o quarto mantém a informação necessária.",
      review: "Pausem na primeira baixa: o que os sobreviventes realmente sabiam? Confiram a reação, as áreas descobertas e se havia possibilidade de troca imediata.",
      practice: "Após a baixa simulada, comuniquem posição conhecida, espaço perdido e recurso disponível. O responsável escolhe reagrupar, pressionar um ponto ou buscar informação com apoio. Executem por até 60 s e encerrem como inconclusivo se o round continuar aberto. Alterem a resposta adversária após três tentativas.",
      debrief: "Comparem as decisões com a informação disponível no instante, sem usar o resultado como prova de acerto. Combinem uma chamada para o primeiro ajuste após a baixa.",
      repetitions: "2 séries de 3 cenários em 4v5, até 60 s cada; alternar quem observa e quem decide.",
      success: "Meta do exercício: em 5 de 6 tentativas, o time confirma uma decisão antes do próximo contato e esse contato recebe o apoio combinado; registrar a recuperação do round separadamente.",
      progression: "Depois de uma série consistente, variem quem é retirado ou a informação revelada, mantendo o plano de comunicação.",
      watch: "Comparar vitórias após sofrer o first blood no mesmo mapa, lado, economia e momento; revisar a qualidade do primeiro ajuste coletivo.",
    };
    return {
      title: "Abertura preparada com apoio",
      summary: "Dez aberturas curtas com função de contato, apoio e saída definidos antes do duelo.",
      objective: "Preparar o duelo de abertura com informação e apoio, sem transformar todo primeiro contato em uma obrigação de avançar.",
      setup: join("Escolham uma rota de abertura dos rounds revisados e duas posições possíveis para o adversário.", anchor, known(d.when) ? `O recorte registra o primeiro abate ${d.when}; isso orienta a revisão, não obriga um duelo nesse instante.` : "Definam um gatilho de informação para o contato."),
      roles: "Um jogador disputa a abertura, outro prepara apoio ou utilitário e outro garante a resposta ou a saída. O adversário varia a posição sem anunciar.",
      review: "Antes do duelo, identifiquem informação disponível, utilitário usado, posição do apoio e rota de saída. Confiram no VOD o que o registro do abate não mostra.",
      practice: "Antes de cada tentativa, anunciem quem contata, qual apoio estará pronto e qual é a condição de abortar. Executem até o primeiro contato ou por até 20 s; reiniciem e registrem se o apoio chegou antes da exposição. Na segunda série, alterem a posição inimiga e mantenham as funções.",
      debrief: "Comparem aberturas preparadas e improvisadas, incluindo tentativas sem abate. Selecionem um gatilho de contato e um de recuo para o scrim.",
      repetitions: "2 séries de 5 aberturas, até 20 s cada; alternar o jogador de contato na segunda série.",
      success: "Meta do exercício: 8 de 10 aberturas com apoio pronto antes da exposição e saída comunicada. Registrar first bloods à parte, sem exigir vitória em todo duelo.",
      progression: "Incluam uma resposta de utilitário adversário; a dupla deve decidir se mantém ou aborta o contato com base na informação.",
      watch: "Comparar first bloods a favor no mesmo mapa, lado, economia e momento; revisar se apoio e saída foram preparados.",
    };
  }

  function planted(d, retake) {
    const alive = state(d.pstate), site = known(d.site);
    const scenario = join(alive ? `Iniciem em ${alive}: ${alive.split("v")[0]} jogadores do time e ${alive.split("v")[1]} adversários.`
      : "Reproduzam o saldo de vivos de um round revisado; sem esse dado, o treinador escolhe a condição da prática.",
    site ? `Usem o site ${site}.` : "Escolham o site de um round revisado; se desconhecido, definam um site apenas para a prática.",
    known(d.pwhen) ? `O plant do recorte ocorreu ${d.pwhen} de tempo decorrido do round; esse dado não é o tempo restante da spike.` : "");
    return retake ? {
      title: join("Retake sincronizado", site ? `no ${site}` : "", alive ? `em ${alive}` : ""),
      summary: "Seis retomadas com ponto de encontro, chamada de entrada e cobertura do defuse.",
      objective: "Unir a entrada e o defuse em uma sequência em que cada jogador saiba sua responsabilidade.",
      setup: join("O time joga na defesa e o adversário planta.", scenario, "Comecem no plant; o treinador fixa e anuncia qualquer atraso adicional antes da entrada, sem deduzi-lo do momento do plant."),
      roles: "Distribuam entrada, apoio e defuse entre os jogadores vivos; em efetivo reduzido, um jogador acumula funções em sequência. Os atacantes alternam a posição de defesa da spike.",
      review: "Confiram o intervalo entre plant e primeiro contato, entradas separadas e resposta ao início do defuse. Verifiquem posições e utilitários no VOD.",
      practice: "Após o plant, comuniquem tempo e acessos. Confirmem quem entra, qual ângulo cada um limpa e quem cobre o defuse; só então executem a chamada de entrada. Joguem até resolver a spike. Após três tentativas, alterem uma posição dos atacantes e repitam.",
      debrief: "Marquem onde a sequência quebrou: reunião, entrada, limpeza ou defuse. Escolham uma chamada de sincronização para o próximo scrim.",
      repetitions: "2 séries de 3 retakes, reiniciados no plant; manter vivos, site e atraso de entrada iguais para comparar as séries.",
      success: "Meta do exercício: em 5 de 6 tentativas, entrada confirmada pelos jogadores e função de defuse com cobertura definida antes da execução. Medir a vitória do retake separadamente.",
      progression: "Reduzam o tempo de preparação ou variem uma posição de pós-plant, sem mudar simultaneamente o número de vivos.",
      watch: "Comparar vitórias em retakes com mesmo site, saldo de vivos e momento do plant; revisar o tempo real de entrada e a cobertura do defuse.",
    } : {
      title: join("Pós-plant com contatos combinados", site ? `no ${site}` : "", alive ? `em ${alive}` : ""),
      summary: "Seis pós-plants para combinar posições, primeiro contato e resposta ao início do defuse.",
      objective: "Conectar as posições depois do plant e responder ao defuse sem oferecer contatos isolados.",
      setup: join("O time joga no ataque com a spike plantada.", scenario, "Em cada tentativa, plantem no ponto escolhido e usem o relógio real da spike."),
      roles: "Distribuam vigilância dos acessos, primeiro contato e resposta ao defuse entre os jogadores vivos. Com apenas um sobrevivente, definam a ordem das ações e a rota de reposicionamento.",
      review: "Observem a posição de cada sobrevivente no plant, quem iniciou o contato e como o time respondeu ao defuse. Confiram se havia cobertura e visão da spike.",
      practice: "Antes da retomada, anunciem quem observa cada acesso e o gatilho para agir no defuse. Os defensores alternam entre entrar juntos e ameaçar o defuse. Joguem até resolver a spike; após três tentativas, mudem um único posicionamento e repitam.",
      debrief: "Identifiquem qual contato ficou sem cobertura e se a resposta ao defuse chegou com tempo. Transformem o ajuste escolhido em uma chamada curta.",
      repetitions: "2 séries de 3 pós-plants, do plant à resolução da spike; manter ponto do plant e número de vivos nas duas séries.",
      success: "Meta do exercício: em 5 de 6 tentativas, todo sobrevivente confirma sua função e o time responde ao primeiro sinal de defuse conforme o plano. Anotar rounds vencidos separadamente.",
      progression: "Variem o acesso da retomada ou a ameaça de defuse; depois testem o mesmo plano com outro ponto de plant.",
      watch: "Comparar conversão de plants no mesmo site, saldo de vivos e momento; revisar cobertura entre posições e resposta ao defuse.",
    };
  }

  const BUY_PLANS = {
    pistol: { goal: "uso coordenado dos recursos do pistol", setup: "Montem compras de pistol válidas para todos, com divisão explícita de armadura, armas e utilitários.", action: "Antes de sair, confirmem qual utilitário prepara o primeiro contato e quem o acompanha." },
    eco: { goal: "um objetivo coletivo compatível com a eco", setup: "Reproduzam uma eco do recorte e a compra adversária; definam o objetivo da tentativa sem assumir igualdade de equipamento.", action: "Escolham um contato conjunto, definam quem recolhe uma arma disponível e em qual condição o time deixa de perseguir o contato." },
    "anti-eco": { goal: "contatos cobertos contra a eco adversária", setup: "Reproduzam a compra de anti-eco e adversários em eco; identifiquem os espaços em que eles podem aproximar o contato.", action: "Escolham distâncias de contato compatíveis com as armas e confirmem a cobertura antes de atravessar os pontos de aproximação." },
    "force buy": { goal: "um plano comum para recursos desiguais", setup: "Copiem uma force buy do recorte, incluindo armas e utilitários diferentes entre os jogadores; confiram a compra no VOD.", action: "Atribuam função a cada recurso comprado e uma decisão de recuo ou compromisso antes do primeiro contato." },
    armado: { goal: "execução do plano com os dois times armados", setup: "Montem um round armado contra armado, com compras e utilitários conferidos na revisão.", action: "Definam a informação necessária para avançar, o apoio do primeiro contato e a resposta caso o adversário negue a rota." },
  };

  function keyrounds(d) {
    const buy = BUY_PLANS[d.round_type];
    return {
      title: buy ? `Plano coletivo de ${d.round_type}` : "Plano de round compatível com a compra",
      summary: "Quatro rounds curtos para alinhar compra, funções e condição de compromisso.",
      objective: buy ? `Ensaiar ${buy.goal}, conferindo execução e resultado separadamente.` : "Escolher um plano executável com os recursos de um round do recorte, antes do contato.",
      setup: buy ? buy.setup : "Escolham um round do recorte e copiem as compras dos dois times. Sem esse detalhe, o treinador define uma compra de prática; equipamento inferior, isoladamente, não significa eco.",
      roles: "Um jogador confirma a compra coletiva, outro chama o primeiro contato e cada jogador informa o recurso e a função que assumirá. Os adversários repetem a mesma compra nas quatro tentativas.",
      review: "Confiram no início do round compras, recursos e objetivo anunciado. Localizem o primeiro momento em que o plano deixou de combinar com esses recursos.",
      practice: join(buy ? buy.action : "Definam objetivo, apoio do primeiro contato e condição para mudar o plano.", "Joguem até resolver o round ou por até 90 s; registrem cenários ainda abertos como inconclusivos. Após duas tentativas, mudem apenas uma chamada ou função e repitam com a mesma compra."),
      debrief: "Comparem os quatro planos com os recursos realmente disponíveis. Escolham uma regra de compra ou de execução e a condição em que ela deve mudar.",
      repetitions: "2 séries de 2 rounds, até 90 s cada, com a mesma compra do recorte nos dois times.",
      success: "Meta do exercício: nas 4 tentativas, os cinco jogadores confirmam compra, função e primeiro objetivo antes do contato; em pelo menos 3, o contato usa o apoio combinado. Registrar vitória separadamente.",
      progression: "Repitam a compra contra uma resposta adversária diferente e treinem a decisão de manter ou mudar o plano.",
      watch: "Comparar conversão no mesmo tipo de round, lado, mapa e economia; revisar se a compra coletiva sustentou o objetivo anunciado.",
    };
  }

  function halfopen(d) {
    const moment = known(d.moment);
    const secondWon = moment === "round 2 depois de vencer o pistol", secondLost = moment === "round 2 depois de perder o pistol";
    const third = ["round 3 depois de 2–0", "round 3 depois de 1–1", "round 3 depois de 0–2"].includes(moment);
    const path = secondWon ? "Recriem o round 2 após vencer o pistol e definam a compra sem assumir que o adversário fará eco."
      : secondLost ? "Recriem o round 2 após perder o pistol; decidam juntos se o plano será poupar ou comprometer recursos, usando os créditos reais."
        : third ? `Recriem o ${moment}, conferindo créditos, armas mantidas e perdas dos rounds anteriores; o placar sozinho não determina a compra.`
          : "Separem dois caminhos de abertura: vencer e perder o pistol. Para cada um, desenhem compra e plano dos rounds 2 e 3.";
    return {
      title: moment ? `Compra e plano: ${moment}` : "Caminhos de compra no início do half",
      summary: "Seis decisões ensaiadas para conectar o resultado anterior à compra e ao plano seguinte.",
      objective: "Tomar a decisão de compra com os recursos reais e deixar explícito como o próximo round será afetado.",
      setup: join(path, "Usem as compras e créditos dos rounds revisados; sem esses dados, o treinador fornece fichas de recursos identificadas como cenários de prática."),
      roles: "Um jogador conduz a chamada de compra, cada jogador informa seus recursos e o treinador confere a viabilidade. Depois da confirmação, o time ensaia o primeiro contato.",
      review: "Revisem o resultado anterior, créditos, armas preservadas e plano do round seguinte. No caminho 1–1, confiram qual dos dois rounds foi vencido, pois isso muda os recursos.",
      practice: moment ? "Usem seis fichas de recursos compatíveis com o mesmo caminho. Em cada uma, os cinco jogadores declaram recursos, fecham a compra e anunciam o primeiro objetivo e a consequência para o round seguinte. Ensaiem o primeiro contato por até 30 s; após três fichas, ajustem a chamada de compra."
        : "Ensaiem três fichas após vitória no pistol e três após derrota. Para cada ficha, confirmem compra e plano de round 2 e o ajuste previsto para o round 3; executem o primeiro contato por até 30 s. Confiram os recursos antes de aprovar o caminho.",
      debrief: "Escolham uma regra de comunicação de compra e uma exceção baseada em créditos ou armas preservadas. Anotem como conferir essa decisão no próximo half.",
      repetitions: "2 séries de 3 fichas de compra com contato curto; registrar decisão atual e consequência para o round seguinte em cada ficha.",
      success: "Meta do exercício: em 5 de 6 fichas, a compra é viável para todos, os cinco confirmam o mesmo plano e explicam o ajuste do round seguinte. Não avaliar apenas pelo resultado do contato.",
      progression: "Alterem uma arma preservada ou a compra adversária informada; o time deve recalcular a decisão e explicar o motivo.",
      watch: "Comparar conversão dos rounds 2 e 3 pelo mesmo caminho do half; revisar compras e recursos preservados entre rounds.",
    };
  }

  function pressure(d) {
    return {
      title: "Decisão coletiva sob pressão de placar",
      summary: "Quatro rounds com uma chamada principal, confirmação das funções e um ponto de reavaliação.",
      objective: "Manter a clareza da decisão e da comunicação nos rounds de maior impacto estimado para o mapa.",
      setup: join(known(d.lead) ? `Usem uma situação com o time ${d.lead} no placar.` : "Copiem o placar de um round decisivo revisado; sem ele, o treinador escolhe um placar para a simulação.",
        known(d.phase) ? `Mantenham a fase do half: ${d.phase}.` : "", "Fixem compra, lado e objetivo antes da série. A classificação de pressão não comprova nervosismo nem uma causa psicológica."),
      roles: "Um jogador chama o plano, outro resume a informação nova e cada jogador confirma sua função; o treinador observa interrupções e decisões sem confirmação.",
      review: "Pausem antes de uma decisão importante: qual era a informação disponível, quem decidiu e quais jogadores confirmaram? Confiram a comunicação no VOD ou no áudio, quando disponível.",
      practice: "Antes de cada tentativa, anunciem plano e gatilho de reavaliação. O adversário varia uma resposta tática; quando surgir informação nova, o responsável mantém ou muda o plano com uma chamada curta e confirmação dos envolvidos. Joguem por até 90 s ou até resolver o round, registrando finais abertos como inconclusivos.",
      debrief: "Revisem uma decisão mantida e uma alterada, usando somente a informação disponível naquele instante. Escolham a chamada mais clara e o momento de reavaliar.",
      repetitions: "2 séries de 2 rounds, até 90 s cada, com o mesmo contexto de placar e compra; alternar quem resume a informação nova.",
      success: "Meta do exercício: em pelo menos 3 de 4 tentativas, existe uma chamada principal, confirmação dos envolvidos e decisão explícita quando surge informação nova. Registrar o resultado do round separadamente.",
      progression: "Acrescentem uma segunda informação adversária ou menos tempo de decisão, mantendo as responsabilidades de comunicação.",
      watch: "Comparar decisões e resultados em rounds de pressão com mesmo contexto de placar, fase, lado e economia; conferir a comunicação na revisão.",
    };
  }

  function create(focus) {
    const f = focus && typeof focus === "object" ? focus : {};
    const dims = f.dims && typeof f.dims === "object" && !Array.isArray(f.dims) ? f.dims : {};
    const evidence = Array.isArray(f.evidence) ? f.evidence.filter((ev) => ev && typeof ev === "object") : [];
    const recipes = {
      trade: () => trade(dims, f), advantage: () => advantage(dims), fb_open: () => firstBlood(dims, false),
      fb_rec: () => firstBlood(dims, true), post: () => planted(dims, false), retake: () => planted(dims, true),
      keyrounds: () => keyrounds(dims), halfopen: () => halfopen(dims), pressure: () => pressure(dims),
    };
    const recipe = (Object.prototype.hasOwnProperty.call(recipes, f.key) ? recipes[f.key] : () => keyrounds(dims))();
    const economy = known(dims.economy) ? `Reproduzam a condição de economia do recorte: ${dims.economy}; confiram armas e utilitários na revisão.` : "Confiram as compras na revisão e mantenham os recursos iguais entre as séries.";
    return {
      title: recipe.title, summary: recipe.summary, minutes: 25,
      objective: join(recipe.objective, uncertainty(f)), context: analyzedContext(f, dims),
      setup: join(practiceLocation(dims, evidence), recipe.setup, participants(f.key, dims), economy), roles: recipe.roles,
      steps: [
        { title: "Revisão guiada", minutes: 5, instruction: join(openingReview(evidence), recipe.review) },
        { title: "Prática em personalizada", minutes: 15, instruction: recipe.practice },
        { title: "Debrief e aplicação", minutes: 5, instruction: recipe.debrief },
      ],
      repetitions: recipe.repetitions, success: recipe.success, progression: recipe.progression, watch: recipe.watch, evidence,
    };
  }

  window.RoundRxTraining = { create };
})();
