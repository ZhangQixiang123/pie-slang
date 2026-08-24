#!/usr/bin/env bash
#
# Start the full Pie stack from the assembled artifact:
#   1. hardware preflight (model)
#   2. tactic model server  (http://localhost:8000)
#   3. proof-editor frontend (http://127.0.0.1:4173)
#
# Run from an activated Python env with the model dependencies
# (conda activate pie-tactic-model). Ctrl+C stops both servers.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL="$DIR/model"
DIST="$DIR/app/web-react/dist"

export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export PIE_BASE_MODEL="$MODEL/base-model"

# 1. Hardware preflight (hard-fails on unsupported hardware).
python "$MODEL/preflight.py"

# 2 + 3. Start both servers; kill both on exit.
pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "Starting tactic model server on http://localhost:8000 ..."
python "$MODEL/serve.py" --adapter "$MODEL/adapter" --port 8000 &
pids+=($!)

echo "Starting proof-editor frontend on http://127.0.0.1:4173 ..."
python "$DIR/serve-frontend.py" --dir "$DIST" --port 4173 &
pids+=($!)

echo ""
echo "  Model server : http://localhost:8000"
echo "  Proof editor : http://127.0.0.1:4173"
echo ""
echo "  Open http://127.0.0.1:4173 in your browser (Ctrl+C to stop)."
wait
