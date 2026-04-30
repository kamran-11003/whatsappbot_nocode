/**
 * Validates and normalizes a flow proposed by the AI assistant.
 * Returns a list of issues + a (possibly auto-fixed) flow.
 */
import { Edge, Node } from "reactflow";
import { NODE_DEFS } from "@/components/NodePalette";

export type FlowDoc = { nodes: Node[]; edges: Edge[] };

const VALID_HANDLES: Record<string, string[]> = {
  initialize: ["out"],
  reply: ["out"],
  question: ["out"],
  media: ["out"],
  set_variable: ["out"],
  template: ["success", "error"],
  wait: ["out"],
  loop: ["body", "out"],
  handover: [],
  code: ["out"],
  vector_store: ["hit", "miss"],
  agent: ["out"],
  end: [],
  condition: ["true", "false"],
  validation: ["ok", "fail"],
  api_call: ["success", "error"],
};

const KNOWN_TYPES = new Set(NODE_DEFS.map((d) => d.type).concat(["initialize", "end"]));

/** Required data fields per node type. Empty list = no required fields. */
const REQUIRED_FIELDS: Record<string, string[]> = {
  reply: ["reply"],
  condition: ["variable", "operator"],
  question: ["prompt", "variable", "input_type"],
  validation: ["variable", "rule"],
  media: ["kind"],
  api_call: ["method", "url"],
  set_variable: ["assignments"],
  template: ["template_name", "language"],
  wait: ["seconds"],
  loop: ["counter", "times"],
  code: ["code"],
  vector_store: ["save_to"],
  agent: ["instructions"],
};

