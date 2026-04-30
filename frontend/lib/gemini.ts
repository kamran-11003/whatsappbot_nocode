/**
 * Minimal Gemini browser client. BYOK — key lives in localStorage only.
 */
const KEY_STORAGE = "wm:gemini_key";
const MODEL_STORAGE = "wm:gemini_model";

export type GeminiMsg = { role: "user" | "model"; text: string };

export const gemini = {
  getKey: () =>
    typeof window === "undefined" ? "" : localStorage.getItem(KEY_STORAGE) || "",
  setKey: (k: string) => localStorage.setItem(KEY_STORAGE, k),
  getModel: () =>
    (typeof window !== "undefined" && localStorage.getItem(MODEL_STORAGE)) ||
    "gemini-2.0-flash",
  setModel: (m: string) => localStorage.setItem(MODEL_STORAGE, m),

  async chat(opts: {
    apiKey: string;
    model: string;
    system: string;
    history: GeminiMsg[];
    user: string;
    /** Lower = more deterministic. Default 0.2 for flow design. */
    temperature?: number;
  }): Promise<string> {
    const { apiKey, model, system, history, user, temperature = 0.2 } = opts;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const contents = [
      ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      { role: "user", parts: [{ text: user }] },
    ];
    const body: any = {
      contents,
      generationConfig: { temperature, topP: 0.95, candidateCount: 1 },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Gemini ${r.status}: ${t}`);
    }
    const data = await r.json();
    return (
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? ""
    );
  },
};
