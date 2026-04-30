import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Instagram, Loader2, Copy, CheckCircle2, AlertCircle, ExternalLink, ShieldCheck, XCircle, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { validateInstagramToken, REQUIRED_PERMISSIONS } from "@/lib/instagram-token";

interface IgConfig {
  id?: string;
  ig_user_id: string;
  ig_username: string | null;
  page_id: string;
  page_access_token: string;
  verify_token: string;
  status: string;
  ultimo_erro: string | null;
  ultima_mensagem_at: string | null;
  ultima_verificacao_at: string | null;
}

interface TokenTestResult {
  ok: boolean;
  token_valid: boolean;
  ig_account_valid: boolean;
  ig_username: string | null;
  permissions: {
    granted: string[];
    declined: string[];
    missing: string[];
    required: string[];
    optional: string[];
    missing_optional: string[];
  };
  errors: string[];
  summary: string;
}

const empty: IgConfig = {
  ig_user_id: "",
  ig_username: null,
  page_id: "",
  page_access_token: "",
  verify_token: "",
  status: "desconectado",
  ultimo_erro: null,
  ultima_mensagem_at: null,
  ultima_verificacao_at: null,
};

export default function InstagramConfig() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const [config, setConfig] = useState<IgConfig>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingToken, setTestingToken] = useState(false);
  const [activating, setActivating] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [tokenTest, setTokenTest] = useState<TokenTestResult | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-webhook`;

  const tokenValidation = validateInstagramToken(config.page_access_token);

  useEffect(() => { if (tenantId) fetchConfig(); }, [tenantId]);

  async function fetchConfig() {
    setLoading(true);
    const { data } = await supabase
      .from("instagram_config")
      .select("*")
      .eq("tenant_id", tenantId!)
      .maybeSingle();
    if (data) setConfig(data as any);
    setLoading(false);
  }

  async function handleSave() {
    if (!tenantId) return;
    if (!config.ig_user_id || !config.page_id) {
      toast.error("Preencha IG User ID e Page ID");
      return;
    }
    if (!tokenValidation.ok) {
      toast.error(tokenValidation.error || "Token inválido");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        ig_user_id: config.ig_user_id.trim(),
        page_id: config.page_id.trim(),
        page_access_token: tokenValidation.cleaned,
      };
      if (config.id) {
        const { error } = await supabase.from("instagram_config").update(payload).eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("instagram_config").insert(payload);
        if (error) throw error;
      }
      toast.success("Configuração salva!");
      setTokenTest(null);
      await fetchConfig();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestToken() {
    setTestingToken(true);
    setTokenTest(null);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-proxy", {
        body: {
          action: "test_token",
          draft: {
            ig_user_id: config.ig_user_id?.trim() || "",
            page_id: config.page_id?.trim() || "",
            page_access_token: (config.page_access_token || "").replace(/[\s"'`]+/g, "").trim(),
          },
        },
      });
      if (error) throw error;
      setTokenTest(data as TokenTestResult);
      if (data?.ok) toast.success("Token e permissões OK!");
      else toast.error("Há problemas — veja o relatório abaixo");
      await fetchConfig();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setTestingToken(false);
    }
  }

  async function handleActivate() {
    setActivating(true);
    try {
      const { data: tc, error: e1 } = await supabase.functions.invoke("instagram-proxy", {
        body: { action: "test_connection" },
      });
      if (e1) throw e1;
      if (tc?.error) throw new Error(JSON.stringify(tc).slice(0, 200));

      const { data: sw, error: e2 } = await supabase.functions.invoke("instagram-proxy", {
        body: { action: "subscribe_webhook" },
      });
      if (e2) throw e2;
      if (sw?.error) {
        toast.warning("Conectado, mas falha ao inscrever webhook: " + JSON.stringify(sw).slice(0, 150));
      } else {
        toast.success("Conexão ativada e webhook inscrito!");
      }
      await fetchConfig();
    } catch (err: any) {
      toast.error("Erro ao ativar: " + err.message);
    } finally {
      setActivating(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-proxy", {
        body: { action: "test_connection" },
      });
      if (error) throw error;
      if (data?.error || data?.username == null) {
        toast.error("Falha: " + JSON.stringify(data).slice(0, 200));
      } else {
        toast.success(`Conectado como @${data.username}`);
      }
      await fetchConfig();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally { setTesting(false); }
  }

  async function handleSubscribe() {
    setSubscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-proxy", {
        body: { action: "subscribe_webhook" },
      });
      if (error) throw error;
      if (data?.success || data?.error == null) {
        toast.success("Webhook inscrito na página!");
      } else {
        toast.error("Falha: " + JSON.stringify(data).slice(0, 200));
      }
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally { setSubscribing(false); }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Instagram className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Configuração Instagram</h1>
          <p className="text-muted-foreground text-sm">Conecte uma conta Instagram Business para receber DMs nas Conversas.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Status
            <Badge variant={config.status === "conectado" ? "default" : "secondary"}>
              {config.status === "conectado" ? "Conectado" : config.status === "erro" ? "Erro" : "Desconectado"}
            </Badge>
            {config.ig_username && <span className="text-sm text-muted-foreground">@{config.ig_username}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {config.ultima_verificacao_at && <p>Última verificação: {new Date(config.ultima_verificacao_at).toLocaleString("pt-BR")}</p>}
          {config.ultima_mensagem_at && <p>Última mensagem recebida: {new Date(config.ultima_mensagem_at).toLocaleString("pt-BR")}</p>}
          {config.ultimo_erro && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Último erro</AlertTitle>
              <AlertDescription className="text-xs break-all">{config.ultimo_erro}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credenciais</CardTitle>
          <CardDescription>
            Obtenha estes valores no <a className="underline" target="_blank" rel="noopener" href="https://developers.facebook.com/tools/explorer">Graph API Explorer</a> da Meta. A conta IG precisa ser Business/Creator vinculada a uma Página do Facebook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Instagram Business Account ID (ig_user_id)</Label>
            <Input value={config.ig_user_id} onChange={e => setConfig({ ...config, ig_user_id: e.target.value })} placeholder="17841400000000000" />
          </div>
          <div>
            <Label>Page ID (Facebook Page vinculada)</Label>
            <Input value={config.page_id} onChange={e => setConfig({ ...config, page_id: e.target.value })} placeholder="1234567890" />
          </div>
          <div>
            <Label>Page Access Token (longa duração - 60 dias)</Label>
            <Input
              type="password"
              value={config.page_access_token}
              onChange={e => setConfig({ ...config, page_access_token: e.target.value })}
              placeholder="EAAB..."
              className={config.page_access_token && !tokenValidation.ok ? "border-destructive" : ""}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">
                Escopos: instagram_basic, instagram_manage_messages, pages_manage_metadata, pages_show_list.
              </p>
              {config.page_access_token && (
                <span className="text-xs text-muted-foreground">
                  {tokenValidation.cleaned.length} chars
                </span>
              )}
            </div>
            {config.page_access_token && !tokenValidation.ok && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <XCircle className="h-3 w-3" /> {tokenValidation.error}
              </p>
            )}
            {config.page_access_token && tokenValidation.ok && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Formato OK {tokenValidation.warning && `· ${tokenValidation.warning}`}
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleSave} disabled={saving || (!!config.page_access_token && !tokenValidation.ok)}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
            <Button variant="default" onClick={handleTestToken} disabled={testingToken || !config.id}>
              {testingToken && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <ShieldCheck className="h-4 w-4 mr-1" /> Testar token e permissões
            </Button>
          </div>
        </CardContent>
      </Card>

      {tokenTest && (
        <Card className={tokenTest.ok ? "border-green-500" : "border-destructive"}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {tokenTest.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-destructive" />}
              Relatório do teste
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              {tokenTest.token_valid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
              <span>Token aceito pela Meta</span>
            </div>
            <div className="flex items-center gap-2">
              {tokenTest.ig_account_valid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
              <span>IG User ID válido {tokenTest.ig_username && <>— @{tokenTest.ig_username}</>}</span>
            </div>

            <div>
              <p className="font-medium mb-1">Permissões obrigatórias</p>
              <div className="flex flex-wrap gap-1">
                {tokenTest.permissions.required.map(p => {
                  const ok = tokenTest.permissions.granted.includes(p);
                  return (
                    <Badge key={p} variant={ok ? "default" : "destructive"} className="font-mono text-xs">
                      {ok ? "✓" : "✗"} {p}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {tokenTest.permissions.missing_optional.length > 0 && (
              <div>
                <p className="font-medium mb-1 text-muted-foreground">Opcionais ausentes</p>
                <div className="flex flex-wrap gap-1">
                  {tokenTest.permissions.missing_optional.map(p => (
                    <Badge key={p} variant="secondary" className="font-mono text-xs">{p}</Badge>
                  ))}
                </div>
              </div>
            )}

            {tokenTest.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Problemas encontrados</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4 text-xs space-y-1">
                    {tokenTest.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleActivate} disabled={!tokenTest.ok || activating}>
                {activating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Ativar conexão
              </Button>
              {!tokenTest.ok && (
                <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener">
                  <Button variant="outline">Regenerar token <ExternalLink className="h-3 w-3 ml-1" /></Button>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-xs">
            <ChevronDown className="h-3 w-3 mr-1" /> Ações avançadas
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleTest} disabled={testing || !config.id}>
              {testing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Testar conexão (legado)
            </Button>
            <Button variant="outline" onClick={handleSubscribe} disabled={subscribing || !config.id}>
              {subscribing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Inscrever webhook
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook (configure no painel Meta)</CardTitle>
          <CardDescription>
            No app Meta → Webhooks → Instagram, cole estes valores e inscreva nos campos: messages, messaging_postbacks, message_reactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Callback URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} />
              <Button variant="outline" size="icon" onClick={() => copy(webhookUrl, "URL")}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          <div>
            <Label>Verify Token</Label>
            <div className="flex gap-2">
              <Input readOnly value={config.verify_token} />
              <Button variant="outline" size="icon" onClick={() => copy(config.verify_token, "Token")}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener" className="text-sm text-primary inline-flex items-center gap-1">
            Abrir painel Meta <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
