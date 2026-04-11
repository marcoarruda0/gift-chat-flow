import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { AudioRecorder } from "./AudioRecorder";
import { AttachmentButton } from "./AttachmentButton";
import { RespostasRapidasPopup } from "./RespostasRapidasPopup";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ChatInputProps {
  onSend: (text: string) => void;
  onSendAudio?: (blob: Blob) => void;
  onSendAttachment?: (file: File) => void;
  disabled?: boolean;
}

interface RespostaRapida {
  id: string;
  atalho: string;
  conteudo: string;
}

export function ChatInput({ onSend, onSendAudio, onSendAttachment, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const { profile } = useAuth();
  const [respostas, setRespostas] = useState<RespostaRapida[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const loadedRef = useRef(false);

  // Load respostas rapidas once
  useEffect(() => {
    if (!profile?.tenant_id || loadedRef.current) return;
    loadedRef.current = true;
    supabase
      .from("respostas_rapidas")
      .select("id, atalho, conteudo")
      .eq("tenant_id", profile.tenant_id)
      .order("atalho")
      .then(({ data }) => {
        if (data) setRespostas(data as RespostaRapida[]);
      });
  }, [profile?.tenant_id]);

  // Detect slash command
  useEffect(() => {
    const match = text.match(/(^|\s)\/(\S*)$/);
    if (match && respostas.length > 0) {
      setSlashFilter(match[2]);
      setShowPopup(true);
    } else {
      setShowPopup(false);
    }
  }, [text, respostas.length]);

  const handleSelectResposta = (conteudo: string) => {
    // Replace /command with content
    const newText = text.replace(/(^|\s)\/\S*$/, (match, prefix) => prefix + conteudo);
    setText(newText);
    setShowPopup(false);
    ref.current?.focus();
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    ref.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showPopup) return; // let popup handle keys
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative flex items-end gap-1 p-3 border-t border-border bg-card">
      {showPopup && (
        <RespostasRapidasPopup
          respostas={respostas}
          filter={slashFilter}
          onSelect={handleSelectResposta}
        />
      )}
      {onSendAttachment && (
        <AttachmentButton onSelect={onSendAttachment} disabled={disabled} />
      )}
      <Textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Digite uma mensagem... (/ para atalhos)"
        disabled={disabled}
        className="min-h-[40px] max-h-[120px] resize-none flex-1"
        rows={1}
      />
      {text.trim() ? (
        <Button size="icon" onClick={handleSend} disabled={disabled}>
          <Send className="h-4 w-4" />
        </Button>
      ) : (
        onSendAudio && <AudioRecorder onSend={onSendAudio} disabled={disabled} />
      )}
    </div>
  );
}
