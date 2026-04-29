import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Search, Gift, CheckCircle, ArrowLeft, AlertTriangle, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import RfvBadge from "@/components/giftback/RfvBadge";
import { NovoContatoCaixaDialog, type ContatoCaixa } from "@/components/giftback/NovoContatoCaixaDialog";
import { apenasDigitos } from "@/lib/br-format";
import {
  resolverRegrasGiftback,
  calcularCompraMinima,
  calcularTransacaoGiftback,
  parseValorCompra,
  type GiftbackConfigRfvOverride,
  type AcaoSobreAtivo,
} from "@/lib/giftback-rules";
import { SEGMENTOS, type SegmentoKey } from "@/lib/rfv-segments";

interface Contato {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  saldo_giftback: number;
  rfv_recencia: number | null;
  rfv_frequencia: number | null;
  rfv_valor: number | null;
}

interface GiftbackAtivo {
  id: string;
  valor: number;
  validade: string | null; // YYYY-MM-DD
  created_at: string;
}

interface Resumo {
  valorCompra: number;
  giftbackUsado: number;
  giftbackGerado: number;
  novoSaldo: number;
  segmentoAplicado: SegmentoKey | null;
  percentualAplicado: number;
  validadeDiasAplicada: number;
  multiplicadorAplicado: number;
  compraMinimaParaGerar: number;
  origem: "override" | "global";
  acaoSobreAtivo: AcaoSobreAtivo;
  valorAtivoAnterior: number;
}

const acaoLabel: Record<AcaoSobreAtivo, string> = {
  nenhum: "Nenhum giftback ativo anterior",
  usar: "Utilizado integralmente",
  substituir: "Substituído pelo novo (não utilizado)",
  invalidar_nao_uso: "Invalidado (não utilizado nesta compra)",
};

