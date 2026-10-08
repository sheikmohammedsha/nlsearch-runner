import type { Chat, Connection, Theme, Turn } from "./types";

const KEY = "nlsearch-runner:v1";

export interface Saved {
  chats: Chat[];
  activeId: string | null;
  connection: Connection;
  theme: Theme;
  rememberSecrets: boolean;
}

export const DEFAULT_CONNECTION: Connection = {
  url: "http://localhost:9200",
  auth: "none",
  username: "",
  password: "",
  apiKey: "",
};

export function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export function newChat(): Chat {
  const now = Date.now();
  return {
    id: uid("c"),
    title: "New chat",
    session: "chat-" + Math.random().toString(36).slice(2, 8),
    created: now,
    updated: now,
    dryRun: false,
    mode: "both",
    turns: [],
  };
}

export function titleFrom(prompt: string) {
  const one = prompt.replace(/\s+/g, " ").trim();
  return one.length > 48 ? one.slice(0, 47) + "…" : one || "New chat";
}

export function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    // an answer that was in flight when the tab closed will never arrive
    saved.chats = saved.chats.map(c => ({
      ...c,
      turns: c.turns.map(t => t.status === "pending" ? { ...t, status: "stopped", text: "The page was closed before the answer came back." } as Turn : t),
    }));
    saved.connection = { ...DEFAULT_CONNECTION, ...saved.connection };
    // the address of the proxy earlier builds needed; there is no proxy any more
    if (/^http:\/\/127\.0\.0\.1:878\d\/?$/.test(saved.connection.url)) saved.connection.url = DEFAULT_CONNECTION.url;
    return saved;
  } catch {
    return null;
  }
}

export function save(state: Saved) {
  try {
    const connection = state.rememberSecrets
      ? state.connection
      : { ...state.connection, password: "", apiKey: "" };
    localStorage.setItem(KEY, JSON.stringify({ ...state, connection }));
  } catch {
    // private windows and full storage: the chats live for this tab only
  }
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function chatToMarkdown(chat: Chat) {
  const lines = [`# ${chat.title}`, "", `session \`${chat.session}\``, ""];
  for (const t of chat.turns) {
    if (t.role === "me") {
      lines.push(`**You:** ${t.text}`, "");
      continue;
    }
    lines.push(`**nlsearch:** ${t.text}`, "");
    const d = t.data;
    if (d?.action && d.action !== "reply") {
      const plan: any = { action: d.action };
      for (const k of ["index", "id", "body", "docs"]) if (d[k] !== undefined) plan[k] = d[k];
      lines.push("```json", JSON.stringify(plan, null, 2), "```", "");
    }
  }
  return lines.join("\n");
}

export function fileName(title: string, ext: string) {
  return (title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "chat") + "." + ext;
}
