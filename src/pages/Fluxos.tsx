import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Copy, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Fluxo {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  updated_at: string;
}

export default function Fluxos() {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchFluxos = async () => {
    const { data, error } = await supabase
      .from("fluxos")
      .select("id, nome, descricao, status, updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setFluxos(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchFluxos(); }, []);

  const criarFluxo = async () => {
    if (!profile?.tenant_id) return;
    const { data, error } = await supabase
      .from("fluxos")
      .insert({ tenant_id: profile.tenant_id, nome: "Novo Fluxo" })
      .select("id")
      .single();
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else if (data) {
      navigate(`/fluxos/${data.id}`);
    }
  };

  const duplicarFluxo = async (fluxo: Fluxo) => {
    if (!profile?.tenant_id) return;
    const original = await supabase.from("fluxos").select("nodes_json, edges_json").eq("id", fluxo.id).single();
    if (original.error) return;
    const { data, error } = await supabase
      .from("fluxos")
      .insert({
        tenant_id: profile.tenant_id,
        nome: `${fluxo.nome} (cópia)`,
        nodes_json: original.data.nodes_json,
        edges_json: original.data.edges_json,
      })
      .select("id")
      .single();
    if (!error && data) {
      toast({ title: "Fluxo duplicado!" });
      fetchFluxos();
    }
  };

  const excluirFluxo = async (id: string) => {
    const { error } = await supabase.from("fluxos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Fluxo excluído" });
      setFluxos((prev) => prev.filter((f) => f.id !== id));
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      rascunho: { label: "Rascunho", variant: "secondary" },
      ativo: { label: "Ativo", variant: "default" },
      inativo: { label: "Inativo", variant: "outline" },
    };
    const s = map[status] || map.rascunho;
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Builder de Fluxos</h1>
          <p className="text-muted-foreground">Crie automações visuais para WhatsApp</p>
        </div>
        <Button onClick={criarFluxo}>
          <Plus className="h-4 w-4 mr-2" /> Novo Fluxo
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><p className="text-muted-foreground">Carregando...</p></div>
      ) : fluxos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground mb-4">Nenhum fluxo criado ainda</p>
          <Button onClick={criarFluxo}><Plus className="h-4 w-4 mr-2" /> Criar Primeiro Fluxo</Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Atualizado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fluxos.map((f) => (
                <TableRow key={f.id} className="cursor-pointer" onClick={() => navigate(`/fluxos/${f.id}`)}>
                  <TableCell className="font-medium">{f.nome}</TableCell>
                  <TableCell>{statusBadge(f.status)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(f.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/fluxos/${f.id}`)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicarFluxo(f)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. O fluxo "{f.nome}" será removido permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => excluirFluxo(f.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
