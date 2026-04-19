import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Download } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import RfvBadge from "./RfvBadge";
import { getSegmentoBySoma, SEGMENTOS_ORDENADOS, type SegmentoKey } from "@/lib/rfv-segments";

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

type ContatoRfv = {
  id: string;
  nome: string;
  telefone: string | null;
  saldo_giftback: number | null;
  rfv_recencia: number | null;
  rfv_frequencia: number | null;
  rfv_valor: number | null;
  rfv_soma: number | null;
  rfv_calculado_em: string | null;
};

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const escape = (val: string | number) => {
    const s = String(val ?? "");
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = rows.map((r) => r.map(escape).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function RfvTab() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtroR, setFiltroR] = useState<string>("todos");
  const [filtroF, setFiltroF] = useState<string>("todos");
  const [filtroV, setFiltroV] = useState<string>("todos");
  const [filtroSeg, setFiltroSeg] = useState<string>("todos");
  const [exportando, setExportando] = useState(false);

  // Tabela exibida (limitada para performance)
  const { data: contatos, isLoading } = useQuery({
    queryKey: ["rfv-contatos", filtroR, filtroF, filtroV],
    queryFn: async () => {
      let q = supabase
        .from("contatos")
        .select("id, nome, telefone, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor, rfv_soma, rfv_calculado_em")
        .order("rfv_soma", { ascending: false, nullsFirst: false })
        .limit(200);
      if (filtroR !== "todos") q = q.eq("rfv_recencia", parseInt(filtroR));
      if (filtroF !== "todos") q = q.eq("rfv_frequencia", parseInt(filtroF));
      if (filtroV !== "todos") q = q.eq("rfv_valor", parseInt(filtroV));
      const { data, error } = await q;
      if (error) throw error;
      return data as ContatoRfv[];
    },
    enabled: !!profile?.tenant_id,
  });

  // Distribuição por segmento — busca leve apenas das notas
  const { data: distribuicao } = useQuery({
    queryKey: ["rfv-distribuicao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatos")
        .select("rfv_recencia, rfv_frequencia, rfv_valor")
        .limit(10000);
      if (error) throw error;
      const counts = new Map<SegmentoKey, number>();
      for (const c of data || []) {
        const seg = getSegmentoBySoma(c.rfv_recencia, c.rfv_frequencia, c.rfv_valor);
        counts.set(seg.key, (counts.get(seg.key) || 0) + 1);
      }
      return SEGMENTOS_ORDENADOS.map((s) => ({
        key: s.key,
        nome: s.nome,
        cor: s.cor,
        valor: counts.get(s.key) || 0,
      })).filter((s) => s.valor > 0);
    },
    enabled: !!profile?.tenant_id,
  });

  const totalDistribuicao = distribuicao?.reduce((a, b) => a + b.valor, 0) || 0;

  const contatosFiltrados = useMemo(() => {
    if (!contatos) return [];
    if (filtroSeg === "todos") return contatos;
    return contatos.filter((c) => getSegmentoBySoma(c.rfv_recencia, c.rfv_frequencia, c.rfv_valor).key === filtroSeg);
  }, [contatos, filtroSeg]);

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
      queryClient.invalidateQueries({ queryKey: ["rfv-distribuicao"] });
      queryClient.invalidateQueries({ queryKey: ["contatos"] });
      toast({ title: "RFV recalculado!", description: "Todos os contatos foram atualizados." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao recalcular", description: err.message, variant: "destructive" });
    },
  });

  async function handleExportCSV() {
    setExportando(true);
    try {
      // Busca tudo respeitando filtros R/F/V (sem limit)
      let q = supabase
        .from("contatos")
        .select("nome, telefone, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor, rfv_soma")
        .order("rfv_soma", { ascending: false, nullsFirst: false });
      if (filtroR !== "todos") q = q.eq("rfv_recencia", parseInt(filtroR));
      if (filtroF !== "todos") q = q.eq("rfv_frequencia", parseInt(filtroF));
      if (filtroV !== "todos") q = q.eq("rfv_valor", parseInt(filtroV));
      const { data, error } = await q;
      if (error) throw error;

      let lista = (data || []) as Omit<ContatoRfv, "id" | "rfv_calculado_em">[];
      if (filtroSeg !== "todos") {
        lista = lista.filter((c) => getSegmentoBySoma(c.rfv_recencia, c.rfv_frequencia, c.rfv_valor).key === filtroSeg);
      }

      const rows: (string | number)[][] = [
        ["Nome", "Telefone", "R", "F", "V", "Soma", "Segmento", "Saldo Giftback"],
        ...lista.map((c) => {
          const seg = getSegmentoBySoma(c.rfv_recencia, c.rfv_frequencia, c.rfv_valor);
          return [
            c.nome || "",
            c.telefone || "",
            c.rfv_recencia ?? "",
            c.rfv_frequencia ?? "",
            c.rfv_valor ?? "",
            c.rfv_soma ?? "",
            seg.nome,
            Number(c.saldo_giftback || 0).toFixed(2).replace(".", ","),
          ];
        }),
      ];

      const ts = new Date().toISOString().slice(0, 10);
      downloadCSV(`rfv-contatos-${ts}.csv`, rows);
      toast({ title: "Exportado!", description: `${lista.length} contatos exportados.` });
    } catch (err: any) {
      toast({ title: "Erro ao exportar", description: err.message, variant: "destructive" });
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Critérios de RFV</CardTitle>
          <CardDescription>
            Classificação dos clientes por Recência (R), Frequência (F) e Valor (V) com base nas compras dos últimos 12 meses.
            Cada cliente recebe uma nota de 1 a 5 em cada dimensão. O segmento é definido pela <strong>soma R+F+V</strong> (de 3 a 15).
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
          <CardTitle>Distribuição por Segmento</CardTitle>
          <CardDescription>Quantidade de clientes em cada segmento, baseado na soma R+F+V.</CardDescription>
        </CardHeader>
        <CardContent>
          {!distribuicao || totalDistribuicao === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nenhum contato com RFV calculado ainda. Clique em "Atualizar agora" abaixo.
            </div>
          ) : (
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 items-center">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribuicao}
                      dataKey="valor"
                      nameKey="nome"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={45}
                      paddingAngle={2}
                    >
                      {distribuicao.map((s) => (
                        <Cell key={s.key} fill={s.cor} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value} (${((value / totalDistribuicao) * 100).toFixed(1)}%)`, name]}
                      contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {distribuicao.map((s) => {
                  const pct = ((s.valor / totalDistribuicao) * 100).toFixed(1);
                  return (
                    <button
                      key={s.key}
                      onClick={() => setFiltroSeg(filtroSeg === s.key ? "todos" : s.key)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border transition hover:bg-accent ${filtroSeg === s.key ? "bg-accent border-primary" : "border-border"}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: s.cor }} />
                        <span className="text-sm font-medium truncate">{s.nome}</span>
                      </div>
                      <div className="text-sm tabular-nums text-muted-foreground shrink-0">
                        {s.valor} <span className="text-xs">({pct}%)</span>
                      </div>
                    </button>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-1">Clique num segmento para filtrar a tabela abaixo.</p>
              </div>
            </div>
          )}
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
            <div className="flex gap-2">
              <Button onClick={handleExportCSV} disabled={exportando} size="sm" variant="outline">
                <Download className={`h-4 w-4 mr-1 ${exportando ? "animate-pulse" : ""}`} />
                {exportando ? "Exportando..." : "Exportar CSV"}
              </Button>
              <Button onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isPending} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
                {recalcMutation.isPending ? "Calculando..." : "Atualizar agora"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Segmento</label>
              <Select value={filtroSeg} onValueChange={setFiltroSeg}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {SEGMENTOS_ORDENADOS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                <TableHead>RFV / Segmento</TableHead>
                <TableHead className="text-center">Soma</TableHead>
                <TableHead className="text-right">Saldo GB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !contatosFiltrados?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum contato encontrado com os filtros selecionados.
                  </TableCell>
                </TableRow>
              ) : (
                contatosFiltrados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{c.telefone || "—"}</TableCell>
                    <TableCell><RfvBadge r={c.rfv_recencia} f={c.rfv_frequencia} v={c.rfv_valor} /></TableCell>
                    <TableCell className="text-center font-mono text-sm">{c.rfv_soma ?? "—"}</TableCell>
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
