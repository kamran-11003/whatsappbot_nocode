"use client";
import { Handle, Position, NodeProps } from "reactflow";
import { NODE_DEFS } from "../NodePalette";

const colorMap: Record<string, string> = Object.fromEntries(
  NODE_DEFS.map((d) => [d.type, d.color])
);

function BaseNode({
  type,
  label,
  inputs = true,
  outputs = ["out"],
  badge,
}: {
  type: string;
  label: string;
  inputs?: boolean;
  outputs?: string[];
  badge?: string;
}) {
  const color = colorMap[type] || "bg-slate-600";
  return (
    <div className={`${color} text-white rounded shadow-lg min-w-[140px]`}>
      {inputs && <Handle type="target" position={Position.Top} />}
      <div className="px-3 py-2 text-xs font-semibold flex items-center justify-between">
        <span>{label}</span>
        {badge && <span className="text-[10px] opacity-70">{badge}</span>}
      </div>
      {outputs.length === 1 ? (
        <Handle type="source" position={Position.Bottom} id={outputs[0]} />
      ) : (
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
      )}
    </div>
  );
}

const nodeFor = (type: string, outputs: string[] = ["out"], inputs = true) =>
  function Wrapped({ data }: NodeProps) {
    return <BaseNode type={type} label={data?.label || type} inputs={inputs} outputs={outputs} />;
  };

export const customNodeTypes = {
  initialize: nodeFor("initialize", ["out"], false),
  message: nodeFor("message"),
  question: nodeFor("question"),
  condition: nodeFor("condition", ["true", "false"]),
  loop: nodeFor("loop", ["body", "out"]),
  wait: nodeFor("wait"),
  code: nodeFor("code"),
  api_call: nodeFor("api_call", ["success", "error"]),
  llm: nodeFor("llm"),
  kb_query: nodeFor("kb_query"),
  handover: nodeFor("handover", []),
  end: nodeFor("end", []),
};
