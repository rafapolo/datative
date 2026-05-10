import { describe, expect, test } from "bun:test";
import { isMaskedDocument, matchesCnpj, socioNodeId } from "./cnpj-index";

describe("isMaskedDocument", () => {
  test("detects ***XXXXXX** format", () => {
    expect(isMaskedDocument("***430577**")).toBe(true);
    expect(isMaskedDocument("***000000**")).toBe(true);
    expect(isMaskedDocument("***053107**")).toBe(true);
  });

  test("passes full CNPJs", () => {
    expect(isMaskedDocument("96206941000155")).toBe(false);
    expect(isMaskedDocument("04670850000158")).toBe(false);
  });

  test("passes full CPFs", () => {
    expect(isMaskedDocument("12345678901")).toBe(false);
  });

  test("passes empty string", () => {
    expect(isMaskedDocument("")).toBe(false);
  });
});

describe("matchesCnpj", () => {
  const root = "96206941";

  test("masked document never matches, any colType", () => {
    expect(matchesCnpj("***206941**", root, "basico")).toBe(false);
    expect(matchesCnpj("***206941**", root, "full")).toBe(false);
    expect(matchesCnpj("***206941**", root, "mixed")).toBe(false);
    // placeholder zeros
    expect(matchesCnpj("***000000**", root, "mixed")).toBe(false);
  });

  test("null/undefined never matches", () => {
    expect(matchesCnpj(null, root, "basico")).toBe(false);
    expect(matchesCnpj(undefined, root, "mixed")).toBe(false);
  });

  test("basico: exact 8-digit root match", () => {
    expect(matchesCnpj("96206941", root, "basico")).toBe(true);
    expect(matchesCnpj("96206942", root, "basico")).toBe(false);
  });

  test("full: 14-digit CNPJ prefix match", () => {
    expect(matchesCnpj("96206941000155", root, "full")).toBe(true);
    expect(matchesCnpj("96206941000172", root, "full")).toBe(true);
    expect(matchesCnpj("12345678000195", root, "full")).toBe(false);
  });

  test("mixed: 14-digit CNPJ matches on prefix", () => {
    expect(matchesCnpj("96206941000155", root, "mixed")).toBe(true);
  });

  test("mixed: 11-digit CPF matches only when root equals full CPF digits", () => {
    // root is 8 chars; CPF is 11 chars — can only match if root === full cpf digits (impossible)
    expect(matchesCnpj("96206941123", root, "mixed")).toBe(false);
  });
});

describe("socioNodeId", () => {
  const company = "12345678";

  test("full CNPJ → used as-is for cross-company dedup", () => {
    expect(socioNodeId("96206941000155", company, "ACME SA")).toBe("96206941000155");
  });

  test("masked CPF → scoped to company, not global", () => {
    const id = socioNodeId("***430577**", company, "JOAO SILVA");
    expect(id).toContain(company);
    expect(id).toContain("***430577**");
    expect(id).toContain("JOAO SILVA");
  });

  test("placeholder ***000000** from two companies → different node IDs", () => {
    const idA = socioNodeId("***000000**", "11111111", "");
    const idB = socioNodeId("***000000**", "22222222", "");
    expect(idA).not.toBe(idB);
  });

  test("null documento → scoped to company", () => {
    const id = socioNodeId(null, company, "FOREIGN CORP LTD");
    expect(id).toContain(company);
    expect(id).toContain("FOREIGN CORP LTD");
  });

  test("null documento from two companies → different node IDs", () => {
    const idA = socioNodeId(null, "11111111", "ACME");
    const idB = socioNodeId(null, "22222222", "ACME");
    expect(idA).not.toBe(idB);
  });
});
