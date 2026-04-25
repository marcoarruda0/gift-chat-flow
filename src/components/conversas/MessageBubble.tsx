import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { FileDown, Image, Mic, Video, Check, CheckCheck, AlertCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MessageBubbleProps {
  conteudo: string;
  remetente: string;
  tipo: string;
  createdAt: string;
  senderName?: string | null;
  senderAvatar?: string | null;
  metadata?: Record<string, any> | null;
  statusEntrega?: string | null;
  canal?: string;
}

const NAME_COLORS = [
  "#E91E63", "#9C27B0", "#673AB7", "#3F51B5",
  "#009688", "#FF5722", "#795548", "#607D8B",
  "#2196F3", "#4CAF50", "#FF9800", "#00BCD4",
];

function getNameColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

function isPlaceholderMedia(conteudo: string): boolean {
  return /^\[(Imagem|Áudio|Vídeo|Documento)\]$/.test(conteudo);
}

export function MessageBubble({ conteudo, remetente, tipo, createdAt, senderName, senderAvatar, metadata, statusEntrega, canal }: MessageBubbleProps) {
  const isOutgoing = remetente === "atendente" || remetente === "bot";
  const showSenderIncoming = !isOutgoing && !!senderName;
  const showSenderOutgoing = isOutgoing && remetente === "atendente" && !!senderName;
  const isPending = metadata?.media_status === "pending";
  const showDeliveryStatus = isOutgoing && canal === "whatsapp_cloud" && !!statusEntrega;
  const deliveryError = metadata?.delivery_errors?.[0]?.message
    || metadata?.delivery_errors?.[0]?.title
    || metadata?.wa_errors?.[0]?.message;

  const renderDeliveryIcon = () => {
    if (!showDeliveryStatus) return null;
    const baseClass = "h-3 w-3 inline-block ml-1 align-text-bottom";
    if (statusEntrega === "failed") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertCircle className={cn(baseClass, "text-destructive")} />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-xs">{deliveryError || "Falha no envio"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (statusEntrega === "read") {
      return <CheckCheck className={cn(baseClass, "text-sky-300")} />;
    }
    if (statusEntrega === "delivered") {
      return <CheckCheck className={baseClass} />;
    }
    if (statusEntrega === "sent") {
      return <Check className={baseClass} />;
    }
    return null;
  };

  const renderContent = () => {
    // Pending media placeholder
    if (isPending && isPlaceholderMedia(conteudo)) {
      const iconClass = "h-5 w-5 opacity-50";
      return (
        <div className="flex items-center gap-2 text-xs opacity-60 italic">
          {tipo === "audio" && <Mic className={iconClass} />}
          {tipo === "imagem" && <Image className={iconClass} />}
          {tipo === "video" && <Video className={iconClass} />}
          {tipo === "documento" && <FileDown className={iconClass} />}
          <span>{conteudo.replace("[", "").replace("]", "")} pendente</span>
        </div>
      );
    }

    switch (tipo) {
      case "audio":
        return <audio controls src={conteudo} className="max-w-[240px]" />;
      case "imagem":
        return (
          <a href={conteudo} target="_blank" rel="noopener noreferrer">
            <img src={conteudo} alt="Imagem" className="max-w-[240px] rounded-lg" loading="lazy" />
          </a>
        );
      case "video":
        return (
          <video controls src={conteudo} className="max-w-[240px] rounded-lg" />
        );
      case "documento":
        return (
          <a href={conteudo} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline text-xs">
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
      {showSenderIncoming && (
        <Avatar className="h-6 w-6 mt-1 mr-1.5 shrink-0">
          {senderAvatar && <AvatarImage src={senderAvatar} alt={senderName} />}
          <AvatarFallback className="text-[8px] bg-muted">
            {senderName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
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
        {showSenderIncoming && (
          <span className="text-[11px] font-semibold block mb-0.5" style={{ color: getNameColor(senderName) }}>
            {senderName}
          </span>
        )}
        {showSenderOutgoing && (
          <span className="text-[11px] font-bold block mb-0.5 opacity-90">
            {senderName}:
          </span>
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
