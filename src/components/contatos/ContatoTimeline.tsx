import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  Gift,
  MessageSquare,
  Megaphone,
  Mail,
  Clock,
  CircleDot,
} from "lucide-react";

type Evento = {
  ts: string;
  tipo: string;
  titulo: string;
  descricao: string;
  valor: number | null;
  ref_id: string;
  metadata: Record<string, any>;
};

const TIPO_META: Record<string, { icon: any; color: string; label: string }> = {
  compra: { icon: ShoppingBag, color: "text-emerald-600 bg-emerald-50", label: "Compra" },
  giftback_credito: { icon: Gift, color: "text-blue-600 bg-blue-50", label: "Giftback" },
  giftback_debito: { icon: Gift, color: "text-orange-600 bg-orange-50", label: "Giftback usado" },
  giftback_expirado: { icon: Gift, color: "text-gray-500 bg-gray-100", label: "Giftback expirado" },
  mensagem: { icon: MessageSquare, color: "text-violet-600 bg-violet-50", label: "Conversa" },
  campanha: { icon: Megaphone, color: "text-pink-600 bg-pink-50", label: "Campanha" },
  comunicacao_giftback: { icon: Mail, color: "text-cyan-600 bg-cyan-50", label: "Comunicação" },
};

function tituloDia(d: Date): string {
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}

interface ContatoTimelineProps {
  contatoId: string;
  filtroTipo?: string | null;
}

export function ContatoTimeline({ contatoId, filtroTipo }: ContatoTimelineProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["contato-timeline", contatoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("contato_timeline", {
        p_contato_id: contatoId,
        p_limit: 200,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!contatoId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const eventos: Evento[] = (data?.eventos || []).filter((e: Evento) =>
    !filtroTipo || e.tipo === filtroTipo || e.tipo.startsWith(filtroTipo)
  );

  if (eventos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Nenhum evento registrado ainda.</p>
      </div>
    );
  }

  // Agrupa por dia
  const grupos = new Map<string, Evento[]>();
  for (const ev of eventos) {
    const dia = format(new Date(ev.ts), "yyyy-MM-dd");
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia)!.push(ev);
  }

  return (
    <div className="space-y-6">
      {Array.from(grupos.entries()).map(([dia, evs]) => (
        <div key={dia}>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 sticky top-0 bg-background/95 backdrop-blur py-1">
            {tituloDia(new Date(evs[0].ts))}
          </div>
          <div className="space-y-2">
            {evs.map((ev) => {
              const meta = TIPO_META[ev.tipo] || { icon: CircleDot, color: "text-gray-600 bg-gray-100", label: ev.tipo };
              const Icon = meta.icon;
              return (
                <div
                  key={ev.ref_id + ev.ts}
                  className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-medium text-sm truncate">{ev.titulo}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {format(new Date(ev.ts), "HH:mm")}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{ev.descricao}</div>
                    {ev.valor != null && (
                      <Badge variant="outline" className="mt-1 text-[10px] py-0">
                        R$ {Number(ev.valor).toFixed(2).replace(".", ",")}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
