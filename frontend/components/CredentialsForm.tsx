"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { api } from "@/lib/api";

type Section = "whatsapp" | "llm";

// Fields each channel owns (used when merging saves)
const CHANNEL_FIELDS: Record<string, string[]> = {
  whatsapp:   ["channel", "phone_number_id", "access_token", "verify_token"],
  messenger:  ["channel", "page_id", "page_access_token", "verify_token"],
  instagram:  ["channel", "page_id", "page_access_token", "instagram_account_id", "verify_token"],
};

const SECTION_FIELDS: Record<Section, string[]> = {
  whatsapp: ["channel", "phone_number_id", "access_token", "verify_token", "page_id", "page_access_token", "instagram_account_id"],
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

  const channel: string = creds.channel || "whatsapp";

  return (
    <div className="space-y-3">
      {section === "whatsapp" && (
        <>
          {/* ── Channel selector ── */}
          <div>
            <Label>Channel</Label>
            <div className="grid grid-cols-3 gap-1">
              {(["whatsapp", "messenger", "instagram"] as const).map((ch) => {
                const labels: Record<string, string> = {
                  whatsapp: "WhatsApp",
                  messenger: "Messenger",
                  instagram: "Instagram",
                };
                const colors: Record<string, string> = {
                  whatsapp: "border-emerald-500 text-emerald-400 bg-emerald-950/40",
                  messenger: "border-blue-500 text-blue-400 bg-blue-950/40",
                  instagram: "border-pink-500 text-pink-400 bg-pink-950/40",
                };
                const inactive = "border-slate-700 text-slate-400 bg-slate-900 hover:border-slate-500";
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => update("channel", ch)}
                    className={`px-2 py-1.5 rounded border text-[11px] font-medium transition-colors ${
                      channel === ch ? colors[ch] : inactive
                    }`}
                  >
                    {labels[ch]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── WhatsApp fields ── */}
          {channel === "whatsapp" && (
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
            </>
          )}

          {/* ── Messenger fields ── */}
          {channel === "messenger" && (
            <>
              <Field
                label="Page ID"
                v={creds.page_id}
                on={(v) => update("page_id", v)}
              />
              <Field
                label="Page Access Token"
                v={creds.page_access_token}
                on={(v) => update("page_access_token", v)}
                type="password"
              />
              <Field
                label="Verify Token"
                v={creds.verify_token}
                on={(v) => update("verify_token", v)}
              />
              <div className="text-[10px] text-slate-500 bg-blue-950/20 border border-blue-900/40 rounded p-2">
                In your Meta App → Messenger product → Webhooks, subscribe to <code className="text-blue-400">messages</code> and <code className="text-blue-400">messaging_postbacks</code>.
              </div>
            </>
          )}

          {/* ── Instagram fields ── */}
          {channel === "instagram" && (
            <>
              <Field
                label="Page ID"
                v={creds.page_id}
                on={(v) => update("page_id", v)}
              />
              <Field
                label="Page Access Token"
                v={creds.page_access_token}
                on={(v) => update("page_access_token", v)}
                type="password"
              />
              <Field
                label="Instagram Account ID"
                v={creds.instagram_account_id}
                on={(v) => update("instagram_account_id", v)}
              />
              <Field
                label="Verify Token"
                v={creds.verify_token}
                on={(v) => update("verify_token", v)}
              />
              <div className="text-[10px] text-slate-500 bg-pink-950/20 border border-pink-900/40 rounded p-2">
                In your Meta App → Instagram product → Webhooks, subscribe to <code className="text-pink-400">messages</code>. Your IG account must be connected to the Facebook Page.
              </div>
            </>
          )}

          {/* ── Webhook URL (all channels) ── */}
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
