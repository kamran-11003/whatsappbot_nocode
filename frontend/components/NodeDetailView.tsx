"use client";
import { useEffect, useState } from "react";
import { Node } from "reactflow";
import { X, Play, Loader2, Trash2, Radio, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { useRunStore, traceForNode, TraceEntry } from "@/lib/runStore";
import CredentialsForm from "./CredentialsForm";

type Props = {
  botId: string;
  node: Node;
  onChange: (data: Record<string, any>) => void;
  onClose: () => void;
  onDelete: () => void;
  ensureSaved?: () => Promise<void>;
};

export default function NodeDetailView({ botId, node, onChange, onClose, onDelete, ensureSaved }: Props) {
  const traceVars = useRunStore((s) => s.variables);
  const fullTrace = useRunStore((s) => s.trace);
  const entry = traceForNode(fullTrace, node.id);
  const [running, setRunning] = useState(false);
  const [localResult, setLocalResult] = useState<TraceEntry | null>(null);
  const [inputJson, setInputJson] = useState<string>(
    JSON.stringify(entry?.vars_before || traceVars || {}, null, 2)
  );
  const [contactWaId, setContactWaId] = useState<string>("");
  const [listening, setListening] = useState(false);
  const [inboundPayload, setInboundPayload] = useState<any>(null);
  const [listenStatus, setListenStatus] = useState<string>("");
  const [tokenToast, setTokenToast] = useState<string>("");
  const isInitialize = node.type === "initialize";

  // The upstream payload available to this node (what Initialize produced last).
  const parentPayload = inboundPayload;

  useEffect(() => {
    setInputJson(JSON.stringify(entry?.vars_before || traceVars || {}, null, 2));
    setLocalResult(null);
    if (typeof window !== "undefined") {
      setContactWaId(localStorage.getItem("wm:test_contact") || "");
      // Restore last received inbound for this bot's Initialize node.
      const stored = localStorage.getItem(`wm:last_inbound:${botId}`);
      if (stored) {
        try {
          setInboundPayload(JSON.parse(stored));
          setListenStatus("Last received (cached)");
        } catch {}
      } else {
        setInboundPayload(null);
        setListenStatus("");
      }
    }
  }, [node.id, botId]);

  // Live-update the Input/Output panels when *any* listener (Initialize node,
  // Toolbar's Execute Workflow, etc.) receives a fresh inbound payload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onInbound = (e: any) => {
      if (!e?.detail || e.detail.botId !== botId) return;
      setInboundPayload(e.detail.payload);
      setListenStatus("Received — latest inbound");
    };
    window.addEventListener("wm:inbound-received", onInbound);
    return () => window.removeEventListener("wm:inbound-received", onInbound);
  }, [botId]);

  const executeNode = async () => {
    setRunning(true);
    setLocalResult(null);
    try {
      // Make sure backend has the latest version of this node before testing.
      if (ensureSaved) {
        try {
          await ensureSaved();
        } catch {
          /* non-fatal: backend will report node_not_found if truly missing */
        }
      }
      // Use the upstream inbound payload as input vars so {{message.text.body}}
      // etc. resolve exactly as they will at runtime.
      const parsed: Record<string, any> = parentPayload
        ? { ...parentPayload }
        : (() => {
            try { return JSON.parse(inputJson || "{}"); } catch { return {}; }
          })();
      if (typeof window !== "undefined" && contactWaId) {
        localStorage.setItem("wm:test_contact", contactWaId);
      }
      const res = await api.testNode(botId, node.id, {
        input_vars: parsed,
        contact_wa_id: contactWaId || parsed.contact_wa_id || "test-user",
        dry_run: false,
      });
      const t: TraceEntry | undefined = res.trace?.[0];
      if (t) setLocalResult({ ...t, vars_after: res.variables });
    } catch (e: any) {
      setLocalResult({
        node_id: node.id,
        type: node.type || "",
        status: "error",
        error: String(e),
      });
    } finally {
      setRunning(false);
    }
  };

  const listenForInbound = async () => {
    setListening(true);
    setInboundPayload(null);
    setListenStatus("Waiting for next inbound WhatsApp message…");
    try {
      const res = await api.listenInbound(botId, 120);
      if (res.status === "received") {
        setInboundPayload(res.payload);
        setListenStatus("Received — flow has been triggered with this payload");
        if (typeof window !== "undefined") {
          localStorage.setItem(
            `wm:last_inbound:${botId}`,
            JSON.stringify(res.payload)
          );
          window.dispatchEvent(
            new CustomEvent("wm:inbound-received", {
              detail: { botId, payload: res.payload },
            })
          );
        }
      } else {
        setListenStatus("Timed out after 120s. Try again.");
      }
    } catch (e: any) {
      setListenStatus(`Error: ${String(e)}`);
    } finally {
      setListening(false);
    }
  };

  // Token click handler:
  //  - Initialize node: copy {{path}} to clipboard so user can paste into any field.
  //  - Other nodes: append {{path}} to the WhatsApp Reply field (data.reply).
  const onTokenClick = (path: string) => {
    const token = `{{${path}}}`;
    if (isInitialize) {
      try {
        navigator.clipboard.writeText(token);
        setTokenToast(`Copied ${token}`);
      } catch {
        setTokenToast(token);
      }
    } else {
      const cur = (node.data?.reply as string) || "";
      const sep = cur && !cur.endsWith(" ") ? " " : "";
      onChange({ reply: cur + sep + token });
      setTokenToast(`Inserted ${token}`);
    }
    setTimeout(() => setTokenToast(""), 1500);
  };

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const result = localResult || entry || null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg w-[min(1200px,95vw)] h-[min(800px,90vh)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5 bg-slate-900">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">
              {node.type}
            </div>
            <input
              value={node.data?.label || node.type}
              onChange={(e) => onChange({ label: e.target.value })}
              className="bg-transparent text-base font-semibold focus:outline-none focus:bg-slate-800 px-1 rounded"
            />
          </div>
          <div className="flex items-center gap-2">
            {isInitialize ? (
              <button
                onClick={listenForInbound}
                disabled={listening}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded text-xs flex items-center gap-1.5"
                title="Wait for the next real inbound WhatsApp message"
              >
                {listening ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Radio size={13} />
                )}
                {listening ? "Listening…" : "Listen for test event"}
              </button>
            ) : (
              <button
                onClick={executeNode}
                disabled={running}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded text-xs flex items-center gap-1.5"
              >
                {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                Execute Node
              </button>
            )}
            {node.type !== "initialize" && (
              <button
                onClick={() => {
                  if (confirm("Delete this node?")) {
                    onDelete();
                    onClose();
                  }
                }}
                className="text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-slate-800"
                title="Delete node"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-800"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 3 panels: Input | Parameters | Output (Initialize hides Input) */}
        <div className={`flex-1 grid overflow-hidden ${isInitialize ? "grid-cols-2" : "grid-cols-3"}`}>
          {!isInitialize && (
            <Panel title="Input">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  Test WhatsApp number (real send target)
                </label>
                <input
                  value={contactWaId}
                  onChange={(e) => setContactWaId(e.target.value)}
                  placeholder="e.g. 15551234567"
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs mb-2"
                />
              </div>
              <div className="text-[10px] text-slate-500 mb-1">
                Click any field below to insert <code className="text-emerald-400">{`{{path}}`}</code> into the WhatsApp Reply.
              </div>
              {parentPayload ? (
                <div className="flex-1 overflow-auto bg-slate-950 border border-slate-800 rounded p-2">
                  <JsonTree value={parentPayload} onPick={onTokenClick} />
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  No upstream data yet. Open the Initialize node and click
                  <span className="text-emerald-400"> Listen for test event</span>,
                  then send a WhatsApp message.
                </div>
              )}
              {tokenToast && (
                <div className="text-[10px] text-emerald-400 mt-1">{tokenToast}</div>
              )}
            </Panel>
          )}

          <Panel title="Parameters" className={isInitialize ? "" : "border-x border-slate-800"}>
            <ParameterFields node={node} onChange={onChange} botId={botId} />
            <ReplyField node={node} onChange={onChange} />
          </Panel>

          <Panel title="Output">
            {isInitialize ? (
              !inboundPayload ? (
                <div className="text-xs text-slate-500">
                  {listenStatus || (
                    <>
                      Click <span className="text-emerald-400">Listen for test event</span>{" "}
                      then send a WhatsApp message to your business number. The incoming
                      payload will appear here.
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-xs flex-1 flex flex-col">
                  <div>
                    <span className="text-emerald-400">{listenStatus || "Received"}</span>
                    <span className="text-slate-500 ml-2">
                      from {inboundPayload.contact_name || "unknown"} ({inboundPayload.contact_wa_id})
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Click any field to copy a <code className="text-emerald-400">{`{{path}}`}</code> token,
                    then paste it into a downstream node’s Reply.
                  </div>
                  <div className="flex-1 overflow-auto bg-slate-950 border border-slate-800 rounded p-2">
                    <JsonTree value={inboundPayload} onPick={onTokenClick} />
                  </div>
                  {tokenToast && (
                    <div className="text-[10px] text-emerald-400">{tokenToast}</div>
                  )}
                </div>
              )
            ) : !result ? (
              <div className="text-xs text-slate-500">
                Click Execute Node (or Execute Workflow) to see output.
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-500">Status: </span>
                  <span
                    className={
                      result.status === "ok"
                        ? "text-emerald-400"
                        : result.status === "error"
                        ? "text-red-400"
                        : "text-slate-300"
                    }
                  >
                    {result.status}
                  </span>
                  {result.ms !== undefined && (
                    <span className="text-slate-500 ml-2">{result.ms}ms</span>
                  )}
                </div>
                {result.error && (
                  <pre className="bg-red-950/40 border border-red-900 p-2 rounded text-red-300 whitespace-pre-wrap">
                    {result.error}
                  </pre>
                )}
                <div>
                  <div className="text-slate-500 mb-1">Result</div>
                  <pre className="bg-slate-950 border border-slate-800 p-2 rounded font-mono text-slate-300 whitespace-pre-wrap">
                    {JSON.stringify(result.result || {}, null, 2)}
                  </pre>
                </div>
                {(result as any).reply && (
                  <div>
                    <div className="text-slate-500 mb-1">
                      Sent to WhatsApp ({(result as any).send_response?.status ?? "?"})
                    </div>
                    <pre className="bg-slate-950 border border-slate-800 p-2 rounded font-mono text-emerald-300 whitespace-pre-wrap">
                      {(result as any).reply}
                    </pre>
                    {(result as any).send_response?.body && (
                      <pre className="mt-1 bg-slate-950 border border-slate-800 p-2 rounded font-mono text-[10px] text-slate-400 whitespace-pre-wrap">
                        {typeof (result as any).send_response.body === "string"
                          ? (result as any).send_response.body
                          : JSON.stringify((result as any).send_response.body, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
                {result.vars_after && (
                  <div>
                    <div className="text-slate-500 mb-1">Variables after</div>
                    <pre className="bg-slate-950 border border-slate-800 p-2 rounded font-mono text-slate-300 whitespace-pre-wrap">
                      {JSON.stringify(result.vars_after, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide px-3 py-2 border-b border-slate-800 bg-slate-950">
        {title}
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col">{children}</div>
    </div>
  );
}

// ====== Parameter editor (extracted from old PropertiesPanel) ======
function ParameterFields({
  node,
  onChange,
  botId,
}: {
  node: Node;
  onChange: (d: any) => void;
  botId: string;
}) {
  const d = node.data || {};
  const set = (k: string, v: any) => onChange({ [k]: v });

  const Input = (p: any) => (
    <input
      {...p}
      className={`w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs ${p.className || ""}`}
    />
  );
  const Text = (p: any) => (
    <textarea
      {...p}
      className={`w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs font-mono ${
        p.className || ""
      }`}
    />
  );
  const Label = ({ children }: any) => (
    <label className="text-xs text-slate-400 block mt-2 mb-1">{children}</label>
  );

  switch (node.type) {
    case "initialize":
      return (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Entry point of the workflow. Configure your WhatsApp Cloud API credentials here.
          </p>
          <CredentialsForm botId={botId} section="whatsapp" />
        </div>
      );
    case "reply":
      return (
        <p className="text-xs text-slate-400">
          Sends the message defined in the WhatsApp Reply field below to the user.
          Supports <code className="text-emerald-400">{"{{variable}}"}</code> templating.
        </p>
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
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
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
          <p className="text-[10px] text-slate-500 mt-2">
            Output handles: <span className="text-emerald-400">true</span> /{" "}
            <span className="text-red-400">false</span>
          </p>
        </>
      );
    default:
      return <p className="text-xs text-slate-500">No parameters.</p>;
  }
}

/**
 * Unified WhatsApp reply field rendered for every node. If non-empty, the
 * engine sends this text via WhatsApp after the node's logic runs. Supports
 * {{var}} templating against the flow's variables.
 *
 * Hidden for control-only nodes that don't make sense as a reply source.
 */
const NO_REPLY_TYPES = new Set(["initialize", "condition", "loop", "end"]);

function ReplyField({
  node,
  onChange,
}: {
  node: Node;
  onChange: (d: any) => void;
}) {
  if (NO_REPLY_TYPES.has(node.type || "")) return null;
  const d = node.data || {};
  const value = d.reply || "";
  return (
    <div className="mt-5 border-t border-slate-800 pt-3">
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400 uppercase tracking-wide">
          WhatsApp Reply
        </label>
        <span className="text-[10px] text-slate-500">optional · supports {"{{vars}}"}</span>
      </div>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange({ reply: e.target.value })}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("text/plain")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          const token = e.dataTransfer.getData("text/plain");
          if (!token) return;
          e.preventDefault();
          const ta = e.currentTarget as HTMLTextAreaElement;
          const start = ta.selectionStart ?? value.length;
          const end = ta.selectionEnd ?? value.length;
          const next = value.slice(0, start) + token + value.slice(end);
          onChange({ reply: next });
          // Restore caret after token on next tick
          requestAnimationFrame(() => {
            try {
              ta.focus();
              const pos = start + token.length;
              ta.setSelectionRange(pos, pos);
            } catch {}
          });
        }}
        placeholder="Sent to user after this node runs. Drag a field from the Input panel to insert {{var}}."
        className="w-full mt-1 bg-slate-950 border border-slate-800 p-2 rounded text-xs"
      />
    </div>
  );
}

/**
 * Recursive JSON viewer. Each leaf (and each container key) is clickable;
 * clicking calls onPick(path) where path is a dotted path usable in
 * {{templates}}. Arrays use [i] notation. Each leaf is also draggable
 * (HTML5 drag) so it can be dropped into the WhatsApp Reply textarea.
 */
function JsonTree({
  value,
  onPick,
  path = "",
  depth = 0,
}: {
  value: any;
  onPick: (path: string) => void;
  path?: string;
  depth?: number;
}) {
  const indent = { paddingLeft: depth * 12 };
  if (value === null || value === undefined) {
    return <PickRow path={path} display="null" valueClass="text-slate-500" onPick={onPick} indent={indent} />;
  }
  if (typeof value === "string") {
    return <PickRow path={path} display={`"${value}"`} valueClass="text-amber-300" onPick={onPick} indent={indent} />;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <PickRow path={path} display={String(value)} valueClass="text-cyan-300" onPick={onPick} indent={indent} />;
  }
  if (Array.isArray(value)) {
    if (value.length === 0)
      return <PickRow path={path} display="[]" valueClass="text-slate-500" onPick={onPick} indent={indent} />;
    return (
      <div>
        {value.map((v, i) => {
          const childPath = path ? `${path}[${i}]` : `[${i}]`;
          return (
            <div key={i} style={indent} className="font-mono text-xs">
              <span className="text-slate-500">[{i}]</span>
              <div className="pl-3">
                <JsonTree value={v} onPick={onPick} path={childPath} depth={depth + 1} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  // object
  const keys = Object.keys(value);
  if (keys.length === 0)
    return <PickRow path={path} display="{}" valueClass="text-slate-500" onPick={onPick} indent={indent} />;
  return (
    <div>
      {keys.map((k) => {
        const childPath = path ? `${path}.${k}` : k;
        const v = value[k];
        const isLeaf =
          v === null ||
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean";
        return (
          <div key={k} style={indent} className="font-mono text-xs leading-5">
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", `{{${childPath}}}`);
                e.dataTransfer.setData("application/x-wm-token", childPath);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onPick(childPath)}
              className="text-emerald-300 hover:text-emerald-200 hover:bg-slate-800 px-1 rounded cursor-grab active:cursor-grabbing"
              title={`Click or drag to insert {{${childPath}}}`}
            >
              {k}
            </button>
            <span className="text-slate-500">: </span>
            {isLeaf ? (
              <JsonTree value={v} onPick={onPick} path={childPath} depth={0} />
            ) : (
              <div className="pl-3">
                <JsonTree value={v} onPick={onPick} path={childPath} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PickRow({
  path,
  display,
  valueClass,
  onPick,
  indent,
}: {
  path: string;
  display: string;
  valueClass: string;
  onPick: (path: string) => void;
  indent: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      draggable={!!path}
      onDragStart={(e) => {
        if (!path) return;
        e.dataTransfer.setData("text/plain", `{{${path}}}`);
        e.dataTransfer.setData("application/x-wm-token", path);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => path && onPick(path)}
      className={`inline ${valueClass} hover:bg-slate-800 hover:underline px-1 rounded cursor-grab active:cursor-grabbing`}
      title={path ? `Click or drag to insert {{${path}}}` : ""}
    >
      {display}
    </button>
  );
}
