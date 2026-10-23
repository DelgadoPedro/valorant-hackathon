# ValoStrat.gg — visão geral do projeto

## 1. Visão geral

O ValoStrat.gg é uma ferramenta de análise para times universitários de VALORANT. Ele transforma os dados brutos das partidas em respostas práticas para uma pergunta simples:

> O que o time precisa revisar no próximo treino para ganhar mais rounds?

O projeto combina métricas coletivas, comparação contextual com outros times da base, evidências de rounds específicos e uma experiência de treino gamificada. A ideia não é entregar apenas um placar ou um ranking de jogadores: é ajudar o time a encontrar padrões repetidos, localizar esses padrões no VOD e transformar a descoberta em uma ação de treino.

Na execução versionada que acompanha o projeto, a base contém 336 partidas, 6.618 rounds e 68 times. Os dados estão em JSONs organizados por competição e fase, principalmente Univavá e Rush Series. Os números podem mudar quando novas partidas forem adicionadas; a execução registrada em `outputs/run_manifest.json` é a fonte de verdade do recorte processado.

## 2. O que o usuário encontra no produto

O front-end é uma aplicação estática, incorporada em um único HTML, e funciona offline depois de carregada.

### Home

Apresenta a proposta do ValoStrat.gg e explica como usar a ferramenta: identificar um ponto de atenção, descobrir onde ele aparece, revisar o VOD, treinar e acompanhar a evolução.

### Panorama da equipe

Resume a campanha da equipe, mapas jogados, vitórias, derrotas, rounds e período analisado. A tela destaca:

- pontos de atenção, quando existe um padrão abaixo do esperado;
- pontos fortes, quando há um padrão positivo recorrente;
- fundamentos que merecem investigação;
- convite para iniciar uma missão de evolução.

### Análise de fundamentos

Os fundamentos são analisados em situações comparáveis, e não apenas pela média bruta. O painel cobre:

- trade kill e cobertura entre companheiros;
- preservação e conversão de vantagem numérica;
- first blood e recuperação depois de sofrer a primeira eliminação;
- pós-plant e retake;
- rounds-chave, como pistol, eco, anti-eco, force buy e armado;
- início de half;
- rounds decisivos e pressão no mapa.

Cada análise mostra o observado, o esperado para situações semelhantes, a diferença, o tamanho da amostra e, quando aplicável, a recorrência entre partidas. O usuário pode abrir o contexto, ver onde o padrão aparece e chegar aos rounds que devem ser revisados no VOD.

### Página de partida e round

A página de partida apresenta o placar round a round, estatísticas dos jogadores, agentes, K/D/A, ACS, ADR, KAST, first kills e first deaths. A seção “Rounds para revisar” prioriza os rounds que mais alteraram a chance de vitória no mapa.

Ao abrir um round, o usuário vê a linha do tempo das eliminações, a reconstrução dos estados numéricos e a posição dos jogadores nos snapshots disponíveis de kill, plant e defuse.

### Missão de evolução e PDF

O botão “Iniciar missão” transforma os achados em um plano de treino. O time pode selecionar até três focos, acessar as evidências e gerar um PDF com:

- resumo do diagnóstico;
- indicador do time, esperado e liga;
- recortes e contexto;
- rounds para revisão;
- ações para Scrim, VOD e referências;
- forma de acompanhar o próximo treino.

As recomendações e o PDF são gerados no navegador a partir dos mesmos dados usados no painel. Eles não inventam uma causa: apresentam um padrão observado e orientam a validação humana no VOD.

## 3. Como o sistema funciona

O fluxo principal é:

```text
JSONs das partidas
        ↓
Ingestão e normalização
        ↓
Tabelas canônicas (Parquet)
        ↓
Estados de round, vivos, economia e trades
        ↓
Métricas por time-round
        ↓
Agregações por partida, time, mapa e liga
        ↓
Diagnóstico contextual e evidências
        ↓
Payload compacto + HTML interativo offline
```

### Camada de dados

`roundrx/ingest.py` lê cada JSON, calcula um hash do arquivo e normaliza os dados em tabelas canônicas. Entre os dados preservados estão partidas, times, jogadores, rounds, economia, dano, kills, posições nos eventos e objetivos de spike.

`roundrx/states.py` reconstrói estados que não vêm prontos no JSON: jogadores vivos após cada evento, revives inferidos, trades, economia por time-round, lado, tipo de compra e sequências de rounds.

