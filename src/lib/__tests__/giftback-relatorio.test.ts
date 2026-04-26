import { describe, it, expect } from "vitest";
import {
  calcularTicketMedio,
  calcularPercentualRetorno,
  calcularFrequenciaMedia,
  formatBRL,
  formatMesLabel,
  calcularVariacaoPct,
  formatVariacaoPct,
  validarPeriodoCustom,
} from "../giftback-relatorio";

describe("giftback-relatorio helpers", () => {
  describe("calcularTicketMedio", () => {
    it("retorna 0 quando não há vendas", () => {
      expect(calcularTicketMedio(1000, 0)).toBe(0);
    });
    it("calcula corretamente", () => {
      expect(calcularTicketMedio(1000, 4)).toBe(250);
    });
    it("não quebra com vendas negativas", () => {
      expect(calcularTicketMedio(1000, -1)).toBe(0);
    });
  });

  describe("calcularPercentualRetorno", () => {
    it("retorna 0 quando receita é zero", () => {
      expect(calcularPercentualRetorno(50, 0)).toBe(0);
    });
    it("calcula percentual correto", () => {
      expect(calcularPercentualRetorno(50, 1000)).toBe(5);
    });
    it("não permite valores negativos", () => {
      expect(calcularPercentualRetorno(-10, 100)).toBe(0);
    });
  });

  describe("calcularFrequenciaMedia", () => {
    it("retorna 0 sem clientes", () => {
      expect(calcularFrequenciaMedia(10, 0)).toBe(0);
    });
    it("calcula 1 venda/cliente", () => {
      expect(calcularFrequenciaMedia(5, 5)).toBe(1);
    });
    it("calcula clientes recorrentes", () => {
      expect(calcularFrequenciaMedia(10, 4)).toBe(2.5);
    });
  });

  describe("formatBRL", () => {
    it("formata em pt-BR", () => {
      const out = formatBRL(1234.5);
      expect(out).toContain("1.234,50");
      expect(out).toContain("R$");
    });
    it("trata null/undefined", () => {
      expect(formatBRL(null)).toContain("0,00");
      expect(formatBRL(undefined)).toContain("0,00");
    });
  });

  describe("formatMesLabel", () => {
    it("formata YYYY-MM como 'mes/aa'", () => {
      expect(formatMesLabel("2026-01")).toBe("jan/26");
      expect(formatMesLabel("2025-12")).toBe("dez/25");
    });
    it("retorna a string original em caso de input inválido", () => {
      expect(formatMesLabel("xx")).toBe("xx");
    });
  });

  describe("calcularVariacaoPct", () => {
    it("calcula crescimento positivo", () => {
      const v = calcularVariacaoPct(150, 100);
      expect(v.pct).toBeCloseTo(50);
      expect(v.direcao).toBe("up");
    });
    it("calcula queda", () => {
      const v = calcularVariacaoPct(80, 100);
      expect(v.pct).toBeCloseTo(-20);
      expect(v.direcao).toBe("down");
    });
    it("trata anterior zero com atual positivo como 'novo'", () => {
      const v = calcularVariacaoPct(100, 0);
      expect(v.direcao).toBe("novo");
    });
    it("trata ambos zero como 'flat'", () => {
      const v = calcularVariacaoPct(0, 0);
      expect(v.direcao).toBe("flat");
      expect(v.pct).toBe(0);
    });
    it("considera variação <0.01% como 'flat'", () => {
      const v = calcularVariacaoPct(100.0001, 100);
      expect(v.direcao).toBe("flat");
    });
  });

  describe("formatVariacaoPct", () => {
    it("formata variação positiva com sinal", () => {
      expect(formatVariacaoPct({ pct: 12.34, direcao: "up" })).toBe("+12,34%");
    });
    it("formata variação negativa", () => {
      expect(formatVariacaoPct({ pct: -5, direcao: "down" })).toBe("-5,00%");
    });
    it("formata flat como 0,00%", () => {
      expect(formatVariacaoPct({ pct: 0, direcao: "flat" })).toBe("0,00%");
    });
    it("formata novo como 'novo'", () => {
      expect(formatVariacaoPct({ pct: 100, direcao: "novo" })).toBe("novo");
    });
    it("trata null/undefined", () => {
      expect(formatVariacaoPct(null)).toBe("—");
      expect(formatVariacaoPct(undefined)).toBe("—");
    });
  });

  describe("validarPeriodoCustom", () => {
    it("falha se ambas as datas estão vazias", () => {
      const r = validarPeriodoCustom("", "");
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/início/i);
    });
    it("falha se só a data fim falta", () => {
      const r = validarPeriodoCustom("2026-01-01", "");
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/fim/i);
    });
    it("falha se só o início falta", () => {
      const r = validarPeriodoCustom("", "2026-01-10");
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/início/i);
    });
    it("falha se fim < inicio", () => {
      const r = validarPeriodoCustom("2026-02-10", "2026-02-01");
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/maior ou igual/i);
    });
    it("aceita fim == inicio", () => {
      const r = validarPeriodoCustom("2026-02-10", "2026-02-10");
      expect(r.ok).toBe(true);
    });
    it("aceita período válido", () => {
      const r = validarPeriodoCustom("2026-01-01", "2026-01-31");
      expect(r.ok).toBe(true);
    });
    it("falha em datas inválidas", () => {
      const r = validarPeriodoCustom("não-é-data", "2026-01-31");
      expect(r.ok).toBe(false);
    });
  });
});
