$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$app = Join-Path $repo 'outputs\LOT-Tracker-Offline-Windows-x64'
$fixtures = Join-Path $repo 'outputs\desktop-test'
$records = Join-Path $fixtures 'validation-runs'
Add-Type -AssemblyName System.Web.Extensions
Add-Type -AssemblyName System.IO.Compression.FileSystem
[void][Reflection.Assembly]::LoadFrom((Join-Path $app 'LOT Tracker.exe'))
function Assert($condition, $message) { if (-not $condition) { throw $message } }
function Check-Archive($run, $outcome, $expectedEntry) {
    $run.Archive($outcome)
    $zip = [IO.Compression.ZipFile]::OpenRead($run.ArchivePath)
    try {
        $names = @($zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
        Assert ($names -contains 'logs/app.log') 'App log missing in ZIP'
        Assert ($names -contains 'status.json') 'Status missing in ZIP'
        Assert ($names -contains $expectedEntry) "Missing ZIP entry: $expectedEntry"
    } finally { $zip.Dispose() }
}
$good = [ValidationRun]::new($app, $records)
$result = $good.Execute([string[]]@((Join-Path $fixtures 'TEST-LOT-001.csv'))) | ConvertFrom-Json
Assert ($result.count -eq 1) 'Successful analysis failed'
Check-Archive $good 'success' 'outputs/LOT 공정별 보고서.xlsx'
$snapshot = Join-Path $good.DirectoryPath 'inputs\001\TEST-LOT-001.csv'
Assert ((Get-FileHash $snapshot).Hash -eq (Get-FileHash (Join-Path $fixtures 'TEST-LOT-001.csv')).Hash) 'Input snapshot differs'
$good.Log('REPORTS_EXPORTED', 'Archive update test')
Check-Archive $good 'success' 'outputs/result.json'
$bad = [ValidationRun]::new($app, $records)
$failed = $false
try { $bad.Execute([string[]]@((Join-Path $fixtures 'invalid.csv'))) | Out-Null } catch { $failed = $true }
Assert $failed 'Invalid input should fail'
Check-Archive $bad 'failed' 'inputs/001/invalid.csv'
$log = Get-Content -Raw -LiteralPath (Join-Path $bad.DirectoryPath 'logs\analysis.jsonl')
Assert ($log.Contains('FILE_PARSE') -and $log.Contains('stack')) 'Failure stage/stack missing'
$missing = [ValidationRun]::new($app, $records)
try { $missing.Execute([string[]]@((Join-Path $fixtures 'missing.csv'))) | Out-Null; throw 'Expected failure' } catch { }
Check-Archive $missing 'failed' 'request.json'
Assert ((Get-Content -Raw -LiteralPath (Join-Path $missing.DirectoryPath 'logs\app.log')).Contains('INPUT_COPY_FAILED')) 'Missing source not recorded'
$engine = [ValidationRun]::new((Join-Path $fixtures 'missing-app'), $records)
try { $engine.Execute([string[]]@((Join-Path $fixtures 'TEST-LOT-001.csv'))) | Out-Null; throw 'Expected failure' } catch { }
Check-Archive $engine 'failed' 'inputs/001/TEST-LOT-001.csv'
Assert ((Get-Content -Raw -LiteralPath (Join-Path $engine.DirectoryPath 'logs\app.log')).Contains('ANALYSIS_FAILED')) 'Engine failure not recorded'
Assert ($good.DirectoryPath -ne $bad.DirectoryPath) 'Runs collided'
$originalZipHash = (Get-FileHash $good.ArchivePath).Hash
$lockedZip = [IO.File]::Open($good.ArchivePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
$archiveFailed = $false
try { $good.Archive('success') } catch { $archiveFailed = $true } finally { $lockedZip.Dispose() }
Assert $archiveFailed 'Locked archive should report failure'
Assert ((Get-FileHash $good.ArchivePath).Hash -eq $originalZipHash) 'Previous ZIP was damaged'
Assert (Test-Path -LiteralPath $snapshot) 'Snapshot lost after archive failure'
Assert ((Get-Content -Raw -LiteralPath (Join-Path $good.DirectoryPath 'logs\app.log')).Contains('ARCHIVE_FAILED')) 'Archive failure not logged'
Write-Output 'PASS: successful and failed run ZIPs, original bytes, Excel outputs, detailed logs, archive replacement, missing source, missing engine, unique runs.'