/** Allowed enum values for select-style fields. */
const ENUMS: Record<string, Record<string, string[]>> = {
  condition: { operator: ["equals", "contains", "starts_with", "ends_with", "regex", "gt", "lt", "empty", "not_empty"] },
  question: { input_type: ["text", "buttons", "list", "location", "media"] },
  validation: { rule: ["non_empty", "email", "phone", "digits", "regex", "min_len", "max_len"] },
  media: { kind: ["image", "video", "audio", "document", "sticker", "location", "location_request"] },
  api_call: { method: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
};

/** Built-in variables the runtime always provides. */
const BUILTIN_VARS = new Set([
  "contact_name",
  "contact_wa_id",
  "last_user_input",
  "bot_id",
  "message_type",
  "message",
  "received_at",
]);

export type ValidationIssue = {
  level: "error" | "warn";
  message: string;
};

/** Walks all string fields in a node's data and returns referenced {{var}} top-level keys. */
function extractTemplateVars(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    const re = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;
    let m;
    while ((m = re.exec(value)) !== null) {
      // Top-level segment only (e.g. "message.text.body" -> "message")
      out.add(m[1].split(".")[0]);
    }
  } else if (Array.isArray(value)) {
    value.forEach((v) => extractTemplateVars(v, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => extractTemplateVars(v, out));
  }
}

/** Returns the set of variable names a node will *produce* on success. */
function producedVars(n: Node): string[] {
  const t = n.type || "";
  const d = (n.data || {}) as any;
  if (t === "question") return d.variable ? [d.variable] : [];
  if (t === "validation") return [];
  if (t === "api_call") return d.save_to ? [d.save_to, `${d.save_to}_status`] : [];
  if (t === "set_variable") return Array.isArray(d.assignments) ? d.assignments.map((a: any) => a?.name).filter(Boolean) : [];
  if (t === "vector_store") return d.save_to ? [d.save_to, `${d.save_to}_chunks`, `${d.save_to}_count`] : [];
  if (t === "agent") return d.save_to ? [d.save_to] : ["agent_response"];
  if (t === "code") return ["_code_error"]; // can't statically infer assigned vars
  return [];
}

export function validateFlow(flow: FlowDoc): {
  flow: FlowDoc;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const nodes = (flow.nodes || []).map((n, i) => {
    const fixed: Node = { ...n };
    if (!fixed.id) {
      fixed.id = `${n.type || "node"}_${i + 1}`;
      issues.push({ level: "warn", message: `auto-assigned id for node #${i + 1}: ${fixed.id}` });
    }
    if (!fixed.type) {
      issues.push({ level: "error", message: `node ${fixed.id} has no type` });
    } else if (!KNOWN_TYPES.has(fixed.type)) {
      issues.push({ level: "error", message: `node ${fixed.id}: unknown type "${fixed.type}"` });
    }
    if (!fixed.position || typeof fixed.position.x !== "number") {
      fixed.position = { x: 80 + (i % 5) * 240, y: 120 + Math.floor(i / 5) * 160 };
      issues.push({ level: "warn", message: `auto-positioned node ${fixed.id}` });
    }
    if (!fixed.data) fixed.data = {};

    // Per-type required fields
    const required = REQUIRED_FIELDS[fixed.type || ""] || [];
    for (const f of required) {
      const v = (fixed.data as any)[f];
      const empty =
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        issues.push({ level: "error", message: `node ${fixed.id} (${fixed.type}): required field "${f}" is missing` });
      }
    }

    // Per-type enum checks
    const enums = ENUMS[fixed.type || ""] || {};
    for (const [field, allowed] of Object.entries(enums)) {
      const v = (fixed.data as any)[field];
      if (v && !allowed.includes(v)) {
        issues.push({
          level: "error",
          message: `node ${fixed.id} (${fixed.type}): "${field}" = "${v}" is invalid (allowed: ${allowed.join(", ")})`,
        });
      }
    }

    return fixed;
  });

  // Duplicate ids
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) {
      issues.push({ level: "error", message: `duplicate node id: ${n.id}` });
    }
    seen.add(n.id);
  }

  // Initialize count
  const initCount = nodes.filter((n) => n.type === "initialize").length;
  if (initCount === 0) issues.push({ level: "error", message: "no initialize node" });
  if (initCount > 1) issues.push({ level: "error", message: `multiple initialize nodes (${initCount})` });

  // Edges
  const idMap = new Map(nodes.map((n) => [n.id, n] as const));
  const edges = (flow.edges || []).map((e, i) => {
    const fixed: Edge = { ...e };
    if (!fixed.id) fixed.id = `e_${fixed.source}__${fixed.sourceHandle || "out"}__${fixed.target}_${i}`;
    if (fixed.animated === undefined) fixed.animated = true;
    const src = idMap.get(fixed.source);
    const tgt = idMap.get(fixed.target);
    if (!src) issues.push({ level: "error", message: `edge ${fixed.id}: unknown source ${fixed.source}` });
    if (!tgt) issues.push({ level: "error", message: `edge ${fixed.id}: unknown target ${fixed.target}` });
    if (src) {
      const valid = VALID_HANDLES[src.type || ""] || [];
      const handle = fixed.sourceHandle || "out";
      if (valid.length && !valid.includes(handle)) {
        issues.push({
          level: "error",
          message: `edge ${fixed.id}: ${src.type} has no handle "${handle}" (valid: ${valid.join(", ") || "(none)"})`,
        });
      }
    }
    return fixed;
  });

  // Reachability + duplicate-edge detection + walk order to track produced vars
  const reached = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const start = nodes.find((n) => n.type === "initialize");
  const walkOrder: Node[] = [];
  if (start) {
    const stack = [start.id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (reached.has(cur)) continue;
      reached.add(cur);
      const node = idMap.get(cur);
      if (node) walkOrder.push(node);
      for (const nx of adj.get(cur) || []) if (!reached.has(nx)) stack.push(nx);
    }
    for (const n of nodes) {
      if (!reached.has(n.id) && n.type !== "initialize") {
        issues.push({ level: "warn", message: `node ${n.id} (${n.type}) is unreachable from initialize` });
      }
    }
  }

  // Hallucinated template variables (warn only — could be a runtime-set var)
  const known = new Set<string>(BUILTIN_VARS);
  for (const n of walkOrder) {
    // First check this node's own templates against vars known UP TO HERE
    const refs = new Set<string>();
    extractTemplateVars(n.data, refs);
    for (const v of refs) {
      if (!known.has(v)) {
        issues.push({
          level: "warn",
          message: `node ${n.id} (${n.type}): references {{${v}}} but no upstream node sets it (built-ins: contact_name, contact_wa_id, last_user_input…)`,
        });
      }
    }
    // Then add what THIS node produces so downstream nodes can reference it
    for (const p of producedVars(n)) known.add(p);
  }

  // Duplicate edges (same source+handle+target)
  const edgeSig = new Set<string>();
  for (const e of edges) {
    const sig = `${e.source}|${e.sourceHandle || "out"}|${e.target}`;
    if (edgeSig.has(sig)) {
      issues.push({ level: "warn", message: `duplicate edge: ${sig}` });
    }
    edgeSig.add(sig);
  }

  return { flow: { nodes, edges }, issues };
}

export function diffFlow(prev: FlowDoc, next: FlowDoc): {
  added: { nodes: number; edges: number };
  removed: { nodes: number; edges: number };
  changed: number;
} {
  const prevNodeIds = new Set(prev.nodes.map((n) => n.id));
  const nextNodeIds = new Set(next.nodes.map((n) => n.id));
  const prevEdgeIds = new Set(prev.edges.map((e) => e.id));
  const nextEdgeIds = new Set(next.edges.map((e) => e.id));
  const addedNodes = [...nextNodeIds].filter((i) => !prevNodeIds.has(i)).length;
  const removedNodes = [...prevNodeIds].filter((i) => !nextNodeIds.has(i)).length;
  const addedEdges = [...nextEdgeIds].filter((i) => !prevEdgeIds.has(i)).length;
  const removedEdges = [...prevEdgeIds].filter((i) => !nextEdgeIds.has(i)).length;
  let changed = 0;
  const prevById = new Map(prev.nodes.map((n) => [n.id, n] as const));
  for (const n of next.nodes) {
    const p = prevById.get(n.id);
    if (p && JSON.stringify(p.data) !== JSON.stringify(n.data)) changed++;
  }
  return {
    added: { nodes: addedNodes, edges: addedEdges },
    removed: { nodes: removedNodes, edges: removedEdges },
    changed,
  };
}

