import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

interface Contato {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  saldo_giftback: number;
}

interface Resumo {
  valorCompra: number;
  giftbackUsado: number;
  giftbackGerado: number;
  novoSaldo: number;
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

  const buscarContato = async () => {
    if (!busca.trim()) return;
    setBuscando(true);
    const { data } = await supabase
      .from("contatos")
      .select("id, nome, telefone, cpf, saldo_giftback")
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
      const valor = parseFloat(valorCompra);
      const gbUsado = aplicarGiftback ? Math.min(parseFloat(valorGiftback) || 0, contato!.saldo_giftback) : 0;

      // Get config
      const { data: config } = await supabase.from("giftback_config").select("*").single();
      const pct = config?.percentual || 10;
      const maxCredito = config?.credito_maximo || 9999;
      const validadeDias = config?.validade_dias || 30;

      const gbGerado = Math.min(valor * (pct / 100), maxCredito);

      // Insert compra
      const { data: compra, error: compraErr } = await supabase.from("compras").insert({
        tenant_id: profile!.tenant_id!,
        contato_id: contato!.id,
        valor,
        giftback_gerado: gbGerado,
        giftback_usado: gbUsado,
        operador_id: user!.id,
      }).select().single();
      if (compraErr) throw compraErr;

      // Insert credit movement
      if (gbGerado > 0) {
        const validade = new Date();
        validade.setDate(validade.getDate() + validadeDias);
        await supabase.from("giftback_movimentos").insert({
          tenant_id: profile!.tenant_id!,
          contato_id: contato!.id,
          compra_id: compra.id,
          tipo: "credito" as const,
          valor: gbGerado,
          validade: validade.toISOString().split("T")[0],
          status: "ativo" as const,
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

      return { valorCompra: valor, giftbackUsado: gbUsado, giftbackGerado: gbGerado, novoSaldo };
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
            <CardTitle className="text-lg">{contato.nome}</CardTitle>
            <CardDescription>
              {contato.cpf && `CPF: ${contato.cpf}`}
              {contato.telefone && ` • Tel: ${contato.telefone}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              <Gift className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Saldo Giftback</p>
                <p className="text-xl font-bold text-primary">R$ {Number(contato.saldo_giftback).toFixed(2)}</p>
              </div>
            </div>
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
            <form onSubmit={(e) => { e.preventDefault(); registrarMutation.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Valor da Compra (R$)</Label>
                <Input type="number" step="0.01" min="0.01" value={valorCompra} onChange={(e) => setValorCompra(e.target.value)} required />
              </div>
              {contato.saldo_giftback > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <Switch checked={aplicarGiftback} onCheckedChange={setAplicarGiftback} />
                    <Label>Aplicar giftback?</Label>
                  </div>
                  {aplicarGiftback && (
                    <div className="space-y-2">
                      <Label>Valor a utilizar (máx: R$ {Number(contato.saldo_giftback).toFixed(2)})</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max={contato.saldo_giftback}
                        value={valorGiftback}
                        onChange={(e) => setValorGiftback(e.target.value)}
                      />
                    </div>
                  )}
                </>
              )}
              <Button type="submit" className="w-full" disabled={registrarMutation.isPending}>
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
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Valor da compra</span><span className="font-medium">R$ {resumo.valorCompra.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Giftback utilizado</span><span className="font-medium text-destructive">- R$ {resumo.giftbackUsado.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Giftback gerado</span><span className="font-medium text-primary">+ R$ {resumo.giftbackGerado.toFixed(2)}</span></div>
            <hr />
            <div className="flex justify-between font-bold"><span>Novo saldo</span><span>R$ {resumo.novoSaldo.toFixed(2)}</span></div>
            <Button variant="outline" className="w-full mt-4" onClick={() => { setResumo(null); setContato(null); setBusca(""); }}>
              Nova Operação
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