export default function GiftbackCaixa() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [busca, setBusca] = useState("");
  const [contato, setContato] = useState<Contato | null>(null);
  const [giftbackAtivo, setGiftbackAtivo] = useState<GiftbackAtivo | null>(null);
  const [valorCompra, setValorCompra] = useState("");
  const [aplicarGiftback, setAplicarGiftback] = useState(false);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [dialogNovoOpen, setDialogNovoOpen] = useState(false);
  const contatoCardRef = useRef<HTMLDivElement | null>(null);

  // Quando um contato entra na tela, traz o card para a viewport
  useEffect(() => {
    if (contato && contatoCardRef.current) {
      contatoCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [contato?.id]);
  const { data: configGlobal } = useQuery({
    queryKey: ["giftback-config"],
    queryFn: async () => {
      const { data } = await supabase.from("giftback_config").select("*").single();
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  const { data: overrides } = useQuery({
    queryKey: ["giftback-config-rfv"],
    queryFn: async () => {
      const { data } = await supabase
        .from("giftback_config_rfv")
        .select("*")
        .order("segmento");
      return (data || []) as unknown as GiftbackConfigRfvOverride[];
    },
    enabled: !!profile?.tenant_id,
  });

  const regrasAtuais = contato
    ? resolverRegrasGiftback({
        configGlobal: configGlobal ?? null,
        overrides: overrides ?? [],
        contato,
      })
    : null;

  const saldoAtivo = giftbackAtivo ? Number(giftbackAtivo.valor) : 0;

  const compraMinimaAtual = regrasAtuais
    ? calcularCompraMinima(saldoAtivo, regrasAtuais.multiplicador_compra_minima)
    : 0;

  // Validação das regras configuradas
  const regrasInvalidas: string[] = [];
  if (regrasAtuais) {
    if (
      regrasAtuais.multiplicador_compra_minima === null ||
      regrasAtuais.multiplicador_compra_minima === undefined ||
      Number.isNaN(regrasAtuais.multiplicador_compra_minima) ||
      regrasAtuais.multiplicador_compra_minima < 0
    ) {
      regrasInvalidas.push("Multiplicador da compra mínima inválido (deve ser ≥ 0).");
    }
    if (
      regrasAtuais.percentual === null ||
      regrasAtuais.percentual === undefined ||
      Number.isNaN(regrasAtuais.percentual) ||
      regrasAtuais.percentual < 0
    ) {
      regrasInvalidas.push("Percentual de retorno inválido (deve ser ≥ 0).");
    }
    if (
      regrasAtuais.validade_dias === null ||
      regrasAtuais.validade_dias === undefined ||
      Number.isNaN(regrasAtuais.validade_dias) ||
      regrasAtuais.validade_dias <= 0
    ) {
      regrasInvalidas.push("Validade em dias inválida (deve ser > 0).");
    }
  }
  const regrasOk = regrasInvalidas.length === 0;

  /**
   * Carrega um contato (já buscado) no painel: faz lazy-expire do giftback
   * ativo e sincroniza saldo. Reutilizado pela busca e pelo cadastro novo.
   */
  const carregarContato = async (cData: Contato) => {
    // Buscar único movimento ativo de crédito
    const { data: mov } = await supabase
      .from("giftback_movimentos")
      .select("id, valor, validade, created_at")
      .eq("contato_id", cData.id)
      .eq("tipo", "credito")
      .eq("status", "ativo")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let ativo: GiftbackAtivo | null = mov
      ? {
          id: mov.id,
          valor: Number(mov.valor),
          validade: mov.validade,
          created_at: mov.created_at,
        }
      : null;

    // Lazy expire
    if (ativo?.validade) {
      const hoje = new Date().toISOString().split("T")[0];
      if (ativo.validade < hoje) {
        await supabase
          .from("giftback_movimentos")
          .update({
            status: "expirado",
            motivo_inativacao: "expirado",
          })
          .eq("id", ativo.id);
        await supabase
          .from("contatos")
          .update({ saldo_giftback: 0 })
          .eq("id", cData.id);
        toast({
          title: "Giftback expirado",
          description: `O giftback de R$ ${ativo.valor.toFixed(
            2,
          )} venceu em ${ativo.validade.split("-").reverse().join("/")} e foi marcado como expirado.`,
        });
        ativo = null;
        cData.saldo_giftback = 0;
      }
    }

    // Sincronizar saldo do contato com o ativo (defesa contra dessync)
    const saldoEsperado = ativo ? ativo.valor : 0;
    if (Number(cData.saldo_giftback || 0) !== saldoEsperado) {
      await supabase
        .from("contatos")
        .update({ saldo_giftback: saldoEsperado })
        .eq("id", cData.id);
      cData.saldo_giftback = saldoEsperado;
    }

    setContato(cData);
    setGiftbackAtivo(ativo);
    setAplicarGiftback(false);
    setResumo(null);
    setNaoEncontrado(false);
  };

  /**
   * Busca contato por CPF/telefone e delega o carregamento.
   */
  const buscarContato = async () => {
    const termoBruto = busca.trim();
    if (!termoBruto) return;
    setBuscando(true);
    setNaoEncontrado(false);
    try {
      const termoDigitos = apenasDigitos(termoBruto);
      // Aceita match em qualquer formato (com máscara ou só dígitos),
      // já que a base pode ter contatos antigos não normalizados.
      const filtros = new Set<string>();
      if (termoBruto) {
        filtros.add(`cpf.eq.${termoBruto}`);
        filtros.add(`telefone.eq.${termoBruto}`);
      }
      if (termoDigitos && termoDigitos !== termoBruto) {
        filtros.add(`cpf.eq.${termoDigitos}`);
        filtros.add(`telefone.eq.${termoDigitos}`);
      }

      const { data: cData } = await supabase
        .from("contatos")
        .select(
          "id, nome, telefone, cpf, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor",
        )
        .or(Array.from(filtros).join(","))
        .maybeSingle();

      if (!cData) {
        setContato(null);
        setGiftbackAtivo(null);
        setNaoEncontrado(true);
        return;
      }

      await carregarContato(cData);
    } finally {
      setBuscando(false);
    }
  };

  // Cálculo da transação atual (preview em tempo real)
  const { valor: valorCompraNum, erro: erroValor } = parseValorCompra(valorCompra);
  const configCarregando = configGlobal === undefined;
  const configAusente = configGlobal === null;

  const previewTransacao =
    contato && regrasAtuais
      ? calcularTransacaoGiftback({
          saldoAtivo,
          valorCompra: valorCompraNum,
          aplicarGiftback,
          multiplicador: regrasAtuais.multiplicador_compra_minima,
          percentual: regrasAtuais.percentual,
          criadoEm: giftbackAtivo?.created_at ?? null,
        })
      : null;

  const bloqueadoMesmoDia = previewTransacao?.bloqueadoMesmoDia ?? false;

  const erroResgate = previewTransacao?.erroValidacao ?? null;
  const podeConfirmar =
    regrasOk &&
    !configAusente &&
    !configCarregando &&
    valorCompraNum > 0 &&
    !erroValor &&
    !erroResgate;

  // Lista consolidada de motivos de bloqueio (UI)
  const motivosBloqueio: string[] = [];
  if (configCarregando) motivosBloqueio.push("Carregando configuração de giftback…");
  if (configAusente)
    motivosBloqueio.push(
      "Configuração de giftback ausente — crie em Giftback → Configuração.",
    );
  if (!regrasOk) motivosBloqueio.push("Regras de giftback inválidas.");
  if (erroValor) motivosBloqueio.push(erroValor);
  else if (valorCompraNum <= 0 && valorCompra.trim() !== "")
    motivosBloqueio.push("Informe um valor de compra maior que zero.");
  if (erroResgate) motivosBloqueio.push(erroResgate);

  const registrarMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.tenant_id || !user?.id) {
        throw new Error("Sessão inválida — faça login novamente.");
      }
      if (!contato) {
        throw new Error("Selecione um contato antes de continuar.");
      }
      if (configCarregando) {
        throw new Error("Configuração ainda está carregando.");
      }
      if (configAusente) {
        throw new Error(
          "Configuração de giftback ausente. Crie em Giftback → Configuração.",
        );
      }
      if (!regrasOk) {
        throw new Error(`Regras inválidas: ${regrasInvalidas.join(" ")}`);
      }
      const { valor: valorValidado, erro: erroValValid } = parseValorCompra(valorCompra);
      if (erroValValid) throw new Error(erroValValid);
      if (!Number.isFinite(valorValidado) || valorValidado <= 0) {
        throw new Error("Valor da compra inválido.");
      }
      const regras = resolverRegrasGiftback({
        configGlobal: configGlobal ?? null,
        overrides: overrides ?? [],
        contato: contato!,
      });

      const transacao = calcularTransacaoGiftback({
        saldoAtivo,
        valorCompra: valorValidado,
        aplicarGiftback,
        multiplicador: regras.multiplicador_compra_minima,
        percentual: regras.percentual,
        criadoEm: giftbackAtivo?.created_at ?? null,
      });

      if (transacao.erroValidacao) {
        throw new Error(transacao.erroValidacao);
      }

      // 1) Insert da compra
      const { data: compra, error: compraErr } = await supabase
        .from("compras")
        .insert({
          tenant_id: profile!.tenant_id!,
          contato_id: contato!.id,
          valor: valorValidado,
          giftback_gerado: transacao.gbGerado,
          giftback_usado: transacao.gbUsado,
          operador_id: user!.id,
        })
        .select()
        .single();
      if (compraErr) throw compraErr;

      // 2) Tratar o ativo antigo (se houver)
      if (giftbackAtivo && transacao.acaoSobreAtivo !== "nenhum") {
        const { acaoSobreAtivo } = transacao;

        if (acaoSobreAtivo === "usar") {
          // Marcar ativo como usado + criar movimento de débito
          await supabase
            .from("giftback_movimentos")
            .update({ status: "usado", motivo_inativacao: "usado" })
            .eq("id", giftbackAtivo.id);

          await supabase.from("giftback_movimentos").insert({
            tenant_id: profile!.tenant_id!,
            contato_id: contato!.id,
            compra_id: compra.id,
            tipo: "debito" as const,
            valor: transacao.gbUsado,
            status: "usado" as const,
          });
        } else {
          // substituir | invalidar_nao_uso → marcar como inativo
          const motivo =
            acaoSobreAtivo === "substituir" ? "substituido" : "nao_utilizado";
          await supabase
            .from("giftback_movimentos")
            .update({ status: "inativo", motivo_inativacao: motivo })
            .eq("id", giftbackAtivo.id);
        }
      }

      // 3) Inserir novo crédito (se gerou)
      if (transacao.gbGerado > 0) {
        const validade = new Date();
        validade.setDate(validade.getDate() + regras.validade_dias);
        await supabase.from("giftback_movimentos").insert({
          tenant_id: profile!.tenant_id!,
          contato_id: contato!.id,
          compra_id: compra.id,
          tipo: "credito" as const,
          valor: transacao.gbGerado,
          validade: validade.toISOString().split("T")[0],
          status: "ativo" as const,
          segmento_rfv: regras.segmentoAplicado,
          regra_percentual: regras.percentual,
        });
      }

      // 4) Atualizar saldo agregado do contato (= valor do novo ativo, ou 0)
      await supabase
        .from("contatos")
        .update({ saldo_giftback: transacao.novoSaldo })
        .eq("id", contato!.id);

      return {
        valorCompra: valorValidado,
        giftbackUsado: transacao.gbUsado,
        giftbackGerado: transacao.gbGerado,
        novoSaldo: transacao.novoSaldo,
        segmentoAplicado: regras.segmentoAplicado,
        percentualAplicado: regras.percentual,
        validadeDiasAplicada: regras.validade_dias,
        multiplicadorAplicado: regras.multiplicador_compra_minima,
        compraMinimaParaGerar: transacao.compraMinimaParaGerar,
        origem: regras.origem,
        acaoSobreAtivo: transacao.acaoSobreAtivo,
        valorAtivoAnterior: saldoAtivo,
      } satisfies Resumo;
    },
    onSuccess: (data) => {
      setResumo(data);
      setContato({ ...contato!, saldo_giftback: data.novoSaldo });
      setGiftbackAtivo(null); // será refeito ao buscar de novo
      setValorCompra("");
      setAplicarGiftback(false);
      queryClient.invalidateQueries({ queryKey: ["contatos"] });
      queryClient.invalidateQueries({ queryKey: ["giftback-movimentos"] });
      toast({ title: "Compra registrada com sucesso!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const nomeSegmentoResumo = (key: SegmentoKey | null) =>
    key ? SEGMENTOS[key].nome : "Sem RFV";

  const validadeFormatada = (iso: string | null) =>
    iso ? iso.split("-").reverse().join("/") : "—";

  const diasRestantes = (iso: string | null) => {
    if (!iso) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const v = new Date(iso + "T00:00:00");
    return Math.ceil((v.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/giftback">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold">Painel do Caixa</h1>
          <p className="text-sm text-muted-foreground">
            Registre compras e aplique giftback
          </p>
        </div>
      </div>

      {/* Busca */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Input
              placeholder="CPF ou telefone do cliente"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscarContato()}
            />
            <Button onClick={buscarContato} disabled={buscando}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {naoEncontrado && !contato && (
        <Card className="border-amber-200 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="pt-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Cliente não encontrado</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Nenhum cadastro com esse CPF/telefone. Cadastre agora para registrar a compra.
              </p>
              <Button size="sm" className="mt-3" onClick={() => setDialogNovoOpen(true)}>
                <UserPlus className="h-4 w-4 mr-1" />
                Cadastrar novo cliente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <NovoContatoCaixaDialog
        open={dialogNovoOpen}
        onOpenChange={setDialogNovoOpen}
        valorBuscado={busca}
        onCriado={(novo) => {
          void carregarContato(novo as Contato);
        }}
      />

      {/* Contato */}
      {contato && (
        <div ref={contatoCardRef}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{contato.nome}</CardTitle>
                <CardDescription>
                  {contato.cpf && `CPF: ${contato.cpf}`}
                  {contato.telefone && ` • Tel: ${contato.telefone}`}
                </CardDescription>
              </div>
              <RfvBadge
                r={contato.rfv_recencia}
                f={contato.rfv_frequencia}
                v={contato.rfv_valor}
                compacto
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Bloco do giftback ativo */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              <Gift className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Giftback ativo (único)
                </p>
                <p className="text-xl font-bold text-primary">
                  R$ {saldoAtivo.toFixed(2)}
                </p>
                {giftbackAtivo && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Válido até {validadeFormatada(giftbackAtivo.validade)}
                    {(() => {
                      const d = diasRestantes(giftbackAtivo.validade);
                      if (d === null) return null;
                      if (d <= 0) return " • vence hoje";
                      if (d === 1) return " • vence amanhã";
                      return ` • ${d} dias restantes`;
                    })()}
                  </p>
                )}
                {!giftbackAtivo && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cliente não possui giftback ativo no momento.
                  </p>
                )}
              </div>
            </div>

            {regrasAtuais && (
              <div className="text-xs text-muted-foreground border rounded-md p-2 space-y-0.5">
                <div>
                  <span className="font-medium text-foreground">
                    Regra aplicada:
                  </span>{" "}
                  {regrasAtuais.origem === "override"
                    ? `${nomeSegmentoResumo(regrasAtuais.segmentoAplicado)} (personalizada)`
                    : "Padrão (global)"}
                </div>
                <div>
                  {regrasAtuais.percentual}% de retorno · validade{" "}
                  {regrasAtuais.validade_dias} dias · multiplicador{" "}
                  {regrasAtuais.multiplicador_compra_minima}×
                </div>
                {compraMinimaAtual > 0 ? (
                  <div>
                    Para gerar novo giftback, compra precisa ser ≥{" "}
                    <strong>R$ {compraMinimaAtual.toFixed(2)}</strong> (ativo R${" "}
                    {saldoAtivo.toFixed(2)} ×{" "}
                    {regrasAtuais.multiplicador_compra_minima})
                  </div>
                ) : (
                  <div>Qualquer compra gera giftback</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Registrar compra */}
      {contato && !resumo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Registrar Compra</CardTitle>
          </CardHeader>
          <CardContent>
            {configCarregando && (
              <div
                className="mb-4 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
                role="status"
                data-testid="config-carregando-alert"
              >
                Carregando configuração de giftback…
              </div>
            )}

            {configAusente && (
              <div
                className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
                data-testid="config-ausente-alert"
              >
                <p className="font-medium">
                  Configuração de giftback ausente.
                </p>
                <p className="mt-1 text-xs">
                  Crie em <strong>Giftback → Configuração</strong> antes de
                  operar o caixa.
                </p>
              </div>
            )}

            {!regrasOk && !configAusente && (
              <div
                className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
                data-testid="regras-invalidas-alert"
              >
                <p className="font-medium">Não é possível registrar a compra:</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {regrasInvalidas.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">
                  Ajuste a configuração em{" "}
                  <strong>Giftback → Configuração</strong> antes de continuar.
                </p>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                registrarMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Valor da Compra (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  value={valorCompra}
                  onChange={(e) => setValorCompra(e.target.value)}
                  onKeyDown={(e) => {
                    // Bloqueia caracteres que HTML5 number aceita mas
                    // não fazem sentido para um valor monetário positivo
                    if (["e", "E", "+", "-"].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  required
                  disabled={!regrasOk || configAusente || configCarregando}
                  aria-invalid={!!erroValor}
                  data-testid="input-valor-compra"
                />

                {/* Erro de validação do valor digitado */}
                {erroValor && (
                  <div
                    className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive flex gap-2"
                    role="alert"
                    data-testid="erro-valor-compra"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{erroValor}</span>
                  </div>
                )}

                {/* Aviso: compra abaixo do mínimo (não vai gerar) */}
                {valorCompraNum > 0 &&
                  compraMinimaAtual > 0 &&
                  valorCompraNum < compraMinimaAtual && (
                    <div
                      className="rounded-md border border-warning/50 bg-warning/10 p-2 text-xs text-warning-foreground space-y-1"
                      role="status"
                      data-testid="aviso-abaixo-minimo"
                    >
                      <p className="font-medium">
                        ⚠️ Compra abaixo do mínimo para gerar giftback
                      </p>
                      <p>
                        Faltam{" "}
                        <strong>
                          R$ {(compraMinimaAtual - valorCompraNum).toFixed(2)}
                        </strong>{" "}
                        para atingir o mínimo de{" "}
                        <strong>R$ {compraMinimaAtual.toFixed(2)}</strong>
                        {regrasAtuais &&
                          regrasAtuais.multiplicador_compra_minima > 0 && (
                            <>
                              {" "}
                              ({regrasAtuais.multiplicador_compra_minima}× o
                              ativo de R$ {saldoAtivo.toFixed(2)})
                            </>
                          )}
                        .
                      </p>
                      <p>
                        Efeito:{" "}
                        <strong>nenhum giftback novo será gerado</strong>
                        {regrasAtuais && (
                          <>
                            {" "}
                            (deixaria de creditar R${" "}
                            {(
                              valorCompraNum * (regrasAtuais.percentual / 100)
                            ).toFixed(2)}
                            )
                          </>
                        )}
                        .
                      </p>
                    </div>
                  )}
              </div>

              {/* Toggle de aplicação — somente quando há ativo */}
              {giftbackAtivo && saldoAtivo > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={aplicarGiftback && !bloqueadoMesmoDia}
                      onCheckedChange={(v) =>
                        setAplicarGiftback(v && !bloqueadoMesmoDia)
                      }
                      disabled={
                        !regrasOk ||
                        configAusente ||
                        configCarregando ||
                        bloqueadoMesmoDia
                      }
                    />
                    <Label>
                      Aplicar giftback de{" "}
                      <strong>R$ {saldoAtivo.toFixed(2)}</strong> (uso integral)
                    </Label>
                  </div>

                  {/* Bloqueio D+1: criado hoje, só pode usar amanhã */}
                  {bloqueadoMesmoDia && (
                    <div
                      className="rounded-md border border-warning/50 bg-warning/10 p-2 text-xs text-warning-foreground flex gap-2"
                      role="status"
                      data-testid="aviso-bloqueio-mesmo-dia"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Este giftback foi gerado hoje (
                        {new Date(giftbackAtivo.created_at).toLocaleDateString(
                          "pt-BR",
                        )}
                        ) e só poderá ser utilizado a partir de{" "}
                        <strong>
                          {(() => {
                            const d = new Date(giftbackAtivo.created_at);
                            d.setDate(d.getDate() + 1);
                            return d.toLocaleDateString("pt-BR");
                          })()}
                        </strong>{" "}
                        (D+1). O ativo será preservado mesmo que você registre
                        nova compra hoje.
                      </span>
                    </div>
                  )}

                  {/* Erro: tentando resgate parcial */}
                  {aplicarGiftback && erroResgate && !bloqueadoMesmoDia && (
                    <div
                      className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive flex gap-2"
                      role="alert"
                      data-testid="erro-resgate-parcial"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{erroResgate}</span>
                    </div>
                  )}

                  {/* Aviso: NÃO aplicar perde o ativo (apenas se não houver bloqueio D+1) */}
                  {!aplicarGiftback && !bloqueadoMesmoDia && (
                    <div
                      className="rounded-md border border-warning/50 bg-warning/10 p-2 text-xs text-warning-foreground"
                      role="status"
                      data-testid="aviso-perda-ativo"
                    >
                      ⚠️ O giftback ativo de{" "}
                      <strong>R$ {saldoAtivo.toFixed(2)}</strong> será{" "}
                      <strong>invalidado</strong> ao confirmar esta compra
                      (regra: 1 ativo por cliente — perde se não usado em nova
                      compra).
                    </div>
                  )}
                </div>
              )}

              {/* Bloqueios consolidados */}
              {!podeConfirmar && motivosBloqueio.length > 0 && (
                <div
                  className="rounded-md border border-muted-foreground/30 bg-muted/40 p-2 text-xs text-muted-foreground"
                  data-testid="bloqueios-confirmacao"
                >
                  <p className="font-medium text-foreground mb-1">
                    Para confirmar, resolva:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {motivosBloqueio.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  registrarMutation.isPending || !podeConfirmar
                }
              >
                {registrarMutation.isPending
                  ? "Registrando..."
                  : "Confirmar Compra"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Resumo */}
      {resumo && (
        <Card className="border-primary">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Compra Registrada!</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span>Valor da compra</span>
              <span className="font-medium">
                R$ {resumo.valorCompra.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Giftback utilizado</span>
              <span className="font-medium text-destructive">
                - R$ {resumo.giftbackUsado.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Giftback gerado</span>
              <span className="font-medium text-primary">
                + R$ {resumo.giftbackGerado.toFixed(2)}
              </span>
            </div>
            <hr />
            <div className="flex justify-between font-bold">
              <span>Novo saldo ativo</span>
              <span>R$ {resumo.novoSaldo.toFixed(2)}</span>
            </div>

            {/* Status do ativo anterior */}
            <div
              className="rounded-md border bg-muted/40 p-3 text-xs space-y-1"
              data-testid="resumo-acao-ativo"
            >
              <p className="font-medium text-foreground">
                Giftback ativo anterior
              </p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor</span>
                <span>R$ {resumo.valorAtivoAnterior.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resultado</span>
                <span className="text-foreground">
                  {acaoLabel[resumo.acaoSobreAtivo]}
                </span>
              </div>
            </div>

            {/* Bloco de auditoria — regras aplicadas */}
            <div
              className="rounded-md border bg-muted/40 p-3 mt-2 space-y-1 text-xs"
              data-testid="auditoria-regras"
            >
              <p className="font-medium text-foreground">
                Regras aplicadas (auditoria)
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <span>Origem</span>
                <span className="text-right text-foreground">
                  {resumo.origem === "override"
                    ? "Override por RFV"
                    : "Configuração global"}
                </span>

                <span>Segmento</span>
                <span className="text-right text-foreground">
                  {nomeSegmentoResumo(resumo.segmentoAplicado)}
                </span>

                <span>Percentual de retorno</span>
                <span className="text-right text-foreground">
                  {resumo.percentualAplicado}%
                </span>

                <span>Validade do crédito</span>
                <span className="text-right text-foreground">
                  {resumo.validadeDiasAplicada} dias
                </span>

                <span>Multiplicador</span>
                <span className="text-right text-foreground">
                  {resumo.multiplicadorAplicado}×
                </span>

                <span>Compra mínima p/ gerar</span>
                <span className="text-right text-foreground">
                  {resumo.compraMinimaParaGerar > 0
                    ? `R$ ${resumo.compraMinimaParaGerar.toFixed(2)}`
                    : "Sem mínimo"}
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => {
                setResumo(null);
                setContato(null);
                setGiftbackAtivo(null);
                setBusca("");
              }}
            >
              Nova Operação
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
