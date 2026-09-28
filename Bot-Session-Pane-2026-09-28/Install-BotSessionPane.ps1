#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$HermesHome = (Join-Path $env:LOCALAPPDATA 'hermes'),
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginSource = Join-Path $packageRoot 'plugin\plugin.js'
$patchFile = Join-Path $packageRoot 'patches\core-integration.patch'
$repo = Join-Path $HermesHome 'hermes-agent'
$pluginsRoot = Join-Path $HermesHome 'desktop-plugins'
$pluginDestination = Join-Path $pluginsRoot 'bot-session-pane-stable'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $HermesHome "backups\bot-session-pane-$timestamp"
$sourceFiles = @(
  'apps\desktop\src\plugins\hermes-bots\bot-state.ts',
  'apps\desktop\src\plugins\hermes-bots\roster-actions.ts',
  'tui_gateway\methods_session.py'
)

function Invoke-Git {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  & git -C $repo @Arguments
  return $LASTEXITCODE
}

if (-not (Test-Path -LiteralPath $pluginSource)) { throw "Brak pliku pluginu: $pluginSource" }
if (-not (Test-Path -LiteralPath $patchFile)) { throw "Brak patcha integracyjnego: $patchFile" }
if (-not (Test-Path -LiteralPath $repo)) { throw "Nie znaleziono checkoutu Hermes: $repo" }
if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) { throw "Checkout Hermes nie jest repozytorium Git: $repo" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is not available in PATH.' }

# Never force a patch. Check whether it applies forward, is already present,
# or conflicts with the recipient's Hermes revision/customizations.
$forward = (Invoke-Git @('apply', '--check', '--whitespace=nowarn', $patchFile)) -eq 0
$alreadyApplied = $false
if (-not $forward) {
  $alreadyApplied = (Invoke-Git @('apply', '--check', '--reverse', '--whitespace=nowarn', $patchFile)) -eq 0
}
if (-not $forward -and -not $alreadyApplied) {
  throw 'The patch does not match this Hermes checkout. No files were changed. See README.md.'
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
foreach ($relativePath in $sourceFiles) {
  $sourcePath = Join-Path $repo $relativePath
  if (Test-Path -LiteralPath $sourcePath) {
    $backupPath = Join-Path $backupRoot $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupPath) | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $backupPath -Force
  }
}
if (Test-Path -LiteralPath $pluginDestination) {
  Copy-Item -LiteralPath $pluginDestination -Destination (Join-Path $backupRoot 'bot-session-pane-stable') -Recurse -Force
}

if ($forward) {
  if ((Invoke-Git @('apply', '--whitespace=nowarn', $patchFile)) -ne 0) {
    throw 'Git did not apply the patch after validation. Restore the backup and stop.'
  }
  Write-Host 'Applied the Bot Mode / Gateway integration patch.' -ForegroundColor Green
} else {
  Write-Host 'The integration patch is already installed.' -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $pluginDestination | Out-Null
Copy-Item -LiteralPath $pluginSource -Destination (Join-Path $pluginDestination 'plugin.js') -Force

$legacyPlugin = Join-Path $pluginsRoot 'bot-session-pane'
if (Test-Path -LiteralPath $legacyPlugin) {
  Write-Warning "An older plugin directory exists: $legacyPlugin. It was not removed automatically."
}

if (Get-Command node -ErrorAction SilentlyContinue) {
  & node --check (Join-Path $pluginDestination 'plugin.js')
  if ($LASTEXITCODE -ne 0) { throw 'JavaScript syntax validation failed.' }
}

if (-not $SkipBuild) {
  $hermes = Get-Command hermes -ErrorAction SilentlyContinue
  if (-not $hermes) { throw 'The hermes command was not found in PATH. Later run: hermes desktop --build-only' }
  Write-Host 'Building Hermes Desktop. This can close running Desktop windows...' -ForegroundColor Cyan
  & $hermes.Source desktop --build-only
  if ($LASTEXITCODE -ne 0) { throw 'Hermes Desktop build failed.' }
}

Write-Host ''
Write-Host 'Installation completed.' -ForegroundColor Green
Write-Host "Backup: $backupRoot"
Write-Host 'Start Desktop with: hermes desktop'
