"use client";

import { Copy } from "./Bits";

export const PLUGIN = {
  version: "0.3",
  elasticsearch: "9.5.5",
  source: "https://github.com/sheikmohammedsha/nlsearch",
  releases: "https://github.com/sheikmohammedsha/nlsearch/releases",
  docs: "https://sheikmohammedsha.github.io/nlsearch/",
  installing: "https://sheikmohammedsha.github.io/nlsearch/installing",
  zip: "https://github.com/sheikmohammedsha/nlsearch/releases/download/v0.3-9.5.5/nlsearch-0.3-9.5.5.zip",
};

export function PluginLinks() {
  return (
    <div className="links">
      <a className="button" href={PLUGIN.source} target="_blank" rel="noreferrer">Source on GitHub</a>
      <a className="button" href={PLUGIN.releases} target="_blank" rel="noreferrer">Download</a>
      <a className="button" href={PLUGIN.docs} target="_blank" rel="noreferrer">Documentation</a>
    </div>
  );
}

function Step({ n, title, code, children }: { n: number; title: string; code?: string; children?: React.ReactNode }) {
  return (
    <li>
      <div className="step-title"><span className="step-n">{n}</span>{title}</div>
      {children}
      {code && (
        <div className="json">
          <div className="json-tools"><Copy text={code} /></div>
          <pre>{code}</pre>
        </div>
      )}
    </li>
  );
}

/** How to get the plugin onto a node, for someone who has only got as far as this page. */
export function InstallGuide() {
  return (
    <div className="install">
      <p className="help">
        This window talks to <b>nlsearch</b>, an Elasticsearch plugin that adds the <code>_nl</code> endpoint. The node needs the plugin
        and a language model to talk to. nlsearch {PLUGIN.version} is built for Elasticsearch {PLUGIN.elasticsearch}; a plugin only loads
        into the exact version it was built for, and the Releases page has the others.
      </p>
      <PluginLinks />
      <ol className="steps">
        <Step n={1} title="A model. The quickest is Ollama on the same machine." code="ollama pull qwen2.5-coder:7b">
          <p className="help">Or use OpenAI, Anthropic, Gemini or any OpenAI compatible server, and pick it later under Settings → AI model.</p>
        </Step>
        <Step n={2} title="Install the plugin, from the Elasticsearch folder." code={`bin/elasticsearch-plugin install ${PLUGIN.zip}`}>
          <p className="help">It asks to accept two entitlements, <code>outbound_network</code> and <code>manage_threads</code>: the plugin calls the model over HTTP. Add <code>--batch</code> to skip the question.</p>
        </Step>
        <Step n={3} title="Let this page in: add the CORS lines from Settings → Connection to config/elasticsearch.yml." />
        <Step n={4} title="Restart the node, then check it answers." code={`curl -XPOST localhost:9200/_nl -H 'Content-Type: application/json' -d '{"prompt": "what indices do I have"}'`} />
      </ol>
      <p className="help">
        The full walk-through, including Docker and the settings for each provider, is in <a href={PLUGIN.installing} target="_blank" rel="noreferrer">Installing</a>.
      </p>
    </div>
  );
}
