import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ContatoTimeline } from "./ContatoTimeline";
import RfvBadge from "@/components/giftback/RfvBadge";
import {
  MessageSquare,
  Phone,
  Mail,
  Gift,
  ShoppingBag,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface ContatoDrawerProps {
  contatoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContatoDrawer({ contatoId, open, onOpenChange }: ContatoDrawerProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);

  const { data: contato, isLoading, refetch } = useQuery({
    queryKey: ["contato-drawer", contatoId],
    queryFn: async () => {
      if (!contatoId) return null;
      const { data } = await supabase.from("contatos").select("*").eq("id", contatoId).single();
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

  const initials = (contato?.nome || "?")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        {isLoading || !contato ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="p-6 pb-4 border-b">
              <div className="flex items-start gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={contato.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-lg truncate">{contato.nome}</SheetTitle>
                  <SheetDescription className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
                    {contato.telefone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {contato.telefone}
                      </span>
                    )}
                    {contato.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {contato.email}
                      </span>
                    )}
                  </SheetDescription>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {contato.rfv_recencia != null && (
                      <RfvBadge r={contato.rfv_recencia} f={contato.rfv_frequencia} v={contato.rfv_valor} compacto />
                    )}
                    {Number(contato.saldo_giftback) > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        <Gift className="h-3 w-3 mr-1" />
                        R$ {Number(contato.saldo_giftback).toFixed(2).replace(".", ",")}
                      </Badge>
                    )}
                    {contato.opt_out_whatsapp && (
                      <Badge variant="destructive" className="text-xs">
                        <Ban className="h-3 w-3 mr-1" /> Descadastrado
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/conversas?contato=${contato.id}`);
                  }}
                >
                  <MessageSquare className="h-4 w-4 mr-1" /> Conversar
                </Button>
                <Button
                  size="sm"
                  variant={contato.opt_out_whatsapp ? "default" : "ghost"}
                  onClick={toggleOptOut}
                  title={contato.opt_out_whatsapp ? "Reativar opt-in" : "Marcar como descadastrado"}
                >
                  {contato.opt_out_whatsapp ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Ban className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </SheetHeader>

            <Tabs defaultValue="timeline" className="p-6 pt-4">
              <TabsList className="grid grid-cols-3 mb-4">
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="campos">Campos</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline">
                <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
                  {[
                    { key: null, label: "Todos" },
                    { key: "compra", label: "Compras", icon: ShoppingBag },
                    { key: "giftback", label: "Giftback", icon: Gift },
                    { key: "mensagem", label: "Conversas", icon: MessageSquare },
                  ].map((f) => (
                    <Button
                      key={f.label}
                      size="sm"
                      variant={filtroTipo === f.key ? "default" : "outline"}
                      className="text-xs h-7"
                      onClick={() => setFiltroTipo(f.key)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
                <ContatoTimeline contatoId={contato.id} filtroTipo={filtroTipo} />
              </TabsContent>

              <TabsContent value="info" className="space-y-3 text-sm">
                <InfoRow label="CPF" value={contato.cpf} />
                <InfoRow label="Endereço" value={contato.endereco} />
                <InfoRow label="Nascimento" value={contato.data_nascimento} />
                <InfoRow label="Gênero" value={contato.genero} />
                <InfoRow label="Notas" value={contato.notas} multiline />
                <InfoRow
                  label="Tags"
                  value={(contato.tags || []).join(", ") || null}
                />
                <InfoRow
                  label="Cadastrado em"
                  value={new Date(contato.created_at).toLocaleString("pt-BR")}
                />
                {contato.opt_out_whatsapp && contato.opt_out_at && (
                  <InfoRow
                    label="Descadastrou em"
                    value={new Date(contato.opt_out_at).toLocaleString("pt-BR")}
                  />
                )}
              </TabsContent>

              <TabsContent value="campos">
                {Object.keys(contato.campos_personalizados || {}).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum campo personalizado.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(contato.campos_personalizados).map(([k, v]) => (
                      <InfoRow key={k} label={k} value={String(v)} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ label, value, multiline }: { label: string; value: any; multiline?: boolean }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`col-span-2 text-sm ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {String(value)}
      </span>
    </div>
  );
}
