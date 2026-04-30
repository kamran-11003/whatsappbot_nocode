"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Settings({ botId }: { botId: string }) {
  const [creds, setCreds] = useState<any>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getCreds(botId).then(setCreds);
  }, [botId]);

  const update = (k: string, v: any) => setCreds({ ...creds, [k]: v });

  const save = async () => {
    await api.saveCreds(botId, creds);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const webhookUrl = `${typeof window !== "undefined" ? location.origin : ""}/webhook/${botId}`;

  return (
    <div className="p-6 h-full overflow-y-auto max-w-2xl">
      <h2 className="text-lg font-semibold mb-4">Bot Settings</h2>

      <section className="mb-6">
        <h3 className="text-sm text-emerald-400 mb-2">Webhook</h3>
        <div className="bg-slate-800 p-3 rounded text-xs font-mono break-all">{webhookUrl}</div>
        <p className="text-xs text-slate-500 mt-1">
          Use this URL in Meta App webhook config. Verify token = below.
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-sm text-emerald-400 mb-2">WhatsApp Cloud API</h3>
        <Field label="Phone Number ID" v={creds.phone_number_id} on={(v) => update("phone_number_id", v)} />
        <Field label="Access Token" v={creds.access_token} on={(v) => update("access_token", v)} type="password" />
        <Field label="Verify Token" v={creds.verify_token} on={(v) => update("verify_token", v)} />
      </section>

      <section className="mb-6">
        <h3 className="text-sm text-emerald-400 mb-2">LLM (BYOK)</h3>
        <label className="text-xs text-slate-400">Provider</label>
        <select
          value={creds.llm_provider || "gemini"}
          onChange={(e) => update("llm_provider", e.target.value)}
          className="w-full bg-slate-800 p-2 rounded mb-2"
        >
          <option value="gemini">Gemini</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <Field label="Model" v={creds.llm_model} on={(v) => update("llm_model", v)} />
        <Field label="API Key" v={creds.llm_api_key} on={(v) => update("llm_api_key", v)} type="password" />
      </section>

      <button
        onClick={save}
        className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded text-sm"
      >
        {saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}

function Field({
  label,
  v,
  on,
  type = "text",
}: {
  label: string;
  v: any;
  on: (s: string) => void;
  type?: string;
}) {
  return (
    <div className="mb-2">
      <label className="text-xs text-slate-400">{label}</label>
      <input
        type={type}
        value={v || ""}
        onChange={(e) => on(e.target.value)}
        className="w-full bg-slate-800 p-2 rounded text-sm"
      />
    </div>
  );
}
