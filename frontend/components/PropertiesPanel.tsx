"use client";
import { Node } from "reactflow";

export default function PropertiesPanel({
  node,
  onChange,
  onDelete,
}: {
  node: Node | null;
  onChange: (d: any) => void;
  onDelete: () => void;
}) {
  if (!node) {
    return (
      <aside className="w-72 bg-slate-950 border-l border-slate-700 p-4 text-sm text-slate-500">
        Select a node to edit.
      </aside>
    );
  }
  const d = node.data || {};
  const set = (k: string, v: any) => onChange({ [k]: v });
  const Input = (p: any) => (
    <input
      {...p}
      className={`w-full bg-slate-800 p-2 rounded text-sm ${p.className || ""}`}
    />
  );
  const Text = (p: any) => (
    <textarea
      {...p}
      className={`w-full bg-slate-800 p-2 rounded text-sm font-mono ${p.className || ""}`}
    />
  );
  const Label = ({ children }: any) => (
    <label className="text-xs text-slate-400 block mt-2 mb-1">{children}</label>
  );

  const renderFields = () => {
    switch (node.type) {
      case "initialize":
        return (
          <p className="text-xs text-slate-400">
            Configure WhatsApp + LLM credentials in <b>Settings</b> tab. This node is always the
            entry point.
          </p>
        );
      case "message":
        return (
          <>
            <Label>Text</Label>
            <Text rows={4} value={d.text || ""} onChange={(e: any) => set("text", e.target.value)} />
            <Label>Buttons (one per line, max 3)</Label>
            <Text
              rows={3}
              value={(d.buttons || []).join("\n")}
              onChange={(e: any) =>
                set("buttons", e.target.value.split("\n").filter((s: string) => s.trim()))
              }
            />
          </>
        );
      case "question":
        return (
          <>
            <Label>Prompt</Label>
            <Text rows={3} value={d.prompt || ""} onChange={(e: any) => set("prompt", e.target.value)} />
            <Label>Save answer to variable</Label>
            <Input value={d.variable || ""} onChange={(e: any) => set("variable", e.target.value)} />
          </>
        );
      case "condition":
        return (
          <>
            <Label>Variable</Label>
            <Input value={d.variable || ""} onChange={(e: any) => set("variable", e.target.value)} />
            <Label>Operator</Label>
            <select
              value={d.operator || "equals"}
              onChange={(e) => set("operator", e.target.value)}
              className="w-full bg-slate-800 p-2 rounded text-sm"
            >
              <option>equals</option>
              <option>contains</option>
              <option>regex</option>
              <option>gt</option>
              <option>lt</option>
              <option>exists</option>
            </select>
            <Label>Value</Label>
            <Input value={d.value || ""} onChange={(e: any) => set("value", e.target.value)} />
            <p className="text-xs text-slate-500 mt-2">
              Use handles: <span className="text-emerald-400">true</span> /{" "}
              <span className="text-red-400">false</span>
            </p>
          </>
        );
      case "loop":
        return (
          <>
            <Label>Counter variable</Label>
            <Input value={d.counter || ""} onChange={(e: any) => set("counter", e.target.value)} />
            <Label>Times</Label>
            <Input
              type="number"
              value={d.times || 1}
              onChange={(e: any) => set("times", parseInt(e.target.value || "1"))}
            />
            <p className="text-xs text-slate-500 mt-2">
              Handles: <span className="text-yellow-400">body</span> (loop body) /{" "}
              <span className="text-emerald-400">out</span> (after loop)
            </p>
          </>
        );
      case "wait":
        return (
          <>
            <Label>Seconds (max 30)</Label>
            <Input
              type="number"
              value={d.seconds || 1}
              onChange={(e: any) => set("seconds", parseFloat(e.target.value || "1"))}
            />
          </>
        );
      case "code":
        return (
          <>
            <Label>Python (sandboxed). Read/write `vars` dict.</Label>
            <Text rows={10} value={d.code || ""} onChange={(e: any) => set("code", e.target.value)} />
          </>
        );
      case "api_call":
        return (
          <>
            <Label>Method</Label>
            <select
              value={d.method || "GET"}
              onChange={(e) => set("method", e.target.value)}
              className="w-full bg-slate-800 p-2 rounded text-sm"
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
              <option>PATCH</option>
            </select>
            <Label>URL</Label>
            <Input value={d.url || ""} onChange={(e: any) => set("url", e.target.value)} />
            <Label>Headers (JSON)</Label>
            <Text
              rows={3}
              value={JSON.stringify(d.headers || {}, null, 2)}
              onChange={(e: any) => {
                try {
                  set("headers", JSON.parse(e.target.value));
                } catch {}
              }}
            />
            <Label>Body</Label>
            <Text rows={4} value={d.body || ""} onChange={(e: any) => set("body", e.target.value)} />
            <Label>Save response to</Label>
            <Input value={d.save_to || ""} onChange={(e: any) => set("save_to", e.target.value)} />
            <p className="text-xs text-slate-500 mt-2">
              Handles: <span className="text-emerald-400">success</span> /{" "}
              <span className="text-red-400">error</span>
            </p>
          </>
        );
      case "llm":
        return (
          <>
            <Label>System Prompt</Label>
            <Text rows={3} value={d.system || ""} onChange={(e: any) => set("system", e.target.value)} />
            <Label>User Prompt (template)</Label>
            <Text rows={3} value={d.prompt || ""} onChange={(e: any) => set("prompt", e.target.value)} />
            <Label>Save response to</Label>
            <Input value={d.save_to || ""} onChange={(e: any) => set("save_to", e.target.value)} />
            <label className="text-xs text-slate-400 block mt-2">
              <input
                type="checkbox"
                checked={d.send_reply !== false}
                onChange={(e) => set("send_reply", e.target.checked)}
                className="mr-2"
              />
              Send response as WhatsApp reply
            </label>
          </>
        );
      case "kb_query":
        return (
          <>
            <Label>Query (template)</Label>
            <Text rows={3} value={d.query || ""} onChange={(e: any) => set("query", e.target.value)} />
            <Label>Top K</Label>
            <Input
              type="number"
              value={d.top_k || 3}
              onChange={(e: any) => set("top_k", parseInt(e.target.value || "3"))}
            />
            <Label>Save chunks to</Label>
            <Input value={d.save_to || ""} onChange={(e: any) => set("save_to", e.target.value)} />
          </>
        );
      case "handover":
        return <p className="text-xs text-slate-400">Marks thread for human handover and ends the flow.</p>;
      case "end":
        return <p className="text-xs text-slate-400">Terminates the flow.</p>;
      default:
        return null;
    }
  };

  return (
    <aside className="w-80 bg-slate-950 border-l border-slate-700 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-slate-500 uppercase">Node</div>
          <div className="font-semibold capitalize">{node.type}</div>
        </div>
        {node.type !== "initialize" && (
          <button
            onClick={onDelete}
            className="text-red-400 hover:text-red-300 text-xs"
          >
            Delete
          </button>
        )}
      </div>
      {renderFields()}
    </aside>
  );
}
