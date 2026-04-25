import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ChevronDown,
  ChevronRight,
  Copy,
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
  payload_hash: string | null;
  payload: any;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const PAGE_SIZE = 25;

export default function WhatsappWebhookEventos() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [hmacFiltro, setHmacFiltro] = useState<string>("todos");
  const [phoneFiltro, setPhoneFiltro] = useState<string>("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number>(0);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    let q = supabase
      .from("whatsapp_webhook_eventos" as any)
      .select(
        "id, phone_number_id, status, erro_mensagem, mensagens_criadas, conversas_criadas, recebido_at, processado_at, reprocessado_em, hmac_valido, payload_hash, payload",
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .order("recebido_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    if (statusFiltro !== "todos") q = q.eq("status", statusFiltro);
    if (hmacFiltro === "valido") q = q.eq("hmac_valido", true);
    else if (hmacFiltro === "invalido") q = q.eq("hmac_valido", false);
    else if (hmacFiltro === "desconhecido") q = q.is("hmac_valido", null);
    if (phoneFiltro.trim()) q = q.ilike("phone_number_id", `%${phoneFiltro.trim()}%`);

    const { data, error, count } = await q;
    if (error) {
      toast.error("Erro ao carregar eventos: " + error.message);
    } else {
      const rows = (data as any[]) || [];
      setHasMore(rows.length > PAGE_SIZE);
      setEventos(rows.slice(0, PAGE_SIZE) as EventoRow[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [tenantId, statusFiltro, hmacFiltro, phoneFiltro, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [statusFiltro, hmacFiltro, phoneFiltro]);

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
        toast.success("Reprocessado.");
        setTimeout(load, 600);
      } else {
        toast.error("Falhou: " + (j?.error || res.status));
      }
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setReprocessingId(null);
  };

  const statusBadge = (status: string) => {
    if (status === "processado") return <Badge variant="default">processado</Badge>;
    if (status === "erro") return <Badge variant="destructive">erro</Badge>;
    if (status === "duplicado")
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
          duplicado
        </Badge>
      );
    return <Badge variant="secondary">{status}</Badge>;
  };

  const hmacBadge = (v: boolean | null) => {
    if (v === null)
      return (
        <span title="HMAC não validado" className="inline-flex items-center">
          <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      );
    if (v)
      return (
        <span title="HMAC válido" className="inline-flex items-center">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        </span>
      );
    return (
      <span title="HMAC inválido" className="inline-flex items-center">
        <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
      </span>
    );
  };

  const previewPayload = (payload: any): string => {
    try {
      const change = payload?.entry?.[0]?.changes?.[0];
      const value = change?.value || {};
      const parts: string[] = [];
      if (value.metadata?.display_phone_number)
        parts.push(`from: ${value.metadata.display_phone_number}`);
      if (value.messages?.length) parts.push(`${value.messages.length} msg`);
      if (value.statuses?.length) parts.push(`${value.statuses.length} status`);
      if (value.contacts?.length) parts.push(`${value.contacts.length} contact`);
      if (parts.length === 0) return JSON.stringify(payload).slice(0, 80) + "…";
      return parts.join(" · ");
    } catch {
      return "—";
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/configuracoes/whatsapp-oficial">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Eventos do Webhook (WhatsApp Oficial)</h1>
          <p className="text-muted-foreground text-sm">
            Histórico completo de chamadas POST recebidas da Meta
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>
                {total > 0 ? `${total.toLocaleString("pt-BR")} evento(s) no total` : "Nenhum evento"}
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3">
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="h-9">
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

            <Select value={hmacFiltro} onValueChange={setHmacFiltro}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">HMAC: todos</SelectItem>
                <SelectItem value="valido">HMAC válido</SelectItem>
                <SelectItem value="invalido">HMAC inválido</SelectItem>
                <SelectItem value="desconhecido">HMAC não validado</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="phone_number_id…"
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
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge(ev.status)}
                          {hmacBadge(ev.hmac_valido)}
                          <span className="text-xs text-muted-foreground">
                            {new Date(ev.recebido_at).toLocaleString("pt-BR")}
                          </span>
                          {ev.phone_number_id && (
                            <code className="text-xs bg-muted px-1 rounded">
                              {ev.phone_number_id}
                            </code>
                          )}
                          <span className="text-xs text-muted-foreground">
                            msgs: {ev.mensagens_criadas} · conv: {ev.conversas_criadas}
                          </span>
                          {ev.reprocessado_em && (
                            <Badge variant="outline" className="text-[10px] py-0 h-5">
                              reprocessado
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {previewPayload(ev.payload)}
                        </p>
                        {ev.erro_mensagem && (
                          <p className="text-xs text-destructive truncate">
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
                    <div className="border-t border-border bg-background">
                      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border flex items-center justify-between">
                        <span>
                          ID: <code className="bg-muted px-1 rounded">{ev.id}</code>
                        </span>
                        {ev.payload_hash && (
                          <span>
                            hash: <code className="bg-muted px-1 rounded">{ev.payload_hash.slice(0, 16)}…</code>
                          </span>
                        )}
                      </div>
                      <pre className="text-xs p-3 overflow-x-auto max-h-96">
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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
    </div>
  );
}
