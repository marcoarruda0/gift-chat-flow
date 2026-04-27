import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Smile, Sparkles, Trash2, Loader2 } from "lucide-react";
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
  // Copiloto
  rascunho?: { id: string; conteudo: string } | null;
  copilotoAtivo?: boolean;
  onDescartarRascunho?: () => void;
  onSugerirRascunho?: () => void;
  rascunhoLoading?: boolean;
  onEnviarRascunho?: (textoFinal: string, rascunhoOriginal: string) => void;
}

interface RespostaRapida {
  id: string;
  atalho: string;
  conteudo: string;
}

export function ChatInput({
  onSend, onSendAudio, onSendAttachment, disabled,
  rascunho, copilotoAtivo, onDescartarRascunho, onSugerirRascunho, rascunhoLoading,
  onEnviarRascunho,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [rascunhoOriginal, setRascunhoOriginal] = useState<string | null>(null);
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

  // When rascunho arrives, prefill (only if textarea is empty or matches previous draft)
  useEffect(() => {
    if (!rascunho) {
      setRascunhoOriginal(null);
      return;
    }
    // Avoid overwriting user typing
    if (!text.trim() || text === rascunhoOriginal) {
      setText(rascunho.conteudo);
      setRascunhoOriginal(rascunho.conteudo);
      requestAnimationFrame(() => ref.current?.focus());
    } else {
      // user already typed something — just remember the new draft for tracking but don't overwrite
      setRascunhoOriginal(rascunho.conteudo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunho?.id]);

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
    if (rascunho && onEnviarRascunho) {
      onEnviarRascunho(trimmed, rascunhoOriginal || rascunho.conteudo);
    }
    onSend(trimmed);
    setText("");
    setRascunhoOriginal(null);
    ref.current?.focus();
  };

  const handleDescartar = () => {
    setText("");
    setRascunhoOriginal(null);
    onDescartarRascunho?.();
    ref.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showPopup) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const temRascunhoAtivo = !!rascunho && text.trim().length > 0;

  return (
    <div className="border-t border-border bg-card">
      {temRascunhoAtivo && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <Badge variant="default" className="gap-1 font-normal">
            <Sparkles className="h-3 w-3" />
            Rascunho da IA
          </Badge>
          {text !== rascunhoOriginal && (
            <span className="text-xs text-muted-foreground">editado</span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 ml-auto text-muted-foreground hover:text-destructive"
            onClick={handleDescartar}
            title="Descartar rascunho"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Descartar
          </Button>
        </div>
      )}
      <div className="relative flex items-end gap-1 p-3">
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
        {copilotoAtivo && onSugerirRascunho && (
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0"
            onClick={onSugerirRascunho}
            disabled={disabled || rascunhoLoading}
            title="Sugerir resposta com IA"
          >
            {rascunhoLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Sparkles className="h-4 w-4 text-primary" />
            )}
          </Button>
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
    </div>
  );
}
