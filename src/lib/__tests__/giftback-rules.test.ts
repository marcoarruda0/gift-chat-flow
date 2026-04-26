import { describe, it, expect } from "vitest";
import {
  resolverRegrasGiftback,
  calcularCompraMinima,
  calcularTransacaoGiftback,
  parseValorCompra,
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

  // Cenário antigo de resgate parcial removido — a regra agora é tudo-ou-nada,
  // coberta pela suíte `calcularTransacaoGiftback` abaixo.
});

describe("calcularTransacaoGiftback (1 ativo + tudo-ou-nada)", () => {
  const base = { multiplicador: 4, percentual: 10 };

  it("sem ativo + compra ≥ mínimo → gera novo, ação 'nenhum'", () => {
    const r = calcularTransacaoGiftback({
      ...base,
      saldoAtivo: 0,
      valorCompra: 50,
      aplicarGiftback: false,
    });
    expect(r.acaoSobreAtivo).toBe("nenhum");
    expect(r.gbGerado).toBe(5);
    expect(r.gbUsado).toBe(0);
    expect(r.novoSaldo).toBe(5);
    expect(r.erroValidacao).toBeNull();
  });

  it("sem ativo: saldo 0 nunca tem mínimo → qualquer compra > 0 gera", () => {
    const r = calcularTransacaoGiftback({
      ...base,
      saldoAtivo: 0,
      valorCompra: 1,
      aplicarGiftback: false,
    });
    expect(r.gbGerado).toBeCloseTo(0.1);
    expect(r.acaoSobreAtivo).toBe("nenhum");
  });

  it("com ativo + NÃO aplicar + compra ≥ mínimo → invalida antigo (substituir) + gera novo", () => {
    const r = calcularTransacaoGiftback({
      ...base,
      saldoAtivo: 100,
      valorCompra: 500,
      aplicarGiftback: false,
    });
    expect(r.acaoSobreAtivo).toBe("substituir");
    expect(r.gbUsado).toBe(0);
    expect(r.gbGerado).toBe(50);
    expect(r.novoSaldo).toBe(50);
  });

  it("com ativo + NÃO aplicar + compra < mínimo → invalida antigo, sem gerar", () => {
    const r = calcularTransacaoGiftback({
      ...base,
      saldoAtivo: 100,
      valorCompra: 200,
      aplicarGiftback: false,
    });
    expect(r.acaoSobreAtivo).toBe("invalidar_nao_uso");
    expect(r.gbGerado).toBe(0);
    expect(r.novoSaldo).toBe(0);
  });

  it("com ativo + APLICAR + compra ≥ ativo + compra ≥ mínimo → usa antigo + gera novo", () => {
    const r = calcularTransacaoGiftback({
      ...base,
      saldoAtivo: 100,
      valorCompra: 500,
      aplicarGiftback: true,
    });
    expect(r.acaoSobreAtivo).toBe("usar");
    expect(r.gbUsado).toBe(100);
    expect(r.gbGerado).toBe(50);
    expect(r.novoSaldo).toBe(50);
  });

  it("com ativo + APLICAR + compra ≥ ativo + compra < mínimo → usa, NÃO gera", () => {
    const r = calcularTransacaoGiftback({
      ...base,
      saldoAtivo: 100,
      valorCompra: 250,
      aplicarGiftback: true,
    });
    expect(r.acaoSobreAtivo).toBe("usar");
    expect(r.gbUsado).toBe(100);
    expect(r.gbGerado).toBe(0);
    expect(r.novoSaldo).toBe(0);
  });

  it("com ativo + APLICAR + compra < valor do ativo → ERRO (sem resgate parcial)", () => {
    const r = calcularTransacaoGiftback({
      ...base,
      saldoAtivo: 100,
      valorCompra: 80,
      aplicarGiftback: true,
    });
    expect(r.erroValidacao).toMatch(/tudo-ou-nada/i);
    expect(r.gbUsado).toBe(0);
    expect(r.gbGerado).toBe(0);
    expect(r.acaoSobreAtivo).toBe("nenhum");
  });

  it("multiplicador 0 → barreira desativada mesmo com saldo", () => {
    const r = calcularTransacaoGiftback({
      multiplicador: 0,
      percentual: 10,
      saldoAtivo: 200,
      valorCompra: 50,
      aplicarGiftback: false,
    });
    expect(r.compraMinimaParaGerar).toBe(0);
    expect(r.acaoSobreAtivo).toBe("substituir");
    expect(r.gbGerado).toBe(5);
  });
});

