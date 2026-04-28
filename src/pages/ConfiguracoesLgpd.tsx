import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, Download, Ban, Loader2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface LgpdConfig {
  id?: string;
  politica_privacidade_url: string;
  texto_descadastro: string;
  incluir_link_automatico: boolean;
}

const DEFAULT_CONFIG: LgpdConfig = {
  politica_privacidade_url: "",
  texto_descadastro: "Para parar de receber mensagens, clique aqui: {opt_out_url}",
  incluir_link_automatico: false,
};

export default function ConfiguracoesLgpd() {
  const { profile, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isAdmin = hasRole("admin_tenant") || hasRole("admin_master");
  const tenantId = profile?.tenant_id;

  const [config, setConfig] = useState<LgpdConfig>(DEFAULT_CONFIG);
  const [optedOut, setOptedOut] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data: cfg } = await (supabase as any)
        .from("lgpd_config")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (cfg) setConfig(cfg);

      const { data: outs } = await supabase
        .from("contatos")
        .select("id, nome, telefone, email, opt_out_at")
        .eq("opt_out_whatsapp", true)
        .order("opt_out_at", { ascending: false });
      setOptedOut(outs || []);
      setLoading(false);
    })();
  }, [tenantId]);

  async function salvar() {
    if (!tenantId) return;
    setSaving(true);
    try {
      const payload = { ...config, tenant_id: tenantId };
      const { error } = config.id
        ? await (supabase as any).from("lgpd_config").update(payload).eq("id", config.id)
        : await (supabase as any).from("lgpd_config").insert(payload).select("id").single().then((r: any) => {
            if (r.data) setConfig((c) => ({ ...c, id: r.data.id }));
            return r;
          });
      if (error) throw error;
      toast({ title: "Configurações salvas" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function reativar(contatoId: string) {
    await supabase
      .from("contatos")
      .update({ opt_out_whatsapp: false, opt_out_at: null })
      .eq("id", contatoId);
    setOptedOut((arr) => arr.filter((c) => c.id !== contatoId));
    toast({ title: "Opt-in restaurado" });
  }

  function exportarCSV() {
    const header = "nome,telefone,email,descadastrado_em\n";
    const rows = optedOut
      .map(
        (c) =>
          `"${(c.nome || "").replace(/"/g, '""')}","${c.telefone || ""}","${c.email || ""}","${c.opt_out_at || ""}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `descadastrados-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Apenas administradores podem acessar as configurações de LGPD.
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> LGPD & Opt-out
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure descadastro automático e gerencie a base de contatos opted-out.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configurações de privacidade</CardTitle>
          <CardDescription>
            Estes ajustes controlam o link público de descadastro inserido em campanhas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>URL da Política de Privacidade</Label>
            <Input
              value={config.politica_privacidade_url || ""}
              onChange={(e) => setConfig({ ...config, politica_privacidade_url: e.target.value })}
              placeholder="https://sua-loja.com.br/privacidade"
            />
          </div>

          <div>
            <Label>Texto padrão do descadastro (use {"{opt_out_url}"} onde quiser inserir o link)</Label>
            <Textarea
              rows={3}
              value={config.texto_descadastro || ""}
              onChange={(e) => setConfig({ ...config, texto_descadastro: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label className="cursor-pointer">Incluir link automaticamente em todas as campanhas</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativado, o texto acima é anexado a todas as mensagens de campanha.
              </p>
            </div>
            <Switch
              checked={config.incluir_link_automatico}
              onCheckedChange={(v) => setConfig({ ...config, incluir_link_automatico: v })}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={salvar} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Contatos descadastrados ({optedOut.length})</CardTitle>
            <CardDescription>
              Estes contatos não recebem campanhas de WhatsApp.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportarCSV} disabled={optedOut.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : optedOut.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum contato descadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Descadastrou em</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {optedOut.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.telefone || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.opt_out_at ? new Date(c.opt_out_at).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => reativar(c.id)}>
                        Reativar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
