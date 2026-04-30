"use client";
import {
  Play,
  Save,
  Activity,
  MessageSquare,
  Loader2,
  Check,
  AlertCircle,
  Radio,
  Download,
  Upload,
  Sparkles,
  LayoutGrid,
} from "lucide-react";
import { useRunStore } from "@/lib/runStore";

export default function Toolbar({
  botName,
  saving,
  saved,
  dirty,
  onSave,
  onExecute,
  onExport,
  onImport,
  onAutoLayout,
  onToggleAssistant,
  assistantOpen,
}: {
  botName: string;
  saving: boolean;
  saved: boolean;
  dirty: boolean;
  onSave: () => void;
  onExecute: () => void;
  onExport: () => void;
  onImport: () => void;
  onAutoLayout: () => void;
  onToggleAssistant: () => void;
  assistantOpen: boolean;
}) {
  const status = useRunStore((s) => s.status);
  const showDrawer = useRunStore((s) => s.showDrawer);
  const drawerTab = useRunStore((s) => s.drawerTab);
  const openDrawer = useRunStore((s) => s.openDrawer);
  const toggleDrawer = useRunStore((s) => s.toggleDrawer);

  const StatusBadge = () => {
    if (status === "running")
      return (
        <span className="text-xs flex items-center gap-1 text-amber-400">
          <Loader2 size={12} className="animate-spin" />
          Waiting for WhatsApp message…
        </span>
      );
    if (status === "ok")
      return (
        <span className="text-xs flex items-center gap-1 text-emerald-400">
          <Check size={12} /> Success
        </span>
      );
    if (status === "error")
      return (
        <span className="text-xs flex items-center gap-1 text-red-400">
          <AlertCircle size={12} /> Failed
        </span>
      );
    return null;
  };

  return (
    <div className="h-12 border-b border-slate-700 bg-slate-900 flex items-center px-3 gap-2 text-sm">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="font-semibold truncate">{botName || "Untitled"}</span>
        {dirty && <span className="text-xs text-amber-400">• unsaved</span>}
        <StatusBadge />
      </div>

      <button
        onClick={onExecute}
        disabled={status === "running"}
        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded text-xs flex items-center gap-1.5 font-medium"
        title="Listen for next WhatsApp message, then run the workflow against it"
      >
        {status === "running" ? (
          <Radio size={13} className="animate-pulse" />
        ) : (
          <Play size={13} />
        )}
        Execute Workflow
      </button>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      <button
        onClick={() => {
          openDrawer("executions");
        }}
        className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 ${
          showDrawer && drawerTab === "executions"
            ? "bg-slate-700 text-white"
            : "text-slate-300 hover:bg-slate-800"
        }`}
      >
        <Activity size={13} /> Executions
      </button>
      <button
        onClick={() => openDrawer("threads")}
        className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 ${
          showDrawer && drawerTab === "threads"
            ? "bg-slate-700 text-white"
            : "text-slate-300 hover:bg-slate-800"
        }`}
      >
        <MessageSquare size={13} /> Threads
      </button>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      <div className="w-px h-6 bg-slate-700 mx-1" />

      <button
        onClick={onAutoLayout}
        className="px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 text-slate-300 hover:bg-slate-800"
        title="Auto-arrange nodes left-to-right"
      >
        <LayoutGrid size={13} /> Layout
      </button>
      <button
        onClick={onImport}
        className="px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 text-slate-300 hover:bg-slate-800"
        title="Import flow JSON"
      >
        <Upload size={13} /> Import
      </button>
      <button
        onClick={onExport}
        className="px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 text-slate-300 hover:bg-slate-800"
        title="Download flow JSON"
      >
        <Download size={13} /> Export
      </button>
      <button
        onClick={onToggleAssistant}
        className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 ${
          assistantOpen ? "bg-violet-700 text-white" : "text-slate-300 hover:bg-slate-800"
        }`}
        title="AI Assistant"
      >
        <Sparkles size={13} /> Assistant
      </button>

      <button
        onClick={onSave}
        disabled={saving}
        className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 font-medium ${
          dirty ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-700 hover:bg-slate-600"
        }`}
      >
        <Save size={13} /> {saved ? "Saved ✓" : saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
