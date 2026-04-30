"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, MessageSquare, Bot } from "lucide-react";
import { api } from "@/lib/api";

type Props = {
  selectedBotId: string | null;
  setSelectedBotId: (id: string | null) => void;
  selectedThreadId: string | null;
  setSelectedThreadId: (id: string | null) => void;
};

export default function BotSidebar({
  selectedBotId,
  setSelectedBotId,
  selectedThreadId,
  setSelectedThreadId,
}: Props) {
  const [bots, setBots] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const refreshBots = async () => setBots(await api.listBots());
  const refreshThreads = async (id: string) => setThreads(await api.listThreads(id));

  useEffect(() => {
    refreshBots();
  }, []);

  useEffect(() => {
    if (selectedBotId) refreshThreads(selectedBotId);
    else setThreads([]);
  }, [selectedBotId]);

  // Live thread updates via WebSocket
  useEffect(() => {
    if (!selectedBotId) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/${selectedBotId}`);
    ws.onmessage = () => refreshThreads(selectedBotId);
    return () => ws.close();
  }, [selectedBotId]);

  const handleCreate = async () => {
    const name = prompt("Bot name?");
    if (!name) return;
    const bot = await api.createBot(name);
    await refreshBots();
    setSelectedBotId(bot.id);
  };

  const handleRename = async (id: string) => {
    if (!editValue.trim()) return setEditing(null);
    await api.renameBot(id, editValue.trim());
    setEditing(null);
    await refreshBots();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this bot and all its data?")) return;
    await api.deleteBot(id);
    if (selectedBotId === id) setSelectedBotId(null);
    await refreshBots();
  };

  return (
    <aside className="w-72 border-r border-slate-700 bg-slate-950 flex flex-col">
      <div className="p-3 border-b border-slate-700 flex items-center justify-between">
        <h1 className="text-emerald-400 font-bold flex items-center gap-2">
          <Bot size={18} /> WhatsApp Mate
        </h1>
        <button
          onClick={handleCreate}
          className="p-1 rounded hover:bg-slate-800 text-emerald-400"
          title="New bot"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2 text-xs text-slate-500 uppercase">Bots</div>
        {bots.map((b) => (
          <div key={b.id}>
            <div
              onClick={() => setSelectedBotId(b.id)}
              className={`group px-3 py-2 cursor-pointer flex items-center justify-between ${
                selectedBotId === b.id ? "bg-slate-800" : "hover:bg-slate-900"
              }`}
            >
              {editing === b.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleRename(b.id)}
                  onKeyDown={(e) => e.key === "Enter" && handleRename(b.id)}
                  className="bg-slate-700 px-1 rounded text-sm flex-1 mr-2"
                />
              ) : (
                <span className="text-sm truncate flex-1">{b.name}</span>
              )}
              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(b.id);
                    setEditValue(b.name);
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(b.id);
                  }}
                  className="text-slate-400 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {selectedBotId === b.id && threads.length > 0 && (
              <div className="bg-slate-900/40 border-l-2 border-emerald-700 ml-2">
                {threads.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedThreadId(t.id)}
                    className={`px-3 py-2 cursor-pointer text-xs flex items-center gap-2 ${
                      selectedThreadId === t.id ? "bg-slate-800" : "hover:bg-slate-800/50"
                    }`}
                  >
                    <MessageSquare size={12} className="text-emerald-400" />
                    <div className="flex-1 truncate">
                      <div>{t.contact_name || t.contact_wa_id}</div>
                      <div className="text-slate-500">{t.contact_wa_id}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {bots.length === 0 && (
          <div className="p-4 text-xs text-slate-500">No bots yet. Click + to create one.</div>
        )}
      </div>
    </aside>
  );
}
