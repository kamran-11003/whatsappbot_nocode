"use client";

export type NodeDef = {
  type: string;
  label: string;
  color: string;
  defaults: Record<string, any>;
};

export const NODE_DEFS: NodeDef[] = [
  { type: "reply", label: "Reply", color: "bg-blue-600", defaults: { reply: "Hello {{contact_name}}!" } },
  { type: "condition", label: "Condition", color: "bg-yellow-600", defaults: { variable: "last_user_input", operator: "contains", value: "" } },
  { type: "question", label: "Question", color: "bg-purple-600", defaults: { prompt: "What is your name?", variable: "name", input_type: "text", buttons: ["", "", ""], list_button: "Choose", list_rows: [{ title: "", description: "" }] } },
  { type: "validation", label: "Validation", color: "bg-rose-600", defaults: { variable: "", rule: "non_empty", pattern: "", error_message: "That doesn't look right. Please try again.", clear_on_fail: true } },
  { type: "media", label: "Media", color: "bg-teal-600", defaults: { kind: "image", source: "", caption: "", filename: "", latitude: "", longitude: "", name: "", address: "", body_text: "Please share your location" } },
  { type: "api_call", label: "API Call", color: "bg-indigo-600", defaults: { method: "GET", url: "https://api.example.com/users/{{contact_wa_id}}", headers: {}, body: "", save_to: "api_response" } },
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
