"""
Static file server for the pre-built Pie proof-editor frontend.

Serves the Vite production build (built with a relative base, so it works when
served from any path). Binds to 127.0.0.1 and sets correct MIME types for ES
modules / workers / wasm, with an SPA fallback to index.html.

Usage:
    python serve-frontend.py [--dir DIST_DIR] [--port 4173] [--host 127.0.0.1]

The frontend talks to the tactic model server at http://localhost:8000 by
default (configurable in the app's AI settings panel).
"""

from __future__ import annotations

import argparse
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SPAHandler(SimpleHTTPRequestHandler):
    # Ensure ES modules / workers / wasm are served with correct MIME types
    # (some Python builds mislabel .js, which breaks module workers).
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".wasm": "application/wasm",
        ".svg": "image/svg+xml",
        ".map": "application/json",
    }

    def end_headers(self):
        # Never cache during local review; always serve the latest build.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        # SPA fallback: if the requested path doesn't exist and isn't an asset,
        # serve index.html so client-side routing works.
        path = self.translate_path(self.path)
        if not os.path.exists(path) and "." not in os.path.basename(path):
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, fmt, *args):  # quieter output
        sys.stderr.write("  [frontend] " + (fmt % args) + "\n")


def main():
    p = argparse.ArgumentParser(description="Serve the pre-built Pie frontend")
    here = os.path.dirname(os.path.abspath(__file__))
    p.add_argument("--dir", default=os.path.join(here, "app", "web-react", "dist"),
                   help="Directory containing the built frontend (index.html)")
    p.add_argument("--port", type=int, default=4173)
    p.add_argument("--host", default="127.0.0.1")
    args = p.parse_args()

    dist = os.path.abspath(args.dir)
    if not os.path.isfile(os.path.join(dist, "index.html")):
        print(f"ERROR: no index.html in {dist}", file=sys.stderr)
        print("Build the frontend first (see build-frontend.* / README).", file=sys.stderr)
        sys.exit(1)

    handler = functools.partial(SPAHandler, directory=dist)
    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    url = f"http://{args.host}:{args.port}/"
    print(f"Serving Pie frontend from {dist}")
    print(f"  → open {url} in your browser")
    print(f"  → tactic model server expected at http://localhost:8000 (set in AI settings)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")


if __name__ == "__main__":
    main()
