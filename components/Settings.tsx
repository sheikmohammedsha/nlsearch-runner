"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chat, Connection, Theme } from "@/lib/types";
import { AI_KEYS, type AiKey, type AiSetting, effective, es, readAiSettings, reasonFrom, source, Unreachable } from "@/lib/es";
import { download } from "@/lib/store";
import { Json, Modal } from "./Bits";
import { ConnectGuide } from "./Connect";
import { InstallGuide } from "./Install";

export type Tab = "connection" | "plugin" | "ai" | "appearance" | "data";

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
  connection: Connection;
  rememberSecrets: boolean;
  theme: Theme;
  chats: Chat[];
  onConnection: (c: Connection, remember: boolean) => void;
  onTheme: (t: Theme) => void;
  onImport: (chats: Chat[]) => void;
  onClearAll: () => void;
  onModel: (model: string) => void;
  onClose: () => void;
}

const TABS: [Tab, string][] = [["connection", "Connection"], ["plugin", "Install the plugin"], ["ai", "AI model"], ["appearance", "Appearance"], ["data", "Data"]];

export function Settings(p: Props) {
  return (
    <Modal title="Settings" onClose={p.onClose} wide>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={p.tab === id} className={"tab" + (p.tab === id ? " on" : "")} onClick={() => p.setTab(id)}>{label}</button>
        ))}
      </div>
      {p.tab === "connection" && <ConnectionTab {...p} />}
      {p.tab === "plugin" && <InstallGuide />}
      {p.tab === "ai" && <AiTab connection={p.connection} onModel={p.onModel} />}
      {p.tab === "appearance" && <AppearanceTab theme={p.theme} onTheme={p.onTheme} />}
      {p.tab === "data" && <DataTab chats={p.chats} onImport={p.onImport} onClearAll={p.onClearAll} />}
    </Modal>
  );
}

function ConnectionTab({ connection, rememberSecrets, onConnection }: Props) {
  const [c, setC] = useState(connection);
  const [remember, setRemember] = useState(rememberSecrets);
  const changed = JSON.stringify(c) !== JSON.stringify(connection) || remember !== rememberSecrets;

  return (
    <form className="form" onSubmit={e => { e.preventDefault(); onConnection(c, remember); }}>
      <label>
        <span>Elasticsearch URL</span>
        <input value={c.url} onChange={e => setC({ ...c, url: e.target.value })} placeholder="http://localhost:9200" spellCheck={false} />
      </label>
      <div className="presets">
        {["http://localhost:9200", "http://127.0.0.1:9200", "https://localhost:9200"].map(u => (
          <button type="button" key={u} className={"chip" + (c.url === u ? " on" : "")} onClick={() => setC({ ...c, url: u })}>{u}</button>
        ))}
      </div>
      <label>
        <span>Authentication</span>
        <select value={c.auth} onChange={e => setC({ ...c, auth: e.target.value as Connection["auth"] })}>
          <option value="none">none</option>
          <option value="basic">user and password</option>
          <option value="apikey">API key</option>
        </select>
      </label>
      {c.auth === "basic" && (
        <div className="row2">
          <label><span>User</span><input value={c.username} onChange={e => setC({ ...c, username: e.target.value })} autoComplete="username" /></label>
          <label><span>Password</span><input type="password" value={c.password} onChange={e => setC({ ...c, password: e.target.value })} autoComplete="current-password" /></label>
        </div>
      )}
      {c.auth === "apikey" && (
        <label><span>API key (the encoded form)</span><input type="password" value={c.apiKey} onChange={e => setC({ ...c, apiKey: e.target.value })} spellCheck={false} /></label>
      )}
      {c.auth !== "none" && (
        <label className="check">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          <span>Remember the password or key in this browser (kept in local storage, in plain text)</span>
        </label>
      )}
      <div className="buttons">
        <span className="spacer" />
        <button type="button" onClick={() => setC(connection)} disabled={!changed}>Undo</button>
        <button type="submit" className="primary" disabled={!changed}>Save</button>
      </div>
      <h3>How to connect</h3>
      <ConnectGuide connection={c} auto />
    </form>
  );
}

const PROVIDERS = ["ollama", "openai", "anthropic", "gemini"];

const PRESETS: { name: string; set: Partial<Record<AiKey, string>> }[] = [
  { name: "Ollama, local", set: { provider: "ollama", model: "qwen2.5-coder:7b", url: "http://localhost:11434" } },
  { name: "OpenAI", set: { provider: "openai", model: "gpt-4o-mini", url: "" } },
  { name: "Anthropic", set: { provider: "anthropic", model: "claude-sonnet-4-5", url: "" } },
  { name: "Gemini", set: { provider: "gemini", model: "gemini-2.5-flash", url: "" } },
  { name: "Groq", set: { provider: "openai", model: "llama-3.3-70b-versatile", url: "https://api.groq.com/openai/v1" } },
  { name: "OpenRouter", set: { provider: "openai", model: "openai/gpt-4o-mini", url: "https://openrouter.ai/api/v1" } },
];

