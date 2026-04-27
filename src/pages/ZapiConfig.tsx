import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Wifi, WifiOff, TestTube, Webhook, Save, Loader2, QrCode, Unplug, RefreshCw, RotateCcw } from "lucide-react";

export default function ZapiConfig() {
  const { profile } = useAuth();
  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [status, setStatus] = useState("desconectado");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tenantId = profile?.tenant_id;

  const getAuthHeaders = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return {
      url: `https://${projectId}.supabase.co/functions/v1/zapi-proxy`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session?.access_token}`,
      },
    };
  }, []);

  const callProxy = useCallback(async (endpoint: string, method = "GET", data?: any) => {
    const { url, headers } = await getAuthHeaders();
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ endpoint, method, data }),
    });
    return res.json();
  }, [getAuthHeaders]);

  const updateDbStatus = useCallback(async (newStatus: string) => {
    setStatus(newStatus);
    if (existingId) {
      await supabase.from("zapi_config").update({ status: newStatus }).eq("id", existingId);
    }
  }, [existingId]);

  // Poll status every 5s when QR is showing
  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const result = await callProxy("status", "GET");
        if (result.connected) {
          await updateDbStatus("conectado");
          setQrCodeUrl(null);
          stopPolling();
          toast.success("✅ WhatsApp conectado com sucesso!");
        }
      } catch { /* ignore */ }
    }, 5000);
  }, [callProxy, updateDbStatus]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase
        .from("zapi_config")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (data) {
        setInstanceId(data.instance_id);
        setToken(data.token);
        setClientToken(data.client_token);
        setStatus(data.status);
        setExistingId(data.id);
      }
      setLoading(false);
    })();
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId || !instanceId || !token || !clientToken) {
      toast.error("Preencha todos os campos");
      return;
    }
    setSaving(true);
    const payload = { tenant_id: tenantId, instance_id: instanceId, token, client_token: clientToken };
    let error;
    if (existingId) {
      ({ error } = await supabase.from("zapi_config").update(payload).eq("id", existingId));
    } else {
      const res = await supabase.from("zapi_config").insert(payload).select("id").single();
      error = res.error;
      if (res.data) setExistingId(res.data.id);
    }
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Configuração salva!");
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await callProxy("status", "GET");
      if (result.connected !== undefined) {
        const newStatus = result.connected ? "conectado" : "desconectado";
        await updateDbStatus(newStatus);
        toast.success(result.connected ? "✅ Instância conectada!" : "⚠️ Instância desconectada");
      } else if (result.error) {
        toast.error("Erro: " + result.error);
      } else {
        toast.info("Resposta da Z-API: " + JSON.stringify(result));
      }
    } catch (e: any) {
      toast.error("Erro ao testar: " + e.message);
    }
    setTesting(false);
  };

  const handleSetWebhook = async () => {
    setSettingWebhook(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const webhookUrl = `https://${projectId}.supabase.co/functions/v1/zapi-webhook`;

      // Helper: trata sucesso pelo HTTP status retornado pelo proxy
      const isOk = (res: any) =>
        res && typeof res._httpStatus === "number" && res._httpStatus >= 200 && res._httpStatus < 300 && !res.error;

      // 1) Tenta o endpoint único que registra TODOS os webhooks de uma vez
      let allOk = false;
      try {
        const result = await callProxy("update-every-webhooks", "PUT", { value: webhookUrl });
        allOk = isOk(result);
      } catch {
        allOk = false;
      }

      if (allOk) {
        if (existingId) {
          await supabase.from("zapi_config").update({ webhook_url: webhookUrl }).eq("id", existingId);
        }
        toast.success("✅ Todos os webhooks configurados (recebidas, enviadas e entregas)");
        setSettingWebhook(false);
        return;
      }

      // 2) Fallback: registra individualmente
      const endpoints = [
        { path: "update-webhook-received", label: "Mensagens recebidas" },
        { path: "update-webhook-message-send", label: "Mensagens enviadas (celular/WA Web)" },
        { path: "update-webhook-delivery", label: "Status de entrega" },
      ];

      const results = await Promise.allSettled(
        endpoints.map((e) => callProxy(e.path, "PUT", { value: webhookUrl }))
      );

      const sucessos: string[] = [];
      const falhas: string[] = [];
      results.forEach((r, i) => {
        const ep = endpoints[i];
        if (r.status === "fulfilled" && isOk(r.value)) sucessos.push(ep.label);
        else falhas.push(ep.label);
      });

      const criticosOk =
        sucessos.includes(endpoints[0].label) && sucessos.includes(endpoints[1].label);
      if (criticosOk && existingId) {
        await supabase.from("zapi_config").update({ webhook_url: webhookUrl }).eq("id", existingId);
      }

      if (falhas.length === 0) {
        toast.success(`✅ ${sucessos.length}/${endpoints.length} webhooks configurados`);
      } else if (sucessos.length > 0) {
        toast.warning(`${sucessos.length}/${endpoints.length} configurados. Falha em: ${falhas.join(", ")}`);
      } else {
        toast.error(`Falha ao configurar webhooks: ${falhas.join(", ")}`);
      }
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setSettingWebhook(false);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await callProxy("disconnect", "POST");
      await updateDbStatus("desconectado");
      toast.success("Instância desconectada");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setDisconnecting(false);
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    setQrCodeUrl(null);
    try {
      await callProxy("restart", "POST");
      await updateDbStatus("desconectado");
      // Wait a moment for instance to restart, then fetch QR
      setTimeout(() => fetchQrCode(), 3000);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
      setReconnecting(false);
    }
  };

  const fetchQrCode = async () => {
    setLoadingQr(true);
    try {
      const result = await callProxy("qr-code/image", "GET");
      if (result.value) {
        setQrCodeUrl(result.value);
        startPolling();
        toast.info("Escaneie o QR Code com seu WhatsApp");
      } else if (result.error) {
        toast.error("Erro ao obter QR Code: " + result.error);
      } else {
        // Some Z-API versions return the image directly
        setQrCodeUrl(result.image || result.qrcode || null);
        if (result.image || result.qrcode) startPolling();
        else toast.info("Resposta: " + JSON.stringify(result));
      }
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setLoadingQr(false);
    setReconnecting(false);
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
        <h1 className="text-2xl font-bold">Integração Z-API</h1>
        <p className="text-muted-foreground">Configure a conexão com o WhatsApp via Z-API</p>
      </div>

      {/* Status & Connection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Credenciais</CardTitle>
              <CardDescription>Insira os dados da sua instância Z-API</CardDescription>
            </div>
            <Badge variant={status === "conectado" ? "default" : "secondary"} className="gap-1">
              {status === "conectado" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {status === "conectado" ? "Conectado" : "Desconectado"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instance ID</Label>
            <Input value={instanceId} onChange={(e) => setInstanceId(e.target.value)} placeholder="Seu Instance ID da Z-API" />
          </div>
          <div className="space-y-2">
            <Label>Token</Label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token da instância" type="password" />
          </div>
          <div className="space-y-2">
            <Label>Client-Token</Label>
            <Input value={clientToken} onChange={(e) => setClientToken(e.target.value)} placeholder="Client-Token da sua conta Z-API" type="password" />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing || !existingId}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <TestTube className="h-4 w-4 mr-1" />}
              Testar Conexão
            </Button>
            <Button variant="outline" onClick={handleSetWebhook} disabled={settingWebhook || !existingId}>
              {settingWebhook ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Webhook className="h-4 w-4 mr-1" />}
              Configurar Webhook
            </Button>
          </div>

          {/* Reconnect / Disconnect buttons */}
          {existingId && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {status === "conectado" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={disconnecting}>
                      {disconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Unplug className="h-4 w-4 mr-1" />}
                      Desconectar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Desconectar instância?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Isso vai desconectar o WhatsApp desta instância. As mensagens e conversas existentes serão mantidas.
                        Você precisará escanear o QR Code novamente para reconectar.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDisconnect}>Desconectar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button variant="outline" onClick={handleReconnect} disabled={reconnecting || loadingQr}>
                  {reconnecting || loadingQr ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Reconectar
                </Button>
              )}

              {status !== "conectado" && !qrCodeUrl && !reconnecting && (
                <Button variant="outline" onClick={fetchQrCode} disabled={loadingQr}>
                  {loadingQr ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <QrCode className="h-4 w-4 mr-1" />}
                  Exibir QR Code
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR Code Card */}
      {qrCodeUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Escaneie o QR Code
            </CardTitle>
            <CardDescription>
              Abra o WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="bg-background border rounded-lg p-4">
              <img src={qrCodeUrl} alt="QR Code WhatsApp" className="w-64 h-64 object-contain" />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aguardando leitura do QR Code...
            </div>
            <Button variant="ghost" size="sm" onClick={fetchQrCode} disabled={loadingQr}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar QR Code
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Crie uma instância no{" "}
            <a href="https://z-api.io" target="_blank" rel="noopener noreferrer" className="text-primary underline">painel da Z-API</a>
          </p>
          <p>2. Copie o Instance ID, Token e Client-Token para os campos acima</p>
          <p>3. Clique em "Salvar" e depois "Testar Conexão"</p>
          <p>4. Clique em "Configurar Webhook" para receber mensagens automaticamente</p>
          <p>5. Se desconectar, use "Reconectar" para gerar novo QR Code</p>
        </CardContent>
      </Card>
    </div>
  );
}
