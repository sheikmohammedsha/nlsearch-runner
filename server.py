#!/usr/bin/env python3
"""A tiny chat front end for the nlsearch Elasticsearch plugin.

    python3 server.py                      # talks to http://localhost:9250
    python3 server.py http://localhost:9200
    PORT=8800 python3 server.py

Then open http://localhost:8787 in a browser.

Why there is a server here at all: Elasticsearch sends no CORS headers, so a page
opened from the file system cannot call it. This serves the page and forwards the
two calls it makes, which keeps the whole thing to the standard library.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ELASTICSEARCH = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:9250").rstrip("/")
PORT = int(os.environ.get("PORT", "8787"))
HERE = Path(__file__).resolve().parent

# the only paths the page is allowed to reach, so this cannot be used as an open proxy
ALLOWED = {"/_nl", "/_nl/analyze"}


def elasticsearch(path, body, timeout=300):
    """Send one request to the plugin and return (status, parsed body)."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        ELASTICSEARCH + path,
        data=data,
        method="POST" if data is not None else "GET",
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as answer:
            return answer.status, json.loads(answer.read().decode())
    except urllib.error.HTTPError as refused:
        raw = refused.read().decode()
        try:
            return refused.code, json.loads(raw)
        except ValueError:
            return refused.code, {"error": raw}
    except Exception as broken:
        # a dead node or a timeout, which is the common case while trying things out
        return 0, {"error": f"could not reach {ELASTICSEARCH}: {broken}"}


class Chat(BaseHTTPRequestHandler):

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            return self.send_file("index.html", "text/html; charset=utf-8")
        if self.path == "/where":
            return self.send_json(200, {"elasticsearch": ELASTICSEARCH})
        self.send_json(404, {"error": "no such page"})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ALLOWED:
            return self.send_json(404, {"error": "no such endpoint"})
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self.send_json(400, {"error": "that was not JSON"})
        status, answer = elasticsearch(self.path, body)
        self.send_json(status or 502, answer)

    def send_file(self, name, kind):
        try:
            content = (HERE / name).read_bytes()
        except OSError:
            return self.send_json(404, {"error": f"{name} is missing"})
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, status, body):
        content = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, fmt, *args):
        pass   # one line per keystroke is noise; errors come back in the page


def main():
    status, answer = elasticsearch("/_nl", {"prompt": "list the indices", "response": "raw"})
    if status == 200:
        print(f"nlsearch is answering on {ELASTICSEARCH} using {answer.get('model')}")
    else:
        print(f"warning: {ELASTICSEARCH} did not answer a test question ({status}).")
        print(f"         {str(answer)[:200]}")
        print("         The page will still open; fix the node and try again.")
    print(f"\n  open http://localhost:{PORT}\n")
    ThreadingHTTPServer(("127.0.0.1", PORT), Chat).serve_forever()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nstopped")
