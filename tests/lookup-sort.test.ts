import { describe, expect, test } from "bun:test";
import { parseDateValue, sortRowsNewestFirst } from "../src/lookup-sort";

describe("parseDateValue", () => {
  test("ISO, ISO with time, dd/mm/yyyy and epoch ms", () => {
    expect(parseDateValue("2016-08-03")).toBe(20160803);
    expect(parseDateValue("2024-06-06 00:00:00")).toBe(20240606);
    expect(parseDateValue("07/08/2008")).toBe(20080807);
    expect(parseDateValue(1425945600000)).toBe(20150310);
  });
  test("non-dates", () => {
    expect(parseDateValue(null)).toBeNull();
    expect(parseDateValue("BANCO X")).toBeNull();
    expect(parseDateValue(150)).toBeNull();
  });
});

describe("sortRowsNewestFirst", () => {
  test("sorts by the first date column, undated rows last", () => {
    const rows = [
      { nome: "a", data_inicio: "2010-01-01" },
      { nome: "b", data_inicio: null },
      { nome: "c", data_inicio: "22/03/2022" },
      { nome: "d", data_inicio: "2015-05-05" },
    ];
    expect(sortRowsNewestFirst(rows).map((r) => r.nome)).toEqual(["c", "d", "a", "b"]);
  });
  test("falls back to ano/mes", () => {
    const rows = [
      { ano: 2017, mes: 1 },
      { ano: 2018, mes: 6 },
      { ano: 2018, mes: 12 },
    ];
    expect(sortRowsNewestFirst(rows)).toEqual([
      { ano: 2018, mes: 12 },
      { ano: 2018, mes: 6 },
      { ano: 2017, mes: 1 },
    ]);
  });
  test("leaves undated datasets untouched", () => {
    const rows = [{ nome: "b" }, { nome: "a" }];
    expect(sortRowsNewestFirst(rows)).toBe(rows);
  });
});

describe("sortRowsNewestFirst — source quirks", () => {
  test("yyyymm ano_mes, AnoCalendario, dat_ prefix", () => {
    expect(sortRowsNewestFirst([{ ano_mes: 200006 }, { ano_mes: 201912 }])[0]).toEqual({ ano_mes: 201912 });
    expect(sortRowsNewestFirst([{ AnoCalendario: "2019" }, { AnoCalendario: "2024" }])[0]).toEqual({ AnoCalendario: "2024" });
    const ibama = [{ dat_embargo: "2003-09-19T00:00:00.000" }, { dat_embargo: "2011-01-02T00:00:00.000" }];
    expect(sortRowsNewestFirst(ibama)[0]).toBe(ibama[1]);
  });
  test("empty date column falls back to ano", () => {
    const rows = [
      { data_despesa: "2010-05-01", ano: 2010 },
      { data_despesa: null, ano: 2018 },
      { data_despesa: "2014-01-01", ano: 2014 },
    ];
    expect(sortRowsNewestFirst(rows).map((r) => r.ano)).toEqual([2018, 2014, 2010]);
  });
});
