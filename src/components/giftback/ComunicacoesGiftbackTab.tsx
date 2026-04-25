import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Plus, Pencil, Trash2, FileDown, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { RegraComunicacaoDialog } from "./RegraComunicacaoDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  exportarLogsCSV,
  exportarLogsPDF,
  type LogExport,
} from "@/lib/giftback-comunicacao-export";

const GATILHO_LABELS: Record<string, string> = {
  criado: "Giftback criado",
  vencendo: "Saldo vencendo",
  expirado: "Giftback expirado",
};

const STATUS_OPTS = ["enviado", "falha", "sem_telefone"];

function isoNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export default function ComunicacoesGiftbackTab() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRegra, setEditingRegra] = useState<any>(null);

  const [horario, setHorario] = useState("09:00");
  const [ativo, setAtivo] = useState(true);

  // Filtros do histórico
  const [filtroRegra, setFiltroRegra] = useState<string>("__todas__");
  const [filtroGatilho, setFiltroGatilho] = useState<string>("__todos__");
  const [filtroStatus, setFiltroStatus] = useState<string>("__todos__");
  const [periodoInicio, setPeriodoInicio] = useState<string>(isoNDaysAgo(30));
  const [periodoFim, setPeriodoFim] = useState<string>(new Date().toISOString().split("T")[0]);

  // Config Cloud
  const { data: cloudCfg } = useQuery({
    queryKey: ["wa-cloud-cfg"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_cloud_config")
        .select("phone_number_id, status")
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  // Config geral
  const { data: cfg, isLoading: cfgLoading } = useQuery({
    queryKey: ["gb-com-config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("giftback_comunicacao_config")
        .select("*")
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  // Tenant nome (para PDF)
  const { data: tenantRow } = useQuery({
    queryKey: ["tenant-nome", profile?.tenant_id],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("nome").maybeSingle();
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  useEffect(() => {
    if (cfg) {
      setHorario(String(cfg.horario_envio).slice(0, 5));
      setAtivo(cfg.ativo);
    }
  }, [cfg]);

  // Regras
  const { data: regras, isLoading: regrasLoading } = useQuery({
    queryKey: ["gb-com-regras"],
    queryFn: async () => {
      const { data } = await supabase
        .from("giftback_comunicacao_regras")
        .select("*")
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!profile?.tenant_id,
  });

  // Logs filtrados (com join para regra/contato via FK)
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: [
      "gb-com-logs",
      filtroRegra, filtroGatilho, filtroStatus, periodoInicio, periodoFim,
    ],
    queryFn: async () => {
      let q = supabase
        .from("giftback_comunicacao_log")
        .select(`
          id, status, enviado_em, erro, regra_id, contato_id, wa_message_id, is_teste,
          regra:giftback_comunicacao_regras(nome, tipo_gatilho),
          contato:contatos(nome, telefone)
        `)
        .order("enviado_em", { ascending: false })
        .limit(5000);

      if (filtroRegra !== "__todas__") q = q.eq("regra_id", filtroRegra);
      if (filtroStatus !== "__todos__") q = q.eq("status", filtroStatus);
      if (periodoInicio) q = q.gte("enviado_em", `${periodoInicio}T00:00:00.000Z`);
      if (periodoFim) q = q.lte("enviado_em", `${periodoFim}T23:59:59.999Z`);

      const { data } = await q;
      let result = data || [];

      // Filtro por gatilho aplica via regra embutida
      if (filtroGatilho !== "__todos__") {
        result = result.filter((l: any) => l.regra?.tipo_gatilho === filtroGatilho);
      }
      return result;
    },
    enabled: !!profile?.tenant_id,
  });

  const logsExportaveis: LogExport[] = useMemo(
    () =>
      (logs || []).map((l: any) => ({
        enviado_em: l.enviado_em,
        status: l.status,
        erro: l.erro,
        wa_message_id: l.wa_message_id,
        is_teste: l.is_teste,
        regra_nome: l.regra?.nome || "—",
        regra_gatilho: l.regra?.tipo_gatilho || "",
        contato_nome: l.contato?.nome || "—",
        contato_telefone: l.contato?.telefone || "—",
      })),
    [logs],
  );

  function getFiltrosTexto() {
    const regraNome =
      filtroRegra === "__todas__"
        ? undefined
        : (regras || []).find((r: any) => r.id === filtroRegra)?.nome;
    return {
      regra: regraNome,
      gatilho: filtroGatilho === "__todos__" ? undefined : filtroGatilho,
      status: filtroStatus === "__todos__" ? undefined : filtroStatus,
      periodoInicio,
      periodoFim,
    };
  }

  function handleExportCSV() {
    if (logsExportaveis.length === 0) {
      toast({ title: "Sem dados para exportar", variant: "destructive" });
      return;
    }
    const stamp = new Date().toISOString().split("T")[0];
    exportarLogsCSV(logsExportaveis, `comunicacoes-giftback-${stamp}.csv`);
  }

  function handleExportPDF() {
    if (logsExportaveis.length === 0) {
      toast({ title: "Sem dados para exportar", variant: "destructive" });
      return;
    }
    const stamp = new Date().toISOString().split("T")[0];
    exportarLogsPDF(
      logsExportaveis,
      getFiltrosTexto(),
      tenantRow?.nome || "",
      `comunicacoes-giftback-${stamp}.pdf`,
    );
  }

  const saveCfgMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.tenant_id) throw new Error("Sessão inválida");
      const payload = {
        tenant_id: profile.tenant_id,
        ativo,
        horario_envio: horario.length === 5 ? `${horario}:00` : horario,
      };
      if (cfg?.id) {
        const { error } = await supabase
          .from("giftback_comunicacao_config")
          .update(payload)
          .eq("id", cfg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("giftback_comunicacao_config")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gb-com-config"] });
      toast({ title: "Configuração salva!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("giftback_comunicacao_regras")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gb-com-regras"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("giftback_comunicacao_regras")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gb-com-regras"] });
      toast({ title: "Regra excluída" });
    },
  });

  const semCloud = !cloudCfg?.phone_number_id;

  return (
    <div className="space-y-4">
      {semCloud && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">WhatsApp Oficial não configurado</p>
              <p className="text-sm text-muted-foreground">
                Para usar comunicações automáticas, configure primeiro o WhatsApp Oficial.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/configuracoes/whatsapp-oficial">Configurar</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Configuração geral</CardTitle>
          <CardDescription>
            Define se as comunicações automáticas estão ativas e em qual horário diário rodam (fuso de Brasília).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cfgLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); saveCfgMutation.mutate(); }}
              className="flex flex-col sm:flex-row gap-4 items-end"
            >
              <div className="flex items-center gap-2 pb-2">
                <Switch checked={ativo} onCheckedChange={setAtivo} id="cfg-ativo" />
                <Label htmlFor="cfg-ativo" className="cursor-pointer">Comunicações ativas</Label>
              </div>
              <div className="space-y-2 flex-1">
                <Label>Horário de envio diário (HH:MM)</Label>
                <Input
                  type="time"
                  value={horario}
                  onChange={(e) => setHorario(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={saveCfgMutation.isPending}>
                {saveCfgMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Regras de comunicação</CardTitle>
            <CardDescription>
              Cada regra associa um gatilho (criado / vencendo / expirado) a um template aprovado, com filtro RFM opcional.
            </CardDescription>
          </div>
          <Button
            onClick={() => { setEditingRegra(null); setDialogOpen(true); }}
            disabled={semCloud}
          >
            <Plus className="h-4 w-4 mr-1" /> Nova regra
          </Button>
        </CardHeader>
        <CardContent>
          {regrasLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !regras?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma regra criada ainda. Clique em "Nova regra" para começar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Gatilho</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>RFM</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regras.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{GATILHO_LABELS[r.tipo_gatilho]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.tipo_gatilho === "criado"
                        ? "no mesmo dia"
                        : r.tipo_gatilho === "vencendo"
                        ? `${r.dias_offset}d antes`
                        : `${r.dias_offset}d depois`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.filtro_rfv_modo === "incluir" && (r.filtro_rfv_segmentos?.length || 0) > 0
                        ? `${r.filtro_rfv_segmentos.length} seg.`
                        : "Todos"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.template_name}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.ativo}
                        onCheckedChange={(v) => toggleAtivoMutation.mutate({ id: r.id, ativo: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => { setEditingRegra(r); setDialogOpen(true); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Essa ação não pode ser desfeita. O histórico de envios é preservado.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(r.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Histórico com filtros e exportação */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Histórico de envios</CardTitle>
              <CardDescription>
                Auditoria com filtros e exportação. Limite de 5.000 linhas por consulta.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <FileDown className="h-4 w-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Regra</Label>
              <Select value={filtroRegra} onValueChange={setFiltroRegra}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todas</SelectItem>
                  {(regras || []).map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gatilho</Label>
              <Select value={filtroGatilho} onValueChange={setFiltroGatilho}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos__">Todos</SelectItem>
                  <SelectItem value="criado">Giftback criado</SelectItem>
                  <SelectItem value="vencendo">Saldo vencendo</SelectItem>
                  <SelectItem value="expirado">Giftback expirado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos__">Todos</SelectItem>
                  {STATUS_OPTS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
            </div>
          </div>

          {/* Tabela */}
          {logsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : logsExportaveis.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum envio encontrado para os filtros selecionados.
            </p>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                {logsExportaveis.length} envio{logsExportaveis.length !== 1 ? "s" : ""} encontrado{logsExportaveis.length !== 1 ? "s" : ""}
                {logsExportaveis.length === 5000 && (
                  <span className="text-destructive ml-1">
                    (limite atingido — refine o período para ver mais)
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Regra</TableHead>
                      <TableHead>Gatilho</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsExportaveis.slice(0, 200).map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(l.enviado_em).toLocaleString("pt-BR")}
                          {l.is_teste && (
                            <Badge variant="outline" className="ml-1 text-[10px]">teste</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{l.regra_nome}</TableCell>
                        <TableCell className="text-xs">
                          {GATILHO_LABELS[l.regra_gatilho] || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{l.contato_nome}</div>
                          <div className="text-xs text-muted-foreground">{l.contato_telefone}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={l.status === "enviado" ? "default" : "destructive"}>
                            {l.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                          {l.erro || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {logsExportaveis.length > 200 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Exibindo as primeiras 200 linhas. Use a exportação para ver todas.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <RegraComunicacaoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        regra={editingRegra}
      />
    </div>
  );
}
