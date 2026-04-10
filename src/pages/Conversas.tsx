import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ConversasList } from "@/components/conversas/ConversasList";
import { ChatPanel, ChatPanelEmpty } from "@/components/conversas/ChatPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface ConversaRow {
  id: string;
  contato_nome: string;
  contato_telefone: string | null;
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
}

export default function Conversas() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [conversas, setConversas] = useState<ConversaRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemRow[]>([]);
  const [loadingConversas, setLoadingConversas] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const tenantId = profile?.tenant_id;

  // Fetch conversas with contato name
  const fetchConversas = useCallback(async () => {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from("conversas")
      .select("id, ultimo_texto, ultima_msg_at, nao_lidas, status, contato_id, contatos(nome, telefone)")
      .eq("tenant_id", tenantId)
      .order("ultima_msg_at", { ascending: false });

    if (error) { console.error(error); return; }

    const mapped: ConversaRow[] = (data || []).map((c: any) => ({
      id: c.id,
      contato_nome: c.contatos?.nome || "Sem nome",
      contato_telefone: c.contatos?.telefone || null,
      ultimo_texto: c.ultimo_texto,
      ultima_msg_at: c.ultima_msg_at,
      nao_lidas: c.nao_lidas,
      status: c.status,
    }));
    setConversas(mapped);
    setLoadingConversas(false);
  }, [tenantId]);

  useEffect(() => { fetchConversas(); }, [fetchConversas]);

  // Fetch mensagens for selected conversa
  const fetchMensagens = useCallback(async (conversaId: string) => {
    setLoadingMsgs(true);
    const { data, error } = await supabase
      .from("mensagens")
      .select("id, conteudo, remetente, tipo, created_at")
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

  // Send message
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
      ultimo_texto: text,
      ultima_msg_at: new Date().toISOString(),
    }).eq("id", selectedId);
  };

  const handleClose = async () => {
    if (!selectedId) return;
    await supabase.from("conversas").update({ status: "fechada" }).eq("id", selectedId);
    setSelectedId(null);
    fetchConversas();
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
            loading={loadingConversas}
          />
        </div>
      )}
      {showChat && (
        selected ? (
          <ChatPanel
            contatoNome={selected.contato_nome}
            contatoTelefone={selected.contato_telefone}
            mensagens={mensagens}
            onSend={handleSend}
            onClose={handleClose}
            onBack={isMobile ? () => setSelectedId(null) : undefined}
            loading={loadingMsgs}
          />
        ) : (
          !isMobile && <ChatPanelEmpty />
        )
      )}
    </div>
  );
}
