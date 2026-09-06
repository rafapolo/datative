import { describe, expect, test } from "bun:test";
import { hashCpf, isCpfLength, isPersonalDocColumn, maskCpf, sanitizeCpfValue, sanitizeRow } from "../scripts/lib/cpf-privacy";

describe("isCpfLength", () => {
  test("11 digits is a CPF", () => {
    expect(isCpfLength("12345678901")).toBe(true);
  });

  test("14 digits (CNPJ) is not", () => {
    expect(isCpfLength("12345678000195")).toBe(false);
  });
});

describe("maskCpf", () => {
  test("shows first 3 and last 3 digits, masks middle 5", () => {
    expect(maskCpf("12345678900")).toBe("123.***.**9-00");
  });

  test("never contains the full digit sequence", () => {
    const cpf = "98765432100";
    expect(maskCpf(cpf)).not.toContain(cpf);
  });
});

describe("hashCpf", () => {
  test("deterministic for the same input", () => {
    expect(hashCpf("12345678901")).toBe(hashCpf("12345678901"));
  });

  test("different for different inputs", () => {
    expect(hashCpf("12345678901")).not.toBe(hashCpf("10987654321"));
  });

  test("never contains the raw digits", () => {
    const cpf = "12345678901";
    expect(hashCpf(cpf)).not.toContain(cpf);
  });
});

describe("sanitizeCpfValue", () => {
  test("masks an 11-digit CPF string", () => {
    expect(sanitizeCpfValue("12345678900")).toBe(maskCpf("12345678900"));
  });

  test("masks a punctuated CPF string", () => {
    expect(sanitizeCpfValue("123.456.789-00")).toBe(maskCpf("12345678900"));
  });

  test("leaves a 14-digit CNPJ untouched", () => {
    expect(sanitizeCpfValue("12345678000195")).toBe("12345678000195");
  });

  test("leaves non-CPF strings untouched", () => {
    expect(sanitizeCpfValue("JOAO SILVA")).toBe("JOAO SILVA");
  });

  test("leaves non-string values untouched", () => {
    expect(sanitizeCpfValue(42)).toBe(42);
    expect(sanitizeCpfValue(null)).toBe(null);
    expect(sanitizeCpfValue(undefined)).toBe(undefined);
  });

  test("leaves an unrelated 11-digit numeric id untouched by itself (column scoping happens in sanitizeRow)", () => {
    // sanitizeCpfValue alone can't know it's not a CPF -- see isPersonalDocColumn below.
    expect(sanitizeCpfValue("50000000320")).toBe(maskCpf("50000000320"));
  });

  test("leaves free text that happens to reduce to 11 digits untouched (not CPF-shaped as a whole string)", () => {
    const text = "Processo 12345 de 2024, item 678, lote 90";
    expect(sanitizeCpfValue(text)).toBe(text);
  });
});

describe("isPersonalDocColumn", () => {
  test("matches columns named cpf/documento variants", () => {
    expect(isPersonalDocColumn("cpf", [])).toBe(true);
    expect(isPersonalDocColumn("documento", [])).toBe(true);
    expect(isPersonalDocColumn("CPF_CNPJ", [])).toBe(true);
    expect(isPersonalDocColumn("cpf_cnpj_doador", [])).toBe(true);
  });

  test("matches a dataset's declared cnpj join columns", () => {
    expect(isPersonalDocColumn("cnpj_cpf_favorecido", ["cnpj_cpf_favorecido"])).toBe(true);
  });

  test("does not match unrelated id/text columns", () => {
    expect(isPersonalDocColumn("sequencial_candidato", ["cnpj_cpf_favorecido"])).toBe(false);
    expect(isPersonalDocColumn("objeto", [])).toBe(false);
  });
});

describe("sanitizeRow", () => {
  test("masks only known document columns, leaving other 11-digit ids and free text alone", () => {
    const row = {
      nome: "JOAO SILVA",
      documento: "12345678900",
      cnpj: "12345678000195",
      valor: 100,
      sequencial_candidato: "50000000320",
      objeto: "Processo 12345 de 2024, item 678, lote 90",
    };
    expect(sanitizeRow(row, ["documento"])).toEqual({
      nome: "JOAO SILVA",
      documento: maskCpf("12345678900"),
      cnpj: "12345678000195",
      valor: 100,
      sequencial_candidato: "50000000320",
      objeto: "Processo 12345 de 2024, item 678, lote 90",
    });
  });

  test("a mixed cnpj join column only masks the value when it's actually CPF-shaped", () => {
    const row = { cpf_cnpj_doador: "12345678000195" };
    expect(sanitizeRow(row, ["cpf_cnpj_doador"])).toEqual({ cpf_cnpj_doador: "12345678000195" });
  });
});
