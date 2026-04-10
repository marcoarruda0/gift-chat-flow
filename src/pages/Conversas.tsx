import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ConversasList } from "@/components/conversas/ConversasList";
import { ChatPanel, ChatPanelEmpty } from "@/components/conversas/ChatPanel";
import { NovaConversaDialog } from "@/components/conversas/NovaConversaDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface ConversaRow {
  id: string;
  contato_nome: string;
  contato_telefone: string | null;
  contato_avatar: string | null;
  ultimo_texto: string | null;
  ultima_msg_at: string | null;
  nao_lidas: number;
  status: string;
}

interface MensagemRow {
  id: string;
  conteudo: string;
  remetente: string;
  tipo: string;
  created_at: string;
  metadata?: Record<string, any> | null;
}

export default function Conversas() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversas, setConversas] = useState<ConversaRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemRow[]>([]);
  const [loadingConversas, setLoadingConversas] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [novaConversaOpen, setNovaConversaOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const tenantId = profile?.tenant_id;

  // Fetch conversas with contato name
  const fetchConversas = useCallback(async () => {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from("conversas")
      .select("id, ultimo_texto, ultima_msg_at, nao_lidas, status, contato_id, contatos(nome, telefone, avatar_url)")
      .eq("tenant_id", tenantId)
      .order("ultima_msg_at", { ascending: false });

    if (error) { console.error(error); return; }

    const mapped: ConversaRow[] = (data || []).map((c: any) => ({
      id: c.id,
      contato_nome: c.contatos?.nome || "Sem nome",
      contato_telefone: c.contatos?.telefone || null,
      contato_avatar: c.contatos?.avatar_url || null,
      ultimo_texto: c.ultimo_texto,
      ultima_msg_at: c.ultima_msg_at,
      nao_lidas: c.nao_lidas,
      status: c.status,
    }));
    setConversas(mapped);
    setLoadingConversas(false);
  }, [tenantId]);

  useEffect(() => { fetchConversas(); }, [fetchConversas]);

  // Read ?id= query param to pre-select conversation
  useEffect(() => {
    const idParam = searchParams.get("id");
    if (idParam && !selectedId) {
      setSelectedId(idParam);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, selectedId, setSearchParams]);

  // Fetch mensagens for selected conversa
  const fetchMensagens = useCallback(async (conversaId: string) => {
    setLoadingMsgs(true);
    const { data, error } = await supabase
      .from("mensagens")
      .select("id, conteudo, remetente, tipo, created_at, metadata")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: true });

    if (error) { console.error(error); setLoadingMsgs(false); return; }
    setMensagens((data as MensagemRow[]) || []);
    setLoadingMsgs(false);
  }, []);

  useEffect(() => {
    if (selectedId) fetchMensagens(selectedId);
    else setMensagens([]);
  }, [selectedId, fetchMensagens]);

  // Realtime subscriptions
  useEffect(() => {
    if (!tenantId) return;

    const msgChannel = supabase
      .channel("mensagens-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, (payload) => {
        const newMsg = payload.new as any;
        if (newMsg.conversa_id === selectedId) {
          setMensagens(prev => [...prev, {
            id: newMsg.id,
            conteudo: newMsg.conteudo,
            remetente: newMsg.remetente,
            tipo: newMsg.tipo,
            created_at: newMsg.created_at,
            metadata: newMsg.metadata,
          }]);
        }
        fetchConversas();
      })
      .subscribe();

    const convChannel = supabase
      .channel("conversas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversas" }, () => {
        fetchConversas();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(convChannel);
    };
  }, [tenantId, selectedId, fetchConversas]);

  // Create or find existing conversation for a contact
  const criarConversa = async (contatoId: string) => {
    if (!tenantId) return;

    // Check for existing open conversation
    const { data: existing } = await supabase
      .from("conversas")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("contato_id", contatoId)
      .eq("status", "aberta")
      .limit(1)
      .maybeSingle();

    if (existing) {
      setSelectedId(existing.id);
      return;
    }

    // Create new conversation
    const { data: nova, error } = await supabase
      .from("conversas")
      .insert({
        tenant_id: tenantId,
        contato_id: contatoId,
        status: "aberta",
      })
      .select("id")
      .single();

    if (error) {
      toast.error("Erro ao criar conversa");
      return;
    }
    await fetchConversas();
    setSelectedId(nova.id);
  };

  // Helper: upload file to storage
  const uploadToStorage = async (file: Blob, filename: string) => {
    const path = `${tenantId}/${Date.now()}_${filename}`;
    const { data, error } = await supabase.storage.from("chat-media").upload(path, file);
    if (error) throw error;
    return supabase.storage.from("chat-media").getPublicUrl(data.path).data.publicUrl;
  };

  // Helper: call Z-API proxy
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

  // Send text message
  const handleSend = async (text: string) => {
    if (!selectedId || !tenantId) return;
    const { error } = await supabase.from("mensagens").insert({
      conversa_id: selectedId,
      tenant_id: tenantId,
      conteudo: text,
      remetente: "atendente" as any,
      tipo: "texto" as any,
    });
    if (error) { toast.error("Erro ao enviar mensagem"); return; }

    await supabase.from("conversas").update({
      ultimo_texto: "Você: " + text.slice(0, 90),
      ultima_msg_at: new Date().toISOString(),
    }).eq("id", selectedId);

    // Send via Z-API if contact has phone
    if (selected?.contato_telefone) {
      try {
        await callZapi("send-text", "POST", {
          phone: selected.contato_telefone.replace(/\D/g, ""),
          message: text,
        });
      } catch (e) {
        console.warn("Z-API send failed (offline?):", e);
      }
    }
  };

  // Send audio message
  const handleSendAudio = async (blob: Blob) => {
    if (!selectedId || !tenantId) return;
    try {
      const url = await uploadToStorage(blob, "audio.ogg");
      await supabase.from("mensagens").insert({
        conversa_id: selectedId,
        tenant_id: tenantId,
        conteudo: url,
        remetente: "atendente" as any,
        tipo: "audio" as any,
      });
      await supabase.from("conversas").update({
        ultimo_texto: "🎤 Áudio",
        ultima_msg_at: new Date().toISOString(),
      }).eq("id", selectedId);

      if (selected?.contato_telefone) {
        await callZapi("send-audio", "POST", {
          phone: selected.contato_telefone.replace(/\D/g, ""),
          audio: url,
        }).catch(() => {});
      }
    } catch (e) {
      toast.error("Erro ao enviar áudio");
    }
  };

  // Send attachment (image or document)
  const handleSendAttachment = async (file: File) => {
    if (!selectedId || !tenantId) return;
    try {
      const isImage = file.type.startsWith("image/");
      const tipo = isImage ? "imagem" : "documento";
      const url = await uploadToStorage(file, file.name);

      await supabase.from("mensagens").insert({
        conversa_id: selectedId,
        tenant_id: tenantId,
        conteudo: url,
        remetente: "atendente" as any,
        tipo: tipo as any,
      });
      await supabase.from("conversas").update({
        ultimo_texto: isImage ? "📷 Imagem" : "📎 Documento",
        ultima_msg_at: new Date().toISOString(),
      }).eq("id", selectedId);

      if (selected?.contato_telefone) {
        const phone = selected.contato_telefone.replace(/\D/g, "");
        const endpoint = isImage ? "send-image" : "send-document";
        const data = isImage
          ? { phone, image: url, caption: "" }
          : { phone, document: url, fileName: file.name };
        await callZapi(endpoint, "POST", data).catch(() => {});
      }
    } catch (e) {
      toast.error("Erro ao enviar anexo");
    }
  };

  const handleClose = async () => {
    if (!selectedId) return;
    await supabase.from("conversas").update({ status: "fechada" }).eq("id", selectedId);
    setSelectedId(null);
    fetchConversas();
  };

  const handleSync = async () => {
    if (!tenantId) return;
    setSyncing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/zapi-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ endpoint: "chats", method: "GET" }),
        }
      );
      const chats = await res.json();

      if (!Array.isArray(chats)) {
        toast.error("Erro ao buscar chats do WhatsApp");
        return;
      }

      let imported = 0;
      let msgsImported = 0;
      const chatsToProcess = chats.filter((chat: any) => !!chat.phone);
      const totalChats = chatsToProcess.length;

      for (let i = 0; i < totalChats; i++) {
        const chat = chatsToProcess[i];
        const rawPhone = chat.phone || "";
        const isGroupChat = chat.isGroup === true || rawPhone.includes("@g.us");
        const phone = isGroupChat ? rawPhone : rawPhone.replace(/\D/g, "");
        const chatName = isGroupChat ? (chat.name || "Grupo") : (chat.name || phone);
        toast.loading(`Importando ${i + 1}/${totalChats}...`, { id: "sync-progress" });

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
          // Update avatar and name (for groups, name may change)
          const updateData: any = {};
          if (chat.profilePicture) updateData.avatar_url = chat.profilePicture;
          if (isGroup && chat.name) updateData.nome = chat.name;
          if (Object.keys(updateData).length > 0) {
            await supabase.from("contatos").update(updateData).eq("id", contato.id);
          }
        }

        if (!contato) continue;

        // Find or create conversation
        let convId: string;
        const { data: existingConv } = await supabase
          .from("conversas")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("contato_id", contato.id)
          .eq("status", "aberta")
          .maybeSingle();

        if (existingConv) {
          convId = existingConv.id;
        } else {
          const { data: newConv } = await supabase.from("conversas").insert({
            tenant_id: tenantId,
            contato_id: contato.id,
            ultimo_texto: chat.lastMessage?.content || null,
            ultima_msg_at: chat.lastMessage?.timestamp
              ? new Date(chat.lastMessage.timestamp * 1000).toISOString()
              : new Date().toISOString(),
            status: "aberta",
          }).select("id").single();
          if (!newConv) continue;
          convId = newConv.id;
          imported++;
        }

        // Import historical messages
        try {
          const msgRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/zapi-proxy`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.session?.access_token}`,
              },
              body: JSON.stringify({ endpoint: `load-messages-chat-phone/${phone}`, method: "GET" }),
            }
          );
          const rawMsgs = await msgRes.json();

          // Handle multi-device incompatibility gracefully
          if (rawMsgs?.error || !Array.isArray(rawMsgs)) {
            console.warn(`Skipping message import for ${phone}:`, rawMsgs?.error || "invalid response");
            continue;
          }
          const msgs = rawMsgs.slice(-50);

          for (const msg of msgs) {
            const zapiId = msg.messageId || msg.id?.id;
            if (!zapiId) continue;
            const content = msg.body || msg.text || msg.caption || "";
            if (!content) continue;

            // Check duplicate
            const { data: existing } = await supabase
              .from("mensagens")
              .select("id")
              .eq("conversa_id", convId)
              .contains("metadata", { zapi_message_id: zapiId })
              .maybeSingle();

            if (existing) continue;

            await supabase.from("mensagens").insert({
              conversa_id: convId,
              tenant_id: tenantId,
              conteudo: content,
              remetente: (msg.fromMe ? "atendente" : "contato") as any,
              tipo: "texto" as any,
              metadata: {
                zapi_message_id: zapiId,
                senderName: msg.senderName || msg.sender?.name || null,
                senderAvatar: msg.senderPhoto || msg.sender?.profilePicture || null,
              },
              created_at: msg.timestamp
                ? new Date(msg.timestamp * 1000).toISOString()
                : new Date().toISOString(),
            });
            msgsImported++;
          }
        } catch (msgErr) {
          console.warn(`Failed to import messages for ${phone}:`, msgErr);
        }
      }

      toast.dismiss("sync-progress");
      await fetchConversas();
      toast.success(`${imported} conversa(s) e ${msgsImported} mensagem(ns) importada(s)`);
    } catch (e) {
      console.error("Sync error:", e);
      toast.error("Erro ao sincronizar WhatsApp");
    } finally {
      setSyncing(false);
    }
  };

  const selected = conversas.find(c => c.id === selectedId);
  const showList = !isMobile || !selectedId;
  const showChat = !isMobile || !!selectedId;

  return (
    <div className="flex h-full w-full">
      {showList && (
        <div className={isMobile ? "w-full" : "w-[350px] shrink-0"}>
          <ConversasList
            conversas={conversas}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onNewConversa={() => setNovaConversaOpen(true)}
            onSync={handleSync}
            syncing={syncing}
            loading={loadingConversas}
          />
        </div>
      )}
      {showChat && (
        selected ? (
          <ChatPanel
            contatoNome={selected.contato_nome}
            contatoTelefone={selected.contato_telefone}
            contatoAvatar={selected.contato_avatar}
            mensagens={mensagens}
            onSend={handleSend}
            onSendAudio={handleSendAudio}
            onSendAttachment={handleSendAttachment}
            onClose={handleClose}
            onBack={isMobile ? () => setSelectedId(null) : undefined}
            loading={loadingMsgs}
          />
        ) : (
          !isMobile && <ChatPanelEmpty />
        )
      )}
      <NovaConversaDialog
        open={novaConversaOpen}
        onOpenChange={setNovaConversaOpen}
        onSelectContato={criarConversa}
      />
    </div>
  );
}
