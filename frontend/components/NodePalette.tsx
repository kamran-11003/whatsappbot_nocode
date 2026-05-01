"use client";
import {
  MessageCircle,
  GitBranch,
  HelpCircle,
  ShieldCheck,
  Image as ImageIcon,
  Globe2,
  Variable,
  FileCode2,
  Clock,
  Repeat,
  UserPlus,
  Code2,
  Database,
  Sparkles,
  Play,
  Square,
  type LucideIcon,
} from "lucide-react";

export type NodeDef = {
  type: string;
  label: string;
  /** Tailwind classes for the node header gradient (from-X to-Y). */
  gradient: string;
  /** Tailwind classes for the palette icon dot accent. */
  accent: string;
  /** Solid Tailwind class for legacy uses (minimap etc.). */
  color: string;
  icon: LucideIcon;
  category: "Messaging" | "Logic" | "Data" | "AI" | "Flow";
  defaults: Record<string, any>;
};

export const NODE_DEFS: NodeDef[] = [
  {
    type: "reply", label: "Reply", category: "Messaging",
    gradient: "from-sky-500 to-blue-600", accent: "bg-sky-500", color: "bg-blue-600",
    icon: MessageCircle, defaults: { reply: "Hello {{contact_name}}!" },
  },
  {
    type: "media", label: "Media", category: "Messaging",
    gradient: "from-teal-500 to-emerald-600", accent: "bg-teal-500", color: "bg-teal-600",
    icon: ImageIcon, defaults: { kind: "image", source: "", caption: "", filename: "", latitude: "", longitude: "", name: "", address: "", body_text: "Please share your location" },
  },
  {
    type: "template", label: "Template", category: "Messaging",
    gradient: "from-cyan-500 to-sky-700", accent: "bg-cyan-500", color: "bg-cyan-700",
    icon: FileCode2, defaults: { template_name: "", language: "en_US", header_kind: "none", header_params: [], header_media: "", body_params: [], button_params: [] },
  },
  {
    type: "question", label: "Question", category: "Messaging",
    gradient: "from-purple-500 to-fuchsia-600", accent: "bg-purple-500", color: "bg-purple-600",
    icon: HelpCircle, defaults: { prompt: "What is your name?", variable: "name", input_type: "text", buttons: ["", "", ""], list_button: "Choose", list_rows: [{ title: "", description: "" }] },
  },
  {
    type: "condition", label: "Condition", category: "Logic",
    gradient: "from-amber-400 to-yellow-600", accent: "bg-amber-400", color: "bg-yellow-600",
    icon: GitBranch, defaults: { variable: "last_user_input", operator: "contains", value: "" },
  },
  {
    type: "validation", label: "Validation", category: "Logic",
    gradient: "from-rose-500 to-pink-600", accent: "bg-rose-500", color: "bg-rose-600",
    icon: ShieldCheck, defaults: { variable: "", rule: "non_empty", pattern: "", error_message: "That doesn't look right. Please try again.", clear_on_fail: true },
  },
  {
    type: "loop", label: "Loop", category: "Logic",
    gradient: "from-fuchsia-500 to-pink-600", accent: "bg-fuchsia-500", color: "bg-fuchsia-600",
    icon: Repeat, defaults: { counter: "_loop_i", times: 3 },
  },
  {
    type: "wait", label: "Wait", category: "Flow",
    gradient: "from-slate-500 to-slate-700", accent: "bg-slate-500", color: "bg-slate-600",
    icon: Clock, defaults: { seconds: 2 },
  },
  {
    type: "handover", label: "Handover", category: "Flow",
    gradient: "from-orange-500 to-red-600", accent: "bg-orange-500", color: "bg-orange-600",
    icon: UserPlus, defaults: {},
  },
  {
    type: "api_call", label: "API Call", category: "Data",
    gradient: "from-indigo-500 to-blue-700", accent: "bg-indigo-500", color: "bg-indigo-600",
    icon: Globe2, defaults: { method: "GET", url: "https://api.example.com/users/{{contact_wa_id}}", headers: {}, body: "", save_to: "api_response" },
  },
  {
    type: "set_variable", label: "Set Variable", category: "Data",
    gradient: "from-amber-500 to-orange-600", accent: "bg-amber-500", color: "bg-amber-600",
    icon: Variable, defaults: { assignments: [{ name: "", value: "" }] },
  },
  {
    type: "code", label: "Code", category: "Data",
    gradient: "from-zinc-500 to-zinc-700", accent: "bg-zinc-500", color: "bg-zinc-700",
    icon: Code2, defaults: { code: "# vars[\"new_var\"] = vars.get(\"name\", \"\").upper()\n" },
  },
  {
    type: "vector_store", label: "Vector Store", category: "AI",
    gradient: "from-emerald-500 to-green-700", accent: "bg-emerald-500", color: "bg-emerald-700",
    icon: Database, defaults: { query: "{{last_user_input}}", top_k: 4, save_to: "kb_context" },
  },
  {
    type: "agent", label: "Agent", category: "AI",
    gradient: "from-violet-500 to-purple-700", accent: "bg-violet-500", color: "bg-violet-700",
    icon: Sparkles, defaults: { instructions: "You are a helpful WhatsApp assistant. Answer concisely.", user_template: "{{last_user_input}}", context_var: "kb_context", send_reply: true, save_to: "agent_response", history_turns: 10, provider: "", model: "", api_key: "" },
  },
];

// Special icons for system nodes
export const SYSTEM_ICONS: Record<string, LucideIcon> = {
  initialize: Play,
  end: Square,
};

const CATEGORIES: NodeDef["category"][] = ["Messaging", "Logic", "Flow", "Data", "AI"];

// Node types that only work on WhatsApp (will show a warning badge on other channels)
const WA_ONLY_TYPES = new Set(["template"]);

export default function NodePalette({ channel = "whatsapp" }: { channel?: string }) {
  const onDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData("application/reactflow", type);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-52 bg-gradient-to-b from-slate-950 to-slate-900 border-r border-slate-800 overflow-y-auto">
      <div className="px-3 py-3 border-b border-slate-800 sticky top-0 bg-slate-950/95 backdrop-blur z-10">
        <div className="text-[10px] tracking-widest text-slate-500 uppercase font-semibold">Nodes</div>
        <div className="text-[10px] text-slate-600 mt-0.5">Drag onto canvas →</div>
      </div>
      <div className="p-2 space-y-3">
        {CATEGORIES.map((cat) => {
          const items = NODE_DEFS.filter((d) => d.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <div className="text-[9px] tracking-wider text-slate-500 uppercase px-1 mb-1">{cat}</div>
              <div className="space-y-1">
                {items.map((d) => {
                  const Icon = d.icon;
                  const waOnly = WA_ONLY_TYPES.has(d.type) && channel !== "whatsapp";
                  return (
                    <div
                      key={d.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, d.type)}
                      title={waOnly ? `${d.label} is WhatsApp-only and will return an error on ${channel}` : undefined}
                      className={`group relative flex items-center gap-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg p-2 cursor-grab active:cursor-grabbing select-none transition-colors ${waOnly ? "opacity-60" : ""}`}
                    >
                      <div className={`flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-br ${d.gradient} shadow-md shrink-0`}>
                        <Icon size={14} className="text-white" />
                      </div>
                      <span className="text-[12px] text-slate-200 font-medium flex-1">{d.label}</span>
                      {waOnly && (
                        <span
                          title={`Not supported on ${channel}`}
                          className="text-[9px] bg-amber-900/60 text-amber-400 border border-amber-800 px-1 py-0.5 rounded font-semibold shrink-0"
                        >
                          WA only
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
