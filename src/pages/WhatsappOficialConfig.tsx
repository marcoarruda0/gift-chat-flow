import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wifi, WifiOff, Save, Loader2, Send, Copy, AlertCircle } from "lucide-react";
import { DiagnosticoCard } from "@/components/whatsapp-oficial/DiagnosticoCard";
import { AuditoriaCard } from "@/components/whatsapp-oficial/AuditoriaCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const WEBHOOK_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-cloud-webhook`;

export default function WhatsappOficialConfig() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [status, setStatus] = useState("desconectado");
  const [ultimoTesteAt, setUltimoTesteAt] = useState<string | null>(null);
  const [ultimoErro, setUltimoErro] = useState<string | null>(null);
  const [ultimaVerificacaoAt, setUltimaVerificacaoAt] = useState<string | null>(null);
  const [ultimaMensagemAt, setUltimaMensagemAt] = useState<string | null>(null);
  const [msgsRecebidas24h, setMsgsRecebidas24h] = useState<number>(0);
  const [diagLoading, setDiagLoading] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testNumber, setTestNumber] = useState("");
  const [sending, setSending] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const loadDiagnostico = useCallback(async () => {
    if (!tenantId) return;
    setDiagLoading(true);
    const { data } = await supabase
      .from("whatsapp_cloud_config" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (data) {
      const d = data as any;
      setUltimoTesteAt(d.ultimo_teste_at || null);
      setUltimoErro(d.ultimo_erro || null);
      setUltimaVerificacaoAt(d.ultima_verificacao_at || null);
      setUltimaMensagemAt(d.ultima_mensagem_at || null);
      setStatus(d.status || "desconectado");
    }

    // Count incoming messages last 24h on canal=whatsapp_cloud
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("remetente", "contato")
      .gte("created_at", since)
      .not("metadata->>wa_message_id", "is", null);
    setMsgsRecebidas24h(count || 0);
    setDiagLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase
        .from("whatsapp_cloud_config" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setPhoneNumberId(d.phone_number_id || "");
        setWabaId(d.waba_id || "");
        setAccessToken(d.access_token || "");
        setDisplayPhone(d.display_phone || "");
        setVerifyToken(d.verify_token || "");
        setStatus(d.status || "desconectado");
        setUltimoTesteAt(d.ultimo_teste_at || null);
        setUltimoErro(d.ultimo_erro || null);
        setUltimaVerificacaoAt(d.ultima_verificacao_at || null);
        setUltimaMensagemAt(d.ultima_mensagem_at || null);
        setExistingId(d.id);
      }
      setLoading(false);
      loadDiagnostico();
    })();
  }, [tenantId, loadDiagnostico]);

  const handleSave = async () => {
    if (!tenantId || !phoneNumberId || !wabaId || !accessToken) {
      toast.error("Preencha Phone Number ID, WABA ID e Access Token");
      return;
    }
    setSaving(true);

    let token = verifyToken;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "");
      setVerifyToken(token);
    }

    const payload: any = {
      tenant_id: tenantId,
      phone_number_id: phoneNumberId.trim(),
      waba_id: wabaId.trim(),
      access_token: accessToken.trim(),
      display_phone: displayPhone.trim() || null,
      verify_token: token,
    };

    let error;
    if (existingId) {
      ({ error } = await supabase
        .from("whatsapp_cloud_config" as any)
        .update(payload)
        .eq("id", existingId));
    } else {
      const res = await supabase
        .from("whatsapp_cloud_config" as any)
        .insert(payload)
        .select("id")
        .single();
      error = res.error;
      if (res.data) setExistingId((res.data as any).id);
    }
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Configuração salva!");
  };

  const callProxy = useCallback(
    async (endpoint: string, method = "POST", data?: any, useWabaId = false) => {
      const { data: session } = await supabase.auth.getSession();
      const url = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-cloud-proxy`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ endpoint, method, data, useWabaId }),
      });
      return res.json();
    },
    []
  );

  const handleSubscribeMessages = useCallback(async () => {
    if (!wabaId) {
      toast.error("Salve o WABA ID antes de assinar.");
      return;
    }
    setSubscribing(true);
    try {
      const result = await callProxy("subscribed_apps", "POST", {}, true);
      if (result?.success) {
        toast.success("Campo `messages` re-assinado com sucesso. Mande uma mensagem real agora.");
      } else {
        const msg = result?.error?.message || result?.error?.error_user_msg || JSON.stringify(result);
        toast.error("Falhou: " + msg);
      }
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setSubscribing(false);
    loadDiagnostico();
  }, [wabaId, callProxy, loadDiagnostico]);

  const handleReprocessLast = useCallback(async () => {
    setReprocessing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const url = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-cloud-reprocessar`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ ultimo: true }),
      });
      const j = await res.json();
      if (j?.ok) {
        toast.success("Último evento reprocessado.");
      } else {
        toast.error("Falhou: " + (j?.error || res.status));
      }
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setReprocessing(false);
    loadDiagnostico();
  }, [loadDiagnostico]);

  const handleSendTest = async () => {
    if (!testNumber.trim()) {
      toast.error("Informe o número de destino (formato E.164, ex: 5511999999999)");
      return;
    }
    if (!existingId) {
      toast.error("Salve a configuração antes de testar");
      return;
    }

    setSending(true);
    try {
      const result = await callProxy("messages", "POST", {
        messaging_product: "whatsapp",
        to: testNumber.trim().replace(/\D/g, ""),
        type: "template",
        template: { name: "hello_world", language: { code: "en_US" } },
      });

      const msgId = result?.messages?.[0]?.id;
      const errorMsg = result?.error?.message || result?.error?.error_user_msg;

      const newStatus = msgId ? "conectado" : "erro";
      const updates: any = {
        status: newStatus,
        ultimo_teste_at: new Date().toISOString(),
        ultimo_erro: msgId ? null : (errorMsg || JSON.stringify(result)),
      };
      await supabase
        .from("whatsapp_cloud_config" as any)
        .update(updates)
        .eq("id", existingId);

      setStatus(newStatus);
      setUltimoTesteAt(updates.ultimo_teste_at);
      setUltimoErro(updates.ultimo_erro);

      if (msgId) {
        toast.success(`✅ Template enviado! Message ID: ${msgId}`);
      } else {
        toast.error(`Erro Meta: ${errorMsg || JSON.stringify(result)}`);
      }
    } catch (e: any) {
      toast.error("Erro ao enviar: " + e.message);
    }
    setSending(false);
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">WhatsApp Oficial (Cloud API)</h1>
        <p className="text-muted-foreground">
          Conecte um número oficial via Meta WhatsApp Business Cloud API
        </p>
      </div>

      <Card className="border-primary/30 bg-muted/40">
        <CardContent className="pt-6 flex gap-3 text-sm">
          <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Antes de testar</p>
            <p className="text-muted-foreground">
              Configure o webhook no Meta App Dashboard (WhatsApp → Configuration) com a
              <strong> Callback URL</strong> e <strong>Verify Token</strong> abaixo, e assine
              os campos <code className="text-xs bg-muted px-1 rounded">messages</code> e{" "}
              <code className="text-xs bg-muted px-1 rounded">message_status</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Credenciais */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Credenciais</CardTitle>
              <CardDescription>Dados da sua conta WhatsApp Business na Meta</CardDescription>
            </div>
            <Badge
              variant={status === "conectado" ? "default" : status === "erro" ? "destructive" : "secondary"}
              className="gap-1"
            >
              {status === "conectado" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {status === "conectado" ? "Conectado" : status === "erro" ? "Erro" : "Desconectado"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Phone Number ID</Label>
            <Input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="ex: 1057954850740861"
            />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp Business Account ID (WABA ID)</Label>
            <Input
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="Identificação da conta do WhatsApp Business"
            />
          </div>
          <div className="space-y-2">
            <Label>Access Token (System User permanente)</Label>
            <Input
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="EAA..."
              type="password"
            />
          </div>
          <div className="space-y-2">
            <Label>Telefone para exibição (opcional)</Label>
            <Input
              value={displayPhone}
              onChange={(e) => setDisplayPhone(e.target.value)}
              placeholder="+55 11 99999-9999"
            />
          </div>

          <div className="pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
          <CardDescription>Cole estes valores no painel da Meta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Callback URL</Label>
            <div className="flex gap-2">
              <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(WEBHOOK_URL, "Callback URL")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Verify Token</Label>
            <div className="flex gap-2">
              <Input
                value={verifyToken || "(será gerado ao salvar)"}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                disabled={!verifyToken}
                onClick={() => copy(verifyToken, "Verify Token")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diagnóstico do Webhook */}
      <DiagnosticoCard
        ultimaVerificacaoAt={ultimaVerificacaoAt}
        ultimaAtividadeAt={ultimaMensagemAt}
        msgsRecebidas24h={msgsRecebidas24h}
        diagLoading={diagLoading}
        onRefresh={loadDiagnostico}
        onSubscribeMessages={handleSubscribeMessages}
        subscribing={subscribing}
      />

      {/* Testar envio */}
      <Card>
        <CardHeader>
          <CardTitle>Testar envio</CardTitle>
          <CardDescription>
            Envia o template <code className="text-xs bg-muted px-1 rounded">hello_world</code> (en_US)
            pra um número de teste cadastrado no Meta Dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Número destino (E.164, sem + nem espaços)</Label>
            <Input
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              placeholder="5511999999999"
            />
          </div>
          <Button onClick={handleSendTest} disabled={sending || !existingId}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            Enviar template hello_world
          </Button>

          {ultimoTesteAt && (
            <div className="text-sm text-muted-foreground border-t pt-3">
              <p>
                <strong>Último teste:</strong>{" "}
                {new Date(ultimoTesteAt).toLocaleString("pt-BR")}
              </p>
              {ultimoErro && (
                <p className="text-destructive mt-1 break-all">
                  <strong>Erro:</strong> {ultimoErro}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
