# One-command verification of the artifact (Windows):
#   1. Hardware preflight (hard-fails on unsupported hardware).
#   2. Offline step-level evaluation on the 13-step even/odd holdout.
# Expected result: 13/13 exact-match (100%).
$ErrorActionPreference = "Stop"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"
$env:PIE_BASE_MODEL = Join-Path $DIR "base-model"

python (Join-Path $DIR "preflight.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Running offline holdout evaluation (expected: 13/13 exact-match) ..."
python (Join-Path $DIR "evaluate_offline.py") `
  --adapter (Join-Path $DIR "adapter") `
  --test-proofs (Join-Path $DIR "test/test-even-or-odd-holdout.jsonl") `
  --verbose
