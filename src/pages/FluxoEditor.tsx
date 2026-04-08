import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Play, Square } from "lucide-react";
import { NodePalette } from "@/components/fluxos/NodePalette";
import { NodeConfigPanel } from "@/components/fluxos/NodeConfigPanel";
import FlowNode from "@/components/fluxos/nodes/FlowNode";
import { type FlowNodeType } from "@/components/fluxos/nodeTypes";

const nodeTypes = {
  flowNode: FlowNode,
};

function FluxoEditorInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [nome, setNome] = useState("Novo Fluxo");
  const [status, setStatus] = useState("rascunho");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("fluxos")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast({ title: "Fluxo não encontrado", variant: "destructive" });
          navigate("/fluxos");
          return;
        }
        setNome(data.nome);
        setStatus(data.status);
        const nodesData = (data.nodes_json as any[]) || [];
        const edgesData = (data.edges_json as any[]) || [];
        setNodes(nodesData as Node[]);
        setEdges(edgesData as Edge[]);
        setLoaded(true);
      });
  }, [id]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "hsl(207, 62%, 48%)" } }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/reactflow") as FlowNodeType;
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type: "flowNode",
        position,
        data: {
          label: "",
          nodeType: type,
          config: {},
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes]
  );

  const updateNodeData = useCallback(
    (nodeId: string, newData: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: newData } : n))
      );
      setSelectedNode((prev) =>
        prev && prev.id === nodeId ? { ...prev, data: newData } : prev
      );
    },
    [setNodes]
  );

  const salvar = async () => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase
      .from("fluxos")
      .update({
        nome,
        nodes_json: nodes as any,
        edges_json: edges as any,
      })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Fluxo salvo!" });
    }
  };

  const toggleStatus = async () => {
    if (!id) return;
    const newStatus = status === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase.from("fluxos").update({ status: newStatus }).eq("id", id);
    if (!error) {
      setStatus(newStatus);
      toast({ title: `Fluxo ${newStatus === "ativo" ? "ativado" : "desativado"}` });
    }
  };

  const statusLabel = status === "ativo" ? "Ativo" : status === "inativo" ? "Inativo" : "Rascunho";
  const statusVariant = status === "ativo" ? "default" : status === "inativo" ? "outline" : "secondary";

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b bg-card px-4 py-2 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fluxos")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="h-8 w-64 text-sm font-semibold border-none shadow-none focus-visible:ring-0 px-1"
        />
        <Badge variant={statusVariant as any}>{statusLabel}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleStatus}>
            {status === "ativo" ? <Square className="h-3.5 w-3.5 mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
            {status === "ativo" ? "Desativar" : "Ativar"}
          </Button>
          <Button size="sm" onClick={salvar} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette onDragStart={() => {}} />

        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            className="bg-muted/30"
          >
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              className="!bg-card !border"
            />
            <Background gap={20} size={1} />
          </ReactFlow>
        </div>

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={updateNodeData}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function FluxoEditor() {
  return (
    <ReactFlowProvider>
      <FluxoEditorInner />
    </ReactFlowProvider>
  );
}
