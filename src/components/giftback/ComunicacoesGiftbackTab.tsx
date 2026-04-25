import { useState, useEffect } from "react";
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
import { AlertCircle, Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { RegraComunicacaoDialog } from "./RegraComunicacaoDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const GATILHO_LABELS: Record<string, string> = {
  criado: "Giftback criado",
  vencendo: "Saldo vencendo",
  expirado: "Giftback expirado",
};

export default function ComunicacoesGiftbackTab() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRegra, setEditingRegra] = useState<any>(null);

  const [horario, setHorario] = useState("09:00");
  const [ativo, setAtivo] = useState(true);

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

  // Carrega valores iniciais quando cfg chega
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

  // Logs recentes
  const { data: logs } = useQuery({
    queryKey: ["gb-com-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("giftback_comunicacao_log")
        .select("id, status, enviado_em, erro, regra_id, contato_id")
        .order("enviado_em", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!profile?.tenant_id,
  });

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
              Cada regra associa um gatilho (criado / vencendo / expirado) a um template aprovado.
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

      {(logs?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Últimos envios</CardTitle>
            <CardDescription>Histórico recente para auditoria.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs!.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">
                      {new Date(l.enviado_em).toLocaleString("pt-BR")}
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
          </CardContent>
        </Card>
      )}

      <RegraComunicacaoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        regra={editingRegra}
      />
    </div>
  );
}
