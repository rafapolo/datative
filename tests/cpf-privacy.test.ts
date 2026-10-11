import { describe, expect, test } from "bun:test";
import { hashCpf, isCpfLength, isPersonalDocColumn, maskCpf, sanitizeAnyValue, sanitizeCpfValue, sanitizeRow } from "../scripts/lib/cpf-privacy";

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

describe("sanitizeAnyValue", () => {
  test("masks a fully punctuated CPF in any column", () => {
    expect(sanitizeAnyValue("722.071.677-04")).toBe(maskCpf("72207167704"));
  });

  test("leaves a bare 11-digit value alone — only document columns mask those", () => {
    expect(sanitizeAnyValue("50000000320")).toBe("50000000320");
  });

  test("leaves names, CNPJs and non-strings alone", () => {
    expect(sanitizeAnyValue("ITAU CORRETORA")).toBe("ITAU CORRETORA");
    expect(sanitizeAnyValue("60.701.190/0001-04")).toBe("60.701.190/0001-04");
    expect(sanitizeAnyValue(42)).toBe(42);
  });

  test("sanitizeRow applies it to non-document columns", () => {
    expect(sanitizeRow({ Escriturador: "722.071.677-04", id: "50000000320" }, [])).toEqual({
      Escriturador: maskCpf("72207167704"),
      id: "50000000320",
    });
  });
});

describe("sanitizeAnyValue (free text and name fields)", () => {
  test("masks a punctuated CPF inside free text", () => {
    expect(sanitizeAnyValue("CONTRATADO 129.290.337-62 CONFORME PROCESSO", "descricao_detalhada")).toBe(
      `CONTRATADO ${maskCpf("12929033762")} CONFORME PROCESSO`,
    );
  });

  test("masks a bare valid CPF in a name field", () => {
    expect(sanitizeAnyValue("03807593659", "razao_social")).toBe(maskCpf("03807593659"));
  });

  test("masks a bare valid CPF appended to a name", () => {
    expect(sanitizeAnyValue("JOSE RICARDO COSTA ANDRE 03807593659", "razao_social")).toBe(`JOSE RICARDO COSTA ANDRE ${maskCpf("03807593659")}`);
  });

  test("leaves a 14-digit CNPJ inside a name untouched", () => {
    expect(sanitizeAnyValue("EMPRESA X 12345678000195", "nome")).toBe("EMPRESA X 12345678000195");
  });

  test("leaves a bare 11-digit id alone in an id field even with a valid check digit", () => {
    expect(sanitizeAnyValue("50000000132", "sequencial_candidato")).toBe("50000000132");
  });

  test("leaves a bare 11-digit value with an invalid check digit alone in a name field", () => {
    expect(sanitizeAnyValue("12345678900", "nome")).toBe("12345678900");
  });
});
