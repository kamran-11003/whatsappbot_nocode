"use client";
import { create } from "zustand";

export type TraceEntry = {
  node_id: string;
  type: string;
  name?: string;
  status: "ok" | "error" | "skipped";
  result?: any;
  error?: string;
  ms?: number;
  vars_before?: Record<string, any> | null;
  vars_after?: Record<string, any>;
  started_at?: string;
};

type RunState = {
  status: "idle" | "running" | "ok" | "error";
  runId: string | null;
  trace: TraceEntry[];
  variables: Record<string, any>;
  lastRunAt: number | null;
  dirty: boolean;
  showDrawer: boolean;
  drawerTab: "executions" | "threads" | "logs";
  setRunning: () => void;
  setResult: (r: { run_id?: string | null; trace: TraceEntry[]; status: string; variables?: Record<string, any> }) => void;
  reset: () => void;
  setDirty: (d: boolean) => void;
  toggleDrawer: () => void;
  openDrawer: (tab?: "executions" | "threads" | "logs") => void;
  closeDrawer: () => void;
};

export const useRunStore = create<RunState>((set) => ({
  status: "idle",
  runId: null,
  trace: [],
  variables: {},
  lastRunAt: null,
  dirty: false,
  showDrawer: false,
  drawerTab: "executions",
  setRunning: () => set({ status: "running", trace: [] }),
  setResult: (r) =>
    set({
      status: r.trace.some((t) => t.status === "error") ? "error" : "ok",
      runId: r.run_id ?? null,
      trace: r.trace,
      variables: r.variables ?? {},
      lastRunAt: Date.now(),
    }),
  reset: () => set({ status: "idle", runId: null, trace: [], variables: {} }),
  setDirty: (d) => set({ dirty: d }),
  toggleDrawer: () => set((s) => ({ showDrawer: !s.showDrawer })),
  openDrawer: (tab) => set((s) => ({ showDrawer: true, drawerTab: tab ?? s.drawerTab })),
  closeDrawer: () => set({ showDrawer: false }),
}));

export function traceForNode(trace: TraceEntry[], nodeId: string): TraceEntry | undefined {
  // Return latest entry for given node id
  for (let i = trace.length - 1; i >= 0; i--) {
    if (trace[i].node_id === nodeId) return trace[i];
  }
  return undefined;
}
