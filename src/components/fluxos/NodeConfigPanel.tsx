import { type Node } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, Upload, FileAudio, FileVideo, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
            <div className="space-y-1.5">
              <Label className="text-xs">Prompt</Label>
              <Textarea value={config.prompt || ""} onChange={(e) => updateConfig("prompt", e.target.value)} placeholder="Instruções para o assistente..." className="text-sm min-h-[80px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Máximo de turnos</Label>
              <Input type="number" value={config.max_turnos || ""} onChange={(e) => updateConfig("max_turnos", e.target.value)} placeholder="5" className="h-8 text-sm" />
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
                if (v === "botoes" && (config.opcoes || []).length > 3) {
                  updateConfig("opcoes", (config.opcoes || []).slice(0, 3));
                }
              }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lista">📋 Lista numerada</SelectItem>
                  <SelectItem value="botoes">🔘 Botões interativos</SelectItem>
                </SelectContent>
              </Select>
              {(config.tipo_menu === "botoes") && (
                <p className="text-[10px] text-muted-foreground">Máximo 3 opções (limite do WhatsApp)</p>
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
                {(config.opcoes || []).length < (config.tipo_menu === "botoes" ? 3 : 10) && (
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
      </div>
    </div>
  );
}
