"use client";
import { Handle, Position, NodeProps } from "reactflow";
import { Play, Trash2, Power, type LucideIcon } from "lucide-react";
import { NODE_DEFS, SYSTEM_ICONS } from "../NodePalette";
import { useRunStore, traceForNode } from "@/lib/runStore";

const defMap = Object.fromEntries(NODE_DEFS.map((d) => [d.type, d]));

const SYSTEM_GRADIENT: Record<string, string> = {
  initialize: "from-emerald-500 to-teal-600",
  end: "from-slate-600 to-slate-800",
};

const CHANNEL_GRADIENT: Record<string, string> = {
  whatsapp:  "from-emerald-500 to-teal-600",
  messenger: "from-blue-500 to-indigo-600",
  instagram: "from-pink-500 to-purple-600",
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp:  "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

function statusRing(status?: string) {
  if (status === "ok") return "ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950";
  if (status === "error") return "ring-2 ring-red-500 ring-offset-2 ring-offset-slate-950";
  if (status === "skipped") return "ring-2 ring-slate-500 ring-offset-2 ring-offset-slate-950";
  return "";
}

const HANDLE_BASE =
  "!w-2.5 !h-2.5 !bg-slate-200 !border-2 !border-slate-900 hover:!bg-violet-400 transition-colors";

function BaseNode({
  id,
  type,
  label,
  inputs = true,
  outputs = ["out"],
  disabled,
  overrideGradient,
  badge,
}: {
  id: string;
  type: string;
  label: string;
  inputs?: boolean;
  outputs?: string[];
  disabled?: boolean;
  overrideGradient?: string;
  badge?: string;
}) {
  const def = defMap[type];
  const gradient =
    overrideGradient || def?.gradient || SYSTEM_GRADIENT[type] || "from-slate-500 to-slate-700";
  const Icon: LucideIcon = def?.icon || SYSTEM_ICONS[type] || Play;
  const trace = useRunStore((s) => s.trace);
  const entry = traceForNode(trace, id);
  const ring = statusRing(entry?.status);
  const hasMultipleOuts = outputs.length > 1;

  return (
    <div
      className={`group relative ${ring} ${disabled ? "opacity-50 grayscale" : ""}`}
      style={{ minWidth: 180 }}
    >
      {/* Hover toolbar */}
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex gap-1 bg-slate-900 border border-slate-700 rounded-md px-1 py-0.5 z-20 nodrag shadow-lg">
        <button
          title="Open / Execute"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("wm:exec-node", { detail: { id } }));
          }}
          className="text-emerald-400 hover:bg-slate-800 p-1 rounded"
        >
          <Play size={11} />
        </button>
        <button
          title="Disable"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("wm:toggle-disable", { detail: { id } }));
          }}
          className="text-slate-300 hover:bg-slate-800 p-1 rounded"
        >
          <Power size={11} />
        </button>
        {type !== "initialize" && (
          <button
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("wm:delete-node", { detail: { id } }));
            }}
            className="text-red-400 hover:bg-slate-800 p-1 rounded"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Node body */}
      <div className="rounded-xl overflow-hidden bg-slate-900 border border-slate-700 shadow-xl shadow-black/40">
        {/* Input handle (left) */}
        {inputs && (
          <Handle
            type="target"
            position={Position.Left}
            className={HANDLE_BASE}
            style={{ left: -6 }}
          />
        )}

        {/* Header strip with gradient + icon */}
        <div className={`flex items-center gap-2 px-3 py-2 bg-gradient-to-r ${gradient}`}>
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-white/20 backdrop-blur shrink-0">
            <Icon size={13} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-white/80 leading-none">
              {type.replace(/_/g, " ")}
            </div>
            <div className="text-[12px] text-white font-semibold truncate leading-tight mt-0.5">
              {label}
            </div>
          </div>
          {entry?.ms !== undefined && (
            <span className="text-[9px] text-white/80 font-mono bg-black/25 px-1.5 py-0.5 rounded shrink-0">
              {entry.ms}ms
            </span>
          )}
          {badge && (
            <span className="text-[9px] text-white/90 font-semibold bg-black/30 px-1.5 py-0.5 rounded shrink-0">
              {badge}
            </span>
          )}
        </div>

        {/* Outputs row */}
        {outputs.length > 0 && (
          <div className="px-3 py-2 bg-slate-900">
            {hasMultipleOuts ? (
              <div className="flex flex-col gap-1.5">
                {outputs.map((o) => (
                  <div
                    key={o}
                    className="relative flex items-center justify-end text-[10px] text-slate-400"
                  >
                    <span className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300 font-mono">
                      {o}
                    </span>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={o}
                      className={HANDLE_BASE}
                      style={{ right: -6, top: "50%", transform: "translateY(-50%)" }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="relative h-1">
                <Handle
                  type="source"
                  position={Position.Right}
                  id={outputs[0]}
                  className={HANDLE_BASE}
                  style={{ right: -6 }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeFor = (type: string, outputs: string[] = ["out"], inputs = true) =>
  function Wrapped({ id, data }: NodeProps) {
    return (
      <BaseNode
        id={id}
        type={type}
        label={data?.label || type}
        inputs={inputs}
        outputs={outputs}
        disabled={data?.disabled}
      />
    );
  };

export const customNodeTypes = {
  initialize: function InitializeNode({ id, data }: NodeProps) {
    const ch = (data?.channel as string) || "whatsapp";
    const gradient = CHANNEL_GRADIENT[ch] || CHANNEL_GRADIENT.whatsapp;
    const chLabel = CHANNEL_LABEL[ch] || ch;
    return (
      <BaseNode
        id={id}
        type="initialize"
        label={data?.label || "Initialize"}
        inputs={false}
        outputs={["out"]}
        disabled={data?.disabled}
        overrideGradient={gradient}
        badge={chLabel}
      />
    );
  },
  reply: nodeFor("reply"),
  condition: nodeFor("condition", ["true", "false"]),
  question: nodeFor("question"),
  validation: nodeFor("validation", ["ok", "fail"]),
  media: nodeFor("media"),
  api_call: nodeFor("api_call", ["success", "error"]),
  set_variable: nodeFor("set_variable"),
  template: nodeFor("template", ["success", "error"]),
  wait: nodeFor("wait"),
  loop: nodeFor("loop", ["body", "out"]),
  handover: nodeFor("handover", []),
  code: nodeFor("code"),
  vector_store: nodeFor("vector_store", ["hit", "miss"]),
  agent: nodeFor("agent"),
  end: nodeFor("end", []),
};
