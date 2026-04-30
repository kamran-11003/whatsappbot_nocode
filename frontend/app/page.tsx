"use client";
import { useState } from "react";

export default function App() {
  const [tab, setTab] = useState<"builder" | "threads" | "kb" | "settings">("builder");
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <BotSidebar
        selectedBotId={selectedBotId}
        setSelectedBotId={(id) => {
          setSelectedBotId(id);
          setSelectedThreadId(null);
        }}
        selectedThreadId={selectedThreadId}
        setSelectedThreadId={(id) => {
          setSelectedThreadId(id);
          setTab("threads");
        }}
      />
      <main className="flex-1 flex flex-col bg-slate-900">
        <Tabs tab={tab} setTab={setTab} />
        <div className="flex-1 overflow-hidden">
          {!selectedBotId ? (
            <Empty />
          ) : tab === "builder" ? (
            <FlowBuilder botId={selectedBotId} />
          ) : tab === "threads" ? (
            <ThreadView botId={selectedBotId} threadId={selectedThreadId} />
          ) : tab === "kb" ? (
            <KnowledgeBase botId={selectedBotId} />
          ) : (
            <Settings botId={selectedBotId} />
          )}
        </div>
      </main>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-slate-500">
      Select or create a bot to get started.
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: string; setTab: (t: any) => void }) {
  const items = [
    { id: "builder", label: "Builder" },
    { id: "threads", label: "Threads" },
    { id: "kb", label: "Knowledge Base" },
    { id: "settings", label: "Settings" },
  ];
  return (
    <div className="flex gap-1 border-b border-slate-700 bg-slate-800 px-2">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => setTab(i.id)}
          className={`px-3 py-2 text-sm ${
            tab === i.id ? "text-emerald-400 border-b-2 border-emerald-400" : "text-slate-400"
          }`}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

import BotSidebar from "@/components/BotSidebar";
import FlowBuilder from "@/components/FlowBuilder";
import ThreadView from "@/components/ThreadView";
import KnowledgeBase from "@/components/KnowledgeBase";
import Settings from "@/components/Settings";
