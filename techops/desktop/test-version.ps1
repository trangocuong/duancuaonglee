$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Web.Extensions
$app = Join-Path (Get-Location) 'outputs\LOT-Tracker-Offline-Windows-x64'
$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $app 'release.json') | ConvertFrom-Json
$assembly = [Reflection.Assembly]::LoadFrom((Join-Path $app 'LOT Tracker.exe'))
$form = [Activator]::CreateInstance($assembly.GetType('LotTracker'), $true)
try {
 if (-not $form.Text.Contains('v' + $manifest.version)) { throw 'Window version mismatch' }
 if (-not [AppRelease]::ChangeHistory.Contains($manifest.changes[0])) { throw 'History mismatch' }
 Write-Output ('Window: ' + $form.Text)
} finally { $form.Dispose() }
$latest = Get-ChildItem 'outputs\desktop-test\validation-runs' -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$record = Get-Content -Raw -Encoding UTF8 (Join-Path $latest.FullName 'app-version.json') | ConvertFrom-Json
$status = Get-Content -Raw -Encoding UTF8 (Join-Path $latest.FullName 'status.json') | ConvertFrom-Json
if ($record.version -ne $manifest.version -or $status.appVersion -ne $manifest.version) { throw 'Validation version mismatch' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead(($latest.FullName + '.zip'))
try { if (-not $archive.GetEntry('app-version.json')) { throw 'ZIP version missing' } } finally { $archive.Dispose() }
Write-Output 'PASS: native window, change history, manifest and validation ZIP version.'