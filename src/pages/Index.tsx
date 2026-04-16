import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Send, Gift } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

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
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const { data: totalContatos, isLoading: loadingContatos } = useQuery({
    queryKey: ["dashboard-contatos", tenantId],
    queryFn: async () => {
      const { count } = await supabase
        .from("contatos")
        .select("*", { count: "exact", head: true });
      return count || 0;
    },
    enabled: !!tenantId,
  });

  const { data: conversasAtivas, isLoading: loadingConversas } = useQuery({
    queryKey: ["dashboard-conversas-ativas", tenantId],
    queryFn: async () => {
      const { count } = await supabase
        .from("conversas")
        .select("*", { count: "exact", head: true })
        .eq("status", "aberta");
      return count || 0;
    },
    enabled: !!tenantId,
  });

  const { data: mensagensMes, isLoading: loadingMensagensMes } = useQuery({
    queryKey: ["dashboard-mensagens-mes", tenantId],
    queryFn: async () => {
      const inicio = new Date();
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("mensagens")
        .select("*", { count: "exact", head: true })
        .gte("created_at", inicio.toISOString());
      return count || 0;
    },
    enabled: !!tenantId,
  });

  const { data: giftbackEmitido, isLoading: loadingGiftback } = useQuery({
    queryKey: ["dashboard-giftback", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("giftback_movimentos")
        .select("valor")
        .eq("tipo", "credito");
      const total = (data || []).reduce((acc, r: any) => acc + Number(r.valor || 0), 0);
      return total;
    },
    enabled: !!tenantId,
  });

  const { data: chartData, isLoading: loadingChart } = useQuery({
    queryKey: ["dashboard-mensagens-30d", tenantId],
    queryFn: async () => {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      inicio.setDate(inicio.getDate() - 29);

      const { data } = await supabase
        .from("mensagens")
        .select("created_at")
        .gte("created_at", inicio.toISOString())
        .limit(50000);

      const counts = new Map<string, number>();
      (data || []).forEach((r: any) => {
        const key = formatDateKey(new Date(r.created_at));
        counts.set(key, (counts.get(key) || 0) + 1);
      });

      const series: { dia: string; mensagens: number }[] = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(inicio);
        d.setDate(inicio.getDate() + i);
        const key = formatDateKey(d);
        series.push({
          dia: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
          mensagens: counts.get(key) || 0,
        });
      }
      return series;
    },
    enabled: !!tenantId,
  });

  const giftbackFormatted = (giftbackEmitido ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral da sua operação</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total de Contatos" value={totalContatos ?? 0} icon={Users} loading={loadingContatos} />
        <MetricCard title="Conversas Ativas" value={conversasAtivas ?? 0} icon={MessageSquare} loading={loadingConversas} />
        <MetricCard title="Mensagens (mês)" value={mensagensMes ?? 0} icon={Send} loading={loadingMensagensMes} />
        <MetricCard title="Giftback Emitido" value={giftbackFormatted} icon={Gift} loading={loadingGiftback} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mensagens por Dia (últimos 30 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {loadingChart ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="dia" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="mensagens" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
