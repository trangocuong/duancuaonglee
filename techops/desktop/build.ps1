$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$nodeVersion = (& node.exe --version).Trim()
if ($nodeVersion -ne 'v24.20.0') { throw 'Install Node.js 24.20.0 x64 to reproduce this desktop release and its bundled license.' }
if ((& node.exe -p 'process.arch').Trim() -ne 'x64') { throw 'The desktop package requires Node.js x64.' }
$destination = Join-Path $repo 'outputs\LOT-Tracker-Offline-Windows-x64'
$release = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'release.json') | ConvertFrom-Json
if ($release.version -notmatch '^\d+\.\d+\.\d+$') { throw 'release.json requires a numeric major.minor.patch version' }
$release | Add-Member -NotePropertyName builtAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
New-Item -ItemType Directory -Force $destination, (Join-Path $destination 'runtime'), (Join-Path $destination 'node_modules\xlsx') | Out-Null
$manifest = Join-Path $destination 'release.json'
[IO.File]::WriteAllText($manifest, ($release | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$buildDirectory = Join-Path $repo 'outputs\desktop-build'
New-Item -ItemType Directory -Force $buildDirectory | Out-Null
$assemblyInfo = Join-Path $buildDirectory 'AssemblyInfo.cs'
$attributes = '[assembly: System.Reflection.AssemblyVersion("' + $release.version + '.0")]' + "`r`n" + '[assembly: System.Reflection.AssemblyFileVersion("' + $release.version + '.0")]' + "`r`n" + '[assembly: System.Reflection.AssemblyInformationalVersion("' + $release.version + '")]'
[IO.File]::WriteAllText($assemblyInfo, $attributes, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $destination 'runtime\node.exe')
foreach ($name in @('lot-tracker.js', 'lot-step-report.js')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot "engine\$name") -Destination $destination }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'analyze.mjs') -Destination $destination
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tracking.mjs') -Destination $destination
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-maps.mjs') -Destination $destination
foreach ($name in @('xlsx.mjs', 'package.json', 'LICENSE')) { Copy-Item -LiteralPath (Join-Path $repo "node_modules\xlsx\$name") -Destination (Join-Path $destination 'node_modules\xlsx') }
Set-Content -LiteralPath (Join-Path $destination 'package.json') -Value '{"type":"module","private":true}' -Encoding ASCII
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.txt') -Destination $destination
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll "/resource:$manifest,release.json" "/out:$destination\LOT Tracker.exe" (Join-Path $PSScriptRoot 'LotTracker.cs') (Join-Path $PSScriptRoot 'ValidationRun.cs') (Join-Path $PSScriptRoot 'AppRelease.cs') $assemblyInfo
if ($LASTEXITCODE -ne 0) { throw 'Desktop compilation failed' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'NODE-LICENSE.txt') -Destination $destination
$versionedZip = Join-Path $repo ('outputs\LOT-Tracker-Offline-v' + $release.version + '-Windows-x64.zip')
$staging = Join-Path $buildDirectory ([Guid]::NewGuid().ToString('N') + '\LOT-Tracker-Offline-Windows-x64')
New-Item -ItemType Directory -Force $staging, (Join-Path $staging 'runtime'), (Join-Path $staging 'node_modules\xlsx') | Out-Null
foreach ($name in @('LOT Tracker.exe', 'release.json', 'package.json', 'README.txt', 'NODE-LICENSE.txt', 'analyze.mjs', 'tracking.mjs', 'run-maps.mjs', 'lot-tracker.js', 'lot-step-report.js')) {
    Copy-Item -LiteralPath (Join-Path $destination $name) -Destination $staging
}
Copy-Item -LiteralPath (Join-Path $destination 'runtime\node.exe') -Destination (Join-Path $staging 'runtime\node.exe')
foreach ($name in @('xlsx.mjs', 'package.json', 'LICENSE')) {
    Copy-Item -LiteralPath (Join-Path $destination "node_modules\xlsx\$name") -Destination (Join-Path $staging 'node_modules\xlsx')
}
Compress-Archive -Path $staging -DestinationPath $versionedZip -Force
Write-Output $versionedZip
