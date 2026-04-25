import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { InsertGiftbackVarButton } from "./InsertGiftbackVarButton";
import {
  buildVarsMap,
  buildPreviewText,
  extractMetaPlaceholders,
} from "@/lib/giftback-comunicacao";

type GbGatilho = "criado" | "vencendo" | "expirado";

interface RegraExistente {
  id: string;
  nome: string;
  ativo: boolean;
  tipo_gatilho: GbGatilho;
  dias_offset: number;
  template_name: string;
  template_language: string;
  template_components: any;
  template_variaveis: any;
}

interface RegraComunicacaoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  regra?: RegraExistente | null;
}

const MOCK_CTX = {
  contato: { nome: "Maria Silva", saldo_giftback: 50 },
  tenant: { nome: "Loja Exemplo" },
  movimento: { id: "abcdef1234567890", valor: 50, validade: "2026-05-25" },
  hojeISO: new Date().toISOString().split("T")[0],
};

export function RegraComunicacaoDialog({ open, onOpenChange, regra }: RegraComunicacaoDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [tipoGatilho, setTipoGatilho] = useState<GbGatilho>("criado");
  const [diasOffset, setDiasOffset] = useState("0");
  const [templateId, setTemplateId] = useState<string>("");
  const [variaveis, setVariaveis] = useState<Record<string, string>>({});

  const { data: templates } = useQuery({
    queryKey: ["wa-templates-approved"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_cloud_templates")
        .select("id, name, language, components, status")
        .eq("status", "APPROVED")
        .order("name");
      return data || [];
    },
    enabled: open && !!profile?.tenant_id,
  });

  // Prefill ao editar
  useEffect(() => {
    if (!open) return;
    if (regra) {
      setNome(regra.nome);
      setAtivo(regra.ativo);
      setTipoGatilho(regra.tipo_gatilho);
      setDiasOffset(String(regra.dias_offset ?? 0));
      setVariaveis((regra.template_variaveis as Record<string, string>) || {});
      // Procura template pelo nome+lang
      const match = (templates || []).find(
        (t: any) => t.name === regra.template_name && t.language === regra.template_language,
      );
      setTemplateId(match?.id || "");
    } else {
      setNome("");
      setAtivo(true);
      setTipoGatilho("criado");
      setDiasOffset("0");
      setTemplateId("");
      setVariaveis({});
    }
  }, [open, regra, templates]);

  const templateAtual = useMemo(
    () => (templates || []).find((t: any) => t.id === templateId),
    [templates, templateId],
  );

  // Lista de placeholders do template selecionado (header/body)
  const placeholders = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [];
    for (const comp of (templateAtual?.components as any[]) || []) {
      const type = String(comp?.type || "").toUpperCase();
      if (type === "HEADER" && String(comp.format || "TEXT").toUpperCase() === "TEXT") {
        for (const n of extractMetaPlaceholders(comp.text || "")) {
          out.push({ key: `header.${n}`, label: `Header {{${n}}}` });
        }
      } else if (type === "BODY") {
        for (const n of extractMetaPlaceholders(comp.text || "")) {
          out.push({ key: `body.${n}`, label: `Body {{${n}}}` });
        }
      }
    }
    return out;
  }, [templateAtual]);

  const previewVars = useMemo(() => buildVarsMap(MOCK_CTX), []);
  const previewText = useMemo(() => {
    if (!templateAtual) return "";
    return buildPreviewText(
      (templateAtual.components as any[]) || [],
      variaveis,
      previewVars,
    );
  }, [templateAtual, variaveis, previewVars]);

  function inserirVariavelNoCampo(token: string) {
    if (!activeFieldKey) {
      toast({
        title: "Selecione um campo",
        description: "Clique em um dos campos de variável antes de inserir.",
      });
      return;
    }
    const input = inputRefs.current[activeFieldKey];
    const atual = variaveis[activeFieldKey] || "";
    const start = input?.selectionStart ?? atual.length;
    const end = input?.selectionEnd ?? atual.length;
    const novo = atual.slice(0, start) + token + atual.slice(end);
    setVariaveis((v) => ({ ...v, [activeFieldKey]: novo }));
    setTimeout(() => {
      input?.focus();
      const pos = start + token.length;
      input?.setSelectionRange(pos, pos);
    }, 0);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.tenant_id) throw new Error("Sessão inválida");
      if (!nome.trim()) throw new Error("Informe um nome para a regra");
      if (!templateAtual) throw new Error("Selecione um template aprovado");

      const payload = {
        tenant_id: profile.tenant_id,
        nome: nome.trim(),
        ativo,
        tipo_gatilho: tipoGatilho,
        dias_offset: tipoGatilho === "criado" ? 0 : parseInt(diasOffset || "0", 10),
        template_name: templateAtual.name,
        template_language: templateAtual.language,
        template_components: templateAtual.components,
        template_variaveis: variaveis,
      };

      if (regra?.id) {
        const { error } = await supabase
          .from("giftback_comunicacao_regras")
          .update(payload)
          .eq("id", regra.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("giftback_comunicacao_regras").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gb-com-regras"] });
      toast({ title: regra ? "Regra atualizada" : "Regra criada" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{regra ? "Editar regra" : "Nova regra de comunicação"}</DialogTitle>
          <DialogDescription>
            Configure quando e qual template enviar para os clientes via WhatsApp Oficial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome da regra</Label>
            <Input
              placeholder="Ex.: Aviso 3 dias antes do vencimento"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Gatilho</Label>
              <Select value={tipoGatilho} onValueChange={(v) => setTipoGatilho(v as GbGatilho)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="criado">Giftback criado</SelectItem>
                  <SelectItem value="vencendo">Saldo vencendo</SelectItem>
                  <SelectItem value="expirado">Giftback expirado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipoGatilho !== "criado" && (
              <div className="space-y-2">
                <Label>
                  {tipoGatilho === "vencendo"
                    ? "Dias antes do vencimento"
                    : "Dias após expirar"}
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={diasOffset}
                  onChange={(e) => setDiasOffset(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {tipoGatilho === "vencendo"
                    ? "Ex.: 3 = avisa quando faltarem 3 dias para expirar."
                    : "Ex.: 0 = avisa no mesmo dia que expirou; 1 = avisa um dia depois."}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Template aprovado</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um template..." />
              </SelectTrigger>
              <SelectContent>
                {(templates || []).length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    Nenhum template aprovado disponível.
                  </div>
                )}
                {(templates || []).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} <span className="text-xs text-muted-foreground ml-1">· {t.language}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {templateAtual && placeholders.length > 0 && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Mapear variáveis do template</Label>
                <InsertGiftbackVarButton onInsert={inserirVariavelNoCampo} />
              </div>
              <p className="text-xs text-muted-foreground">
                Para cada placeholder do template, defina o que será enviado. Clique em
                um campo, depois em "Inserir variável" para usar dados dinâmicos.
              </p>
              {placeholders.map((ph) => (
                <div key={ph.key} className="space-y-1">
                  <Label className="text-xs flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">{ph.label}</Badge>
                  </Label>
                  <Input
                    ref={(el) => { inputRefs.current[ph.key] = el; }}
                    value={variaveis[ph.key] || ""}
                    onChange={(e) => setVariaveis((v) => ({ ...v, [ph.key]: e.target.value }))}
                    onFocus={() => setActiveFieldKey(ph.key)}
                    placeholder="Ex.: {{nome_cliente}}"
                  />
                </div>
              ))}
            </div>
          )}

          {templateAtual && previewText && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <Label className="text-xs text-muted-foreground">Pré-visualização (com dados de exemplo)</Label>
              <p className="text-sm whitespace-pre-wrap">{previewText}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} />
            <Label className="cursor-pointer" onClick={() => setAtivo(!ativo)}>
              Regra ativa
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Salvando..." : "Salvar regra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
