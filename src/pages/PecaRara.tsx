import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, Send, TestTube, Eye, RotateCcw, Loader2 } from "lucide-react";
import { format } from "date-fns";

const DEFAULT_TEMPLATE = `Aprovação da Captação: R-{id}

Para conferir e aprovar os itens para venda, clique no link:
{link}

Importante: As peças que não forem aprovadas na triagem serão encaminhadas para doação no prazo de até 7 dias úteis após o cadastro das mercadorias. Caso não concorde com a doação, por favor, entre em contato com a loja o quanto antes.`;

const EXAMPLE_DATA = {
  id: 248718,
  link: "https://pinoquio.pecararabrecho.com.br/external/fornecedor/abc-123/confirmacao-produtos?origin=link",
  fornecedor_name: "MARIA APARECIDA FERREIRA",
  qty_total: 7,
  valor_pix: 83,
  valor_consignacao: 132,
  data_limite: "29/04/2026",
};

function applyTemplatePreview(template: string): string {
  return template
    .replace(/\{id\}/g, String(EXAMPLE_DATA.id))
    .replace(/\{link\}/g, EXAMPLE_DATA.link)
    .replace(/\{fornecedor_name\}/g, EXAMPLE_DATA.fornecedor_name)
    .replace(/\{qty_total\}/g, String(EXAMPLE_DATA.qty_total))
    .replace(/\{valor_pix\}/g, String(EXAMPLE_DATA.valor_pix))
    .replace(/\{valor_consignacao\}/g, String(EXAMPLE_DATA.valor_consignacao))
    .replace(/\{data_limite\}/g, EXAMPLE_DATA.data_limite);
}

