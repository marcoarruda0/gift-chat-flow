import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  Send,
  Copy,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateName: string;
  templateLanguage: string;
  templateComponents: any[];
  templateVariaveis: Record<string, string>;
}

interface Resultado {
  ok: boolean;
  status?: number;
  payload_enviado?: unknown;
  response?: unknown;
  wa_message_id?: string | null;
  error?: string | null;
}

// Preview do payload exatamente como será enviado à Meta (sem chamar a API).
// Resolve {{n}} no body/header text e mídia se houver.
function buildPreviewPayload(
  telefone: string,
  templateName: string,
  templateLanguage: string,
  templateComponents: any[],
  templateVariaveis: Record<string, string>,
) {
  const sample = {
    nome: "Cliente Teste",
    telefone: telefone || "5511999999999",
    email: "teste@exemplo.com",
  };
  const resolveDynamic = (txt: string) =>
    (txt || "")
      .replace(/\{nome\}/gi, sample.nome)
      .replace(/\{telefone\}/gi, sample.telefone)
      .replace(/\{email\}/gi, sample.email);

  const extractPh = (t: string) => {
    const out = new Set<number>();
    for (const m of (t || "").matchAll(/\{\{(\d+)\}\}/g)) {
      out.add(parseInt(m[1], 10));
    }
    return Array.from(out).sort((a, b) => a - b);
  };

  const components: any[] = [];
  for (const comp of templateComponents || []) {
    const type = String(comp?.type || "").toUpperCase();
    if (type === "HEADER") {
      const fmt = String(comp.format || "TEXT").toUpperCase();
      if (fmt === "TEXT") {
        const ph = extractPh(comp.text || "");
        if (ph.length === 0) continue;
        components.push({
          type: "header",
          parameters: ph.map((n) => ({
            type: "text",
            text: resolveDynamic(templateVariaveis[`header.${n}`] || ""),
          })),
        });
      } else if (fmt === "IMAGE" && comp.media_url) {
        components.push({
          type: "header",
          parameters: [{ type: "image", image: { link: comp.media_url } }],
        });
      } else if (fmt === "VIDEO" && comp.media_url) {
        components.push({
          type: "header",
          parameters: [{ type: "video", video: { link: comp.media_url } }],
        });
      }
    } else if (type === "BODY") {
      const ph = extractPh(comp.text || "");
      if (ph.length === 0) continue;
      components.push({
        type: "body",
        parameters: ph.map((n) => ({
          type: "text",
          text: resolveDynamic(templateVariaveis[`body.${n}`] || ""),
        })),
      });
    }
  }

  return {
    messaging_product: "whatsapp",
    to: (telefone || "").replace(/\D/g, ""),
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components,
    },
  };
}

export function TestarCampanhaCloudDialog({
  open,
  onOpenChange,
  templateName,
  templateLanguage,
  templateComponents,
  templateVariaveis,
}: Props) {
  const { toast } = useToast();
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const previewPayload = useMemo(
    () =>
      buildPreviewPayload(
        telefone,
        templateName,
        templateLanguage,
        templateComponents,
        templateVariaveis,
      ),
    [telefone, templateName, templateLanguage, templateComponents, templateVariaveis],
  );

  const previewJson = useMemo(
    () => JSON.stringify(previewPayload, null, 2),
    [previewPayload],
  );

  const enviar = async () => {
    const tel = telefone.replace(/\D/g, "");
    if (tel.length < 10) {
      toast({ title: "Telefone inválido", description: "Use o formato com DDD (ex: 5511999999999)", variant: "destructive" });
      return;
    }
    setEnviando(true);
    setResultado(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "enviar-teste-campanha-cloud",
        {
          body: {
            telefone: tel,
            template_name: templateName,
            template_language: templateLanguage,
            template_components: templateComponents,
            template_variaveis: templateVariaveis,
          },
        },
      );
      if (error) throw error;
      setResultado(data as Resultado);
      if ((data as Resultado).ok) {
        toast({ title: "Teste enviado", description: "Mensagem entregue à Meta com sucesso." });
      } else {
        toast({
          title: "Falha no envio",
          description: (data as Resultado).error || "Veja o detalhe abaixo.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setResultado({ ok: false, error: err.message || String(err) });
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(previewJson);
      toast({ title: "Payload copiado" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-green-600" />
            Testar disparo · WhatsApp Oficial
          </DialogTitle>
          <DialogDescription>
            Envia uma única mensagem com este template para o número informado.
            Útil para validar o payload antes de criar a campanha em massa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Canal */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Canal:</span>
            <Badge className="bg-green-600 hover:bg-green-600">
              <Sparkles className="h-3 w-3 mr-1" /> WhatsApp Oficial (Cloud API)
            </Badge>
            <Badge variant="outline" className="font-mono">
              {templateName} · {templateLanguage}
            </Badge>
          </div>

          {/* Telefone */}
          <div className="space-y-2">
            <Label>Telefone do destinatário de teste</Label>
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="55 11 99999-9999"
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">
              Inclua o código do país (55 para Brasil). O destinatário precisa
              ter feito opt-in para receber o template.
            </p>
          </div>

          {/* Payload */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground">
                Payload que será enviado à Meta
              </Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyPayload}
                className="h-7"
              >
                <Copy className="h-3 w-3 mr-1" /> Copiar
              </Button>
            </div>
            <pre className="text-[11px] bg-muted/40 border rounded-md p-3 overflow-x-auto max-h-60 font-mono whitespace-pre">
              {previewJson}
            </pre>
          </div>

          {/* Resultado */}
          {resultado && (
            <div
              className={`rounded-md border p-3 space-y-2 ${
                resultado.ok
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-sm">
                {resultado.ok ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Sucesso · HTTP {resultado.status}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">
                      Falha {resultado.status ? `· HTTP ${resultado.status}` : ""}
                    </span>
                  </>
                )}
              </div>

              {resultado.wa_message_id && (
                <div className="text-xs">
                  <span className="text-muted-foreground">wa_message_id: </span>
                  <code className="font-mono bg-background px-1.5 py-0.5 rounded">
                    {resultado.wa_message_id}
                  </code>
                </div>
              )}

              {resultado.error && (
                <p className="text-xs text-destructive whitespace-pre-wrap">
                  {resultado.error}
                </p>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver resposta completa da Meta
                </summary>
                <pre className="mt-2 bg-muted/40 border rounded p-2 overflow-x-auto max-h-48 font-mono text-[10px] whitespace-pre">
                  {JSON.stringify(resultado.response, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={enviando}
          >
            Fechar
          </Button>
          <Button onClick={enviar} disabled={enviando || !telefone.trim()}>
            {enviando ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Enviar teste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
