import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ConversaItemProps {
  id: string;
  nomeContato: string;
  avatarUrl?: string | null;
  ultimoTexto: string | null;
  ultimaMsgAt: string | null;
  naoLidas: number;
  status: string;
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

export function ConversaItem({ nomeContato, avatarUrl, ultimoTexto, ultimaMsgAt, naoLidas, status, selected, onClick }: ConversaItemProps) {
  const initials = nomeContato.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const hasUnread = naoLidas > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 border-b border-border",
        selected && "bg-accent"
      )}
    >
      <Avatar className="h-12 w-12 shrink-0">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={nomeContato} />}
        <AvatarFallback className="bg-primary/10 text-primary text-sm">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-foreground truncate">{nomeContato}</span>
          <span className={cn(
            "text-xs shrink-0 ml-2",
            hasUnread ? "text-[#25D366] font-medium" : "text-muted-foreground"
          )}>
            {formatTime(ultimaMsgAt)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{ultimoTexto || "Sem mensagens"}</span>
          {hasUnread && (
            <span className="ml-2 h-5 min-w-5 flex items-center justify-center rounded-full text-[11px] font-bold shrink-0 bg-[#25D366] text-white px-1">
              {naoLidas}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
