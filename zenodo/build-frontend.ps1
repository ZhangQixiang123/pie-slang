# (Re)build the proof-editor frontend from source (Windows).
#
# Produces app/web-react/dist with a RELATIVE base ("./") so it can be served
# from any path by serve-frontend.py. Requires Node.js >= 20 and npm.
#
#   ./build-frontend.ps1                 # build in-place (app/web-react)
#   ./build-frontend.ps1 -Repo <path>    # build a different checkout
param([string]$Repo = "")
$ErrorActionPreference = "Stop"
$HERE = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Repo) { $Repo = Join-Path $HERE "app" }     # assembled artifact layout
$WEB = Join-Path $Repo "web-react"

if (-not (Test-Path (Join-Path $WEB "package.json"))) {
    throw "web-react not found at $WEB (pass -Repo <checkout root>)"
}

Write-Host "Installing dependencies (npm install)..."
# The frontend bundles the interpreter from ../src, whose deps resolve against
# the repo-root node_modules — install both. Uses `npm install` (not `npm ci`)
# because the checked-in root lockfile predates the jest 30 bump in package.json.
Push-Location $Repo;  npm install;  Pop-Location
Push-Location $WEB;   npm install;  Pop-Location

Write-Host "Building frontend (relative base)..."
Push-Location $WEB
npm run build -- --base=./
Pop-Location

Write-Host "Built: $(Join-Path $WEB 'dist')"
