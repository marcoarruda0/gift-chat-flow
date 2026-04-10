import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquarePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface NovaConversaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectContato: (contatoId: string) => void;
}

interface Contato {
  id: string;
  nome: string;
  telefone: string | null;
}

export function NovaConversaDialog({ open, onOpenChange, onSelectContato }: NovaConversaDialogProps) {
  const { profile } = useAuth();
  const [busca, setBusca] = useState("");
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !profile?.tenant_id) return;
    setLoading(true);
    const fetchContatos = async () => {
      let query = supabase
        .from("contatos")
        .select("id, nome, telefone")
        .eq("tenant_id", profile.tenant_id!)
        .order("nome", { ascending: true })
        .limit(50);

      if (busca) {
        query = query.or(`nome.ilike.%${busca}%,telefone.ilike.%${busca}%`);
      }

      const { data } = await query;
      setContatos(data || []);
      setLoading(false);
    };
    const timeout = setTimeout(fetchContatos, 300);
    return () => clearTimeout(timeout);
  }, [open, busca, profile?.tenant_id]);

  const handleSelect = (contatoId: string) => {
    onSelectContato(contatoId);
    onOpenChange(false);
    setBusca("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contato..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 h-9"
            autoFocus
          />
        </div>
        <ScrollArea className="max-h-[300px]">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : contatos.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Nenhum contato encontrado</div>
          ) : (
            contatos.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent transition-colors text-left"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                  {c.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.nome}</p>
                  {c.telefone && <p className="text-xs text-muted-foreground">{c.telefone}</p>}
                </div>
                <MessageSquarePlus className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
