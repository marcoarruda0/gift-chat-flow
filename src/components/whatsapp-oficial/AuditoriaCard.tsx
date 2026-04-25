import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface EventoRow {
  id: string;
  phone_number_id: string | null;
  status: string;
  erro_mensagem: string | null;
  mensagens_criadas: number;
  conversas_criadas: number;
  recebido_at: string;
  processado_at: string | null;
  reprocessado_em: string | null;
  payload: any;
}

interface Props {
  tenantId: string | null;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

export function AuditoriaCard({ tenantId }: Props) {
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_webhook_eventos" as any)
      .select(
        "id, phone_number_id, status, erro_mensagem, mensagens_criadas, conversas_criadas, recebido_at, processado_at, reprocessado_em, payload"
      )
      .eq("tenant_id", tenantId)
      .order("recebido_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error("Erro ao carregar auditoria: " + error.message);
    } else {
      setEventos((data as any) || []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const reprocessar = async (eventoId: string) => {
    setReprocessingId(eventoId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const url = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-cloud-reprocessar`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ evento_id: eventoId }),
      });
      const j = await res.json();
      if (j?.ok) {
        toast.success("Reprocessado. Atualizando lista…");
        setTimeout(load, 800);
      } else {
        toast.error("Falhou: " + (j?.error || res.status));
      }
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setReprocessingId(null);
  };

  const statusBadge = (status: string) => {
    if (status === "processado")
      return <Badge variant="default" className="gap-1">processado</Badge>;
    if (status === "erro") return <Badge variant="destructive">erro</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Auditoria de eventos do webhook</CardTitle>
            <CardDescription>
              Últimas 50 chamadas POST recebidas da Meta — inclui falhas de criação de conversa
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {eventos.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum evento registrado ainda.
          </p>
        )}

        <div className="space-y-2">
          {eventos.map((ev) => {
            const isExpanded = expandedId === ev.id;
            return (
              <div key={ev.id} className="rounded-md border border-border overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-3 bg-muted/30">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(ev.status)}
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.recebido_at).toLocaleString("pt-BR")}
                        </span>
                        {ev.phone_number_id && (
                          <code className="text-xs bg-muted px-1 rounded">
                            phone: {ev.phone_number_id}
                          </code>
                        )}
                        <span className="text-xs text-muted-foreground">
                          msgs: {ev.mensagens_criadas} · conv: {ev.conversas_criadas}
                        </span>
                      </div>
                      {ev.erro_mensagem && (
                        <p className="text-xs text-destructive mt-1 truncate">
                          {ev.erro_mensagem}
                        </p>
                      )}
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reprocessar(ev.id)}
                    disabled={reprocessingId === ev.id}
                  >
                    {reprocessingId === ev.id ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-1" />
                    )}
                    Reprocessar
                  </Button>
                </div>
                {isExpanded && (
                  <pre className="text-xs bg-background p-3 overflow-x-auto border-t border-border max-h-96">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
