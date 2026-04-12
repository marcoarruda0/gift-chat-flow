import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Smile } from "lucide-react";
import { AudioRecorder } from "./AudioRecorder";
import { AttachmentButton } from "./AttachmentButton";
import { RespostasRapidasPopup } from "./RespostasRapidasPopup";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

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
  const [emojiOpen, setEmojiOpen] = useState(false);
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
    const newText = text.replace(/(^|\s)\/\S*$/, (match, prefix) => prefix + conteudo);
    setText(newText);
    setShowPopup(false);
    ref.current?.focus();
  };

  const handleEmojiSelect = (emoji: any) => {
    const textarea = ref.current;
    if (textarea) {
      const start = textarea.selectionStart ?? text.length;
      const end = textarea.selectionEnd ?? text.length;
      const newText = text.substring(0, start) + emoji.native + text.substring(end);
      setText(newText);
      // Set cursor position after emoji
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + emoji.native.length;
        textarea.setSelectionRange(pos, pos);
      });
    } else {
      setText(prev => prev + emoji.native);
    }
    setEmojiOpen(false);
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    ref.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showPopup) return;
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
      <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" disabled={disabled}>
            <Smile className="h-5 w-5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-auto p-0 border-0">
          <Picker
            data={data}
            onEmojiSelect={handleEmojiSelect}
            locale="pt"
            theme="auto"
            previewPosition="none"
            skinTonePosition="search"
          />
        </PopoverContent>
      </Popover>
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