### Camada de métricas

As métricas são registradas por ID no dicionário `reference/metrics_dictionary.csv` e implementadas em `roundrx/metrics/`. Elas seguem um contrato comum de numerador e denominador:

```text
valor = soma(numerador) / soma(denominador)
```

Isso evita que uma média de médias distorça a leitura quando filtros de partida, mapa ou lado são aplicados. Métricas de contagem preservam a soma do numerador.

As lentes principais são economia, rounds-chave, dinâmica/vantagem, first blood, trade, pós-plant, retake, posicionamento, composição de agentes, início de half e pressão.

### Diagnóstico de fundamentos

`roundrx/fundamentals/` constrói eventos com contexto — por exemplo, uma morte com quantidade de aliados vivos, distância ao aliado mais próximo, lado, mapa, fase do round e economia. Depois compara o resultado do time com uma referência formada por outros times em situações equivalentes.

O detector não chama uma diferença isolada de “erro”. Ele procura um padrão que seja suficientemente grande, tenha intervalo de confiança que não atravesse zero e se repita em partidas diferentes. A linguagem do produto é, portanto, “padrão observado” ou “situação para revisão”.

## 4. Parte técnica e uso de machine learning

O projeto usa machine learning e estatística aplicada de forma controlada, para estimar expectativas e reduzir comparações injustas entre situações diferentes. Não é um modelo de classificação de jogadores nem um sistema que promete causalidade.

### Modelos de expectativa

Para cada fundamento, o sistema compara uma escada de modelos:

1. **M0 — taxa global:** referência mais simples.
2. **M1 — células de contexto:** médias por prefixos de contexto com encolhimento hierárquico; células raras são puxadas para uma média mais geral.
3. **M2 — regressão logística L2:** variáveis categóricas transformadas com one-hot encoding e regularização.

O modelo escolhido é o mais simples que melhora o `log-loss` fora da amostra e permanece bem calibrado. A avaliação usa `GroupKFold`, mantendo uma série inteira no mesmo fold. Para calcular o esperado de um time, todas as partidas daquele time — inclusive as linhas do adversário nessas partidas — ficam fora do ajuste (`leave-one-team-out`). Assim, o time não é comparado contra uma expectativa contaminada pelo próprio resultado.

### Pressão e Leverage Index

`roundrx/leverage.py` calcula o quanto um round pode mudar a chance de vencer o mapa:

- uma cadeia de Markov calcula a chance de vitória a partir do placar, lado e mapa;
- `W+` é a chance se o time vencer o round;
- `W−` é a chance se o time perder o round;
- `L = max(0, W+ − W−)` é o impacto potencial do round;
- `LI` compara esse impacto com o round típico da liga;
- uma regressão logística estima a chance de vencer o round usando lado, mapa, pistol e economia relativa.

O `LI` mede a importância estrutural do round para o mapa; ele não mede nervosismo e não prova que um time “sente pressão”. Por isso o painel usa pressão para priorizar rounds e situações de revisão, não para dar uma nota psicológica ao time.

### Validação e controle de falsos positivos

O pipeline inclui:

- cenário sintético com resultados calculados manualmente;
- checagens cruzadas com campos oficiais do JSON;
- métricas de `log-loss`, Brier e erro de calibração;
- intervalos de confiança por bootstrap de partidas;
- recorrência do sinal entre partidas;
- calibração do limiar de detecção por simulações nulas.

O dicionário atual possui 180 métricas: 165 estão no escopo calculado nesta etapa, sendo 31 validadas por checagem independente e 134 implementadas com checagens de sanidade; 15 permanecem adiadas por dependerem de modelos ainda fora do escopo.

## 5. Arquitetura do front-end

O front-end não depende de servidor de aplicação, banco ou API em tempo de uso. `roundrx/viz/build.py` lê os Parquets gerados, monta um payload compacto e injeta dados, D3, ícones, fontes, CSS e JavaScript em um HTML único.

Principais arquivos:

- `roundrx/viz/app.js`: navegação, filtros, métricas, gráficos e reconstrução de rounds;
- `roundrx/viz/mission.js`: fluxo interativo da missão;
- `roundrx/viz/mission-report.js`: recortes e fatos descritivos;
- `roundrx/viz/mission-training.js`: plano de treino e recomendações determinísticas;
- `roundrx/viz/mission-pdf.js`: geração local do PDF;
- `roundrx/viz/app.css` e `roundrx/viz/mission.css`: interface e missão;
- `roundrx/viz/vendor/`: D3, fontes, mapas, agentes, logos e imagens locais.

