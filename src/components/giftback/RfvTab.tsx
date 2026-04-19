import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import RfvBadge from "./RfvBadge";

const RECENCIA_ROWS = [
  { nota: 5, label: "Últimos 15 dias" },
  { nota: 4, label: "15 a 30 dias" },
  { nota: 3, label: "1 a 3 meses" },
  { nota: 2, label: "3 a 6 meses" },
  { nota: 1, label: "Mais de 6 meses" },
];

const FREQUENCIA_ROWS = [
  { nota: 5, label: "Mais de 4 compras" },
  { nota: 4, label: "4 compras" },
  { nota: 3, label: "3 compras" },
  { nota: 2, label: "2 compras" },
  { nota: 1, label: "1 compra" },
];

const VALOR_ROWS = [
  { nota: 5, label: "Acima de R$ 400" },
  { nota: 4, label: "R$ 300 a R$ 400" },
  { nota: 3, label: "R$ 200 a R$ 300" },
  { nota: 2, label: "R$ 100 a R$ 200" },
  { nota: 1, label: "Até R$ 100" },
];

function CriterioCard({ titulo, descricao, rows }: { titulo: string; descricao: string; rows: { nota: number; label: string }[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <CardDescription className="text-xs">{descricao}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Nota</TableHead>
              <TableHead>Critério</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.nota}>
                <TableCell className="font-bold">{r.nota}</TableCell>
                <TableCell className="text-sm">{r.label}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function RfvTab() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtroR, setFiltroR] = useState<string>("todos");
  const [filtroF, setFiltroF] = useState<string>("todos");
  const [filtroV, setFiltroV] = useState<string>("todos");

  const { data: contatos, isLoading } = useQuery({
    queryKey: ["rfv-contatos", filtroR, filtroF, filtroV],
    queryFn: async () => {
      let q = supabase
        .from("contatos")
        .select("id, nome, telefone, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor, rfv_calculado_em")
        .order("rfv_recencia", { ascending: false, nullsFirst: false })
        .order("rfv_frequencia", { ascending: false, nullsFirst: false })
        .order("rfv_valor", { ascending: false, nullsFirst: false })
        .limit(200);
      if (filtroR !== "todos") q = q.eq("rfv_recencia", parseInt(filtroR));
      if (filtroF !== "todos") q = q.eq("rfv_frequencia", parseInt(filtroF));
      if (filtroV !== "todos") q = q.eq("rfv_valor", parseInt(filtroV));
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  const ultimoCalculo = contatos?.reduce<string | null>((acc, c) => {
    if (!c.rfv_calculado_em) return acc;
    if (!acc || c.rfv_calculado_em > acc) return c.rfv_calculado_em;
    return acc;
  }, null);

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("calcular-rfv", {
        body: { tenant_id: profile!.tenant_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rfv-contatos"] });
      queryClient.invalidateQueries({ queryKey: ["contatos"] });
      toast({ title: "RFV recalculado!", description: "Todos os contatos foram atualizados." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao recalcular", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Critérios de RFV</CardTitle>
          <CardDescription>
            Classificação dos clientes por Recência (R), Frequência (F) e Valor (V) com base nas compras dos últimos 12 meses.
            Cada cliente recebe uma nota de 1 a 5 em cada dimensão. O cálculo é feito automaticamente todos os dias.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
            <CriterioCard titulo="Recência" descricao="Quando foi a última compra" rows={RECENCIA_ROWS} />
            <CriterioCard titulo="Frequência" descricao="Quantas compras nos últimos 12 meses" rows={FREQUENCIA_ROWS} />
            <CriterioCard titulo="Valor" descricao="Ticket médio nos últimos 12 meses" rows={VALOR_ROWS} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Clientes Ranqueados</CardTitle>
              <CardDescription>
                {ultimoCalculo
                  ? `Última atualização: ${new Date(ultimoCalculo).toLocaleString("pt-BR")}`
                  : "Ainda não calculado. Clique em Atualizar agora."}
              </CardDescription>
            </div>
            <Button onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isPending} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
              {recalcMutation.isPending ? "Calculando..." : "Atualizar agora"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Recência</label>
              <Select value={filtroR} onValueChange={setFiltroR}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={n.toString()}>R = {n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Frequência</label>
              <Select value={filtroF} onValueChange={setFiltroF}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={n.toString()}>F = {n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Valor</label>
              <Select value={filtroV} onValueChange={setFiltroV}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={n.toString()}>V = {n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                <TableHead>RFV</TableHead>
                <TableHead className="text-right">Saldo GB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !contatos?.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Nenhum contato encontrado com os filtros selecionados.
                  </TableCell>
                </TableRow>
              ) : (
                contatos.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{c.telefone || "—"}</TableCell>
                    <TableCell><RfvBadge r={c.rfv_recencia} f={c.rfv_frequencia} v={c.rfv_valor} /></TableCell>
                    <TableCell className="text-right">R$ {Number(c.saldo_giftback || 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
