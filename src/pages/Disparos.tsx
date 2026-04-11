import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Send, Clock, Eye, Ban, Megaphone } from "lucide-react";
import { format } from "date-fns";

type Campanha = {
  id: string;
  nome: string;
  mensagem: string;
  tipo_filtro: string;
  filtro_valor: string[];
  status: string;
  agendada_para: string | null;
  total_destinatarios: number;
  total_enviados: number;
  total_falhas: number;
  created_at: string;
};

type Contato = {
  id: string;
  nome: string;
  telefone: string | null;
  tags: string[] | null;
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  agendada: { label: "Agendada", variant: "outline" },
  enviando: { label: "Enviando...", variant: "default" },
  concluida: { label: "Concluída", variant: "secondary" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

export default function Disparos() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<string | null>(null);
  const [destinatariosDetail, setDestinatariosDetail] = useState<any[]>([]);

  // Form state
  const [nome, setNome] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [tagsSelecionadas, setTagsSelecionadas] = useState<string[]>([]);
  const [agendarPara, setAgendarPara] = useState("");
  const [agendar, setAgendar] = useState(false);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const tenantId = profile?.tenant_id;

  const allTags = useMemo(() => {
    const set = new Set<string>();
    contatos.forEach((c) => c.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [contatos]);

  const contatosFiltrados = useMemo(() => {
    if (tipoFiltro === "todos") return contatos.filter((c) => c.telefone);
    if (tipoFiltro === "tag") return contatos.filter((c) => c.telefone && c.tags?.some((t) => tagsSelecionadas.includes(t)));
    if (tipoFiltro === "manual") return contatos.filter((c) => c.telefone && contatosSelecionados.includes(c.id));
    return [];
  }, [contatos, tipoFiltro, tagsSelecionadas, contatosSelecionados]);

  useEffect(() => {
    if (tenantId) {
      fetchCampanhas();
      fetchContatos();
    }
  }, [tenantId]);

  async function fetchCampanhas() {
    setLoading(true);
    const { data } = await supabase
      .from("campanhas")
      .select("*")
      .order("created_at", { ascending: false });
    setCampanhas((data as any[]) || []);
    setLoading(false);
  }

  async function fetchContatos() {
    const { data } = await supabase.from("contatos").select("id, nome, telefone, tags");
    setContatos((data as Contato[]) || []);
  }

  async function criarCampanha() {
    if (!tenantId || !nome.trim() || !mensagem.trim()) {
      toast({ title: "Preencha nome e mensagem", variant: "destructive" });
      return;
    }

    const alvos = contatosFiltrados;
    if (alvos.length === 0) {
      toast({ title: "Nenhum contato com telefone encontrado para o filtro selecionado", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const status = agendar && agendarPara ? "agendada" : "rascunho";

      const { data: campanha, error } = await supabase
        .from("campanhas")
        .insert({
          tenant_id: tenantId,
          nome: nome.trim(),
          mensagem: mensagem.trim(),
          tipo_filtro: tipoFiltro as any,
          filtro_valor: tipoFiltro === "tag" ? tagsSelecionadas : [],
          status: status as any,
          agendada_para: agendar && agendarPara ? new Date(agendarPara).toISOString() : null,
          total_destinatarios: alvos.length,
          criado_por: profile?.id || "",
        })
        .select()
        .single();

      if (error) throw error;

      // Insert recipients
      const destinatarios = alvos.map((c) => ({
        campanha_id: (campanha as any).id,
        contato_id: c.id,
        telefone: c.telefone!,
        tenant_id: tenantId,
      }));

      const { error: destError } = await supabase.from("campanha_destinatarios").insert(destinatarios as any);
      if (destError) throw destError;

      toast({ title: `Campanha criada com ${alvos.length} destinatários` });
      resetForm();
      setDialogOpen(false);
      fetchCampanhas();
    } catch (err: any) {
      toast({ title: "Erro ao criar campanha", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function enviarCampanha(campanhaId: string) {
    try {
      const { data, error } = await supabase.functions.invoke("enviar-campanha", {
        body: { campanha_id: campanhaId },
      });
      if (error) throw error;
      toast({ title: "Envio iniciado!" });
      // Refresh after a short delay
      setTimeout(fetchCampanhas, 2000);
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    }
  }

  async function cancelarCampanha(campanhaId: string) {
    await supabase.from("campanhas").update({ status: "cancelada" as any }).eq("id", campanhaId);
    toast({ title: "Campanha cancelada" });
    fetchCampanhas();
  }

  async function openDetail(campanhaId: string) {
    setDetailDialog(campanhaId);
    const { data } = await supabase
      .from("campanha_destinatarios")
      .select("*, contatos:contato_id(nome)")
      .eq("campanha_id", campanhaId);
    setDestinatariosDetail((data as any[]) || []);
  }

  function resetForm() {
    setNome("");
    setMensagem("");
    setTipoFiltro("todos");
    setTagsSelecionadas([]);
    setContatosSelecionados([]);
    setAgendar(false);
    setAgendarPara("");
  }

  function toggleTag(tag: string) {
    setTagsSelecionadas((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function toggleContato(id: string) {
    setContatosSelecionados((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  const destStatusBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    pendente: { label: "Pendente", variant: "secondary" },
    enviado: { label: "Enviado", variant: "default" },
    falha: { label: "Falha", variant: "destructive" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" /> Disparos
          </h1>
          <p className="text-muted-foreground text-sm">Campanhas de mensagens em massa via WhatsApp</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Campanha
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : campanhas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma campanha criada ainda</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Dest.</TableHead>
                  <TableHead className="text-center">Enviados</TableHead>
                  <TableHead className="text-center">Falhas</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campanhas.map((c) => {
                  const sc = statusConfig[c.status] || { label: c.status, variant: "outline" as const };
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell>
                        <Badge variant={sc.variant}>{sc.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{c.total_destinatarios}</TableCell>
                      <TableCell className="text-center">{c.total_enviados}</TableCell>
                      <TableCell className="text-center">{c.total_falhas}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(c.created_at), "dd/MM/yy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(c.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(c.status === "rascunho" || c.status === "agendada") && (
                            <Button size="sm" variant="ghost" onClick={() => enviarCampanha(c.id)}>
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {c.status === "enviando" && (
                            <Button size="sm" variant="ghost" onClick={() => cancelarCampanha(c.id)}>
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* New Campaign Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
            <DialogDescription>Configure e envie uma campanha de mensagens em massa.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome da campanha</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Promoção de Inverno" />
            </div>

            <div>
              <Label>Mensagem</Label>
              <Textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Olá {nome}, temos uma oferta especial..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Variáveis: <code className="bg-muted px-1 rounded">{"{nome}"}</code> <code className="bg-muted px-1 rounded">{"{telefone}"}</code>
              </p>
            </div>

            <div>
              <Label>Filtro de contatos</Label>
              <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos com telefone</SelectItem>
                  <SelectItem value="tag">Por tag</SelectItem>
                  <SelectItem value="manual">Seleção manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipoFiltro === "tag" && (
              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {allTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma tag encontrada nos contatos</p>
                  ) : (
                    allTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant={tagsSelecionadas.includes(tag) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            )}

            {tipoFiltro === "manual" && (
              <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1">
                {contatos.filter((c) => c.telefone).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={contatosSelecionados.includes(c.id)}
                      onChange={() => toggleContato(c.id)}
                    />
                    {c.nome} — {c.telefone}
                  </label>
                ))}
              </div>
            )}

            <div className="bg-muted/50 rounded p-3 text-sm">
              <strong>{contatosFiltrados.length}</strong> contato(s) serão atingidos
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="agendar"
                checked={agendar}
                onChange={(e) => setAgendar(e.target.checked)}
              />
              <Label htmlFor="agendar" className="cursor-pointer">Agendar envio</Label>
            </div>

            {agendar && (
              <div>
                <Label>Data e hora</Label>
                <Input type="datetime-local" value={agendarPara} onChange={(e) => setAgendarPara(e.target.value)} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={criarCampanha} disabled={submitting}>
              {agendar ? <><Clock className="h-4 w-4 mr-1" /> Agendar</> : <><Send className="h-4 w-4 mr-1" /> Criar Campanha</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailDialog} onOpenChange={() => setDetailDialog(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Destinatários da Campanha</DialogTitle>
            <DialogDescription>Status individual de cada destinatário.</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {destinatariosDetail.map((d) => {
                const ds = destStatusBadge[d.status] || { label: d.status, variant: "secondary" as const };
                return (
                  <TableRow key={d.id}>
                    <TableCell>{(d.contatos as any)?.nome || "—"}</TableCell>
                    <TableCell className="text-sm">{d.telefone}</TableCell>
                    <TableCell>
                      <Badge variant={ds.variant}>{ds.label}</Badge>
                      {d.erro && <p className="text-xs text-destructive mt-1">{d.erro}</p>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {destinatariosDetail.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">Nenhum destinatário</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
