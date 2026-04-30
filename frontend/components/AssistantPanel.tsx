"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Key, Trash2, Check, ClipboardCopy, Wand2 } from "lucide-react";
import { Edge, Node } from "reactflow";
import { gemini, type GeminiMsg } from "@/lib/gemini";
import { NODE_DEFS } from "./NodePalette";

type ChatTurn = {
  role: "user" | "model";
  text: string;
  /** Parsed flow JSON the model proposed in this turn (if any). */
  proposedFlow?: { nodes: Node[]; edges: Edge[] } | null;
};

const PALETTE_DOC = NODE_DEFS.map((d) => {
  const sample = JSON.stringify(d.defaults);
  return `- ${d.type} (${d.label}) defaults: ${sample}`;
}).join("\n");

const SYSTEM = `You are an expert WhatsApp Mate flow designer. You help the user
build, edit, and debug visual chatbot flows. The flow is React Flow JSON with
two arrays: "nodes" and "edges".

NODE SHAPE:
{
  "id": "<unique string>",
  "type": "<one of the palette types>",
  "position": { "x": <num>, "y": <num> },
  "data": { "label": "...", ...type-specific fields }
}

EDGE SHAPE:
{
  "id": "<unique string>",
  "source": "<node id>",
  "sourceHandle": "<handle name e.g. out|true|false|hit|miss|success|error|body|ok|fail>",
  "target": "<node id>",
  "animated": true
}

Available node types and their defaults:
${PALETTE_DOC}

CRITICAL OUTPUT RULES:
1. When the user asks you to add/modify/remove nodes or edges, you MUST emit
   the FULL updated flow as a fenced JSON block:

   \`\`\`json
   { "nodes": [...], "edges": [...] }
   \`\`\`

2. Always emit the COMPLETE flow (all existing nodes + your changes), never
   a partial diff. Preserve untouched node positions/data verbatim.
3. Lay new nodes out left-to-right in 240px steps starting near existing nodes
   so the canvas looks tidy.
4. Use lowercase snake_case node ids prefixed with the type, e.g.
   "reply_1", "vector_store_1".
5. For control-flow nodes use the correct sourceHandle: condition->true/false,
   validation->ok/fail, vector_store->hit/miss, api_call/template->success/error,
   loop->body/out, otherwise "out".
6. After the JSON, briefly explain what you changed (1-3 sentences).
7. If the user is just asking a question (not requesting an edit), reply
   normally with NO JSON block.`;

function extractJson(text: string): { nodes: Node[]; edges: Edge[] } | null {
  // Look for a fenced ```json ... ``` block first, then any {...} that parses.
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1));
    if (Array.isArray(obj?.nodes) && Array.isArray(obj?.edges)) {
      return { nodes: obj.nodes, edges: obj.edges };
    }
  } catch {
    // ignore
  }
  return null;
}

