"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  Trash2,
  Check,
  Wand2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react";
import { gemini, type GeminiMsg } from "@/lib/gemini";
import { loadFlowKb, getFlowKbSync } from "@/lib/flowKb";
import { validateFlow, diffFlow, type FlowDoc, type ValidationIssue } from "@/lib/flowValidate";

const ENV_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const ENV_MODEL = process.env.NEXT_PUBLIC_GEMINI_MODEL || "gemini-2.0-flash";

type ChatTurn = {
  role: "user" | "model";
  text: string;
  proposed?: {
    raw: FlowDoc;
    fixed: FlowDoc;
    issues: ValidationIssue[];
    diff: ReturnType<typeof diffFlow>;
    autoCorrected?: boolean;
  } | null;
};

const QUICK_PROMPTS = [
  { label: "Build RAG bot", prompt: "Build a RAG bot: Vector Store retrieves chunks for {{last_user_input}}, Agent answers using kb_context (instructions: 'Answer only from reference material; if unrelated say you don't know'). On miss, send a polite fallback Reply." },
  { label: "Lead capture", prompt: "Build a lead capture flow: ask for name, then email (validate as email, re-ask on fail), then phone (validate as 11 digits), confirm with a Reply summarising what we collected, then end." },
  { label: "FAQ menu", prompt: "Add a Question with 3 buttons (Pricing / Hours / Talk to a human). Route each to its own Reply, and 'Talk to a human' should also fire a Handover at the end." },
  { label: "Add validation", prompt: "Find the Question that asks for an email and add an email Validation node after it that re-asks on fail." },
  { label: "Audit my flow", prompt: "Review the current flow JSON. List any unreachable nodes, missing handles, missing positions, or obvious UX issues. Don't propose JSON unless I ask." },
];

function extractJson(text: string): FlowDoc | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const obj = JSON.parse(candidate.slice(start, i + 1));
          if (Array.isArray(obj?.nodes) && Array.isArray(obj?.edges)) return obj as FlowDoc;
        } catch { /* fall through */ }
        return null;
      }
    }
  }
  return null;
}

function stripJsonBlock(text: string): string {
  return text.replace(/```(?:json)?\s*[\s\S]*?```/gi, "").trim();
}

