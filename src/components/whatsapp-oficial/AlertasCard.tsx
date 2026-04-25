import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface AlertaRow {
  id: string;
  tipo: string;
  taxa_erro_pct: number;
  limite_pct: number;
  total_eventos: number;
  total_erros: number;
  detalhe: string | null;
  created_at: string;
}

interface Props {
  tenantId: string | null;
}

export function AlertasCard({ tenantId }: Props) {
  const [alertas, setAlertas] = useState<AlertaRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_alertas" as any)
      .select("id, tipo, taxa_erro_pct, limite_pct, total_eventos, total_erros, detalhe, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error("Erro ao carregar alertas: " + error.message);
    } else {
      setAlertas((data as any[]) as AlertaRow[]);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Alertas de taxa de erro
            </CardTitle>
            <CardDescription>
              Histórico de disparos quando a taxa de erro do webhook ultrapassou o limite configurado
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
        {alertas.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum alerta disparado até o momento.
          </p>
        )}

        <div className="space-y-2">
          {alertas.map((a) => (
            <div
              key={a.id}
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="destructive" className="gap-1">
                    <Bell className="h-3 w-3" />
                    Taxa {a.taxa_erro_pct.toFixed(1)}%
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    limite: {a.limite_pct}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.total_erros}/{a.total_eventos} eventos
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              {a.detalhe && (
                <p className="text-xs text-muted-foreground">{a.detalhe}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
