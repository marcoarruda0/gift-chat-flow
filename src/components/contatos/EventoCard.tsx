import { format } from "date-fns";
import {
  ShoppingBag,
  Gift,
  MessageSquare,
  Megaphone,
  Mail,
  CircleDot,
  GitBranch,
  Smile,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type Evento = {
  ts: string;
  tipo: string;
  titulo: string;
  descricao: string;
  valor: number | null;
  ref_id: string;
  metadata: Record<string, any>;
};

const TIPO_META: Record<
  string,
  { icon: any; iconBg: string; iconColor: string; barColor: string; label: string }
> = {
  compra: {
    icon: ShoppingBag,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-700",
    barColor: "bg-emerald-500",
    label: "Compra",
  },
  giftback_credito: {
    icon: Gift,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-700",
    barColor: "bg-emerald-500",
    label: "Giftback gerado",
  },
  giftback_debito: {
    icon: Gift,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-700",
    barColor: "bg-orange-500",
    label: "Giftback usado",
  },
  giftback_expirado: {
    icon: Gift,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    barColor: "bg-muted-foreground",
    label: "Giftback expirado",
  },
  mensagem: {
    icon: MessageSquare,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-700",
    barColor: "bg-violet-500",
    label: "Conversa",
  },
  campanha: {
    icon: Megaphone,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-700",
    barColor: "bg-purple-500",
    label: "Campanha",
  },
  comunicacao_giftback: {
    icon: Mail,
    iconBg: "bg-cyan-100",
    iconColor: "text-cyan-700",
    barColor: "bg-cyan-500",
    label: "Comunicação",
  },
  fluxo: {
    icon: GitBranch,
    iconBg: "bg-sky-100",
    iconColor: "text-sky-700",
    barColor: "bg-sky-500",
    label: "Fluxo",
  },
  satisfacao: {
    icon: Smile,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
    barColor: "bg-amber-500",
    label: "Satisfação",
  },
};

function brl(v: number) {
  return "R$ " + Number(v).toFixed(2).replace(".", ",");
}

interface EventoCardProps {
  evento: Evento;
}

export function EventoCard({ evento }: EventoCardProps) {
  const meta =
    TIPO_META[evento.tipo] || {
      icon: CircleDot,
      iconBg: "bg-muted",
      iconColor: "text-muted-foreground",
      barColor: "bg-muted",
      label: evento.tipo,
    };
  const Icon = meta.icon;
  const horario = format(new Date(evento.ts), "dd/MM 'às' HH:mm");

  return (
    <div className="flex rounded-lg border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-1 shrink-0 ${meta.barColor}`} />
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${meta.iconBg} ${meta.iconColor}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm text-foreground truncate">
              {evento.titulo}
            </span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
            {horario}
          </span>
        </div>

        <div className="pl-9">{renderDetalhes(evento)}</div>
      </div>
    </div>
  );
}

function renderDetalhes(evento: Evento) {
  const m = evento.metadata || {};

  switch (evento.tipo) {
    case "compra": {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Field label="Valor" value={brl(evento.valor || 0)} />
          {Number(m.giftback_gerado) > 0 && (
            <Field label="Giftback gerado" value={brl(m.giftback_gerado)} />
          )}
          {Number(m.giftback_usado) > 0 && (
            <Field label="Giftback usado" value={brl(m.giftback_usado)} />
          )}
          {m.operador_nome && <Field label="Vendedor" value={m.operador_nome} />}
        </div>
      );
    }
    case "giftback_credito": {
      const usado = !!m.usado;
      const expirado = !!m.expirado;
      return (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Field label="Valor" value={brl(evento.valor || 0)} />
            {m.codigo && <Field label="Código" value={m.codigo} mono />}
            {m.validade && (
              <Field
                label="Validade"
                value={format(new Date(m.validade), "dd/MM/yyyy")}
              />
            )}
            {m.percentual != null && (
              <Field label="Percentual" value={`${m.percentual}%`} />
            )}
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {usado ? (
              <Badge variant="secondary" className="text-[10px] gap-1 py-0">
                <CheckCircle2 className="h-3 w-3" /> Utilizado
              </Badge>
            ) : expirado ? (
              <Badge variant="outline" className="text-[10px] gap-1 py-0">
                <XCircle className="h-3 w-3" /> Expirado
              </Badge>
            ) : (
              <Badge className="text-[10px] gap-1 py-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                <Clock className="h-3 w-3" /> Disponível
              </Badge>
            )}
          </div>
        </>
      );
    }
    case "giftback_debito":
    case "giftback_expirado": {
      return (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Field label="Valor" value={brl(evento.valor || 0)} />
          {m.compra_id && <Field label="Compra" value={String(m.compra_id).slice(0, 8)} mono />}
        </div>
      );
    }
    case "campanha": {
      return (
        <>
          <p className="text-xs text-muted-foreground">{evento.descricao}</p>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {m.canal && (
              <Badge variant="outline" className="text-[10px] py-0">
                {m.canal}
              </Badge>
            )}
            {m.status && (
              <Badge variant="secondary" className="text-[10px] py-0">
                {m.status}
              </Badge>
            )}
          </div>
        </>
      );
    }
    case "fluxo": {
      return <p className="text-xs text-muted-foreground">{evento.descricao}</p>;
    }
    case "mensagem": {
      return (
        <>
          <p className="text-xs text-muted-foreground line-clamp-2">{evento.descricao}</p>
          <div className="flex gap-1.5 mt-1.5">
            {m.canal && (
              <Badge variant="outline" className="text-[10px] py-0">
                {m.canal}
              </Badge>
            )}
            {m.total != null && (
              <Badge variant="secondary" className="text-[10px] py-0">
                {m.total} mensagens
              </Badge>
            )}
          </div>
        </>
      );
    }
    case "satisfacao": {
      return (
        <>
          {evento.descricao && (
            <p className="text-xs text-muted-foreground line-clamp-2">{evento.descricao}</p>
          )}
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {evento.valor != null && (
              <Badge variant="secondary" className="text-[10px] py-0">
                Score: {evento.valor}
              </Badge>
            )}
            {m.sentimento && (
              <Badge variant="outline" className="text-[10px] py-0">
                {m.sentimento}
              </Badge>
            )}
          </div>
        </>
      );
    }
    case "comunicacao_giftback": {
      return (
        <>
          <p className="text-xs text-muted-foreground">{evento.descricao}</p>
          {m.is_teste && (
            <Badge variant="outline" className="text-[10px] py-0 mt-1.5">
              teste
            </Badge>
          )}
        </>
      );
    }
    default:
      return <p className="text-xs text-muted-foreground line-clamp-2">{evento.descricao}</p>;
  }
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}:
      </div>
      <div className={`text-xs text-foreground truncate ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

export const TIPOS_EVENTO_OPCOES: { value: string; label: string }[] = [
  { value: "compra", label: "Compras" },
  { value: "giftback_credito", label: "Giftback gerado" },
  { value: "giftback_debito", label: "Giftback usado" },
  { value: "giftback_expirado", label: "Giftback expirado" },
  { value: "campanha", label: "Campanhas" },
  { value: "mensagem", label: "Conversas" },
  { value: "fluxo", label: "Fluxos" },
  { value: "satisfacao", label: "Satisfação" },
  { value: "comunicacao_giftback", label: "Comunicação Giftback" },
];
