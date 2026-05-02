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
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    mode?: string;
    apiVersion?: number;
    httpStatus?: number;
    errorPayload?: unknown;
    rawBody?: string;
  } | null>(null);

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

  const testarConexao = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("vendas-online-testar-chave");
      if (error) {
        // Tenta extrair body de resposta non-2xx
        let extra: any = null;
        try { extra = await (error as any).context?.json?.(); } catch { /* noop */ }
        setTestResult({
          ok: false,
          message: extra?.message || error.message || "Erro ao testar chave",
          httpStatus: extra?.httpStatus,
          errorPayload: extra?.errorPayload,
          rawBody: extra?.rawBody,
        });
      } else {
        setTestResult(data as any);
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || "Erro inesperado" });
    } finally {
      setTesting(false);
    }
  };

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
          <div className="flex items-center justify-between gap-2">
            <CardTitle>AbacatePay</CardTitle>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              API v2
            </span>
          </div>
          <CardDescription>
            Esta integração usa a <strong>API v2</strong> da AbacatePay (Checkout). Gere sua chave em{" "}
            <a
              href="https://app.abacatepay.com"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              app.abacatepay.com
            </a>{" "}
            → Integrações → API Keys e cole abaixo. O cliente preenche os próprios dados na página de pagamento; você não precisa coletar CPF/email no seu app.
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

          <div className="space-y-3">
            <Button type="button" variant="outline" onClick={testarConexao} disabled={testing || !apiKey}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
              Testar conexão
            </Button>
            {testResult && (
              <div
                className={`rounded-lg border p-3 space-y-2 text-sm ${
                  testResult.ok
                    ? "border-green-600/40 bg-green-600/5"
                    : "border-destructive/40 bg-destructive/5"
                }`}
              >
                <div
                  className={`flex items-center gap-2 font-medium ${
                    testResult.ok ? "text-green-700 dark:text-green-500" : "text-destructive"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span>{testResult.message}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {testResult.apiVersion && (
                    <span>API: <strong>v{testResult.apiVersion}</strong></span>
                  )}
                  {testResult.mode && <span>Modo: <strong>{testResult.mode}</strong></span>}
                  {typeof testResult.httpStatus === "number" && (
                    <span>HTTP: <strong>{testResult.httpStatus}</strong></span>
                  )}
                </div>
                {(testResult.errorPayload || testResult.rawBody) && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Ver payload de erro
                    </summary>
                    <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug">
{testResult.errorPayload
  ? JSON.stringify(testResult.errorPayload, null, 2)
  : testResult.rawBody}
                    </pre>
                  </details>
                )}
              </div>
            )}
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
