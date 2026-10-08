import type { Connection } from "./types";

export interface Reply {
  ok: boolean;
  status: number;
  data: any;
}

/** The node could not be reached at all, as opposed to answering with an error. */
export class Unreachable extends Error {}

export function base(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function basic(user: string, password: string) {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  let text = "";
  bytes.forEach(b => { text += String.fromCharCode(b); });
  return btoa(text);
}

export function authHeader(conn: Connection): Record<string, string> {
  if (conn.auth === "basic" && conn.username) return { Authorization: "Basic " + basic(conn.username, conn.password) };
  if (conn.auth === "apikey" && conn.apiKey) return { Authorization: "ApiKey " + conn.apiKey.trim() };
  return {};
}

export async function es(conn: Connection, method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Reply> {
  const headers: Record<string, string> = { ...authHeader(conn) };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let answer: Response;
  try {
    answer = await fetch(base(conn.url) + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (broken) {
    if ((broken as Error)?.name === "AbortError") throw broken;
    // fetch says nothing useful here: a dead node and a CORS refusal look the same
    throw new Unreachable(
      `Could not reach ${base(conn.url)}. Either the node is down, or it does not answer this page yet: ` +
      `Elasticsearch only lets a web page call it once http.cors is set in elasticsearch.yml. ` +
      `"How to connect" shows the lines to add.`
    );
  }

  const raw = await answer.text();
  let data: any = {};
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = { error: raw }; }
  }
  return { ok: answer.ok, status: answer.status, data };
}

export function reasonFrom(data: any): string {
  if (!data) return "Something went wrong.";
  if (typeof data.error === "string") return data.error;
  if (data.error?.reason) return data.error.reason;
  if (data.error?.root_cause?.[0]) return data.error.root_cause[0].reason;
  return JSON.stringify(data).slice(0, 300);
}

/** What to show for a successful /_nl answer. */
export function sentence(data: any, dryRun: boolean): string {
  if (data?.response) return data.response;
  if (data?.text) return data.text;
  if (dryRun || data?.dry_run) return `Planned a ${data?.action || "request"}${data?.index ? " on " + data.index : ""}. Nothing ran.`;
  return "(no sentence came back; see the data below)";
}

/** The plugin's own settings, as the node reports them. */
export const AI_KEYS = ["provider", "model", "url", "api_key", "timeout", "analysis_ttl"] as const;
export type AiKey = typeof AI_KEYS[number];

export interface AiSetting {
  transient?: string;
  persistent?: string;
  fallback?: string;
}

export function readAiSettings(data: any): Record<AiKey, AiSetting> {
  const out = {} as Record<AiKey, AiSetting>;
  for (const key of AI_KEYS) {
    const name = "nlsearch." + key;
    out[key] = {
      transient: data?.transient?.[name],
      persistent: data?.persistent?.[name],
      fallback: data?.defaults?.[name],
    };
  }
  return out;
}

export function effective(s: AiSetting) {
  return s.transient ?? s.persistent ?? s.fallback ?? "";
}

export function source(s: AiSetting) {
  if (s.transient !== undefined) return "transient";
  if (s.persistent !== undefined) return "persistent";
  if (s.fallback !== undefined) return "elasticsearch.yml or default";
  return "not set";
}

export interface Diagnosis {
  kind: "ok" | "no-cors" | "down" | "cert" | "auth" | "no-plugin" | "error";
  detail?: string;
}

/**
 * Works out why the page cannot talk to the node. fetch only ever says "failed",
 * so a second, opaque request tells a node that is up but not answering this
 * page apart from one that is not there at all.
 */
export async function diagnose(conn: Connection, origin: string): Promise<Diagnosis> {
  const url = base(conn.url);
  try {
    const r = await es(conn, "GET", "/");
    if (r.status === 401) return { kind: "auth" };
    if (!r.ok) return { kind: "error", detail: `${r.status}: ${reasonFrom(r.data)}` };
    // a JSON content type makes the browser ask first, the way every POST from the chat does
    const p = await fetch(url + "/_nl/analyze", { headers: { ...authHeader(conn), "Content-Type": "application/json" } }).catch(() => null);
    if (!p) return { kind: "no-cors", detail: "Simple calls work but the preflight is refused: check http.cors.allow-methods and allow-headers." };
    if (p.status === 400 || p.status === 404) {
      const text = await p.text();
      if (/no handler/.test(text)) return { kind: "no-plugin" };
    }
    return { kind: "ok", detail: `${r.data.cluster_name || "cluster"}, Elasticsearch ${r.data.version?.number || "?"}.` };
  } catch {
    // fall through to the opaque probe
  }
  try {
    await fetch(url + "/", { mode: "no-cors" });
    return { kind: "no-cors", detail: `Its http.cors.allow-origin has to match ${origin}.` };
  } catch {
    return url.startsWith("https:") ? { kind: "cert" } : { kind: "down" };
  }
}
