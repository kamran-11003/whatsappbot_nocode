"use client";

export type NodeDef = {
  type: string;
  label: string;
  color: string;
  defaults: Record<string, any>;
};

export const NODE_DEFS: NodeDef[] = [
  { type: "message", label: "Message", color: "bg-blue-600", defaults: { text: "Hello!" } },
  { type: "question", label: "Question", color: "bg-indigo-600", defaults: { prompt: "What's your name?", variable: "name" } },
  { type: "condition", label: "Condition", color: "bg-yellow-600", defaults: { variable: "name", operator: "contains", value: "" } },
  { type: "loop", label: "Loop", color: "bg-orange-600", defaults: { counter: "_i", times: 3 } },
  { type: "wait", label: "Wait", color: "bg-purple-600", defaults: { seconds: 2 } },
  { type: "code", label: "Code", color: "bg-pink-600", defaults: { code: "# vars is a dict\nvars['hello'] = 'world'" } },
  { type: "api_call", label: "API Call", color: "bg-cyan-600", defaults: { method: "GET", url: "https://", headers: {}, body: "", save_to: "api_response" } },
  { type: "llm", label: "LLM Agent", color: "bg-emerald-600", defaults: { system: "You are a helpful assistant.", prompt: "{{last_user_input}}", save_to: "llm_response", send_reply: true } },
  { type: "kb_query", label: "KB Query", color: "bg-teal-600", defaults: { query: "{{last_user_input}}", top_k: 3, save_to: "kb_chunks" } },
  { type: "handover", label: "Handover", color: "bg-rose-600", defaults: {} },
  { type: "end", label: "End", color: "bg-slate-600", defaults: {} },
];

export default function NodePalette() {
  const onDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData("application/reactflow", type);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-44 bg-slate-950 border-r border-slate-700 p-2 overflow-y-auto">
      <div className="text-xs text-slate-500 uppercase mb-2">Nodes</div>
      {NODE_DEFS.map((d) => (
        <div
          key={d.type}
          draggable
          onDragStart={(e) => onDragStart(e, d.type)}
          className={`${d.color} text-white text-xs p-2 mb-1 rounded cursor-grab active:cursor-grabbing select-none`}
        >
          {d.label}
        </div>
      ))}
    </div>
  );
}
