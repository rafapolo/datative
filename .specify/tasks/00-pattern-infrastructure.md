# Task: Pattern Detection Infrastructure (foundational)
**Status:** TODO
**Priority:** P0 — must complete before any pattern task
**User Story:** all

---

## What to Build

Shared infrastructure that all pattern detection functions depend on. No pattern code can be written until this is in place.

---

## Components

### 1. Pattern result types (TypeScript interfaces)

Define a union type `PatternFlag` covering all 7 pattern output shapes. Define a `PatternResult` wrapper:

```typescript
type PatternFlag =
  | SplitContractFlag
  | ConcentrationFlag
  | InexigibilityFlag
  | AmendmentBeneficiaryFlag
  | SanctionedReceivingFlag
  | DebtorContractsFlag
  | EmbargoedReceivingFlag;

interface PatternResult {
  cnpj: string;
  detectedAt: string;   // ISO datetime
  flags: PatternFlag[];
}
```

### 2. Pattern runner

A `runPatterns(cnpj: string): Promise<PatternResult>` function that:
- Checks cache first (`getCache<PatternResult>(\`patterns_${cnpj}\`)`)
- Runs all enabled patterns in parallel (`Promise.allSettled`)
- Collects successful results, logs failures without throwing
- Writes result to cache (`setCache`)
- Returns `PatternResult`

### 3. Pattern toggle (env-based)

Each pattern can be enabled/disabled via env var:
```
PATTERN_SPLIT_CONTRACTS=true
PATTERN_CONCENTRATION=true
PATTERN_INEXIGIBILITY=true
PATTERN_AMENDMENT=false          # requires TRANSPARENCIA_API_KEY
PATTERN_SANCTIONED=true
PATTERN_DEBTOR=false             # requires TRANSPARENCIA_API_KEY
PATTERN_EMBARGOED=false          # blocked on schema verification
```

### 4. UI section on CNPJ detail page

Add a "Alertas de Risco" (Risk Alerts) section to the CNPJ detail page, below the existing sections. Renders:
- Empty state: "Nenhum alerta identificado" (grey)
- Each flag as a colored badge + expandable detail row
- Data source attribution per flag (e.g., "Fonte: CGU / Contratos Públicos")

---

## Acceptance Criteria

- [ ] `PatternResult` and all flag interfaces defined in `index.ts` before pattern functions
- [ ] `runPatterns()` uses `Promise.allSettled` — one failing pattern never blocks others
- [ ] Pattern enable/disable works via env vars with sensible defaults (external-API patterns off by default)
- [ ] "Alertas de Risco" section renders correctly when flag list is empty
- [ ] "Alertas de Risco" section renders correctly with 1, 2, and 7 simultaneous flags
- [ ] Section does not appear at all on the main company list page — only on CNPJ detail