const LABELS: Record<AiKey, [string, string]> = {
  provider: ["Provider", "ollama, openai, anthropic or gemini. openai also covers any OpenAI compatible server."],
  model: ["Model", "The model name as the provider knows it."],
  url: ["URL", "Where the model is. Leave empty for the provider's default."],
  api_key: ["API key", "The node never shows the stored key. Leave empty to keep it as it is."],
  timeout: ["Timeout", "How long to wait for the model, like 60s."],
  analysis_ttl: ["Briefing lifetime", "How long what it worked out about an index stays good for, like 24h."],
};

function AiTab({ connection, onModel }: { connection: Connection; onModel: (m: string) => void }) {
  const [current, setCurrent] = useState<Record<AiKey, AiSetting> | null>(null);
  const [form, setForm] = useState<Record<AiKey, string>>({} as Record<AiKey, string>);
  const [scope, setScope] = useState<"transient" | "persistent">("transient");
  const [state, setState] = useState<{ busy?: string; ok?: string; bad?: string; detail?: unknown }>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    setState({ busy: "Reading the settings…" });
    try {
      const r = await es(connection, "GET", "/_cluster/settings?include_defaults=true&flat_settings=true");
      if (!r.ok) { setState({ bad: `${r.status}: ${reasonFrom(r.data)}`, detail: r.data }); return; }
      const s = readAiSettings(r.data);
      setCurrent(s);
      const f = {} as Record<AiKey, string>;
      for (const k of AI_KEYS) f[k] = k === "api_key" ? "" : effective(s[k]);
      setForm(f);
      setState({});
    } catch (e) {
      setState({ bad: (e as Error).message });
    }
  }, [connection]);

  useEffect(() => { if (!loaded.current) { loaded.current = true; reload(); } }, [reload]);

  const changes = (): Record<string, string | null> => {
    if (!current) return {};
    const out: Record<string, string | null> = {};
    for (const k of AI_KEYS) {
      const v = (form[k] ?? "").trim();
      if (k === "api_key") { if (v) out["nlsearch.api_key"] = v; continue; }
      if (v !== effective(current[k])) out["nlsearch." + k] = v === "" ? null : v;
    }
    return out;
  };
  const pending = changes();
  const count = Object.keys(pending).length;

  const put = async (body: unknown, done: string) => {
    setState({ busy: "Saving…" });
    try {
      const r = await es(connection, "PUT", "/_cluster/settings", body);
      if (!r.ok) { setState({ bad: `${r.status}: ${reasonFrom(r.data)}`, detail: r.data }); return; }
      await reload();
      setState({ ok: done });
    } catch (e) { setState({ bad: (e as Error).message }); }
  };

  const tryIt = async () => {
    setState({ busy: "Asking the model a test question…" });
    const started = Date.now();
    try {
      const r = await es(connection, "POST", "/_nl", { prompt: "list the indices", response: "raw" });
      const s = ((Date.now() - started) / 1000).toFixed(1);
      if (r.ok) { setState({ ok: `${r.data.model || "The model"} answered in ${s}s.` }); if (r.data.model) onModel(r.data.model); }
      else setState({ bad: `${r.status} after ${s}s: ${reasonFrom(r.data)}`, detail: r.data });
    } catch (e) { setState({ bad: e instanceof Unreachable ? e.message : String(e) }); }
  };

  const reset = () => {
    const nulls: Record<string, null> = {};
    for (const k of AI_KEYS) nulls["nlsearch." + k] = null;
    setConfirmReset(false);
    put({ persistent: nulls, transient: nulls }, "Every override is cleared; the node is back to elasticsearch.yml.");
  };

  return (
    <div className="form">
      <p className="help">
        These are the plugin&apos;s own settings, read from and written to <code>_cluster/settings</code>. A change takes effect on the next
        question, without a restart. It needs a user allowed to change cluster settings.
      </p>
      {!current && state.bad && <p className="bad-line">{state.bad}</p>}
      {current && (
        <>
          <div className="presets">
            {PRESETS.map(p => (
              <button type="button" key={p.name} className="chip" onClick={() => setForm({ ...form, ...p.set })}>{p.name}</button>
            ))}
          </div>
          <div className="ai-grid">
            {AI_KEYS.map(k => (
              <label key={k}>
                <span>{LABELS[k][0]} <em className="src">{k === "api_key" ? "hidden by the node" : source(current[k])}</em></span>
                {k === "provider" ? (
                  <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>
                    {!PROVIDERS.includes(form.provider) && <option value={form.provider}>{form.provider || "(default)"}</option>}
                    {PROVIDERS.map(v => <option key={v}>{v}</option>)}
                  </select>
                ) : (
                  <input
                    type={k === "api_key" ? "password" : "text"}
                    value={form[k] ?? ""}
                    placeholder={k === "api_key" ? "unchanged" : k === "url" ? "provider default" : ""}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={e => setForm({ ...form, [k]: e.target.value })}
                  />
                )}
                <small>{LABELS[k][1]}</small>
              </label>
            ))}
          </div>
          <div className="scope">
            <label className="check"><input type="radio" checked={scope === "transient"} onChange={() => setScope("transient")} /> <span>transient: gone after a full cluster restart</span></label>
            <label className="check"><input type="radio" checked={scope === "persistent"} onChange={() => setScope("persistent")} /> <span>persistent: survives a restart</span></label>
          </div>
          {count > 0 && <Json value={{ [scope]: pending }} />}
          <div className="buttons">
            <button type="button" onClick={tryIt}>Ask a test question</button>
            <button type="button" onClick={reload}>Reload</button>
            {confirmReset
              ? <><button type="button" className="warn" onClick={reset}>Clear every override</button><button type="button" onClick={() => setConfirmReset(false)}>Keep</button></>
              : <button type="button" onClick={() => setConfirmReset(true)} title="Null every nlsearch setting, persistent and transient">Put everything back…</button>}
            <span className="spacer" />
            <button type="button" className="primary" disabled={!count} onClick={() => put({ [scope]: pending }, `Saved ${count} ${count === 1 ? "setting" : "settings"} as ${scope}.`)}>
              Apply{count ? ` (${count})` : ""}
            </button>
          </div>
        </>
      )}
      {state.busy && <p className="help">{state.busy}</p>}
      {state.ok && <p className="ok-line">{state.ok}</p>}
      {current && state.bad && <p className="bad-line">{state.bad}</p>}
    </div>
  );
}

