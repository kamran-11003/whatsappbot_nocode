"use client";
import { Handle, Position, NodeProps } from "reactflow";
import { Play, Trash2, Power } from "lucide-react";
import { NODE_DEFS } from "../NodePalette";
import { useRunStore, traceForNode } from "@/lib/runStore";

const colorMap: Record<string, string> = Object.fromEntries(
  NODE_DEFS.map((d) => [d.type, d.color])
);

function statusRing(status?: string) {
  if (status === "ok") return "ring-2 ring-emerald-400";
  if (status === "error") return "ring-2 ring-red-500";
  if (status === "skipped") return "ring-2 ring-slate-500";
  return "";
}

function BaseNode({
  id,
  type,
  label,
  inputs = true,
  outputs = ["out"],
  disabled,
}: {
  id: string;
  type: string;
  label: string;
  inputs?: boolean;
  outputs?: string[];
  disabled?: boolean;
}) {
  const color = colorMap[type] || "bg-slate-600";
  const trace = useRunStore((s) => s.trace);
  const entry = traceForNode(trace, id);
  const ring = statusRing(entry?.status);

  return (
    <div
      className={`group relative rounded shadow-lg min-w-[160px] ${ring} ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {/* hover toolbar */}
      <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex gap-1 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 z-10 nodrag">
        <button
          title="Execute Node"
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

      <div className={`${color} text-white rounded`}>
        {inputs && <Handle type="target" position={Position.Top} />}
        <div className="px-3 py-2 text-xs font-semibold flex items-center justify-between">
          <span>{label}</span>
          {entry?.ms !== undefined && (
            <span className="text-[9px] opacity-70 ml-2">{entry.ms}ms</span>
          )}
        </div>
        {outputs.length === 1 ? (
          <Handle type="source" position={Position.Bottom} id={outputs[0]} />
        ) : outputs.length > 0 ? (
          <div className="flex justify-around pb-1">
            {outputs.map((o, i) => (
              <div key={o} className="relative text-[10px] text-center px-2">
                {o}
                <Handle
                  type="source"
                  position={Position.Bottom}
                  id={o}
                  style={{ left: `${((i + 1) * 100) / (outputs.length + 1)}%` }}
                />
              </div>
            ))}
          </div>
        ) : null}
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
  initialize: nodeFor("initialize", ["out"], false),
  reply: nodeFor("reply"),
  condition: nodeFor("condition", ["true", "false"]),
  question: nodeFor("question"),
  validation: nodeFor("validation", ["ok", "fail"]),
  media: nodeFor("media"),
  api_call: nodeFor("api_call", ["success", "error"]),
};
