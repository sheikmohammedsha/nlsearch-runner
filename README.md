# nlsearch chat

A small chat window for trying the [nlsearch](https://github.com/sheikmohammedsha/nlsearch)
Elasticsearch plugin. Two files, no dependencies, nothing to install.

## Running it

```bash
cd nlsearch-chat
python3 server.py                        # talks to http://localhost:9250
python3 server.py http://localhost:9200  # or wherever your node is
```

Then open **http://127.0.0.1:8787**. Use `127.0.0.1` rather than `localhost`;
some setups route the two differently.

On startup it asks the plugin one question and prints which model answered, so
you know straight away whether the node and the model are both up.

`PORT=8800 python3 server.py` if 8787 is taken. Ctrl-C stops it.

## What is in the window

- **The conversation.** A `session` is generated for you and sent with every
  message, so follow-ups work: ask "red shoes under 50", then "now only the ones
  in stock", and the second question builds on the first.
- **What it ran.** Every answer has a fold-out showing the action, the index and
  the exact query body, and another with what Elasticsearch replied. That is the
  part worth reading when an answer looks wrong.
- **dry run.** Plans the action and does not run it. Tick this before trying
  anything that writes or deletes.
- **answer.** Sentence and data, sentence only, or data only. These are the
  plugin's `both`, `explain` and `raw` modes.
- **New chat.** A new session id and an empty window. Use it when you change
  subject, so the old conversation stops being dragged along.
- **Analyze indices.** Calls `POST /_nl/analyze`, which reads some real documents
  and works out what the fields and coded values mean. It happens by itself on
  the first question; this just gets it over with and shows you what it decided.

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

## Why there is a server at all

The page cannot call Elasticsearch directly: Elasticsearch sends no CORS headers,
so the browser blocks it. `server.py` serves the page and forwards the two calls
it makes. It forwards `/_nl` and `/_nl/analyze` and nothing else, so it cannot be
used to reach the rest of the cluster, and it listens on `127.0.0.1` only.

It is a test harness, not a product. There is no authentication, and anything
you type can change or delete data unless `dry run` is ticked.