function AppearanceTab({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  return (
    <div className="form">
      <div className="presets">
        {(["system", "light", "dark"] as Theme[]).map(t => (
          <button key={t} className={"chip" + (theme === t ? " on" : "")} onClick={() => onTheme(t)}>{t}</button>
        ))}
      </div>
      <h3>Keys</h3>
      <table className="keys">
        <tbody>
          <tr><td><kbd>Enter</kbd></td><td>send</td></tr>
          <tr><td><kbd>Shift</kbd> <kbd>Enter</kbd></td><td>new line</td></tr>
          <tr><td><kbd>↑</kbd> in an empty box</td><td>edit the last question</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>stop waiting for the answer</td></tr>
          <tr><td><kbd>Ctrl/⌘</kbd> <kbd>Shift</kbd> <kbd>O</kbd></td><td>new chat</td></tr>
          <tr><td><kbd>Ctrl/⌘</kbd> <kbd>K</kbd></td><td>search chats</td></tr>
          <tr><td><kbd>Alt</kbd> <kbd>↑</kbd> / <kbd>↓</kbd></td><td>previous / next chat</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function DataTab({ chats, onImport, onClearAll }: { chats: Chat[]; onImport: (c: Chat[]) => void; onClearAll: () => void }) {
  const [msg, setMsg] = useState<{ ok?: string; bad?: string }>({});
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="form">
      <p className="help">Chats are kept in this browser only. Each one has its own session, so the node keeps its own copy in <code>.nlsearch-history</code>.</p>
      <div className="buttons">
        <button onClick={() => download("nlsearch-chats.json", JSON.stringify({ version: 1, chats }, null, 2), "application/json")} disabled={!chats.length}>
          Export all chats ({chats.length})
        </button>
        <label className="button">
          Import chats…
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async e => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const parsed = JSON.parse(await file.text());
                const list: Chat[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed.chats) ? parsed.chats : [parsed];
                const good = list.filter(c => c && typeof c.session === "string" && Array.isArray(c.turns));
                if (!good.length) throw new Error("no chats in that file");
                onImport(good);
                setMsg({ ok: `Imported ${good.length} ${good.length === 1 ? "chat" : "chats"}.` });
              } catch (err) { setMsg({ bad: "Could not import: " + (err as Error).message }); }
            }}
          />
        </label>
        <span className="spacer" />
        {confirm
          ? <><button className="warn" onClick={() => { setConfirm(false); onClearAll(); setMsg({ ok: "Every chat is gone from this browser." }); }}>Delete every chat</button><button onClick={() => setConfirm(false)}>Keep</button></>
          : <button onClick={() => setConfirm(true)} disabled={!chats.length}>Delete every chat…</button>}
      </div>
      {msg.ok && <p className="ok-line">{msg.ok}</p>}
      {msg.bad && <p className="bad-line">{msg.bad}</p>}
    </div>
  );
}
