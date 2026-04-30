"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Bot } from "lucide-react";
import { api } from "@/lib/api";
import FlowBuilder from "@/components/FlowBuilder";

export default function App() {
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const refresh = async () => {
    const list = await api.listBots();
    setBots(list);
    if (!selectedBotId && list.length > 0) setSelectedBotId(list[0].id);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    const name = prompt("Bot name?");
    if (!name) return;
    const bot = await api.createBot(name);
    await refresh();
    setSelectedBotId(bot.id);
  };

  const handleRename = async (id: string) => {
    if (!editValue.trim()) return setEditing(null);
    await api.renameBot(id, editValue.trim());
    setEditing(null);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this bot and all its data?")) return;
    await api.deleteBot(id);
    if (selectedBotId === id) setSelectedBotId(null);
    await refresh();
  };

  const selectedBot = bots.find((b) => b.id === selectedBotId);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside className="w-64 border-r border-slate-700 bg-slate-950 flex flex-col">
        <div className="p-3 border-b border-slate-700 flex items-center justify-between">
          <h1 className="text-emerald-400 font-bold flex items-center gap-2 text-sm">
            <Bot size={16} /> WhatsApp Mate
          </h1>
          <button
            onClick={handleCreate}
            className="p-1 rounded hover:bg-slate-800 text-emerald-400"
            title="New bot"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-2 text-[10px] text-slate-500 uppercase tracking-wide">
            Workflows
          </div>
          {bots.map((b) => (
            <div
              key={b.id}
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
                  <Pencil size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(b.id);
                  }}
                  className="text-slate-400 hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {bots.length === 0 && (
            <div className="p-4 text-xs text-slate-500">
              No workflows. Click + to create one.
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 bg-slate-900 overflow-hidden">
        {!selectedBot ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            Select or create a workflow.
          </div>
        ) : (
          <FlowBuilder botId={selectedBot.id} botName={selectedBot.name} />
        )}
      </main>
    </div>
  );
}
