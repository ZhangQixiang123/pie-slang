# Assemble the self-contained Zenodo bundle (Windows).
#
# Produces a directory (and optional .zip) containing everything needed to run
# the model offline on a conforming machine: preflight, serve/eval code, pinned
# env specs, the LoRA adapter, the vendored 4-bit base model, and the holdout.
#
#   ./build_bundle.ps1                       # stage into ..\..\dist\pie-tactic-model
#   ./build_bundle.ps1 -Dest D:\out\bundle   # custom staging dir
#   ./build_bundle.ps1 -Zip                  # also create <dest>.zip + SHA256
#
# NOTE: the bundle is ~4.3 GB (base model). Stage somewhere with free space,
# NOT inside the git repo.
param(
    [string]$Dest = "",
    [switch]$Zip
)
$ErrorActionPreference = "Stop"
$HERE = Split-Path -Parent $MyInvocation.MyCommand.Path      # training/zenodo
$TRAINING = Split-Path -Parent $HERE                          # training
$REPO = Split-Path -Parent $TRAINING                          # repo root

if (-not $Dest) { $Dest = Join-Path $REPO "dist\pie-tactic-model" }
Write-Host "Staging bundle into: $Dest"

# Clean + create layout
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
New-Item -ItemType Directory -Force -Path $Dest, "$Dest\test" | Out-Null

# 1. Bundle scripts + specs (from training/zenodo)
foreach ($f in @("preflight.py","requirements-lock.txt","environment.yml",
                 "run.sh","run.ps1","verify.sh","verify.ps1","README.md","fetch_base.py")) {
    Copy-Item (Join-Path $HERE $f) (Join-Path $Dest $f) -Force
}

# 2. Serve + eval code (from training/)
Copy-Item (Join-Path $TRAINING "serve.py")            (Join-Path $Dest "serve.py") -Force
Copy-Item (Join-Path $TRAINING "evaluate_offline.py") (Join-Path $Dest "evaluate_offline.py") -Force

# 3. LoRA adapter
Copy-Item (Join-Path $TRAINING "output\adapter") (Join-Path $Dest "adapter") -Recurse -Force

# 4. Holdout test set
Copy-Item (Join-Path $TRAINING "test-even-or-odd-holdout.jsonl") (Join-Path $Dest "test\test-even-or-odd-holdout.jsonl") -Force

# 5. Vendor the base model (~4 GB; copies from HF cache if present)
Write-Host "Vendoring base model (this can take a while / needs network on first run)..."
python (Join-Path $HERE "fetch_base.py") (Join-Path $Dest "base-model")

# 6. Checksums for Zenodo integrity
Write-Host "Computing SHA256SUMS..."
Push-Location $Dest
Get-ChildItem -Recurse -File | ForEach-Object {
    $h = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
    $rel = $_.FullName.Substring($Dest.Length + 1) -replace '\\','/'
    "$h  $rel"
} | Set-Content -Encoding ascii "SHA256SUMS.txt"
Pop-Location

Write-Host "Bundle staged at $Dest"
if ($Zip) {
    $zip = "$Dest.zip"
    Write-Host "Creating $zip ..."
    if (Test-Path $zip) { Remove-Item -Force $zip }
    Compress-Archive -Path "$Dest\*" -DestinationPath $zip
    $zh = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    Write-Host "ZIP SHA256: $zh"
    "$zh  $(Split-Path -Leaf $zip)" | Set-Content -Encoding ascii "$Dest.zip.sha256"
}
Write-Host "Done."
