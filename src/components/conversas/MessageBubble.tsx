import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface MessageBubbleProps {
  conteudo: string;
  remetente: string;
  createdAt: string;
}

export function MessageBubble({ conteudo, remetente, createdAt }: MessageBubbleProps) {
  const isOutgoing = remetente === "atendente" || remetente === "bot";

  return (
    <div className={cn("flex mb-2", isOutgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
          isOutgoing
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-secondary text-secondary-foreground rounded-bl-md"
        )}
      >
        {remetente === "bot" && (
          <span className="text-[10px] font-medium opacity-70 block mb-0.5">Bot</span>
        )}
        <p className="whitespace-pre-wrap break-words">{conteudo}</p>
        <span className={cn(
          "text-[10px] mt-1 block text-right",
          isOutgoing ? "opacity-70" : "text-muted-foreground"
        )}>
          {format(new Date(createdAt), "HH:mm")}
        </span>
      </div>
    </div>
  );
}