export default function AssistantPanel({
  flow,
  onApplyFlow,
  onClose,
}: {
  flow: { nodes: Node[]; edges: Edge[] };
  onApplyFlow: (next: { nodes: Node[]; edges: Edge[] }) => void;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.0-flash");
  const [keyDraft, setKeyDraft] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const k = gemini.getKey();
    setApiKey(k);
    setKeyDraft(k);
    setModel(gemini.getModel());
    if (!k) setKeyOpen(true);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    if (!apiKey) {
      setKeyOpen(true);
      setError("Add your Gemini API key first.");
      return;
    }
    setError(null);
    setBusy(true);
    const nextTurns: ChatTurn[] = [...turns, { role: "user", text: q }];
    setTurns(nextTurns);
    setInput("");

    // Always include the *current* flow JSON so the model can reason about it.
    const flowJson = JSON.stringify(flow, null, 2);
    const userWithCtx = `Current flow JSON:\n\`\`\`json\n${flowJson}\n\`\`\`\n\nUser request: ${q}`;

    const history: GeminiMsg[] = nextTurns
      .slice(0, -1)
      .map((t) => ({ role: t.role, text: t.text }));

    try {
      const reply = await gemini.chat({
        apiKey,
        model,
        system: SYSTEM,
        history,
        user: userWithCtx,
      });
      const proposed = extractJson(reply);
      setTurns((t) => [...t, { role: "model", text: reply, proposedFlow: proposed }]);
    } catch (e: any) {
      setError(e?.message || String(e));
      setTurns((t) => [
        ...t,
        { role: "model", text: `_(error: ${e?.message || e})_`, proposedFlow: null },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const saveKey = () => {
    gemini.setKey(keyDraft.trim());
    gemini.setModel(model);
    setApiKey(keyDraft.trim());
    setKeyOpen(false);
    setError(null);
  };

  return (
    <div className="w-96 border-l border-slate-700 bg-slate-950 flex flex-col">
      <div className="h-10 px-3 border-b border-slate-700 flex items-center gap-2">
        <Sparkles size={14} className="text-violet-400" />
        <div className="text-xs font-semibold flex-1">AI Assistant</div>
        <button
          onClick={() => setKeyOpen((v) => !v)}
          className="text-slate-400 hover:text-white p-1 rounded"
          title="API key"
        >
          <Key size={13} />
        </button>
        <button
          onClick={() => setTurns([])}
          className="text-slate-400 hover:text-white p-1 rounded"
          title="Clear chat"
        >
          <Trash2 size={13} />
        </button>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xs px-1"
          title="Hide"
        >
          ×
        </button>
      </div>

      {keyOpen && (
        <div className="p-3 border-b border-slate-800 bg-slate-900 space-y-2">
          <div className="text-[10px] text-slate-400 uppercase">Gemini API key</div>
          <input
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="AIza…"
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
          />
          <div className="text-[10px] text-slate-400 uppercase">Model</div>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
          >
            <option value="gemini-2.0-flash">gemini-2.0-flash</option>
            <option value="gemini-2.0-flash-thinking-exp">gemini-2.0-flash-thinking-exp</option>
            <option value="gemini-1.5-flash">gemini-1.5-flash</option>
            <option value="gemini-1.5-pro">gemini-1.5-pro</option>
          </select>
          <button
            onClick={saveKey}
            className="bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded text-xs flex items-center gap-1.5 font-medium"
          >
            <Check size={12} /> Save (browser only)
          </button>
          <p className="text-[10px] text-slate-500">
            Stored in <code>localStorage</code>. Never sent to our backend.
          </p>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {turns.length === 0 && (
          <div className="text-xs text-slate-500 leading-relaxed">
            Ask me to build or change your flow.
            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
              <li>“Add a vector store + agent answering from KB.”</li>
              <li>“Greet new users by name then ask their email.”</li>
              <li>“Why isn’t my agent reaching the API node?”</li>
              <li>“Insert a condition: if message contains ‘price’, reply with menu.”</li>
            </ul>
          </div>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className={`text-xs ${
              t.role === "user" ? "text-emerald-300" : "text-slate-200"
            }`}
          >
            <div className="text-[10px] uppercase text-slate-500 mb-0.5">
              {t.role === "user" ? "You" : "Assistant"}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed">{t.text}</div>
            {t.proposedFlow && (
              <button
                onClick={() => onApplyFlow(t.proposedFlow!)}
                className="mt-2 bg-violet-600 hover:bg-violet-700 px-2.5 py-1 rounded text-xs flex items-center gap-1.5"
              >
                <Wand2 size={12} /> Apply this flow (
                {t.proposedFlow.nodes.length} nodes, {t.proposedFlow.edges.length} edges)
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="text-xs text-slate-500 italic">Assistant is thinking…</div>
        )}
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>

      <div className="border-t border-slate-800 p-2 flex gap-2">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Describe a change… (Ctrl+Enter to send)"
          className="flex-1 bg-slate-950 border border-slate-800 p-2 rounded text-xs resize-none"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-3 rounded text-xs flex items-center gap-1"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

export function copyFlowJson(flow: { nodes: Node[]; edges: Edge[] }) {
  navigator.clipboard.writeText(JSON.stringify(flow, null, 2));
}

export const ClipboardCopyIcon = ClipboardCopy;
