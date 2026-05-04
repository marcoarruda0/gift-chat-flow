import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Loader2, Play, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const ENDPOINT_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1/blinkchat-produto`;

export default function BlinkchatTeste() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const [id, setId] = useState("1");
  const [token, setToken] = useState<string>("");
  const [loadingToken, setLoadingToken] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    url: string;
    status: number;
    elapsedMs: number;
    body: string;
    parsed: any;
    formatOk: boolean;
  } | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoadingToken(true);
      const { data } = await supabase
        .from("vendas_online_config")
        .select("blinkchat_token")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      setToken((data as any)?.blinkchat_token || "");
      setLoadingToken(false);
    })();
  }, [tenantId]);

  const buildUrl = () =>
    token ? `${ENDPOINT_BASE}/${token}?id=${encodeURIComponent(id)}` : "";

  const testar = async () => {
    if (!id || !token) {
      toast.error("Token de integração ainda não carregado");
      return;
    }
    setLoading(true);
    setResult(null);
    const url = buildUrl();
    const start = Date.now();
    try {
      const res = await fetch(url, { method: "GET" });
      const body = await res.text();
      const elapsed = Date.now() - start;
      let parsed: any = null;
      try { parsed = JSON.parse(body); } catch { /* não é JSON */ }
      const formatOk =
        res.ok && parsed && parsed.ok === true && typeof parsed.numero !== "undefined";
      setResult({ url, status: res.status, elapsedMs: elapsed, body, parsed, formatOk });
    } catch (e) {
      const elapsed = Date.now() - start;
      setResult({
        url,
        status: 0,
        elapsedMs: elapsed,
        body: `Falha de rede: ${(e as Error).message}`,
        parsed: null,
        formatOk: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const copy = async (txt: string, label: string) => {
    await navigator.clipboard.writeText(txt);
    toast.success(`${label} copiado`);
  };

  return (
    <div className="container max-w-3xl py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Teste do endpoint Blinkchat</h1>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/vendas-online/config">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parâmetros</CardTitle>
          <CardDescription>
            Simule a chamada que o Blinkchat fará ao endpoint público e veja a resposta retornada.
            O token de integração do seu tenant é usado automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-[200px]">
            <Label htmlFor="bk-id">ID do produto (slot)</Label>
            <Input
              id="bk-id"
              type="number"
              min={1}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="1"
            />
          </div>

          {loadingToken ? (
            <p className="text-sm text-muted-foreground">Carregando token…</p>
          ) : !token ? (
            <p className="text-sm text-destructive">
              Token de integração não encontrado. Salve a configuração de Vendas Online primeiro.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Input readOnly value={buildUrl()} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(buildUrl(), "URL")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Button onClick={testar} disabled={loading || !token}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Testar endpoint
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Resposta
              {result.formatOk ? (
                <Badge className="bg-green-600 hover:bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Formato OK
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" /> Formato inválido
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              HTTP <strong>{result.status}</strong> · <strong>{result.elapsedMs}ms</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label className="text-xs text-muted-foreground">Corpo da resposta (application/json)</Label>
            <pre className="rounded bg-muted p-3 text-xs whitespace-pre-wrap break-all font-mono">
{result.parsed ? JSON.stringify(result.parsed, null, 2) : (result.body || "(vazio)")}
            </pre>
            <p className="text-xs text-muted-foreground">
              Formato esperado: JSON com <code>ok: true</code> e os campos{" "}
              <code>numero</code>, <code>descricao</code>, <code>valor</code>,{" "}
              <code>valor_formatado</code>, <code>status</code>, <code>link</code>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
