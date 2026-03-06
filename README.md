# Datative

![Datative Logo](assets/logo.png)

Datative e uma plataforma de analise investigativa para explorar conexoes entre empresas, socios e dados publicos relacionados. O projeto combina consultas no BigQuery com visualizacao de grafo interativa para acelerar investigacoes.

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
- Tracking de bytes processados no BigQuery via `usage.json`.

## Stack

- Runtime: Bun
- Backend: `Bun.serve` em `index.ts`
- Frontend do grafo: Sigma + Graphology (`graph-client.ts` compilado para `public/graph.js`)
- Dados: Google BigQuery

## Requisitos

- Bun 1.x
- Projeto GCP com BigQuery habilitado
- Credencial de service account com permissao de leitura nos datasets usados

## Configuracao

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

2. Preencha variaveis em `.env`:

- `GCP_PROJECT_ID`: ID do projeto GCP
- `GOOGLE_APPLICATION_CREDENTIALS`: caminho para o arquivo JSON (opcional se usar `GCP_SERVICE_ACCOUNT_JSON`)
- `GCP_SERVICE_ACCOUNT_JSON`: JSON completo da credencial (opcional)
- `PORT`: porta HTTP (padrao no codigo: `3003`)
- `DOMAIN`, `CERT_RESOLVER`, `TRAEFIK_NETWORK`: usados no deploy com Traefik

## Executar localmente

```bash
bun install
bun build graph-client.ts --outfile public/graph.js --target browser
bun run dev
```

App local:

- Landing/graph: `http://localhost:3003/`
- Tabela: `http://localhost:3003/table`

## Scripts

- `bun run start`: sobe o servidor (`index.ts`)
- `bun run dev`: modo watch

## Rotas principais

HTML:

- `GET /` ou `GET /graph?cnpj=<cnpj>`
- `GET /table`

Assets:

- `GET /graph.js`

APIs:

- `GET /api/graph/:cnpj`
- `GET /api/lookup/:cnpj?limit=10|20|30|40`
- `GET /api/lookup/:cnpj/dataset/:datasetId?fresh=1&limit=...`
- `GET /api/lookup/related?datasetId=...&foreignKey=...&value=...&limit=...`

## Docker / deploy

O repositorio inclui `docker-compose.yaml` com:

- container Bun (`oven/bun:1`)
- labels para roteamento Traefik
- volume de credencial GCP como somente leitura (`/gcp-credentials.json`)

Subida tipica de deploy:

```bash
docker compose up -d
```

## Estrutura de arquivos

- `index.ts`: servidor HTTP, HTML e APIs
- `graph-client.ts`: logica de visualizacao e interacao do grafo
- `public/graph.js`: bundle browser gerado
- `cnpj-datasets.ts`: configuracao de datasets e relacoes
- `cache.ts`: cache em memoria
- `usage.json`: controle de bytes processados no mes

## Desenvolvimento

Sempre que alterar `graph-client.ts`, gere novamente o bundle:

```bash
bun build graph-client.ts --outfile public/graph.js --target browser
```

Antes de commit:

```bash
git status
```

## Licenca

Defina aqui a licenca oficial do projeto (ex.: MIT, Apache-2.0, proprietaria).
