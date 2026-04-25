import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

interface ButtonItem {
  type: "QUICK_REPLY" | "URL";
  text: string;
  url?: string;
}

interface CriarTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const NAME_REGEX = /^[a-z0-9_]{1,512}$/;

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

  const [headerType, setHeaderType] = useState<"NONE" | "TEXT">("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerExample, setHeaderExample] = useState("");

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

  const reset = () => {
    setName("");
    setLanguage("pt_BR");
    setCategory("UTILITY");
    setHeaderType("NONE");
    setHeaderText("");
    setHeaderExample("");
    setBody("");
    setBodyExamples([]);
    setFooter("");
    setButtons([]);
  };

  const validate = (): string | null => {
    if (!NAME_REGEX.test(name)) return "Nome deve ter apenas minúsculas, números e _ (até 512 chars).";
    if (!body.trim()) return "Corpo é obrigatório.";
    if (headerType === "TEXT" && !headerText.trim()) return "Texto do cabeçalho é obrigatório quando o tipo é Texto.";
    if (headerPlaceholders > 1) return "Cabeçalho de texto suporta no máximo 1 placeholder {{1}}.";
    if (headerPlaceholders === 1 && !headerExample.trim()) return "Forneça o exemplo do cabeçalho.";
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
          data: { name, language, category, components },
        }),
      });
      const result = await res.json();
      const metaErr = result?.error?.message || result?.error?.error_user_msg;
      if (metaErr || !result?.id) {
        throw new Error(metaErr || JSON.stringify(result));
      }

      // Save locally
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo template WhatsApp</DialogTitle>
          <DialogDescription>
            Templates passam por aprovação da Meta (até 24h) antes de poderem ser usados em campanhas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              <Select value={headerType} onValueChange={(v) => setHeaderType(v as any)}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sem cabeçalho</SelectItem>
                  <SelectItem value="TEXT">Texto</SelectItem>
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
            <span>Após enviar, a Meta analisa o template (até 24h). O status aparece como PENDING e é atualizado no próximo sync.</span>
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
