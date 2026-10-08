"use client";

import { useEffect, useState } from "react";
import type { Connection } from "@/lib/types";
import { es, reasonFrom } from "@/lib/es";
import { Fold, Json, Modal } from "./Bits";

type Load<T> = { busy: true } | { busy: false; value?: T; bad?: string };

function useLoad<T>(run: () => Promise<T>, deps: unknown[]): [Load<T>, () => void] {
  const [state, setState] = useState<Load<T>>({ busy: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ busy: true });
    run().then(value => { if (live) setState({ busy: false, value }); })
      .catch(e => { if (live) setState({ busy: false, bad: (e as Error).message }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return [state, () => setTick(t => t + 1)];
}

async function must(conn: Connection, method: string, path: string, body?: unknown) {
  const r = await es(conn, method, path, body);
  if (!r.ok) throw new Error(`${r.status}: ${reasonFrom(r.data)}`);
  return r.data;
}

/** GET /_nl/analyze: what the plugin believes each index holds. */
export function Briefings({ connection, session, onClose }: { connection: Connection; session: string; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [state, reload] = useLoad(() => must(connection, "GET", "/_nl/analyze"), [connection]);

  const redo = async (force: boolean, mine: boolean) => {
    setBusy(force ? "Looking at the data again…" : "Looking at the data…");
    try {
      await must(connection, "POST", "/_nl/analyze" + (force ? "?force=true" : ""), mine ? { session } : {});
      reload();
    } catch (e) { setBusy((e as Error).message); return; }
    setBusy(null);
  };

  const indices = !state.busy && state.value ? Object.entries<any>(state.value.indices || state.value || {}) : [];
  return (
    <Modal title="What it has worked out" onClose={onClose} wide>
      <p className="help">
        The briefing nlsearch keeps for each index: what the fields are for and what coded values mean. When an answer comes back wrong,
        this is the first place to look.
      </p>
      <div className="buttons">
        <button onClick={() => redo(false, false)} disabled={!!busy && busy.endsWith("…")}>Analyze now</button>
        <button onClick={() => redo(true, false)} disabled={!!busy && busy.endsWith("…")} title="POST /_nl/analyze?force=true">Redo everything</button>
        <button onClick={() => redo(true, true)} disabled={!!busy && busy.endsWith("…")} title="Kept for this conversation alone">Redo for this chat only</button>
      </div>
      {busy && <p className="help">{busy}</p>}
      {state.busy && <p className="help">Reading…</p>}
      {!state.busy && state.bad && <p className="bad-line">{state.bad}</p>}
      {!state.busy && !state.bad && indices.length === 0 && <p className="help">Nothing worked out yet. It happens on the first question, or press Analyze now.</p>}
      {indices.map(([name, text]) => (
        <Fold key={name} label={name} open={indices.length < 4}><Json value={text} /></Fold>
      ))}
    </Modal>
  );
}

export interface StoredTurn { prompt: string; answer?: string; outcome?: string }

/** GET /.nlsearch-history/_doc/<session>: the turns the node has kept for one chat. */
export function StoredHistory({ connection, session, onClose, onForget }: { connection: Connection; session: string; onClose: () => void; onForget: () => Promise<string> }) {
  const [state, reload] = useLoad(async () => {
    const r = await es(connection, "GET", `/.nlsearch-history/_doc/${encodeURIComponent(session)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status}: ${reasonFrom(r.data)}`);
    return r.data._source as { turns?: StoredTurn[]; updated?: string };
  }, [connection, session]);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const turns = !state.busy && state.value ? state.value.turns || [] : [];
  return (
    <Modal title={`Stored on the node: ${session}`} onClose={onClose} wide>
      <p className="help">
        Every turn of this session as the node keeps it. The last ten are what the model sees for a follow-up. The outcome line is how
        a later &quot;make it 22&quot; knows which document is meant.
      </p>
      {state.busy && <p className="help">Reading…</p>}
      {!state.busy && state.bad && <p className="bad-line">{state.bad}</p>}
      {!state.busy && !state.bad && state.value === null && <p className="help">Nothing is stored for this session yet. It is written on the first question.</p>}
      {turns.length > 0 && (
        <ol className="stored">
          {turns.map((t, i) => (
            <li key={i} className={i >= turns.length - 10 ? "seen" : ""}>
              <div className="stored-prompt">{t.prompt}</div>
              {t.outcome && <div className="meta">→ {t.outcome}</div>}
              {t.answer && <Fold label="what it planned"><Json value={tryJson(t.answer)} /></Fold>}
            </li>
          ))}
        </ol>
      )}
      <div className="buttons">
        <button onClick={reload}>Reload</button>
        <span className="spacer" />
        {confirm
          ? <><button className="warn" onClick={async () => { setConfirm(false); setMsg(await onForget()); reload(); }}>Forget it on the node</button><button onClick={() => setConfirm(false)}>Keep</button></>
          : <button onClick={() => setConfirm(true)} disabled={!turns.length}>Forget this conversation…</button>}
      </div>
      {msg && <p className="help">{msg}</p>}
    </Modal>
  );
}

export function tryJson(text: string) {
  try { return JSON.parse(text); } catch { return text; }
}

/** GET /.nlsearch-history/_search: every conversation the node has, to open one here. */
export function StoredSessions({ connection, known, onOpen, onClose }: {
  connection: Connection;
  known: Set<string>;
  onOpen: (session: string, turns: StoredTurn[]) => void;
  onClose: () => void;
}) {
  const [state] = useLoad(async () => {
    const r = await es(connection, "GET", "/.nlsearch-history/_search?size=200&_source=updated");
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(`${r.status}: ${reasonFrom(r.data)}`);
    return (r.data.hits?.hits || [])
      .map((h: any) => ({ id: h._id as string, updated: h._source?.updated as string | undefined }))
      .sort((a: any, b: any) => String(b.updated || "").localeCompare(String(a.updated || "")));
  }, [connection]);
  const [opening, setOpening] = useState<string | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const open = async (id: string) => {
    setOpening(id); setBad(null);
    try {
      const data = await must(connection, "GET", `/.nlsearch-history/_doc/${encodeURIComponent(id)}`);
      onOpen(id, data._source?.turns || []);
    } catch (e) { setBad((e as Error).message); }
    setOpening(null);
  };

  const list = !state.busy && state.value ? state.value.filter((s: any) => s.id.includes(filter.trim())) : [];
  return (
    <Modal title="Stored conversations" onClose={onClose}>
      <p className="help">Conversations the node keeps in <code>.nlsearch-history</code>, from this window or from any other client. Opening one continues it with the same session.</p>
      <input className="search" placeholder="Filter by session" value={filter} onChange={e => setFilter(e.target.value)} />
      {state.busy && <p className="help">Reading…</p>}
      {!state.busy && state.bad && <p className="bad-line">{state.bad}</p>}
      {!state.busy && !state.bad && list.length === 0 && <p className="help">No stored conversations{filter ? " match" : " yet"}.</p>}
      <ul className="sessions">
        {list.map((s: any) => (
          <li key={s.id}>
            <button className="ghost session-row" onClick={() => open(s.id)} disabled={!!opening}>
              <code>{s.id}</code>
              <span className="meta">{s.updated ? new Date(s.updated).toLocaleString() : ""}{known.has(s.id) ? " · open here" : ""}</span>
              {opening === s.id && <span className="meta">opening…</span>}
            </button>
          </li>
        ))}
      </ul>
      {bad && <p className="bad-line">{bad}</p>}
    </Modal>
  );
}
