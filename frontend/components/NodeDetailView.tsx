"use client";
import { useEffect, useState } from "react";
import { Node } from "reactflow";
import { X, Play, Loader2, Trash2, Radio, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { useRunStore, traceForNode, TraceEntry } from "@/lib/runStore";
import CredentialsForm from "./CredentialsForm";
import KbPanel from "./KbPanel";

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
                title="Wait for the next real inbound message"
              >
                {listening ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Radio size={13} />
                )}
                {listening
                  ? "Listening…"
                  : node.data?.channel === "messenger"
                  ? "Listen for Messenger message"
                  : node.data?.channel === "instagram"
                  ? "Listen for Instagram DM"
                  : "Listen for test event"}
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
                      then send a message to your{" "}
                      {node.data?.channel === "messenger" ? "Facebook Page" : node.data?.channel === "instagram" ? "Instagram account" : "WhatsApp business number"}.
                      The incoming payload will appear here.
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
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide px-3 py-2 border-b border-slate-800 bg-slate-950">
        {title}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col">{children}</div>
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
            Entry point of the workflow. Select your channel then configure the credentials below.
          </p>
          {/* Channel selector */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Channel</label>
            <div className="grid grid-cols-3 gap-1">
              {(["whatsapp", "messenger", "instagram"] as const).map((ch) => {
                const labels: Record<string, string> = { whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram" };
                const active: Record<string, string> = {
                  whatsapp:  "border-emerald-500 text-emerald-400 bg-emerald-950/40",
                  messenger: "border-blue-500 text-blue-400 bg-blue-950/40",
                  instagram: "border-pink-500 text-pink-400 bg-pink-950/40",
                };
                const cur = d.channel || "whatsapp";
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => set("channel", ch)}
                    className={`px-2 py-1.5 rounded border text-[11px] font-medium transition-colors ${
                      cur === ch ? active[ch] : "border-slate-700 text-slate-400 bg-slate-900 hover:border-slate-500"
                    }`}
                  >
                    {labels[ch]}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {(d.channel || "whatsapp") === "whatsapp" && "Requires Phone Number ID + Access Token from Meta WhatsApp Cloud API."}
              {d.channel === "messenger" && "Requires Facebook Page ID + Page Access Token. Subscribe to messages & messaging_postbacks webhooks."}
              {d.channel === "instagram" && "Requires Facebook Page ID + Page Access Token + Instagram Account ID. Page must be linked to the IG account."}
            </p>
          </div>
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
    case "question":
      return (
        <>
          <p className="text-xs text-slate-400">
            Sends the prompt below, then <span className="text-purple-400">pauses</span> the flow
            until the user replies. The reply is stored in the named variable and the flow resumes
            from the next node.
          </p>
          <Label>Prompt</Label>
          <Text
            rows={3}
            value={d.prompt || ""}
            onChange={(e: any) => set("prompt", e.target.value)}
            placeholder="What is your name?"
          />
          <Label>Store reply in variable</Label>
          <Input
            value={d.variable || ""}
            onChange={(e: any) => set("variable", e.target.value)}
            placeholder="name"
          />
          <Label>Input type</Label>
          <select
            value={d.input_type || "text"}
            onChange={(e) => set("input_type", e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
          >
            <option value="text">Free text</option>
            <option value="buttons">Quick reply buttons (max 3)</option>
            <option value="list">Selectable list (max 10)</option>
            <option value="location">Ask for location (interactive)</option>
            <option value="media">Wait for any media (image/video/audio/doc)</option>
          </select>
          {(d.input_type || "text") === "buttons" && (
            <div className="mt-2 space-y-1">
              <div className="text-[10px] text-slate-500">
                WhatsApp limit: 3 buttons, 20 chars each.
              </div>
              {[0, 1, 2].map((i) => (
                <Input
                  key={i}
                  value={(d.buttons || [])[i] || ""}
                  maxLength={20}
                  onChange={(e: any) => {
                    const next = [...(d.buttons || ["", "", ""])];
                    next[i] = e.target.value;
                    set("buttons", next);
                  }}
                  placeholder={`Button ${i + 1}`}
                />
              ))}
            </div>
          )}
          {(d.input_type || "text") === "list" && (
            <div className="mt-2 space-y-2">
              <div className="text-[10px] text-slate-500">
                WhatsApp limit: 10 rows, title ≤ 24 chars, description ≤ 72 chars.
              </div>
              <Label>List trigger button label</Label>
              <Input
                value={d.list_button || ""}
                maxLength={20}
                onChange={(e: any) => set("list_button", e.target.value)}
                placeholder="Choose"
              />
              <div className="space-y-1">
                {((d.list_rows && d.list_rows.length ? d.list_rows : [{ title: "", description: "" }]) as any[]).map((row, i) => (
                  <div key={i} className="border border-slate-800 rounded p-2 space-y-1 bg-slate-950">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Row {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...(d.list_rows || [])];
                          next.splice(i, 1);
                          set("list_rows", next.length ? next : [{ title: "", description: "" }]);
                        }}
                        className="text-[10px] text-red-400 hover:text-red-300"
                      >
                        remove
                      </button>
                    </div>
                    <Input
                      value={row.title || ""}
                      maxLength={24}
                      onChange={(e: any) => {
                        const next = [...(d.list_rows || [])];
                        next[i] = { ...next[i], title: e.target.value };
                        set("list_rows", next);
                      }}
                      placeholder="Title (required)"
                    />
                    <Input
                      value={row.description || ""}
                      maxLength={72}
                      onChange={(e: any) => {
                        const next = [...(d.list_rows || [])];
                        next[i] = { ...next[i], description: e.target.value };
                        set("list_rows", next);
                      }}
                      placeholder="Description (optional)"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={(d.list_rows || []).length >= 10}
                onClick={() => {
                  const next = [...(d.list_rows || []), { title: "", description: "" }];
                  set("list_rows", next.slice(0, 10));
                }}
                className="text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-2 py-1 rounded"
              >
                + Add row
              </button>
            </div>
          )}
          <p className="text-[10px] text-slate-500 mt-2">
            Use <code className="text-emerald-400">{"{{" + (d.variable || "name") + "}}"}</code> in
            downstream nodes.
          </p>
        </>
      );
    case "validation":
      return (
        <>
          <p className="text-xs text-slate-400">
            Validates a variable. <span className="text-emerald-400">ok</span> passes through;
            <span className="text-red-400"> fail</span> sends the error message and clears the
            variable so you can loop back to a Question to re-ask.
          </p>
          <Label>Variable to validate</Label>
          <Input
            value={d.variable || ""}
            onChange={(e: any) => set("variable", e.target.value)}
            placeholder="e.g. number"
          />
          <Label>Rule</Label>
          <select
            value={d.rule || "non_empty"}
            onChange={(e) => set("rule", e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
          >
            <option value="non_empty">Not empty</option>
            <option value="digits">Digits only (optionally exact length)</option>
            <option value="length">Exact length</option>
            <option value="min_length">Minimum length</option>
            <option value="max_length">Maximum length</option>
            <option value="email">Email address</option>
            <option value="regex">Regex match</option>
          </select>
          {["digits", "length", "min_length", "max_length", "regex"].includes(d.rule || "") && (
            <>
              <Label>
                {d.rule === "regex"
                  ? "Regex pattern"
                  : d.rule === "digits"
                  ? "Required digit count (blank = any)"
                  : "Length"}
              </Label>
              <Input
                value={d.pattern || ""}
                onChange={(e: any) => set("pattern", e.target.value)}
                placeholder={d.rule === "regex" ? "^[A-Za-z]+$" : d.rule === "digits" ? "11" : "e.g. 11"}
              />
            </>
          )}
          <Label>Error message (sent on fail)</Label>
          <Text
            rows={2}
            value={d.error_message || ""}
            onChange={(e: any) => set("error_message", e.target.value)}
            placeholder="Please enter exactly 11 digits."
          />
          <label className="flex items-center gap-2 mt-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={d.clear_on_fail !== false}
              onChange={(e) => set("clear_on_fail", e.target.checked)}
            />
            Clear the variable on fail (so loop-back Question re-asks)
          </label>
          <p className="text-[10px] text-slate-500 mt-2">
            Output handles: <span className="text-emerald-400">ok</span> /{" "}
            <span className="text-red-400">fail</span>. Wire <em>fail</em> back to your Question to
            loop.
          </p>
        </>
      );
    case "api_call": {
      const headersJson = (() => {
        try {
          return JSON.stringify(d.headers || {}, null, 2);
        } catch {
          return "{}";
        }
      })();
      return (
        <>
          <p className="text-xs text-slate-400">
            Calls an external HTTP API. The response (parsed JSON or raw text) is stored in{" "}
            <code className="text-emerald-400">{"{{" + (d.save_to || "api_response") + "}}"}</code>{" "}
            and the status code in{" "}
            <code className="text-emerald-400">{"{{" + (d.save_to || "api_response") + "_status}}"}</code>.
          </p>
          <Label>Method</Label>
          <select
            value={d.method || "GET"}
            onChange={(e) => set("method", e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
          >
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>PATCH</option>
            <option>DELETE</option>
          </select>
          <Label>URL</Label>
          <Input
            value={d.url || ""}
            onChange={(e: any) => set("url", e.target.value)}
            placeholder="https://api.example.com/users/{{contact_wa_id}}"
          />
          <Label>Headers (JSON object)</Label>
          <Text
            rows={4}
            value={headersJson}
            onChange={(e: any) => {
              try {
                set("headers", JSON.parse(e.target.value || "{}"));
              } catch {
                // keep raw text by storing nothing — user fixes JSON
              }
            }}
            placeholder='{"Authorization": "Bearer {{api_token}}"}'
          />
          <Label>Body (JSON or raw, supports {"{{vars}}"})</Label>
          <Text
            rows={5}
            value={d.body || ""}
            onChange={(e: any) => set("body", e.target.value)}
            placeholder={'{"name": "{{name}}", "phone": "{{contact_wa_id}}"}'}
          />
          <Label>Save response to variable</Label>
          <Input
            value={d.save_to || "api_response"}
            onChange={(e: any) => set("save_to", e.target.value)}
            placeholder="api_response"
          />
          <p className="text-[10px] text-slate-500 mt-2">
            Output handles: <span className="text-emerald-400">success</span> (HTTP &lt; 400) /{" "}
            <span className="text-red-400">error</span> (HTTP ≥ 400 or exception). Use a Condition
            on{" "}
            <code className="text-emerald-400">{"{{" + (d.save_to || "api_response") + "_status}}"}</code>{" "}
            for finer-grained branching.
          </p>
        </>
      );
    }
    case "media": {
      const kind = (d.kind as string) || "image";
      const needsSource = ["image", "video", "audio", "document", "sticker"].includes(kind);
      const allowsCaption = ["image", "video", "document"].includes(kind);
      return (
        <>
          <p className="text-xs text-slate-400">
            Sends a rich WhatsApp message (media or location) to the user. Use a
            public URL or a previously-uploaded media id in <em>Source</em>.
          </p>
          <Label>Kind</Label>
          <select
            value={kind}
            onChange={(e) => set("kind", e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="document">Document</option>
            <option value="sticker">Sticker</option>
            <option value="location">Send location (lat/lng)</option>
            <option value="location_request">Ask user to share location</option>
          </select>
          {needsSource && (
            <>
              <Label>Source (URL or WhatsApp media id)</Label>
              <Input
                value={d.source || ""}
                onChange={(e: any) => set("source", e.target.value)}
                placeholder="https://example.com/file.jpg  OR  1234567890"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Templating supported, e.g. <code className="text-emerald-400">{"{{media_id}}"}</code>.
              </p>
            </>
          )}
          {allowsCaption && (
            <>
              <Label>Caption (optional)</Label>
              <Text
                rows={2}
                value={d.caption || ""}
                onChange={(e: any) => set("caption", e.target.value)}
              />
            </>
          )}
          {kind === "document" && (
            <>
              <Label>Filename (optional)</Label>
              <Input
                value={d.filename || ""}
                onChange={(e: any) => set("filename", e.target.value)}
                placeholder="invoice.pdf"
              />
            </>
          )}
          {kind === "location" && (
            <>
              <Label>Latitude</Label>
              <Input
                value={d.latitude || ""}
                onChange={(e: any) => set("latitude", e.target.value)}
                placeholder="24.8607"
              />
              <Label>Longitude</Label>
              <Input
                value={d.longitude || ""}
                onChange={(e: any) => set("longitude", e.target.value)}
                placeholder="67.0011"
              />
              <Label>Name (optional)</Label>
              <Input
                value={d.name || ""}
                onChange={(e: any) => set("name", e.target.value)}
                placeholder="Our Office"
              />
              <Label>Address (optional)</Label>
              <Input
                value={d.address || ""}
                onChange={(e: any) => set("address", e.target.value)}
                placeholder="Street, City"
              />
            </>
          )}
          {kind === "location_request" && (
            <>
              <Label>Prompt text</Label>
              <Text
                rows={2}
                value={d.body_text || ""}
                onChange={(e: any) => set("body_text", e.target.value)}
                placeholder="Please share your location"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                User taps a button in WhatsApp and shares their current location. Use a
                downstream <span className="text-purple-400">Question</span> with input
                type <em>Ask for location</em> if you want to capture the response into
                a variable, or read{" "}
                <code className="text-emerald-400">{"{{latitude}}"}</code>/
                <code className="text-emerald-400">{"{{longitude}}"}</code> on the next inbound.
              </p>
            </>
          )}
        </>
      );
    }
    case "set_variable": {
      const rows = (d.assignments && d.assignments.length ? d.assignments : [{ name: "", value: "" }]) as any[];
      return (
        <>
          <p className="text-xs text-slate-400">
            Assigns one or more variables. Values support{" "}
            <code className="text-emerald-400">{"{{templates}}"}</code> and are auto-coerced
            (numbers, booleans, JSON objects/arrays).
          </p>
          <div className="space-y-1 mt-2">
            {rows.map((row, i) => (
              <div key={i} className="border border-slate-800 rounded p-2 bg-slate-950 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Assignment {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...rows];
                      next.splice(i, 1);
                      set("assignments", next.length ? next : [{ name: "", value: "" }]);
                    }}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    remove
                  </button>
                </div>
                <Input
                  value={row.name || ""}
                  onChange={(e: any) => {
                    const next = [...rows];
                    next[i] = { ...next[i], name: e.target.value };
                    set("assignments", next);
                  }}
                  placeholder="variable name (e.g. total)"
                />
                <Input
                  value={row.value || ""}
                  onChange={(e: any) => {
                    const next = [...rows];
                    next[i] = { ...next[i], value: e.target.value };
                    set("assignments", next);
                  }}
                  placeholder='value (e.g. {"x":1} or {{name}})'
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => set("assignments", [...rows, { name: "", value: "" }])}
            className="mt-2 text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded"
          >
            + Add assignment
          </button>
        </>
      );
    }
    case "template": {
      const bodyParams = (d.body_params || []) as string[];
      const headerParams = (d.header_params || []) as string[];
      const buttonParams = (d.button_params || []) as any[];
      const headerKind = (d.header_kind as string) || "none";
      return (
        <>
          <p className="text-xs text-slate-400">
            Sends a pre-approved WhatsApp template message — required for messaging users
            outside the 24-hour customer-service window.
          </p>
          <Label>Template name</Label>
          <Input
            value={d.template_name || ""}
            onChange={(e: any) => set("template_name", e.target.value)}
            placeholder="hello_world"
          />
          <Label>Language code</Label>
          <Input
            value={d.language || ""}
            onChange={(e: any) => set("language", e.target.value)}
            placeholder="en_US"
          />
          <Label>Header kind</Label>
          <select
            value={headerKind}
            onChange={(e) => set("header_kind", e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
          >
            <option value="none">None</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
          </select>
          {headerKind === "text" && (
            <ParamList
              label="Header text params"
              items={headerParams}
              onChange={(v) => set("header_params", v)}
              placeholder="value for {{1}}"
            />
          )}
          {["image", "video", "document"].includes(headerKind) && (
            <>
              <Label>Header media (URL or media id)</Label>
              <Input
                value={d.header_media || ""}
                onChange={(e: any) => set("header_media", e.target.value)}
                placeholder="https://example.com/file.jpg"
              />
            </>
          )}
          <ParamList
            label="Body params (in order: {{1}}, {{2}}, ...)"
            items={bodyParams}
            onChange={(v) => set("body_params", v)}
            placeholder="value for {{1}}"
          />
          <Label>Button params (optional)</Label>
          <div className="space-y-1">
            {buttonParams.map((b, i) => (
              <div key={i} className="border border-slate-800 rounded p-2 bg-slate-950 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Button {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...buttonParams];
                      next.splice(i, 1);
                      set("button_params", next);
                    }}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    remove
                  </button>
                </div>
                <div className="flex gap-1">
                  <Input
                    value={b.index ?? 0}
                    onChange={(e: any) => {
                      const next = [...buttonParams];
                      next[i] = { ...next[i], index: Number(e.target.value) || 0 };
                      set("button_params", next);
                    }}
                    placeholder="index"
                    className="w-16"
                  />
                  <select
                    value={b.sub_type || "url"}
                    onChange={(e) => {
                      const next = [...buttonParams];
                      next[i] = { ...next[i], sub_type: e.target.value };
                      set("button_params", next);
                    }}
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs"
                  >
                    <option value="url">url</option>
                    <option value="quick_reply">quick_reply</option>
                  </select>
                </div>
                <Input
                  value={b.value || ""}
                  onChange={(e: any) => {
                    const next = [...buttonParams];
                    next[i] = { ...next[i], value: e.target.value };
                    set("button_params", next);
                  }}
                  placeholder="value (URL suffix or payload)"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => set("button_params", [...buttonParams, { index: 0, sub_type: "url", value: "" }])}
              className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded"
            >
              + Add button param
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Output handles: <span className="text-emerald-400">success</span> /{" "}
            <span className="text-red-400">error</span>.
          </p>
        </>
      );
    }
    case "wait":
      return (
        <>
          <p className="text-xs text-slate-400">
            Pauses the flow for N seconds (max 30s in-process). For longer delays use a
            scheduled trigger.
          </p>
          <Label>Seconds</Label>
          <Input
            type="number"
            min={0}
            max={30}
            value={d.seconds ?? 1}
            onChange={(e: any) => set("seconds", Number(e.target.value) || 0)}
          />
        </>
      );
    case "loop":
      return (
        <>
          <p className="text-xs text-slate-400">
            Iterates a counter <em>times</em> times. The <span className="text-emerald-400">body</span>{" "}
            handle re-enters the loop; <span className="text-emerald-400">out</span> fires when done.
          </p>
          <Label>Counter variable</Label>
          <Input
            value={d.counter || "_loop_i"}
            onChange={(e: any) => set("counter", e.target.value)}
            placeholder="_loop_i"
          />
          <Label>Times</Label>
          <Input
            type="number"
            min={1}
            value={d.times ?? 3}
            onChange={(e: any) => set("times", Number(e.target.value) || 1)}
          />
          <p className="text-[10px] text-slate-500 mt-2">
            Use <code className="text-emerald-400">{"{{" + (d.counter || "_loop_i") + "}}"}</code>{" "}
            inside the loop body.
          </p>
        </>
      );
    case "handover":
      return (
        <p className="text-xs text-slate-400">
          Marks this thread as handed over to a human. The bot stops responding to this
          contact until the <em>handover</em> flag is cleared on the thread (via the
          Threads view).
        </p>
      );
    case "code":
      return (
        <>
          <p className="text-xs text-slate-400">
            Run a sandboxed Python snippet (RestrictedPython). Read flow variables via{" "}
            <code className="text-emerald-400">vars[&quot;name&quot;]</code> and assign new
            ones the same way. Errors are stored in{" "}
            <code className="text-emerald-400">{"{{_code_error}}"}</code>.
          </p>
          <Label>Code</Label>
          <Text
            rows={10}
            value={d.code || ""}
            onChange={(e: any) => set("code", e.target.value)}
            placeholder={'name = vars.get("name", "")\nvars["greeting"] = f"Hi {name}!"'}
          />
        </>
      );
    case "vector_store":
      return (
        <>
          <p className="text-xs text-slate-400">
            Retrieves the top-K most relevant chunks from this bot&apos;s knowledge
            base and stores them in a variable so an <span className="text-violet-400">Agent</span>{" "}
            (or any node) can use them.
          </p>
          <Label>Query (template)</Label>
          <Input
            value={d.query || ""}
            onChange={(e: any) => set("query", e.target.value)}
            placeholder="{{last_user_input}}"
          />
          <Label>Top-K results</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={d.top_k ?? 4}
            onChange={(e: any) => set("top_k", Number(e.target.value) || 1)}
          />
          <Label>Save context to variable</Label>
          <Input
            value={d.save_to || "kb_context"}
            onChange={(e: any) => set("save_to", e.target.value)}
            placeholder="kb_context"
          />
          <p className="text-[10px] text-slate-500 mt-2">
            Output handles: <span className="text-emerald-400">hit</span> (≥1 chunk) /{" "}
            <span className="text-red-400">miss</span> (0 chunks or error). Joined text in{" "}
            <code className="text-emerald-400">{"{{" + (d.save_to || "kb_context") + "}}"}</code>;
            structured chunks in{" "}
            <code className="text-emerald-400">{"{{" + (d.save_to || "kb_context") + "_chunks}}"}</code>.
          </p>
          <KbPanel botId={botId} />
        </>
      );
    case "agent":
      return (
        <>
          <p className="text-xs text-slate-400">
            Calls an LLM with system instructions and (optionally) retrieved KB context.
            Pair with a <span className="text-emerald-400">Vector Store</span> node upstream
            for RAG. Uses the bot&apos;s LLM credentials by default — override per-node below.
          </p>
          <Label>Instructions (system prompt)</Label>
          <Text
            rows={5}
            value={d.instructions || ""}
            onChange={(e: any) => set("instructions", e.target.value)}
            placeholder="You are a helpful WhatsApp assistant. Answer concisely."
          />
          <Label>User template</Label>
          <Input
            value={d.user_template || ""}
            onChange={(e: any) => set("user_template", e.target.value)}
            placeholder="{{last_user_input}}"
          />
          <Label>KB context variable (from Vector Store)</Label>
          <Input
            value={d.context_var || ""}
            onChange={(e: any) => set("context_var", e.target.value)}
            placeholder="kb_context"
          />
          <Label>Save answer to variable</Label>
          <Input
            value={d.save_to || ""}
            onChange={(e: any) => set("save_to", e.target.value)}
            placeholder="agent_response"
          />
          <Label>History turns to include</Label>
          <Input
            type="number"
            min={0}
            max={50}
            value={d.history_turns ?? 10}
            onChange={(e: any) => set("history_turns", Number(e.target.value) || 0)}
          />
          <label className="flex items-center gap-2 mt-3 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={d.send_reply !== false}
              onChange={(e) => set("send_reply", e.target.checked)}
            />
            Send the answer to the user via WhatsApp
          </label>
          <div className="mt-4 border-t border-slate-800 pt-3">
            <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-2">
              Bot LLM credentials (used unless overridden below)
            </div>
            <CredentialsForm botId={botId} section="llm" />
          </div>
          <div className="mt-4 border-t border-slate-800 pt-3">
            <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-2">
              Per-node overrides (optional)
            </div>
            <Label>Provider</Label>
            <select
              value={d.provider || ""}
              onChange={(e) => set("provider", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
            >
              <option value="">(use bot default)</option>
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <Label>Model</Label>
            <Input
              value={d.model || ""}
              onChange={(e: any) => set("model", e.target.value)}
              placeholder="(use bot default)"
            />
            <Label>API key</Label>
            <input
              type="password"
              value={d.api_key || ""}
              onChange={(e) => set("api_key", e.target.value)}
              placeholder="(use bot default)"
              className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
            />
          </div>
        </>
      );
    default:
      return <p className="text-xs text-slate-500">No parameters.</p>;
  }
}

/**
 * Editable list of strings — used by Template node for body/header param lists.
 */
function ParamList({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <>
      <label className="text-xs text-slate-400 block mt-2 mb-1">{label}</label>
      <div className="space-y-1">
        {items.map((v, i) => (
          <div key={i} className="flex gap-1">
            <input
              value={v}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
              className="flex-1 bg-slate-950 border border-slate-800 p-2 rounded text-xs"
            />
            <button
              type="button"
              onClick={() => {
                const next = [...items];
                next.splice(i, 1);
                onChange(next);
              }}
              className="text-[10px] text-red-400 hover:text-red-300 px-2"
            >
              remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="mt-1 text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded"
      >
        + Add
      </button>
    </>
  );
}

const NO_REPLY_TYPES = new Set([
  "initialize", "condition", "loop", "end", "question", "validation",
  "media", "api_call", "set_variable", "template", "wait", "handover", "code",
  "vector_store", "agent",
]);

/**
 * Unified WhatsApp reply field rendered for every node.
 */
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
