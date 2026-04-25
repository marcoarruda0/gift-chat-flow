import { describe, it, expect } from "vitest";
import {
  resolverRegrasGiftback,
  calcularCompraMinima,
  type GiftbackConfigGlobal,
  type GiftbackConfigRfvOverride,
} from "@/lib/giftback-rules";

const globalPadrao: GiftbackConfigGlobal = {
  percentual: 10,
  validade_dias: 30,
  multiplicador_compra_minima: 4,
};

// Helper: simula o cálculo de geração e resgate como o GiftbackCaixa faria.
function simular(params: {
  saldo: number;
  valorCompra: number;
  giftbackSolicitado: number;
  regras: { percentual: number; multiplicador_compra_minima: number };
}) {
  const { saldo, valorCompra, giftbackSolicitado, regras } = params;
  const compraMinima = calcularCompraMinima(saldo, regras.multiplicador_compra_minima);
  const gbUsado = Math.min(giftbackSolicitado, saldo, valorCompra);
  const gbGerado = valorCompra >= compraMinima ? valorCompra * (regras.percentual / 100) : 0;
  const novoSaldo = saldo - gbUsado + gbGerado;
  return { compraMinima, gbUsado, gbGerado, novoSaldo };
}

describe("calcularCompraMinima", () => {
  it("retorna 0 quando saldo é 0", () => {
    expect(calcularCompraMinima(0, 4)).toBe(0);
  });

  it("retorna 0 quando multiplicador é 0 (regra desativada)", () => {
    expect(calcularCompraMinima(150, 0)).toBe(0);
  });

  it("retorna saldo × multiplicador (caso típico)", () => {
    expect(calcularCompraMinima(100, 4)).toBe(400);
    expect(calcularCompraMinima(75.5, 3)).toBe(226.5);
  });

  it("trata null/undefined como 0", () => {
    expect(calcularCompraMinima(null, 4)).toBe(0);
    expect(calcularCompraMinima(100, null)).toBe(0);
    expect(calcularCompraMinima(undefined, undefined)).toBe(0);
  });
});

describe("resolverRegrasGiftback", () => {
  it("usa global quando não há overrides", () => {
    const r = resolverRegrasGiftback({
      configGlobal: globalPadrao,
      overrides: [],
      contato: { rfv_recencia: 5, rfv_frequencia: 5, rfv_valor: 5 },
    });
    expect(r.origem).toBe("global");
    expect(r.percentual).toBe(10);
    expect(r.multiplicador_compra_minima).toBe(4);
    expect(r.segmentoAplicado).toBe("campeoes");
  });

  it("usa defaults quando configGlobal é null", () => {
    const r = resolverRegrasGiftback({
      configGlobal: null,
      overrides: [],
      contato: {},
    });
    expect(r.percentual).toBe(10);
    expect(r.validade_dias).toBe(30);
    expect(r.multiplicador_compra_minima).toBe(4);
    expect(r.segmentoAplicado).toBeNull();
  });

  it("aplica override ATIVO do segmento do contato", () => {
    const overrides: GiftbackConfigRfvOverride[] = [
      {
        segmento: "campeoes",
        ativo: true,
        percentual: 20,
        validade_dias: 60,
        multiplicador_compra_minima: 2,
      },
    ];
    const r = resolverRegrasGiftback({
      configGlobal: globalPadrao,
      overrides,
      contato: { rfv_recencia: 5, rfv_frequencia: 5, rfv_valor: 5 },
    });
    expect(r.origem).toBe("override");
    expect(r.percentual).toBe(20);
    expect(r.multiplicador_compra_minima).toBe(2);
    expect(r.validade_dias).toBe(60);
  });

  it("ignora override INATIVO e cai no global", () => {
    const overrides: GiftbackConfigRfvOverride[] = [
      {
        segmento: "campeoes",
        ativo: false,
        percentual: 99,
        validade_dias: 999,
        multiplicador_compra_minima: 99,
      },
    ];
    const r = resolverRegrasGiftback({
      configGlobal: globalPadrao,
      overrides,
      contato: { rfv_recencia: 5, rfv_frequencia: 5, rfv_valor: 5 },
    });
    expect(r.origem).toBe("global");
    expect(r.percentual).toBe(10);
  });

  it("merge campo a campo: override null herda do global", () => {
    const overrides: GiftbackConfigRfvOverride[] = [
      {
        segmento: "leais",
        ativo: true,
        percentual: 15, // override
        validade_dias: null, // herda global
        multiplicador_compra_minima: null, // herda global
      },
    ];
    const r = resolverRegrasGiftback({
      configGlobal: globalPadrao,
      overrides,
      contato: { rfv_recencia: 4, rfv_frequencia: 4, rfv_valor: 4 }, // soma 12 = leais
    });
    expect(r.origem).toBe("override");
    expect(r.percentual).toBe(15);
    expect(r.validade_dias).toBe(30);
    expect(r.multiplicador_compra_minima).toBe(4);
  });
});

