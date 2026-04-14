import { type Node } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, Upload, FileAudio, FileVideo, Image as ImageIcon, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NODE_TYPE_CONFIG, type FlowNodeType } from "./nodeTypes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface NodeConfigPanelProps {
  node: Node;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onClose: () => void;
}

export function NodeConfigPanel({ node, onUpdate, onClose }: NodeConfigPanelProps) {
  const nodeType = (node.data as any).nodeType as FlowNodeType;
  const config = (node.data as any).config || {};
  const typeConfig = NODE_TYPE_CONFIG[nodeType];
  const Icon = typeConfig.icon;
  const { profile } = useAuth();

  const [departamentos, setDepartamentos] = useState<{ id: string; nome: string }[]>([]);
  const [membros, setMembros] = useState<{ id: string; nome: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ACCEPT_MAP: Record<string, string> = {
    imagem: ".jpg,.jpeg,.png,.gif,.webp",
    audio: ".mp3,.m4a,.ogg,.wav",
    video: ".mp4,.mov,.webm",
  };

  const handleMediaUpload = async (file: File) => {
    if (!profile?.tenant_id) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${profile.tenant_id}/fluxos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      updateConfig("media_url", urlData.publicUrl);
      toast.success("Mídia enviada!");
    } catch (err: any) {
      toast.error("Erro ao enviar mídia: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (nodeType === "transferir" && profile?.tenant_id) {
      supabase
        .from("departamentos")
        .select("id, nome")
        .eq("tenant_id", profile.tenant_id)
        .eq("ativo", true)
        .then(({ data }) => setDepartamentos(data || []));
      supabase
        .from("profiles")
        .select("id, nome")
        .eq("tenant_id", profile.tenant_id)
        .then(({ data }) => setMembros(data || []));
    }
  }, [nodeType, profile?.tenant_id]);

  const updateConfig = (key: string, value: any) => {
    onUpdate(node.id, {
      ...node.data,
      config: { ...config, [key]: value },
    });
  };

  const updateLabel = (label: string) => {
    onUpdate(node.id, { ...node.data, label });
  };

  return (
    <div className="w-72 border-l bg-card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b" style={{ backgroundColor: typeConfig.color + "10" }}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: typeConfig.color }} />
          <span className="text-sm font-semibold">{typeConfig.label}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Nome do nó</Label>
          <Input
            value={(node.data as any).label || ""}
            onChange={(e) => updateLabel(e.target.value)}
            placeholder={typeConfig.label}
            className="h-8 text-sm"
          />
        </div>

        {nodeType === "gatilho" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={config.tipo || "palavra_chave"} onValueChange={(v) => updateConfig("tipo", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="palavra_chave">Palavra-chave</SelectItem>
                  <SelectItem value="evento">Evento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto</Label>
              <Input value={config.texto || ""} onChange={(e) => updateConfig("texto", e.target.value)} placeholder="ex: oi, olá" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Modo</Label>
              <Select value={config.modo || "contem"} onValueChange={(v) => updateConfig("modo", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exato">Exato</SelectItem>
                  <SelectItem value="contem">Contém</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {nodeType === "conteudo" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de conteúdo</Label>
              <Select value={config.tipo || "texto"} onValueChange={(v) => {
                updateConfig("tipo", v);
                if (v === "texto" || v === "botoes") updateConfig("media_url", "");
              }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="texto">Texto</SelectItem>
                  <SelectItem value="imagem">Imagem</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="botoes">Botões</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {["imagem", "audio", "video"].includes(config.tipo || "") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Arquivo de mídia</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_MAP[config.tipo] || ""}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMediaUpload(file);
                  }}
                />
                {config.media_url ? (
                  <div className="space-y-2">
                    {config.tipo === "imagem" && (
                      <img src={config.media_url} alt="Preview" className="w-full rounded border max-h-32 object-cover" />
                    )}
                    {config.tipo === "audio" && (
                      <div className="flex items-center gap-2 p-2 rounded border bg-muted text-xs">
                        <FileAudio className="h-4 w-4 shrink-0" />
                        <span className="truncate">Áudio anexado</span>
                      </div>
                    )}
                    {config.tipo === "video" && (
                      <div className="flex items-center gap-2 p-2 rounded border bg-muted text-xs">
                        <FileVideo className="h-4 w-4 shrink-0" />
                        <span className="truncate">Vídeo anexado</span>
                      </div>
                    )}
                    <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => {
                      updateConfig("media_url", "");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}>
                      <Trash2 className="h-3 w-3 mr-1" /> Remover mídia
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {uploading ? "Enviando..." : "Enviar arquivo"}
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">{["imagem", "audio", "video"].includes(config.tipo || "") ? "Legenda (opcional)" : "Corpo da mensagem"}</Label>
              <Textarea value={config.corpo || ""} onChange={(e) => updateConfig("corpo", e.target.value)} placeholder="Use {{nome}} para variáveis" className="text-sm min-h-[80px]" />
            </div>
          </>
        )}

        {nodeType === "condicional" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Campo</Label>
              <Input value={config.campo || ""} onChange={(e) => updateConfig("campo", e.target.value)} placeholder="ex: tags, saldo" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Operador</Label>
              <Select value={config.operador || "igual"} onValueChange={(v) => updateConfig("operador", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="igual">Igual a</SelectItem>
                  <SelectItem value="diferente">Diferente de</SelectItem>
                  <SelectItem value="contem">Contém</SelectItem>
                  <SelectItem value="maior">Maior que</SelectItem>
                  <SelectItem value="menor">Menor que</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor</Label>
              <Input value={config.valor || ""} onChange={(e) => updateConfig("valor", e.target.value)} className="h-8 text-sm" />
            </div>
          </>
        )}

        {nodeType === "atraso" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Duração</Label>
              <Input type="number" value={config.duracao || ""} onChange={(e) => updateConfig("duracao", e.target.value)} placeholder="5" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unidade</Label>
              <Select value={config.unidade || "min"} onValueChange={(v) => updateConfig("unidade", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seg">Segundos</SelectItem>
                  <SelectItem value="min">Minutos</SelectItem>
                  <SelectItem value="hora">Horas</SelectItem>
                  <SelectItem value="dia">Dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {nodeType === "assistente_ia" && (
          <>
            {/* Bloco 1 — Mensagem Inicial */}
            <div className="space-y-2 border rounded-md p-2.5 bg-muted/30">
              <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Mensagem Inicial</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Destinatário</Label>
                <Select value={config.msg_inicial_tipo || "contato"} onValueChange={(v) => updateConfig("msg_inicial_tipo", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contato">Para o Contato</SelectItem>
                    <SelectItem value="ia">Para a IA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mensagem</Label>
                <Textarea
                  value={config.msg_inicial || ""}
                  onChange={(e) => {
                    if (e.target.value.length <= 1000) updateConfig("msg_inicial", e.target.value);
                  }}
                  placeholder="Use {{nome}}, {{plano}} para variáveis..."
                  className="text-sm min-h-[60px]"
                />
                <p className="text-[10px] text-muted-foreground text-right">{(config.msg_inicial || "").length}/1000</p>
              </div>
            </div>

            {/* Bloco 2 — Personalidade */}
            <div className="space-y-2 border rounded-md p-2.5 bg-muted/30">
              <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Personalidade</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Idioma</Label>
                <Select value={config.idioma || "pt"} onValueChange={(v) => updateConfig("idioma", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt">Português</SelectItem>
                    <SelectItem value="en">Inglês</SelectItem>
                    <SelectItem value="es">Espanhol</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Temperatura: {config.temperatura ?? 1}</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px] text-xs">
                        0 = respostas precisas e repetíveis. 2 = respostas criativas e variadas.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Slider
                  value={[config.temperatura ?? 1]}
                  onValueChange={([v]) => updateConfig("temperatura", v)}
                  min={0}
                  max={2}
                  step={0.1}
                  className="py-1"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instruções do assistente</Label>
                <Textarea
                  value={config.instrucoes || ""}
                  onChange={(e) => updateConfig("instrucoes", e.target.value)}
                  placeholder="Você é um assistente de vendas da loja X. Seja educado e objetivo..."
                  className="text-sm min-h-[80px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instruções individuais (contexto por contato)</Label>
                <Textarea
                  value={config.instrucoes_individuais || ""}
                  onChange={(e) => updateConfig("instrucoes_individuais", e.target.value)}
                  placeholder="Nome: {{nome}}&#10;Plano: {{plano}}&#10;Saldo: {{saldo_giftback}}"
                  className="text-sm min-h-[60px] font-mono"
                />
              </div>
            </div>

            {/* Bloco 3 — Comportamento */}
            <div className="space-y-2 border rounded-md p-2.5 bg-muted/30">
              <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Comportamento</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Modelo</Label>
                <Select value={config.modelo || "google/gemini-2.5-flash"} onValueChange={(v) => updateConfig("modelo", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                    <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                    <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mensagem de erro personalizada</Label>
                <Textarea
                  value={config.msg_erro || ""}
                  onChange={(e) => updateConfig("msg_erro", e.target.value)}
                  placeholder="Desculpe, não consegui processar sua mensagem. Tente novamente."
                  className="text-sm min-h-[50px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contexto geral (informações da empresa)</Label>
                <Textarea
                  value={config.contexto_geral || ""}
                  onChange={(e) => updateConfig("contexto_geral", e.target.value)}
                  placeholder="Nossa empresa vende roupas femininas. Horário de atendimento: 9h às 18h..."
                  className="text-sm min-h-[60px]"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Agrupar mensagens do contato</Label>
                  <Switch
                    checked={config.agrupar_msgs || false}
                    onCheckedChange={(v) => updateConfig("agrupar_msgs", v)}
                  />
                </div>
                {config.agrupar_msgs && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={config.agrupar_tempo || ""}
                      onChange={(e) => updateConfig("agrupar_tempo", Number(e.target.value))}
                      placeholder="10"
                      className="h-8 text-sm w-20"
                    />
                    <span className="text-xs text-muted-foreground">segundos</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bloco 4 — Condições de Saída */}
            <div className="space-y-2 border rounded-md p-2.5 bg-muted/30">
              <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Condições de Saída</p>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> Sucesso do assistente
                </Label>
                <Textarea
                  value={config.sucesso_descricao || ""}
                  onChange={(e) => updateConfig("sucesso_descricao", e.target.value)}
                  placeholder="Quando a dúvida do cliente for resolvida ou agendamento confirmado."
                  className="text-sm min-h-[50px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Interrupção do assistente
                </Label>
                <Textarea
                  value={config.interrupcao_descricao || ""}
                  onChange={(e) => updateConfig("interrupcao_descricao", e.target.value)}
                  placeholder="Quando o cliente pedir para falar com um humano ou insistir no problema."
                  className="text-sm min-h-[50px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Parar IA por inatividade</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={config.inatividade_tempo || ""}
                    onChange={(e) => updateConfig("inatividade_tempo", Number(e.target.value))}
                    placeholder="30"
                    className="h-8 text-sm w-20"
                  />
                  <Select value={config.inatividade_unidade || "min"} onValueChange={(v) => updateConfig("inatividade_unidade", v)}>
                    <SelectTrigger className="h-8 text-sm w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="min">Minutos</SelectItem>
                      <SelectItem value="hora">Horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Salvar resumo da interação em</Label>
                <Select value={config.salvar_resumo_campo || "nenhum"} onValueChange={(v) => updateConfig("salvar_resumo_campo", v === "nenhum" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nenhum</SelectItem>
                    <SelectItem value="notas">Notas do contato</SelectItem>
                    <SelectItem value="campo_personalizado">Campo personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {nodeType === "tag" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Ação</Label>
              <Select value={config.acao || "adicionar"} onValueChange={(v) => updateConfig("acao", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="adicionar">Adicionar</SelectItem>
                  <SelectItem value="remover">Remover</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tag</Label>
              <Input value={config.tag || ""} onChange={(e) => updateConfig("tag", e.target.value)} placeholder="Nome da tag" className="h-8 text-sm" />
            </div>
          </>
        )}

        {nodeType === "webhook" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">URL</Label>
              <Input value={config.url || ""} onChange={(e) => updateConfig("url", e.target.value)} placeholder="https://..." className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Método</Label>
              <Select value={config.metodo || "POST"} onValueChange={(v) => updateConfig("metodo", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Body (JSON)</Label>
              <Textarea value={config.body || ""} onChange={(e) => updateConfig("body", e.target.value)} placeholder='{"nome": "{{nome}}"}' className="text-sm min-h-[60px] font-mono" />
            </div>
          </>
        )}

        {nodeType === "transferir" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de transferência</Label>
              <Select value={config.tipo_transferencia || "departamento"} onValueChange={(v) => updateConfig("tipo_transferencia", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="departamento">Departamento</SelectItem>
                  <SelectItem value="membro">Membro da equipe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(config.tipo_transferencia || "departamento") === "departamento" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Departamento</Label>
                <Select value={config.departamento_id || ""} onValueChange={(v) => updateConfig("departamento_id", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {departamentos.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Membro</Label>
                <Select value={config.membro_id || ""} onValueChange={(v) => updateConfig("membro_id", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {membros.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.nome || "Sem nome"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem</Label>
              <Textarea value={config.mensagem || ""} onChange={(e) => updateConfig("mensagem", e.target.value)} placeholder="Transferindo para um atendente..." className="text-sm min-h-[60px]" />
            </div>
          </>
        )}

        {nodeType === "consultar_saldo" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Variável de saída</Label>
            <Input value={config.variavel || ""} onChange={(e) => updateConfig("variavel", e.target.value)} placeholder="{{saldo_giftback}}" className="h-8 text-sm font-mono" />
          </div>
        )}

        {nodeType === "notificar_credito" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Canal</Label>
              <Select value={config.canal || "whatsapp"} onValueChange={(v) => updateConfig("canal", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Template da mensagem</Label>
              <Textarea value={config.template || ""} onChange={(e) => updateConfig("template", e.target.value)} placeholder="Você ganhou R$ {{valor}} de crédito! Válido até {{validade}}." className="text-sm min-h-[80px]" />
            </div>
          </>
        )}

        {nodeType === "lembrete_validade" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Dias antes da expiração</Label>
              <Input type="number" value={config.dias_antes || ""} onChange={(e) => updateConfig("dias_antes", e.target.value)} placeholder="3" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Template da mensagem</Label>
              <Textarea value={config.template || ""} onChange={(e) => updateConfig("template", e.target.value)} placeholder="Seu crédito de R$ {{valor}} expira em {{dias}} dias!" className="text-sm min-h-[80px]" />
            </div>
          </>
        )}

        {nodeType === "menu" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de menu</Label>
              <Select value={config.tipo_menu || "lista"} onValueChange={(v) => {
                updateConfig("tipo_menu", v);
                // If switching to buttons and more than 3 options, trim
                if (v === "botoes" && (config.opcoes || []).length > 4) {
                  updateConfig("opcoes", (config.opcoes || []).slice(0, 4));
                }
              }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lista">📋 Lista numerada</SelectItem>
                  <SelectItem value="botoes">🔘 Botões interativos</SelectItem>
                </SelectContent>
              </Select>
              {(config.tipo_menu === "botoes") && (
                <p className="text-[10px] text-muted-foreground">Máximo 4 opções</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto da pergunta</Label>
              <Textarea
                value={config.pergunta || ""}
                onChange={(e) => updateConfig("pergunta", e.target.value)}
                placeholder="Ex: Para qual setor você deseja falar?"
                className="text-sm min-h-[80px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Opções do menu</Label>
              <div className="space-y-2">
                {(config.opcoes || []).map((opcao: string, i: number) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                    <Input
                      value={opcao}
                      onChange={(e) => {
                        const novas = [...(config.opcoes || [])];
                        novas[i] = e.target.value;
                        updateConfig("opcoes", novas);
                      }}
                      placeholder={`Opção ${i + 1}`}
                      className="h-8 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        const novas = (config.opcoes || []).filter((_: any, idx: number) => idx !== i);
                        updateConfig("opcoes", novas);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
                {(config.opcoes || []).length < (config.tipo_menu === "botoes" ? 4 : 10) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => updateConfig("opcoes", [...(config.opcoes || []), ""])}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Adicionar opção
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto fallback (não respondeu)</Label>
              <Textarea
                value={config.fallback_texto || ""}
                onChange={(e) => updateConfig("fallback_texto", e.target.value)}
                placeholder="Desculpe, não entendi sua resposta..."
                className="text-sm min-h-[60px]"
              />
            </div>
          </>
        )}

        {nodeType === "auto_off" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Ação</Label>
              <Select value={config.acao || "desligar"} onValueChange={(v) => updateConfig("acao", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desligar">⏸️ Desligar resposta automática</SelectItem>
                  <SelectItem value="religar">⚡ Religar resposta automática</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {(config.acao || "desligar") === "religar"
                  ? "A resposta automática será reativada para este contato."
                  : "A resposta automática será pausada para este contato pelo tempo definido abaixo."}
              </p>
            </div>
            {(config.acao || "desligar") === "desligar" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Formato</Label>
                  <Select value={config.formato || "hms"} onValueChange={(v) => updateConfig("formato", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hms">⏱️ Horas : Min : Seg</SelectItem>
                      <SelectItem value="dias">📅 Dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(config.formato || "hms") === "hms" ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Horas</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={config.horas ?? 0}
                        onChange={(e) => updateConfig("horas", parseInt(e.target.value) || 0)}
                        className="h-8 text-sm text-center"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Minutos</Label>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={config.minutos ?? 5}
                        onChange={(e) => updateConfig("minutos", parseInt(e.target.value) || 0)}
                        className="h-8 text-sm text-center"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Segundos</Label>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={config.segundos ?? 0}
                        onChange={(e) => updateConfig("segundos", parseInt(e.target.value) || 0)}
                        className="h-8 text-sm text-center"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Quantidade de dias</Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={config.dias ?? 1}
                      onChange={(e) => updateConfig("dias", parseInt(e.target.value) || 1)}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {nodeType === "gerenciar_conversa" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Ação</Label>
              <Select value={config.acao || "fechar"} onValueChange={(v) => updateConfig("acao", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fechar">🔒 Fechar conversa</SelectItem>
                  <SelectItem value="abrir">🔓 Abrir conversa</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {config.acao === "abrir"
                  ? "A conversa será reaberta no módulo Conversas."
                  : "A conversa será marcada como fechada no módulo Conversas."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo (opcional)</Label>
              <Textarea
                value={config.motivo || ""}
                onChange={(e) => updateConfig("motivo", e.target.value)}
                placeholder="Ex: Atendimento finalizado com sucesso"
                className="text-sm min-h-[60px]"
              />
            </div>
          </>
        )}

        {nodeType === "triagem_ia" && (
          <>
            {/* Bloco 1 — Boas-vindas */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">💬 Mensagem de Boas-vindas</Label>
              <p className="text-[10px] text-muted-foreground">
                Enviada ao contato antes da classificação. Use {"{{nome}}"} para personalizar.
              </p>
              <Textarea
                value={config.saudacao || ""}
                onChange={(e) => updateConfig("saudacao", e.target.value)}
                placeholder="Olá {{nome}}! Seja bem-vindo(a). Como posso te ajudar?"
                className="text-sm min-h-[70px]"
              />
            </div>

            <div className="h-px bg-border" />

            {/* Bloco 2 — Setores / Intenções */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">🏢 Setores / Intenções</Label>
              <p className="text-[10px] text-muted-foreground">
                Cada setor gera uma saída no nó. A IA classificará a mensagem do contato e encaminhará para o setor correspondente.
              </p>
              <div className="space-y-2">
                {(config.setores || []).map((setor: { nome: string; descricao: string }, i: number) => (
                  <div key={i} className="rounded-md border p-2 space-y-1.5 bg-muted/30">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                      <Input
                        value={setor.nome}
                        onChange={(e) => {
                          const novos = [...(config.setores || [])];
                          novos[i] = { ...novos[i], nome: e.target.value };
                          updateConfig("setores", novos);
                        }}
                        placeholder="Nome do setor (ex: Vendas)"
                        className="h-7 text-sm font-medium"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => {
                          const novos = (config.setores || []).filter((_: any, idx: number) => idx !== i);
                          updateConfig("setores", novos);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <Textarea
                      value={setor.descricao}
                      onChange={(e) => {
                        const novos = [...(config.setores || [])];
                        novos[i] = { ...novos[i], descricao: e.target.value };
                        updateConfig("setores", novos);
                      }}
                      placeholder="Descreva a intenção (ex: Cliente quer comprar, saber preço, disponibilidade...)"
                      className="text-xs min-h-[50px]"
                    />
                  </div>
                ))}
                {(config.setores || []).length < 8 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => updateConfig("setores", [...(config.setores || []), { nome: "", descricao: "" }])}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Adicionar setor
                  </Button>
                )}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Bloco 3 — Comportamento IA */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">🤖 Comportamento da IA</Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Modelo</Label>
              <Select value={config.modelo || "google/gemini-2.5-flash"} onValueChange={(v) => updateConfig("modelo", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                  <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                  <SelectItem value="google/gemini-3-flash-preview">Gemini 3 Flash</SelectItem>
                  <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                  <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Instruções extras de classificação</Label>
              <Textarea
                value={config.instrucoes_classificacao || ""}
                onChange={(e) => updateConfig("instrucoes_classificacao", e.target.value)}
                placeholder="Ex: Se o cliente mencionar troca ou devolução, encaminhe para Suporte. Se mencionar preço, encaminhe para Vendas."
                className="text-sm min-h-[70px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Máximo de tentativas</Label>
              <p className="text-[10px] text-muted-foreground">
                Quantas vezes a IA tenta classificar antes de usar o fallback.
              </p>
              <Input
                type="number"
                min={1}
                max={5}
                value={config.max_tentativas ?? 2}
                onChange={(e) => updateConfig("max_tentativas", parseInt(e.target.value) || 2)}
                className="h-8 text-sm w-20"
              />
            </div>

            <div className="h-px bg-border" />

            {/* Bloco 4 — Fallback */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">⚠️ Mensagem Fallback</Label>
              <p className="text-[10px] text-muted-foreground">
                Enviada quando a IA não consegue identificar o setor após as tentativas.
              </p>
              <Textarea
                value={config.msg_fallback || ""}
                onChange={(e) => updateConfig("msg_fallback", e.target.value)}
                placeholder="Desculpe, não consegui entender seu pedido. Vou transferir para um atendente."
                className="text-sm min-h-[60px]"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
