const BASE = "";

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const api = {
  // Bots
  listBots: () => j<any[]>("/api/bots"),
  createBot: (name: string) => j<any>("/api/bots", { method: "POST", body: JSON.stringify({ name }) }),
  renameBot: (id: string, name: string) =>
    j<any>(`/api/bots/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteBot: (id: string) => j<any>(`/api/bots/${id}`, { method: "DELETE" }),

  // Credentials
  getCreds: (id: string) => j<any>(`/api/bots/${id}/credentials`),
  saveCreds: (id: string, body: any) =>
    j<any>(`/api/bots/${id}/credentials`, { method: "PUT", body: JSON.stringify(body) }),

  // Flow
  getFlow: (id: string) => j<any>(`/api/bots/${id}/flow`),
  saveFlow: (id: string, body: any) =>
    j<any>(`/api/bots/${id}/flow`, { method: "PUT", body: JSON.stringify(body) }),

  // Threads
  listThreads: (id: string) => j<any[]>(`/api/bots/${id}/threads`),
  threadMessages: (botId: string, threadId: string) =>
    j<any[]>(`/api/bots/${botId}/threads/${threadId}/messages`),

  // KB
  listKb: (id: string) => j<any[]>(`/api/bots/${id}/kb`),
  uploadKb: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/bots/${id}/kb`, { method: "POST", body: fd });
    return r.json();
  },
  deleteKb: (botId: string, fileId: string) =>
    j<any>(`/api/bots/${botId}/kb/${fileId}`, { method: "DELETE" }),

  // Runs
  testRun: (
    botId: string,
    body: { contact_wa_id?: string; contact_name?: string; text: string; dry_run?: boolean }
  ) => j<any>(`/api/bots/${botId}/test-run`, { method: "POST", body: JSON.stringify(body) }),
  testNode: (
    botId: string,
    nodeId: string,
    body: { input_vars?: Record<string, any>; contact_wa_id?: string; user_text?: string; dry_run?: boolean }
  ) =>
    j<any>(`/api/bots/${botId}/test-node/${nodeId}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  replay: (botId: string, messageId: string, dry_run = true) =>
    j<any>(`/api/bots/${botId}/replay/${messageId}?dry_run=${dry_run}`, { method: "POST" }),
  listenInbound: (botId: string, timeoutSec = 120) =>
    j<{ status: "received" | "timeout"; payload?: any }>(
      `/api/bots/${botId}/listen-inbound?timeout=${timeoutSec}`,
      { method: "POST" }
    ),
  listRuns: (botId: string, limit = 50) => j<any[]>(`/api/bots/${botId}/runs?limit=${limit}`),
  getRun: (botId: string, runId: string) => j<any>(`/api/bots/${botId}/runs/${runId}`),
};
