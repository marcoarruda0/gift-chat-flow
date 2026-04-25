import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { InsertVariableButton } from "./InsertVariableButton";

export interface TemplateCampanhaPickerProps {
  templateId: string;
  variaveis: Record<string, string>;
  onChange: (data: {
    templateId: string;
    templateName: string;
    templateLanguage: string;
    templateComponents: any[];
    variaveis: Record<string, string>;
  }) => void;
  sampleContact?: { nome?: string | null; telefone?: string | null; email?: string | null };
}

interface TemplateRow {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
  components: any;
}

function extractPlaceholders(text: string): number[] {
  const matches = (text || "").matchAll(/\{\{(\d+)\}\}/g);
  const nums = new Set<number>();
  for (const m of matches) nums.add(parseInt(m[1], 10));
  return Array.from(nums).sort((a, b) => a - b);
}

function applyContactVars(template: string, contato: any): string {
  if (!template) return "";
  let out = template;
  const map: Record<string, string> = {
    nome: contato?.nome || "Maria Silva",
    telefone: contato?.telefone || "11999999999",
    email: contato?.email || "maria@email.com",
    cpf: contato?.cpf || "",
  };
  for (const [k, v] of Object.entries(map)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "gi"), v);
  }
  return out;
}

export function TemplateCampanhaPicker({
  templateId,
  variaveis,
  onChange,
  sampleContact,
}: TemplateCampanhaPickerProps) {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    setLoading(true);
    supabase
      .from("whatsapp_cloud_templates")
      .select("id, name, language, category, status, components")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "APPROVED")
      .order("name")
      .then(({ data }) => {
        setTemplates((data as TemplateRow[]) || []);
        setLoading(false);
      });
  }, [profile?.tenant_id]);

  const selected = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId]
  );

  const headerComponent = useMemo(
    () => (selected?.components as any[])?.find((c: any) => String(c.type || "").toUpperCase() === "HEADER"),
    [selected]
  );
  const bodyComponent = useMemo(
    () => (selected?.components as any[])?.find((c: any) => String(c.type || "").toUpperCase() === "BODY"),
    [selected]
  );
  const footerComponent = useMemo(
    () => (selected?.components as any[])?.find((c: any) => String(c.type || "").toUpperCase() === "FOOTER"),
    [selected]
  );

  const headerPlaceholders = useMemo(
    () =>
      headerComponent && String(headerComponent.format || "TEXT").toUpperCase() === "TEXT"
        ? extractPlaceholders(headerComponent.text || "")
        : [],
    [headerComponent]
  );
  const bodyPlaceholders = useMemo(
    () => extractPlaceholders(bodyComponent?.text || ""),
    [bodyComponent]
  );

  function handleSelect(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    onChange({
      templateId: tpl.id,
      templateName: tpl.name,
      templateLanguage: tpl.language,
      templateComponents: tpl.components || [],
      variaveis: {},
    });
  }

  function setVar(key: string, value: string) {
    if (!selected) return;
    const next = { ...variaveis, [key]: value };
    onChange({
      templateId: selected.id,
      templateName: selected.name,
      templateLanguage: selected.language,
      templateComponents: selected.components || [],
      variaveis: next,
    });
  }

  // Build preview substituting both {{n}} and {nome}/{telefone}/...
  function buildPreview(text: string, varPrefix: "header" | "body", placeholders: number[]) {
    let out = text || "";
    for (const n of placeholders) {
      const raw = variaveis[`${varPrefix}.${n}`] || `{{${n}}}`;
      const resolved = applyContactVars(raw, sampleContact);
      out = out.split(`{{${n}}}`).join(resolved);
    }
    return out;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Carregando templates...
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum template aprovado disponível para este canal.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/configuracoes/whatsapp-oficial">
              Criar / sincronizar templates
              <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Template aprovado</Label>
        <Select value={templateId || undefined} onValueChange={handleSelect}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
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
          <div className="flex flex-wrap gap-2">
            {selected.category && <Badge variant="secondary">{selected.category}</Badge>}
            <Badge variant="outline">{selected.language}</Badge>
            <Badge variant="default" className="bg-green-600 hover:bg-green-600">
              <Sparkles className="h-3 w-3 mr-1" /> Aprovado pela Meta
            </Badge>
          </div>

          {headerPlaceholders.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">
                Variáveis do cabeçalho
              </Label>
              {headerPlaceholders.map((n) => {
                const key = `header.${n}`;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Cabeçalho {`{{${n}}}`}</Label>
                      <InsertVariableButton
                        onPick={(token) =>
                          setVar(key, (variaveis[key] || "") + token)
                        }
                      />
                    </div>
                    <Input
                      value={variaveis[key] || ""}
                      onChange={(e) => setVar(key, e.target.value)}
                      placeholder="Texto fixo ou {nome}, {telefone}..."
                    />
                  </div>
                );
              })}
            </div>
          )}

          {bodyPlaceholders.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">
                Variáveis do corpo
              </Label>
              {bodyPlaceholders.map((n) => {
                const key = `body.${n}`;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Variável {`{{${n}}}`}</Label>
                      <InsertVariableButton
                        onPick={(token) =>
                          setVar(key, (variaveis[key] || "") + token)
                        }
                      />
                    </div>
                    <Input
                      value={variaveis[key] || ""}
                      onChange={(e) => setVar(key, e.target.value)}
                      placeholder="Texto fixo ou {nome}, {telefone}..."
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">
              Pré-visualização (com dados de exemplo)
            </Label>
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-sm">
              {headerComponent && String(headerComponent.format || "TEXT").toUpperCase() === "TEXT" && (
                <div className="font-semibold whitespace-pre-wrap">
                  {buildPreview(headerComponent.text || "", "header", headerPlaceholders)}
                </div>
              )}
              {bodyComponent?.text && (
                <div className="whitespace-pre-wrap">
                  {buildPreview(bodyComponent.text, "body", bodyPlaceholders)}
                </div>
              )}
              {footerComponent?.text && (
                <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {footerComponent.text}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
