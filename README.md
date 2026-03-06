# Datative

![Datative Logo](assets/logo.png)

O Datative e uma plataforma de analise investigativa focada em conexoes entre empresas, agentes politicos e estruturas de poder, usando dados publicos.

![Datative Logo](assets/datative.png)

## Foco

- Mapear relacoes societarias, contratos, doacoes e participacoes cruzadas.
- Investigar redes de influencia entre empresas e politicos.
- Transformar dados publicos em evidencias acionaveis para jornalismo, pesquisa e controle social.

## O que investigamos

- Estruturas empresariais complexas e beneficiarios finais.
- Vinculos entre atores politicos, financiadores e fornecedores.
- Padroes de risco em licitacoes, contratos e nomeacoes.
- Evolucao temporal de conexoes relevantes para auditoria civica.

## Deploy

### Requisitos

- Docker + Docker Compose
- Conta de serviço GCP com acesso ao projeto BigQuery
- Traefik como reverse proxy (na mesma rede Docker do container)

### Passos

1. Copie o arquivo de exemplo e preencha as variáveis:
   ```bash
   cp .env.example .env
   # edite .env com seu GCP_PROJECT_ID
   ```

2. Coloque o JSON da conta de serviço GCP em `gcp-credentials.json` (nunca comitar).

3. (Opcional) Crie o middleware de autenticação no Traefik:
   ```bash
   # gere o hash da senha
   htpasswd -nbB usuario senha
   ```
   Crie o arquivo de config dinâmica do Traefik (ex: `/etc/traefik/dynamic/<nome-app>-auth.yaml`):
   ```yaml
   http:
     middlewares:
       <nome-app>-auth:
         basicAuth:
           users:
             - "usuario:$2y$..."
   ```
   E configure o label no `docker-compose.yaml`:
   ```yaml
   - traefik.http.routers.<nome-app>.middlewares=<nome-app>-auth@file
   ```

4. Suba o container:
   ```bash
   docker compose up -d
   ```

#todo

- [ ] Melhorar o README com exemplos de investigacao.
- [ ] Criar um botao `view labels` para ajustar o tamanho dos nos ao texto completo.
- [ ] Rodar `/smiplify` e remover estado/layout redundante.
- [ ] Remover referencias antigas de `investiga` no frontend e padronizar para `datative`.
- [ ] Adaptar para mobile e rodar `/frontend`.
