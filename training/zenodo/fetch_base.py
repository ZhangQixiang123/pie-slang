"""
Vendor the base model into the bundle for offline, self-contained use.

Downloads (or copies from the local HuggingFace cache) the exact pinned
revision of the 4-bit base model that the LoRA adapter was trained against,
into a local directory. Used by build_bundle.* when assembling the Zenodo
archive so the published artifact does NOT depend on HuggingFace staying up.

Usage:
    python fetch_base.py [dest_dir]      # default dest: ./base-model
"""

from __future__ import annotations

import sys
from pathlib import Path

# Exact base model + revision recorded in adapter/adapter_config.json.
# Pinning the revision guarantees byte-for-byte reproducibility.
REPO_ID = "unsloth/qwen2.5-coder-7b-instruct-bnb-4bit"
REVISION = "4858886f896bd05db823557fc5cbc4ac28342af7"


def main() -> None:
    dest = Path(sys.argv[1] if len(sys.argv) > 1 else "base-model").resolve()
    dest.mkdir(parents=True, exist_ok=True)

    from huggingface_hub import snapshot_download

    print(f"Vendoring base model {REPO_ID}@{REVISION[:12]} -> {dest}")
    snapshot_download(
        repo_id=REPO_ID,
        revision=REVISION,
        local_dir=str(dest),
        # Copy real files (not symlinks) so the directory is self-contained
        # and safe to zip / archive.
        allow_patterns=None,
    )
    print("Base model vendored. Contents:")
    for p in sorted(dest.iterdir()):
        size = p.stat().st_size if p.is_file() else 0
        print(f"  {p.name}  ({size/1e6:.1f} MB)" if size else f"  {p.name}/")


if __name__ == "__main__":
    main()
