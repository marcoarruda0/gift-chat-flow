// Edge function: mesclar dois contatos em um (preserva histórico).
// Reaponta linhas em compras, giftback_movimentos, giftback_comunicacao_log,
// campanha_destinatarios, optout_tokens, atendimento_satisfacao e conversas.
// Soma saldo_giftback, mescla campos não conflitantes no alvo e remove a origem.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  alvo_id: string;
  origem_id: string;
  // Campos opcionais que devem ser garantidos no alvo após o merge (ex.: novo CPF/telefone digitado).
  forcar?: {
    cpf?: string | null;
    telefone?: string | null;
  };
}

type Contato = {
  id: string;
  tenant_id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  genero: string | null;
  avatar_url: string | null;
  saldo_giftback: number | null;
  tags: string[] | null;
  notas: string | null;
  campos_personalizados: Record<string, unknown> | null;
  opt_out_whatsapp: boolean | null;
  opt_out_at: string | null;
  created_at: string;
};

const TABELAS_HISTORICO = [
  "compras",
  "giftback_movimentos",
  "giftback_comunicacao_log",
  "campanha_destinatarios",
  "optout_tokens",
  "atendimento_satisfacao",
  "conversas",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "missing_auth" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente com JWT do usuário — apenas para descobrir tenant/identidade
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "invalid_user" }, 401);
    }
    const userId = userData.user.id;

    const body = (await req.json()) as Body;
    if (!body?.alvo_id || !body?.origem_id || body.alvo_id === body.origem_id) {
      return jsonResponse({ error: "invalid_payload" }, 400);
    }

    // Service role — opera em todas as tabelas sem esbarrar em RLS
    const admin = createClient(supabaseUrl, serviceRole);

    // Tenant do usuário autenticado
    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id as string | undefined;
    if (!tenantId) {
      return jsonResponse({ error: "no_tenant" }, 403);
    }

    // Buscar ambos os contatos (e validar que pertencem ao mesmo tenant do usuário)
    const { data: contatos, error: contatosErr } = await admin
      .from("contatos")
      .select(
        "id, tenant_id, nome, cpf, telefone, email, data_nascimento, endereco, genero, avatar_url, saldo_giftback, tags, notas, campos_personalizados, opt_out_whatsapp, opt_out_at, created_at",
      )
      .in("id", [body.alvo_id, body.origem_id]);

    if (contatosErr) throw contatosErr;
    if (!contatos || contatos.length !== 2) {
      return jsonResponse({ error: "contatos_nao_encontrados" }, 404);
    }
    const alvo = contatos.find((c) => c.id === body.alvo_id) as Contato;
    const origem = contatos.find((c) => c.id === body.origem_id) as Contato;
    if (alvo.tenant_id !== tenantId || origem.tenant_id !== tenantId) {
      return jsonResponse({ error: "tenant_mismatch" }, 403);
    }

    const etapas: Array<{ etapa: string; ok: boolean; erro?: string }> = [];

    // 1) Reapontar histórico
    for (const tabela of TABELAS_HISTORICO) {
      const { error } = await admin
        .from(tabela)
        .update({ contato_id: alvo.id })
        .eq("contato_id", origem.id)
        .eq("tenant_id", tenantId);
      etapas.push({
        etapa: `reapontar_${tabela}`,
        ok: !error,
        erro: error?.message,
      });
      if (error) {
        return jsonResponse(
          { error: "etapa_falhou", etapa: `reapontar_${tabela}`, detalhe: error.message, etapas },
          500,
        );
      }
    }

    // 2) Montar update do alvo: somar saldo + preencher campos vazios + tags união + notas concat
    const merged: Partial<Contato> = {};
    const saldoAlvo = Number(alvo.saldo_giftback ?? 0);
    const saldoOrigem = Number(origem.saldo_giftback ?? 0);
    if (saldoOrigem !== 0) merged.saldo_giftback = saldoAlvo + saldoOrigem;

    const preencherSeVazio = <K extends keyof Contato>(campo: K) => {
      const valAlvo = alvo[campo];
      const valOrigem = origem[campo];
      if ((valAlvo === null || valAlvo === undefined || valAlvo === "") && valOrigem) {
        (merged as Record<string, unknown>)[campo as string] = valOrigem;
      }
    };
    (["email", "data_nascimento", "endereco", "genero", "avatar_url", "cpf", "telefone"] as const).forEach(
      preencherSeVazio,
    );

    // Forçar CPF/telefone novos quando informados (digitados pelo operador agora)
    if (body.forcar?.cpf) (merged as Record<string, unknown>).cpf = body.forcar.cpf;
    if (body.forcar?.telefone) (merged as Record<string, unknown>).telefone = body.forcar.telefone;

    // Tags: união (case-insensitive)
    const tagsAlvo = Array.isArray(alvo.tags) ? alvo.tags : [];
    const tagsOrigem = Array.isArray(origem.tags) ? origem.tags : [];
    const tagsUnion = Array.from(
      new Map(
        [...tagsAlvo, ...tagsOrigem].map((t) => [String(t).toLowerCase(), t]),
      ).values(),
    );
    if (tagsUnion.length !== tagsAlvo.length) {
      (merged as Record<string, unknown>).tags = tagsUnion;
    }

    // campos_personalizados: merge raso (alvo prevalece)
    const cpAlvo = (alvo.campos_personalizados ?? {}) as Record<string, unknown>;
    const cpOrigem = (origem.campos_personalizados ?? {}) as Record<string, unknown>;
    const cpMerged = { ...cpOrigem, ...cpAlvo };
    if (Object.keys(cpMerged).length !== Object.keys(cpAlvo).length) {
      (merged as Record<string, unknown>).campos_personalizados = cpMerged;
    }

    // notas: concatenar
    if (origem.notas && origem.notas.trim()) {
      const sep = "\n---\n(do cadastro mesclado)\n";
      (merged as Record<string, unknown>).notas = alvo.notas
        ? `${alvo.notas}${sep}${origem.notas}`
        : origem.notas;
    }

    // opt-out: OR
    if (origem.opt_out_whatsapp && !alvo.opt_out_whatsapp) {
      (merged as Record<string, unknown>).opt_out_whatsapp = true;
      (merged as Record<string, unknown>).opt_out_at = origem.opt_out_at ?? new Date().toISOString();
    }

    // 3) Antes de atualizar o alvo, é possível que o telefone/cpf forçado conflite com o índice único.
    //    Solução: limpar esses campos da origem ANTES de aplicar no alvo.
    const limparOrigem: Record<string, null> = {};
    if (merged.telefone && origem.telefone) limparOrigem.telefone = null;
    if (merged.cpf && origem.cpf) limparOrigem.cpf = null;
    if (Object.keys(limparOrigem).length > 0) {
      const { error } = await admin
        .from("contatos")
        .update(limparOrigem)
        .eq("id", origem.id);
      etapas.push({ etapa: "limpar_origem", ok: !error, erro: error?.message });
      if (error) {
        return jsonResponse(
          { error: "etapa_falhou", etapa: "limpar_origem", detalhe: error.message, etapas },
          500,
        );
      }
    }

    // 4) Aplicar update no alvo
    if (Object.keys(merged).length > 0) {
      const { error } = await admin
        .from("contatos")
        .update(merged)
        .eq("id", alvo.id);
      etapas.push({ etapa: "atualizar_alvo", ok: !error, erro: error?.message });
      if (error) {
        return jsonResponse(
          { error: "etapa_falhou", etapa: "atualizar_alvo", detalhe: error.message, etapas },
          500,
        );
      }
    }

    // 5) Apagar origem
    const { error: delErr } = await admin
      .from("contatos")
      .delete()
      .eq("id", origem.id);
    etapas.push({ etapa: "deletar_origem", ok: !delErr, erro: delErr?.message });
    if (delErr) {
      return jsonResponse(
        { error: "etapa_falhou", etapa: "deletar_origem", detalhe: delErr.message, etapas },
        500,
      );
    }

    // 6) Retornar alvo final
    const { data: alvoFinal } = await admin
      .from("contatos")
      .select(
        "id, nome, telefone, cpf, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor",
      )
      .eq("id", alvo.id)
      .single();

    return jsonResponse({ ok: true, contato: alvoFinal, etapas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    console.error("[mesclar-contatos]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
