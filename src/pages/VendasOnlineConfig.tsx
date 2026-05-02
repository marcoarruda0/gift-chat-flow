import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy, Loader2, RefreshCw, Eye, EyeOff, CheckCircle2, XCircle, Plug } from "lucide-react";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;

function randomSecret(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function VendasOnlineConfig() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [devMode, setDevMode] = useState(true);
  const [secret, setSecret] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; mode?: string } | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("vendas_online_config")
        .select("abacate_api_key, dev_mode, webhook_secret")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (data) {
        setApiKey(data.abacate_api_key || "");
        setDevMode(!!data.dev_mode);
        setSecret(data.webhook_secret || "");
      }
      setLoading(false);
    })();
  }, [tenantId]);

  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    const { error } = await supabase
      .from("vendas_online_config")
      .upsert(
        {
          tenant_id: tenantId,
          abacate_api_key: apiKey || null,
          dev_mode: devMode,
          webhook_secret: secret || null,
        },
        { onConflict: "tenant_id" }
      );
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Configuração salva");
  };

  const generateSecret = () => setSecret(randomSecret(24));

  const webhookUrl =
    tenantId && secret
      ? `https://${PROJECT_ID}.supabase.co/functions/v1/vendas-online-webhook?webhookSecret=${tenantId}:${secret}`
      : "";

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Configuração Vendas Online</h1>
        <p className="text-muted-foreground">Conecte sua conta AbacatePay para gerar links de pagamento.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AbacatePay</CardTitle>
          <CardDescription>
            Crie sua chave em{" "}
            <a
              href="https://app.abacatepay.com"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              app.abacatepay.com
            </a>{" "}
            → Integrações → API Keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Chave de API</Label>
            <div className="flex gap-2">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="abc_dev_... ou abc_live_..."
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowKey((s) => !s)}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">Modo de desenvolvimento</p>
              <p className="text-sm text-muted-foreground">Use chave de teste enquanto valida a integração.</p>
            </div>
            <Switch checked={devMode} onCheckedChange={setDevMode} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
          <CardDescription>
            Cole esta URL no painel da AbacatePay (Webhooks) para receber atualizações de pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook secret</Label>
            <div className="flex gap-2">
              <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Clique em Gerar" />
              <Button type="button" variant="outline" onClick={generateSecret}>
                <RefreshCw className="h-4 w-4 mr-2" /> Gerar
              </Button>
            </div>
          </div>

          {webhookUrl && (
            <div className="space-y-2">
              <Label>URL do Webhook</Label>
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={() => copy(webhookUrl, "URL")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Salve a configuração antes de cadastrar a URL na AbacatePay.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar configuração
        </Button>
      </div>
    </div>
  );
}
