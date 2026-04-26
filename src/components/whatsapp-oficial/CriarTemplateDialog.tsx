import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, AlertCircle, Upload, Image as ImageIcon, Video as VideoIcon, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { TemplateVariablesGuide } from "./TemplateVariablesGuide";
import { TemplatePreview } from "./TemplatePreview";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

interface ButtonItem {
  type: "QUICK_REPLY" | "URL";
  text: string;
  url?: string;
}

type HeaderKind = "NONE" | "TEXT" | "IMAGE" | "VIDEO";

interface CriarTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const NAME_REGEX = /^[a-z0-9_]{1,512}$/;
// Limites Meta (https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media#supported-media-types)
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const VIDEO_MAX_BYTES = 16 * 1024 * 1024; // 16MB
const ACCEPT_IMAGE = "image/jpeg,image/png";
const ACCEPT_VIDEO = "video/mp4";

function countPlaceholders(text: string): number {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return 0;
  const nums = matches.map((m) => parseInt(m.replace(/[^0-9]/g, ""), 10));
  return Math.max(0, ...nums);
}

export function CriarTemplateDialog({ open, onOpenChange, onCreated }: CriarTemplateDialogProps) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("pt_BR");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING" | "AUTHENTICATION">("UTILITY");

  const [headerType, setHeaderType] = useState<HeaderKind>("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerExample, setHeaderExample] = useState("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState<string>("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const headerInputRef = useRef<HTMLInputElement | null>(null);

  /** Insere texto na posição atual do cursor (ou no final). */
  const insertAtCursor = (
    el: HTMLInputElement | HTMLTextAreaElement | null,
    current: string,
    insert: string,
    setter: (v: string) => void,
  ) => {
    if (!el) {
      setter(current + insert);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + insert + current.slice(end);
    setter(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const [body, setBody] = useState("");
  const [bodyExamples, setBodyExamples] = useState<string[]>([]);

  const [footer, setFooter] = useState("");

  const [buttons, setButtons] = useState<ButtonItem[]>([]);

  const [submitting, setSubmitting] = useState(false);

  const bodyPlaceholders = countPlaceholders(body);
  // Sync body examples length with placeholder count
  if (bodyExamples.length !== bodyPlaceholders) {
    const next = [...bodyExamples];
    while (next.length < bodyPlaceholders) next.push("");
    next.length = bodyPlaceholders;
    setBodyExamples(next);
  }

  const headerPlaceholders = headerType === "TEXT" ? countPlaceholders(headerText) : 0;
  const isMediaHeader = headerType === "IMAGE" || headerType === "VIDEO";

  const reset = () => {
    setName("");
    setLanguage("pt_BR");
    setCategory("UTILITY");
    setHeaderType("NONE");
    setHeaderText("");
    setHeaderExample("");
    setHeaderMediaUrl("");
    setBody("");
    setBodyExamples([]);
    setFooter("");
    setButtons([]);
  };

  const handleHeaderTypeChange = (v: HeaderKind) => {
    setHeaderType(v);
    // Limpa campos não pertinentes quando muda o tipo
    if (v !== "TEXT") {
      setHeaderText("");
      setHeaderExample("");
    }
    if (v !== "IMAGE" && v !== "VIDEO") {
      setHeaderMediaUrl("");
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;

    const isImage = headerType === "IMAGE";
    const maxBytes = isImage ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
    const allowed = isImage ? ["image/jpeg", "image/png"] : ["video/mp4"];

    if (!allowed.includes(file.type)) {
      toast.error(
        isImage
          ? "Formato inválido. Use JPG ou PNG."
          : "Formato inválido. Use MP4.",
      );
      e.target.value = "";
      return;
    }
    if (file.size > maxBytes) {
      toast.error(
        `Arquivo muito grande. Limite: ${isImage ? "5MB" : "16MB"}.`,
      );
      e.target.value = "";
      return;
    }

    setUploadingMedia(true);
    try {
      const ext = file.name.split(".").pop() || (isImage ? "jpg" : "mp4");
      const path = `template-headers/${tenantId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
      setHeaderMediaUrl(pub.publicUrl);
      toast.success("Mídia carregada.");
    } catch (err: any) {
      toast.error("Falha no upload: " + (err?.message || String(err)));
    } finally {
      setUploadingMedia(false);
      e.target.value = "";
    }
  };

  const validate = (): string | null => {
    if (!NAME_REGEX.test(name)) return "Nome deve ter apenas minúsculas, números e _ (até 512 chars).";
    if (!body.trim()) return "Corpo é obrigatório.";
    if (headerType === "TEXT" && !headerText.trim()) return "Texto do cabeçalho é obrigatório quando o tipo é Texto.";
    if (headerPlaceholders > 1) return "Cabeçalho de texto suporta no máximo 1 placeholder {{1}}.";
    if (headerPlaceholders === 1 && !headerExample.trim()) return "Forneça o exemplo do cabeçalho.";
    if (isMediaHeader && !headerMediaUrl) return "Faça upload da mídia do cabeçalho antes de enviar.";
    if (bodyExamples.some((e) => !e.trim())) return "Preencha um exemplo para cada placeholder do corpo.";
    if (footer.length > 60) return "Rodapé pode ter no máximo 60 caracteres.";
    if (buttons.length > 3) return "Máximo de 3 botões.";
    for (const b of buttons) {
      if (!b.text.trim()) return "Texto de botão obrigatório.";
      if (b.type === "URL" && !b.url?.trim()) return "URL é obrigatória para botão do tipo URL.";
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    if (!tenantId) return;

    setSubmitting(true);
    try {
      const components: any[] = [];

      if (headerType === "TEXT") {
        const header: any = { type: "HEADER", format: "TEXT", text: headerText };
        if (headerPlaceholders === 1) {
          header.example = { header_text: [headerExample] };
        }
        components.push(header);
      } else if (isMediaHeader && headerMediaUrl) {
        components.push({
          type: "HEADER",
          format: headerType, // "IMAGE" | "VIDEO"
          example: { header_handle: [headerMediaUrl] },
          // Campo nosso (preservado no snapshot local) usado em todos os envios.
          media_url: headerMediaUrl,
        });
      }

      const bodyComp: any = { type: "BODY", text: body };
      if (bodyPlaceholders > 0) {
        bodyComp.example = { body_text: [bodyExamples] };
      }
      components.push(bodyComp);

      if (footer.trim()) {
        components.push({ type: "FOOTER", text: footer });
      }

      if (buttons.length > 0) {
        components.push({
          type: "BUTTONS",
          buttons: buttons.map((b) =>
            b.type === "URL" ? { type: "URL", text: b.text, url: b.url } : { type: "QUICK_REPLY", text: b.text }
          ),
        });
      }

      // Call proxy
      const { data: session } = await supabase.auth.getSession();
      const url = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-cloud-proxy`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          endpoint: "message_templates",
          method: "POST",
          useWabaId: true,
          // Limpa campos internos antes de enviar à Meta (media_url é nosso)
          data: {
            name,
            language,
            category,
            components: components.map((c) => {
              const { media_url, ...rest } = c as any;
              return rest;
            }),
          },
        }),
      });
      const result = await res.json();
      const metaErr = result?.error?.message || result?.error?.error_user_msg;
      if (metaErr || !result?.id) {
        throw new Error(metaErr || JSON.stringify(result));
      }

      // Save locally (com media_url preservado)
      await supabase.from("whatsapp_cloud_templates" as any).upsert(
        {
          tenant_id: tenantId,
          meta_template_id: result.id,
          name,
          language,
          category,
          status: result.status || "PENDING",
          components,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,name,language" }
      );

      toast.success("Template enviado para aprovação. Pode levar até 24h.");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error("Falhou: " + e.message);
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo template WhatsApp</DialogTitle>
          <DialogDescription>
            Templates passam por aprovação da Meta (até 24h) antes de poderem ser usados em campanhas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 py-2">
          <div className="md:col-span-3 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder="ex: boas_vindas"
              />
              <p className="text-xs text-muted-foreground">Minúsculas, números e _</p>
            </div>
            <div className="space-y-2">
              <Label>Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en_US">English (US)</SelectItem>
                  <SelectItem value="es_ES">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UTILITY">Utilitário (transacional)</SelectItem>
                <SelectItem value="MARKETING">Marketing (campanhas)</SelectItem>
                <SelectItem value="AUTHENTICATION">Autenticação (códigos OTP)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Cabeçalho</Label>
              <Select value={headerType} onValueChange={(v) => handleHeaderTypeChange(v as HeaderKind)}>
                <SelectTrigger className="w-44 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sem cabeçalho</SelectItem>
                  <SelectItem value="TEXT">Texto</SelectItem>
                  <SelectItem value="IMAGE">Imagem (JPG/PNG)</SelectItem>
                  <SelectItem value="VIDEO">Vídeo (MP4)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {headerType === "TEXT" && (
              <>
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="ex: Olá {{1}}"
                  maxLength={60}
                />
                {headerPlaceholders === 1 && (
                  <Input
                    value={headerExample}
                    onChange={(e) => setHeaderExample(e.target.value)}
                    placeholder="Exemplo para {{1}} (ex: Maria)"
                  />
                )}
              </>
            )}

            {isMediaHeader && (
              <div className="space-y-3">
                {headerMediaUrl ? (
                  <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
                    {headerType === "IMAGE" ? (
                      <img
                        src={headerMediaUrl}
                        alt="Pré-visualização do cabeçalho"
                        className="max-h-48 rounded-md object-contain mx-auto"
                      />
                    ) : (
                      <video
                        src={headerMediaUrl}
                        controls
                        className="max-h-48 rounded-md mx-auto"
                      />
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground truncate">
                        Mídia carregada com sucesso.
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => setHeaderMediaUrl("")}
                      >
                        <X className="h-3 w-3 mr-1" /> Remover
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 flex flex-col items-center justify-center gap-2 text-center">
                    {headerType === "IMAGE" ? (
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    ) : (
                      <VideoIcon className="h-8 w-8 text-muted-foreground" />
                    )}
                    <p className="text-xs text-muted-foreground">
                      {headerType === "IMAGE"
                        ? "JPG ou PNG, até 5MB"
                        : "MP4, até 16MB"}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingMedia}
                    >
                      {uploadingMedia ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3 mr-1" />
                      )}
                      Selecionar arquivo
                    </Button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={headerType === "IMAGE" ? ACCEPT_IMAGE : ACCEPT_VIDEO}
                  onChange={handleMediaUpload}
                  className="hidden"
                />
                <p className="text-xs text-muted-foreground">
                  A mesma mídia será enviada para todos os destinatários ao usar este template.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Corpo *</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Use {{1}}, {{2}} para variáveis.\nEx: Seu pedido {{1}} foi confirmado."}
              rows={4}
            />
            {bodyPlaceholders > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-muted-foreground">Exemplos para os placeholders:</p>
                {bodyExamples.map((ex, i) => (
                  <Input
                    key={i}
                    value={ex}
                    onChange={(e) => {
                      const next = [...bodyExamples];
                      next[i] = e.target.value;
                      setBodyExamples(next);
                    }}
                    placeholder={`Exemplo para {{${i + 1}}}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Rodapé (opcional, máx 60 chars)</Label>
            <Input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} placeholder="ex: Loja Exemplo" />
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Botões (até 3)</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setButtons([...buttons, { type: "QUICK_REPLY", text: "" }])}
                disabled={buttons.length >= 3}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            </div>
            {buttons.map((b, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Select
                  value={b.type}
                  onValueChange={(v) => {
                    const next = [...buttons];
                    next[i] = { ...next[i], type: v as any };
                    setButtons(next);
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUICK_REPLY">Resposta</SelectItem>
                    <SelectItem value="URL">URL</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={b.text}
                  onChange={(e) => {
                    const next = [...buttons];
                    next[i].text = e.target.value;
                    setButtons(next);
                  }}
                  placeholder="Texto do botão"
                  maxLength={25}
                />
                {b.type === "URL" && (
                  <Input
                    value={b.url || ""}
                    onChange={(e) => {
                      const next = [...buttons];
                      next[i].url = e.target.value;
                      setButtons(next);
                    }}
                    placeholder="https://..."
                  />
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setButtons(buttons.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 text-xs text-muted-foreground bg-muted/40 p-3 rounded">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Após enviar, a Meta analisa o template (até 24h). Templates com mídia podem demorar mais e
              serem rejeitados se a qualidade for baixa.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Enviar para aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
