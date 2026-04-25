import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Search,
} from "lucide-react";
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
  hmac_valido: boolean | null;
  payload: any;
}

interface Props {
  tenantId: string | null;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const PAGE_SIZE = 25;

export function AuditoriaCard({ tenantId }: Props) {
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [phoneFiltro, setPhoneFiltro] = useState<string>("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    let q = supabase
      .from("whatsapp_webhook_eventos" as any)
      .select(
        "id, phone_number_id, status, erro_mensagem, mensagens_criadas, conversas_criadas, recebido_at, processado_at, reprocessado_em, hmac_valido, payload"
      )
      .eq("tenant_id", tenantId)
      .order("recebido_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    if (statusFiltro !== "todos") q = q.eq("status", statusFiltro);
    if (phoneFiltro.trim()) q = q.ilike("phone_number_id", `%${phoneFiltro.trim()}%`);

    const { data, error } = await q;
    if (error) {
      toast.error("Erro ao carregar auditoria: " + error.message);
    } else {
      const rows = (data as any[]) || [];
      setHasMore(rows.length > PAGE_SIZE);
      setEventos(rows.slice(0, PAGE_SIZE) as EventoRow[]);
    }
    setLoading(false);
  }, [tenantId, statusFiltro, phoneFiltro, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [statusFiltro, phoneFiltro]);

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
    if (status === "duplicado")
      return (
        <Badge
          variant="secondary"
          className="bg-muted text-muted-foreground border-border"
        >
          duplicado
        </Badge>
      );
    return <Badge variant="secondary">{status}</Badge>;
  };

  const hmacBadge = (v: boolean | null) => {
    if (v === null)
      return (
        <span title="HMAC não validado (META_APP_SECRET não configurado)">
          <ShieldOff className="h-3 w-3 text-muted-foreground" />
        </span>
      );
    if (v)
      return (
        <span title="HMAC válido">
          <ShieldCheck className="h-3 w-3 text-primary" />
        </span>
      );
    return (
      <span title="HMAC inválido">
        <ShieldAlert className="h-3 w-3 text-destructive" />
      </span>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle>Auditoria de eventos do webhook</CardTitle>
            <CardDescription>
              Eventos POST recebidos da Meta — filtre por status ou número
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

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap pt-3">
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="processado">Processado</SelectItem>
              <SelectItem value="erro">Erro</SelectItem>
              <SelectItem value="duplicado">Duplicado</SelectItem>
              <SelectItem value="recebido">Recebido</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar por phone_number_id…"
              value={phoneFiltro}
              onChange={(e) => setPhoneFiltro(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {eventos.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum evento encontrado com os filtros atuais.
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
                        {hmacBadge(ev.hmac_valido)}
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

        {/* Paginação */}
        {(page > 0 || hasMore) && (
          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              ← Anterior
            </Button>
            <span className="text-xs text-muted-foreground">Página {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || loading}
            >
              Próxima →
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
