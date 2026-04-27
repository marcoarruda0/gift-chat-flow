import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ConversasList } from "@/components/conversas/ConversasList";
import { ChatPanel, ChatPanelEmpty } from "@/components/conversas/ChatPanel";
import { NovaConversaDialog } from "@/components/conversas/NovaConversaDialog";
import { TransferirDialog } from "@/components/conversas/TransferirDialog";
import { ImportarConversasDialog } from "@/components/conversas/ImportarConversasDialog";
import { SincronizarWhatsappDialog } from "@/components/conversas/SincronizarWhatsappDialog";
import { EnviarTemplateDialog } from "@/components/conversas/EnviarTemplateDialog";
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
  aguardando_humano: boolean;
  atendente_id: string | null;
  departamento_id: string | null;
  marcada_nao_lida: boolean;
  created_at: string | null;
  canal: string;
}

interface MensagemRow {
  id: string;
  conteudo: string;
  remetente: string;
  tipo: string;
  created_at: string;
  metadata?: Record<string, any> | null;
  status_entrega?: string | null;
  status_entrega_at?: string | null;
}

export default function Conversas() {
  const { user, profile, hasRole } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversas, setConversas] = useState<ConversaRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemRow[]>([]);
  const [loadingConversas, setLoadingConversas] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [novaConversaOpen, setNovaConversaOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const [departamentos, setDepartamentos] = useState<Record<string, string>>({});
  const [membros, setMembros] = useState<Record<string, string>>({});

  const tenantId = profile?.tenant_id;

  // Fetch departamentos and profiles for lookup
  useEffect(() => {
    if (!tenantId) return;
    supabase.from("departamentos").select("id, nome").eq("tenant_id", tenantId).then(({ data }) => {
      if (data) setDepartamentos(Object.fromEntries(data.map(d => [d.id, d.nome])));
    });
    supabase.from("profiles").select("id, nome, apelido, mostrar_apelido").eq("tenant_id", tenantId).then(({ data }) => {
      if (data) setMembros(Object.fromEntries(data.map(p => [p.id, p.mostrar_apelido && p.apelido ? p.apelido : (p.nome || "Sem nome")])));
    });
  }, [tenantId]);

  // Fetch conversas with contato name
  const fetchConversas = useCallback(async () => {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from("conversas")
      .select("id, ultimo_texto, ultima_msg_at, nao_lidas, status, aguardando_humano, atendente_id, departamento_id, marcada_nao_lida, created_at, contato_id, canal, contatos(nome, telefone, avatar_url)")
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
      aguardando_humano: c.aguardando_humano ?? false,
      atendente_id: c.atendente_id || null,
      departamento_id: c.departamento_id || null,
      marcada_nao_lida: c.marcada_nao_lida ?? false,
      created_at: c.created_at || null,
      canal: c.canal || "zapi",
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
      .select("id, conteudo, remetente, tipo, created_at, metadata, status_entrega, status_entrega_at")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: true });

    if (error) { console.error(error); setLoadingMsgs(false); return; }
    setMensagens((data as MensagemRow[]) || []);
    setLoadingMsgs(false);
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchMensagens(selectedId);
      // Reset unread count and marcada_nao_lida in DB and local state
      supabase.from("conversas").update({ nao_lidas: 0, marcada_nao_lida: false } as any).eq("id", selectedId).then();
      setConversas(prev => prev.map(c => c.id === selectedId ? { ...c, nao_lidas: 0, marcada_nao_lida: false } : c));
    } else {
      setMensagens([]);
    }
  }, [selectedId, fetchMensagens]);

  // Realtime subscriptions with tenant filter
  useEffect(() => {
    if (!tenantId) return;

    const msgChannel = supabase
      .channel(`mensagens-realtime-${tenantId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "mensagens",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload) => {
        const newMsg = payload.new as any;
        if (newMsg.conversa_id === selectedId) {
          setMensagens(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, {
              id: newMsg.id,
              conteudo: newMsg.conteudo,
              remetente: newMsg.remetente,
              tipo: newMsg.tipo,
              created_at: newMsg.created_at,
              metadata: newMsg.metadata,
            }];
          });
        }
        fetchConversas();
      })
      .subscribe();

    const convChannel = supabase
      .channel(`conversas-realtime-${tenantId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "conversas",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload) => {
        fetchConversas();
        // If the updated conversa is the selected one, also refresh messages
        const changed = payload.new as any;
        if (changed?.id === selectedId) {
          fetchMensagens(selectedId);
        }
      })
      .subscribe();

    // Polling fallback every 15s
    const pollInterval = setInterval(() => {
      fetchConversas();
    }, 15000);

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(convChannel);
      clearInterval(pollInterval);
    };
  }, [tenantId, selectedId, fetchConversas, fetchMensagens]);

  // Create or find existing conversation for a contact
  const criarConversa = async (contatoId: string) => {
    if (!tenantId) return;

    // Check for ANY existing conversation (regardless of status)
    const { data: existing } = await supabase
      .from("conversas")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("contato_id", contatoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Reopen if closed
      if (existing.status !== "aberta") {
        await supabase
          .from("conversas")
          .update({ status: "aberta" })
          .eq("id", existing.id);
      }
      setSelectedId(existing.id);
      return;
    }

    // Create new conversation only if none exists
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

  // Format phone: preserve group IDs (@g.us), clean individual numbers
  const formatPhone = (p: string) => p.includes("@g.us") ? p : p.replace(/\D/g, "");

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

  // Helper: persist Z-API messageId returned by send-* into mensagens.metadata.
  // This prevents duplicates when the Z-API "fromMe" webhook echoes our own send.
  const persistZapiMessageId = async (mensagemId: string | undefined, response: Response) => {
    if (!mensagemId) return;
    try {
      const json = await response.clone().json().catch(() => null);
      const mid = json?.messageId || json?.id?.id || json?.id || null;
      if (!mid) return;
      const { data: cur } = await supabase
        .from("mensagens")
        .select("metadata")
        .eq("id", mensagemId)
        .maybeSingle();
      const newMeta = { ...((cur?.metadata as any) || {}), messageId: mid };
      await supabase.from("mensagens").update({ metadata: newMeta }).eq("id", mensagemId);
    } catch {
      /* swallow */
    }
  };

  // Helper: call WhatsApp Cloud proxy
  const callCloud = async (endpoint: string, method: string, data?: any, useWabaId = false) => {
    const { data: session } = await supabase.auth.getSession();
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/whatsapp-cloud-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session?.access_token}`,
      },
      body: JSON.stringify({ endpoint, method, data, useWabaId }),
    });
    return res.json();
  };

  // Upload media to Cloud API and return media_id
  const uploadCloudMedia = async (file: Blob, mimeType: string, filename: string) => {
    // Cloud API media upload requires multipart/form-data with the actual file.
    // We pass the file as base64 through the proxy which converts it server-side.
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const result = await callCloud("media", "POST", {
      _multipart: true,
      file_base64: base64,
      mime_type: mimeType,
      filename,
    });
    if (!result?.id) throw new Error(result?.error?.message || "Upload Cloud falhou");
    return result.id as string;
  };

  // Helper: persist wa_message_id from Meta response into mensagens.metadata
  const persistWaMessageId = async (mensagemId: string, result: any) => {
    const waId = result?.messages?.[0]?.id;
    if (!waId) return;
    const { data: cur } = await supabase
      .from("mensagens")
      .select("metadata")
      .eq("id", mensagemId)
      .maybeSingle();
    const newMeta = { ...(cur?.metadata as any || {}), wa_message_id: waId };
    await supabase.from("mensagens").update({ metadata: newMeta }).eq("id", mensagemId);
  };

  // Send text message (with variable substitution)
  const handleSend = async (rawText: string) => {
    if (!selectedId || !tenantId) return;
    // Replace variables
    let text = rawText;
    if (selected) {
      text = text.replace(/\{nome\}/gi, selected.contato_nome || "");
      text = text.replace(/\{telefone\}/gi, selected.contato_telefone || "");
    }
    // Build metadata with sender name if apelido is active
    const senderName = profile?.mostrar_apelido && profile?.apelido ? profile.apelido : null;
    const metadata: Record<string, any> = {};
    if (senderName) metadata.senderName = senderName;

    const { data: inserted, error } = await supabase.from("mensagens").insert({
      conversa_id: selectedId,
      tenant_id: tenantId,
      conteudo: text,
      remetente: "atendente" as any,
      tipo: "texto" as any,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }).select("id").maybeSingle();
    if (error) { toast.error("Erro ao enviar mensagem"); return; }

    await supabase.from("conversas").update({
      ultimo_texto: "Você: " + text.slice(0, 90),
      ultima_msg_at: new Date().toISOString(),
    }).eq("id", selectedId);


    const isCloud = selected?.canal === "whatsapp_cloud";

    if (isCloud && selected?.contato_telefone) {
      try {
        const cloudText = senderName ? `*${senderName}:*\n${text}` : text;
        const result = await callCloud("messages", "POST", {
          messaging_product: "whatsapp",
          to: formatPhone(selected.contato_telefone),
          type: "text",
          text: { body: cloudText },
        });
        if (result?.error) {
          console.error("WhatsApp Cloud error:", result.error);
          toast.error(`Erro Cloud: ${result.error.message || "envio falhou"}`);
        } else if (inserted?.id) {
          await persistWaMessageId(inserted.id, result);
        }
      } catch (e) {
        console.warn("WhatsApp Cloud send failed:", e);
        toast.error("Erro ao enviar via WhatsApp Oficial");
      }
    } else if (selected?.contato_telefone) {
      // Send via Z-API
      try {
        const zapiMessage = senderName ? `*${senderName}:*\n${text}` : text;
        const resp = await callZapi("send-text", "POST", {
          phone: formatPhone(selected.contato_telefone),
          message: zapiMessage,
        });
        await persistZapiMessageId(inserted?.id, resp);
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
      const { data: inserted } = await supabase.from("mensagens").insert({
        conversa_id: selectedId,
        tenant_id: tenantId,
        conteudo: url,
        remetente: "atendente" as any,
        tipo: "audio" as any,
      }).select("id").maybeSingle();
      await supabase.from("conversas").update({
        ultimo_texto: "🎤 Áudio",
        ultima_msg_at: new Date().toISOString(),
      }).eq("id", selectedId);

      if (selected?.canal === "whatsapp_cloud" && selected?.contato_telefone) {
        try {
          const mediaId = await uploadCloudMedia(blob, "audio/ogg", "audio.ogg");
          const result = await callCloud("messages", "POST", {
            messaging_product: "whatsapp",
            to: formatPhone(selected.contato_telefone),
            type: "audio",
            audio: { id: mediaId },
          });
          if (result?.error) toast.error(`Erro Cloud: ${result.error.message || "envio falhou"}`);
          else if (inserted?.id) await persistWaMessageId(inserted.id, result);
        } catch (e) {
          console.warn("Cloud audio send failed:", e);
          toast.error("Erro ao enviar áudio via WhatsApp Oficial");
        }
      } else if (selected?.contato_telefone) {
        await callZapi("send-audio", "POST", {
          phone: formatPhone(selected.contato_telefone),
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

      const { data: inserted } = await supabase.from("mensagens").insert({
        conversa_id: selectedId,
        tenant_id: tenantId,
        conteudo: url,
        remetente: "atendente" as any,
        tipo: tipo as any,
      }).select("id").maybeSingle();
      await supabase.from("conversas").update({
        ultimo_texto: isImage ? "📷 Imagem" : "📎 Documento",
        ultima_msg_at: new Date().toISOString(),
      }).eq("id", selectedId);

      if (selected?.canal === "whatsapp_cloud" && selected?.contato_telefone) {
        try {
          const mediaId = await uploadCloudMedia(file, file.type, file.name);
          const cloudType = isImage ? "image" : "document";
          const cloudPayload: any = isImage
            ? { image: { id: mediaId } }
            : { document: { id: mediaId, filename: file.name } };
          const result = await callCloud("messages", "POST", {
            messaging_product: "whatsapp",
            to: formatPhone(selected.contato_telefone),
            type: cloudType,
            ...cloudPayload,
          });
          if (result?.error) toast.error(`Erro Cloud: ${result.error.message || "envio falhou"}`);
          else if (inserted?.id) await persistWaMessageId(inserted.id, result);
        } catch (e) {
          console.warn("Cloud media send failed:", e);
          toast.error("Erro ao enviar anexo via WhatsApp Oficial");
        }
      } else if (selected?.contato_telefone) {
        const phone = formatPhone(selected.contato_telefone);
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

  // Send approved template (used to reopen the 24h window on Cloud channel)
  const handleSendTemplate = async (payload: {
    name: string;
    language: string;
    components: any[];
    previewText: string;
  }) => {
    if (!selectedId || !tenantId || !selected?.contato_telefone) {
      toast.error("Conversa inválida para envio de template");
      return;
    }
    try {
      // Insert local message first to get its id
      const { data: inserted, error } = await supabase.from("mensagens").insert({
        conversa_id: selectedId,
        tenant_id: tenantId,
        conteudo: payload.previewText,
        remetente: "atendente" as any,
        tipo: "texto" as any,
        metadata: {
          wa_template_name: payload.name,
          wa_template_language: payload.language,
        },
      }).select("id").maybeSingle();
      if (error) { toast.error("Erro ao registrar mensagem"); return; }

      await supabase.from("conversas").update({
        ultimo_texto: "Você: " + payload.previewText.slice(0, 90),
        ultima_msg_at: new Date().toISOString(),
      }).eq("id", selectedId);

      // Send to Meta
      const result = await callCloud("messages", "POST", {
        messaging_product: "whatsapp",
        to: formatPhone(selected.contato_telefone),
        type: "template",
        template: {
          name: payload.name,
          language: { code: payload.language },
          ...(payload.components.length > 0 ? { components: payload.components } : {}),
        },
      });
      if (result?.error) {
        console.error("WhatsApp Cloud template error:", result.error);
        toast.error(`Erro Cloud: ${result.error.message || "envio falhou"}`);
      } else {
        if (inserted?.id) await persistWaMessageId(inserted.id, result);
        toast.success("Template enviado");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao enviar template");
    }
  };

  const handleClose = async () => {
    if (!selectedId) return;
    await supabase.from("conversas").update({
      status: "fechada",
      atendimento_encerrado_at: new Date().toISOString(),
    } as any).eq("id", selectedId);
    setSelectedId(null);
    fetchConversas();
  };

  const handlePull = async () => {
    if (!selectedId || !tenantId || !user || !profile) return;
    const senderName = profile.mostrar_apelido && profile.apelido ? profile.apelido : (profile.nome || "Atendente");
    await supabase.from("conversas").update({
      atendente_id: user.id,
      atendimento_iniciado_at: new Date().toISOString(),
      status: "aberta",
    } as any).eq("id", selectedId);

    await supabase.from("mensagens").insert({
      conversa_id: selectedId,
      tenant_id: tenantId,
      conteudo: `Conversa assumida por ${senderName}`,
      remetente: "sistema" as any,
      tipo: "texto" as any,
    });

    setConversas(prev => prev.map(c => c.id === selectedId ? { ...c, atendente_id: user.id } : c));
    fetchConversas();
    toast.success("Conversa puxada com sucesso!");
  };

  const handleMarkUnread = async () => {
    if (!selectedId) return;
    await supabase.from("conversas").update({ marcada_nao_lida: true } as any).eq("id", selectedId);
    setConversas(prev => prev.map(c => c.id === selectedId ? { ...c, marcada_nao_lida: true } : c));
    setSelectedId(null);
  };

  const handleTransfer = async (paraUserId: string, paraUserNome: string, motivo: string) => {
    if (!selectedId || !tenantId || !profile) return;
    try {
      // Update atendente_id
      await supabase.from("conversas").update({ atendente_id: paraUserId }).eq("id", selectedId);

      // Insert transfer record
      await supabase.from("conversa_transferencias").insert({
        conversa_id: selectedId,
        tenant_id: tenantId,
        de_user_id: user!.id,
        para_user_id: paraUserId,
        motivo: motivo || null,
      });

      // Insert system message
      await supabase.from("mensagens").insert({
        conversa_id: selectedId,
        tenant_id: tenantId,
        conteudo: `Conversa transferida de ${profile.nome || "Atendente"} para ${paraUserNome}${motivo ? ` — Motivo: ${motivo}` : ""}`,
        remetente: "sistema" as any,
        tipo: "texto" as any,
      });

      toast.success(`Conversa transferida para ${paraUserNome}`);
      fetchConversas();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao transferir conversa");
    }
  };

  const handleTransferDepartamento = async (departamentoId: string, departamentoNome: string, motivo: string) => {
    if (!selectedId || !tenantId || !profile) return;
    try {
      // Round-robin: get next agent for the department
      const { data: nextAgentId } = await supabase.rpc("distribuir_atendente", {
        p_tenant_id: tenantId,
        p_departamento_id: departamentoId,
      });

      await supabase.from("conversas").update({
        departamento_id: departamentoId,
        atendente_id: nextAgentId || null,
      } as any).eq("id", selectedId);

      const paraUserId = nextAgentId || user!.id;

      await supabase.from("conversa_transferencias").insert({
        conversa_id: selectedId,
        tenant_id: tenantId,
        de_user_id: user!.id,
        para_user_id: paraUserId,
        motivo: `Transferido para departamento ${departamentoNome}${motivo ? ` — ${motivo}` : ""}`,
      });

      // Get assigned agent name for system message
      let assignedName = "";
      if (nextAgentId) {
        const { data: agentProfile } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", nextAgentId)
          .single();
        assignedName = agentProfile?.nome || "Atendente";
      }

      const systemMsg = nextAgentId
        ? `Conversa transferida para ${departamentoNome} — Atribuída a ${assignedName}${motivo ? ` — Motivo: ${motivo}` : ""}`
        : `Conversa transferida para o departamento ${departamentoNome}${motivo ? ` — Motivo: ${motivo}` : ""}`;

      await supabase.from("mensagens").insert({
        conversa_id: selectedId,
        tenant_id: tenantId,
        conteudo: systemMsg,
        remetente: "sistema" as any,
        tipo: "texto" as any,
      });

      toast.success(nextAgentId 
        ? `Conversa transferida para ${departamentoNome} (${assignedName})`
        : `Conversa transferida para ${departamentoNome}`
      );
      fetchConversas();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao transferir conversa");
    }
  };

  const selected = conversas.find(c => c.id === selectedId);
  const showList = !isMobile || !selectedId;
  const showChat = !isMobile || !!selectedId;
  const isAdmin = hasRole("admin_tenant") || hasRole("admin_master");

  // 24h window for WhatsApp Cloud: only allow free-form sending if last contact message was within 24h
  const lastContactMsgAt = mensagens
    .filter(m => m.remetente === "contato")
    .reduce<string | null>((acc, m) => (!acc || m.created_at > acc ? m.created_at : acc), null);
  const isCloudChannel = selected?.canal === "whatsapp_cloud";
  const within24h = !!lastContactMsgAt && (Date.now() - new Date(lastContactMsgAt).getTime()) < 24 * 60 * 60 * 1000;
  const cloudWindowBlocked = isCloudChannel && !within24h;

  return (
    <div className="flex h-full w-full">
      {showList && (
        <div className={isMobile ? "w-full" : "w-[400px] shrink-0"}>
          <ConversasList
            conversas={conversas}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onNewConversa={() => setNovaConversaOpen(true)}
            onSync={() => setSyncDialogOpen(true)}
            onImport={() => setImportDialogOpen(true)}
            syncing={false}
            loading={loadingConversas}
            currentUserId={user?.id || null}
            userDepartamentoId={(profile as any)?.departamento_id || null}
            isAdmin={isAdmin}
          />
        </div>
      )}
      {showChat && (
        selected ? (
          <ChatPanel
            contatoNome={selected.contato_nome}
            contatoTelefone={selected.contato_telefone}
            contatoAvatar={selected.contato_avatar}
            departamentoNome={selected.departamento_id ? departamentos[selected.departamento_id] || null : null}
            atendenteNome={selected.atendente_id ? membros[selected.atendente_id] || null : null}
            mensagens={mensagens}
            onSend={handleSend}
            onSendAudio={handleSendAudio}
            onSendAttachment={handleSendAttachment}
            onClose={handleClose}
            onBack={isMobile ? () => setSelectedId(null) : undefined}
            onTransfer={() => setTransferDialogOpen(true)}
            onMarkUnread={handleMarkUnread}
            loading={loadingMsgs}
            isAssignedToMe={selected.atendente_id === user?.id}
            canal={selected.canal || "zapi"}
            cloudWindowBlocked={cloudWindowBlocked}
            onSendTemplate={() => setTemplateDialogOpen(true)}
            onPull={handlePull}
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
      <TransferirDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        onConfirm={handleTransfer}
        onConfirmDepartamento={handleTransferDepartamento}
      />
      <ImportarConversasDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onComplete={fetchConversas}
      />
      <SincronizarWhatsappDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        onComplete={fetchConversas}
      />
      <EnviarTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onSend={handleSendTemplate}
      />
    </div>
  );
}
