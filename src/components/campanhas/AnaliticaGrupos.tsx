import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, BarChart3, Eye } from "lucide-react";
import type { CampanhaGrupo } from "./GerenciarGruposDialog";

interface CampanhaLite {
  id: string;
  grupo_id: string | null;
  total_destinatarios: number;
  total_enviados: number;
  total_falhas: number;
  canal: string;
}

interface AnaliticaGruposProps {
  tenantId: string | undefined;
  campanhas: CampanhaLite[];
  grupos: CampanhaGrupo[];
  onSelecionarGrupo: (grupoId: string) => void;
}

interface EntregaAgg {
  delivered: number;
  read: number;
  failed: number;
}

export function AnaliticaGrupos({
  tenantId,
  campanhas,
  grupos,
  onSelecionarGrupo,
}: AnaliticaGruposProps) {
  const [open, setOpen] = useState(true);
  const [entregaPorCampanha, setEntregaPorCampanha] = useState<
    Record<string, EntregaAgg>
  >({});

  // Agrupa campanhas por grupo
  const campanhasPorGrupo = useMemo(() => {
    const map = new Map<string, CampanhaLite[]>();
    for (const c of campanhas) {
      if (!c.grupo_id) continue;
      const arr = map.get(c.grupo_id) || [];
      arr.push(c);
      map.set(c.grupo_id, arr);
    }
    return map;
  }, [campanhas]);

  // Carrega métricas de entrega (delivered/read/failed) para todas as campanhas com grupo
  useEffect(() => {
    if (!tenantId) return;
    const idsComGrupo = campanhas
      .filter((c) => c.grupo_id)
      .map((c) => c.id);
    if (idsComGrupo.length === 0) {
      setEntregaPorCampanha({});
      return;
    }
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("campanha_destinatarios")
        .select("campanha_id, status_entrega")
        .in("campanha_id", idsComGrupo);
      if (cancelado || !data) return;
      const acc: Record<string, EntregaAgg> = {};
      for (const d of data as any[]) {
        if (!d.campanha_id) continue;
        const cur = acc[d.campanha_id] || { delivered: 0, read: 0, failed: 0 };
        if (d.status_entrega === "delivered" || d.status_entrega === "read") {
          cur.delivered++;
        }
        if (d.status_entrega === "read") cur.read++;
        if (d.status_entrega === "failed") cur.failed++;
        acc[d.campanha_id] = cur;
      }
      setEntregaPorCampanha(acc);
    })();
    return () => {
      cancelado = true;
    };
  }, [tenantId, campanhas]);

  const stats = useMemo(() => {
    return grupos
      .map((g) => {
        const camps = campanhasPorGrupo.get(g.id) || [];
        if (camps.length === 0) return null;
        const destinatarios = camps.reduce((s, c) => s + (c.total_destinatarios || 0), 0);
        const enviados = camps.reduce((s, c) => s + (c.total_enviados || 0), 0);
        const falhas = camps.reduce((s, c) => s + (c.total_falhas || 0), 0);
        let delivered = 0;
        let read = 0;
        let failedEntrega = 0;
        for (const c of camps) {
          const e = entregaPorCampanha[c.id];
          if (e) {
            delivered += e.delivered;
            read += e.read;
            failedEntrega += e.failed;
          }
        }
        const taxa = destinatarios > 0 ? (enviados / destinatarios) * 100 : 0;
        const temOficial = camps.some((c) => c.canal === "whatsapp_cloud");
        return {
          grupo: g,
          campanhasCount: camps.length,
          destinatarios,
          enviados,
          falhas: falhas + failedEntrega,
          delivered,
          read,
          taxa,
          temOficial,
        };
      })
      .filter(Boolean) as Array<{
      grupo: CampanhaGrupo;
      campanhasCount: number;
      destinatarios: number;
      enviados: number;
      falhas: number;
      delivered: number;
      read: number;
      taxa: number;
      temOficial: boolean;
    }>;
  }, [grupos, campanhasPorGrupo, entregaPorCampanha]);

  if (stats.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Análise por grupo</span>
            <span className="text-xs text-muted-foreground">
              ({stats.length} grupo{stats.length === 1 ? "" : "s"} ativo{stats.length === 1 ? "" : "s"})
            </span>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {open && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.map((s) => (
              <div
                key={s.grupo.id}
                className="rounded-md border bg-card p-3 space-y-2 border-l-4"
                style={{ borderLeftColor: s.grupo.cor || "#6B7280" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{s.grupo.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.campanhasCount} campanha{s.campanhasCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs shrink-0"
                    onClick={() => onSelecionarGrupo(s.grupo.id)}
                  >
                    <Eye className="h-3 w-3 mr-1" /> Ver
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Destinatários</span>
                    <span className="font-semibold">{s.destinatarios}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Enviados</span>
                    <span className="font-semibold">{s.enviados}</span>
                  </div>
                  {s.temOficial && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Entregues</span>
                        <span className="font-semibold">{s.delivered}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Lidos</span>
                        <span className="font-semibold">{s.read}</span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Falhas</span>
                    <span className="font-semibold text-destructive">{s.falhas}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Taxa entrega</span>
                    <span className="font-semibold">{s.taxa.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
