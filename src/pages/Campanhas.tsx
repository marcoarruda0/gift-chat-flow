import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Send, Clock, Eye, Ban, Megaphone, Image, Mic, Video, FileText, Upload, X,
  MessageSquare, Mail, Sparkles, CheckCircle2, Eye as EyeIcon,
  Search, Tags, FlaskConical,
} from "lucide-react";
import { format } from "date-fns";
import { SEGMENTOS_ORDENADOS, getSegmentoBySoma, type SegmentoKey } from "@/lib/rfv-segments";
import { EmailEditor } from "@/components/campanhas/EmailEditor";
import { InsertVariableButton } from "@/components/campanhas/InsertVariableButton";
import { TemplateCampanhaPicker } from "@/components/campanhas/TemplateCampanhaPicker";
import { TestarCampanhaCloudDialog } from "@/components/campanhas/TestarCampanhaCloudDialog";
import { GerenciarGruposDialog, type CampanhaGrupo } from "@/components/campanhas/GerenciarGruposDialog";
import { EditarGrupoPopover } from "@/components/campanhas/EditarGrupoPopover";
import { AnaliticaGrupos } from "@/components/campanhas/AnaliticaGrupos";

type AtrasoTipo = "muito_curto" | "curto" | "medio" | "longo" | "muito_longo";
type Canal = "whatsapp" | "whatsapp_cloud" | "email";

const atrasoConfig: Record<AtrasoTipo, { label: string; desc: string }> = {
  muito_curto: { label: "Muito Curto", desc: "1s a 5s" },
  curto: { label: "Curto", desc: "5s a 20s" },
  medio: { label: "Médio", desc: "20s a 60s" },
  longo: { label: "Longo", desc: "60s a 180s" },
  muito_longo: { label: "Muito Longo", desc: "180s a 300s" },
};

type Campanha = {
  id: string;
  nome: string;
  mensagem: string;
  tipo_filtro: string;
  filtro_valor: string[];
  status: string;
  agendada_para: string | null;
  total_destinatarios: number;
  total_enviados: number;
  total_falhas: number;
  created_at: string;
  tipo_midia: string;
  midia_url: string | null;
  atraso_tipo: AtrasoTipo;
  canal: Canal;
  email_assunto: string | null;
  email_html: string | null;
  email_preview: string | null;
  template_id: string | null;
  template_name: string | null;
  template_language: string | null;
  template_components: any;
  template_variaveis: any;
  grupo_id: string | null;
};

