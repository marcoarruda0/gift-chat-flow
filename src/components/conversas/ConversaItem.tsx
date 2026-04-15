import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { UserRound, MessageCircle, CheckCircle2, UserCheck } from "lucide-react";

interface ConversaItemProps {
  id: string;
  nomeContato: string;
  avatarUrl?: string | null;
  ultimoTexto: string | null;
  ultimaMsgAt: string | null;
  naoLidas: number;
  status: string;
  aguardandoHumano?: boolean;
  marcadaNaoLida?: boolean;
  atendenteId?: string | null;
  createdAt?: string | null;
  selected: boolean;
  onClick: () => void;
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
}

export function ConversaItem({ nomeContato, avatarUrl, ultimoTexto, ultimaMsgAt, naoLidas, status, aguardandoHumano, marcadaNaoLida, atendenteId, createdAt, selected, onClick }: ConversaItemProps) {
  const initials = nomeContato.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const hasUnread = naoLidas > 0;
  const isWaiting = status === "aberta" && !atendenteId && createdAt;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/50 border-b border-border overflow-hidden",
        selected && "bg-accent"
      )}
    >
      <Avatar className="h-12 w-12 shrink-0">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={nomeContato} />}
        <AvatarFallback className="bg-primary/10 text-primary text-sm">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm text-foreground truncate flex-1 min-w-0 flex items-center gap-1">
            {status === "fechada" ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <MessageCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
            )}
            {aguardandoHumano && <UserRound className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
            {atendenteId && <UserCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
            {nomeContato}
          </span>
          <span className={cn(
            "text-[11px] whitespace-nowrap shrink-0",
            hasUnread ? "text-[#25D366] font-semibold" : "text-muted-foreground"
          )}>
            {formatTime(ultimaMsgAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
            {isWaiting && (
              <span className="text-amber-500 font-medium mr-1">⏱ {formatDistanceToNow(new Date(createdAt), { locale: ptBR, addSuffix: false })}</span>
            )}
            {ultimoTexto || "Sem mensagens"}
          </span>
          {hasUnread ? (
            <span className="shrink-0 h-[20px] min-w-[20px] flex items-center justify-center rounded-full text-[11px] font-bold bg-[#25D366] text-white px-1.5">
              {naoLidas}
            </span>
          ) : marcadaNaoLida ? (
            <span className="shrink-0 h-[10px] w-[10px] rounded-full bg-[#25D366]" />
          ) : null}
        </div>
      </div>
    </button>
  );
}
