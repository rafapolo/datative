# Datative

<div align="center">
  <img src="assets/logo.png" alt="Datative Logo" width="200" />
</div>

Datative é uma plataforma de analise investigativa para explorar conexoes entre empresas, socios e dados publicos a partir do catalogo DuckDB espelhado em `beelink` (o mesmo catalogo do projeto irmao `rodado`), com visualizações iterativas e lookups cruzados por CNPJ.

![Datative Screenshot](assets/datative.png)

## Principais capacidades

- Busca de empresa por CNPJ e expansao de vizinhanca (empresa <-> socios).
- Lookup cruzado em multiplos datasets com deteccao de CNPJ em colunas relevantes.
- Painel lateral com detalhes por dataset e destaque de linhas ligadas ao no selecionado.
- Layouts de grafo:
  - `radial`
  - `forceatlas2`
  - `collapsible-tree`
  - `pack` (circle packing hierarquico, estilo D3 pack)
- Controle de limite de lookup (10, 20, 30, 40) e cache local para reduzir custo de consulta.
- Consulta remota via SQL enviado por SSH a um `duckdb` rodando em `beelink`, sem servidor intermediario.
- Catalogo local de schemas em `data/schemas.json` para mapear dataset/tabela para as colunas disponiveis.
- `scripts/generate-static-entities.ts`: pre-computa as redes dos 100 CNPJs/CPFs com maior abrangencia entre datasets (nao maior volume) e grava JSON estatico em `static/`, para publicacao sem servidor (ex.: GitHub Pages).

App local:

- Landing/graph: `http://localhost:3003/`
- Tabela: `http://localhost:3003/table`

## Scripts

- `bun run start`: sobe o servidor (`src/index.ts`)
- `bun run dev`: modo watch
- `bun run build:graph`: rebuild de `public/graph.js` a partir de `src/graph-client.ts`
- `bun run generate:static`: roda `scripts/generate-static-entities.ts`
- `bun run test`: roda os testes (`tests/`)
- `bun run typecheck`: roda o typecheck em TypeScript

APIs:

- `GET /api/graph/:cnpj`
- `GET /api/lookup/:cnpj?limit=10|20|30|40`
- `GET /api/lookup/:cnpj/dataset/:datasetId?fresh=1&limit=...`
- `GET /api/lookup/related?datasetId=...&foreignKey=...&value=...&limit=...`

## Arquitetura de dados

- `data/schemas.json` define o mapeamento entre `dataset.tabela` e as colunas disponiveis no catalogo.
- `src/duckdb-ssh.ts` abre uma conexão SSH multiplexada (`ControlMaster`) para `beelink` e envia SQL via stdin para `duckdb -readonly -json`; o array JSON do stdout vira o result set.
- `src/parquet-store.ts` monta o `SELECT`/`WHERE`/`LIMIT` contra as views `"dataset"."tabela"` e delega a execução a `duckdb-ssh.ts`.
- `src/cnpj-index.ts` constrói cláusulas `WHERE` SQL por tipo de coluna CNPJ (`basico`, `full`, `mixed`) e delega o filtro ao DuckDB; sem varredura client-side.
- `src/index.ts` usa esse backend para tabela, grafo e lookups relacionados.

## Estrutura de arquivos

- `src/index.ts`: servidor HTTP, HTML e APIs
- `src/graph-client.ts`: logica de visualizacao e interacao do grafo
- `src/cnpj-datasets.ts`: configuracao de datasets e relacoes
- `src/duckdb-ssh.ts`: execução de SQL remoto via SSH no `duckdb` de `beelink`
- `src/parquet-store.ts`: construção de SQL sobre as views do catalogo
- `src/cnpj-index.ts`: matching e lookup por CNPJ nas tabelas do catalogo
- `src/cache.ts`: cache two-layer — L1 em memória (`Map`) + L2 em disco (`.cache/`)
- `data/`: `schemas.json` (catalogo de tabelas) e `cnpjs_interesse.csv` (lista curada da landing page)
- `scripts/`: `generate-static-entities.ts` (top-100 estatico) e `benchmark.ts`
- `static/`: saida gerada por `generate-static-entities.ts` (`entities/`, `entities-index.json`)
- `public/graph.js`: bundle browser gerado a partir de `src/graph-client.ts`
- `tests/`: testes unitarios (`bun test`)

## Licenca

Defina aqui a licenca oficial do projeto (ex.: MIT, Apache-2.0, proprietaria).
