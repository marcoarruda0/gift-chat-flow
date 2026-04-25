import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  Gift,
  ShoppingCart,
  Receipt,
  Percent,
  Repeat,
} from "lucide-react";
import {
  formatBRL,
  formatNumber,
  formatMesLabel,
  GENERO_LABELS,
  GENERO_COLORS,
  type RelatorioGiftbackData,
} from "@/lib/giftback-relatorio";

function MetricCard({
  title,
  value,
  icon: Icon,
  loading,
  hint,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  loading?: boolean;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {hint && (
              <p className="text-xs text-muted-foreground mt-1">{hint}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function RelatorioGiftback() {
  const { profile, hasRole, loading: authLoading } = useAuth();
  const tenantId = profile?.tenant_id;
  const isAdmin = hasRole("admin_tenant") || hasRole("admin_master");

  const [periodo, setPeriodo] = useState<"7" | "30" | "90" | "365" | "custom">(
    "30",
  );
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [atendenteFiltro, setAtendenteFiltro] = useState<string>("todos");

  const { data: atendentes } = useQuery({
    queryKey: ["relatorio-gb-atendentes", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("tenant_id", tenantId!);
      return data || [];
    },
    enabled: !!tenantId && isAdmin,
  });

  const { inicio, fim } = useMemo(() => {
    if (periodo === "custom" && dataInicio && dataFim) {
      const i = new Date(dataInicio);
      i.setHours(0, 0, 0, 0);
      const f = new Date(dataFim);
      f.setHours(23, 59, 59, 999);
      return { inicio: i.toISOString(), fim: f.toISOString() };
    }
    const dias = parseInt(periodo === "custom" ? "30" : periodo, 10);
    const i = new Date();
    i.setHours(0, 0, 0, 0);
    i.setDate(i.getDate() - dias);
    const f = new Date();
    f.setHours(23, 59, 59, 999);
    return { inicio: i.toISOString(), fim: f.toISOString() };
  }, [periodo, dataInicio, dataFim]);

  const atendenteParam =
    atendenteFiltro === "todos" ? null : atendenteFiltro;

  const { data, isLoading } = useQuery({
    queryKey: ["relatorio-giftback", tenantId, inicio, fim, atendenteParam],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("relatorio_giftback", {
        p_inicio: inicio,
        p_fim: fim,
        p_atendente_id: atendenteParam,
      });
      if (error) throw error;
      return data as unknown as RelatorioGiftbackData;
    },
    enabled: !!tenantId && isAdmin,
  });

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const faturamentoChartData =
    data?.faturamento_mensal?.map((m) => ({
      mes: formatMesLabel(m.mes),
      Faturamento: Number(m.valor) || 0,
    })) || [];

  const generoChartData =
    data?.compras_por_genero?.map((g) => ({
      name: GENERO_LABELS[g.genero] || g.genero,
      value: Number(g.total) || 0,
      color: GENERO_COLORS[g.genero] || "hsl(220 9% 46%)",
    })) || [];

  const totalGenero = generoChartData.reduce((s, g) => s + g.value, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios — Giftback</h1>
          <p className="text-sm text-muted-foreground">
            Visão de gestão das vendas e do impacto do CRM Connect.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Período</Label>
              <Select
                value={periodo}
                onValueChange={(v) => setPeriodo(v as typeof periodo)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="365">Últimos 12 meses</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {periodo === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>De</Label>
                  <Input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Até</Label>
                  <Input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Atendente</Label>
              <Select
                value={atendenteFiltro}
                onValueChange={setAtendenteFiltro}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(atendentes || []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome || "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Receita total"
          value={formatBRL(data?.receita_total ?? 0)}
          icon={DollarSign}
          loading={isLoading}
        />
        <MetricCard
          title="Receita influenciada CRM Connect"
          value={formatBRL(data?.receita_influenciada ?? 0)}
          icon={TrendingUp}
          loading={isLoading}
          hint="Vendas de clientes contatados nos 30 dias anteriores"
        />
        <MetricCard
          title="Receita gerada com Giftback"
          value={formatBRL(data?.receita_giftback ?? 0)}
          icon={Gift}
          loading={isLoading}
          hint="Vendas que envolveram giftback (uso ou geração)"
        />
        <MetricCard
          title="Número de vendas"
          value={String(data?.num_vendas ?? 0)}
          icon={ShoppingCart}
          loading={isLoading}
        />
        <MetricCard
          title="Ticket médio"
          value={formatBRL(data?.ticket_medio ?? 0)}
          icon={Receipt}
          loading={isLoading}
        />
        <MetricCard
          title="Percentual de retorno"
          value={`${formatNumber(data?.percentual_retorno ?? 0, 2)}%`}
          icon={Percent}
          loading={isLoading}
          hint="Giftback usado / receita total"
        />
        <MetricCard
          title="Frequência média por cliente"
          value={formatNumber(data?.frequencia_media ?? 0, 2)}
          icon={Repeat}
          loading={isLoading}
          hint={`${data?.clientes_unicos ?? 0} clientes únicos no período`}
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Faturamento por mês</CardTitle>
            <p className="text-sm text-muted-foreground">
              Últimos 12 meses (não afetado pelo filtro de período)
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={faturamentoChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number) => formatBRL(v)}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar
                    dataKey="Faturamento"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compras por gênero</CardTitle>
            <p className="text-sm text-muted-foreground">
              Distribuição das vendas no período selecionado
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : totalGenero === 0 ? (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                Sem vendas no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={generoChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {generoChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      `${v} venda${v === 1 ? "" : "s"}`,
                      name,
                    ]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
