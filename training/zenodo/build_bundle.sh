#!/usr/bin/env bash
#
# Assemble the self-contained Zenodo bundle (Linux/macOS/Git-Bash).
#
#   ./build_bundle.sh                 # stage into ../../dist/pie-tactic-model
#   DEST=/out/bundle ./build_bundle.sh
#   ZIP=1 ./build_bundle.sh           # also create <dest>.zip
#
# NOTE: the bundle is ~4.3 GB (base model). Stage outside the git repo.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # training/zenodo
TRAINING="$(dirname "$HERE")"                          # training
REPO="$(dirname "$TRAINING")"                          # repo root
DEST="${DEST:-$REPO/dist/pie-tactic-model}"

echo "Staging bundle into: $DEST"
rm -rf "$DEST"
mkdir -p "$DEST/test"

# 1. Bundle scripts + specs
for f in preflight.py requirements-lock.txt environment.yml \
         run.sh run.ps1 verify.sh verify.ps1 README.md fetch_base.py; do
  cp "$HERE/$f" "$DEST/$f"
done

# 2. Serve + eval code
cp "$TRAINING/serve.py"            "$DEST/serve.py"
cp "$TRAINING/evaluate_offline.py" "$DEST/evaluate_offline.py"

# 3. LoRA adapter
cp -r "$TRAINING/output/adapter" "$DEST/adapter"

# 4. Holdout test set
cp "$TRAINING/test-even-or-odd-holdout.jsonl" "$DEST/test/test-even-or-odd-holdout.jsonl"

# 5. Vendor the base model (~4 GB; copies from HF cache if present)
echo "Vendoring base model (may need network on first run)..."
python "$HERE/fetch_base.py" "$DEST/base-model"

# 6. Checksums for Zenodo integrity
echo "Computing SHA256SUMS..."
( cd "$DEST" && find . -type f ! -name SHA256SUMS.txt -print0 \
    | sort -z | xargs -0 sha256sum > SHA256SUMS.txt )

echo "Bundle staged at $DEST"
if [ "${ZIP:-0}" = "1" ]; then
  echo "Creating $DEST.zip ..."
  ( cd "$(dirname "$DEST")" && rm -f "$DEST.zip" && zip -rq "$DEST.zip" "$(basename "$DEST")" )
  sha256sum "$DEST.zip" | tee "$DEST.zip.sha256"
fi
echo "Done."
