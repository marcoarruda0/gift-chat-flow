import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ContatoKpiCard } from "./ContatoKpiCard";
import { EventoCard, Evento, TIPOS_EVENTO_OPCOES } from "./EventoCard";
import {
  CircleDollarSign,
  Gift,
  Receipt,
  ShoppingBag,
  Filter,
  Clock,
} from "lucide-react";

function brl(v: number) {
  return "R$ " + Number(v).toFixed(2).replace(".", ",");
}

function tituloDia(d: Date): string {
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "EEE, dd/MM/yyyy", { locale: ptBR });
}

interface ContatoAtividadesProps {
  contatoId: string;
}

export function ContatoAtividades({ contatoId }: ContatoAtividadesProps) {
  const [tiposSelecionados, setTiposSelecionados] = useState<string[]>([]);

  const { data: resumo } = useQuery({
    queryKey: ["contato-resumo", contatoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("contato_resumo", {
        p_contato_id: contatoId,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!contatoId,
  });

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

  const eventos: Evento[] = useMemo(() => {
    const lista: Evento[] = data?.eventos || [];
    if (tiposSelecionados.length === 0) return lista;
    return lista.filter((e) => tiposSelecionados.includes(e.tipo));
  }, [data, tiposSelecionados]);

  const grupos = useMemo(() => {
    const m = new Map<string, Evento[]>();
    for (const ev of eventos) {
      const dia = format(new Date(ev.ts), "yyyy-MM-dd");
      if (!m.has(dia)) m.set(dia, []);
      m.get(dia)!.push(ev);
    }
    return Array.from(m.entries());
  }, [eventos]);

  function toggleTipo(t: string) {
    setTiposSelecionados((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <ContatoKpiCard
          icon={CircleDollarSign}
          label="Valor gasto"
          value={brl(Number(resumo?.valor_gasto || 0))}
          iconColorClass="text-emerald-700 bg-emerald-100"
        />
        <ContatoKpiCard
          icon={Gift}
          label="Giftback gerado"
          value={brl(Number(resumo?.giftback_gerado || 0))}
          iconColorClass="text-primary bg-primary/10"
        />
        <ContatoKpiCard
          icon={Receipt}
          label="Ticket médio"
          value={brl(Number(resumo?.ticket_medio || 0))}
          iconColorClass="text-violet-700 bg-violet-100"
        />
        <ContatoKpiCard
          icon={ShoppingBag}
          label="Nº de compras"
          value={String(resumo?.num_compras ?? 0)}
          iconColorClass="text-amber-700 bg-amber-100"
        />
      </div>

      {/* Filtro */}
      <div className="mb-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-3.5 w-3.5" />
              Filtrar
              {tiposSelecionados.length > 0 && (
                <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5">
                  {tiposSelecionados.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            <div className="space-y-1 max-h-72 overflow-auto">
              {TIPOS_EVENTO_OPCOES.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={tiposSelecionados.includes(opt.value)}
                    onCheckedChange={() => toggleTipo(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
              {tiposSelecionados.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-1"
                  onClick={() => setTiposSelecionados([])}
                >
                  Limpar
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto pr-1">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Registro de atividades
        </h3>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : grupos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum evento registrado.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grupos.map(([dia, evs]) => (
              <div key={dia}>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {tituloDia(new Date(evs[0].ts))}
                </div>
                <div className="space-y-2">
                  {evs.map((ev) => (
                    <EventoCard key={ev.ref_id + ev.ts} evento={ev} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
