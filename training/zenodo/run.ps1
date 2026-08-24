# Start the Pie tactic-prediction server from the self-contained bundle (Windows).
# Runs the hardware preflight first; on unsupported hardware it prints a clear
# message and exits WITHOUT attempting to load the model.
#
#   ./run.ps1
#   $env:PORT=9000; ./run.ps1
$ErrorActionPreference = "Stop"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PORT = if ($env:PORT) { $env:PORT } else { "8000" }

# Fully offline / self-contained: use the vendored base model, never the network.
$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"
$env:PIE_BASE_MODEL = Join-Path $DIR "base-model"

# 1. Hardware preflight (hard-fails on unsupported hardware).
python (Join-Path $DIR "preflight.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 2. Serve.
Write-Host "Starting tactic server on http://localhost:$PORT  (Ctrl+C to stop)"
python (Join-Path $DIR "serve.py") --adapter (Join-Path $DIR "adapter") --port $PORT
