"use client";

import { useMemo, useState } from "react";
import type { Chat } from "@/lib/types";

interface Props {
  chats: Chat[];
  activeId: string | null;
  busy: Set<string>;
  open: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onPick: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onFromNode: () => void;
  onClose: () => void;
}

const DAY = 86400000;

function group(updated: number) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const t = start.getTime();
  if (updated >= t) return "Today";
  if (updated >= t - DAY) return "Yesterday";
  if (updated >= t - 7 * DAY) return "Previous 7 days";
  if (updated >= t - 30 * DAY) return "Previous 30 days";
  return "Older";
}

export function Sidebar({ chats, activeId, busy, open, searchRef, onPick, onNew, onRename, onDelete, onPin, onFromNode, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = chats.filter(c => !q || c.title.toLowerCase().includes(q) || c.session.includes(q) || c.turns.some(t => t.text.toLowerCase().includes(q)));
    const sorted = [...found].sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || b.updated - a.updated);
    const out: [string, Chat[]][] = [];
    for (const c of sorted) {
      const g = c.pinned ? "Pinned" : group(c.updated);
      const last = out[out.length - 1];
      if (last && last[0] === g) last[1].push(c); else out.push([g, [c]]);
    }
    return out;
  }, [chats, query]);

  const finish = (id: string) => {
    if (name.trim()) onRename(id, name.trim());
    setRenaming(null);
  };

  return (
    <>
      <aside className={"side" + (open ? " open" : "")}>
        <div className="side-top">
          <button className="primary wide" onClick={onNew} title="Ctrl/⌘ + Shift + O">+ New chat</button>
          <input
            ref={searchRef}
            className="search"
            placeholder="Search chats  (Ctrl/⌘ K)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); } }}
          />
        </div>
        <nav className="chats">
          {groups.length === 0 && <p className="empty">{query ? "No chat matches." : "No chats yet."}</p>}
          {groups.map(([label, list]) => (
            <div key={label}>
              <div className="group">{label}</div>
              {list.map(c => (
                <div key={c.id} className={"chat-item" + (c.id === activeId ? " active" : "")}>
                  {renaming === c.id ? (
                    <input
                      className="rename"
                      autoFocus
                      value={name}
                      onChange={e => setName(e.target.value)}
                      onBlur={() => finish(c.id)}
                      onKeyDown={e => { if (e.key === "Enter") finish(c.id); if (e.key === "Escape") setRenaming(null); }}
                    />
                  ) : confirming === c.id ? (
                    <div className="confirm">
                      <span>Delete this chat?</span>
                      <button className="ghost warn" onClick={() => { setConfirming(null); onDelete(c.id); }}>delete</button>
                      <button className="ghost" onClick={() => setConfirming(null)}>keep</button>
                    </div>
                  ) : (
                    <>
                      <button className="chat-title" onClick={() => onPick(c.id)} onDoubleClick={() => { setRenaming(c.id); setName(c.title); }} title={`${c.title}\nsession ${c.session}`}>
                        {busy.has(c.id) && <span className="dot busy" />}
                        {c.pinned && <span className="pin-mark">★</span>}
                        <span className="label">{c.title}</span>
                      </button>
                      <span className="chat-tools">
                        <button className="ghost" title={c.pinned ? "Unpin" : "Pin"} onClick={() => onPin(c.id)}>{c.pinned ? "☆" : "★"}</button>
                        <button className="ghost" title="Rename" onClick={() => { setRenaming(c.id); setName(c.title); }}>✎</button>
                        <button className="ghost" title="Delete" onClick={() => setConfirming(c.id)}>🗑</button>
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <button className="ghost wide" onClick={onFromNode} title="Open a conversation the node has stored in .nlsearch-history">Open a stored conversation…</button>
        </div>
      </aside>
      {open && <div className="side-scrim" onClick={onClose} />}
    </>
  );
}
