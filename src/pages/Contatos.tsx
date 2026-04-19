import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Upload, Download, Pencil, Trash2, MessageSquarePlus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import CamposDinamicos, { campoKey } from "@/components/contatos/CamposDinamicos";
import RfvBadge from "@/components/giftback/RfvBadge";

interface ContatoForm {
  nome: string;
  telefone: string;
  cpf: string;
  email: string;
  data_nascimento: string;
  endereco: string;
  notas: string;
  tags: string;
}

const emptyForm: ContatoForm = {
  nome: "",
  telefone: "",
  cpf: "",
  email: "",
  data_nascimento: "",
  endereco: "",
  notas: "",
  tags: "",
};

export default function Contatos() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContatoForm>(emptyForm);
  const [camposPersonalizados, setCamposPersonalizados] = useState<Record<string, any>>({});

  const { data: camposConfig } = useQuery({
    queryKey: ["campos-config", profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contato_campos_config")
        .select("*")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  const { data: contatos, isLoading } = useQuery({
    queryKey: ["contatos", search],
    queryFn: async () => {
      let query = supabase.from("contatos").select("*").order("created_at", { ascending: false });
      if (search) {
        query = query.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%,cpf.ilike.%${search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: ContatoForm) => {
      const payload = {
        tenant_id: profile!.tenant_id!,
        nome: formData.nome,
        telefone: formData.telefone || null,
        cpf: formData.cpf || null,
        email: formData.email || null,
        data_nascimento: formData.data_nascimento || null,
        endereco: formData.endereco || null,
        notas: formData.notas || null,
        tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()) : [],
        campos_personalizados: camposPersonalizados,
      };
      if (editingId) {
        const { error } = await supabase.from("contatos").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contatos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contatos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-contatos"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setCamposPersonalizados({});
      setEditingId(null);
      toast({ title: editingId ? "Contato atualizado!" : "Contato criado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contatos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contatos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-contatos"] });
      toast({ title: "Contato excluído!" });
    },
  });

  const openEdit = (contato: any) => {
    setEditingId(contato.id);
    setForm({
      nome: contato.nome || "",
      telefone: contato.telefone || "",
      cpf: contato.cpf || "",
      email: contato.email || "",
      data_nascimento: contato.data_nascimento || "",
      endereco: contato.endereco || "",
      notas: contato.notas || "",
      tags: (contato.tags || []).join(", "),
    });
    setCamposPersonalizados(contato.campos_personalizados || {});
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCamposPersonalizados({});
    setDialogOpen(true);
  };

  const startConversa = async (contatoId: string) => {
    if (!profile?.tenant_id) return;
    // Check for ANY existing conversation (regardless of status)
    const { data: existing } = await supabase
      .from("conversas")
      .select("id, status")
      .eq("tenant_id", profile.tenant_id)
      .eq("contato_id", contatoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Reopen if closed
      if (existing.status !== "aberta") {
        await supabase
          .from("conversas")
          .update({ status: "aberta" })
          .eq("id", existing.id);
      }
      navigate(`/conversas?id=${existing.id}`);
      return;
    }

    const { data: nova, error } = await supabase
      .from("conversas")
      .insert({ tenant_id: profile.tenant_id, contato_id: contatoId, status: "aberta" })
      .select("id")
      .single();

    if (error) {
      toast({ title: "Erro ao criar conversa", variant: "destructive" });
      return;
    }
    navigate(`/conversas?id=${nova.id}`);
  };

  const exportCSV = () => {
    if (!contatos?.length) return;
    const headers = ["Nome", "Telefone", "CPF", "Email", "Tags", "Saldo Giftback"];
    const rows = contatos.map((c) => [
      c.nome, c.telefone || "", c.cpf || "", c.email || "",
      (c.tags || []).join(";"), c.saldo_giftback?.toString() || "0",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contatos.csv";
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Contatos</h1>
          <p className="text-muted-foreground">Gerencie sua base de contatos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Exportar
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" /> Novo Contato
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Contato" : "Novo Contato"}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveMutation.mutate(form);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF</Label>
                    <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Nascimento</Label>
                    <Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags (separadas por vírgula)</Label>
                    <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, cliente novo" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Notas</Label>
                  <Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
                </div>
                {camposConfig && camposConfig.length > 0 && (
                  <CamposDinamicos
                    campos={camposConfig as any}
                    valores={camposPersonalizados}
                    onChange={setCamposPersonalizados}
                  />
                )}
                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden sm:table-cell">Telefone</TableHead>
              <TableHead className="hidden md:table-cell">CPF</TableHead>
              <TableHead className="hidden lg:table-cell">Tags</TableHead>
              <TableHead>RFV</TableHead>
              <TableHead>Saldo GB</TableHead>
              <TableHead className="w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !contatos?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum contato encontrado. Clique em "Novo Contato" para começar.
                </TableCell>
              </TableRow>
            ) : (
              contatos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="hidden sm:table-cell">{c.telefone || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.cpf || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {(c.tags || []).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[180px]"><RfvBadge r={(c as any).rfv_recencia} f={(c as any).rfv_frequencia} v={(c as any).rfv_valor} className="max-w-full truncate" /></TableCell>
                  <TableCell>R$ {Number(c.saldo_giftback || 0).toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startConversa(c.id)} title="Iniciar conversa">
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. O contato "{c.nome}" será permanentemente excluído.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
