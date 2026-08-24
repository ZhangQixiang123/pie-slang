#!/usr/bin/env bash
#
# (Re)build the proof-editor frontend from source.
#
# Produces app/web-react/dist with a RELATIVE base ("./") so it can be served
# from any path by serve-frontend.py. Requires Node.js >= 20 and npm.
#
#   ./build-frontend.sh                # build in-place (app/web-react)
#   REPO=/path/to/checkout ./build-frontend.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${REPO:-$HERE/app}"
WEB="$REPO/web-react"

[ -f "$WEB/package.json" ] || { echo "web-react not found at $WEB (set REPO=)"; exit 1; }

echo "Installing dependencies (npm install)..."
# The frontend bundles the interpreter from ../src, whose deps resolve against
# the repo-root node_modules — install both. Uses `npm install` (not `npm ci`)
# because the checked-in root lockfile predates the jest 30 bump in package.json.
( cd "$REPO" && npm install )
( cd "$WEB"  && npm install )

echo "Building frontend (relative base)..."
( cd "$WEB" && npm run build -- --base=./ )

echo "Built: $WEB/dist"
