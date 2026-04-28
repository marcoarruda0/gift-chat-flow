import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Smile, TrendingUp, AlertTriangle, MessageSquare, Clock } from "lucide-react";

const CLASSIF_LABELS: Record<string, string> = {
  muito_insatisfeito: "Muito Insatisfeito",
  insatisfeito: "Insatisfeito",
  neutro: "Neutro",
  satisfeito: "Satisfeito",
  muito_satisfeito: "Muito Satisfeito",
};

const CLASSIF_COLORS: Record<string, string> = {
  muito_insatisfeito: "hsl(0 75% 55%)",
  insatisfeito: "hsl(20 80% 55%)",
  neutro: "hsl(45 80% 55%)",
  satisfeito: "hsl(140 50% 50%)",
  muito_satisfeito: "hsl(160 60% 40%)",
};

function defaultInicio(): string {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultFim(): string { return new Date().toISOString().slice(0, 10); }

function fmtSeg(seg: number | null | undefined): string {
  if (!seg && seg !== 0) return "—";
  if (seg < 60) return `${Math.round(seg)}s`;
  if (seg < 3600) return `${Math.round(seg / 60)}m`;
  return `${Math.floor(seg / 3600)}h ${Math.round((seg % 3600) / 60)}m`;
}

interface Props { embedded?: boolean }

export default function RelatorioSatisfacao({ embedded = false }: Props) {
  const { hasRole, profile, loading: authLoading } = useAuth();
  const isAdmin = hasRole("admin_tenant") || hasRole("admin_master");

  const [inicio, setInicio] = useState(defaultInicio());
  const [fim, setFim] = useState(defaultFim());
  const [atendenteId, setAtendenteId] = useState<string>("todos");
  const [canal, setCanal] = useState<string>("todos");

  const { data: atendentes } = useQuery({
    queryKey: ["atendentes-sat", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("tenant_id", profile!.tenant_id)
        .order("nome");
      return data || [];
    },
  });

  const { data: relatorio, isLoading } = useQuery({
    queryKey: ["rel-satisfacao", inicio, fim, atendenteId, canal],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const inicioISO = new Date(inicio + "T00:00:00").toISOString();
      const fimISO = new Date(fim + "T23:59:59").toISOString();
      const { data, error } = await supabase.rpc("relatorio_satisfacao", {
        p_inicio: inicioISO,
        p_fim: fimISO,
        p_atendente_id: atendenteId === "todos" ? null : atendenteId,
        p_departamento_id: null,
        p_canal: canal === "todos" ? null : canal,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const dist = useMemo(() => {
    const arr = (relatorio?.distribuicao || []) as Array<{ classificacao: string; total: number }>;
    return arr.map((d) => ({
      ...d,
      label: CLASSIF_LABELS[d.classificacao] || d.classificacao,
      color: CLASSIF_COLORS[d.classificacao] || "hsl(var(--primary))",
    }));
  }, [relatorio]);

  const evolucao = (relatorio?.evolucao || []) as Array<{ dia: string; score: number; total: number }>;
  const ranking = (relatorio?.ranking_atendentes || []) as Array<{ nome: string; score: number; total: number }>;
  const pontosNeg = (relatorio?.pontos_negativos_top || []) as Array<{ ponto: string; total: number }>;
  const recentes = (relatorio?.recentes || []) as any[];

  if (!embedded && authLoading) return null;
  if (!embedded && !isAdmin) return <Navigate to="/" replace />;

  const total = relatorio?.total || 0;
  const concluidos = relatorio?.concluidos || 0;
  const ignorados = relatorio?.ignorados || 0;
  const erros = relatorio?.erros || 0;
  const scoreMedio = Number(relatorio?.score_medio || 0);
  const scoreAnt = Number(relatorio?.score_medio_anterior || 0);
  const variacao = scoreAnt > 0 ? ((scoreMedio - scoreAnt) / scoreAnt) * 100 : 0;
  const tempoMedioResp = relatorio?.tempo_medio_primeira_resp_segundos || 0;

  const totalPosNeg = dist.reduce((acc, d) => {
    if (["satisfeito", "muito_satisfeito"].includes(d.classificacao)) acc.pos += d.total;
    else if (["insatisfeito", "muito_insatisfeito"].includes(d.classificacao)) acc.neg += d.total;
    else acc.neu += d.total;
    return acc;
  }, { pos: 0, neg: 0, neu: 0 });

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smile className="h-6 w-6" /> Relatório de Satisfação
          </h1>
          <p className="text-muted-foreground">Avaliação automática dos atendimentos de WhatsApp</p>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Atendente</Label>
              <Select value={atendenteId} onValueChange={setAtendenteId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(atendentes || []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="zapi">WhatsApp Z-API</SelectItem>
                  <SelectItem value="whatsapp_cloud">WhatsApp Cloud (oficial)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Score Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{scoreMedio.toFixed(2)} <span className="text-sm text-muted-foreground">/ 5</span></div>
                {scoreAnt > 0 && (
                  <p className={`text-xs ${variacao >= 0 ? "text-green-600" : "text-destructive"}`}>
                    {variacao >= 0 ? "▲" : "▼"} {Math.abs(variacao).toFixed(1)}% vs período anterior
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Distribuição</CardTitle>
            <Smile className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : concluidos === 0 ? (
              <div className="text-sm text-muted-foreground">Sem dados</div>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="text-green-600">😊 {Math.round((totalPosNeg.pos / concluidos) * 100)}% positivos</div>
                <div className="text-yellow-600">😐 {Math.round((totalPosNeg.neu / concluidos) * 100)}% neutros</div>
                <div className="text-destructive">😞 {Math.round((totalPosNeg.neg / concluidos) * 100)}% negativos</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Atendimentos</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-2xl font-bold">{concluidos}</div>
                <p className="text-xs text-muted-foreground">
                  {total} total · {ignorados} ignorados · {erros} erros
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo 1ª Resposta</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{fmtSeg(tempoMedioResp)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Classificação</CardTitle></CardHeader>
          <CardContent>
            {dist.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={dist} dataKey="total" nameKey="label" innerRadius={50} outerRadius={90} label>
                    {dist.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Evolução do Score</CardTitle></CardHeader>
          <CardContent>
            {evolucao.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={evolucao}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" />
                  <YAxis domain={[1, 5]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ranking de Atendentes</CardTitle></CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ranking} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 5]} />
                  <YAxis type="category" dataKey="nome" width={100} />
                  <Tooltip />
                  <Bar dataKey="score" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Pontos Negativos Frequentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pontosNeg.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum ponto negativo identificado.</p>
            ) : (
              <ul className="space-y-2">
                {pontosNeg.map((p, i) => (
                  <li key={i} className="flex items-center justify-between text-sm border-b pb-1">
                    <span className="truncate">{p.ponto}</span>
                    <Badge variant="secondary">{p.total}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader><CardTitle className="text-base">Atendimentos Avaliados</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : recentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem avaliações no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Atendente</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Classificação</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>1ª Resp.</TableHead>
                    <TableHead>Justificativa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentes.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell className="text-sm">{r.contato_nome || "—"}</TableCell>
                      <TableCell className="text-sm">{r.atendente_nome || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.canal === "zapi" ? "Z-API" : r.canal === "whatsapp_cloud" ? "Cloud" : r.canal}
                      </TableCell>
                      <TableCell>
                        {r.classificacao ? (
                          <Badge style={{ backgroundColor: CLASSIF_COLORS[r.classificacao], color: "white" }}>
                            {CLASSIF_LABELS[r.classificacao]}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{r.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">{r.score ?? "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtSeg(r.primeiro_resp_segundos)}</TableCell>
                      <TableCell className="text-xs max-w-md truncate" title={r.justificativa || ""}>
                        {r.justificativa || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
