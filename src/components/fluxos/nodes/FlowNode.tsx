import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_TYPE_CONFIG, type FlowNodeType } from "../nodeTypes";

interface FlowNodeData {
  label: string;
  nodeType: FlowNodeType;
  config?: Record<string, any>;
  [key: string]: unknown;
}

function FlowNode({ data, selected }: NodeProps) {
  const nodeData = data as FlowNodeData;
  const typeConfig = NODE_TYPE_CONFIG[nodeData.nodeType];
  if (!typeConfig) return null;

  const Icon = typeConfig.icon;
  const isCondicional = nodeData.nodeType === "condicional";
  const isGatilho = nodeData.nodeType === "gatilho";

  return (
    <div
      className="rounded-lg shadow-md min-w-[180px] max-w-[220px] border-2 transition-shadow"
      style={{
        borderColor: selected ? typeConfig.color : typeConfig.borderColor,
        backgroundColor: typeConfig.bgColor,
        boxShadow: selected ? `0 0 0 2px ${typeConfig.color}40` : undefined,
      }}
    >
      {!isGatilho && (
        <Handle
          type="target"
          position={Position.Top}
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
        <p className="text-[11px] text-muted-foreground truncate">
          {getPreview(nodeData)}
        </p>
      </div>

      {isCondicional ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="sim"
            className="!w-3 !h-3 !border-2 !bg-background"
            style={{ borderColor: "hsl(142, 71%, 45%)", left: "30%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="nao"
            className="!w-3 !h-3 !border-2 !bg-background"
            style={{ borderColor: "hsl(0, 84%, 60%)", left: "70%" }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !border-2 !bg-background"
          style={{ borderColor: typeConfig.color }}
        />
      )}
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
    default:
      return "Configurar...";
  }
}

export default memo(FlowNode);
