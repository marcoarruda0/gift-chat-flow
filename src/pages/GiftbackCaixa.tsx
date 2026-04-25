import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Search, Gift, CheckCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import RfvBadge from "@/components/giftback/RfvBadge";
import {
  resolverRegrasGiftback,
  calcularCompraMinima,
  type GiftbackConfigRfvOverride,
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

interface Resumo {
  valorCompra: number;
  giftbackUsado: number;
  giftbackGerado: number;
  novoSaldo: number;
  segmentoAplicado: SegmentoKey | null;
  percentualAplicado: number;
  multiplicadorAplicado: number;
  compraMinimaParaGerar: number;
  origem: "override" | "global";
}

export default function GiftbackCaixa() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [busca, setBusca] = useState("");
  const [contato, setContato] = useState<Contato | null>(null);
  const [valorCompra, setValorCompra] = useState("");
  const [aplicarGiftback, setAplicarGiftback] = useState(false);
  const [valorGiftback, setValorGiftback] = useState("");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [buscando, setBuscando] = useState(false);

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
      const { data } = await supabase.from("giftback_config_rfv").select("*").order("segmento");
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

  const compraMinimaAtual = regrasAtuais
    ? calcularCompraMinima(contato!.saldo_giftback, regrasAtuais.multiplicador_compra_minima)
    : 0;

  // Validação das regras: bloqueia confirmação se a configuração estiver inválida.
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
  if (contato && (Number.isNaN(Number(contato.saldo_giftback)) || Number(contato.saldo_giftback) < 0)) {
    regrasInvalidas.push("Saldo de giftback do cliente inválido (negativo ou ausente).");
  }
  const regrasOk = regrasInvalidas.length === 0;

  const buscarContato = async () => {
    if (!busca.trim()) return;
    setBuscando(true);
    const { data } = await supabase
      .from("contatos")
      .select("id, nome, telefone, cpf, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor")
      .or(`cpf.eq.${busca},telefone.eq.${busca}`)
      .single();
    setBuscando(false);
    if (data) {
      setContato(data);
      setResumo(null);
    } else {
      toast({ title: "Contato não encontrado", variant: "destructive" });
    }
  };

  const registrarMutation = useMutation({
    mutationFn: async () => {
      if (!regrasOk) {
        throw new Error(`Regras inválidas: ${regrasInvalidas.join(" ")}`);
      }
      const valor = parseFloat(valorCompra);
      if (!Number.isFinite(valor) || valor <= 0) {
        throw new Error("Valor da compra inválido.");
      }
      const regras = resolverRegrasGiftback({
        configGlobal: configGlobal ?? null,
        overrides: overrides ?? [],
        contato: contato!,
      });

      const compraMinimaParaGerar = calcularCompraMinima(
        contato!.saldo_giftback,
        regras.multiplicador_compra_minima,
      );

      // Resgate: limitado a min(saldo, valor da compra)
      const gbUsadoSolicitado = aplicarGiftback ? parseFloat(valorGiftback) || 0 : 0;
      const gbUsado = Math.min(gbUsadoSolicitado, contato!.saldo_giftback, valor);

      // Geração: só se a compra atinge o mínimo (saldo × multiplicador).
      const gbGerado = valor >= compraMinimaParaGerar ? valor * (regras.percentual / 100) : 0;

      // Insert compra
      const { data: compra, error: compraErr } = await supabase
        .from("compras")
        .insert({
          tenant_id: profile!.tenant_id!,
          contato_id: contato!.id,
          valor,
          giftback_gerado: gbGerado,
          giftback_usado: gbUsado,
          operador_id: user!.id,
        })
        .select()
        .single();
      if (compraErr) throw compraErr;

      // Insert credit movement (com auditoria de segmento/regra)
      if (gbGerado > 0) {
        const validade = new Date();
        validade.setDate(validade.getDate() + regras.validade_dias);
        await supabase.from("giftback_movimentos").insert({
          tenant_id: profile!.tenant_id!,
          contato_id: contato!.id,
          compra_id: compra.id,
          tipo: "credito" as const,
          valor: gbGerado,
          validade: validade.toISOString().split("T")[0],
          status: "ativo" as const,
          segmento_rfv: regras.segmentoAplicado,
          regra_percentual: regras.percentual,
        });
      }

      // Insert debit movement
      if (gbUsado > 0) {
        await supabase.from("giftback_movimentos").insert({
          tenant_id: profile!.tenant_id!,
          contato_id: contato!.id,
          compra_id: compra.id,
          tipo: "debito" as const,
          valor: gbUsado,
          status: "usado" as const,
        });
      }

      // Update saldo
      const novoSaldo = (contato!.saldo_giftback || 0) - gbUsado + gbGerado;
      await supabase.from("contatos").update({ saldo_giftback: novoSaldo }).eq("id", contato!.id);

      return {
        valorCompra: valor,
        giftbackUsado: gbUsado,
        giftbackGerado: gbGerado,
        novoSaldo,
        segmentoAplicado: regras.segmentoAplicado,
        percentualAplicado: regras.percentual,
        multiplicadorAplicado: regras.multiplicador_compra_minima,
        compraMinimaParaGerar,
        origem: regras.origem,
      } satisfies Resumo;
    },
    onSuccess: (data) => {
      setResumo(data);
      setContato({ ...contato!, saldo_giftback: data.novoSaldo });
      setValorCompra("");
      setValorGiftback("");
      setAplicarGiftback(false);
      queryClient.invalidateQueries({ queryKey: ["contatos"] });
      queryClient.invalidateQueries({ queryKey: ["giftback-movimentos"] });
      toast({ title: "Compra registrada com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const nomeSegmentoResumo = (key: SegmentoKey | null) =>
    key ? SEGMENTOS[key].nome : "Sem RFV";

  // Limites de resgate exibidos na UI
  const valorCompraNum = parseFloat(valorCompra) || 0;
  const maxResgate = contato
    ? Math.min(contato.saldo_giftback, valorCompraNum || contato.saldo_giftback)
    : 0;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/giftback"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold">Painel do Caixa</h1>
          <p className="text-sm text-muted-foreground">Registre compras e aplique giftback</p>
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

      {/* Contato */}
      {contato && (
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
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              <Gift className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Saldo Giftback</p>
                <p className="text-xl font-bold text-primary">R$ {Number(contato.saldo_giftback).toFixed(2)}</p>
              </div>
            </div>
            {regrasAtuais && (
              <div className="text-xs text-muted-foreground border rounded-md p-2 space-y-0.5">
                <div>
                  <span className="font-medium text-foreground">Regra aplicada:</span>{" "}
                  {regrasAtuais.origem === "override"
                    ? `${nomeSegmentoResumo(regrasAtuais.segmentoAplicado)} (personalizada)`
                    : "Padrão (global)"}
                </div>
                <div>
                  {regrasAtuais.percentual}% de retorno · validade {regrasAtuais.validade_dias} dias · multiplicador {regrasAtuais.multiplicador_compra_minima}×
                </div>
                {compraMinimaAtual > 0 ? (
                  <div>
                    Para gerar novo giftback, compra precisa ser ≥{" "}
                    <strong>R$ {compraMinimaAtual.toFixed(2)}</strong> (saldo R$ {Number(contato.saldo_giftback).toFixed(2)} ×{" "}
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
            {/* Bloqueio quando regras estão inválidas */}
            {!regrasOk && (
              <div
                className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
                aria-live="polite"
                data-testid="regras-invalidas-alert"
              >
                <p className="font-medium">Não é possível registrar a compra:</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {regrasInvalidas.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">
                  Ajuste a configuração em <strong>Giftback → Configuração</strong> antes de continuar.
                </p>
              </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); registrarMutation.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Valor da Compra (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valorCompra}
                  onChange={(e) => setValorCompra(e.target.value)}
                  required
                  disabled={!regrasOk}
                />
                {valorCompraNum > 0 && compraMinimaAtual > 0 && valorCompraNum < compraMinimaAtual && (
                  <div
                    className="rounded-md border border-warning/50 bg-warning/10 p-2 text-xs text-warning-foreground space-y-1"
                    role="status"
                    data-testid="aviso-abaixo-minimo"
                  >
                    <p className="font-medium">
                      ⚠️ Compra abaixo do mínimo para gerar giftback
                    </p>
                    <p>
                      Faltam <strong>R$ {(compraMinimaAtual - valorCompraNum).toFixed(2)}</strong> para
                      atingir o mínimo de <strong>R$ {compraMinimaAtual.toFixed(2)}</strong>
                      {regrasAtuais && regrasAtuais.multiplicador_compra_minima > 0 && (
                        <> ({regrasAtuais.multiplicador_compra_minima}× o saldo atual de R$ {Number(contato.saldo_giftback).toFixed(2)})</>
                      )}.
                    </p>
                    <p>
                      Efeito: <strong>nenhum giftback novo será gerado</strong> nesta compra
                      {regrasAtuais && (
                        <>
                          {" "}(deixaria de creditar R$ {(valorCompraNum * (regrasAtuais.percentual / 100)).toFixed(2)} ao saldo)
                        </>
                      )}.
                      {aplicarGiftback && (
                        <> O resgate continua permitido até R$ {maxResgate.toFixed(2)}.</>
                      )}
                    </p>
                  </div>
                )}
              </div>
              {contato.saldo_giftback > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={aplicarGiftback}
                      onCheckedChange={setAplicarGiftback}
                      disabled={!regrasOk}
                    />
                    <Label>Aplicar giftback?</Label>
                  </div>
                  {aplicarGiftback && (
                    <div className="space-y-2">
                      <Label>
                        Valor a utilizar (máx: R$ {maxResgate.toFixed(2)})
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max={maxResgate}
                        value={valorGiftback}
                        onChange={(e) => setValorGiftback(e.target.value)}
                        disabled={!regrasOk}
                      />
                    </div>
                  )}
                </>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={registrarMutation.isPending || !regrasOk}
              >
                {registrarMutation.isPending ? "Registrando..." : "Confirmar Compra"}
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
            <div className="flex justify-between"><span>Valor da compra</span><span className="font-medium">R$ {resumo.valorCompra.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Giftback utilizado</span><span className="font-medium text-destructive">- R$ {resumo.giftbackUsado.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Giftback gerado</span><span className="font-medium text-primary">+ R$ {resumo.giftbackGerado.toFixed(2)}</span></div>
            <hr />
            <div className="flex justify-between font-bold"><span>Novo saldo</span><span>R$ {resumo.novoSaldo.toFixed(2)}</span></div>

            {/* Bloco de auditoria — regras aplicadas */}
            <div
              className="rounded-md border bg-muted/40 p-3 mt-2 space-y-1 text-xs"
              data-testid="auditoria-regras"
            >
              <p className="font-medium text-foreground">Regras aplicadas (auditoria)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <span>Origem</span>
                <span className="text-right text-foreground">
                  {resumo.origem === "override" ? "Override por RFV" : "Configuração global"}
                </span>

                <span>Segmento</span>
                <span className="text-right text-foreground">
                  {nomeSegmentoResumo(resumo.segmentoAplicado)}
                </span>

                <span>Percentual de retorno</span>
                <span className="text-right text-foreground">{resumo.percentualAplicado}%</span>

                <span>Validade do crédito</span>
                <span className="text-right text-foreground">{resumo.validadeDiasAplicada} dias</span>

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

            <Button variant="outline" className="w-full mt-2" onClick={() => { setResumo(null); setContato(null); setBusca(""); }}>
              Nova Operação
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
