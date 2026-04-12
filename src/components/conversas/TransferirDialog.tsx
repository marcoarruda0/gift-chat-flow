import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface Membro {
  id: string;
  nome: string | null;
  avatar_url: string | null;
  departamento: string | null;
}

interface TransferirDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (paraUserId: string, paraUserNome: string, motivo: string) => void;
}

export function TransferirDialog({ open, onOpenChange, onConfirm }: TransferirDialogProps) {
  const { user, profile } = useAuth();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMembro, setSelectedMembro] = useState<Membro | null>(null);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!open || !profile?.tenant_id) return;
    setLoading(true);
    setSelectedMembro(null);
    setMotivo("");

    supabase
      .from("profiles")
      .select("id, nome, avatar_url, departamento")
      .eq("tenant_id", profile.tenant_id)
      .neq("id", user?.id || "")
      .then(({ data }) => {
        setMembros(data || []);
        setLoading(false);
      });
  }, [open, profile?.tenant_id, user?.id]);

  const handleConfirm = () => {
    if (!selectedMembro) return;
    onConfirm(selectedMembro.id, selectedMembro.nome || "Sem nome", motivo);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir conversa</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Selecione o atendente:</p>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : membros.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum outro membro encontrado
            </p>
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
                        isSelected
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-accent"
                      }`}
                    >
                      <Avatar className="h-8 w-8">
                        {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.nome || "Sem nome"}</p>
                        {m.departamento && (
                          <p className="text-xs text-muted-foreground">{m.departamento}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}

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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!selectedMembro}>Transferir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
