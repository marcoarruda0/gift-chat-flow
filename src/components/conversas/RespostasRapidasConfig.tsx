import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RespostaRapida {
  id: string;
  atalho: string;
  conteudo: string;
  created_at: string;
}

export default function RespostasRapidasConfig() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const [respostas, setRespostas] = useState<RespostaRapida[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RespostaRapida | null>(null);
  const [atalho, setAtalho] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRespostas = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("respostas_rapidas")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    setRespostas((data as RespostaRapida[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRespostas(); }, [tenantId]);

  const openNew = () => {
    setEditing(null);
    setAtalho("");
    setConteudo("");
    setDialogOpen(true);
  };

  const openEdit = (r: RespostaRapida) => {
    setEditing(r);
    setAtalho(r.atalho);
    setConteudo(r.conteudo);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!tenantId || !atalho.trim() || !conteudo.trim()) return;
    setSaving(true);
    const slug = atalho.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");

    if (editing) {
      const { error } = await supabase
        .from("respostas_rapidas")
        .update({ atalho: slug, conteudo: conteudo.trim() } as any)
        .eq("id", editing.id);
      if (error) toast.error(error.message);
      else toast.success("Resposta atualizada!");
    } else {
      const { error } = await supabase
        .from("respostas_rapidas")
        .insert({ tenant_id: tenantId, atalho: slug, conteudo: conteudo.trim() } as any);
      if (error) toast.error(error.message);
      else toast.success("Resposta criada!");
    }

    setSaving(false);
    setDialogOpen(false);
    fetchRespostas();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("respostas_rapidas").delete().eq("id", id);
    toast.success("Resposta removida");
    fetchRespostas();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Respostas Rápidas</CardTitle>
          <CardDescription>
            Atalhos de texto para uso no chat. Digite <code className="text-primary">/atalho</code> no chat para inserir.
            Variáveis: <code>{"{nome}"}</code>, <code>{"{telefone}"}</code>
          </CardDescription>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : respostas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nenhuma resposta rápida cadastrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Atalho</TableHead>
                <TableHead>Conteúdo</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {respostas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">/{r.atalho}</TableCell>
                  <TableCell className="text-sm truncate max-w-xs">{r.conteudo}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Resposta" : "Nova Resposta Rápida"}</DialogTitle>
            <DialogDescription>
              Defina um atalho e o conteúdo que será inserido no chat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Atalho (sem /)</Label>
              <Input
                value={atalho}
                onChange={(e) => setAtalho(e.target.value)}
                placeholder="ex: saudacao, preco, horario"
              />
            </div>
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                placeholder="Olá {nome}! Como posso ajudar?"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !atalho.trim() || !conteudo.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
