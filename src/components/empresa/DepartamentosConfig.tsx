import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface Departamento {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  membros_count?: number;
}

export default function DepartamentosConfig() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Departamento | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Departamento | null>(null);

  const tenantId = profile?.tenant_id;

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("departamentos")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("nome");

    if (data) {
      // Count members per department
      const { data: profiles } = await supabase
        .from("profiles")
        .select("departamento_id")
        .eq("tenant_id", tenantId)
        .not("departamento_id", "is", null);

      const counts: Record<string, number> = {};
      profiles?.forEach((p: any) => {
        if (p.departamento_id) counts[p.departamento_id] = (counts[p.departamento_id] || 0) + 1;
      });

      setDepartamentos(data.map((d: any) => ({ ...d, membros_count: counts[d.id] || 0 })));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const openNew = () => {
    setEditing(null);
    setNome("");
    setDescricao("");
    setDialogOpen(true);
  };

  const openEdit = (d: Departamento) => {
    setEditing(d);
    setNome(d.nome);
    setDescricao(d.descricao || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!nome.trim() || !tenantId) return;
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from("departamentos")
        .update({ nome: nome.trim(), descricao: descricao.trim() || null })
        .eq("id", editing.id);
      if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      else toast({ title: "Departamento atualizado!" });
    } else {
      const { error } = await supabase
        .from("departamentos")
        .insert({ tenant_id: tenantId, nome: nome.trim(), descricao: descricao.trim() || null });
      if (error) toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
      else toast({ title: "Departamento criado!" });
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("departamentos").delete().eq("id", deleteTarget.id);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else toast({ title: "Departamento excluído!" });
    setDeleteTarget(null);
    load();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Departamentos</CardTitle>
            <CardDescription>Organize sua equipe em departamentos</CardDescription>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : departamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum departamento criado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Membros</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departamentos.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{d.descricao || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{d.membros_count}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(d)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Departamento" : "Novo Departamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Vendas" />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição do departamento" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !nome.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir departamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o departamento <strong>{deleteTarget?.nome}</strong>? Membros vinculados ficarão sem departamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
