"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function ThreadView({ botId, threadId }: { botId: string; threadId: string | null }) {
  const [messages, setMessages] = useState<any[]>([]);

  const refresh = async () => {
    if (!threadId) return setMessages([]);
    setMessages(await api.threadMessages(botId, threadId));
  };

  useEffect(() => {
    refresh();
  }, [threadId]);

  useEffect(() => {
    if (!botId) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/${botId}`);
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "message" && data.thread_id === threadId) refresh();
      } catch {}
    };
    return () => ws.close();
  }, [botId, threadId]);

  if (!threadId) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        Select a thread from the sidebar to see the conversation.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-2 bg-slate-900">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`max-w-[70%] p-3 rounded-lg ${
            m.direction === "in"
              ? "bg-slate-800 text-slate-100"
              : "bg-emerald-700 text-white ml-auto"
          }`}
        >
          <div className="text-sm whitespace-pre-wrap">
            {typeof m.body === "string" ? m.body : JSON.stringify(m.body)}
          </div>
          <div className="text-[10px] opacity-60 mt-1">
            {new Date(m.created_at).toLocaleString()}
          </div>
        </div>
      ))}
      {messages.length === 0 && (
        <div className="text-slate-500 text-sm">No messages yet.</div>
      )}
    </div>
  );
}
