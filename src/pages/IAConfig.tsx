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
import { Button } from "@/components/ui/button";
import { Bot, Save, Send, Loader2, Sparkles, ScanSearch } from "lucide-react";
import ReactMarkdown from "react-markdown";

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
  const [copilotoAtivo, setCopilotoAtivo] = useState(false);
  const [ultimaAnaliseEm, setUltimaAnaliseEm] = useState<string | null>(null);
  const [ultimaAnaliseResumo, setUltimaAnaliseResumo] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [sugestoesAnalise, setSugestoesAnalise] = useState<string>("");

  // Preview state
  const [perguntaTeste, setPerguntaTeste] = useState("");
  const [respostaTeste, setRespostaTeste] = useState("");
  const [fontesPreview, setFontesPreview] = useState<string[]>([]);
  const [simulando, setSimulando] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from("ia_config")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfigId(data.id);
          setNomeAssistente(data.nome_assistente);
          setTom(data.tom);
          setUsarEmojis(data.usar_emojis);
          setInstrucoesExtras(data.instrucoes_extras || "");
          setAtivo(data.ativo);
        }
        setLoading(false);
      });
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
      };

      if (configId) {
        const { error } = await supabase
          .from("ia_config")
          .update(payload)
          .eq("id", configId);
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

  if (loading) {
    return <div className="flex items-center justify-center p-8"><p className="text-muted-foreground">Carregando...</p></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6" /> Configuração da IA
        </h1>
        <p className="text-muted-foreground">Personalize como a IA responde seus clientes no WhatsApp</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Resposta Automática</CardTitle>
              <CardDescription>Ative ou desative a IA para responder automaticamente</CardDescription>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </CardHeader>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            placeholder={"Ex:\n• Sempre ofereça ajuda de um atendente humano no final\n• Nunca fale de preços\n• Chame o cliente pelo nome\n• Responda em no máximo 3 frases"}
            rows={6}
          />
        </CardContent>
      </Card>

      {/* Preview / Simulação */}
      <Card>
        <CardHeader>
          <CardTitle>🧪 Testar IA</CardTitle>
          <CardDescription>Simule uma resposta com as configurações atuais do formulário (sem precisar salvar)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={perguntaTeste}
              onChange={(e) => setPerguntaTeste(e.target.value)}
              placeholder="Digite uma pergunta de teste..."
              onKeyDown={(e) => e.key === "Enter" && handleSimular()}
            />
            <Button onClick={handleSimular} disabled={simulando || !perguntaTeste.trim()} size="icon" className="shrink-0">
              {simulando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
    </div>
  );
}
