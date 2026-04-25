import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { buildPreviewText, buildVarsMap } from "@/lib/giftback-comunicacao";

interface TestarRegraDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  regraId: string;
  regraNome: string;
}

export function TestarRegraDialog({ open, onOpenChange, regraId, regraNome }: TestarRegraDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [contatoId, setContatoId] = useState<string>("");
  const [movimentoId, setMovimentoId] = useState<string>("__exemplo__");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<
    null | { ok: boolean; mensagem: string; wa_message_id?: string; preview?: string }
  >(null);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setBusca("");
      setContatoId("");
      setMovimentoId("__exemplo__");
      setResultado(null);
    }
  }, [open]);

  // Carrega regra
  const { data: regra } = useQuery({
    queryKey: ["gb-com-regra-detalhe", regraId],
    queryFn: async () => {
      const { data } = await supabase
        .from("giftback_comunicacao_regras")
        .select("template_components, template_variaveis, template_name")
        .eq("id", regraId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!regraId,
  });

  // Busca contatos por nome/telefone
  const { data: contatos, isLoading: contatosLoading } = useQuery({
    queryKey: ["contatos-busca-teste", profile?.tenant_id, busca],
    queryFn: async () => {
      let query = supabase
        .from("contatos")
        .select("id, nome, telefone, saldo_giftback")
        .order("nome")
        .limit(20);
      if (busca.trim()) {
        const term = `%${busca.trim()}%`;
        query = query.or(`nome.ilike.${term},telefone.ilike.${term}`);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: open && !!profile?.tenant_id,
  });

  // Movimentos do contato selecionado
  const { data: movimentos } = useQuery({
    queryKey: ["mov-contato-teste", contatoId],
    queryFn: async () => {
      if (!contatoId) return [];
      const { data } = await supabase
        .from("giftback_movimentos")
        .select("id, valor, validade, status, created_at, tipo")
        .eq("contato_id", contatoId)
        .eq("tipo", "credito")
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!contatoId,
  });

  const contatoSel = useMemo(
    () => (contatos || []).find((c: any) => c.id === contatoId),
    [contatos, contatoId],
  );

  const movSel = useMemo(() => {
    if (movimentoId === "__exemplo__") {
      return {
        id: "exemplo0",
        valor: 50,
        validade: new Date(Date.now() + 7 * 86_400_000).toISOString().split("T")[0],
      };
    }
    return (movimentos || []).find((m: any) => m.id === movimentoId);
  }, [movimentoId, movimentos]);

  const previewText = useMemo(() => {
    if (!regra || !contatoSel || !movSel) return "";
    const vars = buildVarsMap({
      contato: { nome: contatoSel.nome, saldo_giftback: contatoSel.saldo_giftback ?? 0 },
      tenant: { nome: profile?.tenant_id ? "Sua loja" : "" },
      movimento: { id: movSel.id, valor: Number(movSel.valor), validade: movSel.validade },
      hojeISO: new Date().toISOString().split("T")[0],
    });
    return buildPreviewText(
      (regra.template_components as any[]) || [],
      (regra.template_variaveis as Record<string, string>) || {},
      vars,
    );
  }, [regra, contatoSel, movSel, profile]);

  async function enviarTeste() {
    if (!contatoId) {
      toast({ title: "Selecione um contato", variant: "destructive" });
      return;
    }
    setEnviando(true);
    setResultado(null);
    try {
      const { data, error } = await supabase.functions.invoke("enviar-teste-comunicacao-giftback", {
        body: {
          regra_id: regraId,
          contato_id: contatoId,
          movimento_id: movimentoId === "__exemplo__" ? null : movimentoId,
        },
      });
      if (error) throw error;
      if (!data?.ok) {
        throw new Error(data?.error || "Falha desconhecida no envio");
      }
      setResultado({
        ok: true,
        mensagem: "Mensagem enviada com sucesso!",
        wa_message_id: data.wa_message_id,
        preview: data.preview_text,
      });
      toast({ title: "Teste enviado", description: "Mensagem entregue ao WhatsApp." });
    } catch (e: any) {
      setResultado({ ok: false, mensagem: e.message || String(e) });
      toast({ title: "Falha no envio", description: e.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar teste — {regraNome}</DialogTitle>
          <DialogDescription>
            Dispara um envio real via WhatsApp Oficial usando esta regra para um contato à sua escolha.
            O envio é registrado no histórico marcado como teste.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Buscar contato</Label>
            <Input
              placeholder="Nome ou telefone..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Contato</Label>
            <Select value={contatoId} onValueChange={setContatoId}>
              <SelectTrigger>
                <SelectValue placeholder={contatosLoading ? "Carregando..." : "Selecione um contato"} />
              </SelectTrigger>
              <SelectContent>
                {(contatos || []).length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Nenhum contato encontrado.</div>
                )}
                {(contatos || []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}{" "}
                    <span className="text-xs text-muted-foreground ml-1">{c.telefone || "—"}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {contatoId && (
            <div className="space-y-2">
              <Label>Giftback usado para variáveis</Label>
              <Select value={movimentoId} onValueChange={setMovimentoId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__exemplo__">Usar dados de exemplo</SelectItem>
                  {(movimentos || []).map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      R$ {Number(m.valor).toFixed(2)} · {m.status} ·{" "}
                      {m.validade || "sem validade"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {previewText && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <Label className="text-xs text-muted-foreground">Pré-visualização</Label>
              <p className="text-sm whitespace-pre-wrap">{previewText}</p>
            </div>
          )}

          {resultado && (
            <div
              className={`flex items-start gap-2 rounded-md border p-3 ${
                resultado.ok ? "border-green-500/40 bg-green-500/5" : "border-destructive/40 bg-destructive/5"
              }`}
            >
              {resultado.ok ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-sm">
                <p className="font-medium">{resultado.mensagem}</p>
                {resultado.wa_message_id && (
                  <p className="text-xs mt-1 text-muted-foreground">
                    WA Message ID:{" "}
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {resultado.wa_message_id}
                    </Badge>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Fechar
          </Button>
          <Button onClick={enviarTeste} disabled={enviando || !contatoId}>
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" /> Enviar agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
