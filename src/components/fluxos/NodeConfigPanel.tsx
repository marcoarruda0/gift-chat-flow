import { type Node } from "@xyflow/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NODE_TYPE_CONFIG, type FlowNodeType } from "./nodeTypes";

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
              <Select value={config.tipo || "texto"} onValueChange={(v) => updateConfig("tipo", v)}>
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
            <div className="space-y-1.5">
              <Label className="text-xs">Corpo da mensagem</Label>
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
              <Label className="text-xs">Departamento</Label>
              <Input value={config.departamento || ""} onChange={(e) => updateConfig("departamento", e.target.value)} placeholder="Vendas, Suporte..." className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem</Label>
              <Textarea value={config.mensagem || ""} onChange={(e) => updateConfig("mensagem", e.target.value)} placeholder="Transferindo para um atendente..." className="text-sm min-h-[60px]" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
