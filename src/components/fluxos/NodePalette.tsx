import { NODE_TYPE_CONFIG, type FlowNodeType } from "./nodeTypes";

interface NodePaletteProps {
  onDragStart: (type: FlowNodeType) => void;
}

export function NodePalette({ onDragStart }: NodePaletteProps) {
  return (
    <div className="w-56 border-r bg-card p-3 space-y-2 overflow-y-auto">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Nós
      </h3>
      {(Object.entries(NODE_TYPE_CONFIG) as [FlowNodeType, typeof NODE_TYPE_CONFIG[FlowNodeType]][]).map(
        ([type, config]) => {
          const Icon = config.icon;
          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/reactflow", type);
                e.dataTransfer.effectAllowed = "move";
                onDragStart(type);
              }}
              className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-grab hover:shadow-sm transition-shadow active:cursor-grabbing"
              style={{ borderColor: config.borderColor + "60" }}
            >
              <div
                className="flex h-7 w-7 items-center justify-center rounded"
                style={{ backgroundColor: config.color }}
              >
                <Icon className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-medium">{config.label}</span>
            </div>
          );
        }
      )}
    </div>
  );
}
