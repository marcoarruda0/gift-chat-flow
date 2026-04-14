import { useState } from "react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function SincronizarWhatsappDialog({ open, onOpenChange, onComplete }: Props) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [result, setResult] = useState<{ conversas: number; mensagens: number } | null>(null);

  const callZapi = async (endpoint: string, method: string, data?: any) => {
    const { data: session } = await supabase.auth.getSession();
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return fetch(`https://${projectId}.supabase.co/functions/v1/zapi-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session?.access_token}`,
      },
      body: JSON.stringify({ endpoint, method, data }),
    });
  };

  const formatPhone = (p: string) => (p.includes("@g.us") ? p : p.replace(/\D/g, ""));

  const handleSync = async () => {
    if (!tenantId) return;
    setSyncing(true);
    setResult(null);
    setProgress(0);
    setStatusText("Buscando chats do WhatsApp...");

    try {
      const res = await callZapi("chats", "GET");
      const chats = await res.json();

      if (!Array.isArray(chats)) {
        toast.error("Erro ao buscar chats do WhatsApp");
        setSyncing(false);
        return;
      }

      const chatsToProcess = chats.filter((chat: any) => !!chat.phone);
      const totalChats = chatsToProcess.length;
      const startTs = Math.floor(startOfDay(startDate).getTime() / 1000);
      const endTs = Math.floor(endOfDay(endDate).getTime() / 1000);

      let imported = 0;
      let msgsImported = 0;

      for (let i = 0; i < totalChats; i++) {
        const chat = chatsToProcess[i];
        const rawPhone = chat.phone || "";
        const isGroupChat = chat.isGroup === true || rawPhone.includes("@g.us");
        const phone = isGroupChat ? rawPhone : rawPhone.replace(/\D/g, "");
        const chatName = isGroupChat ? (chat.name || "Grupo") : (chat.name || phone);

        setProgress(Math.round(((i + 1) / totalChats) * 100));
        setStatusText(`Importando chat ${i + 1}/${totalChats}: ${chatName.slice(0, 30)}...`);

        // Find or create contact
        let { data: contato } = await supabase
          .from("contatos")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("telefone", phone)
          .maybeSingle();

        if (!contato) {
          const { data: novo } = await supabase
            .from("contatos")
            .insert({
              tenant_id: tenantId,
              nome: chatName,
              telefone: phone,
              avatar_url: chat.profilePicture || null,
            })
            .select("id")
            .single();
          contato = novo;
        } else {
          const updateData: any = {};
          if (chat.profilePicture) updateData.avatar_url = chat.profilePicture;
          if (isGroupChat && chat.name) updateData.nome = chat.name;
          if (Object.keys(updateData).length > 0) {
            await supabase.from("contatos").update(updateData).eq("id", contato.id);
          }
        }

        if (!contato) continue;

        // Find or create conversation (any status, most recent)
        let convId: string;
        const { data: existingConv } = await supabase
          .from("conversas")
          .select("id, status")
          .eq("tenant_id", tenantId)
          .eq("contato_id", contato.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingConv) {
          convId = existingConv.id;
          // Reopen if closed
          if (existingConv.status === "fechada") {
            await supabase.from("conversas").update({ status: "aberta" }).eq("id", convId);
          }
        } else {
          const { data: newConv } = await supabase
            .from("conversas")
            .insert({
              tenant_id: tenantId,
              contato_id: contato.id,
              ultimo_texto: chat.lastMessage?.content || null,
              ultima_msg_at: chat.lastMessage?.timestamp
                ? new Date(chat.lastMessage.timestamp * 1000).toISOString()
                : new Date().toISOString(),
              status: "aberta",
            })
            .select("id")
            .single();
          if (!newConv) continue;
          convId = newConv.id;
          imported++;
        }

        // Import messages filtered by date range
        try {
          const msgRes = await callZapi(`load-messages-chat-phone/${phone}`, "GET");
          const rawMsgs = await msgRes.json();

          if (rawMsgs?.error || !Array.isArray(rawMsgs)) {
            console.warn(`Skipping messages for ${phone}:`, rawMsgs?.error || "invalid");
            continue;
          }

          // Filter by date range
          const filteredMsgs = rawMsgs.filter(
            (m: any) => m.timestamp && m.timestamp >= startTs && m.timestamp <= endTs
          );

          setStatusText(
            `Chat ${i + 1}/${totalChats}: ${chatName.slice(0, 20)} — ${filteredMsgs.length} msgs no período`
          );

          for (const msg of filteredMsgs) {
            const zapiId = msg.messageId || msg.id?.id;
            if (!zapiId) continue;
            const content = msg.body || msg.text || msg.caption || "";
            if (!content) continue;

            // Check duplicate (normalized key: messageId)
            const { data: existing } = await supabase
              .from("mensagens")
              .select("id")
              .eq("conversa_id", convId)
              .or(`metadata->>messageId.eq.${zapiId},metadata->>zapi_message_id.eq.${zapiId}`)
              .maybeSingle();

            if (existing) continue;

            // Robust timestamp: try multiple Z-API fields
            const rawTs = msg.timestamp || msg.momment || msg.messageTimestamp;
            const msgDate = rawTs
              ? new Date(rawTs * 1000).toISOString()
              : (() => { console.warn(`No timestamp for msg ${zapiId}`); return new Date().toISOString(); })();

            await supabase.from("mensagens").insert({
              conversa_id: convId,
              tenant_id: tenantId,
              conteudo: content,
              remetente: (msg.fromMe ? "atendente" : "contato") as any,
              tipo: "texto" as any,
              metadata: {
                messageId: zapiId,
                senderName: msg.senderName || msg.sender?.name || null,
                senderAvatar: msg.senderPhoto || msg.sender?.profilePicture || null,
              },
              created_at: msgDate,
            });
            msgsImported++;
          }
        } catch (msgErr) {
          console.warn(`Failed to import messages for ${phone}:`, msgErr);
        }
      }

      setResult({ conversas: imported, mensagens: msgsImported });
      setStatusText("Sincronização concluída!");
      setProgress(100);
      onComplete();
      toast.success(`${imported} conversa(s) e ${msgsImported} mensagem(ns) importada(s)`);
    } catch (e) {
      console.error("Sync error:", e);
      toast.error("Erro ao sincronizar WhatsApp");
    } finally {
      setSyncing(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!syncing) {
      setResult(null);
      setProgress(0);
      setStatusText("");
      onOpenChange(open);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sincronizar WhatsApp</DialogTitle>
          <DialogDescription>
            Selecione o período para importar conversas e mensagens do WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Data início</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                    disabled={syncing}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => d && setStartDate(d)}
                    disabled={(date) => date > new Date()}
                    locale={ptBR}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Data fim</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                    disabled={syncing}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(d) => d && setEndDate(d)}
                    disabled={(date) => date > new Date() || date < startDate}
                    locale={ptBR}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Progress */}
          {syncing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">{statusText}</p>
            </div>
          )}

          {/* Result */}
          {result && !syncing && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium text-foreground">✅ Sincronização concluída</p>
              <p className="text-muted-foreground mt-1">
                {result.conversas} conversa(s) nova(s) · {result.mensagens} mensagem(ns) importada(s)
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={syncing}>
            {result ? "Fechar" : "Cancelar"}
          </Button>
          {!result && (
            <Button onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                "Sincronizar"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
