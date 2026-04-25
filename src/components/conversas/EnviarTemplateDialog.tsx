import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TemplateRow {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
  components: any;
}

interface EnviarTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (payload: {
    name: string;
    language: string;
    components: any[];
    previewText: string;
  }) => Promise<void>;
}

// Extract {{n}} placeholders from a template body string
function extractPlaceholders(text: string): number[] {
  const matches = text.matchAll(/\{\{(\d+)\}\}/g);
  const nums = new Set<number>();
  for (const m of matches) nums.add(parseInt(m[1], 10));
  return Array.from(nums).sort((a, b) => a - b);
}

export function EnviarTemplateDialog({ open, onOpenChange, onSend }: EnviarTemplateDialogProps) {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [headerVars, setHeaderVars] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !profile?.tenant_id) return;
    setLoading(true);
    supabase
      .from("whatsapp_cloud_templates")
      .select("id, name, language, category, status, components")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "APPROVED")
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          toast.error("Erro ao carregar templates");
        } else {
          setTemplates((data as TemplateRow[]) || []);
        }
        setLoading(false);
      });
  }, [open, profile?.tenant_id]);

  const selected = useMemo(
    () => templates.find(t => t.id === selectedId) || null,
    [templates, selectedId]
  );

  const bodyComponent = useMemo(
    () => (selected?.components as any[])?.find((c: any) => c.type?.toUpperCase() === "BODY"),
    [selected]
  );
  const headerComponent = useMemo(
    () => (selected?.components as any[])?.find((c: any) => c.type?.toUpperCase() === "HEADER"),
    [selected]
  );

  const bodyPlaceholders = useMemo(
    () => extractPlaceholders(bodyComponent?.text || ""),
    [bodyComponent]
  );
  const headerPlaceholders = useMemo(
    () =>
      headerComponent?.format === "TEXT"
        ? extractPlaceholders(headerComponent?.text || "")
        : [],
    [headerComponent]
  );

  // Reset on template change
  useEffect(() => {
    setVars({});
    setHeaderVars({});
  }, [selectedId]);

  const previewText = useMemo(() => {
    if (!bodyComponent?.text) return "";
    let txt = bodyComponent.text as string;
    for (const n of bodyPlaceholders) {
      const val = vars[String(n)] || `{{${n}}}`;
      txt = txt.split(`{{${n}}}`).join(val);
    }
    return txt;
  }, [bodyComponent, bodyPlaceholders, vars]);

  const canSend = !!selected && bodyPlaceholders.every(n => (vars[String(n)] || "").trim().length > 0)
    && headerPlaceholders.every(n => (headerVars[String(n)] || "").trim().length > 0);

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    try {
      // Build components array following Meta spec
      const components: any[] = [];
      if (headerPlaceholders.length > 0) {
        components.push({
          type: "header",
          parameters: headerPlaceholders.map(n => ({
            type: "text",
            text: headerVars[String(n)],
          })),
        });
      }
      if (bodyPlaceholders.length > 0) {
        components.push({
          type: "body",
          parameters: bodyPlaceholders.map(n => ({
            type: "text",
            text: vars[String(n)],
          })),
        });
      }
      await onSend({
        name: selected.name,
        language: selected.language,
        components,
        previewText,
      });
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar template aprovado</DialogTitle>
          <DialogDescription>
            Selecione um template aprovado pela Meta para reabrir a conversa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Carregando templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              Nenhum template aprovado disponível.
              <br />
              Crie e sincronize templates em Configurações &gt; WhatsApp Oficial &gt; Templates.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="font-mono">{t.name}</span>
                        <span className="text-muted-foreground ml-2">({t.language})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selected && (
                <>
                  <div className="flex gap-2 flex-wrap">
                    {selected.category && (
                      <Badge variant="secondary">{selected.category}</Badge>
                    )}
                    <Badge variant="outline">{selected.language}</Badge>
                  </div>

                  {headerPlaceholders.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-muted-foreground">Variáveis do cabeçalho</Label>
                      {headerPlaceholders.map(n => (
                        <div key={`h-${n}`} className="space-y-1">
                          <Label htmlFor={`h-${n}`} className="text-sm">Cabeçalho {`{{${n}}}`}</Label>
                          <Input
                            id={`h-${n}`}
                            value={headerVars[String(n)] || ""}
                            onChange={e => setHeaderVars(prev => ({ ...prev, [String(n)]: e.target.value }))}
                            placeholder={`Valor para {{${n}}}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {bodyPlaceholders.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-muted-foreground">Variáveis do corpo</Label>
                      {bodyPlaceholders.map(n => (
                        <div key={`b-${n}`} className="space-y-1">
                          <Label htmlFor={`b-${n}`} className="text-sm">Variável {`{{${n}}}`}</Label>
                          <Input
                            id={`b-${n}`}
                            value={vars[String(n)] || ""}
                            onChange={e => setVars(prev => ({ ...prev, [String(n)]: e.target.value }))}
                            placeholder={`Valor para {{${n}}}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {bodyComponent?.text && (
                    <div className="space-y-1">
                      <Label className="text-xs uppercase text-muted-foreground">Pré-visualização</Label>
                      <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">
                        {previewText}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={!canSend || sending}>
            {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