describe("parseValorCompra", () => {
  it("string vazia → valor 0 sem erro (estado inicial)", () => {
    const r = parseValorCompra("");
    expect(r.valor).toBe(0);
    expect(r.erro).toBeNull();
  });

  it("apenas espaços → valor 0 sem erro", () => {
    expect(parseValorCompra("   ")).toEqual({ valor: 0, erro: null });
  });

  it("texto não numérico → erro NaN", () => {
    const r = parseValorCompra("abc");
    expect(r.valor).toBe(0);
    expect(r.erro).toMatch(/inválido/i);
  });

  it("valor negativo → erro", () => {
    const r = parseValorCompra("-50");
    expect(r.valor).toBe(0);
    expect(r.erro).toMatch(/negativo/i);
  });

  it("zero → erro (precisa ser > 0)", () => {
    const r = parseValorCompra("0");
    expect(r.valor).toBe(0);
    expect(r.erro).toMatch(/maior que zero/i);
  });

  it("valor acima do limite → erro", () => {
    const r = parseValorCompra("1000001");
    expect(r.valor).toBe(0);
    expect(r.erro).toMatch(/limite/i);
  });

  it("aceita vírgula como separador decimal", () => {
    expect(parseValorCompra("99,90")).toEqual({ valor: 99.9, erro: null });
  });

  it("arredonda para 2 casas decimais", () => {
    expect(parseValorCompra("12.3456")).toEqual({ valor: 12.35, erro: null });
  });

  it("valor inteiro válido", () => {
    expect(parseValorCompra("50")).toEqual({ valor: 50, erro: null });
  });

  it("null/undefined são tratados como vazios", () => {
    expect(parseValorCompra(null)).toEqual({ valor: 0, erro: null });
    expect(parseValorCompra(undefined)).toEqual({ valor: 0, erro: null });
  });
});

describe("calcularTransacaoGiftback - regra D+1 (criado hoje)", () => {
  const HOJE = new Date(2026, 4, 26, 14, 30); // 26/04/2026 14:30 local
  const ONTEM = new Date(2026, 4, 25, 23, 50);

  it("bloqueia resgate quando giftback foi criado hoje", () => {
    const r = calcularTransacaoGiftback({
      saldoAtivo: 50,
      valorCompra: 200,
      aplicarGiftback: true,
      multiplicador: 4,
      percentual: 10,
      criadoEm: new Date(2026, 4, 26, 9, 0),
      agora: HOJE,
    });
    expect(r.bloqueadoMesmoDia).toBe(true);
    expect(r.erroValidacao).toMatch(/D\+1/);
    expect(r.gbUsado).toBe(0);
    expect(r.novoSaldo).toBe(50);
  });

  it("permite resgate quando giftback foi criado ontem", () => {
    const r = calcularTransacaoGiftback({
      saldoAtivo: 50,
      valorCompra: 200,
      aplicarGiftback: true,
      multiplicador: 4,
      percentual: 10,
      criadoEm: ONTEM,
      agora: HOJE,
    });
    expect(r.bloqueadoMesmoDia).toBe(false);
    expect(r.erroValidacao).toBeNull();
    expect(r.gbUsado).toBe(50);
    expect(r.acaoSobreAtivo).toBe("usar");
  });

  it("preserva ativo quando há nova compra hoje sem usar (criado hoje)", () => {
    const r = calcularTransacaoGiftback({
      saldoAtivo: 50,
      valorCompra: 300, // ≥ compra mínima 200
      aplicarGiftback: false,
      multiplicador: 4,
      percentual: 10,
      criadoEm: new Date(2026, 4, 26, 8, 0),
      agora: HOJE,
    });
    expect(r.bloqueadoMesmoDia).toBe(true);
    expect(r.acaoSobreAtivo).toBe("nenhum"); // NÃO substitui nem invalida
    expect(r.novoSaldo).toBe(50); // ativo preservado
    expect(r.gbGerado).toBe(0); // não gera novo (já existe ativo)
    expect(r.erroValidacao).toBeNull();
  });

  it("aceita string ISO em criadoEm", () => {
    const r = calcularTransacaoGiftback({
      saldoAtivo: 30,
      valorCompra: 30,
      aplicarGiftback: true,
      multiplicador: 4,
      percentual: 10,
      criadoEm: HOJE.toISOString(),
      agora: HOJE,
    });
    expect(r.bloqueadoMesmoDia).toBe(true);
  });

  it("sem criadoEm, comportamento legado (resgata normalmente)", () => {
    const r = calcularTransacaoGiftback({
      saldoAtivo: 50,
      valorCompra: 100,
      aplicarGiftback: true,
      multiplicador: 4,
      percentual: 10,
      agora: HOJE,
    });
    expect(r.bloqueadoMesmoDia).toBe(false);
    expect(r.gbUsado).toBe(50);
  });
});
