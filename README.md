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
- Catalogo local de schemas em `schemas.json` para mapear dataset/tabela para as colunas disponiveis.

App local:

- Landing/graph: `http://localhost:3003/`
- Tabela: `http://localhost:3003/table`

## Scripts

- `bun run start`: sobe o servidor (`index.ts`)
- `bun run dev`: modo watch
- `bun run test`: roda os testes
- `bun run typecheck`: roda o typecheck em TypeScript

APIs:

- `GET /api/graph/:cnpj`
- `GET /api/lookup/:cnpj?limit=10|20|30|40`
- `GET /api/lookup/:cnpj/dataset/:datasetId?fresh=1&limit=...`
- `GET /api/lookup/related?datasetId=...&foreignKey=...&value=...&limit=...`

## Arquitetura de dados

- `schemas.json` define o mapeamento entre `dataset.tabela` e as colunas disponiveis no catalogo.
- `duckdb-ssh.ts` abre uma conexão SSH multiplexada (`ControlMaster`) para `beelink` e envia SQL via stdin para `duckdb -readonly -json`; o array JSON do stdout vira o result set.
- `parquet-store.ts` monta o `SELECT`/`WHERE`/`LIMIT` contra as views `"dataset"."tabela"` e delega a execução a `duckdb-ssh.ts`.
- `cnpj-index.ts` constrói cláusulas `WHERE` SQL por tipo de coluna CNPJ (`basico`, `full`, `mixed`) e delega o filtro ao DuckDB; sem varredura client-side.
- `index.ts` usa esse backend para tabela, grafo e lookups relacionados.

## Estrutura de arquivos

- `index.ts`: servidor HTTP, HTML e APIs
- `graph-client.ts`: logica de visualizacao e interacao do grafo
- `public/graph.js`: bundle browser gerado
- `cnpj-datasets.ts`: configuracao de datasets e relacoes
- `duckdb-ssh.ts`: execução de SQL remoto via SSH no `duckdb` de `beelink`
- `parquet-store.ts`: construção de SQL sobre as views do catalogo
- `cnpj-index.ts`: matching e lookup por CNPJ nas tabelas do catalogo
- `cache.ts`: cache two-layer — L1 em memória (`Map`) + L2 em disco (`.cache/`)

## Licenca

Defina aqui a licenca oficial do projeto (ex.: MIT, Apache-2.0, proprietaria).
