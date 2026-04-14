import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_TYPE_CONFIG, type FlowNodeType } from "../nodeTypes";
import { Copy, Trash2 } from "lucide-react";

interface FlowNodeData {
  label: string;
  nodeType: FlowNodeType;
  config?: Record<string, any>;
  onDuplicate?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  [key: string]: unknown;
}

function FlowNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FlowNodeData;
  const typeConfig = NODE_TYPE_CONFIG[nodeData.nodeType];
  if (!typeConfig) return null;

  const Icon = typeConfig.icon;
  const isCondicional = nodeData.nodeType === "condicional";
  const isGatilho = nodeData.nodeType === "gatilho";
  const isMenu = nodeData.nodeType === "menu";
  const opcoes: string[] = (nodeData.config?.opcoes as string[]) || [];

  return (
    <div className="relative">
      {/* Toolbar flutuante */}
      {selected && (
        <div className="absolute -top-8 right-0 flex items-center gap-1 bg-card border rounded-md shadow-lg p-0.5 z-10">
          <button
            className="p-1 rounded hover:bg-accent transition-colors"
            title="Duplicar"
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onDuplicate?.(id);
            }}
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            className="p-1 rounded hover:bg-destructive/20 transition-colors"
            title="Excluir"
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onDelete?.(id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </div>
      )}

      <div
        className="rounded-lg shadow-md min-w-[180px] max-w-[220px] border-2 transition-shadow"
        style={{
          borderColor: selected ? typeConfig.color : typeConfig.borderColor,
          backgroundColor: typeConfig.bgColor,
          boxShadow: selected ? `0 0 0 2px ${typeConfig.color}40` : undefined,
        }}
      >
        {/* Target handle (entrada) à esquerda */}
        {!isGatilho && (
          <Handle
            type="target"
            position={Position.Left}
            className="!w-3 !h-3 !border-2 !bg-background"
            style={{ borderColor: typeConfig.color }}
          />
        )}

        <div
          className="flex items-center gap-2 px-3 py-2 rounded-t-md"
          style={{ backgroundColor: typeConfig.color }}
        >
          <Icon className="h-4 w-4 text-white shrink-0" />
          <span className="text-xs font-semibold text-white truncate">
            {nodeData.label || typeConfig.label}
          </span>
        </div>

        <div className="px-3 py-2">
          {isMenu && (
            <span className="inline-block text-[9px] font-medium px-1.5 py-0.5 rounded mb-1" style={{
              backgroundColor: typeConfig.color + "20",
              color: typeConfig.color,
            }}>
              {nodeData.config?.tipo_menu === "botoes" ? "🔘 Botões" : "📋 Lista"}
            </span>
          )}
          <p className="text-[11px] text-muted-foreground truncate">
            {getPreview(nodeData)}
          </p>
        </div>

        {isMenu && opcoes.length > 0 && (
          <div className="px-3 pb-2 space-y-1">
            {opcoes.map((op, i) => (
              <div
                key={i}
                className="text-[10px] px-2 py-0.5 rounded border truncate"
                style={{ borderColor: typeConfig.color + "60", color: typeConfig.color }}
              >
                {i + 1}. {op}
              </div>
            ))}
          </div>
        )}

        {/* Source handles (saída) à direita */}
        {isMenu ? (
          <>
            {opcoes.map((_, i) => (
              <Handle
                key={`opcao_${i}`}
                type="source"
                position={Position.Right}
                id={`opcao_${i}`}
                className="!w-3 !h-3 !border-2 !bg-background"
                style={{
                  borderColor: typeConfig.color,
                  top: `${((i + 1) / (opcoes.length + 2)) * 100}%`,
                }}
              />
            ))}
            <Handle
              type="source"
              position={Position.Right}
              id="fallback"
              className="!w-3 !h-3 !border-2 !bg-background"
              style={{
                borderColor: "hsl(0, 84%, 60%)",
                top: `${((opcoes.length + 1) / (opcoes.length + 2)) * 100}%`,
              }}
            />
          </>
        ) : isCondicional ? (
          <>
            <Handle
              type="source"
              position={Position.Right}
              id="sim"
              className="!w-3 !h-3 !border-2 !bg-background"
              style={{ borderColor: "hsl(142, 71%, 45%)", top: "35%" }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id="nao"
              className="!w-3 !h-3 !border-2 !bg-background"
              style={{ borderColor: "hsl(0, 84%, 60%)", top: "65%" }}
            />
          </>
        ) : (
          <Handle
            type="source"
            position={Position.Right}
            className="!w-3 !h-3 !border-2 !bg-background"
            style={{ borderColor: typeConfig.color }}
          />
        )}
      </div>
    </div>
  );
}

function getPreview(data: FlowNodeData): string {
  const cfg = data.config || {};
  switch (data.nodeType) {
    case "gatilho":
      return cfg.texto ? `"${cfg.texto}"` : "Clique para configurar";
    case "conteudo":
      return cfg.corpo ? cfg.corpo.substring(0, 40) : "Mensagem...";
    case "condicional":
      return cfg.campo ? `${cfg.campo} ${cfg.operador} ${cfg.valor}` : "Sim / Não";
    case "atraso":
      return cfg.duracao ? `${cfg.duracao} ${cfg.unidade || "min"}` : "Aguardar...";
    case "assistente_ia":
      return cfg.prompt ? cfg.prompt.substring(0, 40) : "Prompt IA...";
    case "tag":
      return cfg.tag ? `${cfg.acao || "Adicionar"}: ${cfg.tag}` : "Tag...";
    case "webhook":
      return cfg.url ? cfg.url.substring(0, 40) : "URL...";
    case "transferir":
      return cfg.departamento || "Departamento...";
    case "consultar_saldo":
      return `Saldo → ${cfg.variavel || "{{saldo_giftback}}"}`;
    case "notificar_credito":
      return cfg.template ? cfg.template.substring(0, 40) : "Template crédito...";
    case "lembrete_validade":
      return cfg.dias_antes ? `${cfg.dias_antes} dias antes` : "Dias antes...";
    case "menu":
      return cfg.pergunta ? cfg.pergunta.substring(0, 40) : "Pergunta do menu...";
    default:
      return "Configurar...";
  }
}

export default memo(FlowNode);
