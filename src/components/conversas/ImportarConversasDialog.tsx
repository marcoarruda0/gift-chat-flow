import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, X, CheckCircle2, AlertCircle, Image, Mic, Video, File } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Step = "html" | "media" | "done";

interface HtmlFilePreview {
  file: File;
  telefone: string | null;
  totalMensagens: number;
  status: "pending" | "importing" | "done" | "error";
  error?: string;
  result?: {
    contato_nome: string;
    conversa_id: string;
    total_mensagens: number;
    total_duplicadas?: number;
    midias_pendentes?: string[];
  };
}

function extractHtmlPreview(content: string): { telefone: string | null; totalMensagens: number } {
  let telefone: string | null = null;
  const h3Match = content.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (h3Match) {
    const phoneMatch = h3Match[1].match(/\+?\d[\d\s\-().]+/);
    if (phoneMatch) telefone = phoneMatch[0].replace(/\D/g, "");
  }

  // Count date markers as message count approximation
  const dateMatches = content.match(/<p\s+class=['"]date['"]/gi);
  return { telefone, totalMensagens: dateMatches?.length || 0 };
}

function extractTxtPreview(content: string): { telefone: string | null; totalMensagens: number } {
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
  const [step, setStep] = useState<Step>("html");
  const [files, setFiles] = useState<HtmlFilePreview[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [allPendingMedia, setAllPendingMedia] = useState<{ conversaId: string; filenames: string[] }[]>([]);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaProgress, setMediaProgress] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList) => {
    const newFiles: HtmlFilePreview[] = [];
    for (const file of Array.from(fileList)) {
      const isHtml = file.name.endsWith(".html") || file.name.endsWith(".htm");
      const isTxt = file.name.endsWith(".txt");
      if (!isHtml && !isTxt) continue;
      const content = await file.text();
      const info = isHtml ? extractHtmlPreview(content) : extractTxtPreview(content);
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
    const pendingMediaCollected: { conversaId: string; filenames: string[] }[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.status === "done") { completed++; continue; }

      setFiles(prev => prev.map((ff, idx) => idx === i ? { ...ff, status: "importing" } : ff));

      try {
        const content = await f.file.text();
        const isHtml = f.file.name.endsWith(".html") || f.file.name.endsWith(".htm");
        const endpoint = isHtml ? "importar-conversas-html" : "importar-conversas";

        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content, filename: f.file.name }),
        });

        const data = await res.json();
        if (!res.ok) {
          setFiles(prev => prev.map((ff, idx) => idx === i ? { ...ff, status: "error", error: data.error || "Erro desconhecido" } : ff));
        } else {
          const midias = data.midias_pendentes || [];
          if (midias.length > 0 && data.conversa_id) {
            pendingMediaCollected.push({ conversaId: data.conversa_id, filenames: midias });
          }
          setFiles(prev => prev.map((ff, idx) => idx === i ? {
            ...ff, status: "done",
            result: {
              contato_nome: data.contato_nome,
              conversa_id: data.conversa_id,
              total_mensagens: data.total_mensagens,
              total_duplicadas: data.total_duplicadas || 0,
              midias_pendentes: midias,
            },
          } : ff));
        }
      } catch {
        setFiles(prev => prev.map((ff, idx) => idx === i ? { ...ff, status: "error", error: "Erro de rede" } : ff));
      }

      completed++;
      setProgress(Math.round((completed / files.length) * 100));
    }

    setImporting(false);
    onComplete();

    const totalPending = pendingMediaCollected.reduce((s, p) => s + p.filenames.length, 0);
    if (totalPending > 0) {
      setAllPendingMedia(pendingMediaCollected);
      setStep("media");
      toast.success(`Mensagens importadas! ${totalPending} mídia(s) pendente(s).`);
    } else {
      setStep("done");
      toast.success("Importação concluída!");
    }
  };

  const handleMediaFiles = (fileList: FileList) => {
    setMediaFiles(prev => [...prev, ...Array.from(fileList)]);
  };

  const totalPendingMedia = allPendingMedia.reduce((s, p) => s + p.filenames.length, 0);
  const allPendingFilenames = allPendingMedia.flatMap(p => p.filenames);

  const matchedMedia = mediaFiles.filter(f => allPendingFilenames.includes(f.name));

  const handleUploadMedia = async () => {
    setUploadingMedia(true);
    setMediaProgress(0);
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) { toast.error("Sessão expirada"); setUploadingMedia(false); return; }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    let uploaded = 0;
    let errors = 0;

    for (const pending of allPendingMedia) {
      for (const filename of pending.filenames) {
        const file = mediaFiles.find(f => f.name === filename);
        if (!file) continue;

        try {
          const formData = new FormData();
          formData.append("conversa_id", pending.conversaId);
          formData.append("media_filename", filename);
          formData.append("file", file);

          const res = await fetch(`https://${projectId}.supabase.co/functions/v1/upload-midia-importada`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          if (res.ok) uploaded++;
          else errors++;
        } catch {
          errors++;
        }

        setMediaProgress(Math.round(((uploaded + errors) / matchedMedia.length) * 100));
      }
    }

    setUploadingMedia(false);
    setStep("done");
    toast.success(`${uploaded} mídia(s) enviada(s)${errors > 0 ? `, ${errors} erro(s)` : ""}`);
    onComplete();
  };

  const handleClose = () => {
    if (importing || uploadingMedia) return;
    setFiles([]);
    setProgress(0);
    setStep("html");
    setAllPendingMedia([]);
    setMediaFiles([]);
    setMediaProgress(0);
    onOpenChange(false);
  };

  const pendingFiles = files.filter(f => f.status === "pending");
  const totalMsgs = files.reduce((sum, f) => sum + f.totalMensagens, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "html" && "Importar Histórico de Conversas"}
            {step === "media" && "Enviar Mídias"}
            {step === "done" && "Importação Concluída"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {step === "html" && (
            <>
              <p className="text-sm text-muted-foreground">
                Faça upload de arquivos <strong>.html</strong> ou <strong>.txt</strong> exportados pelo Wondershare. Cada arquivo corresponde a um contato.
              </p>

              {!importing && (
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Clique para selecionar arquivos .html ou .txt</p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".html,.htm,.txt"
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
                          {f.result && ` · ${f.result.contato_nome} · ${f.result.total_mensagens} inseridas`}
                          {f.result?.total_duplicadas ? ` · ${f.result.total_duplicadas} duplicadas` : ""}
                          {f.result?.midias_pendentes?.length ? ` · ${f.result.midias_pendentes.length} mídias` : ""}
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
            </>
          )}

          {step === "media" && (
            <>
              <p className="text-sm text-muted-foreground">
                Foram encontradas <strong>{totalPendingMedia}</strong> referências de mídia. Selecione os arquivos da pasta de exportação para enviá-los.
              </p>

              {!uploadingMedia && (
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => mediaInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Selecione os arquivos de mídia</p>
                  <p className="text-xs text-muted-foreground mt-1">Fotos, áudios, vídeos, documentos</p>
                  <input
                    ref={mediaInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => e.target.files && handleMediaFiles(e.target.files)}
                  />
                </div>
              )}

              {mediaFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {matchedMedia.length} de {totalPendingMedia} mídias encontradas · {mediaFiles.length} arquivos selecionados
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {matchedMedia.slice(0, 20).map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        {f.type.startsWith("image") && <Image className="h-3 w-3 shrink-0" />}
                        {f.type.startsWith("audio") && <Mic className="h-3 w-3 shrink-0" />}
                        {f.type.startsWith("video") && <Video className="h-3 w-3 shrink-0" />}
                        {!f.type.startsWith("image") && !f.type.startsWith("audio") && !f.type.startsWith("video") && <File className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-muted-foreground/60">{(f.size / 1024).toFixed(0)}KB</span>
                      </div>
                    ))}
                    {matchedMedia.length > 20 && (
                      <p className="text-xs text-muted-foreground">...e mais {matchedMedia.length - 20}</p>
                    )}
                  </div>
                </div>
              )}

              {uploadingMedia && <Progress value={mediaProgress} className="h-2" />}
            </>
          )}

          {step === "done" && (
            <div className="text-center py-4">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Importação finalizada com sucesso!</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "html" && (
            <>
              <Button variant="outline" onClick={handleClose} disabled={importing}>Cancelar</Button>
              <Button onClick={handleImport} disabled={importing || pendingFiles.length === 0}>
                {importing ? "Importando..." : `Importar ${pendingFiles.length} arquivo(s)`}
              </Button>
            </>
          )}
          {step === "media" && (
            <>
              <Button variant="outline" onClick={() => { setStep("done"); toast.info("Mídias não enviadas — ficarão como placeholder."); }}>
                Pular
              </Button>
              <Button onClick={handleUploadMedia} disabled={uploadingMedia || matchedMedia.length === 0}>
                {uploadingMedia ? "Enviando..." : `Enviar ${matchedMedia.length} mídia(s)`}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={handleClose}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
