import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bot, Save, Send, Loader2, Sparkles, ScanSearch, Copy, AlertTriangle, Wand2, Smile } from "lucide-react";
import ReactMarkdown from "react-markdown";

const CANAIS = [
  { id: "whatsapp_zapi", label: "WhatsApp Z-API" },
  { id: "whatsapp_cloud", label: "WhatsApp Cloud (oficial)" },
];

function defaultPeriodoInicio(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultPeriodoFim(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function IAConfig() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [nomeAssistente, setNomeAssistente] = useState("Assistente Virtual");
  const [tom, setTom] = useState("amigavel");
  const [usarEmojis, setUsarEmojis] = useState("pouco");
  const [instrucoesExtras, setInstrucoesExtras] = useState("");
  const [ativo, setAtivo] = useState(true);

  // Copiloto
  const [copilotoAtivo, setCopilotoAtivo] = useState(false);
  const [copilotoCanais, setCopilotoCanais] = useState<string[]>(["whatsapp_zapi", "whatsapp_cloud"]);

  // Satisfação
  const [satisfacaoAtivo, setSatisfacaoAtivo] = useState(false);
  const [satisfacaoCriterios, setSatisfacaoCriterios] = useState("");
  const [satisfacaoMinMsgs, setSatisfacaoMinMsgs] = useState(2);
  const [reanalisando, setReanalisando] = useState(false);

  // Análise
  const [ultimaAnaliseEm, setUltimaAnaliseEm] = useState<string | null>(null);
  const [periodoInicio, setPeriodoInicio] = useState(defaultPeriodoInicio());
  const [periodoFim, setPeriodoFim] = useState(defaultPeriodoFim());
  const [analisando, setAnalisando] = useState(false);
  const [resumoAnalise, setResumoAnalise] = useState<string>("");
  const [sugestoesAnalise, setSugestoesAnalise] = useState<string>("");
  const [analisesRecentes, setAnalisesRecentes] = useState<any[]>([]);
  const [aplicarOpen, setAplicarOpen] = useState(false);

  // Preview state
  const [perguntaTeste, setPerguntaTeste] = useState("");
  const [respostaTeste, setRespostaTeste] = useState("");
  const [fontesPreview, setFontesPreview] = useState<string[]>([]);
  const [simulando, setSimulando] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

    (async () => {
      const { data } = await supabase
        .from("ia_config")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (data) {
        setConfigId(data.id);
        setNomeAssistente(data.nome_assistente);
        setTom(data.tom);
        setUsarEmojis(data.usar_emojis);
        setInstrucoesExtras(data.instrucoes_extras || "");
        setAtivo(data.ativo);
        setCopilotoAtivo(data.copiloto_ativo ?? false);
        setCopilotoCanais(
          Array.isArray(data.copiloto_canais) && data.copiloto_canais.length > 0
            ? data.copiloto_canais
            : ["whatsapp_zapi", "whatsapp_cloud"]
        );
        setUltimaAnaliseEm(data.ultima_analise_em ?? null);
        if (data.ultima_analise_resumo) setResumoAnalise(data.ultima_analise_resumo);
        setSatisfacaoAtivo((data as any).satisfacao_ativo ?? false);
        setSatisfacaoCriterios((data as any).satisfacao_criterios ?? "");
        setSatisfacaoMinMsgs((data as any).satisfacao_min_mensagens_cliente ?? 2);
      }

      const { data: analises } = await supabase
        .from("ia_analises_conversas")
        .select("id, status, created_at, concluido_em, total_conversas, total_mensagens, resumo_markdown, sugestoes_instrucoes")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(3);
      setAnalisesRecentes(analises || []);

      setLoading(false);
    })();
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        nome_assistente: nomeAssistente,
        tom: tom as "formal" | "amigavel" | "casual",
        usar_emojis: usarEmojis as "nao" | "pouco" | "sim",
        instrucoes_extras: instrucoesExtras,
        ativo,
        copiloto_ativo: copilotoAtivo,
        copiloto_canais: copilotoCanais,
        satisfacao_ativo: satisfacaoAtivo,
        satisfacao_criterios: satisfacaoCriterios,
        satisfacao_min_mensagens_cliente: satisfacaoMinMsgs,
      };

      if (configId) {
        const { error } = await supabase.from("ia_config").update(payload).eq("id", configId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("ia_config")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setConfigId(data.id);
      }
      toast.success("Configurações da IA salvas!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCanal = (canal: string, checked: boolean) => {
    setCopilotoCanais((prev) =>
      checked ? Array.from(new Set([...prev, canal])) : prev.filter((c) => c !== canal)
    );
  };

  const handleAnalisar = async () => {
    if (!tenantId) return;
    if (!periodoInicio || !periodoFim) {
      toast.error("Informe o período de análise.");
      return;
    }
    if (new Date(periodoFim) < new Date(periodoInicio)) {
      toast.error("Data fim não pode ser anterior à data início.");
      return;
    }
    setAnalisando(true);
    setResumoAnalise("");
    setSugestoesAnalise("");
    try {
      const inicioISO = new Date(periodoInicio + "T00:00:00").toISOString();
      const fimISO = new Date(periodoFim + "T23:59:59").toISOString();
      const { data, error } = await supabase.functions.invoke("ia-analisar-conversas", {
        body: { periodo_inicio: inicioISO, periodo_fim: fimISO },
      });
      if (error) throw error;
      setResumoAnalise(data?.resumo_markdown || "Sem resumo retornado.");
      setSugestoesAnalise(data?.sugestoes_instrucoes || "");
      setUltimaAnaliseEm(new Date().toISOString());
      toast.success(
        `Análise concluída: ${data?.total_conversas ?? 0} conversas, ${data?.total_mensagens ?? 0} mensagens.`
      );

      const { data: analises } = await supabase
        .from("ia_analises_conversas")
        .select("id, status, created_at, concluido_em, total_conversas, total_mensagens, resumo_markdown, sugestoes_instrucoes")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(3);
      setAnalisesRecentes(analises || []);
    } catch (err: any) {
      toast.error("Erro na análise: " + (err.message || "Erro desconhecido"));
    } finally {
      setAnalisando(false);
    }
  };

  const aplicarSugestoes = async (modo: "substituir" | "acrescentar") => {
    if (!sugestoesAnalise.trim()) {
      toast.error("Não há sugestões para aplicar.");
      return;
    }
    const novo =
      modo === "substituir"
        ? sugestoesAnalise.trim()
        : (instrucoesExtras.trim()
            ? instrucoesExtras.trim() + "\n\n--- Sugestões da IA ---\n"
            : "") + sugestoesAnalise.trim();
    setInstrucoesExtras(novo);
    setAplicarOpen(false);

    if (!tenantId) return;
    try {
      if (configId) {
        const { error } = await supabase
          .from("ia_config")
          .update({ instrucoes_extras: novo })
          .eq("id", configId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("ia_config")
          .insert({
            tenant_id: tenantId,
            nome_assistente: nomeAssistente,
            tom: tom as any,
            usar_emojis: usarEmojis as any,
            instrucoes_extras: novo,
            ativo,
            copiloto_ativo: copilotoAtivo,
            copiloto_canais: copilotoCanais,
          })
          .select("id")
          .single();
        if (error) throw error;
        setConfigId(data.id);
      }
      toast.success("Sugestões aplicadas e salvas nas instruções da IA.");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    }
  };

  const verAnalise = (a: any) => {
    setResumoAnalise(a.resumo_markdown || "");
    setSugestoesAnalise(a.sugestoes_instrucoes || "");
    toast.info("Carregando análise selecionada.");
  };

  const handleSimular = async () => {
    if (!tenantId || !perguntaTeste.trim()) return;
    setSimulando(true);
    setRespostaTeste("");
    setFontesPreview([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-responder", {
        body: {
          pergunta: perguntaTeste,
          tenant_id: tenantId,
          nome_assistente: nomeAssistente,
          tom,
          usar_emojis: usarEmojis,
          instrucoes_extras: instrucoesExtras,
        },
      });
      if (error) throw error;
      setRespostaTeste(data.resposta || "Sem resposta.");
      setFontesPreview(data.fontes || []);
    } catch (err: any) {
      toast.error("Erro na simulação: " + (err.message || "Erro desconhecido"));
    } finally {
      setSimulando(false);
    }
  };

  const handleReanalisar = async () => {
    if (!tenantId) return;
    setReanalisando(true);
    try {
      const { data, error } = await supabase.functions.invoke("analisar-satisfacao", {
        body: { reanalise_tenant_id: tenantId, dias: 30 },
      });
      if (error) throw error;
      toast.success(`${data?.enfileirados ?? 0} atendimentos enfileirados para análise.`);
    } catch (err: any) {
      toast.error("Erro ao enfileirar: " + (err.message || "Erro desconhecido"));
    } finally {
      setReanalisando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6" /> Configuração da IA
        </h1>
        <p className="text-muted-foreground">
          Personalize como a IA responde seus clientes no WhatsApp
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Resposta Automática</CardTitle>
              <CardDescription>
                Quando ativa, a IA responde sozinha (sem intervenção do atendente)
              </CardDescription>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </CardHeader>
      </Card>

      {/* Modo Copiloto */}
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Modo Copiloto
              </CardTitle>
              <CardDescription>
                Quando ativo, a IA gera um <strong>rascunho</strong> de resposta para o atendente revisar
                antes de enviar — em vez de responder sozinha.
              </CardDescription>
            </div>
            <Switch checked={copilotoAtivo} onCheckedChange={setCopilotoAtivo} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {copilotoAtivo && ativo && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Você ativou Copiloto e Resposta Automática ao mesmo tempo. O Copiloto tem prioridade:
                a IA gera rascunho e <strong>não envia</strong> sozinha nos canais selecionados abaixo.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Canais com Copiloto</Label>
            <div className="space-y-2">
              {CANAIS.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`canal-${c.id}`}
                    checked={copilotoCanais.includes(c.id)}
                    onCheckedChange={(v) => toggleCanal(c.id, v === true)}
                    disabled={!copilotoAtivo}
                  />
                  <Label htmlFor={`canal-${c.id}`} className="cursor-pointer font-normal">
                    {c.label}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Em conversas desses canais, ao abrir uma conversa nova o atendente verá um rascunho pronto para revisar e enviar (ou descartar).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personalidade</CardTitle>
          <CardDescription>Defina o tom e estilo das respostas da IA</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do Assistente</Label>
            <Input
              value={nomeAssistente}
              onChange={(e) => setNomeAssistente(e.target.value)}
              placeholder="Ex: Bia, Assistente Loja X"
            />
            <p className="text-xs text-muted-foreground">A IA se apresentará com este nome</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tom de Conversa</Label>
              <Select value={tom} onValueChange={setTom}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">🎩 Formal — Profissional e objetivo</SelectItem>
                  <SelectItem value="amigavel">😊 Amigável — Cordial e próximo</SelectItem>
                  <SelectItem value="casual">😄 Casual — Descontraído e informal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Uso de Emojis</Label>
              <Select value={usarEmojis} onValueChange={setUsarEmojis}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">❌ Não usar emojis</SelectItem>
                  <SelectItem value="pouco">👌 Usar pouco — Apenas quando natural</SelectItem>
                  <SelectItem value="sim">🎉 Usar bastante — Muitos emojis</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instruções Personalizadas</CardTitle>
          <CardDescription>Adicione regras específicas para a IA seguir</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={instrucoesExtras}
            onChange={(e) => setInstrucoesExtras(e.target.value)}
            placeholder={
              "Ex:\n• Sempre ofereça ajuda de um atendente humano no final\n• Nunca fale de preços\n• Chame o cliente pelo nome\n• Responda em no máximo 3 frases"
            }
            rows={6}
          />
        </CardContent>
      </Card>

      {/* Análise de conversas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5 text-primary" /> Treinar IA com conversas reais
          </CardTitle>
          <CardDescription>
            A IA varre as conversas do período escolhido e produz um <strong>diagnóstico</strong> + sugestões de instruções
            que você pode aplicar em 1 clique.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ultimaAnaliseEm && (
            <p className="text-xs text-muted-foreground">
              Última análise:{" "}
              {new Date(ultimaAnaliseEm).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input
                type="date"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input
                type="date"
                value={periodoFim}
                onChange={(e) => setPeriodoFim(e.target.value)}
              />
            </div>
            <Button onClick={handleAnalisar} disabled={analisando}>
              {analisando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando…
                </>
              ) : (
                <>
                  <ScanSearch className="h-4 w-4 mr-2" /> Analisar conversas
                </>
              )}
            </Button>
          </div>

          {analisando && (
            <p className="text-xs text-muted-foreground">
              Varrendo conversas, isto pode levar 1–2 minutos…
            </p>
          )}

          {resumoAnalise && (
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-sm font-semibold">Diagnóstico</Label>
                <div className="mt-2 max-h-96 overflow-auto rounded-lg border bg-card p-4 text-sm prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{resumoAnalise}</ReactMarkdown>
                </div>
              </div>

              {sugestoesAnalise && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Sugestões para Instruções Personalizadas</Label>
                  <div className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap max-h-64 overflow-auto">
                    {sugestoesAnalise}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setAplicarOpen(true)} size="sm">
                      <Wand2 className="h-4 w-4 mr-2" /> Aplicar sugestões
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(sugestoesAnalise);
                        toast.success("Sugestões copiadas!");
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" /> Copiar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {analisesRecentes.length > 0 && (
            <div className="space-y-2 pt-3 border-t">
              <Label className="text-sm font-semibold">Análises recentes</Label>
              <div className="space-y-2">
                {analisesRecentes.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {new Date(a.created_at).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}{" "}
                        <span
                          className={
                            a.status === "concluido"
                              ? "text-green-600"
                              : a.status === "erro"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }
                        >
                          • {a.status}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.total_conversas ?? 0} conversas · {a.total_mensagens ?? 0} mensagens
                      </p>
                    </div>
                    {a.resumo_markdown && (
                      <Button variant="ghost" size="sm" onClick={() => verAnalise(a)}>
                        Ver
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview / Simulação */}
      <Card>
        <CardHeader>
          <CardTitle>🧪 Testar IA</CardTitle>
          <CardDescription>
            Simule uma resposta com as configurações atuais do formulário (sem precisar salvar)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={perguntaTeste}
              onChange={(e) => setPerguntaTeste(e.target.value)}
              placeholder="Digite uma pergunta de teste..."
              onKeyDown={(e) => e.key === "Enter" && handleSimular()}
            />
            <Button
              onClick={handleSimular}
              disabled={simulando || !perguntaTeste.trim()}
              size="icon"
              className="shrink-0"
            >
              {simulando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {respostaTeste && (
            <div className="space-y-2">
              <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap">
                <p className="text-xs font-semibold text-primary mb-1">{nomeAssistente}</p>
                {respostaTeste}
              </div>
              {fontesPreview.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Fontes: {fontesPreview.join(", ")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
        <Save className="h-4 w-4 mr-2" />
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>

      <AlertDialog open={aplicarOpen} onOpenChange={setAplicarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar sugestões da IA</AlertDialogTitle>
            <AlertDialogDescription>
              Como você quer aplicar as sugestões nas Instruções Personalizadas?
              <br />
              <br />
              <strong>Substituir:</strong> apaga o texto atual e usa só as sugestões.
              <br />
              <strong>Acrescentar:</strong> mantém o texto atual e adiciona as sugestões ao final.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => aplicarSugestoes("acrescentar")}>
              Acrescentar
            </Button>
            <AlertDialogAction onClick={() => aplicarSugestoes("substituir")}>
              Substituir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
