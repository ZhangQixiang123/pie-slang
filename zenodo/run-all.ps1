# Start the full Pie stack from the assembled artifact (Windows):
#   1. hardware preflight (model)
#   2. tactic model server  (http://localhost:8000)
#   3. proof-editor frontend (http://127.0.0.1:4173)
#
# Run from an activated Python env that has the model dependencies
# (conda activate pie-tactic-model). Press Enter to stop both servers.
$ErrorActionPreference = "Stop"
$DIR   = Split-Path -Parent $MyInvocation.MyCommand.Path
$MODEL = Join-Path $DIR "model"
$DIST  = Join-Path $DIR "app\web-react\dist"

# Offline / self-contained: use the vendored base model.
$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"
$env:PIE_BASE_MODEL = Join-Path $MODEL "base-model"

# 1. Hardware preflight (hard-fails on unsupported hardware).
python (Join-Path $MODEL "preflight.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 2. Model server.
Write-Host "Starting tactic model server on http://localhost:8000 ..."
$model = Start-Process python `
    -ArgumentList (Join-Path $MODEL "serve.py"), "--adapter", (Join-Path $MODEL "adapter"), "--port", "8000" `
    -PassThru

# 3. Frontend static server.
Write-Host "Starting proof-editor frontend on http://127.0.0.1:4173 ..."
$front = Start-Process python `
    -ArgumentList (Join-Path $DIR "serve-frontend.py"), "--dir", $DIST, "--port", "4173" `
    -PassThru

Write-Host ""
Write-Host "  Model server  : http://localhost:8000   (PID $($model.Id))"
Write-Host "  Proof editor  : http://127.0.0.1:4173    (PID $($front.Id))"
Write-Host ""
Write-Host "  Open http://127.0.0.1:4173 in your browser. In the AI settings"
Write-Host "  panel the LoRA server URL defaults to http://localhost:8000."
Write-Host ""
Write-Host "Press Enter to stop both servers..."
[void][System.Console]::ReadLine()
Stop-Process -Id $model.Id, $front.Id -Force -ErrorAction SilentlyContinue
Write-Host "Stopped."
