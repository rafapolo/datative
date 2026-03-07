# Task: Pattern Detection Infrastructure
**Status:** DONE
**Priority:** P0 — must complete before any pattern task
**User Story:** all

---

## What to Build

Shared scaffolding all 3 pattern functions depend on. No pattern code begins until this is done.

---

## Components

### 1. TypeScript interfaces (in `index.ts`)

```typescript
interface SplitContractFlag {
  pattern: 'split_contracts_below_threshold';
  agencyName: string;
  month: string;            // "YYYY-MM"
  contractCount: number;
  combinedValue: number;    // BRL
  maxSingleValue: number;   // BRL
}

interface ConcentrationFlag {
  pattern: 'contract_concentration';
  agencyName: string;
  agencyId: string;
  supplierShare: number;    // 0.0–1.0
  supplierSpend: number;    // BRL
  agencyTotalSpend: number; // BRL
  year: number;
}

interface InexigibilityFlag {
  pattern: 'inexigibility_recurrence';
  agencyUnit: string;
  agencyUnitId: string;
  contractCount: number;
  totalValue: number;       // BRL
  firstDate: string;        // ISO date
  lastDate: string;         // ISO date
}

type PatternFlag =
  | SplitContractFlag
  | ConcentrationFlag
  | InexigibilityFlag
  | SingleBidderFlag
  | AlwaysWinnerFlag
  | AmendmentInflationFlag
  | NewbornCompanyFlag
  | SuddenSurgeFlag;

interface PatternResult {
  cnpj: string;
  detectedAt: string;   // ISO datetime
  flags: PatternFlag[];
}
```

### 2. Configurable thresholds (named constants in `index.ts`)

```typescript
const SPLIT_THRESHOLD_BRL     = 17_600;
const SPLIT_MIN_COUNT         = 3;
const CONCENTRATION_THRESHOLD = 0.40;
const CONCENTRATION_MIN_SPEND = 50_000;
const INEXIGIBILITY_MIN_COUNT = 3;
```

### 3. `runPatterns(cnpj: string): Promise<PatternResult>`

- Check `getCache<PatternResult>(\`patterns_${cnpj}\`)`; return immediately if hit
- Run all 3 pattern functions via `Promise.allSettled`
- Collect fulfilled values into `flags[]`; log (but do not throw) rejected patterns
- Write to cache via `setCache`
- Return `PatternResult`

### 4. "Alertas de Risco" UI section (in `index.ts` HTML renderer)

- Appears on the CNPJ detail page only (not on main company list)
- Empty state: grey box, text "Nenhum alerta identificado"
- Each flag: colored left-border card with pattern title, key metrics, and data source attribution
- Color by severity: yellow (informational), orange (medium), red (high)

---

## Acceptance Criteria

- [x] All interfaces defined before any pattern function (lines 231–314; pattern functions start at 742)
- [x] `runPatterns()` uses `Promise.allSettled` — one failure never blocks others
- [x] "Alertas de Risco" section renders with 0, 1, and 8 simultaneous flags (`renderAlertasHtml` handles empty array, single flag, and all-8-flags)
- [x] Section does not appear on the company list page (`renderGraphPage` is separate from `renderPage`; alertas panel only rendered when a CNPJ is provided)
- [x] All thresholds are named constants with a comment citing their legal basis (lines 181–228)
