import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Plus, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CriarTemplateDialog } from "./CriarTemplateDialog";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

interface TemplateRow {
  id: string;
  meta_template_id: string | null;
  name: string;
  language: string;
  category: string | null;
  status: string;
  components: any;
  rejection_reason: string | null;
  synced_at: string | null;
}

interface TemplatesCardProps {
  tenantId: string | null;
  wabaId: string;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "APPROVED":
      return "default";
    case "REJECTED":
    case "DISABLED":
      return "destructive";
    case "PENDING":
    case "IN_APPEAL":
      return "secondary";
    default:
      return "outline";
  }
}

export function TemplatesCard({ tenantId, wabaId }: TemplatesCardProps) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_cloud_templates" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name");
    if (error) {
      toast.error("Erro ao carregar templates: " + error.message);
    } else {
      setTemplates((data as unknown as TemplateRow[]) || []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
    if (!tenantId || !wabaId) {
      toast.error("Configure o WABA ID antes de sincronizar.");
      return;
    }
    setSyncing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const url = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-cloud-proxy`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          endpoint: "message_templates?fields=id,name,language,status,category,components,rejected_reason&limit=200",
          method: "GET",
          useWabaId: true,
        }),
      });
      const result = await res.json();
      const metaErr = result?.error?.message || result?.error?.error_user_msg;
      if (metaErr) {
        throw new Error(metaErr);
      }
      const list = result?.data || [];
      if (list.length === 0) {
        toast.info("Nenhum template encontrado na Meta.");
      } else {
        // Carrega templates locais para preservar media_url (Meta não devolve)
        const { data: locais } = await supabase
          .from("whatsapp_cloud_templates" as any)
          .select("name, language, components")
          .eq("tenant_id", tenantId);
        const localMap = new Map<string, any[]>(
          ((locais as any[]) || []).map((l) => [
            `${l.name}::${l.language}`,
            (l.components as any[]) || [],
          ]),
        );

        const mergeMediaUrl = (
          incoming: any[],
          existing: any[] | undefined,
        ): any[] => {
          if (!Array.isArray(incoming)) return incoming;
          return incoming.map((comp) => {
            const type = String(comp?.type || "").toUpperCase();
            const fmt = String(comp?.format || "").toUpperCase();
            if (type === "HEADER" && (fmt === "IMAGE" || fmt === "VIDEO")) {
              const localHeader = (existing || []).find(
                (c: any) =>
                  String(c?.type || "").toUpperCase() === "HEADER" &&
                  String(c?.format || "").toUpperCase() === fmt,
              );
              if (localHeader?.media_url) {
                return { ...comp, media_url: localHeader.media_url };
              }
            }
            return comp;
          });
        };

        const now = new Date().toISOString();
        const rows = list.map((t: any) => ({
          tenant_id: tenantId,
          meta_template_id: t.id,
          name: t.name,
          language: t.language,
          category: t.category || null,
          status: t.status || "PENDING",
          components: mergeMediaUrl(
            t.components || [],
            localMap.get(`${t.name}::${t.language}`),
          ),
          rejection_reason: t.rejected_reason || null,
          synced_at: now,
        }));
        const { error: upErr } = await supabase
          .from("whatsapp_cloud_templates" as any)
          .upsert(rows, { onConflict: "tenant_id,name,language" });
        if (upErr) throw upErr;
        toast.success(`${list.length} template(s) sincronizado(s).`);
      }
      load();
    } catch (e: any) {
      toast.error("Falhou: " + e.message);
    }
    setSyncing(false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Templates</CardTitle>
              <CardDescription>
                Modelos de mensagem aprovados pela Meta. Use em campanhas e para reabrir conversas após 24h.
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Sincronizar
              </Button>
              <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!wabaId}>
                <Plus className="h-4 w-4 mr-1" />
                Novo template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <p>Nenhum template ainda.</p>
              <p className="mt-1">Clique em "Sincronizar" para puxar os templates já cadastrados na Meta.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Idioma</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => {
                  const isExpanded = expandedId === t.id;
                  const showExpand = t.status === "REJECTED" && t.rejection_reason;
                  return (
                    <>
                      <TableRow
                        key={t.id}
                        className={showExpand ? "cursor-pointer" : ""}
                        onClick={() => showExpand && setExpandedId(isExpanded ? null : t.id)}
                      >
                        <TableCell className="font-mono text-xs">{t.name}</TableCell>
                        <TableCell>{t.language}</TableCell>
                        <TableCell>{t.category || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.synced_at
                            ? formatDistanceToNow(new Date(t.synced_at), { addSuffix: true, locale: ptBR })
                            : "-"}
                        </TableCell>
                      </TableRow>
                      {isExpanded && showExpand && (
                        <TableRow key={`${t.id}-exp`}>
                          <TableCell colSpan={5} className="bg-muted/30">
                            <div className="flex gap-2 text-xs">
                              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                              <div>
                                <p className="font-medium text-destructive">Motivo da rejeição:</p>
                                <p className="text-muted-foreground mt-0.5">{t.rejection_reason}</p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CriarTemplateDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={load} />
    </>
  );
}
