#!/usr/bin/env zsh
set -euo pipefail

ROOT="/Users/gguthrie/Desktop/pixelart"
PORT="${1:-8124}"

cd "$ROOT"
python3 - <<'PY' "$PORT"
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys

port = int(sys.argv[1])

class NoCacheHandler(SimpleHTTPRequestHandler):

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

ThreadingHTTPServer(("0.0.0.0", port), NoCacheHandler).serve_forever()
PY
