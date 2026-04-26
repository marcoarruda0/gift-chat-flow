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
});
