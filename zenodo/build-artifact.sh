#!/usr/bin/env bash
#
# Assemble the full-stack Zenodo artifact (model + TypeScript service).
#
#   ./build-artifact.sh                 # stage into ../dist/pie-slang-artifact
#   DEST=/out/pie ./build-artifact.sh
#   ZIP=1 ./build-artifact.sh           # also create <dest>.zip
#   SKIP_BUILD=1 ./build-artifact.sh    # reuse existing web-react/dist
#   SKIP_BASE=1 ./build-artifact.sh     # don't vendor the ~4 GB base model
#
# NOTE: the full artifact is ~4.5 GB. Stage OUTSIDE the git repo. Needs rsync.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # zenodo/
REPO="$(dirname "$HERE")"
TRAINING="$REPO/training"
MZ="$TRAINING/zenodo"
DEST="${DEST:-$REPO/dist/pie-slang-artifact}"

echo "Assembling full-stack artifact into: $DEST"
rm -rf "$DEST"
mkdir -p "$DEST/model/test" "$DEST/app"

# 0. (Re)build frontend (relative base) unless skipped.
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "== Building frontend =="
  REPO="$REPO" "$HERE/build-frontend.sh"
fi
[ -f "$REPO/web-react/dist/index.html" ] || { echo "web-react/dist not built"; exit 1; }

# 1. Root orchestration.
for f in README.md run-all.ps1 run-all.sh serve-frontend.py build-frontend.ps1 build-frontend.sh; do
  cp "$HERE/$f" "$DEST/$f"
done

# 2. Model bundle.
for f in preflight.py requirements-lock.txt environment.yml run.sh run.ps1 \
         verify.sh verify.ps1 README.md fetch_base.py; do
  cp "$MZ/$f" "$DEST/model/$f"
done
cp "$TRAINING/serve.py"            "$DEST/model/serve.py"
cp "$TRAINING/evaluate_offline.py" "$DEST/model/evaluate_offline.py"
cp -r "$TRAINING/output/adapter"   "$DEST/model/adapter"
cp "$TRAINING/test-even-or-odd-holdout.jsonl" "$DEST/model/test/test-even-or-odd-holdout.jsonl"
if [ "${SKIP_BASE:-0}" != "1" ]; then
  echo "== Vendoring base model (~4 GB) =="
  python "$MZ/fetch_base.py" "$DEST/model/base-model"
fi

# 3. App source snapshot + prebuilt dist.
echo "== App source =="
rsync -a --exclude node_modules "$REPO/src/"       "$DEST/app/src/"
rsync -a --exclude node_modules                     "$REPO/web-react/" "$DEST/app/web-react/"
for f in package.json package-lock.json rollup.config.js eslint.config.js tsconfig.json \
         jest.config.json babel.config.js babel.config.cjs .babelrc; do
  [ -f "$REPO/$f" ] && cp "$REPO/$f" "$DEST/app/$f"
done
for f in "$REPO"/tsconfig.*.json; do [ -e "$f" ] && cp "$f" "$DEST/app/"; done

# 4. Checksums.
echo "== SHA256SUMS =="
( cd "$DEST" && find . -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS.txt )

echo "Artifact staged at $DEST"
if [ "${ZIP:-0}" = "1" ]; then
  ( cd "$(dirname "$DEST")" && rm -f "$DEST.zip" && zip -rq "$DEST.zip" "$(basename "$DEST")" )
  sha256sum "$DEST.zip" | tee "$DEST.zip.sha256"
fi
echo "Done."
