"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chat, Connection, Mode, Theme, Turn } from "@/lib/types";
import { base, es, reasonFrom, sentence, Unreachable } from "@/lib/es";
import { chatToMarkdown, DEFAULT_CONNECTION, download, fileName, load, newChat, save, titleFrom, uid } from "@/lib/store";
import { Message } from "@/components/Message";
import { Sidebar } from "@/components/Sidebar";
import { Settings, type Tab } from "@/components/Settings";
import { PluginLinks } from "@/components/Install";
import { Briefings, StoredHistory, StoredSessions, tryJson, type StoredTurn } from "@/components/Node";

type Panel = null | { kind: "settings"; tab: Tab } | { kind: "briefings" } | { kind: "stored" } | { kind: "sessions" };

const TRY = [
  "what indices do I have",
  "how many products are there per category",
  "red shoes under 50",
  "now only the ones in stock",
];

const VERSION = "0.3";

export default function Page() {
  const [ready, setReady] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>(DEFAULT_CONNECTION);
  const [remember, setRemember] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [health, setHealth] = useState<"unknown" | "on" | "off">("unknown");
  const [nodeInfo, setNodeInfo] = useState("connecting…");
  const [model, setModel] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const connRef = useRef(connection);
  connRef.current = connection;
  const controllers = useRef(new Map<string, AbortController>());
  const threadRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const active = chats.find(c => c.id === activeId) || null;
  const activeBusy = !!active && busy.has(active.id);

  // ---- loading and saving ----------------------------------------------------

  const loaded = useRef(false);
  useEffect(() => {
    // once only: the second run under strict mode would no longer see ?es=
    if (loaded.current) return;
    loaded.current = true;
    const saved = load();
    let list = saved?.chats?.length ? saved.chats : [newChat()];
    let conn = saved?.connection || DEFAULT_CONNECTION;
    const asked = new URLSearchParams(location.search).get("es");
    if (asked) {
      conn = { ...conn, url: asked };
      history.replaceState(null, "", location.pathname);
    }
    setChats(list);
    setActiveId(saved?.activeId && list.some(c => c.id === saved.activeId) ? saved.activeId : list[0].id);
    setConnection(conn);
    setRemember(!!saved?.rememberSecrets);
    setTheme(saved?.theme || "system");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => save({ chats, activeId, connection, theme, rememberSecrets: remember }), 250);
    return () => clearTimeout(t);
  }, [ready, chats, activeId, connection, theme, remember]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme; else root.dataset.theme = theme;
  }, [theme]);

  // ---- the node --------------------------------------------------------------

  const checkNode = useCallback(async (conn: Connection) => {
    setHealth("unknown");
    setNodeInfo(base(conn.url) + " · connecting…");
    try {
      const r = await es(conn, "GET", "/");
      if (r.ok) {
        setHealth("on");
        setNodeInfo(`${base(conn.url)} · ${r.data.cluster_name || "cluster"} · ES ${r.data.version?.number || "?"}`);
      } else {
        setHealth("off");
        setNodeInfo(`${base(conn.url)} · ${r.status === 401 ? "needs credentials" : r.status + " " + reasonFrom(r.data)}`);
      }
    } catch {
      setHealth("off");
      setNodeInfo(`${base(conn.url)} · not reachable`);
    }
  }, []);

  useEffect(() => { if (ready) checkNode(connection); }, [ready, connection, checkNode]);

  // ---- chats -----------------------------------------------------------------

  const update = useCallback((chatId: string, fn: (c: Chat) => Chat) => {
    setChats(cs => cs.map(c => (c.id === chatId ? fn(c) : c)));
  }, []);

  const patchTurn = useCallback((chatId: string, turnId: string, patch: Partial<Turn>) => {
    update(chatId, c => ({ ...c, updated: Date.now(), turns: c.turns.map(t => (t.id === turnId ? { ...t, ...patch } : t)) }));
  }, [update]);

  const markBusy = () => setBusy(new Set(controllers.current.keys()));

  const ask = useCallback(async (chatId: string, prompt: string, opts: { dryRun?: boolean; truncate?: number } = {}) => {
    const chat = chatsRef.current.find(c => c.id === chatId);
    if (!chat || controllers.current.has(chatId)) return;
    const dryRun = opts.dryRun ?? chat.dryRun;
    const now = Date.now();
    const me: Turn = { id: uid("t"), role: "me", text: prompt, at: now };
    const them: Turn = { id: uid("t"), role: "them", kind: "answer", text: "", at: now, status: "pending", prompt, dryRun };
    update(chatId, c => {
      const kept = opts.truncate !== undefined ? c.turns.slice(0, opts.truncate) : c.turns;
      return { ...c, title: c.title === "New chat" ? titleFrom(prompt) : c.title, updated: now, turns: [...kept, me, them] };
    });
    setAtBottom(true);

    const control = new AbortController();
    controllers.current.set(chatId, control);
    markBusy();

    const body: Record<string, unknown> = { prompt, session: chat.session, response: chat.mode };
    if (dryRun) body.dry_run = true;
    try {
      const r = await es(connRef.current, "POST", "/_nl", body, control.signal);
      const seconds = (Date.now() - now) / 1000;
      if (r.data?.model) setModel(r.data.model);
      setHealth(r.status >= 500 && r.status !== 502 ? "off" : "on");
      patchTurn(chatId, them.id, r.ok
        ? { status: "ok", data: r.data, httpStatus: r.status, seconds, text: sentence(r.data, dryRun) }
        : { status: "error", data: r.data, httpStatus: r.status, seconds, text: reasonFrom(r.data) });
    } catch (broken) {
      const seconds = (Date.now() - now) / 1000;
      if ((broken as Error)?.name === "AbortError") {
        patchTurn(chatId, them.id, { status: "stopped", seconds, text: "Stopped waiting. The node may still finish it, and if it does the turn is in this session's history." });
      } else {
        setHealth("off");
        patchTurn(chatId, them.id, { status: "error", seconds, text: broken instanceof Unreachable ? broken.message : "The page could not reach the node: " + broken });
      }
    } finally {
      controllers.current.delete(chatId);
      markBusy();
    }
  }, [update, patchTurn]);

  const stop = useCallback((chatId: string) => controllers.current.get(chatId)?.abort(), []);

  const analyze = useCallback(async (chatId: string) => {
    const turn: Turn = { id: uid("t"), role: "them", kind: "analyze", text: "", at: Date.now(), status: "pending" };
    update(chatId, c => ({ ...c, updated: Date.now(), turns: [...c.turns, turn] }));
    setAtBottom(true);
    try {
      const r = await es(connRef.current, "POST", "/_nl/analyze", {});
      const seconds = (Date.now() - turn.at) / 1000;
      if (!r.ok) { patchTurn(chatId, turn.id, { status: "error", data: r.data, httpStatus: r.status, seconds, text: reasonFrom(r.data) }); return; }
      const names = Object.keys(r.data.indices || {});
      patchTurn(chatId, turn.id, {
        status: "ok", data: r.data, seconds,
        text: names.length
          ? `Worked out what ${names.length} ${names.length === 1 ? "index holds" : "indices hold"}: ${names.join(", ")}. ${r.data.analysed || 0} written.`
          : "There was nothing to look at.",
      });
    } catch (e) {
      patchTurn(chatId, turn.id, { status: "error", text: (e as Error).message });
    }
  }, [update, patchTurn]);

  const createChat = useCallback(() => {
    const current = chatsRef.current.find(c => c.id === activeId);
    if (current && current.turns.length === 0) { boxRef.current?.focus(); setSideOpen(false); return; }
    const c = newChat();
    setChats(cs => [c, ...cs]);
    setActiveId(c.id);
    setSideOpen(false);
    setTimeout(() => boxRef.current?.focus(), 0);
  }, [activeId]);

  const pick = (id: string) => {
    setActiveId(id);
    setSideOpen(false);
    setEditingId(null);
    setAtBottom(true);
    setTimeout(() => boxRef.current?.focus(), 0);
  };

  const remove = (id: string) => {
    stop(id);
    const rest = chatsRef.current.filter(c => c.id !== id);
    if (!rest.length) rest.push(newChat());
    setChats(rest);
    if (id === activeId) setActiveId([...rest].sort((a, b) => b.updated - a.updated)[0].id);
  };

  const forget = async (session: string) => {
    try {
      const r = await es(connRef.current, "DELETE", `/.nlsearch-history/_doc/${encodeURIComponent(session)}`);
      if (r.status === 404) return "Nothing was stored for it.";
      return r.ok ? "Forgotten. The next question in this chat starts clean." : `${r.status}: ${reasonFrom(r.data)}`;
    } catch (e) { return (e as Error).message; }
  };

  const openStored = (session: string, turns: StoredTurn[]) => {
    const existing = chatsRef.current.find(c => c.session === session);
    if (existing) { pick(existing.id); setPanel(null); return; }
    const c = newChat();
    c.session = session;
    c.title = turns[0]?.prompt ? titleFrom(turns[0].prompt) : session;
    const now = Date.now();
    c.turns = turns.flatMap((t): Turn[] => [
      { id: uid("t"), role: "me", text: t.prompt, at: now },
      { id: uid("t"), role: "them", kind: "stored", status: "ok", at: now, text: t.outcome || "(stored without an outcome)", data: t.answer ? tryJson(t.answer) : undefined },
    ]);
    // an empty chat that was only open to get here is replaced rather than left behind
    setChats(cs => [c, ...cs.filter(x => x.id !== activeId || x.turns.length > 0)]);
    pick(c.id);
    setPanel(null);
  };

  // ---- scrolling -------------------------------------------------------------

  const lastTurn = active?.turns[active.turns.length - 1];
  useEffect(() => {
    const el = threadRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [activeId, active?.turns.length, lastTurn?.status, atBottom]);

  // ---- keys ------------------------------------------------------------------

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); createChat(); return; }
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setSideOpen(true); setTimeout(() => searchRef.current?.focus(), 0); return; }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const sorted = [...chatsRef.current].sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || b.updated - a.updated);
        const i = sorted.findIndex(c => c.id === activeId);
        const next = sorted[i + (e.key === "ArrowUp" ? -1 : 1)];
        if (next) pick(next.id);
        return;
      }
      if (e.key === "Escape" && !panel && activeId && controllers.current.has(activeId) && !editingId) stop(activeId);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createChat, activeId, panel, editingId, stop]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const knownSessions = useMemo(() => new Set(chats.map(c => c.session)), [chats]);

  // ---- the window ------------------------------------------------------------

  const draft = active?.draft || "";
  const setDraft = (text: string) => active && update(active.id, c => ({ ...c, draft: text }));
  const submit = () => {
    const q = draft.trim();
    if (!active || !q || activeBusy) return;
    update(active.id, c => ({ ...c, draft: "" }));
    ask(active.id, q);
  };

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = Math.min(box.scrollHeight, 144) + "px";
  }, [draft, activeId]);

  const turns = active?.turns || [];
  const lastMine = [...turns].reverse().find(t => t.role === "me");

  return (
    <div className="app">
      <Sidebar
        chats={chats}
        activeId={activeId}
        busy={busy}
        open={sideOpen}
        searchRef={searchRef}
        onPick={pick}
        onNew={createChat}
        onRename={(id, title) => update(id, c => ({ ...c, title }))}
        onDelete={remove}
        onPin={id => update(id, c => ({ ...c, pinned: !c.pinned }))}
        onFromNode={() => { setPanel({ kind: "sessions" }); setSideOpen(false); }}
        onClose={() => setSideOpen(false)}
      />

      <div className="main">
        <header>
          <button className="ghost menu-toggle" onClick={() => setSideOpen(o => !o)} aria-label="Chats">☰</button>
          <h1>nlsearch</h1>
          <button className="where ghost" onClick={() => setPanel({ kind: "settings", tab: "connection" })} title="Change the Elasticsearch URL">
            <span className={"dot " + health} /> <span className="where-text">{nodeInfo}</span>
          </button>
          <button className="model ghost" onClick={() => setPanel({ kind: "settings", tab: "ai" })} title="The model that answered last. Change it here.">
            {model || "model"}
          </button>
          <span className="spacer" />
          <button className="hide-sm" disabled={!active} onClick={() => active && analyze(active.id)} title="Work out what the indices mean, now rather than on the first question">Analyze indices</button>
          <button className="hide-sm" onClick={() => setPanel({ kind: "briefings" })} title="What it has worked out about each index">What it knows</button>
          <div className="menu-wrap">
            <button onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }} aria-haspopup="menu" aria-expanded={menuOpen} title="This chat">⋯</button>
            {menuOpen && active && (
              <div className="menu" role="menu" onClick={e => e.stopPropagation()}>
                <button className="show-sm" role="menuitem" onClick={() => { setMenuOpen(false); analyze(active.id); }}>Analyze indices</button>
                <button className="show-sm" role="menuitem" onClick={() => { setMenuOpen(false); setPanel({ kind: "briefings" }); }}>What it knows</button>
                <button role="menuitem" onClick={() => { setMenuOpen(false); setPanel({ kind: "stored" }); }}>Stored on the node…</button>
                <button role="menuitem" onClick={() => { setMenuOpen(false); update(active.id, c => ({ ...c, session: newChat().session })); }} title="Same window, but the model stops seeing the earlier turns">New session for this chat</button>
                <hr />
                <button role="menuitem" disabled={!turns.length} onClick={() => { setMenuOpen(false); download(fileName(active.title, "md"), chatToMarkdown(active), "text/markdown"); }}>Export as Markdown</button>
                <button role="menuitem" disabled={!turns.length} onClick={() => { setMenuOpen(false); download(fileName(active.title, "json"), JSON.stringify(active, null, 2), "application/json"); }}>Export as JSON</button>
                <button role="menuitem" disabled={!turns.length || activeBusy} onClick={() => { setMenuOpen(false); update(active.id, c => ({ ...c, turns: [] })); }}>Clear the window</button>
              </div>
            )}
          </div>
          <button onClick={() => setPanel({ kind: "settings", tab: "connection" })} title="Settings" aria-label="Settings">⚙</button>
        </header>

        <div
          id="thread"
          ref={threadRef}
          onScroll={e => {
            const el = e.currentTarget;
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
          }}
        >
          <div className="wrap">
            {ready && active && turns.length === 0 && (
              <div className="hint">
                <p>Ask about your data in plain English.</p>
                <ul>
                  {TRY.map(q => <li key={q}><button className="try" onClick={() => ask(active.id, q)}>{q}</button></li>)}
                </ul>
                <p style={{ marginTop: "1.2rem" }}>
                  Follow-ups work: the session is kept for you.<br />
                  Tick <code>dry run</code> before trying anything that writes.
                </p>
                {health === "off" && (
                  <p className="hint-warn">
                    The node at <code>{base(connection.url)}</code> is not answering this page.{" "}
                    <button className="ghost link" onClick={() => setPanel({ kind: "settings", tab: "connection" })}>How to connect</button>
                  </p>
                )}
                <div className="hint-plugin">
                  <p>New to nlsearch? <button className="ghost link" onClick={() => setPanel({ kind: "settings", tab: "plugin" })}>Install the plugin</button></p>
                  <PluginLinks />
                </div>
              </div>
            )}
            {active && turns.map((t, i) => {
              const prev = turns[i - 1];
              const retryable = t.role === "them" && t.kind === "answer" && t.status !== "pending" && prev?.role === "me";
              return (
                <Message
                  key={t.id}
                  turn={t}
                  busy={activeBusy}
                  editing={editingId === t.id}
                  onStartEdit={() => setEditingId(t.id)}
                  onCancelEdit={() => { setEditingId(null); boxRef.current?.focus(); }}
                  onEdit={t.role === "me" ? text => { setEditingId(null); ask(active.id, text, { truncate: i }); } : undefined}
                  onRetry={retryable ? () => ask(active.id, t.prompt || prev.text, { dryRun: t.dryRun, truncate: i - 1 }) : undefined}
                  onRunForReal={retryable ? () => ask(active.id, t.prompt || prev.text, { dryRun: false }) : undefined}
                  onHelp={t.status === "error" && !t.httpStatus ? () => setPanel({ kind: "settings", tab: "connection" }) : undefined}
                />
              );
            })}
          </div>
          {!atBottom && (
            <button className="to-bottom" onClick={() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; setAtBottom(true); }} aria-label="Scroll to the newest message">↓</button>
          )}
        </div>

        <footer>
          <div className="composer">
            <textarea
              ref={boxRef}
              rows={1}
              value={draft}
              placeholder="Ask something, then press Enter…"
              autoFocus
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
                if (e.key === "ArrowUp" && !draft && lastMine && !activeBusy) { e.preventDefault(); setEditingId(lastMine.id); }
              }}
            />
            {activeBusy
              ? <button className="stop" onClick={() => active && stop(active.id)} title="Stop waiting (Esc)">Stop</button>
              : <button className="primary" onClick={submit} disabled={!draft.trim()}>Send</button>}
          </div>
          {active && (
            <div className="controls">
              <label className="toggle">
                <input type="checkbox" checked={active.dryRun} onChange={e => update(active.id, c => ({ ...c, dryRun: e.target.checked }))} />
                dry run <span className="soft">(plan only, nothing happens)</span>
              </label>
              <label className="toggle">answer
                <select value={active.mode} onChange={e => update(active.id, c => ({ ...c, mode: e.target.value as Mode }))}>
                  <option value="both">sentence and data</option>
                  <option value="explain">sentence only</option>
                  <option value="raw">data only</option>
                </select>
              </label>
              <span className="toggle soft" title="Sent with every message of this chat, so follow-ups work">session <code>{active.session}</code></span>
              <span className="spacer" />
              <a className="toggle soft" href="https://github.com/sheikmohammedsha/nlsearch-runner" target="_blank" rel="noreferrer">runner {VERSION}</a>
            </div>
          )}
        </footer>
      </div>

      {panel?.kind === "settings" && (
        <Settings
          tab={panel.tab}
          setTab={tab => setPanel({ kind: "settings", tab })}
          connection={connection}
          rememberSecrets={remember}
          theme={theme}
          chats={chats}
          onConnection={(c, r) => { setConnection(c); setRemember(r); }}
          onTheme={setTheme}
          onImport={list => {
            const fresh = list.map(c => ({ ...newChat(), ...c, id: uid("c") }));
            setChats(cs => [...fresh, ...cs]);
          }}
          onClearAll={() => { controllers.current.forEach(c => c.abort()); const c = newChat(); setChats([c]); setActiveId(c.id); }}
          onModel={setModel}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === "briefings" && active && (
        <Briefings connection={connection} session={active.session} onClose={() => setPanel(null)} />
      )}
      {panel?.kind === "stored" && active && (
        <StoredHistory connection={connection} session={active.session} onForget={() => forget(active.session)} onClose={() => setPanel(null)} />
      )}
      {panel?.kind === "sessions" && (
        <StoredSessions connection={connection} known={knownSessions} onOpen={openStored} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}
