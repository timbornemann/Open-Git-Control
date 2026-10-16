[CmdletBinding()]
param(
    [string]$Executable = (Join-Path $env:LOCALAPPDATA 'Programs\Open-Git-Control\Open-Git-Control.exe'),
    [switch]$DisableGpu,
    [switch]$UseExistingProfile
)

$ErrorActionPreference = 'Stop'
$Executable = (Get-Item -LiteralPath $Executable).FullName
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportRoot = Join-Path ([System.IO.Path]::GetTempPath()) "Open-Git-Control-startup-$stamp-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $reportRoot | Out-Null
$profile = if ($UseExistingProfile) {
    Join-Path $env:APPDATA 'Open-Git-Control'
} else {
    Join-Path $reportRoot 'profile'
}
if ($UseExistingProfile) {
    $running = Get-Process -Name 'Open-Git-Control' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Executable }
    if ($running) { throw 'Bitte zuerst alle Open-Git-Control-Prozesse im Task-Manager beenden und die Diagnose erneut starten.' }
} else {
    New-Item -ItemType Directory -Path $profile | Out-Null
    $settingsJson = @{ autoUpdateEnabled = $false; automaticMaintenanceEnabled = $false; autoFetchIntervalMs = 300000 } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $profile 'settings.json'), $settingsJson, [System.Text.UTF8Encoding]::new($false))
}

$installation = Split-Path -Parent $Executable
$required = 'icudtl.dat', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'resources.pak',
    'snapshot_blob.bin', 'v8_context_snapshot.bin', 'ffmpeg.dll', 'libEGL.dll', 'libGLESv2.dll', 'resources\app.asar'
$files = foreach ($name in $required) {
    $item = Get-Item -LiteralPath (Join-Path $installation $name) -ErrorAction SilentlyContinue
    [pscustomobject]@{ file = $name; exists = [bool]$item; bytes = if ($item) { $item.Length } else { 0 } }
}
$info = [pscustomobject]@{
    time = (Get-Date).ToString('o')
    version = (Get-Item -LiteralPath $Executable).VersionInfo.ProductVersion
    windows = [System.Environment]::OSVersion.VersionString
    architecture = $env:PROCESSOR_ARCHITECTURE
    cleanProfile = -not $UseExistingProfile
    graphicsDisabled = [bool]$DisableGpu
    files = @($files)
}
$info | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $reportRoot 'system.json') -Encoding UTF8

$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $Executable
$start.UseShellExecute = $false
$start.WorkingDirectory = $installation
$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$start.EnvironmentVariables['OPEN_GIT_CONTROL_API_DISABLED'] = 'true'
$arguments = @(
    ('--user-data-dir="{0}"' -f $profile),
    '--enable-logging=file',
    ('--log-file="{0}"' -f (Join-Path $reportRoot 'chromium.log'))
)
if ($DisableGpu) { $arguments += '--disable-gpu' }
$start.Arguments = $arguments -join ' '

Write-Host "Diagnoseordner: $reportRoot"
if (-not $UseExistingProfile) { Write-Host 'Der Test verwendet ein eigenes, leeres Profil. Deine gespeicherten Repositorys und Konten werden nicht geaendert.' }
$testProcess = [System.Diagnostics.Process]::Start($start)
Write-Host "Testprozess: $($testProcess.Id)"
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$samples = @()
foreach ($checkpoint in 2, 5, 10, 20, 30) {
    while ($clock.Elapsed.TotalSeconds -lt $checkpoint) { Start-Sleep -Milliseconds 250 }
    $testProcess.Refresh()
    if ($testProcess.HasExited) {
        $samples += [pscustomobject]@{ seconds = $checkpoint; exited = $true; exitCode = $testProcess.ExitCode }
        break
    }
    $samples += [pscustomobject]@{
        seconds = $checkpoint; exited = $false; responding = $testProcess.Responding
        cpuSeconds = $testProcess.TotalProcessorTime.TotalSeconds; memoryBytes = $testProcess.WorkingSet64
    }
    Write-Host "Nach $checkpoint Sekunden: Fenster reagiert = $($testProcess.Responding)"
}
$samples | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $reportRoot 'responsiveness.json') -Encoding UTF8
foreach ($name in 'startup.log', 'startup.previous.log') {
    $source = Join-Path $profile $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $reportRoot $name) }
}
Write-Host "Diagnose abgeschlossen: $reportRoot"
Write-Host 'Das Testfenster kann normal geschlossen werden. Die Diagnose beendet keine anderen Prozesse und entfernt keine Dateien.'
