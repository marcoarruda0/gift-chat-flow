import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Users, FolderTree } from "lucide-react";

interface Membro {
  id: string;
  nome: string | null;
  avatar_url: string | null;
  departamento: string | null;
}

interface Departamento {
  id: string;
  nome: string;
}

interface TransferirDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (paraUserId: string, paraUserNome: string, motivo: string) => void;
  onConfirmDepartamento?: (departamentoId: string, departamentoNome: string, motivo: string) => void;
}

export function TransferirDialog({ open, onOpenChange, onConfirm, onConfirmDepartamento }: TransferirDialogProps) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<string>("atendente");
  const [membros, setMembros] = useState<Membro[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMembro, setSelectedMembro] = useState<Membro | null>(null);
  const [selectedDepto, setSelectedDepto] = useState<Departamento | null>(null);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!open || !profile?.tenant_id) return;
    setLoading(true);
    setSelectedMembro(null);
    setSelectedDepto(null);
    setMotivo("");
    setTab("atendente");

    Promise.all([
      supabase
        .from("profiles")
        .select("id, nome, avatar_url, departamento")
        .eq("tenant_id", profile.tenant_id)
        .neq("id", user?.id || ""),
      supabase
        .from("departamentos")
        .select("id, nome")
        .eq("tenant_id", profile.tenant_id)
        .eq("ativo", true)
        .order("nome"),
    ]).then(([membrosRes, deptosRes]) => {
      setMembros(membrosRes.data || []);
      setDepartamentos(deptosRes.data || []);
      setLoading(false);
    });
  }, [open, profile?.tenant_id, user?.id]);

  const handleConfirm = () => {
    if (tab === "atendente" && selectedMembro) {
      onConfirm(selectedMembro.id, selectedMembro.nome || "Sem nome", motivo);
      onOpenChange(false);
    } else if (tab === "departamento" && selectedDepto && onConfirmDepartamento) {
      onConfirmDepartamento(selectedDepto.id, selectedDepto.nome, motivo);
      onOpenChange(false);
    }
  };

  const canConfirm = tab === "atendente" ? !!selectedMembro : (!!selectedDepto && !!onConfirmDepartamento);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir conversa</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="atendente" className="flex-1 gap-1.5">
              <Users className="h-3.5 w-3.5" /> Atendente
            </TabsTrigger>
            <TabsTrigger value="departamento" className="flex-1 gap-1.5">
              <FolderTree className="h-3.5 w-3.5" /> Departamento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="atendente" className="mt-3">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : membros.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum outro membro encontrado</p>
            ) : (
              <ScrollArea className="max-h-48">
                <div className="space-y-1">
                  {membros.map((m) => {
                    const initials = (m.nome || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                    const isSelected = selectedMembro?.id === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSelectedMembro(m)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                          isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-accent"
                        }`}
                      >
                        <Avatar className="h-8 w-8">
                          {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{m.nome || "Sem nome"}</p>
                          {m.departamento && <p className="text-xs text-muted-foreground">{m.departamento}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="departamento" className="mt-3">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : departamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum departamento cadastrado</p>
            ) : (
              <ScrollArea className="max-h-48">
                <div className="space-y-1">
                  {departamentos.map((d) => {
                    const isSelected = selectedDepto?.id === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDepto(d)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                          isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-accent"
                        }`}
                      >
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <FolderTree className="h-4 w-4 text-primary" />
                        </div>
                        <p className="text-sm font-medium text-foreground">{d.nome}</p>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        <div>
          <label className="text-sm text-muted-foreground">Motivo (opcional)</label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Cliente precisa de suporte técnico"
            className="mt-1"
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>Transferir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