export default function AssistantPanel({
  flow,
  onApplyFlow,
  onClose,
}: {
  flow: FlowDoc;
  onApplyFlow: (next: FlowDoc) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJsonIdx, setShowJsonIdx] = useState<number | null>(null);
  const [kbReady, setKbReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadFlowKb().then(() => setKbReady(true));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const flowSummary = useMemo(
    () => `${flow.nodes.length} nodes, ${flow.edges.length} edges`,
    [flow],
  );

  const send = async (overrideText?: string) => {
    const q = (overrideText ?? input).trim();
    if (!q || busy) return;
    if (!ENV_KEY) {
      setError("NEXT_PUBLIC_GEMINI_API_KEY is not set in frontend/.env.local — restart `next dev`.");
      return;
    }
    setError(null);
    setBusy(true);
    const nextTurns: ChatTurn[] = [...turns, { role: "user", text: q }];
    setTurns(nextTurns);
    if (!overrideText) setInput("");

    const flowJson = JSON.stringify(flow, null, 2);
    const userWithCtx = `## Current flow (${flowSummary})\n\`\`\`json\n${flowJson}\n\`\`\`\n\n## Request\n${q}`;
    const history: GeminiMsg[] = nextTurns
      .slice(0, -1)
      .map((t) => ({ role: t.role, text: t.text }));

    const systemPrompt = getFlowKbSync();

    try {
      const reply = await gemini.chat({
        apiKey: ENV_KEY,
        model: ENV_MODEL,
        system: systemPrompt,
        history,
        user: userWithCtx,
        temperature: 0.2,
      });
      let displayText = reply;
      let proposed: ChatTurn["proposed"] = null;
      const raw = extractJson(reply);
      if (raw) {
        let v = validateFlow(raw);
        let currentRaw = raw;
        let autoCorrected = false;

        const errs = v.issues.filter((x) => x.level === "error");
        if (errs.length > 0) {
          const fixPrompt = [
            "Your previous JSON failed strict validation. Fix ONLY the issues below.",
            "Return the COMPLETE corrected flow JSON in a single ```json fenced block.",
            "Do not invent node types, handle names, or variables. Do not remove unrelated nodes.",
            "",
            "Validation errors:",
            ...errs.map((e, i) => `${i + 1}. ${e.message}`),
            "",
            "Previous JSON you returned:",
            "```json",
            JSON.stringify(currentRaw, null, 2),
            "```",
          ].join("\n");
          try {
            const retry = await gemini.chat({
              apiKey: ENV_KEY,
              model: ENV_MODEL,
              system: systemPrompt,
              history: [
                ...history,
                { role: "user", text: userWithCtx },
                { role: "model", text: reply },
              ],
              user: fixPrompt,
              temperature: 0.1,
            });
            const raw2 = extractJson(retry);
            if (raw2) {
              const v2 = validateFlow(raw2);
              const newErrs = v2.issues.filter((x) => x.level === "error").length;
              if (newErrs < errs.length) {
                v = v2;
                currentRaw = raw2;
                displayText = `${stripJsonBlock(reply)}\n\n_Auto-corrected ${errs.length - newErrs} validation error(s)._`;
                autoCorrected = true;
              }
            }
          } catch {
            /* keep original */
          }
        }

        const d = diffFlow(flow, v.flow);
        proposed = { raw: currentRaw, fixed: v.flow, issues: v.issues, diff: d, autoCorrected };
      }
      setTurns((t) => [...t, { role: "model", text: displayText, proposed }]);
    } catch (e: any) {
      setError(e?.message || String(e));
      setTurns((t) => [...t, { role: "model", text: `_(error: ${e?.message || e})_`, proposed: null }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-[420px] border-l border-slate-700 bg-slate-950 flex flex-col">
      <div className="h-10 px-3 border-b border-slate-700 flex items-center gap-2">
        <Sparkles size={14} className="text-violet-400" />
        <div className="text-xs font-semibold flex-1">
          AI Assistant <span className="text-slate-500 font-normal">· {flowSummary} · {ENV_MODEL}</span>
        </div>
        <a
          href="/flow-kb.md"
          target="_blank"
          rel="noreferrer"
          className="text-slate-400 hover:text-white p-1 rounded"
          title="View knowledge base (flow-kb.md)"
        >
          <FileText size={13} />
        </a>
        <button onClick={() => setTurns([])} className="text-slate-400 hover:text-white p-1 rounded" title="Clear chat">
          <Trash2 size={13} />
        </button>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xs px-1" title="Hide">×</button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {turns.length === 0 && (
          <div className="text-xs text-slate-400 leading-relaxed space-y-3">
            <p>
              I have full knowledge of every node, handle, variable and pattern in your flow system.
              I always see the current flow JSON before answering.
            </p>
            <p className="text-[11px] text-slate-500">
              KB: {kbReady ? "loaded from /flow-kb.md ✓" : "loading…"} · Model: <code>{ENV_MODEL}</code> (free tier)
              {!ENV_KEY && <span className="text-red-400"> · ⚠ NEXT_PUBLIC_GEMINI_API_KEY missing</span>}
            </p>
            <div>
              <div className="text-[10px] uppercase text-slate-500 mb-1">Quick starts</div>
              <div className="flex flex-wrap gap-1">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => send(q.prompt)}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2 py-1 rounded text-[11px] text-slate-200"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`text-xs ${t.role === "user" ? "text-emerald-300" : "text-slate-200"}`}>
            <div className="text-[10px] uppercase text-slate-500 mb-0.5">{t.role === "user" ? "You" : "Assistant"}</div>
            <div className="whitespace-pre-wrap leading-relaxed">{stripJsonBlock(t.text)}</div>

            {t.proposed && (
              <ProposedCard
                proposed={t.proposed}
                expanded={showJsonIdx === i}
                onToggle={() => setShowJsonIdx(showJsonIdx === i ? null : i)}
                onApply={() => onApplyFlow(t.proposed!.fixed)}
              />
            )}
          </div>
        ))}

        {busy && <div className="text-xs text-slate-500 italic">Assistant is thinking…</div>}
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
          placeholder="Describe a change… (Ctrl+Enter)"
          className="flex-1 bg-slate-950 border border-slate-800 p-2 rounded text-xs resize-none"
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-3 rounded text-xs flex items-center gap-1">
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

function ProposedCard({
  proposed,
  expanded,
  onToggle,
  onApply,
}: {
  proposed: NonNullable<ChatTurn["proposed"]>;
  expanded: boolean;
  onToggle: () => void;
  onApply: () => void;
}) {
  const errors = proposed.issues.filter((x) => x.level === "error");
  const warns = proposed.issues.filter((x) => x.level === "warn");
  return (
    <div className="mt-2 border border-violet-900/60 bg-slate-900 rounded">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800">
        <Wand2 size={12} className="text-violet-400" />
        <span className="text-[11px] text-slate-300 flex-1">
          Proposed flow · {proposed.fixed.nodes.length} nodes / {proposed.fixed.edges.length} edges
          {proposed.autoCorrected && (
            <span className="ml-2 text-[9px] uppercase bg-emerald-900/60 text-emerald-300 px-1 py-0.5 rounded">auto-fixed</span>
          )}
        </span>
        <button onClick={onToggle} className="text-slate-400 hover:text-white text-[10px] flex items-center gap-0.5">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />} JSON
        </button>
      </div>

      <div className="px-2 py-1.5 text-[11px] text-slate-300 flex flex-wrap gap-3">
        <span className="text-emerald-400">+{proposed.diff.added.nodes} nodes</span>
        <span className="text-emerald-400">+{proposed.diff.added.edges} edges</span>
        {proposed.diff.removed.nodes > 0 && (
          <span className="text-red-400">−{proposed.diff.removed.nodes} nodes</span>
        )}
        {proposed.diff.removed.edges > 0 && (
          <span className="text-red-400">−{proposed.diff.removed.edges} edges</span>
        )}
        {proposed.diff.changed > 0 && (
          <span className="text-amber-400">~{proposed.diff.changed} data changes</span>
        )}
      </div>

      {(errors.length > 0 || warns.length > 0) && (
        <ul className="px-2 pb-1.5 space-y-0.5 text-[10px] border-t border-slate-800 pt-1.5">
          {errors.map((iss, k) => (
            <li key={`e${k}`} className="text-red-400 flex items-start gap-1">
              <AlertTriangle size={10} className="mt-[1px]" /> {iss.message}
            </li>
          ))}
          {warns.map((iss, k) => (
            <li key={`w${k}`} className="text-amber-400 flex items-start gap-1">
              <AlertTriangle size={10} className="mt-[1px]" /> {iss.message}
            </li>
          ))}
        </ul>
      )}

      {expanded && (
        <pre className="border-t border-slate-800 bg-slate-950 p-2 max-h-64 overflow-auto text-[10px] text-slate-300 whitespace-pre">
{JSON.stringify(proposed.fixed, null, 2)}
        </pre>
      )}

      <div className="border-t border-slate-800 px-2 py-1.5 flex gap-2">
        <button
          onClick={onApply}
          disabled={errors.length > 0}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 rounded text-[11px] flex items-center gap-1"
          title={errors.length ? "Fix errors first" : "Replace canvas with this flow"}
        >
          <Check size={11} /> Apply to canvas
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(JSON.stringify(proposed.fixed, null, 2))}
          className="bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded text-[11px]"
        >
          Copy JSON
        </button>
      </div>
    </div>
  );
}
