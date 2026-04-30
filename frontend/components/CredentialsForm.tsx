"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { api } from "@/lib/api";

type Section = "whatsapp" | "llm";

const SECTION_FIELDS: Record<Section, string[]> = {
  whatsapp: ["phone_number_id", "access_token", "verify_token"],
  llm: ["llm_provider", "llm_model", "llm_api_key"],
};

/**
 * Inline credentials form rendered inside the Initialize node (whatsapp)
 * and LLM node (llm). Reads + writes only the fields its `section` owns
 * so the two forms can coexist without overwriting each other.
 */
export default function CredentialsForm({
  botId,
  section,
}: {
  botId: string;
  section: Section;
}) {
  const [creds, setCreds] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    setLoading(true);
    api
      .getCreds(botId)
      .then((c) => {
        setCreds(c || {});
        dirty.current = false;
      })
      .catch(() => setCreds({}))
      .finally(() => setLoading(false));
  }, [botId]);

  const update = (k: string, v: any) => {
    dirty.current = true;
    setCreds((c: any) => ({ ...c, [k]: v }));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Re-fetch latest so we don't clobber fields owned by the other section
      const latest = (await api.getCreds(botId).catch(() => ({}))) || {};
      const merged = { ...latest };
      for (const f of SECTION_FIELDS[section]) {
        merged[f] = creds[f];
      }
      await api.saveCreds(botId, merged);
      dirty.current = false;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return <div className="text-xs text-slate-500 py-2">Loading credentials…</div>;

  return (
    <div className="space-y-3">
      {section === "whatsapp" && (
        <>
          <Field
            label="Phone Number ID"
            v={creds.phone_number_id}
            on={(v) => update("phone_number_id", v)}
          />
          <Field
            label="Access Token"
            v={creds.access_token}
            on={(v) => update("access_token", v)}
            type="password"
          />
          <Field
            label="Verify Token"
            v={creds.verify_token}
            on={(v) => update("verify_token", v)}
          />
          <div>
            <Label>Webhook URL</Label>
            <div className="bg-slate-950 border border-slate-800 p-2 rounded text-[11px] font-mono break-all text-slate-400">
              {typeof window !== "undefined" ? location.origin : ""}/webhook/{botId}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Paste this in your Meta App webhook config.
            </p>
          </div>
        </>
      )}

      {section === "llm" && (
        <>
          <Label>Provider</Label>
          <select
            value={creds.llm_provider || "gemini"}
            onChange={(e) => update("llm_provider", e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
          >
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
          <Field label="Model" v={creds.llm_model} on={(v) => update("llm_model", v)} />
          <Field
            label="API Key"
            v={creds.llm_api_key}
            on={(v) => update("llm_api_key", v)}
            type="password"
          />
        </>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded text-xs flex items-center gap-1.5 font-medium"
      >
        {saving ? (
          <Loader2 size={12} className="animate-spin" />
        ) : saved ? (
          <Check size={12} />
        ) : null}
        {saved ? "Saved" : "Save Credentials"}
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-slate-400 block mt-2 mb-1">{children}</label>;
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
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={v || ""}
        onChange={(e) => on(e.target.value)}
        className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs"
      />
    </div>
  );
}
