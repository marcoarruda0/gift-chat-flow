import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioRecorderProps {
  onSend: (blob: Blob) => void;
  disabled?: boolean;
}

export function AudioRecorder({ onSend, disabled }: AudioRecorderProps) {
  const [state, setState] = useState<"idle" | "recording" | "sending">("idle");
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "audio/ogg" });
        setState("sending");
        onSend(blob);
        setTimeout(() => setState("idle"), 500);
      };

      mediaRecorder.current = recorder;
      recorder.start();
      setState("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      console.warn("Microphone access denied");
    }
  }, [onSend]);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    mediaRecorder.current?.stop();
  }, []);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (state === "sending") {
    return (
      <Button size="icon" variant="ghost" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (state === "recording") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-destructive font-mono animate-pulse">● {formatTime(elapsed)}</span>
        <Button size="icon" variant="destructive" onClick={stopRecording} className="h-8 w-8">
          <Square className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <Button size="icon" variant="ghost" onClick={startRecording} disabled={disabled} className="h-9 w-9">
      <Mic className="h-4 w-4" />
    </Button>
  );
}
