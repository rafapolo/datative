# Datative

<div align="center">
  <img src="assets/logo.png" alt="Datative Logo" width="200" />
</div>

Datative é um site estático de investigação que mostra as redes das entidades (CNPJ/CPF) com maior abrangência entre datasets publicos federais — Receita Federal, CGU, TSE, SIAFI e mais. Não há consulta ao vivo: todo o grafo de cada entidade é pré-computado offline e servido como JSON estático. Publicado automaticamente no GitHub Pages a cada push em `main`.

![Datative Screenshot](assets/datative.png)

## Principais capacidades

- Landing page lista as 50 empresas e 50 pessoas pré-computadas com maior abrangência (número de datasets distintos em que aparecem, não volume de linhas), em seções separadas.
- Visualização de grafo (empresa/pessoa <-> sócios <-> registros de outros datasets), servida a partir de `static/entities/<id>.json`. Cada dataset com hits vira um nó-hub colorido (ex. "CGU · Contratos") com seus registros pendurados embaixo.
- O grafo em si mostra só uma amostra por dataset (evita virar um emaranhado) — o painel lateral mostra a tabela completa, com todas as linhas, independente do que está visível no grafo.
- Painel lateral (esquerda) com uma seção por dataset (tabela de colunas originais, linha a linha) — clicar no nó-hub de um dataset no grafo foca/expande a seção correspondente. Painel de detalhes do nó selecionado fica à direita.
- Layouts de grafo:
  - `radial`
  - `radial-compact` ("Radial Compacto") — mesmo layout, mas limita quantos registros de cada dataset aparecem no anel (o resto vira um nó "+N mais"), para grafos com muitos hits por dataset
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
- `bun run build:site`: exporta o site inteiro (HTML + JSON + assets) para `dist/`, pronto para qualquer host estático
- `bun run generate:static`: roda `scripts/generate-static-entities.ts` (consulta `beelink` via SSH offline e grava `static/`) — aceita `--top=N` (padrão 50, por tipo), `--per-dataset-limit` (nós visíveis no grafo por dataset, padrão 15), `--panel-limit` (linhas buscadas para a tabela do painel, padrão 500), `--concurrency`, `--force`
- `bun run test`: roda os testes (`tests/`)
- `bun run typecheck`: roda o typecheck em TypeScript

API (servidor de desenvolvimento):

- `GET /entities/:id.json` — lê `static/entities/:id.json` diretamente; 404 se a entidade não foi pré-computada. No site publicado (GitHub Pages) esse mesmo caminho é um arquivo estático, sem servidor.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` roda a cada push em `main`: `bun run build:graph` + `bun run build:site`, depois publica `dist/` via Actions. **Não** roda `generate:static` — isso exige acesso SSH a `beelink`, que o runner do GitHub não tem. `static/entities/*.json` precisa estar commitado; o workflow só empacota o que já existe.

Fluxo para atualizar os dados publicados:
```bash
bun run generate:static   # local, precisa de acesso SSH a beelink
git add static/ && git commit -m "..." && git push
```
O push já dispara o deploy.

## Arquitetura

- `src/render.ts`: templates HTML puros (landing + página de grafo), parametrizados por `LinkScheme` (caminhos absolutos `/foo` para o servidor local, relativos `foo` para o export estático — necessário porque GitHub Pages de projeto publica em subpath, `/datative/`, não na raiz do domínio).
- `src/index.ts`: servidor HTTP puramente estático (dev) — landing page, página de grafo, `/entities/:id.json` lendo `static/`, usando `render.ts` com links absolutos. Também injeta `window.__DATASET_COLORS`/`window.__DATASET_META` (label, cor, campos id/label por dataset) a partir de `cnpj-datasets.ts`, para o cliente montar o painel sem nenhum fetch adicional.
- `scripts/build-site.ts`: mesma coisa que `index.ts`, mas gera arquivos: `dist/index.html`, `dist/e-<id>.html` (uma página por entidade, com `window.__ENTITY_ID__` embutido), copia `graph.js`/`favicon.svg`/`entities/*.json`. Usa `render.ts` com links relativos.
- `src/graph-client.ts` + `src/node-shape-programs.ts`: bundle browser (Sigma 3 + graphology). Lê o id da entidade do query param `?cnpj=` (dev) ou de `window.__ENTITY_ID__` (build estático); busca a rede em `entities/<id>.json` (caminho relativo, funciona nos dois casos). Agrupa cada dataset com hits sob um nó-hub e monta o painel lateral diretamente do JSON já carregado — não há nenhuma chamada de rede além dessa.
- `src/cnpj-datasets.ts`: configuração de datasets/cores usada tanto pelo cliente (coloração dos nós, metadados do painel) quanto pelo gerador.
- `scripts/generate-static-entities.ts`: **único** lugar que fala com dados ao vivo. Ranqueia empresas e pessoas **separadamente** por quantidade de datasets distintos em que aparecem (não por volume de linhas — evita que um só dataset gigante domine o ranking), pré-computa a rede de cada uma no mesmo formato `{nodes,links}` e grava em `static/entities/<id>.json` + `static/entities-index.json`. Cada nó de dataset carrega a linha SQL original em `row` (usada pelo painel); nós além do `--per-dataset-limit` por dataset ficam marcados `inGraph:false` — continuam na tabela do painel, mas o cliente não os desenha no grafo.
- `scripts/lib/`: camada de acesso a dados usada só pelo gerador (offline) — `duckdb-ssh.ts` (SQL via SSH em `beelink`), `parquet-store.ts` (monta `SELECT`/`WHERE`/`LIMIT` contra as views do catálogo), `cnpj-index.ts` (matching de coluna CNPJ/CPF).
- `data/schemas.json`: catálogo local dataset/tabela → colunas, usado por `scripts/lib/parquet-store.ts`.

## Estrutura de arquivos

- `src/`: servidor + templates + cliente de grafo (ver Arquitetura acima)
- `scripts/`: `generate-static-entities.ts`, `build-site.ts`, `benchmark.ts`, `lib/` (acesso a dados offline)
- `data/`: `schemas.json` (catálogo de tabelas)
- `static/`: saída gerada por `generate-static-entities.ts` (`entities/`, `entities-index.json`) — fonte de dados tanto do servidor de dev quanto do export estático
- `public/`: `graph.js` (bundle gerado a partir de `src/graph-client.ts`) e `favicon.svg`
- `dist/`: saída de `bun run build:site` (gitignored — gerado no CI a cada deploy)
- `tests/`: testes unitários (`bun test`)

## Licenca

Defina aqui a licenca oficial do projeto (ex.: MIT, Apache-2.0, proprietaria).
