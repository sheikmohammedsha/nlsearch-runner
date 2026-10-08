# nlsearch chat

A chat window for trying the [nlsearch](https://github.com/sheikmohammedsha/nlsearch)
Elasticsearch plugin. Ask about your data in plain English, see the answer, and
see exactly what it ran.

**Open it: <https://sheikmohammedsha.github.io/nlsearch-runner/>**

The page runs entirely in your browser and talks to your own node. Nothing you
type goes anywhere else, and the chats are kept in your browser.

## Connecting it to your node

The page calls your node straight from the browser, so there is nothing to run
besides Elasticsearch. Leave the URL at `http://localhost:9200`, or change it
in the header.

A web page may only call Elasticsearch once Elasticsearch answers the browser's
CORS check, and by default it does not. Add these lines to
`config/elasticsearch.yml` and restart the node:

```yaml
http.cors.enabled: true
http.cors.allow-origin: '/https:\/\/sheikmohammedsha\.github\.io|https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?/'
http.cors.allow-methods: "OPTIONS, HEAD, GET, POST, PUT, DELETE"
http.cors.allow-headers: "X-Requested-With, Content-Type, Content-Length, Authorization"
```

That lets in the published page and any page served from your own machine,
such as `npm run dev`. Settings → Connection prints the same lines for whatever
address the page is served from, and **Check** says what is still in the way:

- **the node does not answer this page yet:** the lines above are missing, or
  `allow-origin` does not match the page;
- **nothing answered:** the node is not running on that port, or Chrome asked
  whether the site may access devices on your local network and it was not
  allowed;
- **an untrusted certificate:** with security on (the default since 8.0) the
  node is `https://localhost:9200` with a self-signed certificate. Open it in a
  tab once and accept it, and fill in a user and password or an API key;
- **no nlsearch on this node:** Settings → Install the plugin has the steps.

Browsers allow an https page to call `http://localhost`, which is what makes
this work from GitHub Pages. Chrome, Edge and Firefox do; Safari does not.

In Docker the same settings go in as environment variables:

```bash
docker run -p 9200:9200 -e http.cors.enabled=true \
  -e 'http.cors.allow-origin=https://sheikmohammedsha.github.io' \
  -e 'http.cors.allow-headers=X-Requested-With,Content-Type,Content-Length,Authorization' ...
```

A link of the form `…/nlsearch-runner/?es=http://localhost:9250` opens the page
pointed at that node.

## Installing the plugin

Settings → Install the plugin walks through it, with links to the
[source](https://github.com/sheikmohammedsha/nlsearch), the
[download page](https://github.com/sheikmohammedsha/nlsearch/releases) and the
[documentation](https://sheikmohammedsha.github.io/nlsearch/). In short:

```bash
ollama pull qwen2.5-coder:7b
bin/elasticsearch-plugin install https://github.com/sheikmohammedsha/nlsearch/releases/download/v0.3-9.5.5/nlsearch-0.3-9.5.5.zip
```

then the CORS lines above, and a restart.

## What is in the window

- **Chats.** As many as you like, in the sidebar, grouped by day, searchable,
  pinnable, renamable. Each one has its own `session`, so follow-ups work and
  switching between chats never mixes them up: ask "red shoes under 50", then
  "now only the ones in stock", and the second builds on the first. A chat keeps
  its own dry run and answer setting and its unsent draft.
- **What it ran.** Every answer has a fold-out with the action, the index and the
  exact query body, a table of the hits or the groups when there are any, and
  what Elasticsearch replied. That is the part worth reading when an answer looks
  wrong.
- **Edit, retry, stop.** Edit any question and send it again, retry an answer,
  stop waiting for a slow one, copy the sentence or the whole JSON.
- **dry run.** Plans the action and does not run it. Tick this before anything
  that writes or deletes; the answer then has a **run it for real** button.
- **answer.** Sentence and data, sentence only, or data only. These are the
  plugin's `both`, `explain` and `raw` modes.
- **The Elasticsearch URL** is in the header. Click it to change it, add a user
  and password or an API key, and check the connection; when it fails it says
  why and prints the settings that fix it.
- **The AI model.** Settings → AI model reads the plugin's own settings from
  `_cluster/settings` and changes them: provider, model, the model's URL, API
  key, timeout and how long a briefing lasts. There are presets for Ollama,
  OpenAI, Anthropic, Gemini, Groq and OpenRouter, you see the exact request
  before it is sent, transient or persistent, and **Put everything back** clears
  every override. **Ask a test question** tells you which model answered and how
  long it took.
- **Analyze indices** and **What it knows.** `POST /_nl/analyze` works out what
  the fields and coded values mean; it happens by itself on the first question,
  this just gets it over with. What it knows shows the stored briefings, and can
  redo them for everyone or for this chat alone.
- **Stored on the node.** The chat menu (⋯) shows what the node keeps for the
  chat in `.nlsearch-history`, and can forget it. **Open a stored conversation**
  at the bottom of the sidebar lists every session the node has, from this page
  or any other client, and continues it here.
- **Export and import.** A chat as Markdown or JSON, or every chat at once.
- Light and dark, a layout that works on a phone, and keys:

  | | |
  |---|---|
  | Enter / Shift Enter | send / new line |
  | ↑ in an empty box | edit the last question |
  | Esc | stop waiting |
  | Ctrl/⌘ Shift O | new chat |
  | Ctrl/⌘ K | search chats |
  | Alt ↑ / ↓ | previous / next chat |

## Things worth trying

```
what indices do I have
how many products are there per category
red shoes under 50
now only the ones in stock
the three cheapest things you sell
which brand do we stock the most of
add a product called Blue Mug in kitchen for 12.5          (tick dry run first)
how old is our typical customer                            (it should refuse)
```

## Working on it

Next.js on Node 22, exported as a static site.

```bash
nvm use            # or anything that gives you Node 22, see .nvmrc
npm install
npm run dev        # http://localhost:3000
npm run build      # the static site, in out/
npm run check      # the type check
```

Every push is built by GitHub Actions, and a push to `main` also publishes it to
GitHub Pages.

## Versions

The runner is versioned with the plugin it is made for, and tagged the same way:
`v0.3-9.5.5` is the runner for nlsearch 0.3 on Elasticsearch 9.5.5. The
published page is always `main`, and says which version it is at the bottom.

## It is a test harness

There is no authentication of its own, and anything you type can change or
delete data unless `dry run` is ticked. Point it at a user with only the
privileges you mean to give it.

## License

[Apache 2.0](LICENSE)
