import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { ContatoPerfilLateral } from "./ContatoPerfilLateral";
import { ContatoAtividades } from "./ContatoAtividades";

interface ContatoDrawerProps {
  contatoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContatoDrawer({ contatoId, open, onOpenChange }: ContatoDrawerProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: contato, isLoading, refetch } = useQuery({
    queryKey: ["contato-drawer", contatoId],
    queryFn: async () => {
      if (!contatoId) return null;
      const { data } = await supabase
        .from("contatos")
        .select("*")
        .eq("id", contatoId)
        .single();
      return data;
    },
    enabled: !!contatoId && open,
  });

  async function toggleOptOut() {
    if (!contato) return;
    const novo = !contato.opt_out_whatsapp;
    await supabase
      .from("contatos")
      .update({
        opt_out_whatsapp: novo,
        opt_out_at: novo ? new Date().toISOString() : null,
      })
      .eq("id", contato.id);
    toast({ title: novo ? "Contato descadastrado" : "Opt-in restaurado" });
    refetch();
  }

  function conversar() {
    if (!contato) return;
    onOpenChange(false);
    navigate(`/conversas?contato=${contato.id}`);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-5xl p-0 overflow-hidden flex flex-col"
        side="right"
      >
        <SheetHeader className="px-6 py-3 border-b border-border bg-card shrink-0">
          <SheetTitle className="sr-only">Perfil do Cliente</SheetTitle>
          <SheetDescription className="sr-only">
            Detalhes, atividades e histórico do contato.
          </SheetDescription>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="self-start gap-1 text-primary hover:text-primary -ml-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Perfil do Cliente
          </Button>
        </SheetHeader>

        {isLoading || !contato ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 p-4 overflow-hidden">
            <div className="overflow-y-auto pr-1">
              <ContatoPerfilLateral
                contato={contato}
                onConversar={conversar}
                onToggleOptOut={toggleOptOut}
              />
            </div>
            <div className="overflow-hidden bg-muted/30 rounded-lg p-4">
              <ContatoAtividades contatoId={contato.id} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