describe("Cenário de geração e resgate (regra do multiplicador)", () => {
  it("saldo 0 → qualquer compra gera giftback (sem barreira)", () => {
    const r = simular({
      saldo: 0,
      valorCompra: 50,
      giftbackSolicitado: 0,
      regras: { percentual: 10, multiplicador_compra_minima: 4 },
    });
    expect(r.compraMinima).toBe(0);
    expect(r.gbGerado).toBe(5);
    expect(r.gbUsado).toBe(0);
    expect(r.novoSaldo).toBe(5);
  });

  it("multiplicador 0 → barreira desativada mesmo com saldo", () => {
    const r = simular({
      saldo: 200,
      valorCompra: 50,
      giftbackSolicitado: 0,
      regras: { percentual: 10, multiplicador_compra_minima: 0 },
    });
    expect(r.compraMinima).toBe(0);
    expect(r.gbGerado).toBe(5);
  });

  it("compra ABAIXO do mínimo → não gera giftback novo", () => {
    const r = simular({
      saldo: 100,
      valorCompra: 399, // mínimo seria 400
      giftbackSolicitado: 0,
      regras: { percentual: 10, multiplicador_compra_minima: 4 },
    });
    expect(r.compraMinima).toBe(400);
    expect(r.gbGerado).toBe(0);
  });

  it("compra IGUAL ao mínimo → gera (limite inclusivo)", () => {
    const r = simular({
      saldo: 100,
      valorCompra: 400,
      giftbackSolicitado: 0,
      regras: { percentual: 10, multiplicador_compra_minima: 4 },
    });
    expect(r.compraMinima).toBe(400);
    expect(r.gbGerado).toBe(40);
  });

  it("compra ACIMA do mínimo + resgate parcial: novo saldo correto", () => {
    const r = simular({
      saldo: 100,
      valorCompra: 500,
      giftbackSolicitado: 60,
      regras: { percentual: 10, multiplicador_compra_minima: 4 },
    });
    expect(r.gbUsado).toBe(60);
    expect(r.gbGerado).toBe(50);
    expect(r.novoSaldo).toBe(90); // 100 - 60 + 50
  });
});

describe("Limite de resgate = min(saldo, valor da compra)", () => {
  it("resgate solicitado acima do saldo é capado pelo saldo", () => {
    const r = simular({
      saldo: 50,
      valorCompra: 1000,
      giftbackSolicitado: 999,
      regras: { percentual: 10, multiplicador_compra_minima: 4 },
    });
    expect(r.gbUsado).toBe(50);
  });

  it("resgate solicitado acima da compra é capado pela compra", () => {
    const r = simular({
      saldo: 500,
      valorCompra: 80,
      giftbackSolicitado: 200,
      regras: { percentual: 10, multiplicador_compra_minima: 0 },
    });
    expect(r.gbUsado).toBe(80);
  });

  it("min(saldo, compra, solicitado) — solicitado vence quando é o menor", () => {
    const r = simular({
      saldo: 500,
      valorCompra: 1000,
      giftbackSolicitado: 30,
      regras: { percentual: 10, multiplicador_compra_minima: 0 },
    });
    expect(r.gbUsado).toBe(30);
  });

  it("resgate sem saldo é zero", () => {
    const r = simular({
      saldo: 0,
      valorCompra: 100,
      giftbackSolicitado: 50,
      regras: { percentual: 10, multiplicador_compra_minima: 4 },
    });
    expect(r.gbUsado).toBe(0);
  });
});