Por isso, depois de gerado, o painel pode ser copiado ou hospedado como arquivo estático. A publicação prevista no projeto é a pasta `site/`, configurada em `vercel.json`.

## 6. Como rodar localmente

Há dois caminhos, dependendo do objetivo.

### Caminho A — apenas abrir o front-end já gerado

Este caminho não precisa de Python, banco ou Node. Basta abrir `site/index.html` no navegador. Para evitar restrições de alguns navegadores ao abrir arquivos locais, use um servidor HTTP simples:

```bash
cd valorant-hackathon
python3 -m http.server 8000 --directory site
```

Abra <http://localhost:8000>.

No Windows PowerShell, o comando equivalente é:

```powershell
py -m http.server 8000 --directory site
```

### Caminho B — reconstruir a análise a partir dos JSONs

Requer Python 3.10 ou superior. O pipeline usa `pandas`, `numpy`, `pyarrow`, `PyYAML`, `scikit-learn`, `scipy` e `pytest`, todos listados em `requirements.txt`.

Linux/macOS:

```bash
cd valorant-hackathon
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# validação rápida, sem ler a base completa
python -m roundrx selftest

# pipeline completo: JSON → métricas → diagnóstico → painel
python -m roundrx run

# depois da execução, abra o painel local
python -m http.server 8000 --directory site
```

Windows PowerShell:

```powershell
cd valorant-hackathon
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

python -m roundrx selftest
python -m roundrx run
py -m http.server 8000 --directory site
```

O comando `run` lê `dados/Dados .Json` por padrão. Para usar outra pasta:

```bash
python -m roundrx run --data-dir "/caminho/para/Dados .Json"
```

O caminho também pode ser alterado em `config.yaml`, em `paths.data_dir`.

### Comandos úteis

```bash
# Regerar somente o HTML, usando as tabelas intermediárias já existentes
python -m roundrx viz

# Recalcular somente o diagnóstico e o painel; exige outputs/canonical e outputs/derived
python -m roundrx fundamentals

# Executar os testes Python
python -m pytest -q

# Gerar painéis privados por equipe; os códigos ficam fora do repositório
python -m roundrx private --dest ../valostrat-times
```

O pipeline produz, entre outros:

- `site/index.html`: painel pronto para hospedagem;
- `outputs/dashboard/roundrx_painel_publicavel.html`: cópia offline gerada para inspeção;
- `outputs/canonical/`: tabelas normalizadas;
- `outputs/derived/`: estados, trades e economia;
- `outputs/metrics/`: métricas agregadas;
- `outputs/fundamentals/`: eventos, padrões, evidências e validação do diagnóstico;
- `outputs/quality/`: qualidade da base e checagens cruzadas;
- `outputs/coverage/`: cobertura do dicionário de métricas;
- `outputs/run_manifest.json`: fingerprints, versões, contagens e tempos da execução.

As tabelas Parquet e o HTML gerado são saídas locais e pesadas, ignoradas pelo Git. O arquivo `site/index.html` é versionado para permitir a publicação do front já pronto.

## 7. Limitações importantes

- Os JSONs trazem snapshots em eventos, não trajetórias completas; proximidade não significa linha de visão ou cobertura efetiva.
- Habilidades por round não estão disponíveis de forma confiável na base.
- Force buy, bonus e algumas categorias econômicas são heurísticas.
- O diagnóstico identifica associação e padrão observado; a causa precisa ser confirmada pelo time no VOD.
- O painel público incorpora nomes de times e jogadores presentes na base. Para compartilhar somente com convidados, use `python -m roundrx private`; não publique o arquivo `CODIGOS.txt`.

## 8. Onde continuar lendo

- [Referência técnica completa](TECHNICAL_REFERENCE.md): decisões detalhadas, dicionário de métricas e histórico de implementação.
- [README](../README.md): resumo e quickstart para Windows e Ubuntu/Linux.
- [Direção visual e arquitetura de informação](DESIGN.md).
- [Design system da missão](MISSION_DESIGN_SYSTEM.md).
- [Dicionário de métricas](../reference/metrics_dictionary.csv).
