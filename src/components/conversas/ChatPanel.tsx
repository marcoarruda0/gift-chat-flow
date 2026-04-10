import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ArrowLeft, Phone, X } from "lucide-react";
import { MessageSquare } from "lucide-react";

interface Mensagem {
  id: string;
  conteudo: string;
  remetente: string;
  tipo: string;
  created_at: string;
}

interface ChatPanelProps {
  contatoNome: string;
  contatoTelefone: string | null;
  contatoAvatar?: string | null;
  mensagens: Mensagem[];
  onSend: (text: string) => void;
  onClose: () => void;
  onBack?: () => void;
  loading: boolean;
}

export function ChatPanelEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-accent/20">
      <MessageSquare className="h-16 w-16 mb-4 opacity-30" />
      <p className="text-lg font-medium">Selecione uma conversa</p>
      <p className="text-sm">Escolha uma conversa na lista para começar</p>
    </div>
  );
}

export function ChatPanel({ contatoNome, contatoTelefone, contatoAvatar, mensagens, onSend, onClose, onBack, loading }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const initials = contatoNome.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
        {onBack && (
          <Button size="icon" variant="ghost" className="h-8 w-8 md:hidden" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-9 w-9">
          {contatoAvatar && <AvatarImage src={contatoAvatar} alt={contatoNome} />}
          <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{contatoNome}</p>
          {contatoTelefone && <p className="text-xs text-muted-foreground">{contatoTelefone}</p>}
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-8">Carregando mensagens...</div>
        ) : mensagens.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem ainda</div>
        ) : (
          mensagens.map(m => (
            <MessageBubble key={m.id} conteudo={m.conteudo} remetente={m.remetente} createdAt={m.created_at} />
          ))
        )}
        <div ref={bottomRef} />
      </ScrollArea>

      {/* Input */}
      <ChatInput onSend={onSend} />
    </div>
  );
}
