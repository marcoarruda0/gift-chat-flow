import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wifi, WifiOff, TestTube, Webhook, Save, Loader2 } from "lucide-react";

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

  const tenantId = profile?.tenant_id;

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
    const payload = {
      tenant_id: tenantId,
      instance_id: instanceId,
      token,
      client_token: clientToken,
    };

    let error;
    if (existingId) {
      ({ error } = await supabase
        .from("zapi_config")
        .update(payload)
        .eq("id", existingId));
    } else {
      const res = await supabase
        .from("zapi_config")
        .insert(payload)
        .select("id")
        .single();
      error = res.error;
      if (res.data) setExistingId(res.data.id);
    }

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Configuração salva!");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/zapi-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ endpoint: "status", method: "GET" }),
        }
      );
      const result = await res.json();

      if (result.connected !== undefined) {
        const newStatus = result.connected ? "conectado" : "desconectado";
        setStatus(newStatus);
        if (existingId) {
          await supabase
            .from("zapi_config")
            .update({ status: newStatus })
            .eq("id", existingId);
        }
        toast.success(
          result.connected
            ? "✅ Instância conectada!"
            : "⚠️ Instância desconectada"
        );
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

      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/zapi-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({
            endpoint: "update-webhook-received",
            method: "PUT",
            data: { value: webhookUrl },
          }),
        }
      );
      const result = await res.json();

      if (result.value || result.webhook) {
        if (existingId) {
          await supabase
            .from("zapi_config")
            .update({ webhook_url: webhookUrl })
            .eq("id", existingId);
        }
        toast.success("Webhook configurado com sucesso!");
      } else {
        toast.info("Resposta: " + JSON.stringify(result));
      }
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setSettingWebhook(false);
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
        <p className="text-muted-foreground">
          Configure a conexão com o WhatsApp via Z-API
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Credenciais</CardTitle>
              <CardDescription>
                Insira os dados da sua instância Z-API
              </CardDescription>
            </div>
            <Badge
              variant={status === "conectado" ? "default" : "secondary"}
              className="gap-1"
            >
              {status === "conectado" ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {status === "conectado" ? "Conectado" : "Desconectado"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instance ID</Label>
            <Input
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              placeholder="Seu Instance ID da Z-API"
            />
          </div>
          <div className="space-y-2">
            <Label>Token</Label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token da instância"
              type="password"
            />
          </div>
          <div className="space-y-2">
            <Label>Client-Token</Label>
            <Input
              value={clientToken}
              onChange={(e) => setClientToken(e.target.value)}
              placeholder="Client-Token da sua conta Z-API"
              type="password"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Salvar
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || !existingId}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <TestTube className="h-4 w-4 mr-1" />
              )}
              Testar Conexão
            </Button>
            <Button
              variant="outline"
              onClick={handleSetWebhook}
              disabled={settingWebhook || !existingId}
            >
              {settingWebhook ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Webhook className="h-4 w-4 mr-1" />
              )}
              Configurar Webhook
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            1. Crie uma instância no{" "}
            <a
              href="https://z-api.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              painel da Z-API
            </a>
          </p>
          <p>2. Copie o Instance ID, Token e Client-Token para os campos acima</p>
          <p>3. Clique em "Salvar" e depois "Testar Conexão"</p>
          <p>
            4. Clique em "Configurar Webhook" para receber mensagens
            automaticamente
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
