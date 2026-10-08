"use client";

import { useEffect, useState } from "react";
import type { Turn } from "@/lib/types";
import { tablesFrom } from "@/lib/table";
import { Copy, Elapsed, Fold, Json } from "./Bits";

interface Props {
  turn: Turn;
  busy: boolean;
  editing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onEdit?: (text: string) => void;
  onRetry?: () => void;
  onRunForReal?: () => void;
  onHelp?: () => void;
}

function plan(d: any) {
  const p: any = { action: d.action };
  for (const k of ["index", "id", "body", "docs"]) if (d[k] !== undefined) p[k] = d[k];
  return p;
}

function metaLine(t: Turn) {
  const d = t.data || {};
  const bits: string[] = [];
  if (t.status === "error" && t.httpStatus) bits.push(String(t.httpStatus));
  if (d.action) bits.push(d.action);
  if (d.index) bits.push(d.index);
  const total = d.result?.hits?.total;
  if (total && typeof total.value === "number") bits.push(total.value + " hits");
  if (t.dryRun) bits.push("dry run, nothing happened");
  if (t.seconds !== undefined) bits.push(t.seconds.toFixed(1) + "s");
  if (d.model) bits.push(d.model);
  return bits.join(" · ");
}

function Tables({ result }: { result: any }) {
  const tables = tablesFrom(result);
  if (!tables.length) return null;
  return (
    <Fold label={tables.length === 1 ? `table: ${tables[0].title}` : `tables (${tables.length})`} open>
      {tables.map((t, i) => (
        <div className="table-wrap" key={i}>
          {tables.length > 1 && <div className="table-title">{t.title}</div>}
          <table>
            <thead><tr>{t.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{t.rows.map((r, j) => <tr key={j}>{r.map((v, k) => <td key={k} title={v}>{v}</td>)}</tr>)}</tbody>
          </table>
          {t.more ? <div className="meta">and {t.more} more not shown</div> : null}
        </div>
      ))}
    </Fold>
  );
}

export function Message({ turn, busy, editing, onStartEdit, onCancelEdit, onEdit, onRetry, onRunForReal, onHelp }: Props) {
  const [draft, setDraft] = useState(turn.text);
  useEffect(() => { if (editing) setDraft(turn.text); }, [editing, turn.text]);
  const setEditing = (on: boolean) => { if (on) onStartEdit?.(); else onCancelEdit?.(); };
  const when = new Date(turn.at).toLocaleString();

  if (turn.role === "me") {
    return (
      <div className="turn me">
        <div className="stack">
          {editing ? (
            <div className="bubble editing">
              <textarea
                value={draft}
                autoFocus
                rows={Math.min(8, draft.split("\n").length + 1)}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim()) { setEditing(false); onEdit?.(draft.trim()); } }
                  if (e.key === "Escape") { setEditing(false); setDraft(turn.text); }
                }}
              />
              <div className="edit-row">
                <span className="meta">Answers after this one are dropped from the window.</span>
                <button onClick={() => { setEditing(false); setDraft(turn.text); }}>Cancel</button>
                <button className="primary" disabled={!draft.trim() || busy} onClick={() => { setEditing(false); onEdit?.(draft.trim()); }}>Send</button>
              </div>
            </div>
          ) : (
            <div className="bubble" title={when}>{turn.text}</div>
          )}
          {!editing && (
            <div className="actions">
              <Copy text={turn.text} />
              {onEdit && <button className="ghost" disabled={busy} onClick={() => setEditing(true)}>edit</button>}
            </div>
          )}
        </div>
      </div>
    );
  }

  const d = turn.data;
  const pending = turn.status === "pending";
  const bad = turn.status === "error";
  const isReply = d?.action === "reply";

  return (
    <div className="turn them">
      <div className="stack">
        <div className={"bubble" + (bad ? " bad" : "") + (turn.status === "stopped" ? " stopped" : "") + (isReply ? " reply" : "")} title={when}>
          {pending ? (
            <span className="thinking">{turn.kind === "analyze" ? "looking at the data" : "thinking"}<span className="dots" /> <span className="meta-inline"><Elapsed since={turn.at} /></span></span>
          ) : turn.text}

          {turn.kind === "answer" && d && !bad && (
            <>
              {d.action && d.action !== "reply" && <Fold label="what it ran"><Json value={plan(d)} /></Fold>}
              {d.result !== undefined && <Tables result={d.result} />}
              {d.result !== undefined && <Fold label="what Elasticsearch answered"><Json value={d.result} /></Fold>}
            </>
          )}
          {turn.kind === "analyze" && d?.indices && Object.entries<any>(d.indices).map(([name, text]) => (
            <Fold key={name} label={name}><Json value={text} /></Fold>
          ))}
          {turn.kind === "stored" && d && <Fold label="what it planned then"><Json value={d} /></Fold>}
          {bad && d && <Fold label="the whole error"><Json value={d} /></Fold>}
          {!pending && metaLine(turn) && <div className="meta">{metaLine(turn)}</div>}
        </div>
        {!pending && (
          <div className="actions">
            <Copy text={turn.text} />
            {d && <Copy text={JSON.stringify(d, null, 2)} label="copy json" />}
            {onHelp && <button className="ghost warn" onClick={onHelp}>how to connect</button>}
            {onRetry && <button className="ghost" disabled={busy} onClick={onRetry}>retry</button>}
            {onRunForReal && turn.dryRun && turn.status === "ok" && d?.action !== "reply" && (
              <button className="ghost warn" disabled={busy} onClick={onRunForReal}>run it for real</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
