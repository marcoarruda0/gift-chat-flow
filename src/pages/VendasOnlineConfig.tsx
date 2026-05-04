import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy, Loader2, RefreshCw, Eye, EyeOff, CheckCircle2, XCircle, Plug, Webhook, ListChecks, Bot, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
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
  const [totalSlots, setTotalSlots] = useState(99);
  const [showKey, setShowKey] = useState(false);
  const [blinkchatToken, setBlinkchatToken] = useState<string>("");
  const [rotatingToken, setRotatingToken] = useState(false);
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

  const [testingWebhook, setTestingWebhook] = useState<null | "billing.paid" | "billing.refunded">(null);
  const [webhookTestResult, setWebhookTestResult] = useState<{
    ok: boolean;
    message: string;
    httpStatus?: number;
    elapsedMs?: number;
    event?: string;
    sentPayload?: unknown;
    responseBody?: unknown;
  } | null>(null);

  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logs, setLogs] = useState<Array<{
    id: string;
    created_at: string;
    event: string | null;
    billing_id: string | null;
    processado: boolean | null;
    erro: string | null;
  }> | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("vendas_online_config")
        .select("abacate_api_key, dev_mode, webhook_secret, total_slots, blinkchat_token")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (data) {
        setApiKey(data.abacate_api_key || "");
        setDevMode(!!data.dev_mode);
        setSecret(data.webhook_secret || "");
        setTotalSlots(data.total_slots ?? 99);
        setBlinkchatToken((data as any).blinkchat_token || "");
      }
      setLoading(false);
    })();
  }, [tenantId]);

  const save = async () => {
    if (!tenantId) return;
    const ts = Math.max(1, Math.min(999, Math.floor(totalSlots || 99)));
    // Se reduzindo: bloquear se houver slot acima com conteúdo
    const { count } = await supabase
      .from("chamado_denis_itens")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gt("numero", ts)
      .or("status.neq.disponivel,descricao.neq.,valor.gt.0");
    if ((count ?? 0) > 0) {
      toast.error(`Existem ${count} slot(s) acima de #${ts} com dados. Limpe-os antes de reduzir.`);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("vendas_online_config")
      .upsert(
        {
          tenant_id: tenantId,
          abacate_api_key: apiKey || null,
          dev_mode: devMode,
          webhook_secret: secret || null,
          total_slots: ts,
        },
        { onConflict: "tenant_id" }
      );
    if (!error) {
      // Apaga slots vazios acima do novo limite
      await supabase
        .from("chamado_denis_itens")
        .delete()
        .eq("tenant_id", tenantId)
        .gt("numero", ts);
    }
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

  const testarWebhook = async (event: "billing.paid" | "billing.refunded") => {
    if (!secret) {
      toast.error("Salve o webhook secret antes de testar");
      return;
    }
    setTestingWebhook(event);
    setWebhookTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("vendas-online-testar-webhook", {
        body: { event },
      });
      if (error) {
        let extra: any = null;
        try { extra = await (error as any).context?.json?.(); } catch { /* noop */ }
        setWebhookTestResult({
          ok: false,
          message: extra?.message || error.message || "Erro ao testar webhook",
          httpStatus: extra?.httpStatus,
          responseBody: extra?.responseBody,
        });
      } else {
        setWebhookTestResult({ ...(data as any), event });
      }
    } catch (e: any) {
      setWebhookTestResult({ ok: false, message: e?.message || "Erro inesperado" });
    } finally {
      setTestingWebhook(null);
    }
  };

  const carregarLogs = async () => {
    if (!tenantId) return;
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("vendas_online_webhook_log")
      .select("id, created_at, event, billing_id, processado, erro")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10);
    setLoadingLogs(false);
    if (error) {
      toast.error("Erro ao carregar logs: " + error.message);
      return;
    }
    setLogs((data as any) || []);
  };

  const webhookUrl =
    secret
      ? `https://${PROJECT_ID}.supabase.co/functions/v1/vendas-online-webhook?webhookSecret=${secret}`
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
          <CardTitle>Slots da planilha</CardTitle>
          <CardDescription>
            Define quantas linhas (slots) numeradas existem na sua tabela de Vendas Online. Cada slot é um ID permanente (ex.: #1 a #99) que pode ser vinculado a outro sistema. Limpar um slot apaga apenas o conteúdo — o ID nunca muda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Quantidade de slots</Label>
          <Input
            type="number"
            min={1}
            max={999}
            value={totalSlots}
            onChange={(e) => setTotalSlots(Number(e.target.value))}
            className="max-w-[180px]"
          />
          <p className="text-xs text-muted-foreground">
            Aumentar cria automaticamente os novos slots vazios. Reduzir só é permitido se os slots acima do novo limite estiverem vazios.
          </p>
        </CardContent>
      </Card>


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
          <CardTitle>Webhook (obrigatório)</CardTitle>
          <CardDescription>
            Sem cadastrar este webhook na AbacatePay, os pagamentos <strong>não</strong> são marcados
            como pagos automaticamente no sistema. Você ainda pode usar o botão "Sincronizar status"
            em cada item, mas é manual.
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

          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-2">
            <p className="font-medium text-amber-700 dark:text-amber-500">
              Como cadastrar na AbacatePay
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground text-xs">
              <li>Acesse <a href="https://app.abacatepay.com" target="_blank" rel="noreferrer" className="text-primary underline">app.abacatepay.com</a> → Configurações → Webhooks.</li>
              <li>Clique em "Adicionar webhook" e cole a URL acima.</li>
              <li>Marque os eventos: <code className="px-1 rounded bg-muted">billing.paid</code>, e (opcional) <code className="px-1 rounded bg-muted">billing.cancelled</code> e <code className="px-1 rounded bg-muted">billing.refunded</code>.</li>
              <li>Salve. A AbacatePay enviará uma notificação de teste — confira em "Vendas Online" se o pagamento aparece.</li>
            </ol>
          </div>

          {/* Testar Webhook */}
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" />
              <p className="font-medium">Testar webhook</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Dispara um evento simulado para confirmar que sua URL está respondendo
              corretamente. <strong>Não altera nenhuma venda</strong> — útil para validar
              a configuração antes de ativar produção.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => testarWebhook("billing.paid")}
                disabled={!secret || testingWebhook !== null}
              >
                {testingWebhook === "billing.paid" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Simular billing.paid
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => testarWebhook("billing.refunded")}
                disabled={!secret || testingWebhook !== null}
              >
                {testingWebhook === "billing.refunded" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Simular billing.refunded
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={carregarLogs}
                disabled={loadingLogs}
              >
                {loadingLogs ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ListChecks className="h-4 w-4 mr-2" />
                )}
                Ver últimos logs
              </Button>
            </div>
            {!secret && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Gere e salve o webhook secret antes de testar.
              </p>
            )}

            {webhookTestResult && (
              <div
                className={`rounded-lg border p-3 space-y-2 text-sm ${
                  webhookTestResult.ok
                    ? "border-green-600/40 bg-green-600/5"
                    : "border-destructive/40 bg-destructive/5"
                }`}
              >
                <div
                  className={`flex items-center gap-2 font-medium ${
                    webhookTestResult.ok
                      ? "text-green-700 dark:text-green-500"
                      : "text-destructive"
                  }`}
                >
                  {webhookTestResult.ok ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span>{webhookTestResult.message}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {webhookTestResult.event && (
                    <span>Evento: <strong>{webhookTestResult.event}</strong></span>
                  )}
                  {typeof webhookTestResult.httpStatus === "number" && (
                    <span>HTTP: <strong>{webhookTestResult.httpStatus}</strong></span>
                  )}
                  {typeof webhookTestResult.elapsedMs === "number" && (
                    <span>Tempo: <strong>{webhookTestResult.elapsedMs}ms</strong></span>
                  )}
                </div>
                {webhookTestResult.responseBody !== undefined && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Ver resposta do webhook
                    </summary>
                    <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug">
{JSON.stringify(webhookTestResult.responseBody, null, 2)}
                    </pre>
                  </details>
                )}
                {webhookTestResult.sentPayload !== undefined && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Ver payload enviado
                    </summary>
                    <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug">
{JSON.stringify(webhookTestResult.sentPayload, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {logs && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium">
                  Últimos {logs.length} eventos recebidos
                </p>
                {logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum evento registrado ainda.
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {logs.map((l) => (
                      <li
                        key={l.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 pb-1 last:border-0"
                      >
                        <span className="text-muted-foreground tabular-nums">
                          {new Date(l.created_at).toLocaleString("pt-BR")}
                        </span>
                        <span className="font-medium">{l.event || "—"}</span>
                        {l.processado ? (
                          <span className="text-green-700 dark:text-green-500">
                            ✓ processado
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-500">
                            pendente
                          </span>
                        )}
                        {l.erro && (
                          <span className="text-destructive">{l.erro}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" /> Integração Blinkchat
          </CardTitle>
          <CardDescription>
            Endpoint público que substitui a planilha do Google Sheets. Configure no bloco de integração GET do
            Blinkchat usando a URL abaixo (o <code>{"{{id}}"}</code> é o placeholder do número do produto).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL do endpoint</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={`https://${PROJECT_ID}.supabase.co/functions/v1/blinkchat-produto?id={{id}}&tenant=${tenantId ?? ""}`}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const url = `https://${PROJECT_ID}.supabase.co/functions/v1/blinkchat-produto?id={{id}}&tenant=${tenantId ?? ""}`;
                  navigator.clipboard.writeText(url);
                  toast.success("URL copiada");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
            <p className="font-medium">Formato da resposta (text/plain)</p>
            <pre className="font-mono text-[11px]">numero - descricao - R$ valor - status - link</pre>
            <p className="text-muted-foreground">
              Exemplo: <code>1 - Camiseta Preta - R$ 50,00 - disponivel - https://pagamento...</code>
            </p>
            <p className="text-muted-foreground">
              Slots vazios usam <code>sem descricao</code>, <code>0,00</code>, <code>disponivel</code> e
              {" "}<code>sem link</code>.
            </p>
          </div>

          <Button variant="outline" asChild>
            <Link to="/vendas-online/blinkchat-teste">
              <ExternalLink className="h-4 w-4" /> Abrir tela de teste
            </Link>
          </Button>
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
