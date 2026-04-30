"use client";
import { useCallback, useEffect, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import { api } from "@/lib/api";
import NodePalette, { NODE_DEFS } from "./NodePalette";
import PropertiesPanel from "./PropertiesPanel";
import { customNodeTypes } from "./nodes";

function Builder({ botId }: { botId: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<Node | null>(null);
  const [saved, setSaved] = useState(false);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    (async () => {
      const flow = await api.getFlow(botId);
      setNodes(flow.nodes || []);
      setEdges(flow.edges || []);
    })();
  }, [botId]);

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes((n) => applyNodeChanges(c, n)), []);
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges((e) => applyEdgeChanges(c, e)), []);
  const onConnect = useCallback((c: Connection) => setEdges((e) => addEdge({ ...c, animated: true }, e)), []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;
      const def = NODE_DEFS.find((d) => d.type === type);
      if (!def) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = `${type}_${Date.now()}`;
      const newNode: Node = {
        id,
        type,
        position,
        data: { label: def.label, ...def.defaults },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const updateSelected = (data: any) => {
    if (!selected) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, ...data } } : n))
    );
    setSelected({ ...selected, data: { ...selected.data, ...data } });
  };

  const handleSave = async () => {
    await api.saveFlow(botId, { nodes, edges, variables: {}, published: true });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleDeleteSelected = () => {
    if (!selected) return;
    if (selected.type === "initialize") return;
    setNodes((nds) => nds.filter((n) => n.id !== selected.id));
    setEdges((eds) => eds.filter((e) => e.source !== selected.id && e.target !== selected.id));
    setSelected(null);
  };

  return (
    <div className="h-full flex">
      <NodePalette />
      <div className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelected(n)}
          onPaneClick={() => setSelected(null)}
          nodeTypes={customNodeTypes}
          fitView
        >
          <Background color="#334155" />
          <Controls />
        </ReactFlow>
        <button
          onClick={handleSave}
          className="absolute top-3 right-3 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded text-sm shadow-lg z-10"
        >
          {saved ? "Saved ✓" : "Save & Publish"}
        </button>
      </div>
      <PropertiesPanel
        node={selected}
        onChange={updateSelected}
        onDelete={handleDeleteSelected}
      />
    </div>
  );
}

export default function FlowBuilder({ botId }: { botId: string }) {
  return (
    <ReactFlowProvider>
      <Builder botId={botId} />
    </ReactFlowProvider>
  );
}
