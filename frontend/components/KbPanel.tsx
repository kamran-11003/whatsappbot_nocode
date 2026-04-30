"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function KbPanel({ botId }: { botId: string }) {
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const refresh = async () => {
    try {
      setFiles(await api.listKb(botId));
    } catch {}
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [botId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      await api.uploadKb(botId, f);
    } finally {
      setUploading(false);
      e.target.value = "";
      refresh();
    }
  };

  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-slate-400 uppercase">Knowledge Base</div>
        <label className="bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded text-xs cursor-pointer">
          {uploading ? "Uploading…" : "Upload PDF"}
          <input type="file" accept=".pdf" hidden onChange={handleUpload} />
        </label>
      </div>
      {files.length === 0 ? (
        <div className="text-xs text-slate-500 py-3 text-center">No files yet.</div>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs"
            >
              <div className="truncate flex-1">
                <div className="truncate">{f.filename}</div>
                <div className="text-slate-500">
                  {f.status} · {f.chunk_count} chunks
                </div>
              </div>
              <button
                onClick={async () => {
                  await api.deleteKb(botId, f.id);
                  refresh();
                }}
                className="text-red-400 hover:text-red-300 ml-2"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
