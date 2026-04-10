import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { AudioRecorder } from "./AudioRecorder";
import { AttachmentButton } from "./AttachmentButton";

interface ChatInputProps {
  onSend: (text: string) => void;
  onSendAudio?: (blob: Blob) => void;
  onSendAttachment?: (file: File) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, onSendAudio, onSendAttachment, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    ref.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-1 p-3 border-t border-border bg-card">
      {onSendAttachment && (
        <AttachmentButton onSelect={onSendAttachment} disabled={disabled} />
      )}
      <Textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Digite uma mensagem..."
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
