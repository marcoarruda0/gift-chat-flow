import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ArrowLeft, CheckCircle2, MessageSquare, ArrowRightLeft, MailOpen, Building2, User, HandMetal, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Mensagem {
  id: string;
  conteudo: string;
  remetente: string;
  tipo: string;
  created_at: string;
  metadata?: Record<string, any> | null;
  status_entrega?: string | null;
  status_entrega_at?: string | null;
}

interface ChatPanelProps {
  contatoNome: string;
  contatoTelefone: string | null;
  contatoAvatar?: string | null;
  departamentoNome?: string | null;
  atendenteNome?: string | null;
  mensagens: Mensagem[];
  onSend: (text: string) => void;
  onSendAudio?: (blob: Blob) => void;
  onSendAttachment?: (file: File) => void;
  onClose: () => void;
  onBack?: () => void;
  onTransfer?: () => void;
  onMarkUnread?: () => void;
  loading: boolean;
  isAssignedToMe?: boolean;
  onPull?: () => void;
  canal?: string;
  cloudWindowBlocked?: boolean;
  onSendTemplate?: () => void;
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

export function ChatPanel({ contatoNome, contatoTelefone, contatoAvatar, departamentoNome, atendenteNome, mensagens, onSend, onSendAudio, onSendAttachment, onClose, onBack, onTransfer, onMarkUnread, loading, isAssignedToMe, onPull, canal, cloudWindowBlocked, onSendTemplate }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const initials = contatoNome.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
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
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          {canal === "whatsapp_cloud" && (
            <Badge variant="default" className="text-xs gap-1 font-normal">
              Oficial
            </Badge>
          )}
          {departamentoNome && (
            <Badge variant="secondary" className="text-xs gap-1 font-normal">
              <Building2 className="h-3 w-3" />
              {departamentoNome}
            </Badge>
          )}
          {atendenteNome && (
            <Badge variant="outline" className="text-xs gap-1 font-normal">
              <User className="h-3 w-3" />
              {atendenteNome}
            </Badge>
          )}
        </div>
        {onTransfer && (
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onTransfer} title="Transferir conversa">
            <ArrowRightLeft className="h-4 w-4" />
          </Button>
        )}
        {onMarkUnread && (
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onMarkUnread} title="Marcar como não lida">
            <MailOpen className="h-4 w-4" />
          </Button>
        )}
        {isAssignedToMe && (
          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={onClose} title="Encerrar conversa">
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-4 py-3">
        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-8">Carregando mensagens...</div>
        ) : mensagens.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem ainda</div>
        ) : (
          mensagens.map(m => (
            <MessageBubble
              key={m.id}
              conteudo={m.conteudo}
              remetente={m.remetente}
              tipo={m.tipo}
              createdAt={m.created_at}
              senderName={m.metadata?.senderName}
              senderAvatar={m.metadata?.senderAvatar}
              metadata={m.metadata}
              statusEntrega={m.status_entrega}
              canal={canal}
            />
          ))
        )}
        <div ref={bottomRef} />
      </ScrollArea>

      {isAssignedToMe ? (
        cloudWindowBlocked ? (
          <div className="px-4 py-4 border-t border-border bg-muted/50">
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <p className="text-sm font-medium text-foreground">
                Janela de 24h expirada
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                O WhatsApp Oficial só permite mensagens livres por 24h após a última mensagem do contato. Use um template aprovado para reabrir a conversa.
              </p>
              {onSendTemplate && (
                <Button onClick={onSendTemplate} className="gap-2 mt-1">
                  <FileText className="h-4 w-4" />
                  Enviar template
                </Button>
              )}
            </div>
          </div>
        ) : (
          <ChatInput onSend={onSend} onSendAudio={onSendAudio} onSendAttachment={onSendAttachment} />
        )
      ) : (
        <div className="px-4 py-4 border-t border-border bg-muted/50">
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-sm text-muted-foreground text-center">
              Você precisa puxar esta conversa para poder responder
            </p>
            <Button onClick={onPull} className="gap-2">
              <HandMetal className="h-4 w-4" />
              Puxar Conversa
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
