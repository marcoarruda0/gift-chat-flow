import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown } from "lucide-react";

interface CampoConfig {
  id: string;
  tenant_id: string;
  nome: string;
  tipo: string;
  opcoes: string[];
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
  created_at: string;
}

interface CampoForm {
  nome: string;
  tipo: string;
  opcoes: string;
  obrigatorio: boolean;
}

const tipoLabels: Record<string, string> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  selecao: "Seleção",
  booleano: "Sim/Não",
};

const emptyForm: CampoForm = { nome: "", tipo: "texto", opcoes: "", obrigatorio: false };

export default function CamposPersonalizadosConfig() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampoForm>(emptyForm);

  const { data: campos, isLoading } = useQuery({
    queryKey: ["campos-config", profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contato_campos_config")
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return data as CampoConfig[];
    },
    enabled: !!profile?.tenant_id,
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: CampoForm) => {
      const payload = {
        tenant_id: profile!.tenant_id!,
        nome: formData.nome,
        tipo: formData.tipo,
        opcoes: formData.tipo === "selecao" ? formData.opcoes.split(",").map((o) => o.trim()).filter(Boolean) : [],
        obrigatorio: formData.obrigatorio,
        ordem: editingId ? undefined : (campos?.length || 0),
      };
      if (editingId) {
        const { ordem: _, ...updatePayload } = payload;
        const { error } = await supabase.from("contato_campos_config").update(updatePayload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contato_campos_config").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campos-config"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      toast({ title: editingId ? "Campo atualizado!" : "Campo criado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contato_campos_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campos-config"] });
      toast({ title: "Campo excluído!" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("contato_campos_config").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campos-config"] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ id, newOrdem }: { id: string; newOrdem: number }) => {
      const { error } = await supabase.from("contato_campos_config").update({ ordem: newOrdem }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campos-config"] });
    },
  });

  const openEdit = (campo: CampoConfig) => {
    setEditingId(campo.id);
    setForm({
      nome: campo.nome,
      tipo: campo.tipo,
      opcoes: (campo.opcoes || []).join(", "),
      obrigatorio: campo.obrigatorio,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    if (!campos) return;
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= campos.length) return;
    const a = campos[index];
    const b = campos[swapIdx];
    reorderMutation.mutate({ id: a.id, newOrdem: b.ordem });
    reorderMutation.mutate({ id: b.id, newOrdem: a.ordem });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Campos Personalizados</CardTitle>
          <CardDescription>Defina campos extras para seus contatos</CardDescription>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo Campo
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !campos?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum campo personalizado. Clique em "Novo Campo" para criar.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden sm:table-cell">Obrigatório</TableHead>
                <TableHead className="hidden sm:table-cell">Ativo</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campos.map((campo, idx) => (
                <TableRow key={campo.id} className={!campo.ativo ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{campo.nome}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{tipoLabels[campo.tipo] || campo.tipo}</Badge>
                    {campo.tipo === "selecao" && campo.opcoes?.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({campo.opcoes.length} opções)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {campo.obrigatorio ? "Sim" : "Não"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Switch
                      checked={campo.ativo}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: campo.id, ativo: checked })}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveItem(idx, "up")} disabled={idx === 0}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveItem(idx, "down")} disabled={idx === campos.length - 1}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(campo)}>
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
                            <AlertDialogTitle>Excluir campo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              O campo "{campo.nome}" será removido. Os dados existentes nos contatos não serão apagados automaticamente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(campo.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
            <DialogTitle>{editingId ? "Editar Campo" : "Novo Campo"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Nome do campo *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder="Ex: Profissão" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(tipoLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.tipo === "selecao" && (
              <div className="space-y-2">
                <Label>Opções (separadas por vírgula)</Label>
                <Input
                  value={form.opcoes}
                  onChange={(e) => setForm({ ...form, opcoes: e.target.value })}
                  placeholder="P, M, G, GG"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                checked={form.obrigatorio}
                onCheckedChange={(checked) => setForm({ ...form, obrigatorio: checked })}
              />
              <Label>Campo obrigatório</Label>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
