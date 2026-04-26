import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  ArrowUp,
  ArrowDown,
  Minus,
  Sparkles,
  AlertCircle,
  Trophy,
  Crown,
  Users,
  CalendarDays,
} from "lucide-react";
import {
  formatBRL,
  formatNumber,
  formatMesLabel,
  GENERO_LABELS,
  GENERO_COLORS,
  calcularVariacaoPct,
  formatVariacaoPct,
  validarPeriodoCustom,
  type RelatorioGiftbackData,
  type VariacaoPct,
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

function VariacaoBadge({ v }: { v: VariacaoPct }) {
  const Icon =
    v.direcao === "up" ? ArrowUp : v.direcao === "down" ? ArrowDown : Minus;
  const cls =
    v.direcao === "up"
      ? "text-emerald-600 bg-emerald-500/10"
      : v.direcao === "down"
        ? "text-destructive bg-destructive/10"
        : v.direcao === "novo"
          ? "text-primary bg-primary/10"
          : "text-muted-foreground bg-muted";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {formatVariacaoPct(v)}
    </span>
  );
}

function ComparativoCard({
  title,
  atual,
  anterior,
  icon: Icon,
  loading,
}: {
  title: string;
  atual: number;
  anterior: number;
  icon: React.ElementType;
  loading?: boolean;
}) {
  const v = calcularVariacaoPct(atual, anterior);
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
          <Skeleton className="h-12 w-40" />
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-2xl font-bold">{formatBRL(atual)}</div>
              <VariacaoBadge v={v} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Período anterior: {formatBRL(anterior)}
            </p>
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

  const validacao = useMemo(() => {
    if (periodo !== "custom") return { ok: true as const };
    return validarPeriodoCustom(dataInicio, dataFim);
  }, [periodo, dataInicio, dataFim]);

  const { inicio, fim } = useMemo(() => {
    if (periodo === "custom") {
      if (!validacao.ok) return { inicio: null, fim: null };
      const i = new Date(dataInicio);
      i.setHours(0, 0, 0, 0);
      const f = new Date(dataFim);
      f.setHours(23, 59, 59, 999);
      return { inicio: i.toISOString(), fim: f.toISOString() };
    }
    const dias = parseInt(periodo, 10);
    const i = new Date();
    i.setHours(0, 0, 0, 0);
    i.setDate(i.getDate() - dias);
    const f = new Date();
    f.setHours(23, 59, 59, 999);
    return { inicio: i.toISOString(), fim: f.toISOString() };
  }, [periodo, dataInicio, dataFim, validacao]);

  const atendenteParam =
    atendenteFiltro === "todos" ? null : atendenteFiltro;

  const queryHabilitada = !!tenantId && isAdmin && !!inicio && !!fim;

  const { data, isLoading } = useQuery({
    queryKey: ["relatorio-giftback", tenantId, inicio, fim, atendenteParam],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("relatorio_giftback", {
        p_inicio: inicio!,
        p_fim: fim!,
        p_atendente_id: atendenteParam,
      });
      if (error) throw error;
      return data as unknown as RelatorioGiftbackData;
    },
    enabled: queryHabilitada,
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

  const comp = data?.comparativo;
  const top = data?.top_atendente;
  const ticketGenero = data?.ticket_por_genero || [];
  const rankingMeses = data?.ranking_meses_periodo || [];

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

          {periodo === "custom" && !validacao.ok && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Período inválido</AlertTitle>
              <AlertDescription>{validacao.erro}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Variação vs período anterior */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Variação vs período anterior
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ComparativoCard
            title="Receita total"
            atual={Number(data?.receita_total ?? 0)}
            anterior={Number(comp?.receita_total_anterior ?? 0)}
            icon={DollarSign}
            loading={isLoading}
          />
          <ComparativoCard
            title="Receita influenciada"
            atual={Number(data?.receita_influenciada ?? 0)}
            anterior={Number(comp?.receita_influenciada_anterior ?? 0)}
            icon={TrendingUp}
            loading={isLoading}
          />
          <ComparativoCard
            title="Receita com Giftback"
            atual={Number(data?.receita_giftback ?? 0)}
            anterior={Number(comp?.receita_giftback_anterior ?? 0)}
            icon={Gift}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Resumo executivo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Resumo executivo
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Destaques do período selecionado
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Top atendente */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Crown className="h-4 w-4" />
                  Top atendente
                </div>
                {top ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center">
                        {(top.nome || "?").trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="font-semibold truncate">{top.nome}</div>
                    </div>
                    <div className="text-lg font-bold">
                      {formatBRL(top.receita)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {top.num_vendas} venda{top.num_vendas === 1 ? "" : "s"}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem dados no período
                  </p>
                )}
              </div>

              {/* Ticket médio por gênero */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Ticket médio por gênero
                </div>
                {ticketGenero.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sem dados no período
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {ticketGenero.map((tg) => (
                      <li
                        key={tg.genero}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                GENERO_COLORS[tg.genero] ||
                                "hsl(220 9% 46%)",
                            }}
                          />
                          <span className="text-sm truncate">
                            {GENERO_LABELS[tg.genero] || tg.genero}
                          </span>
                        </div>
                        <div className="text-sm font-semibold">
                          {formatBRL(tg.ticket_medio)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Ranking de meses */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Trophy className="h-4 w-4" />
                  Ranking de meses (período)
                </div>
                {rankingMeses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sem dados no período
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {rankingMeses.map((m, idx) => (
                      <li
                        key={m.mes}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-6 w-6 rounded-full bg-muted text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-sm capitalize truncate flex items-center gap-1">
                            <CalendarDays className="h-3 w-3 text-muted-foreground" />
                            {formatMesLabel(m.mes)}
                          </span>
                        </div>
                        <div className="text-sm font-semibold">
                          {formatBRL(m.valor)}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
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