type Contato = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  tags: string[] | null;
  rfv_recencia: number | null;
  rfv_frequencia: number | null;
  rfv_valor: number | null;
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  agendada: { label: "Agendada", variant: "outline" },
  enviando: { label: "Enviando...", variant: "default" },
  concluida: { label: "Concluída", variant: "secondary" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

const midiaIcon: Record<string, React.ReactNode> = {
  texto: null,
  imagem: <Image className="h-4 w-4" />,
  audio: <Mic className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  documento: <FileText className="h-4 w-4" />,
};

const midiaAccept: Record<string, string> = {
  imagem: "image/*",
  audio: "audio/*",
  video: "video/*",
  documento: ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv",
};

export default function Campanhas() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<string | null>(null);
  const [destinatariosDetail, setDestinatariosDetail] = useState<any[]>([]);
  const [filtroCanal, setFiltroCanal] = useState<"todas" | Canal>("todas");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emailAssuntoRef = useRef<HTMLInputElement>(null);
  const mensagemRef = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(
    el: HTMLInputElement | HTMLTextAreaElement | null,
    token: string,
    current: string,
    setter: (v: string) => void,
  ) {
    if (!el) {
      setter(current + token);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setter(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // Form state
  const [canal, setCanal] = useState<Canal>("whatsapp");
  const [nome, setNome] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [emailAssunto, setEmailAssunto] = useState("");
  const [emailPreview, setEmailPreview] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [tagsSelecionadas, setTagsSelecionadas] = useState<string[]>([]);
  const [agendarPara, setAgendarPara] = useState("");
  const [agendar, setAgendar] = useState(false);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [tipoMidia, setTipoMidia] = useState("texto");
  const [midiaUrl, setMidiaUrl] = useState<string | null>(null);
  const [midiaFileName, setMidiaFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [atrasoTipo, setAtrasoTipo] = useState<AtrasoTipo>("medio");
  const [rfvMinR, setRfvMinR] = useState("0");
  const [rfvMinF, setRfvMinF] = useState("0");
  const [rfvMinV, setRfvMinV] = useState("0");
  const [rfvSegmento, setRfvSegmento] = useState<"custom" | SegmentoKey>("custom");

  // WhatsApp Cloud (oficial) — template state
  const [templateId, setTemplateId] = useState<string>("");
  const [templateName, setTemplateName] = useState<string>("");
  const [templateLanguage, setTemplateLanguage] = useState<string>("");
  const [templateComponents, setTemplateComponents] = useState<any[]>([]);
  const [templateVariaveis, setTemplateVariaveis] = useState<Record<string, string>>({});
  const [optInConfirmado, setOptInConfirmado] = useState(false);
  const [cloudConectado, setCloudConectado] = useState(false);

  // Busca de contatos na seleção manual
  const [manualSearch, setManualSearch] = useState("");

  // Grupos de campanhas
  const [grupos, setGrupos] = useState<CampanhaGrupo[]>([]);
  const [grupoId, setGrupoId] = useState<string>("none");
  const [filtroGrupo, setFiltroGrupo] = useState<string>("todos");
  const [gruposDialogOpen, setGruposDialogOpen] = useState(false);
  const [editGrupoCampanhaId, setEditGrupoCampanhaId] = useState<string | null>(null);

  // Teste de disparo Oficial
  const [testarOpen, setTestarOpen] = useState(false);

  // Tenant email config (for live preview in EmailEditor)
  const [tenantEmail, setTenantEmail] = useState<{
    nome: string | null;
    fromName: string | null;
    signature: string | null;
  }>({ nome: null, fromName: null, signature: null });

  const tenantId = profile?.tenant_id;

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from("tenants")
      .select("nome, email_remetente_nome, email_assinatura")
      .eq("id", tenantId)
      .single()
      .then(({ data }) => {
        if (data) {
          setTenantEmail({
            nome: data.nome,
            fromName: (data as any).email_remetente_nome || data.nome,
            signature: (data as any).email_assinatura || null,
          });
        }
      });
  }, [tenantId]);

  // Check if WhatsApp Cloud is connected for this tenant
  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from("whatsapp_cloud_config")
      .select("status")
      .eq("tenant_id", tenantId)
      .maybeSingle()
      .then(({ data }) => {
        setCloudConectado(data?.status === "conectado");
      });
  }, [tenantId]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    contatos.forEach((c) => c.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [contatos]);

  const hasContact = (c: Contato) => (canal === "email" ? !!c.email : !!c.telefone);

  const contatosFiltrados = useMemo(() => {
    if (tipoFiltro === "todos") return contatos.filter(hasContact);
    if (tipoFiltro === "tag") return contatos.filter((c) => hasContact(c) && c.tags?.some((t) => tagsSelecionadas.includes(t)));
    if (tipoFiltro === "manual") return contatos.filter((c) => hasContact(c) && contatosSelecionados.includes(c.id));
    if (tipoFiltro === "rfv") {
      if (rfvSegmento !== "custom") {
        return contatos.filter(
          (c) =>
            hasContact(c) &&
            getSegmentoBySoma(c.rfv_recencia, c.rfv_frequencia, c.rfv_valor).key === rfvSegmento,
        );
      }
      const minR = parseInt(rfvMinR);
      const minF = parseInt(rfvMinF);
      const minV = parseInt(rfvMinV);
      return contatos.filter((c) =>
        hasContact(c) &&
        (minR === 0 || (c.rfv_recencia ?? 0) >= minR) &&
        (minF === 0 || (c.rfv_frequencia ?? 0) >= minF) &&
        (minV === 0 || (c.rfv_valor ?? 0) >= minV)
      );
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatos, tipoFiltro, tagsSelecionadas, contatosSelecionados, rfvMinR, rfvMinF, rfvMinV, rfvSegmento, canal]);

  const totalContatosCanal = useMemo(
    () => contatos.filter(hasContact).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contatos, canal],
  );

  const campanhasFiltradas = useMemo(() => {
    let list = campanhas;
    if (filtroCanal !== "todas") {
      list = list.filter((c) => (c.canal || "whatsapp") === filtroCanal);
    }
    if (filtroGrupo !== "todos") {
      if (filtroGrupo === "sem_grupo") {
        list = list.filter((c) => !c.grupo_id);
      } else {
        list = list.filter((c) => c.grupo_id === filtroGrupo);
      }
    }
    return list;
  }, [campanhas, filtroCanal, filtroGrupo]);

  const gruposMap = useMemo(() => {
    const m = new Map<string, CampanhaGrupo>();
    grupos.forEach((g) => m.set(g.id, g));
    return m;
  }, [grupos]);

  useEffect(() => {
    if (tenantId) {
      fetchCampanhas();
      fetchContatos();
      fetchGrupos();
    }
  }, [tenantId]);

  async function fetchGrupos() {
    if (!tenantId) return;
    const { data } = await (supabase as any)
      .from("campanha_grupos")
      .select("id, nome, descricao, cor")
      .eq("tenant_id", tenantId)
      .order("nome");
    setGrupos((data as CampanhaGrupo[]) || []);
  }

  async function fetchCampanhas() {
    setLoading(true);
    const { data } = await supabase
      .from("campanhas")
      .select("*")
      .order("created_at", { ascending: false });
    setCampanhas((data as any[]) || []);
    setLoading(false);
  }

  async function fetchContatos() {
    const { data } = await supabase
      .from("contatos")
      .select("id, nome, telefone, email, tags, rfv_recencia, rfv_frequencia, rfv_valor");
    setContatos((data as Contato[]) || []);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `campanhas/${tenantId}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage.from("chat-media").upload(path, file);
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      setMidiaUrl(urlData.publicUrl);
      setMidiaFileName(file.name);
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function removeMidia() {
    setMidiaUrl(null);
    setMidiaFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function criarCampanha() {
    if (!tenantId || !nome.trim()) {
      toast({ title: "Preencha o nome da campanha", variant: "destructive" });
      return;
    }

    if (canal === "whatsapp") {
      if (tipoMidia === "texto" && !mensagem.trim()) {
        toast({ title: "Preencha a mensagem", variant: "destructive" });
        return;
      }
      if (tipoMidia !== "texto" && !midiaUrl) {
        toast({ title: "Faça upload do arquivo de mídia", variant: "destructive" });
        return;
      }
    } else if (canal === "whatsapp_cloud") {
      if (!cloudConectado) {
        toast({ title: "WhatsApp Oficial não está conectado", description: "Vá em Configurações › WhatsApp Oficial.", variant: "destructive" });
        return;
      }
      if (!templateId || !templateName) {
        toast({ title: "Selecione um template aprovado", variant: "destructive" });
        return;
      }
      // All {{n}} placeholders must be mapped
      const requiredKeys: string[] = [];
      for (const comp of templateComponents) {
        const type = String(comp.type || "").toUpperCase();
        if (type === "BODY" || (type === "HEADER" && String(comp.format || "TEXT").toUpperCase() === "TEXT")) {
          const text = String(comp.text || "");
          const matches = text.matchAll(/\{\{(\d+)\}\}/g);
          for (const m of matches) {
            requiredKeys.push(`${type === "HEADER" ? "header" : "body"}.${m[1]}`);
          }
        }
      }
      const missing = requiredKeys.filter((k) => !(templateVariaveis[k] || "").trim());
      if (missing.length > 0) {
        toast({ title: "Preencha todas as variáveis do template", variant: "destructive" });
        return;
      }
      if (!optInConfirmado) {
        toast({ title: "Confirme o opt-in dos destinatários", variant: "destructive" });
        return;
      }
    } else {
      if (!emailAssunto.trim()) {
        toast({ title: "Preencha o assunto do e-mail", variant: "destructive" });
        return;
      }
      if (!emailHtml.trim() || emailHtml === "<p></p>") {
        toast({ title: "Escreva o conteúdo do e-mail", variant: "destructive" });
        return;
      }
    }

    const alvos = contatosFiltrados;
    if (alvos.length === 0) {
      toast({
        title: canal === "email"
          ? "Nenhum contato com e-mail encontrado para o filtro selecionado"
          : "Nenhum contato com telefone encontrado para o filtro selecionado",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const status = agendar && agendarPara ? "agendada" : "rascunho";

      const { data: campanha, error } = await supabase
        .from("campanhas")
        .insert({
          tenant_id: tenantId,
          nome: nome.trim(),
          mensagem:
            canal === "whatsapp"
              ? mensagem.trim()
              : canal === "whatsapp_cloud"
                ? `[Template: ${templateName}]`
                : (emailAssunto.trim() || ""),
          tipo_filtro: tipoFiltro as any,
          filtro_valor:
            tipoFiltro === "tag"
              ? tagsSelecionadas
              : tipoFiltro === "rfv"
                ? rfvSegmento !== "custom"
                  ? [`seg:${rfvSegmento}`]
                  : [`r:${rfvMinR}`, `f:${rfvMinF}`, `v:${rfvMinV}`]
                : [],
          status: status as any,
          agendada_para: agendar && agendarPara ? new Date(agendarPara).toISOString() : null,
          total_destinatarios: alvos.length,
          criado_por: profile?.id || "",
          tipo_midia: canal === "whatsapp" ? tipoMidia : "texto",
          midia_url: canal === "whatsapp" ? midiaUrl : null,
          atraso_tipo: atrasoTipo,
          canal,
          email_assunto: canal === "email" ? emailAssunto.trim() : null,
          email_html: canal === "email" ? emailHtml : null,
          email_preview: canal === "email" ? emailPreview.trim() : null,
          template_id: canal === "whatsapp_cloud" ? templateId : null,
          template_name: canal === "whatsapp_cloud" ? templateName : null,
          template_language: canal === "whatsapp_cloud" ? templateLanguage : null,
          template_components: canal === "whatsapp_cloud" ? templateComponents : [],
          template_variaveis: canal === "whatsapp_cloud" ? templateVariaveis : {},
          grupo_id: grupoId === "none" ? null : grupoId,
        } as any)
        .select()
        .single();

      if (error) throw error;

      const destinatarios = alvos.map((c) => ({
        campanha_id: (campanha as any).id,
        contato_id: c.id,
        telefone: canal === "email" ? (c.email || "") : (c.telefone || ""),
        tenant_id: tenantId,
      }));

      const { error: destError } = await supabase.from("campanha_destinatarios").insert(destinatarios as any);
      if (destError) throw destError;

      toast({ title: `Campanha criada com ${alvos.length} destinatários` });
      resetForm();
      setDialogOpen(false);
      fetchCampanhas();
    } catch (err: any) {
      toast({ title: "Erro ao criar campanha", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function enviarCampanha(campanhaId: string, campanhaCanal: Canal) {
    try {
      if (campanhaCanal === "email") {
        toast({
          title: "Envio de e-mail ainda não está disponível",
          description: "Configure o domínio de e-mail nas configurações para habilitar campanhas por e-mail.",
          variant: "destructive",
        });
        return;
      }
      const fnName = campanhaCanal === "whatsapp_cloud" ? "enviar-campanha-cloud" : "enviar-campanha";
      const { error } = await supabase.functions.invoke(fnName, {
        body: { campanha_id: campanhaId },
      });
      if (error) throw error;
      toast({ title: "Envio iniciado!" });
      setTimeout(fetchCampanhas, 2000);
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    }
  }

  async function cancelarCampanha(campanhaId: string) {
    await supabase.from("campanhas").update({ status: "cancelada" as any }).eq("id", campanhaId);
    toast({ title: "Campanha cancelada" });
    fetchCampanhas();
  }

  async function atualizarGrupoCampanha(campanhaId: string, novoGrupoId: string | null) {
    const { error } = await (supabase as any)
      .from("campanhas")
      .update({ grupo_id: novoGrupoId })
      .eq("id", campanhaId);
    if (error) {
      toast({ title: "Erro ao atualizar grupo", description: error.message, variant: "destructive" });
      return;
    }
    setEditGrupoCampanhaId(null);
    fetchCampanhas();
  }

  async function openDetail(campanhaId: string) {
    setDetailDialog(campanhaId);
    const { data } = await supabase
      .from("campanha_destinatarios")
      .select("*, contatos:contato_id(nome)")
      .eq("campanha_id", campanhaId);
    setDestinatariosDetail((data as any[]) || []);
  }

  // Realtime: refresh detail dialog when destinatarios change for the open campaign
  useEffect(() => {
    if (!detailDialog) return;
    const channel = supabase
      .channel(`camp-dest-${detailDialog}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campanha_destinatarios", filter: `campanha_id=eq.${detailDialog}` },
        () => { openDetail(detailDialog); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailDialog]);

  function resetForm() {
    setCanal("whatsapp");
    setNome("");
    setMensagem("");
    setEmailAssunto("");
    setEmailPreview("");
    setEmailHtml("");
    setTipoFiltro("todos");
    setTagsSelecionadas([]);
    setContatosSelecionados([]);
    setAgendar(false);
    setAgendarPara("");
    setTipoMidia("texto");
    setMidiaUrl(null);
    setMidiaFileName(null);
    setAtrasoTipo("medio");
    setRfvMinR("0");
    setRfvMinF("0");
    setRfvMinV("0");
    setRfvSegmento("custom");
    setTemplateId("");
    setTemplateName("");
    setTemplateLanguage("");
    setTemplateComponents([]);
    setTemplateVariaveis({});
    setOptInConfirmado(false);
    setGrupoId("none");
    setManualSearch("");
  }

  function toggleTag(tag: string) {
    setTagsSelecionadas((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function toggleContato(id: string) {
    setContatosSelecionados((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  const destStatusBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    pendente: { label: "Pendente", variant: "secondary" },
    enviado: { label: "Enviado", variant: "default" },
    falha: { label: "Falha", variant: "destructive" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" /> Campanhas
          </h1>
          <p className="text-muted-foreground text-sm">Envios em massa por WhatsApp ou E-mail</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGruposDialogOpen(true)}>
            <Tags className="h-4 w-4 mr-1" /> Grupos
          </Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova Campanha
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={filtroCanal} onValueChange={(v) => setFiltroCanal(v as any)}>
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-1">
              <MessageSquare className="h-3.5 w-3.5" /> Z-API
            </TabsTrigger>
            <TabsTrigger value="whatsapp_cloud" className="gap-1">
              <Sparkles className="h-3.5 w-3.5" /> Oficial
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-1">
              <Mail className="h-3.5 w-3.5" /> E-mail
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Tags className="h-4 w-4 text-muted-foreground" />
          <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Filtrar por grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os grupos</SelectItem>
              <SelectItem value="sem_grupo">Sem grupo</SelectItem>
              {grupos.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: g.cor || "#6B7280" }}
                    />
                    {g.nome}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AnaliticaGrupos
        tenantId={tenantId}
        campanhas={campanhas as any}
        grupos={grupos}
        onSelecionarGrupo={(id) => setFiltroGrupo(id)}
      />

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : campanhasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma campanha encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Atraso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Dest.</TableHead>
                  <TableHead className="text-center">Enviados</TableHead>
                  <TableHead className="text-center">Falhas</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campanhasFiltradas.map((c) => {
                  const sc = statusConfig[c.status] || { label: c.status, variant: "outline" as const };
                  const tm = c.tipo_midia || "texto";
                  const cn = (c.canal || "whatsapp") as Canal;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell>
                        {cn === "email" ? (
                          <Badge variant="outline" className="gap-1">
                            <Mail className="h-3 w-3" /> E-mail
                          </Badge>
                        ) : cn === "whatsapp_cloud" ? (
                          <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                            <Sparkles className="h-3 w-3" /> Oficial
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <MessageSquare className="h-3 w-3" /> Z-API
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-muted-foreground capitalize">
                          {cn === "email"
                            ? <><FileText className="h-4 w-4" /> html</>
                            : cn === "whatsapp_cloud"
                              ? <><Sparkles className="h-4 w-4" /> {c.template_name || "template"}</>
                              : <>{midiaIcon[tm]} {tm}</>
                          }
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {atrasoConfig[(c.atraso_tipo || "medio") as AtrasoTipo]?.label || "Médio"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sc.variant}>{sc.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{c.total_destinatarios}</TableCell>
                      <TableCell className="text-center">{c.total_enviados}</TableCell>
                      <TableCell className="text-center">{c.total_falhas}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(c.created_at), "dd/MM/yy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(c.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(c.status === "rascunho" || c.status === "agendada") && (
                            <Button size="sm" variant="ghost" onClick={() => enviarCampanha(c.id, cn)}>
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {c.status === "enviando" && (
                            <Button size="sm" variant="ghost" onClick={() => cancelarCampanha(c.id)}>
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* New Campaign Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
            <DialogDescription>Escolha o canal e configure sua campanha.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Canal de envio</Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setCanal("whatsapp")}
                  className={`border rounded-lg p-4 text-left transition ${
                    canal === "whatsapp" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-input hover:border-muted-foreground/50"
                  }`}
                >
                  <MessageSquare className={`h-6 w-6 mb-2 ${canal === "whatsapp" ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="font-medium">WhatsApp (Z-API)</div>
                  <div className="text-xs text-muted-foreground">Texto livre + mídia</div>
                </button>
                <button
                  type="button"
                  onClick={() => setCanal("whatsapp_cloud")}
                  className={`border rounded-lg p-4 text-left transition ${
                    canal === "whatsapp_cloud" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-input hover:border-muted-foreground/50"
                  }`}
                >
                  <Sparkles className={`h-6 w-6 mb-2 ${canal === "whatsapp_cloud" ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="font-medium flex items-center gap-1">
                    Oficial
                    <Badge className="bg-green-600 hover:bg-green-600 text-[10px] py-0 px-1">META</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">Templates aprovados</div>
                </button>
                <button
                  type="button"
                  onClick={() => setCanal("email")}
                  className={`border rounded-lg p-4 text-left transition ${
                    canal === "email" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-input hover:border-muted-foreground/50"
                  }`}
                >
                  <Mail className={`h-6 w-6 mb-2 ${canal === "email" ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="font-medium">E-mail</div>
                  <div className="text-xs text-muted-foreground">Editor rich-text</div>
                </button>
              </div>
              {canal === "whatsapp_cloud" && !cloudConectado && (
                <p className="text-xs text-destructive mt-2">
                  WhatsApp Oficial não está conectado. Vá em Configurações › WhatsApp Oficial.
                </p>
              )}
            </div>

            <div>
              <Label>Nome da campanha</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Promoção de Inverno" />
            </div>

            <div>
              <Label>Grupo (opcional)</Label>
              <Select value={grupoId} onValueChange={setGrupoId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem grupo</SelectItem>
                  {grupos.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.cor || "#6B7280" }} />
                        {g.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Use grupos para consolidar campanhas de uma mesma ação (ex.: Black Friday).
              </p>
            </div>

            {canal === "whatsapp" && (
              <>
                <div>
                  <Label>Tipo de mídia</Label>
                  <Select value={tipoMidia} onValueChange={(v) => { setTipoMidia(v); removeMidia(); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="texto">📝 Texto</SelectItem>
                      <SelectItem value="imagem">🖼️ Imagem</SelectItem>
                      <SelectItem value="audio">🎵 Áudio</SelectItem>
                      <SelectItem value="video">🎬 Vídeo</SelectItem>
                      <SelectItem value="documento">📄 Documento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {tipoMidia !== "texto" && (
                  <div>
                    <Label>Arquivo de mídia</Label>
                    {midiaUrl ? (
                      <div className="flex items-center gap-2 mt-1 p-2 border rounded bg-muted/30">
                        {midiaIcon[tipoMidia]}
                        <span className="text-sm truncate flex-1">{midiaFileName}</span>
                        <Button size="sm" variant="ghost" onClick={removeMidia}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={midiaAccept[tipoMidia]}
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {uploading ? "Enviando..." : "Selecionar arquivo"}
                        </Button>
                      </div>
                    )}
                    {midiaUrl && tipoMidia === "imagem" && (
                      <img src={midiaUrl} alt="Preview" className="mt-2 rounded max-h-40 object-contain" />
                    )}
                    {midiaUrl && tipoMidia === "video" && (
                      <video src={midiaUrl} controls className="mt-2 rounded max-h-40 w-full" />
                    )}
                    {midiaUrl && tipoMidia === "audio" && (
                      <audio src={midiaUrl} controls className="mt-2 w-full" />
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>{tipoMidia === "texto" ? "Mensagem" : "Legenda (opcional)"}</Label>
                    <InsertVariableButton
                      onInsert={(token) =>
                        insertAtCursor(mensagemRef.current, token, mensagem, setMensagem)
                      }
                    />
                  </div>
                  <Textarea
                    ref={mensagemRef}
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder="Olá {nome}, temos uma oferta especial..."
                    rows={3}
                  />
                </div>
              </>
            )}

            {canal === "whatsapp_cloud" && (
              <>
                <TemplateCampanhaPicker
                  templateId={templateId}
                  variaveis={templateVariaveis}
                  sampleContact={contatosFiltrados[0]}
                  onChange={(d) => {
                    setTemplateId(d.templateId);
                    setTemplateName(d.templateName);
                    setTemplateLanguage(d.templateLanguage);
                    setTemplateComponents(d.templateComponents);
                    setTemplateVariaveis(d.variaveis);
                  }}
                />
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-2">
                  <p className="text-amber-600 dark:text-amber-400 font-medium">
                    Importante sobre disparos via API Oficial
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>Cada conversa iniciada por template é tarifada pela Meta conforme a categoria.</li>
                    <li>Templates da categoria <strong>Marketing</strong> têm limite de frequência por destinatário.</li>
                    <li>O envio respeita os tiers de mensagens da sua conta WABA (250/1k/10k/100k por 24h).</li>
                  </ul>
                  <label className="flex items-start gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optInConfirmado}
                      onChange={(e) => setOptInConfirmado(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Confirmo que os destinatários deram <strong>opt-in</strong> para receber mensagens.</span>
                  </label>
                </div>
              </>
            )}

            {canal === "email" && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Assunto</Label>
                    <InsertVariableButton
                      onInsert={(token) =>
                        insertAtCursor(emailAssuntoRef.current, token, emailAssunto, setEmailAssunto)
                      }
                    />
                  </div>
                  <Input
                    ref={emailAssuntoRef}
                    value={emailAssunto}
                    onChange={(e) => setEmailAssunto(e.target.value)}
                    placeholder="Ex: Olá {nome}, novidades para você"
                  />
                </div>
                <div>
                  <Label>Pré-visualização (preview text)</Label>
                  <Input
                    value={emailPreview}
                    onChange={(e) => setEmailPreview(e.target.value)}
                    placeholder="Texto curto exibido na caixa de entrada antes de abrir o e-mail"
                  />
                </div>
                <div>
                  <Label>Conteúdo do e-mail</Label>
                  <EmailEditor
                    value={emailHtml}
                    onChange={setEmailHtml}
                    subject={emailAssunto}
                    previewText={emailPreview}
                    signatureHtml={tenantEmail.signature}
                    fromName={tenantEmail.fromName}
                  />
                </div>
              </>
            )}

            <div>
              <Label>Filtro de contatos</Label>
              <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos com {canal === "email" ? "e-mail" : "telefone"}</SelectItem>
                  <SelectItem value="tag">Por tag</SelectItem>
                  <SelectItem value="rfv">Por RFV</SelectItem>
                  <SelectItem value="manual">Seleção manual</SelectItem>
                </SelectContent>
              </Select>
              {canal === "email" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {totalContatosCanal} de {contatos.length} contato(s) têm e-mail cadastrado
                </p>
              )}
            </div>

            {tipoFiltro === "rfv" && (
              <div className="space-y-2 p-3 border rounded bg-muted/30">
                <div>
                  <Label className="text-xs">Segmento</Label>
                  <Select value={rfvSegmento} onValueChange={(v) => setRfvSegmento(v as "custom" | SegmentoKey)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Personalizado (R/F/V)</SelectItem>
                      {SEGMENTOS_ORDENADOS.filter((s) => s.key !== "sem_dados").map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.cor }} />
                            {s.nome} — {s.descricao.split("—")[0].trim()}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {rfvSegmento === "custom" && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <Label className="text-xs">R mínimo</Label>
                      <Select value={rfvMinR} onValueChange={setRfvMinR}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Qualquer</SelectItem>
                          {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={n.toString()}>≥ {n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">F mínimo</Label>
                      <Select value={rfvMinF} onValueChange={setRfvMinF}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Qualquer</SelectItem>
                          {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={n.toString()}>≥ {n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">V mínimo</Label>
                      <Select value={rfvMinV} onValueChange={setRfvMinV}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Qualquer</SelectItem>
                          {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={n.toString()}>≥ {n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tipoFiltro === "tag" && (
              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {allTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma tag encontrada nos contatos</p>
                  ) : (
                    allTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant={tagsSelecionadas.includes(tag) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            )}

            {tipoFiltro === "manual" && (() => {
              const elegiveis = contatos.filter(hasContact);
              const q = manualSearch.trim().toLowerCase();
              const visiveis = q
                ? elegiveis.filter((c) =>
                    (c.nome || "").toLowerCase().includes(q) ||
                    (c.telefone || "").toLowerCase().includes(q) ||
                    (c.email || "").toLowerCase().includes(q),
                  )
                : elegiveis;
              return (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={manualSearch}
                      onChange={(e) => setManualSearch(e.target.value)}
                      placeholder="Buscar por nome, telefone ou e-mail…"
                      className="pl-8"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {visiveis.length} de {elegiveis.length} exibido(s) · {contatosSelecionados.length} selecionado(s)
                    </span>
                    {contatosSelecionados.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() => setContatosSelecionados([])}
                      >
                        Limpar seleção
                      </Button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto border rounded p-2 space-y-1">
                    {visiveis.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-3">
                        Nenhum contato encontrado.
                      </p>
                    ) : (
                      visiveis.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={contatosSelecionados.includes(c.id)}
                            onChange={() => toggleContato(c.id)}
                          />
                          {c.nome} — {canal === "email" ? c.email : c.telefone}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}

            {(canal === "whatsapp" || canal === "whatsapp_cloud") && (
              <div>
                <Label>Atraso Inteligente</Label>
                <Select value={atrasoTipo} onValueChange={(v) => setAtrasoTipo(v as AtrasoTipo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(atrasoConfig) as [AtrasoTipo, { label: string; desc: string }][]).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        ⏱️ {cfg.label} ({cfg.desc})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Intervalo aleatório entre cada envio para reduzir risco de banimento
                </p>
              </div>
            )}

            <div className="bg-muted/50 rounded p-3 text-sm">
              <strong>{contatosFiltrados.length}</strong> contato(s) serão atingidos
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="agendar"
                checked={agendar}
                onChange={(e) => setAgendar(e.target.checked)}
              />
              <Label htmlFor="agendar" className="cursor-pointer">Agendar envio</Label>
            </div>

            {agendar && (
              <div>
                <Label>Data e hora</Label>
                <Input type="datetime-local" value={agendarPara} onChange={(e) => setAgendarPara(e.target.value)} />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {canal === "whatsapp_cloud" && templateId && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setTestarOpen(true)}
                className="sm:mr-auto"
              >
                <FlaskConical className="h-4 w-4 mr-1" /> Testar disparo
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={criarCampanha} disabled={submitting}>
              {agendar ? <><Clock className="h-4 w-4 mr-1" /> Agendar</> : <><Send className="h-4 w-4 mr-1" /> Criar Campanha</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GerenciarGruposDialog
        open={gruposDialogOpen}
        onOpenChange={setGruposDialogOpen}
        onChanged={() => { fetchGrupos(); fetchCampanhas(); }}
      />

      <TestarCampanhaCloudDialog
        open={testarOpen}
        onOpenChange={setTestarOpen}
        templateName={templateName}
        templateLanguage={templateLanguage}
        templateComponents={templateComponents}
        templateVariaveis={templateVariaveis}
      />

      {/* Detail Dialog */}
      <Dialog open={!!detailDialog} onOpenChange={() => setDetailDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Destinatários da Campanha</DialogTitle>
            <DialogDescription>Status individual de cada destinatário.</DialogDescription>
          </DialogHeader>

          {/* Funil de entrega (apenas quando há status_entrega — canal Oficial) */}
          {(() => {
            const total = destinatariosDetail.length;
            if (total === 0) return null;
            const sent = destinatariosDetail.filter((d) => d.status === "enviado").length;
            const delivered = destinatariosDetail.filter((d) => ["delivered", "read"].includes(d.status_entrega || "")).length;
            const read = destinatariosDetail.filter((d) => d.status_entrega === "read").length;
            const failed = destinatariosDetail.filter((d) => d.status === "falha" || d.status_entrega === "failed").length;
            const hasOficialMetrics = destinatariosDetail.some((d) => d.status_entrega || d.wa_message_id);
            if (!hasOficialMetrics) return null;
            return (
              <div className="grid grid-cols-4 gap-2 text-center mb-2">
                <div className="rounded-md border border-border p-2">
                  <div className="text-xs text-muted-foreground">Enviados</div>
                  <div className="text-lg font-semibold">{sent}</div>
                </div>
                <div className="rounded-md border border-border p-2">
                  <div className="text-xs text-muted-foreground">Entregues</div>
                  <div className="text-lg font-semibold">{delivered}</div>
                </div>
                <div className="rounded-md border border-border p-2">
                  <div className="text-xs text-muted-foreground">Lidos</div>
                  <div className="text-lg font-semibold">{read}</div>
                </div>
                <div className="rounded-md border border-border p-2">
                  <div className="text-xs text-muted-foreground">Falhas</div>
                  <div className="text-lg font-semibold text-destructive">{failed}</div>
                </div>
              </div>
            );
          })()}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead>Data/Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {destinatariosDetail.map((d) => {
                const ds = destStatusBadge[d.status] || { label: d.status, variant: "secondary" as const };
                const entrega = d.status_entrega as string | null;
                const entregaLabel: Record<string, string> = {
                  sent: "Enviado",
                  delivered: "Entregue",
                  read: "Lido",
                  failed: "Falha",
                };
                return (
                  <TableRow key={d.id}>
                    <TableCell>{(d.contatos as any)?.nome || "—"}</TableCell>
                    <TableCell className="text-sm">{d.telefone}</TableCell>
                    <TableCell>
                      <Badge variant={ds.variant}>{ds.label}</Badge>
                      {d.erro && <p className="text-xs text-destructive mt-1">{d.erro}</p>}
                    </TableCell>
                    <TableCell>
                      {entrega ? (
                        <Badge variant={entrega === "failed" ? "destructive" : entrega === "read" ? "default" : "outline"}>
                          {entregaLabel[entrega] || entrega}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.enviado_at ? new Date(d.enviado_at).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {destinatariosDetail.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">Nenhum destinatário</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
