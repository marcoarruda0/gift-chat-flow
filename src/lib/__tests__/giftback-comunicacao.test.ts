import { describe, it, expect } from "vitest";
import {
  buildVarsMap,
  resolverVariaveis,
  montarComponentsTemplate,
  buildPreviewText,
  tenantDeveRodarAgora,
  segmentoFromSoma,
  contatoPassaFiltroRfv,
} from "../giftback-comunicacao";

describe("buildVarsMap", () => {
  it("formata valores monetários e datas corretamente", () => {
    const vars = buildVarsMap({
      contato: { nome: "Maria", saldo_giftback: 99 },
      tenant: { nome: "Loja X" },
      movimento: { id: "abcdef1234567890", valor: 50, validade: "2026-05-25" },
      hojeISO: "2026-05-20",
    });
    expect(vars.nome_cliente).toBe("Maria");
    expect(vars.nome_empresa).toBe("Loja X");
    expect(vars.valor_giftback).toBe("R$ 50,00");
    expect(vars.saldo_giftback).toBe("R$ 99,00");
    expect(vars.id_giftback).toBe("ABCDEF12");
    expect(vars.data_vencimento).toBe("25/05/2026");
    expect(vars.dias_ate_expirar).toBe("5");
  });

  it("trata campos ausentes sem quebrar", () => {
    const vars = buildVarsMap({
      contato: { nome: null, saldo_giftback: null },
      tenant: { nome: null },
      movimento: { id: "xxxxxxxx", valor: 0 },
    });
    expect(vars.nome_cliente).toBe("");
    expect(vars.valor_giftback).toBe("R$ 0,00");
    expect(vars.data_vencimento).toBe("");
    expect(vars.dias_ate_expirar).toBe("");
  });
});

describe("resolverVariaveis", () => {
  const vars = { nome_cliente: "Ana", valor_giftback: "R$ 10,00" };

  it("substitui placeholders existentes", () => {
    expect(resolverVariaveis("Olá {{nome_cliente}}, ganhou {{valor_giftback}}", vars))
      .toBe("Olá Ana, ganhou R$ 10,00");
  });

  it("variável inexistente vira string vazia", () => {
    expect(resolverVariaveis("Oi {{desconhecida}}", vars)).toBe("Oi ");
  });

  it("aceita espaços nos colchetes", () => {
    expect(resolverVariaveis("Oi {{ nome_cliente }}", vars)).toBe("Oi Ana");
  });

  it("string vazia retorna vazio", () => {
    expect(resolverVariaveis("", vars)).toBe("");
  });
});

describe("montarComponentsTemplate", () => {
  it("monta BODY com placeholders Meta substituídos", () => {
    const components = [
      { type: "BODY", text: "Olá {{1}}, seu giftback de {{2}} está disponível." },
    ];
    const mapping = {
      "body.1": "{{nome_cliente}}",
      "body.2": "{{valor_giftback}}",
    };
    const vars = { nome_cliente: "João", valor_giftback: "R$ 20,00" };
    const result = montarComponentsTemplate(components, mapping, vars);
    expect(result).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "João" },
          { type: "text", text: "R$ 20,00" },
        ],
      },
    ]);
  });

  it("monta HEADER text", () => {
    const components = [{ type: "HEADER", format: "TEXT", text: "Oi {{1}}" }];
    const mapping = { "header.1": "{{nome_cliente}}" };
    const result = montarComponentsTemplate(components, mapping, { nome_cliente: "Ana" });
    expect(result).toEqual([
      { type: "header", parameters: [{ type: "text", text: "Ana" }] },
    ]);
  });

  it("ignora componentes sem placeholders", () => {
    const components = [
      { type: "BODY", text: "Mensagem fixa sem variáveis" },
      { type: "FOOTER", text: "Rodapé" },
    ];
    expect(montarComponentsTemplate(components, {}, {})).toEqual([]);
  });
});

describe("buildPreviewText", () => {
  it("renderiza body com variáveis", () => {
    const components = [{ type: "BODY", text: "Olá {{1}}, total: {{2}}" }];
    const mapping = {
      "body.1": "{{nome_cliente}}",
      "body.2": "{{valor_giftback}}",
    };
    const vars = { nome_cliente: "Lia", valor_giftback: "R$ 15,00" };
    expect(buildPreviewText(components, mapping, vars))
      .toBe("Olá Lia, total: R$ 15,00");
  });

  it("retorna vazio quando não há body", () => {
    expect(buildPreviewText([{ type: "FOOTER", text: "x" }], {}, {})).toBe("");
  });
});

describe("tenantDeveRodarAgora", () => {
  it("aceita horário exato", () => {
    expect(tenantDeveRodarAgora("09:00", { hours: 9, minutes: 0 }, 7)).toBe(true);
  });

  it("aceita dentro da janela de tolerância", () => {
    expect(tenantDeveRodarAgora("09:00", { hours: 8, minutes: 54 }, 7)).toBe(true);
    expect(tenantDeveRodarAgora("09:00", { hours: 9, minutes: 6 }, 7)).toBe(true);
  });

  it("rejeita fora da janela", () => {
    expect(tenantDeveRodarAgora("09:00", { hours: 8, minutes: 50 }, 7)).toBe(false);
    expect(tenantDeveRodarAgora("09:00", { hours: 9, minutes: 10 }, 7)).toBe(false);
  });

  it("trata horário inválido como false", () => {
    expect(tenantDeveRodarAgora("xx:yy", { hours: 9, minutes: 0 }, 7)).toBe(false);
    expect(tenantDeveRodarAgora("", { hours: 9, minutes: 0 }, 7)).toBe(false);
  });

  it("respeita ciclo de 24h (00:00 vizinho de 23:55)", () => {
    expect(tenantDeveRodarAgora("00:00", { hours: 23, minutes: 55 }, 7)).toBe(true);
    expect(tenantDeveRodarAgora("23:55", { hours: 0, minutes: 0 }, 7)).toBe(true);
  });
});
