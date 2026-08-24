"""
Hardware preflight check for the Pie tactic-prediction model.

This model is served with a 4-bit (bitsandbytes NF4) quantized 7B base + LoRA
adapter. That code path requires an NVIDIA CUDA GPU. There is deliberately NO
CPU / non-NVIDIA fallback: on unsupported hardware this script prints exactly
what is required and what was detected, then exits non-zero — so the failure is
a clear "hardware not supported" message, never a cryptic crash mid-load.

Exit codes:
    0  — hardware OK, the model can be served.
    2  — hardware does NOT meet requirements (clear message printed).
    3  — the Python environment is broken (torch / bitsandbytes not installed).

Run standalone:
    python preflight.py
Or import and call:
    from preflight import preflight; ok = preflight()
"""

from __future__ import annotations

import sys

# ── Requirements (single source of truth) ────────────────────────────────────
REQUIRED = {
    "gpu": "NVIDIA GPU with CUDA support",
    "compute_capability": (7, 0),   # Turing (RTX 20xx / T4) or newer; NF4 needs >= 7.0
    "vram_total_gb": 7.0,           # model uses ~6.5 GB; require >= 7 GB total
    "cuda_runtime": "12.1 (the pinned torch build is cu121)",
    "python": "3.11.x",
}
VRAM_NEEDED_GB = 6.5


def _fail(reason: str, detected: dict) -> int:
    line = "=" * 64
    print(line)
    print("  HARDWARE NOT SUPPORTED — the Pie tactic model cannot run here.")
    print(line)
    print(f"\n  Reason: {reason}\n")
    print("  This model requires (4-bit bitsandbytes + CUDA):")
    print(f"    - {REQUIRED['gpu']}")
    print(f"    - GPU compute capability >= "
          f"{REQUIRED['compute_capability'][0]}.{REQUIRED['compute_capability'][1]}")
    print(f"    - >= {REQUIRED['vram_total_gb']} GB VRAM "
          f"(model footprint ~{VRAM_NEEDED_GB} GB)")
    print(f"    - CUDA runtime {REQUIRED['cuda_runtime']}")
    print(f"    - Python {REQUIRED['python']}")
    print("\n  Detected on this machine:")
    if detected:
        for k, v in detected.items():
            print(f"    - {k}: {v}")
    else:
        print("    - (nothing usable detected)")
    print("\n  There is no CPU fallback: a non-NVIDIA / low-VRAM machine cannot")
    print("  run this artifact. See README.md for the exact hardware used to")
    print("  produce the published results.\n")
    return 2


def preflight(verbose: bool = True) -> bool:
    """Return True iff this machine can serve the model. Prints a report."""
    # 1. torch present?
    try:
        import torch
    except Exception as e:  # noqa: BLE001
        print("ENVIRONMENT ERROR: PyTorch is not installed / importable.")
        print(f"  {type(e).__name__}: {e}")
        print("  Create the environment first (see README / environment.yml).")
        sys.exit(3)

    # 2. CUDA available?
    if not torch.cuda.is_available():
        detected = {
            "torch": torch.__version__,
            "torch CUDA build": torch.version.cuda or "CPU-only build",
            "cuda.is_available()": False,
        }
        sys.exit(_fail("No CUDA-capable NVIDIA GPU is visible to PyTorch.", detected))

    # 3. Gather GPU facts
    name = torch.cuda.get_device_name(0)
    cc = torch.cuda.get_device_capability(0)
    vram_gb = round(torch.cuda.get_device_properties(0).total_memory / 1e9, 1)
    detected = {
        "GPU": name,
        "compute_capability": f"{cc[0]}.{cc[1]}",
        "VRAM_total_GB": vram_gb,
        "torch": torch.__version__,
        "torch CUDA build": torch.version.cuda,
        "python": ".".join(map(str, sys.version_info[:3])),
    }

    # 4. Compute capability high enough?
    if cc < REQUIRED["compute_capability"]:
        sys.exit(_fail(
            f"GPU compute capability {cc[0]}.{cc[1]} is too old for 4-bit NF4 "
            f"(need >= {REQUIRED['compute_capability'][0]}."
            f"{REQUIRED['compute_capability'][1]}).",
            detected,
        ))

    # 5. Enough VRAM?
    if vram_gb < REQUIRED["vram_total_gb"]:
        sys.exit(_fail(
            f"Only {vram_gb} GB VRAM detected; need >= "
            f"{REQUIRED['vram_total_gb']} GB (model footprint ~{VRAM_NEEDED_GB} GB).",
            detected,
        ))

    # 6. bitsandbytes present and usable?
    try:
        import bitsandbytes as bnb  # noqa: F401
        detected["bitsandbytes"] = bnb.__version__
    except Exception as e:  # noqa: BLE001
        print("ENVIRONMENT ERROR: bitsandbytes is not installed / importable.")
        print(f"  {type(e).__name__}: {e}")
        print("  4-bit quantization requires bitsandbytes with CUDA support.")
        sys.exit(3)

    # ── All good ─────────────────────────────────────────────────────────────
    if verbose:
        line = "=" * 64
        print(line)
        print("  PREFLIGHT OK — this machine can serve the Pie tactic model.")
        print(line)
        for k, v in detected.items():
            print(f"    {k}: {v}")
        print()
    return True


if __name__ == "__main__":
    preflight()
    sys.exit(0)
