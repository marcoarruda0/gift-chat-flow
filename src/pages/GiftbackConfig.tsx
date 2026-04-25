import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Settings, Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import RfvTab from "@/components/giftback/RfvTab";
import RegrasRfvConfig from "@/components/giftback/RegrasRfvConfig";

export default function GiftbackConfig() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [percentual, setPercentual] = useState("10");
  const [validadeDias, setValidadeDias] = useState("30");
  const [compraMinima, setCompraMinima] = useState("0");
  const [creditoMaximo, setCreditoMaximo] = useState("9999");
  const [maxResgatePct, setMaxResgatePct] = useState("100");

  const { data: config, isLoading } = useQuery({
    queryKey: ["giftback-config"],
    queryFn: async () => {
      const { data } = await supabase.from("giftback_config").select("*").single();
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  useEffect(() => {
    if (config) {
      setPercentual(config.percentual?.toString() || "10");
      setValidadeDias(config.validade_dias?.toString() || "30");
      setCompraMinima(config.compra_minima?.toString() || "0");
      setCreditoMaximo(config.credito_maximo?.toString() || "9999");
      setMaxResgatePct(config.max_resgate_pct?.toString() || "100");
    }
  }, [config]);

  const { data: movimentos, isLoading: movLoading } = useQuery({
    queryKey: ["giftback-movimentos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("giftback_movimentos")
        .select("*, contatos(nome)")
        .order("created_at", { ascending: false })
        .limit(50);
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tenant_id: profile!.tenant_id!,
        percentual: parseFloat(percentual),
        validade_dias: parseInt(validadeDias),
        compra_minima: parseFloat(compraMinima),
        credito_maximo: parseFloat(creditoMaximo),
        max_resgate_pct: parseFloat(maxResgatePct),
      };
      if (config?.id) {
        const { error } = await supabase.from("giftback_config").update(payload).eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("giftback_config").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["giftback-config"] });
      toast({ title: "Configuração salva!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const tipoLabel = (tipo: string) => {
    const map: Record<string, string> = { credito: "Crédito", debito: "Débito", expiracao: "Expiração" };
    return map[tipo] || tipo;
  };

  const tipoVariant = (tipo: string) => {
    if (tipo === "credito") return "default" as const;
    if (tipo === "debito") return "secondary" as const;
    return "destructive" as const;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Giftback</h1>
          <p className="text-muted-foreground">Configuração e relatórios do programa de fidelidade</p>
        </div>
        <Button asChild>
          <Link to="/giftback/caixa">
            <CreditCard className="h-4 w-4 mr-1" /> Painel do Caixa
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config"><Settings className="h-4 w-4 mr-1" /> Configuração</TabsTrigger>
          <TabsTrigger value="rfv"><Target className="h-4 w-4 mr-1" /> RFV</TabsTrigger>
          <TabsTrigger value="relatorio">Relatório</TabsTrigger>
        </TabsList>

        <TabsContent value="rfv" className="mt-4">
          <RfvTab />
        </TabsContent>

        <TabsContent value="config" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Parâmetros do Giftback</CardTitle>
              <CardDescription>Defina as regras do programa de fidelidade</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Percentual de Retorno (%)</Label>
                      <Input type="number" step="0.01" value={percentual} onChange={(e) => setPercentual(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Validade (dias)</Label>
                      <Input type="number" value={validadeDias} onChange={(e) => setValidadeDias(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Compra Mínima (R$)</Label>
                      <Input type="number" step="0.01" value={compraMinima} onChange={(e) => setCompraMinima(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Crédito Máximo por Transação (R$)</Label>
                      <Input type="number" step="0.01" value={creditoMaximo} onChange={(e) => setCreditoMaximo(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>% Máximo de Resgate por Compra</Label>
                      <Input type="number" step="0.01" value={maxResgatePct} onChange={(e) => setMaxResgatePct(e.target.value)} />
                    </div>
                  </div>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Salvando..." : "Salvar Configuração"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <RegrasRfvConfig configGlobal={config ?? null} />
        </TabsContent>

        <TabsContent value="relatorio" className="mt-4 space-y-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Emitido</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">R$ 0,00</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Resgatado</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">R$ 0,00</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Expirado</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">R$ 0,00</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Saldo em Circulação</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">R$ 0,00</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Movimentações</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : !movimentos?.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma movimentação registrada ainda.
                      </TableCell>
                    </TableRow>
                  ) : (
                    movimentos.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell>{new Date(m.created_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell>{m.contatos?.nome || "—"}</TableCell>
                        <TableCell><Badge variant={tipoVariant(m.tipo)}>{tipoLabel(m.tipo)}</Badge></TableCell>
                        <TableCell>R$ {Number(m.valor).toFixed(2)}</TableCell>
                        <TableCell><Badge variant="outline">{m.status}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
