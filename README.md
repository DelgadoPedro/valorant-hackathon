# ValoStrat.gg

O ValoStrat.gg é uma ferramenta de análise para times universitários de VALORANT. A partir dos JSONs das partidas, o projeto transforma dados de rounds, kills, economia, posições e composição de agentes em métricas coletivas, padrões observados, evidências para revisão de VOD e planos de treino.

O produto foi pensado para responder: **o que o time deve revisar no próximo treino para ganhar mais rounds?**

Acesse a ferramenta agora em: [https://valostrat-gg.vercel.app/](https://valostrat-gg.vercel.app/)

## Visão geral

O fluxo do usuário é simples:

1. escolher uma equipe e visualizar o Panorama;
2. comparar o desempenho observado com situações semelhantes da liga;
3. localizar padrões de trade, vantagem, first blood, pós-plant, retake, rounds-chave e pressão;
4. abrir partidas e rounds específicos para revisar no VOD;
5. iniciar uma missão, selecionar até três focos e gerar um plano de treino em PDF.

O painel é um HTML estático, com dados, D3, CSS, JavaScript, fontes e imagens incorporados. Depois de gerado, funciona offline e não depende de banco de dados, API ou Node.js em tempo de uso.

Na execução versionada do projeto, a base processada contém 336 partidas, 6.618 rounds e 68 equipes. O número exato de partidas, times e métricas de cada execução fica registrado em `outputs/run_manifest.json`.

## Arquitetura resumida

```text
JSONs → ingestão → tabelas canônicas → estados de round
     → métricas → agregações → diagnóstico contextual
     → payload → painel HTML offline + missão + PDF
```

O pipeline usa Python, pandas, NumPy, PyArrow, SciPy e scikit-learn. Os modelos de expectativa comparam taxa global, células com encolhimento e regressão logística L2, usando validação por série. O diagnóstico também usa bootstrap, recorrência e simulações nulas para reduzir falsos positivos. A explicação completa está em [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md).

## Como rodar localmente

### Opção rápida: abrir somente o front-end

Se a intenção é apenas testar o site já gerado, abra [`site/index.html`](site/index.html) diretamente no navegador. Para servir pelo navegador em `localhost`, não é necessário instalar Node.js:

```bash
python -m http.server 8000 --directory site
```

Acesse <http://localhost:8000>.

### Ubuntu / Linux

Na raiz do projeto:

```bash
sudo apt update
sudo apt install python3 python3-venv

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# validação rápida, sem processar a base completa
python -m roundrx selftest

# processa os JSONs, calcula métricas, diagnóstico e painel
python -m roundrx run

# abre o painel gerado em localhost
python -m http.server 8000 --directory site
```

### Windows PowerShell

Na raiz do projeto:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# validação rápida, sem processar a base completa
python -m roundrx selftest

# processa os JSONs, calcula métricas, diagnóstico e painel
python -m roundrx run

# abre o painel gerado em localhost
py -m http.server 8000 --directory site
```

O comando `run` procura os dados em `dados/Dados .Json`. Para usar outra pasta:

```bash
python -m roundrx run --data-dir "/caminho/para/Dados .Json"
```

Também é possível alterar `paths.data_dir` em [`config.yaml`](config.yaml).

### Comandos úteis

```bash
# regerar somente o HTML, usando outputs intermediários já existentes
python -m roundrx viz

# recalcular somente o diagnóstico e o painel
python -m roundrx fundamentals

# executar os testes Python
python -m pytest -q

# gerar painéis privados por equipe
python -m roundrx private --dest ../valostrat-times
```

O `run` gera o painel em [`site/index.html`](site/index.html) e relatórios em `outputs/`. As tabelas Parquet são saídas locais pesadas e não precisam ser versionadas.

## Documentação

- [Visão geral do produto, arquitetura, ML e execução detalhada](docs/PROJECT_OVERVIEW.md)
- [Referência técnica completa e decisões de modelagem](docs/TECHNICAL_REFERENCE.md)
- [Direção visual e arquitetura de informação](docs/DESIGN.md)
- [Design system da missão e PDF](docs/MISSION_DESIGN_SYSTEM.md)
- [Dicionário de métricas](reference/metrics_dictionary.csv)
- [Dependências Python](requirements.txt)

## Limitações importantes

As posições são snapshots de eventos, não trajetórias completas; proximidade não comprova visão ou cobertura. Algumas classificações econômicas são heurísticas, e os padrões encontrados são evidências para investigação — não uma prova causal. O painel público contém nomes de equipes e jogadores da base.
