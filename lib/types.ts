export type Mode = "both" | "explain" | "raw";

export type Auth = "none" | "basic" | "apikey";

export interface Connection {
  url: string;
  auth: Auth;
  username: string;
  password: string;
  apiKey: string;
}

/** One bubble. An answer remembers the prompt it answers, so it can be retried or run for real. */
export interface Turn {
  id: string;
  role: "me" | "them";
  text: string;
  at: number;
  kind?: "answer" | "analyze" | "stored";
  status?: "pending" | "ok" | "error" | "stopped";
  prompt?: string;
  dryRun?: boolean;
  data?: any;
  httpStatus?: number;
  seconds?: number;
}

export interface Chat {
  id: string;
  title: string;
  session: string;
  created: number;
  updated: number;
  pinned?: boolean;
  dryRun: boolean;
  mode: Mode;
  draft?: string;
  turns: Turn[];
}

export type Theme = "system" | "light" | "dark";
