import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bot, MessageSquare, Settings, Brain, ChevronRight, Zap, Building2, Trash2, Loader2, Shield, Instagram } from "lucide-react";

interface Fluxo {
  id: string;
  nome: string;
}

interface FluxoConfig {
  id?: string;
  tipo: string;
  fluxo_id: string | null;
  ativo: boolean;
}

const FLOW_TYPES = [
  {
    tipo: "resposta_padrao",
    titulo: "Fluxo de Resposta Padrão",
    descricao: "Executado automaticamente quando uma nova mensagem chega e não há atendente ativo na conversa.",
    icon: MessageSquare,
  },
  {
    tipo: "pos_atendimento",
    titulo: "Fluxo Pós-Atendimento",
    descricao: "Executado automaticamente quando uma conversa é encerrada ou finalizada pelo atendente.",
    icon: Bot,
  },
];

type CleanupTarget = "conversas" | "contatos" | "midia" | null;

export default function Configuracoes() {
  const { profile, hasRole } = useAuth();
  const tenantId = profile?.tenant_id;
  const navigate = useNavigate();
  const isAdmin = hasRole("admin_tenant") || hasRole("admin_master");

  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [configs, setConfigs] = useState<Record<string, FluxoConfig>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // Cleanup
  const [cleanupTarget, setCleanupTarget] = useState<CleanupTarget>(null);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    fetchData();
  }, [tenantId]);

  async function fetchData() {
    const [fluxosRes, configsRes] = await Promise.all([
      supabase.from("fluxos").select("id, nome").eq("tenant_id", tenantId!).order("nome"),
      supabase.from("fluxo_config").select("*").eq("tenant_id", tenantId!),
    ]);

    if (fluxosRes.data) setFluxos(fluxosRes.data);
    if (configsRes.data) {
      const map: Record<string, FluxoConfig> = {};
      for (const c of configsRes.data) {
        map[c.tipo] = { id: c.id, tipo: c.tipo, fluxo_id: c.fluxo_id, ativo: c.ativo };
      }
      setConfigs(map);
    }
  }

  async function handleSave(tipo: string, updates: Partial<FluxoConfig>) {
    if (!tenantId) return;
    setSaving(tipo);
    const current = configs[tipo];
    const newConfig = { ...current, tipo, fluxo_id: null, ativo: true, ...updates };
    try {
      if (current?.id) {
        const { error } = await supabase
          .from("fluxo_config")
          .update({ fluxo_id: newConfig.fluxo_id, ativo: newConfig.ativo })
          .eq("id", current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("fluxo_config")
          .insert({ tenant_id: tenantId, tipo, fluxo_id: newConfig.fluxo_id, ativo: newConfig.ativo });
        if (error) throw error;
      }
      await fetchData();
      toast.success("Configuração salva!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleCleanup() {
    if (!tenantId || !cleanupTarget) return;
    setCleaning(true);
    try {
      if (cleanupTarget === "conversas") {
        await supabase.from("fluxo_sessoes").delete().eq("tenant_id", tenantId);
        await supabase.from("mensagens").delete().eq("tenant_id", tenantId);
        await supabase.from("conversas").delete().eq("tenant_id", tenantId);
        toast.success("Conversas e mensagens removidas!");
      } else if (cleanupTarget === "contatos") {
        // Delete dependent data first
        await supabase.from("giftback_movimentos").delete().eq("tenant_id", tenantId);
        await supabase.from("compras").delete().eq("tenant_id", tenantId);
        await supabase.from("campanha_destinatarios").delete().eq("tenant_id", tenantId);
        await supabase.from("contatos").delete().eq("tenant_id", tenantId);
        toast.success("Contatos removidos!");
      } else if (cleanupTarget === "midia") {
        const { data: files } = await supabase.storage.from("chat-media").list(tenantId, { limit: 1000 });
        if (files && files.length > 0) {
          const paths = files.map(f => `${tenantId}/${f.name}`);
          await supabase.storage.from("chat-media").remove(paths);
        }
        toast.success("Mídia removida!");
      }
    } catch (err: any) {
      toast.error("Erro na limpeza: " + err.message);
    } finally {
      setCleaning(false);
      setCleanupTarget(null);
    }
  }

  const cleanupLabels: Record<string, { title: string; desc: string }> = {
    conversas: {
      title: "Limpar Conversas e Mensagens",
      desc: "Isso removerá TODAS as conversas, mensagens e sessões de fluxo da empresa atual. Esta ação é irreversível.",
    },
    contatos: {
      title: "Limpar Contatos",
      desc: "Isso removerá TODOS os contatos, compras e movimentos de giftback da empresa atual. Esta ação é irreversível.",
    },
    midia: {
      title: "Limpar Mídia",
      desc: "Isso removerá TODOS os arquivos de mídia (imagens, áudios, documentos) da empresa atual. Esta ação é irreversível.",
    },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie as configurações do sistema</p>
      </div>

      {/* Fluxos Automáticos */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Fluxos Automáticos
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {FLOW_TYPES.map((ft) => {
            const config = configs[ft.tipo];
            const Icon = ft.icon;
            return (
              <Card key={ft.tipo} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{ft.titulo}</CardTitle>
                    </div>
                    <Switch
                      checked={config?.ativo ?? false}
                      onCheckedChange={(checked) => handleSave(ft.tipo, { ativo: checked })}
                      disabled={saving === ft.tipo}
                    />
                  </div>
                  <CardDescription className="text-xs">{ft.descricao}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Select
                    value={config?.fluxo_id ?? "none"}
                    onValueChange={(val) => handleSave(ft.tipo, { fluxo_id: val === "none" ? null : val })}
                    disabled={saving === ft.tipo}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um fluxo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum fluxo selecionado</SelectItem>
                      {fluxos.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Links para outras configs */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Outras Configurações
        </h2>
        <div className="grid gap-3">
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate("/empresa")}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Empresa</p>
                  <p className="text-xs text-muted-foreground">Dados da empresa, equipe e departamentos</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate("/configuracoes/zapi")}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Configuração Z-API</p>
                  <p className="text-xs text-muted-foreground">Conexão com WhatsApp</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate("/configuracoes/instagram")}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Instagram className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Configuração Instagram</p>
                  <p className="text-xs text-muted-foreground">Receber e responder DMs do Instagram</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate("/configuracoes/ia")}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Brain className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Configuração IA</p>
                  <p className="text-xs text-muted-foreground">Assistente virtual e inteligência artificial</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate("/configuracoes/lgpd")}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">LGPD & Opt-out</p>
                  <p className="text-xs text-muted-foreground">Descadastro automático e privacidade</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Limpeza de Dados */}
      {isAdmin && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Limpeza de Dados
          </h2>
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Zona de Perigo</CardTitle>
              <CardDescription className="text-xs">
                Remova dados da empresa atual. Essas ações são irreversíveis.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="destructive" size="sm" onClick={() => setCleanupTarget("conversas")}>
                <Trash2 className="h-4 w-4 mr-1" /> Limpar Conversas
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setCleanupTarget("contatos")}>
                <Trash2 className="h-4 w-4 mr-1" /> Limpar Contatos
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setCleanupTarget("midia")}>
                <Trash2 className="h-4 w-4 mr-1" /> Limpar Mídia
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cleanup confirmation dialog */}
      <AlertDialog open={!!cleanupTarget} onOpenChange={(open) => !open && setCleanupTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{cleanupTarget && cleanupLabels[cleanupTarget]?.title}</AlertDialogTitle>
            <AlertDialogDescription>{cleanupTarget && cleanupLabels[cleanupTarget]?.desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleaning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCleanup} disabled={cleaning} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cleaning ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Limpando...</> : "Confirmar Limpeza"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
