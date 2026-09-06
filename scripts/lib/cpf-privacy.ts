import { createHash } from "node:crypto";

// True CPF only: 11 digits. 14-digit CNPJs are public company registry
// numbers and are never masked/hashed by any function in this module.
export function isCpfLength(digits: string): boolean {
  return digits.length === 11;
}

// "123.***.**8-00" — first 3 + last 3 digits shown, middle 5 masked.
export function maskCpf(digits: string): string {
  return `${digits.slice(0, 3)}.***.**${digits[8]}-${digits.slice(9, 11)}`;
}

// Stable, non-reversible id for use in URLs/filenames in place of a raw CPF.
export function hashCpf(digits: string): string {
  return createHash("sha256").update(digits).digest("hex").slice(0, 16);
}

// Anchored: the ENTIRE (trimmed) string must be a bare or punctuated 11-digit
// CPF, not just contain 11 digits somewhere. This is deliberately narrower
// than a plain digit-count check — a free-text field (e.g. a contract
// "objeto" description) can coincidentally reduce to 11 digits once
// non-digits are stripped, and a stray digit-count match would corrupt it.
const CPF_SHAPE = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

function isCpfShaped(value: string): boolean {
  return CPF_SHAPE.test(value.trim());
}

// Masks a value only if it is itself shaped like a CPF (see isCpfShaped).
// Use this only on columns already known to hold a document number — see
// sanitizeRow's cnpjColumnNames — never as a blanket scan over arbitrary text.
export function sanitizeCpfValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!isCpfShaped(value)) return value;
  return maskCpf(value.replace(/\D/g, ""));
}

const PERSONAL_DOC_COLUMN = /cpf|documento/i;

// A column is worth checking for a CPF value if its name suggests a personal
// document (cpf/documento, case-insensitive) or it's one of the dataset's
// declared CNPJ/CPF join columns (a "mixed" column can hold either an 11-digit
// CPF or a 14-digit CNPJ depending on the row). Every other column — ids,
// free text, amounts — is left untouched, even if a value happens to reduce
// to 11 digits, to avoid masking unrelated data (e.g. a "sequencial" id).
export function isPersonalDocColumn(columnName: string, cnpjColumnNames: readonly string[]): boolean {
  return PERSONAL_DOC_COLUMN.test(columnName) || cnpjColumnNames.includes(columnName);
}

export function sanitizeRow<T extends Record<string, unknown>>(row: T, cnpjColumnNames: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = isPersonalDocColumn(k, cnpjColumnNames) ? sanitizeCpfValue(v) : v;
  }
  return out as T;
}
