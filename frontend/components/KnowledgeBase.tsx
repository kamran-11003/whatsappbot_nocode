"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function KnowledgeBase({ botId }: { botId: string }) {
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const refresh = async () => setFiles(await api.listKb(botId));
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [botId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    await api.uploadKb(botId, f);
    setUploading(false);
    e.target.value = "";
    refresh();
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Knowledge Base</h2>
        <label className="bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded text-sm cursor-pointer">
          {uploading ? "Uploading…" : "Upload PDF"}
          <input type="file" accept=".pdf" hidden onChange={handleUpload} />
        </label>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-500 border-b border-slate-700">
          <tr>
            <th className="py-2">Filename</th>
            <th>Status</th>
            <th>Chunks</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id} className="border-b border-slate-800">
              <td className="py-2">{f.filename}</td>
              <td>{f.status}</td>
              <td>{f.chunk_count}</td>
              <td className="text-right">
                <button
                  onClick={async () => {
                    await api.deleteKb(botId, f.id);
                    refresh();
                  }}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {files.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-slate-500">
                No files yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
