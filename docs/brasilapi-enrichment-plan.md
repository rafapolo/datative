# BrasilAPI Enrichment — Integration Plan

## Goal

Enrich the company page (`/graph?cnpj=XXXXXXXX`) with real-time data from
[BrasilAPI](https://brasilapi.com.br/api/cnpj/v1/) — free, no auth, no quota.

This fills the gaps that BigQuery (`br_me_cnpj`) alone cannot cover without
expensive joins across multiple partitioned tables.

---

## What BrasilAPI Provides (vs what we already have)

| Field | BrasilAPI | BigQuery today |
|-------|-----------|---------------|
| Registration status (ATIVA / BAIXADA) | ✅ `descricao_situacao_cadastral` | ❌ |
| Address (logradouro, bairro, município, UF, CEP) | ✅ | ❌ |
| Phone / email | ✅ | ❌ |
| CNAE description | ✅ `cnae_fiscal_descricao` | ❌ (code only) |
| Secondary CNAEs | ✅ `cnaes_secundarios[]` | ❌ |
| Tax regime by year (Lucro Real / Presumido) | ✅ `regime_tributario[]` | ❌ |
| Simples / MEI option + dates | ✅ | ❌ |
| Partners (QSA) with entry dates & roles | ✅ `qsa[]` | ✅ `socios` (less detail) |
| Capital social | ✅ | ✅ |
| Natureza jurídica | ✅ | ✅ |

---

## API Contract

```
GET https://brasilapi.com.br/api/cnpj/v1/{cnpj14}
```

- `cnpj14`: full 14-digit CNPJ (digits only, no formatting)
- Returns JSON (see sample below) or `{"message": "CNPJ ... inválido."}`
- No auth, no rate-limit headers observed — cache aggressively

**Sample response keys (AMBEV S.A., `07526557000100`):**
```json
{
  "cnpj": "07526557000100",
  "razao_social": "AMBEV S.A.",
  "nome_fantasia": "",
  "situacao_cadastral": 2,
  "descricao_situacao_cadastral": "ATIVA",
  "data_inicio_atividade": "2005-07-19",
  "data_situacao_cadastral": "2005-07-19",
  "natureza_juridica": "Sociedade Anônima Aberta",
  "porte": "DEMAIS",
  "capital_social": 58275086000,
  "cnae_fiscal": 1113502,
  "cnae_fiscal_descricao": "Fabricação de cervejas e chopes",
  "cnaes_secundarios": [ { "codigo": 111399, "descricao": "..." } ],
  "logradouro": "DR RENATO PAES DE BARROS",
  "numero": "1017",
  "complemento": "ANDAR 3 EDIF CORP. PARK",
  "bairro": "ITAIM BIBI",
  "municipio": "SAO PAULO",
  "uf": "SP",
  "cep": "04530001",
  "ddd_telefone_1": "1933135680",
  "email": null,
  "opcao_pelo_simples": null,
  "opcao_pelo_mei": null,
  "regime_tributario": [ { "ano": 2022, "forma_de_tributacao": "LUCRO REAL" } ],
  "qsa": [ { "nome_socio": "...", "qualificacao_socio": "Diretor", "data_entrada_sociedade": "2022-06-13" } ]
}
```

---

## The CNPJ-Basico → CNPJ-14 Problem

Datative is keyed by `cnpj_basico` (8 digits). BrasilAPI needs the full 14-digit CNPJ.

**Solution:** append `'0001'` (standard headquarters sequence) to get 14 digits.
- This works for the vast majority of companies since `0001` is the matriz.
- If the response returns "inválido", we have an invalid CNPJ — skip enrichment.
- We do NOT need to compute check digits ourselves; BrasilAPI validates them.

```
cnpj14 = cnpj_basico.padEnd(8, '0') + '0001' + '  '  ← need valid check digits
```

Actually, the safe path: use `cnpj_basico + '000100'` (appending `0001` + two check digits
we compute, or just try `cnpj_basico + '000101'`, `'000149'`, etc). The cleanest approach
is to call BigQuery `estabelecimentos` once for the full CNPJ and cache it.

**Recommended:** server-side proxy that queries `estabelecimentos` for `cnpj_ordem = '0001'`
to get the 14-digit CNPJ, then passes it to BrasilAPI.

---

## Implementation Plan

### 1. Server-side proxy route

Add `GET /api/brasilapi/:cnpjBasico` to `index.ts`:

```typescript
// 1. Get full CNPJ from estabelecimentos (cached)
const cnpj14 = await getFullCnpj(cnpjBasico);   // cnpj_basico + 0001 + dv
if (!cnpj14) return 404;

// 2. Fetch BrasilAPI (cache 24h)
const data = await fetchBrasilApi(cnpj14);
return Response.json(data);
```

Cache key: `brasilapi_${cnpjBasico}` — 24h TTL (data changes rarely).

### 2. `getFullCnpj(cnpjBasico)` helper

```sql
SELECT cnpj
FROM `basedosdados.br_me_cnpj.estabelecimentos`
WHERE cnpj_basico = @cnpj
  AND cnpj_ordem = '0001'
  AND ano = 2023 AND mes = 12
LIMIT 1
```

Cache result indefinitely (CNPJ numbers don't change).

### 3. Company page panel

On `renderGraphPage`, add a `<div id="receita-panel">` that:
- Loads on page open via `fetch('/api/brasilapi/${cnpj}')`
- Displays: status badge, address, phone, CNAE, Simples/MEI, tax regime timeline, QSA table
- Shows skeleton while loading, "não disponível" on error

### 4. Panel sections

```
┌─ Receita Federal ──────────────────────────────────────────┐
│ ATIVA  desde 2005-07-19                                     │
│ CNAE: Fabricação de cervejas e chopes (1113502)            │
│ Natureza: Sociedade Anônima Aberta                         │
│                                                             │
│ Endereço                                                    │
│ R. Dr Renato Paes de Barros, 1017 — Itaim Bibi            │
│ São Paulo / SP — CEP 04530-001                             │
│                                                             │
│ Regime tributário                                           │
│ 2014–2022: Lucro Real                                       │
│                                                             │
│ QSA (13 sócios)                                            │
│ Carlos Eduardo Lisboa    Diretor  desde 2025-03-06         │
│ Carla Prado              Diretor  desde 2022-06-13         │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Files to Change

| File | Change |
|------|--------|
| `index.ts` | Add `getFullCnpj()`, `fetchBrasilApi()`, `/api/brasilapi/:cnpj` route, panel HTML + CSS in `renderGraphPage` |

No new files needed. No new dependencies (uses built-in `fetch`).

---

## What to Skip

- **Minha Receita** (`minhareceita.org`) — same data source as BrasilAPI (both from Receita Federal dump), but the public instance is returning "CNPJ inválido" errors. BrasilAPI is more reliable.
- **Self-hosted minha-receita** — requires downloading the full Receita Federal dump (~30GB), not worth it when BrasilAPI is free.
- **Caching in DB** — don't persist BrasilAPI responses in SQLite; in-memory cache (existing `cache.ts`) is enough given the 24h TTL.
