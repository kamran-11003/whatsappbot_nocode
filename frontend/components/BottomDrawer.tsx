"use client";
import { useEffect, useState } from "react";
import { X, ChevronUp, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useRunStore } from "@/lib/runStore";
import ThreadView from "./ThreadView";

export default function BottomDrawer({ botId }: { botId: string }) {
  const showDrawer = useRunStore((s) => s.showDrawer);
  const tab = useRunStore((s) => s.drawerTab);
  const closeDrawer = useRunStore((s) => s.closeDrawer);
  const openDrawer = useRunStore((s) => s.openDrawer);

  if (!showDrawer) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-80 bg-slate-950 border-t border-slate-700 z-20 flex flex-col">
      <div className="flex items-center border-b border-slate-700 bg-slate-900">
        <Tab id="executions" current={tab} on={() => openDrawer("executions")}>
          Executions
        </Tab>
        <Tab id="threads" current={tab} on={() => openDrawer("threads")}>
          Threads
        </Tab>
        <Tab id="logs" current={tab} on={() => openDrawer("logs")}>
          Trace
        </Tab>
        <button
          onClick={closeDrawer}
          className="ml-auto p-2 text-slate-400 hover:text-white"
          title="Close"
        >
          <ChevronUp size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "executions" && <ExecutionsTab botId={botId} />}
        {tab === "threads" && <ThreadsTab botId={botId} />}
        {tab === "logs" && <LogsTab />}
      </div>
    </div>
  );
}

function Tab({
  id,
  current,
  on,
  children,
}: {
  id: string;
  current: string;
  on: () => void;
  children: React.ReactNode;
}) {
  const active = id === current;
  return (
    <button
      onClick={on}
      className={`px-4 py-2 text-xs font-medium border-b-2 ${
        active
          ? "border-emerald-400 text-emerald-400"
          : "border-transparent text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function ExecutionsTab({ botId }: { botId: string }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    api.listRuns(botId).then(setRuns).catch(() => setRuns([]));
  }, [botId]);

  return (
    <div className="h-full flex">
      <div className="w-72 border-r border-slate-800 overflow-y-auto">
        {runs.length === 0 && (
          <div className="p-4 text-xs text-slate-500">No runs yet. Click Execute Workflow.</div>
        )}
        {runs.map((r) => (
          <button
            key={r._id}
            onClick={() => setSelected(r)}
            className={`w-full text-left px-3 py-2 border-b border-slate-800 text-xs hover:bg-slate-900 ${
              selected?._id === r._id ? "bg-slate-900" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={
                  r.status === "complete" || r.status === "end"
                    ? "text-emerald-400"
                    : r.status === "handover"
                    ? "text-amber-400"
                    : "text-slate-300"
                }
              >
                {r.kind} · {r.status}
              </span>
              <span className="text-[10px] text-slate-500">
                {r.trace?.length ?? 0} steps
              </span>
            </div>
            <div className="text-slate-500 mt-0.5">
              {new Date(r.started_at).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-xs font-mono">
        {!selected ? (
          <div className="text-slate-500">Select a run to inspect its trace.</div>
        ) : (
          <pre className="whitespace-pre-wrap text-slate-300">
            {JSON.stringify(selected.trace, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function ThreadsTab({ botId }: { botId: string }) {
  const [threads, setThreads] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = async () => setThreads(await api.listThreads(botId));

  useEffect(() => {
    refresh();
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/${botId}`);
    ws.onmessage = () => refresh();
    return () => ws.close();
  }, [botId]);

  return (
    <div className="h-full flex">
      <div className="w-72 border-r border-slate-800 overflow-y-auto">
        {threads.length === 0 && (
          <div className="p-4 text-xs text-slate-500">No threads yet.</div>
        )}
        {threads.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelected(t.id)}
            className={`w-full text-left px-3 py-2 border-b border-slate-800 text-xs hover:bg-slate-900 ${
              selected === t.id ? "bg-slate-900" : ""
            }`}
          >
            <div className="font-medium">{t.contact_name || t.contact_wa_id}</div>
            <div className="text-slate-500">{t.contact_wa_id}</div>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        <ThreadView botId={botId} threadId={selected} />
      </div>
    </div>
  );
}

function LogsTab() {
  const trace = useRunStore((s) => s.trace);
  if (trace.length === 0)
    return (
      <div className="p-4 text-xs text-slate-500">
        No trace yet. Run the workflow to see per-node execution.
      </div>
    );
  return (
    <div className="overflow-y-auto h-full">
      <table className="w-full text-xs">
        <thead className="bg-slate-900 sticky top-0">
          <tr className="text-left text-slate-400">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Node</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">ms</th>
            <th className="px-3 py-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {trace.map((t, i) => (
            <tr key={i} className="border-t border-slate-800">
              <td className="px-3 py-1 text-slate-500">{i + 1}</td>
              <td className="px-3 py-1">{t.name || t.node_id}</td>
              <td className="px-3 py-1 text-slate-400">{t.type}</td>
              <td
                className={`px-3 py-1 ${
                  t.status === "ok"
                    ? "text-emerald-400"
                    : t.status === "error"
                    ? "text-red-400"
                    : "text-slate-500"
                }`}
              >
                {t.status}
              </td>
              <td className="px-3 py-1 text-slate-500">{t.ms ?? ""}</td>
              <td className="px-3 py-1 font-mono text-slate-400 truncate max-w-md">
                {t.error || JSON.stringify(t.result || {})}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
