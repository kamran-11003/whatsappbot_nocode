"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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
import NodeDetailView from "./NodeDetailView";
import Toolbar from "./Toolbar";
import BottomDrawer from "./BottomDrawer";
import AssistantPanel from "./AssistantPanel";
import { customNodeTypes } from "./nodes";
import { useRunStore } from "@/lib/runStore";

/** Approx Tailwind palette → hex for the minimap node dots. */
const TW_HEX: Record<string, string> = {
  "bg-blue-600": "2563eb", "bg-yellow-600": "ca8a04", "bg-purple-600": "9333ea",
  "bg-rose-600": "e11d48", "bg-teal-600": "0d9488", "bg-indigo-600": "4f46e5",
  "bg-amber-600": "d97706", "bg-cyan-700": "0e7490", "bg-slate-600": "475569",
  "bg-fuchsia-600": "c026d3", "bg-orange-600": "ea580c", "bg-zinc-700": "3f3f46",
  "bg-emerald-700": "047857", "bg-violet-700": "6d28d9",
};
function tailwindToHex(c: string): string {
  return TW_HEX[c] || "475569";
}

/** Lay out a flow left-to-right by walking edges from `initialize`. */
function autoLayoutHorizontal(nodes: Node[], edges: Edge[]): Node[] {
  if (!nodes.length) return nodes;
  const COL = 260;
  const ROW = 140;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const depth = new Map<string, number>();
  const start = nodes.find((n) => n.type === "initialize") || nodes[0];
  const queue: Array<[string, number]> = [[start.id, 0]];
  while (queue.length) {
    const [id, d] = queue.shift()!;
    if (depth.has(id) && depth.get(id)! >= d) continue;
    depth.set(id, d);
    for (const nx of adj.get(id) || []) queue.push([nx, d + 1]);
  }
  // Anything unreachable goes after the deepest column.
  const maxDepth = Math.max(0, ...Array.from(depth.values()));
  let orphanCol = maxDepth + 1;
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, orphanCol++);
  // Group by column to compute row positions.
  const cols = new Map<number, string[]>();
  for (const n of nodes) {
    const d = depth.get(n.id)!;
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(n.id);
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of cols) {
    ids.forEach((id, i) => {
      positions.set(id, { x: 80 + d * COL, y: 100 + i * ROW });
    });
  }
  return nodes.map((n) => ({ ...n, position: positions.get(n.id) || n.position }));
}

