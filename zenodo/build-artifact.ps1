# Assemble the full-stack Zenodo artifact (model + TypeScript service).
#
#   ./build-artifact.ps1                      # stage into ..\dist\pie-slang-artifact
#   ./build-artifact.ps1 -Dest D:\out\pie     # custom staging dir
#   ./build-artifact.ps1 -Zip                 # also create <dest>.zip
#   ./build-artifact.ps1 -SkipBuild           # reuse existing web-react/dist
#   ./build-artifact.ps1 -SkipBase            # don't vendor the ~4 GB base model
#
# NOTE: the full artifact is ~4.5 GB (base model + prebuilt frontend + source).
# Stage OUTSIDE the git repo.
param(
    [string]$Dest = "",
    [switch]$Zip,
    [switch]$SkipBuild,
    [switch]$SkipBase
)
$ErrorActionPreference = "Stop"
$HERE = Split-Path -Parent $MyInvocation.MyCommand.Path        # zenodo/
$REPO = Split-Path -Parent $HERE                                # repo root
$TRAINING = Join-Path $REPO "training"
$MZ = Join-Path $TRAINING "zenodo"                              # model bundle scripts
if (-not $Dest) { $Dest = Join-Path $REPO "dist\pie-slang-artifact" }

function Robo($src, $dst, $extraArgs) {
    robocopy $src $dst /E /NFL /NDL /NJH /NJS /NP @extraArgs | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE): $src -> $dst" }
    $global:LASTEXITCODE = 0
}

Write-Host "Assembling full-stack artifact into: $Dest"
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
New-Item -ItemType Directory -Force -Path $Dest, "$Dest\model\test", "$Dest\app" | Out-Null

# 0. (Re)build the frontend in the live repo (relative base) unless skipped.
if (-not $SkipBuild) {
    Write-Host "== Building frontend =="
    & (Join-Path $HERE "build-frontend.ps1") -Repo $REPO
}
if (-not (Test-Path (Join-Path $REPO "web-react\dist\index.html"))) {
    throw "web-react/dist not built. Run without -SkipBuild, or build first."
}

# 1. Root orchestration files.
Write-Host "== Root scripts =="
foreach ($f in @("README.md","run-all.ps1","run-all.sh","serve-frontend.py",
                 "build-frontend.ps1","build-frontend.sh")) {
    Copy-Item (Join-Path $HERE $f) (Join-Path $Dest $f) -Force
}

# 2. Model bundle (scripts + code + adapter + holdout + vendored base).
Write-Host "== Model bundle =="
foreach ($f in @("preflight.py","requirements-lock.txt","environment.yml",
                 "run.sh","run.ps1","verify.sh","verify.ps1","README.md","fetch_base.py")) {
    Copy-Item (Join-Path $MZ $f) (Join-Path $Dest "model\$f") -Force
}
Copy-Item (Join-Path $TRAINING "serve.py")            (Join-Path $Dest "model\serve.py") -Force
Copy-Item (Join-Path $TRAINING "evaluate_offline.py") (Join-Path $Dest "model\evaluate_offline.py") -Force
Robo (Join-Path $TRAINING "output\adapter") (Join-Path $Dest "model\adapter") @()
Copy-Item (Join-Path $TRAINING "test-even-or-odd-holdout.jsonl") (Join-Path $Dest "model\test\test-even-or-odd-holdout.jsonl") -Force
if (-not $SkipBase) {
    Write-Host "== Vendoring base model (~4 GB) =="
    python (Join-Path $MZ "fetch_base.py") (Join-Path $Dest "model\base-model")
}

# 3. App source snapshot (for rebuild) + the prebuilt dist.
Write-Host "== App source =="
Robo (Join-Path $REPO "src")       (Join-Path $Dest "app\src")       @("/XD","node_modules")
Robo (Join-Path $REPO "web-react") (Join-Path $Dest "app\web-react") @("/XD","node_modules")
foreach ($f in @("package.json","package-lock.json","rollup.config.js","eslint.config.js",
                 "jest.config.json","babel.config.js","babel.config.cjs",".babelrc")) {
    $p = Join-Path $REPO $f
    if (Test-Path $p) { Copy-Item $p (Join-Path $Dest "app\$f") -Force }
}
Get-ChildItem $REPO -Filter "tsconfig*.json" | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $Dest "app\$($_.Name)") -Force
}

# 4. Checksums.
Write-Host "== SHA256SUMS =="
Push-Location $Dest
Get-ChildItem -Recurse -File | Where-Object { $_.Name -ne "SHA256SUMS.txt" } | ForEach-Object {
    $h = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
    $rel = $_.FullName.Substring($Dest.Length + 1) -replace '\\','/'
    "$h  $rel"
} | Set-Content -Encoding ascii "SHA256SUMS.txt"
Pop-Location

Write-Host "Artifact staged at $Dest"
if ($Zip) {
    $zip = "$Dest.zip"
    Write-Host "Creating $zip ..."
    if (Test-Path $zip) { Remove-Item -Force $zip }
    Compress-Archive -Path "$Dest\*" -DestinationPath $zip
    "$((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower())  $(Split-Path -Leaf $zip)" |
        Set-Content -Encoding ascii "$Dest.zip.sha256"
    Write-Host "ZIP: $zip"
}
Write-Host "Done."
