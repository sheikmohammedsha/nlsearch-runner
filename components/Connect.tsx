"use client";

import { useEffect, useState } from "react";
import type { Connection } from "@/lib/types";
import { base, diagnose, type Diagnosis } from "@/lib/es";
import { Copy } from "./Bits";

function escape(origin: string) {
  return origin.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** The lines that let this page call the node: Elasticsearch has to answer the browser's CORS check itself. */
export function corsYaml(origin: string) {
  // the page's own origin, plus any local one, so next dev and a file server work too
  const pattern = `/${escape(origin)}|https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:[0-9]+)?/`;
  return [
    "http.cors.enabled: true",
    // single quotes: YAML would read the backslashes in double quotes as escapes and refuse to start
    `http.cors.allow-origin: '${pattern}'`,
    'http.cors.allow-methods: "OPTIONS, HEAD, GET, POST, PUT, DELETE"',
    'http.cors.allow-headers: "X-Requested-With, Content-Type, Content-Length, Authorization"',
  ].join("\n");
}

export function corsDocker(origin: string) {
  return [
    "docker run -p 9200:9200 \\",
    "  -e http.cors.enabled=true \\",
    `  -e 'http.cors.allow-origin=${origin}' \\`,
    "  -e 'http.cors.allow-headers=X-Requested-With,Content-Type,Content-Length,Authorization' \\",
    "  ...",
  ].join("\n");
}

const VERDICT: Record<Diagnosis["kind"], string> = {
  ok: "Connected. The node answers this page.",
  "no-cors": "The node is up, but it does not answer this page yet. Add the lines below to elasticsearch.yml and restart the node.",
  down: "Nothing answered at that address. Is the node running on that port? If Chrome asked whether this site may access devices on your local network, allow it and check again.",
  cert: "Nothing answered, or the node speaks https with a certificate the browser does not trust yet. Open the address in a new tab once, accept it, then check again.",
  "no-plugin": "Connected, but this node does not have the nlsearch plugin. Settings → Install the plugin has the steps.",
  auth: "Connected, but the node wants a user and password or an API key. Fill them in above.",
  error: "The node answered with an error.",
};

export function ConnectGuide({ connection, auto }: { connection: Connection; auto?: boolean }) {
  const [origin, setOrigin] = useState("https://sheikmohammedsha.github.io");
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setOrigin(location.origin); }, []);

  const check = async () => {
    setBusy(true);
    setResult(await diagnose(connection, location.origin));
    setBusy(false);
  };
  // once on opening; after that the button, so typing a URL does not fire a request per key
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (auto) check(); }, [auto]);

  const yaml = corsYaml(origin);
  const url = base(connection.url);
  return (
    <div className="guide">
      <div className="buttons">
        <button type="button" onClick={check} disabled={busy}>{busy ? "Checking…" : `Check ${url}`}</button>
        {result && <span className={result.kind === "ok" ? "ok-line" : "bad-line"}>{VERDICT[result.kind]}{result.detail ? ` ${result.detail}` : ""}</span>}
      </div>
      {result?.kind !== "ok" && (
        <>
          <p className="help">
            This page runs in your browser and calls the node at <code>{url}</code> directly; nothing goes through a server. Browsers allow an
            https page to call <code>localhost</code>, but only once Elasticsearch answers the browser&apos;s CORS check, which it does not by default.
            Add these lines to <code>config/elasticsearch.yml</code> on the node and restart it:
          </p>
          <div className="json">
            <div className="json-tools"><Copy text={yaml} /></div>
            <pre>{yaml}</pre>
          </div>
          <details>
            <summary>Running Elasticsearch in Docker</summary>
            <div className="json">
              <div className="json-tools"><Copy text={corsDocker(origin)} /></div>
              <pre>{corsDocker(origin)}</pre>
            </div>
          </details>
          <ul className="help notes">
            <li>The settings are read at start-up, so the node has to be restarted. They cannot be set through <code>_cluster/settings</code>.</li>
            <li>Chrome may ask whether this site may access devices on your local network. Allow it.</li>
            <li>With security on (the default since 8.0) the node is <code>https://localhost:9200</code> with a self-signed certificate: open it in a tab once and accept it, and fill in a user or API key above.</li>
            <li>Works in Chrome, Edge and Firefox. Safari refuses calls from an https page to an http address, even on localhost.</li>
          </ul>
        </>
      )}
    </div>
  );
}
