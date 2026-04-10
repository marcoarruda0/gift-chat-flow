import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { FileDown } from "lucide-react";

interface MessageBubbleProps {
  conteudo: string;
  remetente: string;
  tipo: string;
  createdAt: string;
}

export function MessageBubble({ conteudo, remetente, tipo, createdAt }: MessageBubbleProps) {
  const isOutgoing = remetente === "atendente" || remetente === "bot";

  const renderContent = () => {
    switch (tipo) {
      case "audio":
        return <audio controls src={conteudo} className="max-w-[240px]" />;
      case "imagem":
        return (
          <a href={conteudo} target="_blank" rel="noopener noreferrer">
            <img src={conteudo} alt="Imagem" className="max-w-[240px] rounded-lg" loading="lazy" />
          </a>
        );
      case "documento":
        return (
          <a
            href={conteudo}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 underline text-xs"
          >
            <FileDown className="h-4 w-4 shrink-0" />
            <span className="truncate">{conteudo.split("/").pop() || "Documento"}</span>
          </a>
        );
      default:
        return <p className="whitespace-pre-wrap break-words">{conteudo}</p>;
    }
  };

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
        {renderContent()}
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
