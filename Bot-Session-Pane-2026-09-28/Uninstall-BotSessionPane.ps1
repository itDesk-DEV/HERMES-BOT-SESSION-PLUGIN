#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$HermesHome = (Join-Path $env:LOCALAPPDATA 'hermes'),
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$patchFile = Join-Path $packageRoot 'patches\core-integration.patch'
$repo = Join-Path $HermesHome 'hermes-agent'
$pluginDestination = Join-Path $HermesHome 'desktop-plugins\bot-session-pane-stable'

if (-not (Test-Path -LiteralPath $patchFile)) { throw "Brak patcha: $patchFile" }
if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) { throw "Checkout Hermes nie jest repozytorium Git: $repo" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is not available in PATH.' }

& git -C $repo apply --check --reverse --whitespace=nowarn $patchFile
if ($LASTEXITCODE -ne 0) {
  throw 'The patch cannot be safely reversed. No files were changed and the plugin was kept.'
}

& git -C $repo apply --reverse --whitespace=nowarn $patchFile
if ($LASTEXITCODE -ne 0) { throw 'Could not reverse the core patch.' }

if (Test-Path -LiteralPath $pluginDestination) {
  Remove-Item -LiteralPath $pluginDestination -Recurse -Force
}

if (-not $SkipBuild) {
  $hermes = Get-Command hermes -ErrorAction SilentlyContinue
  if (-not $hermes) { throw 'The hermes command was not found in PATH. Later run: hermes desktop --build-only' }
  & $hermes.Source desktop --build-only
  if ($LASTEXITCODE -ne 0) { throw 'Hermes Desktop build failed.' }
}

Write-Host 'Bot Session Pane was uninstalled.' -ForegroundColor Green