function statusBadge(status: string | null) {
  if (!status) return <Badge variant="outline">Não notificado</Badge>;
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    enviado: { variant: "default", label: "Enviado" },
    erro: { variant: "destructive", label: "Erro" },
    sem_telefone: { variant: "secondary", label: "Sem telefone" },
    ignorado: { variant: "outline", label: "Ignorado" },
    pendente: { variant: "outline", label: "Pendente" },
  };
  const s = map[status] || { variant: "outline" as const, label: status };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export default function PecaRara() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Peça Rara — Notificações Pinóquio</h1>
        <p className="text-muted-foreground">Gerencie notificações automáticas para fornecedores</p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          {tenantId && <DashboardTab tenantId={tenantId} />}
        </TabsContent>
        <TabsContent value="historico">
          {tenantId && <HistoricoTab tenantId={tenantId} />}
        </TabsContent>
        <TabsContent value="template">
          {tenantId && <TemplateTab tenantId={tenantId} />}
        </TabsContent>
        <TabsContent value="config">
          {tenantId && <ConfigTab tenantId={tenantId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===== DASHBOARD TAB =====
function DashboardTab({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<number | "all" | null>(null);
  const [filterStatus, setFilterStatus] = useState("todos");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("pinoquio-sync", {
        body: { tenant_id: tenantId, action: "fetch_pendentes" },
      });
      if (error) throw error;
      setData(result?.data || []);
    } catch (e: any) {
      toast.error("Erro ao buscar dados: " + (e.message || "erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sendNotification = async (ids: number[]) => {
    setSending(ids.length === 1 ? ids[0] : "all");
    try {
      const { data: result, error } = await supabase.functions.invoke("pinoquio-sync", {
        body: { tenant_id: tenantId, cadastramento_ids: ids },
      });
      if (error) throw error;
      const s = result?.stats;
      toast.success(`Enviados: ${s?.total_novos_enviados || 0}, Erros: ${s?.total_erros || 0}, Ignorados: ${s?.total_ignorados || 0}`);
      fetchData();
    } catch (e: any) {
      toast.error("Erro: " + (e.message || "falha ao enviar"));
    } finally {
      setSending(null);
    }
  };

  const pendingItems = data.filter((c) => {
    if (c.is_products_approved_by_fornecedor) return false;
    if (c.acquisition_type_choosed) return false;
    const notifStatus = c.notificacao?.status;
    if (filterStatus === "nao_notificado") return !notifStatus;
    if (filterStatus === "enviado") return notifStatus === "enviado";
    if (filterStatus === "erro") return notifStatus === "erro";
    return true;
  });

  const pendingToNotify = data.filter(
    (c) => !c.is_products_approved_by_fornecedor && !c.acquisition_type_choosed && !c.notificacao
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Cadastramentos Pendentes</CardTitle>
            <CardDescription>{data.length} cadastramentos na API Pinóquio</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="nao_notificado">Não notificados</SelectItem>
                <SelectItem value="enviado">Enviados</SelectItem>
                <SelectItem value="erro">Com erro</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            {pendingToNotify.length > 0 && (
              <Button
                size="sm"
                onClick={() => sendNotification(pendingToNotify.map((c) => c.id))}
                disabled={sending !== null}
              >
                {sending === "all" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Notificar Todos ({pendingToNotify.length})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lote</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead className="text-center">Peças</TableHead>
              <TableHead className="text-right">Pix</TableHead>
              <TableHead className="text-right">Consignação</TableHead>
              <TableHead>Data Limite</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data.length ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Carregando...
                </TableCell>
              </TableRow>
            ) : pendingItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Nenhum cadastramento encontrado
                </TableCell>
              </TableRow>
            ) : (
              pendingItems.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-medium">R-{c.id}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{c.fornecedor_name}</TableCell>
                  <TableCell>{c.fornecedor_telefone || "—"}</TableCell>
                  <TableCell className="text-center">{c.qty_total}</TableCell>
                  <TableCell className="text-right">R$ {c.vl_total_fornecedor_pix}</TableCell>
                  <TableCell className="text-right">R$ {c.vl_total_fornecedor_consignacao}</TableCell>
                  <TableCell>
                    {c.limit_date ? format(new Date(c.limit_date), "dd/MM/yyyy") : "—"}
                  </TableCell>
                  <TableCell>{statusBadge(c.notificacao?.status)}</TableCell>
                  <TableCell>
                    {!c.notificacao?.status || c.notificacao?.status === "erro" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendNotification([c.id])}
                        disabled={sending !== null}
                      >
                        {sending === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ===== HISTORICO TAB =====
function HistoricoTab({ tenantId }: { tenantId: string }) {
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pinoquio_notificacoes")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200);
    setNotifs(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const resend = async (n: any) => {
    setResending(n.id);
    try {
      const { error } = await supabase.functions.invoke("pinoquio-sync", {
        body: { tenant_id: tenantId, cadastramento_ids: [n.cadastramento_id], force_resend: true },
      });
      if (error) throw error;
      toast.success("Reenvio realizado");
      fetch_();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setResending(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Histórico de Notificações</CardTitle>
          <Button variant="outline" size="sm" onClick={fetch_}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Erro</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : notifs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma notificação registrada</TableCell></TableRow>
            ) : (
              notifs.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="whitespace-nowrap">
                    {n.enviado_at ? format(new Date(n.enviado_at), "dd/MM/yyyy HH:mm") : format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell className="font-mono">{n.lote}</TableCell>
                  <TableCell className="max-w-[180px] truncate">{n.fornecedor_nome}</TableCell>
                  <TableCell>{n.fornecedor_telefone || "—"}</TableCell>
                  <TableCell>{statusBadge(n.status)}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-destructive">{n.erro_mensagem || ""}</TableCell>
                  <TableCell>
                    {n.status === "erro" && (
                      <Button size="sm" variant="outline" onClick={() => resend(n)} disabled={resending === n.id}>
                        {resending === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ===== TEMPLATE TAB =====
function TemplateTab({ tenantId }: { tenantId: string }) {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.from("pinoquio_config").select("template_mensagem").eq("tenant_id", tenantId).single()
      .then(({ data }) => {
        if (data?.template_mensagem) setTemplate(data.template_mensagem);
        setLoaded(true);
      });
  }, [tenantId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("pinoquio_config")
      .update({ template_mensagem: template })
      .eq("tenant_id", tenantId);
    if (error) {
      toast.error("Erro ao salvar template");
    } else {
      toast.success("Template salvo");
    }
    setSaving(false);
  };

  if (!loaded) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Editor do Template</CardTitle>
          <CardDescription>
            Variáveis: {"{id}"}, {"{link}"}, {"{fornecedor_name}"}, {"{qty_total}"}, {"{valor_pix}"}, {"{valor_consignacao}"}, {"{data_limite}"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={12} className="font-mono text-sm" />
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar Template
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-4 w-4" /> Preview
          </CardTitle>
          <CardDescription>Exemplo com dados fictícios</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 whitespace-pre-wrap text-sm font-mono">
            {applyTemplatePreview(template)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== CONFIG TAB =====
function ConfigTab({ tenantId }: { tenantId: string }) {
  const [config, setConfig] = useState({
    jwt_token: "",
    api_base_url: "https://api-pinoquio.pecararabrecho.com.br/api",
    intervalo_polling_min: 10,
    polling_ativo: false,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    supabase.from("pinoquio_config").select("*").eq("tenant_id", tenantId).single()
      .then(({ data }) => {
        if (data) {
          setConfig({
            jwt_token: data.jwt_token,
            api_base_url: data.api_base_url,
            intervalo_polling_min: data.intervalo_polling_min,
            polling_ativo: data.polling_ativo,
          });
          setExists(true);
        }
        setLoaded(true);
      });
  }, [tenantId]);

  const save = async () => {
    setSaving(true);
    if (exists) {
      const { error } = await supabase
        .from("pinoquio_config")
        .update(config)
        .eq("tenant_id", tenantId);
      if (error) toast.error("Erro ao salvar"); else toast.success("Configuração salva");
    } else {
      const { error } = await supabase
        .from("pinoquio_config")
        .insert({ ...config, tenant_id: tenantId });
      if (error) toast.error("Erro ao criar config: " + error.message);
      else { toast.success("Configuração criada"); setExists(true); }
    }
    setSaving(false);
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinoquio-sync", {
        body: { tenant_id: tenantId, action: "test_connection" },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Conexão OK! ${data.total} cadastramentos pendentes na API.`);
      } else {
        toast.error("Falha: " + (data?.error || "erro desconhecido"));
      }
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuração do Pinóquio</CardTitle>
        <CardDescription>Configure a integração com o sistema Pinóquio e o polling automático</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>JWT Token do Pinóquio</Label>
          <Input
            type="password"
            value={config.jwt_token}
            onChange={(e) => setConfig((c) => ({ ...c, jwt_token: e.target.value }))}
            placeholder="Cole o JWT token aqui"
          />
        </div>

        <div className="space-y-2">
          <Label>URL Base da API</Label>
          <Input
            value={config.api_base_url}
            onChange={(e) => setConfig((c) => ({ ...c, api_base_url: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Intervalo de Polling (minutos)</Label>
          <Select
            value={String(config.intervalo_polling_min)}
            onValueChange={(v) => setConfig((c) => ({ ...c, intervalo_polling_min: parseInt(v) }))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 minutos</SelectItem>
              <SelectItem value="10">10 minutos</SelectItem>
              <SelectItem value="15">15 minutos</SelectItem>
              <SelectItem value="30">30 minutos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            checked={config.polling_ativo}
            onCheckedChange={(v) => setConfig((c) => ({ ...c, polling_ativo: v }))}
          />
          <Label>Polling automático ativo</Label>
        </div>

        <div className="flex gap-3">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar Configuração
          </Button>
          <Button variant="outline" onClick={testConnection} disabled={testing || !config.jwt_token}>
            {testing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TestTube className="h-4 w-4 mr-1" />}
            Testar Conexão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
