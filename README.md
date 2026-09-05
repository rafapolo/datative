# Datative

<div align="center">
  <img src="assets/logo.png" alt="Datative Logo" width="200" />
</div>

Datative é um site estático de investigação que mostra as redes das entidades (CNPJ/CPF) com maior abrangência entre datasets publicos federais — Receita Federal, CGU, TSE, SIAFI e mais. Não há consulta ao vivo: todo o grafo de cada entidade é pré-computado offline e servido como JSON estático.

![Datative Screenshot](assets/datative.png)

## Principais capacidades

- Landing page lista as entidades pré-computadas, ordenadas por quantidade de datasets em que aparecem.
- Visualização de grafo (empresa/pessoa <-> sócios <-> registros de outros datasets), servida a partir de `static/entities/<id>.json`.
- Layouts de grafo:
  - `radial`
  - `forceatlas2`
  - `collapsible-tree`
  - `pack` (circle packing hierarquico, estilo D3 pack)
- Sem servidor de dados em tempo de request — `src/index.ts` só lê arquivos estáticos.

App local:

- Landing/graph: `http://localhost:3003/`

## Scripts

- `bun run start`: sobe o servidor estático (`src/index.ts`)
- `bun run dev`: modo watch
- `bun run build:graph`: rebuild de `public/graph.js` a partir de `src/graph-client.ts`
- `bun run generate:static`: roda `scripts/generate-static-entities.ts` (consulta `beelink` via SSH offline e grava `static/`)
- `bun run test`: roda os testes (`tests/`)
- `bun run typecheck`: roda o typecheck em TypeScript

API:

- `GET /api/graph/:id` — lê `static/entities/:id.json` diretamente; 404 se a entidade não foi pré-computada.

## Arquitetura

- `src/index.ts`: servidor HTTP puramente estático — landing page, página de grafo, `/api/graph/:id` lendo `static/`.
- `src/graph-client.ts` + `src/node-shape-programs.ts`: bundle browser (Sigma 3 + graphology) que renderiza o `{nodes,links}` recebido.
- `src/cnpj-datasets.ts`: configuração de datasets/cores usada tanto pelo cliente (coloração dos nós) quanto pelo gerador.
- `scripts/generate-static-entities.ts`: **único** lugar que fala com dados ao vivo. Ranqueia entidades por quantidade de datasets distintos em que aparecem (não por volume de linhas), pré-computa a rede de cada uma no mesmo formato `{nodes,links}` e grava em `static/entities/<id>.json` + `static/entities-index.json`.
- `scripts/lib/`: camada de acesso a dados usada só pelo gerador (offline) — `duckdb-ssh.ts` (SQL via SSH em `beelink`), `parquet-store.ts` (monta `SELECT`/`WHERE`/`LIMIT` contra as views do catálogo), `cnpj-index.ts` (matching de coluna CNPJ/CPF), `cache.ts` (cache em disco entre execuções do gerador).
- `data/schemas.json`: catálogo local dataset/tabela → colunas, usado por `scripts/lib/parquet-store.ts`.

## Estrutura de arquivos

- `src/`: servidor + cliente de grafo (ver Arquitetura acima)
- `scripts/`: `generate-static-entities.ts`, `benchmark.ts`, `lib/` (acesso a dados offline)
- `data/`: `schemas.json` (catálogo de tabelas)
- `static/`: saída gerada por `generate-static-entities.ts` (`entities/`, `entities-index.json`) — o que o servidor realmente serve
- `public/graph.js`: bundle browser gerado a partir de `src/graph-client.ts`
- `tests/`: testes unitários (`bun test`)

## Licenca

Defina aqui a licenca oficial do projeto (ex.: MIT, Apache-2.0, proprietaria).
