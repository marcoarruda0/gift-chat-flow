import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, X, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FilePreview {
  file: File;
  telefone: string | null;
  totalMensagens: number;
  status: "pending" | "importing" | "done" | "error";
  error?: string;
  result?: { contato_nome: string; total_mensagens: number; total_duplicadas?: number };
}

function extractPreviewInfo(content: string): { telefone: string | null; totalMensagens: number } {
  const lines = content.split("\n");
  let telefone: string | null = null;
  const match = lines[0]?.match(/\+?\d[\d\s\-().]+/);
  if (match) telefone = match[0].replace(/\D/g, "");

  let count = 0;
  const tsRegex = /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}$/;
  for (const line of lines) {
    if (tsRegex.test(line.trim())) count++;
  }
  return { telefone, totalMensagens: count };
}

interface ImportarConversasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function ImportarConversasDialog({ open, onOpenChange, onComplete }: ImportarConversasDialogProps) {
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList) => {
    const newFiles: FilePreview[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.name.endsWith(".txt")) continue;
      const content = await file.text();
      const info = extractPreviewInfo(content);
      newFiles.push({ file, telefone: info.telefone, totalMensagens: info.totalMensagens, status: "pending" });
    }
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) { toast.error("Sessão expirada"); setImporting(false); return; }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    let completed = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.status === "done") { completed++; continue; }

      setFiles(prev => prev.map((ff, idx) => idx === i ? { ...ff, status: "importing" } : ff));

      try {
        const content = await f.file.text();
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/importar-conversas`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content, filename: f.file.name }),
        });

        const data = await res.json();
        if (!res.ok) {
          setFiles(prev => prev.map((ff, idx) => idx === i ? { ...ff, status: "error", error: data.error || "Erro desconhecido" } : ff));
        } else {
          setFiles(prev => prev.map((ff, idx) => idx === i ? {
            ...ff,
            status: "done",
            result: { contato_nome: data.contato_nome, total_mensagens: data.total_mensagens },
          } : ff));
        }
      } catch (e) {
        setFiles(prev => prev.map((ff, idx) => idx === i ? { ...ff, status: "error", error: "Erro de rede" } : ff));
      }

      completed++;
      setProgress(Math.round((completed / files.length) * 100));
    }

    setImporting(false);
    onComplete();
    toast.success("Importação concluída!");
  };

  const handleClose = () => {
    if (importing) return;
    setFiles([]);
    setProgress(0);
    onOpenChange(false);
  };

  const pendingFiles = files.filter(f => f.status === "pending");
  const totalMsgs = files.reduce((sum, f) => sum + f.totalMensagens, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Histórico de Conversas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Faça upload de arquivos <strong>.txt</strong> exportados pelo Wondershare. Cada arquivo corresponde a um contato.
          </p>

          {!importing && (
            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Clique para selecionar arquivos .txt</p>
              <input
                ref={inputRef}
                type="file"
                accept=".txt"
                multiple
                className="hidden"
                onChange={e => e.target.files && handleFiles(e.target.files)}
              />
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                {files.length} arquivo(s) · ~{totalMsgs} mensagens
              </p>
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-secondary/50 text-sm">
                  {f.status === "pending" && <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
                  {f.status === "importing" && <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />}
                  {f.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                  {f.status === "error" && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{f.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.telefone ? `Tel: ${f.telefone}` : "Telefone não detectado"} · {f.totalMensagens} msgs
                      {f.result && ` · ${f.result.contato_nome}`}
                      {f.error && <span className="text-destructive"> · {f.error}</span>}
                    </p>
                  </div>
                  {f.status === "pending" && !importing && (
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeFile(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {importing && <Progress value={progress} className="h-2" />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importing}>Cancelar</Button>
          <Button onClick={handleImport} disabled={importing || pendingFiles.length === 0}>
            {importing ? "Importando..." : `Importar ${pendingFiles.length} arquivo(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