function Builder({ botId, botName }: { botId: string; botName: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [openNode, setOpenNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const dirty = useRunStore((s) => s.dirty);
  const setDirty = useRunStore((s) => s.setDirty);
  const setRunning = useRunStore((s) => s.setRunning);
  const setResult = useRunStore((s) => s.setResult);
  const openDrawer = useRunStore((s) => s.openDrawer);
  const { screenToFlowPosition } = useReactFlow();
  const initial = useRef(false);

  // Derive channel from the initialize node so palette + assistant are channel-aware
  const channel: string =
    (nodes.find((n) => n.type === "initialize")?.data?.channel as string) || "whatsapp";

  // Load flow on bot change
  useEffect(() => {
    initial.current = false;
    (async () => {
      const flow = await api.getFlow(botId);
      const loadedNodes: Node[] = flow.nodes || [];
      const loadedEdges: Edge[] = flow.edges || [];
      // If the saved layout looks vertical (columns are narrow but rows tall),
      // auto-rewrite it to horizontal so legacy flows look right with the new
      // left/right handles.
      const xs = loadedNodes.map((n) => n.position?.x ?? 0);
      const ys = loadedNodes.map((n) => n.position?.y ?? 0);
      const xRange = Math.max(...xs, 0) - Math.min(...xs, 0);
      const yRange = Math.max(...ys, 0) - Math.min(...ys, 0);
      const looksVertical = loadedNodes.length > 2 && yRange > xRange * 1.4;
      setNodes(looksVertical ? autoLayoutHorizontal(loadedNodes, loadedEdges) : loadedNodes);
      setEdges(loadedEdges.map((e) => ({ ...e, type: e.type || "smoothstep", animated: e.animated ?? true })));
      setDirty(false);
      initial.current = true;
    })();
  }, [botId, setDirty]);

  // Mark dirty on changes (skip first load)
  useEffect(() => {
    if (initial.current) setDirty(true);
  }, [nodes, edges, setDirty]);

  const onNodesChange = useCallback(
    (c: NodeChange[]) => setNodes((n) => applyNodeChanges(c, n)),
    []
  );
  const onEdgesChange = useCallback(
    (c: EdgeChange[]) => setEdges((e) => applyEdgeChanges(c, e)),
    []
  );
  const onConnect = useCallback(
    (c: Connection) => setEdges((e) => addEdge({ ...c, animated: true, type: "smoothstep" }, e)),
    []
  );

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

  const updateNodeData = useCallback(
    (nodeId: string, data: any) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
      );
      setOpenNode((cur) =>
        cur && cur.id === nodeId ? { ...cur, data: { ...cur.data, ...data } } : cur
      );
    },
    []
  );

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.saveFlow(botId, { nodes, edges, variables: {}, published: true });
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }, [botId, nodes, edges, setDirty]);

  const handleAutoLayout = useCallback(() => {
    setNodes((nds) => autoLayoutHorizontal(nds, edges));
    setDirty(true);
  }, [edges, setDirty]);

  const handleExport = useCallback(() => {
    const payload = { nodes, edges, variables: {}, exported_at: new Date().toISOString(), bot_name: botName };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(botName || "flow").replace(/[^a-z0-9_-]+/gi, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, botName]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        if (!Array.isArray(obj?.nodes) || !Array.isArray(obj?.edges)) {
          alert("Invalid flow file: expected { nodes: [], edges: [] }");
          return;
        }
        if (!confirm(`Replace current flow with ${obj.nodes.length} nodes / ${obj.edges.length} edges?`)) return;
        setNodes(obj.nodes);
        setEdges(obj.edges);
        setDirty(true);
      } catch (e: any) {
        alert(`Failed to import: ${e?.message || e}`);
      }
    };
    input.click();
  }, [setDirty]);

  const applyAssistantFlow = useCallback(
    (next: { nodes: Node[]; edges: Edge[] }) => {
      const ok = confirm(
        `Apply assistant changes? (${next.nodes.length} nodes, ${next.edges.length} edges)\nThis replaces the current flow on the canvas. Save afterwards to persist.`,
      );
      if (!ok) return;
      // Ensure every node has a position so React Flow can render it.
      const nodes = next.nodes.map((n, i) => ({
        ...n,
        position: n.position || { x: 100 + (i % 5) * 240, y: 100 + Math.floor(i / 5) * 160 },
        data: n.data || {},
      }));
      const edges = next.edges.map((e) => ({
        ...e,
        type: e.type || "smoothstep",
        animated: e.animated ?? true,
      }));
      setNodes(autoLayoutHorizontal(nodes, edges));
      setEdges(edges);
      setDirty(true);
    },
    [setDirty],
  );

  // Execute full workflow: wait for the next real WhatsApp message, then
  // re-run the flow from the UI (dry_run) to populate the trace. The worker
  // handles the actual outbound reply via the queue, so we don't double-send.
  const handleExecute = useCallback(
    async () => {
      if (dirty) {
        await api.saveFlow(botId, { nodes, edges, variables: {}, published: true });
        setDirty(false);
      }
      setRunning();
      openDrawer("logs");
      try {
        const listen = await api.listenInbound(botId, 180);
        if (listen.status !== "received" || !listen.payload) {
          setResult({
            trace: [
              { node_id: "", type: "", status: "error", error: "Timed out waiting for WhatsApp message" },
            ] as any,
            status: "error",
          });
          return;
        }
        const p = listen.payload;
        // Cache + broadcast to any open NodeDetailView so its Input/Output
        // panels show the freshly received payload instead of stale data.
        if (typeof window !== "undefined") {
          localStorage.setItem(`wm:last_inbound:${botId}`, JSON.stringify(p));
          window.dispatchEvent(
            new CustomEvent("wm:inbound-received", {
              detail: { botId, payload: p },
            })
          );
        }
        const text =
          p.message?.text?.body ??
          p.message?.button?.text ??
          p.message?.interactive?.button_reply?.title ??
          "";
        // dry_run:true so we don't send a second WhatsApp message
        // (the worker already sent the real one).
        const res = await api.testRun(botId, {
          text,
          contact_wa_id: p.contact_wa_id,
          contact_name: p.contact_name,
          dry_run: true,
        });
        setResult({
          run_id: res.run_id,
          trace: res.trace || [],
          status: res.status,
          variables: res.variables,
        });
      } catch (e: any) {
        setResult({
          trace: [{ node_id: "", type: "", status: "error", error: String(e) }] as any,
          status: "error",
        });
      }
    },
    [botId, nodes, edges, dirty, setDirty, setRunning, setResult, openDrawer]
  );

  // Listen to per-node hover toolbar events
  useEffect(() => {
    const onExec = async (e: any) => {
      const id = e.detail.id;
      const node = nodes.find((n) => n.id === id);
      if (node) setOpenNode(node);
    };
    const onDel = (e: any) => deleteNode(e.detail.id);
    const onToggle = (e: any) => {
      const id = e.detail.id;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, disabled: !n.data?.disabled } } : n
        )
      );
    };
    window.addEventListener("wm:exec-node", onExec);
    window.addEventListener("wm:delete-node", onDel);
    window.addEventListener("wm:toggle-disable", onToggle);
    return () => {
      window.removeEventListener("wm:exec-node", onExec);
      window.removeEventListener("wm:delete-node", onDel);
      window.removeEventListener("wm:toggle-disable", onToggle);
    };
  }, [nodes, deleteNode]);

  // Keyboard: Cmd/Ctrl-S to save, Cmd/Ctrl-Enter to execute
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      } else if (meta && e.key === "Enter") {
        e.preventDefault();
        handleExecute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, handleExecute]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <div className="h-full flex flex-col">
      <Toolbar
        botName={botName}
        saving={saving}
        saved={saved}
        dirty={dirty}
        onSave={handleSave}
        onExecute={handleExecute}
        onExport={handleExport}
        onImport={handleImport}
        onAutoLayout={handleAutoLayout}
        onToggleAssistant={() => setAssistantOpen((v) => !v)}
        assistantOpen={assistantOpen}
      />
      <div className="flex-1 flex relative overflow-hidden">
        <NodePalette channel={channel} />
        <div className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={(_, n) => setOpenNode(n)}
            nodeTypes={customNodeTypes}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { stroke: "#a78bfa", strokeWidth: 2 },
            }}
            connectionLineStyle={{ stroke: "#a78bfa", strokeWidth: 2 }}
            connectionRadius={28}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e293b" gap={20} size={1.5} />
            <Controls className="!bg-slate-900 !border !border-slate-700 !rounded-lg overflow-hidden [&>button]:!bg-slate-900 [&>button]:!border-slate-700 [&>button]:!text-slate-200 [&>button:hover]:!bg-slate-800" />
            <MiniMap
              maskColor="rgba(2,6,23,0.85)"
              style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
              nodeColor={(n) => {
                const def = NODE_DEFS.find((d) => d.type === n.type);
                return def ? "#" + tailwindToHex(def.color) : "#475569";
              }}
              nodeStrokeWidth={2}
              pannable
              zoomable
            />
          </ReactFlow>
          <BottomDrawer botId={botId} />
        </div>
        {assistantOpen && (
          <AssistantPanel
            flow={{ nodes, edges }}
            onApplyFlow={applyAssistantFlow}
            onClose={() => setAssistantOpen(false)}
          />
        )}
      </div>
      {openNode && (
        <NodeDetailView
          botId={botId}
          node={openNode}
          onChange={(d) => updateNodeData(openNode.id, d)}
          onClose={() => setOpenNode(null)}
          onDelete={() => deleteNode(openNode.id)}
          ensureSaved={async () => {
            await api.saveFlow(botId, { nodes, edges, variables: {}, published: true });
            setDirty(false);
          }}
        />
      )}
    </div>
  );
}

export default function FlowBuilder({ botId, botName }: { botId: string; botName: string }) {
  return (
    <ReactFlowProvider>
      <Builder botId={botId} botName={botName} />
    </ReactFlowProvider>
  );
}
