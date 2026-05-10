# Datative

<div align="center">
  <img src="assets/logo.png" alt="Datative Logo" width="200" />
</div>

Datative é uma plataforma de analise investigativa para explorar conexoes entre empresas, socios e dados publicos a partir de tabelas remotas em parquet no object storage, com visualizações iterativas e lookups cruzados por CNPJ.

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
- Leitura remota de arquivos parquet em S3-compativel com contagem de bytes recebidos por sessao.
- Catalogo local de schemas em `schemas.json` para mapear dataset/tabela para o path remoto equivalente.

## Stack

- Runtime: Bun
- Backend: `Bun.serve` em `index.ts`
- Frontend do grafo: Sigma + Graphology (`graph-client.ts` compilado para `public/graph.js`)
- Dados: parquet remoto em object storage S3-compativel
- Leitura parquet: `@duckdb/node-api` (httpfs)

## Requisitos

- Bun 1.x
- Credenciais com acesso de leitura ao bucket S3-compativel configurado

## Configuracao

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

2. Preencha variaveis em `.env`:

- `HETZNER_S3_BUCKET`: nome do bucket remoto
- `HETZNER_S3_ENDPOINT`: endpoint S3-compativel
- `S3_ACCESS_KEY_ID`: access key
- `S3_SECRET_ACCESS_KEY`: secret key
- `PORT`: porta HTTP (padrao no codigo: `3003`)

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
- `bun run test`: roda os testes
- `bun run typecheck`: roda o typecheck em TypeScript

APIs:

- `GET /api/graph/:cnpj`
- `GET /api/lookup/:cnpj?limit=10|20|30|40`
- `GET /api/lookup/:cnpj/dataset/:datasetId?fresh=1&limit=...`
- `GET /api/lookup/related?datasetId=...&foreignKey=...&value=...&limit=...`

## Arquitetura de dados

- `schemas.json` define o mapeamento entre `dataset.tabela` e o prefixo remoto em parquet.
- `parquet-store.ts` mantém um pool de 4 conexões DuckDB com httpfs; cada query é um `SELECT` com predicados empurrados para o S3 — só os row-groups relevantes são baixados.
- `cnpj-index.ts` constrói cláusulas `WHERE` SQL por tipo de coluna CNPJ (`basico`, `full`, `mixed`) e delega o filtro ao DuckDB; sem varredura client-side.
- `index.ts` usa esse backend para tabela, grafo e lookups relacionados.

## Estrutura de arquivos

- `index.ts`: servidor HTTP, HTML e APIs
- `graph-client.ts`: logica de visualizacao e interacao do grafo
- `public/graph.js`: bundle browser gerado
- `cnpj-datasets.ts`: configuracao de datasets e relacoes
- `parquet-store.ts`: acesso ao bucket S3 e leitura parquet
- `cnpj-index.ts`: matching e lookup por CNPJ em tabelas parquet
- `cache.ts`: cache two-layer — L1 em memória (`Map`) + L2 em disco (`.cache/`)

## Deploy

O deploy é gerenciado pelo [haloy](https://haloy.dev) e disparado automaticamente via GitHub Actions a cada push na branch `main`.

```
git push origin main  # build + deploy automático em datative.ミ.xyz
```

O workflow (`.github/workflows/deploy.yml`) instala o haloy CLI, registra o servidor e executa `haloy deploy`, que constrói a imagem Docker e envia ao servidor. As seguintes variáveis precisam estar configuradas como secrets no repositório GitHub:

- `HALOY_TOKEN`
- `HETZNER_S3_BUCKET`
- `HETZNER_S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

## Observacoes operacionais

O principal custo é transferência e varredura de objetos S3. Vale monitorar:

- bytes recebidos por sessao
- quantidade de arquivos por tabela
- seletividade dos filtros e limites

## Licenca

Defina aqui a licenca oficial do projeto (ex.: MIT, Apache-2.0, proprietaria).
