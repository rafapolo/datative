import { describe, expect, test } from "bun:test";
import { normalizeComparableValue, projectRow, rowMatchesFilters } from "./parquet-store";

describe("parquet-store helpers", () => {
  test("rowMatchesFilters compares values using schema-agnostic string coercion", () => {
    expect(
      rowMatchesFilters(
        { id_licitacao: 123, nome: "ACME", vazio: null },
        { id_licitacao: "123", nome: "ACME", vazio: null }
      )
    ).toBe(true);
  });

  test("rowMatchesFilters rejects mismatched values", () => {
    expect(
      rowMatchesFilters(
        { id_contrato: "ABC-1", nome_orgao: "CGU" },
        { id_contrato: "ABC-2" }
      )
    ).toBe(false);
  });

  test("projectRow keeps only requested columns and preserves missing ones as undefined", () => {
    expect(projectRow({ a: 1, b: 2 }, ["b", "c"])).toEqual({ b: 2, c: undefined });
  });

  test("normalizeComparableValue normalizes primitives and nullish values", () => {
    expect(normalizeComparableValue(42)).toBe("42");
    expect(normalizeComparableValue("42")).toBe("42");
    expect(normalizeComparableValue(null)).toBeNull();
    expect(normalizeComparableValue(undefined)).toBeNull();
  });
});
