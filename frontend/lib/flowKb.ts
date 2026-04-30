/**
 * Loads the canonical flow-design knowledge base used by the AI Assistant.
 *
 * The KB lives at `frontend/public/flow-kb.md` so you can open and edit it
 * like any other markdown file. It is fetched at runtime (cached in module
 * scope). If the fetch fails for any reason, we fall back to a minimal
 * embedded version so the assistant still has the schema basics.
 */

const FALLBACK_KB = `# Flow KB (fallback)
You design React Flow JSON for a WhatsApp bot builder. Top-level shape:
\`\`\`json
{ "nodes": [], "edges": [] }
\`\`\`
Allowed node types: initialize, reply, condition, question, validation, media,
api_call, set_variable, template, wait, loop, handover, code, vector_store,
agent, end. Exactly one initialize. Use only these sourceHandle values:
out (most), true/false (condition), ok/fail (validation), hit/miss
(vector_store), success/error (api_call, template), body/out (loop).
Variables: contact_name, contact_wa_id, last_user_input, plus anything an
upstream node saves. Never invent types, handles, or variables.
Return the COMPLETE updated flow inside a single \`\`\`json fenced block.
`;

let cached: string | null = null;
let inflight: Promise<string> | null = null;

export async function loadFlowKb(): Promise<string> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/flow-kb.md", { cache: "force-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text && text.length > 200) {
        cached = text;
        return text;
      }
      throw new Error("KB file empty");
    } catch {
      cached = FALLBACK_KB;
      return FALLBACK_KB;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Synchronous accessor — returns the cached KB or the fallback. */
export function getFlowKbSync(): string {
  return cached ?? FALLBACK_KB;
}

// Back-compat export for any code that imported FLOW_KB directly.
if (typeof window !== "undefined") {
  loadFlowKb();
}
export const FLOW_KB = FALLBACK_KB;
