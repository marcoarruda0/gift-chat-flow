import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Clock, Hourglass, CheckCircle2, PlayCircle } from "lucide-react";

function formatDuration(ms: number | null): string {
  if (ms === null || isNaN(ms) || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricCard({ title, value, icon: Icon, loading }: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}

export default function RelatorioAtendimento() {
  const { profile, hasRole, loading: authLoading } = useAuth();
  const tenantId = profile?.tenant_id;
  const isAdmin = hasRole("admin_tenant") || hasRole("admin_master");

  const [periodo, setPeriodo] = useState<"7" | "30" | "90">("30");
  const [atendenteFiltro, setAtendenteFiltro] = useState<string>("todos");

  const { data: atendentes } = useQuery({
    queryKey: ["relatorio-atendentes", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("tenant_id", tenantId!);
      return data || [];
    },
    enabled: !!tenantId && isAdmin,
  });

  const inicioPeriodo = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - parseInt(periodo, 10));
    return d.toISOString();
  }, [periodo]);

  const { data: conversas, isLoading } = useQuery({
    queryKey: ["relatorio-conversas", tenantId, periodo, atendenteFiltro],
    queryFn: async () => {
      let q = supabase
        .from("conversas")
        .select("id, contato_id, atendente_id, created_at, atendimento_iniciado_at, atendimento_encerrado_at, status, contatos(nome)")
        .gte("created_at", inicioPeriodo)
        .order("atendimento_encerrado_at", { ascending: false, nullsFirst: false })
        .limit(500);

      if (atendenteFiltro !== "todos") {
        q = q.eq("atendente_id", atendenteFiltro);
      }

      const { data } = await q;
      return data || [];
    },
    enabled: !!tenantId && isAdmin,
  });

  const atendentesMap = useMemo(() => {
    const m = new Map<string, string>();
    (atendentes || []).forEach((a: any) => m.set(a.id, a.nome || "—"));
    return m;
  }, [atendentes]);

  const metrics = useMemo(() => {
    const list = conversas || [];
    let somaAtendimento = 0;
    let countAtendimento = 0;
    let somaEspera = 0;
    let countEspera = 0;
    let finalizados = 0;
    let emAndamento = 0;
    const porAtendente = new Map<string, { soma: number; count: number }>();

    list.forEach((c: any) => {
      const ini = c.atendimento_iniciado_at ? new Date(c.atendimento_iniciado_at).getTime() : null;
      const fim = c.atendimento_encerrado_at ? new Date(c.atendimento_encerrado_at).getTime() : null;
      const created = c.created_at ? new Date(c.created_at).getTime() : null;

      if (ini && fim) {
        const dur = fim - ini;
        if (dur >= 0) {
          somaAtendimento += dur;
          countAtendimento++;
          finalizados++;
          if (c.atendente_id) {
            const cur = porAtendente.get(c.atendente_id) || { soma: 0, count: 0 };
            cur.soma += dur;
            cur.count++;
            porAtendente.set(c.atendente_id, cur);
          }
        }
      } else if (ini && !fim) {
        emAndamento++;
      }

      if (ini && created) {
        const esp = ini - created;
        if (esp >= 0) {
          somaEspera += esp;
          countEspera++;
        }
      }
    });

    const ranking = Array.from(porAtendente.entries())
      .map(([id, v]) => ({
        nome: atendentesMap.get(id) || "—",
        media: v.soma / v.count / 1000 / 60, // minutos
        atendimentos: v.count,
      }))
      .sort((a, b) => b.atendimentos - a.atendimentos)
      .slice(0, 10);

    return {
      tempoMedioAtendimento: countAtendimento > 0 ? somaAtendimento / countAtendimento : null,
      tempoMedioEspera: countEspera > 0 ? somaEspera / countEspera : null,
      finalizados,
      emAndamento,
      ranking,
    };
  }, [conversas, atendentesMap]);

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatório de Atendimento</h1>
        <p className="text-muted-foreground">Tempo médio, espera e desempenho por atendente</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as any)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>

        <Select value={atendenteFiltro} onValueChange={setAtendenteFiltro}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os atendentes</SelectItem>
            {(atendentes || []).map((a: any) => (
              <SelectItem key={a.id} value={a.id}>{a.nome || "—"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Tempo Médio Atendimento" value={formatDuration(metrics.tempoMedioAtendimento)} icon={Clock} loading={isLoading} />
        <MetricCard title="Tempo Médio Espera" value={formatDuration(metrics.tempoMedioEspera)} icon={Hourglass} loading={isLoading} />
        <MetricCard title="Finalizados" value={metrics.finalizados} icon={CheckCircle2} loading={isLoading} />
        <MetricCard title="Em Andamento" value={metrics.emAndamento} icon={PlayCircle} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tempo Médio por Atendente (top 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : metrics.ranking.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                Sem dados no período selecionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.ranking}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="nome" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    label={{ value: 'minutos', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(v: any) => [`${Number(v).toFixed(1)} min`, "Média"]}
                  />
                  <Bar dataKey="media" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalhamento</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Atendente</TableHead>
                  <TableHead>Iniciado</TableHead>
                  <TableHead>Encerrado</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Espera</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(conversas || []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum atendimento no período</TableCell></TableRow>
                )}
                {(conversas || []).map((c: any) => {
                  const ini = c.atendimento_iniciado_at ? new Date(c.atendimento_iniciado_at).getTime() : null;
                  const fim = c.atendimento_encerrado_at ? new Date(c.atendimento_encerrado_at).getTime() : null;
                  const created = c.created_at ? new Date(c.created_at).getTime() : null;
                  const dur = ini && fim ? fim - ini : null;
                  const esp = ini && created ? ini - created : null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.contatos?.nome || "—"}</TableCell>
                      <TableCell>{c.atendente_id ? atendentesMap.get(c.atendente_id) || "—" : "—"}</TableCell>
                      <TableCell>{formatDateTime(c.atendimento_iniciado_at)}</TableCell>
                      <TableCell>{formatDateTime(c.atendimento_encerrado_at)}</TableCell>
                      <TableCell>{formatDuration(dur)}</TableCell>
                      <TableCell>{formatDuration(esp)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
