param(
    [ValidateSet("Setup", "Start", "Stop", "Status", "Smoke")]
    [string]$Action = "Status"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.local"
$liveKitExe = Join-Path $projectRoot "work\livekit-1.13.11\expanded\livekit-server.exe"
$pidFile = Join-Path $projectRoot "work\livekit.pid"
$stdoutLog = Join-Path $projectRoot "work\livekit-stdout.log"
$stderrLog = Join-Path $projectRoot "work\livekit-stderr.log"
$liveKitPort = 7880
$liveKitVersion = "1.13.11"
$liveKitArchiveHash = "5d071ea43339f0140d24a66f0b2ff8a7bf6c4d0dceb19b30abca835670213667"

function Install-LiveKit {
    if (Test-Path -LiteralPath $liveKitExe) {
        Write-Host "LiveKit Server $liveKitVersion ist bereits installiert."
        return
    }

    $installDirectory = Split-Path -Parent $liveKitExe
    $downloadDirectory = Split-Path -Parent $installDirectory
    $archivePath = Join-Path $downloadDirectory "livekit.zip"
    $downloadUrl = "https://github.com/livekit/livekit/releases/download/v$liveKitVersion/livekit_${liveKitVersion}_windows_amd64.zip"

    New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
    Write-Host "LiveKit Server $liveKitVersion wird heruntergeladen ..."
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath

    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $liveKitArchiveHash) {
        Remove-Item -LiteralPath $archivePath
        throw "Die Pruefsumme des LiveKit-Downloads ist ungueltig."
    }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $installDirectory -Force
    Remove-Item -LiteralPath $archivePath

    if (-not (Test-Path -LiteralPath $liveKitExe)) {
        throw "LiveKit wurde heruntergeladen, die Serverdatei wurde aber nicht gefunden."
    }
    Write-Host "LiveKit Server $liveKitVersion wurde installiert."
}

function Import-LocalEnvironment {
    if (-not (Test-Path -LiteralPath $envFile)) {
        throw "Die Datei .env.local fehlt. Kopieren Sie .env.example nach .env.local und tragen Sie Ihre lokalen Zugangsdaten ein."
    }

    foreach ($line in Get-Content -LiteralPath $envFile) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }

        $separator = $trimmed.IndexOf("=")
        if ($separator -lt 1) { continue }

        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }

    foreach ($name in @("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")) {
        if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
            throw "$name fehlt in .env.local."
        }
    }
}

function Test-LiveKitPort {
    return Test-NetConnection -ComputerName "127.0.0.1" -Port $liveKitPort -InformationLevel Quiet -WarningAction SilentlyContinue
}

function Get-ManagedLiveKitProcess {
    $expectedPath = [System.IO.Path]::GetFullPath($liveKitExe)

    if (Test-Path -LiteralPath $pidFile) {
        $savedPid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
        if ($savedPid -match "^\d+$") {
            $process = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
            if ($process -and $process.Path -and ([System.IO.Path]::GetFullPath($process.Path) -eq $expectedPath)) {
                return $process
            }
        }
    }

    $matchingProcess = Get-Process -Name "livekit-server" -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and ([System.IO.Path]::GetFullPath($_.Path) -eq $expectedPath) } |
        Select-Object -First 1

    if ($matchingProcess) {
        Set-Content -LiteralPath $pidFile -Value $matchingProcess.Id
        return $matchingProcess
    }

    return $null
}

function Show-Status {
    $process = Get-ManagedLiveKitProcess
    $reachable = Test-LiveKitPort

    if ($reachable -and $process) {
        Write-Host "LiveKit laeuft lokal auf ws://localhost:$liveKitPort (PID $($process.Id))."
    } elseif ($reachable) {
        Write-Host "Port $liveKitPort ist erreichbar, der Prozess gehoert aber nicht zu dieser lokalen Installation."
    } elseif ($process) {
        Write-Host "Der LiveKit-Prozess laeuft (PID $($process.Id)), aber Port $liveKitPort ist noch nicht erreichbar."
    } else {
        Write-Host "LiveKit ist nicht gestartet."
    }
}

function Start-LiveKit {
    Import-LocalEnvironment
    Install-LiveKit

    if (Test-LiveKitPort) {
        $process = Get-ManagedLiveKitProcess
        if ($process) {
            Write-Host "LiveKit laeuft bereits auf ws://localhost:$liveKitPort (PID $($process.Id))."
            return
        }
        throw "Port $liveKitPort wird bereits von einem anderen Prozess verwendet."
    }

    $env:LIVEKIT_KEYS = "$($env:LIVEKIT_API_KEY): $($env:LIVEKIT_API_SECRET)`n"
    $process = Start-Process -FilePath $liveKitExe `
        -ArgumentList @(
            "--bind", "127.0.0.1",
            "--node-ip", "127.0.0.1",
            "--rtc.enable_loopback_candidate"
        ) `
        -WorkingDirectory (Split-Path -Parent $liveKitExe) `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

    Set-Content -LiteralPath $pidFile -Value $process.Id

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (Test-LiveKitPort) {
            Write-Host "LiveKit wurde auf ws://localhost:$liveKitPort gestartet (PID $($process.Id))."
            return
        }
        Start-Sleep -Milliseconds 500
    }

    throw "LiveKit konnte nicht gestartet werden. Details stehen in work/livekit-stderr.log."
}

function Stop-LiveKit {
    $process = Get-ManagedLiveKitProcess
    if (-not $process) {
        if (Test-LiveKitPort) {
            throw "Port $liveKitPort ist belegt, aber nicht durch die verwaltete lokale LiveKit-Installation. Der Prozess wird nicht beendet."
        }
        Write-Host "LiveKit ist bereits beendet."
        return
    }

    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile }
    Write-Host "LiveKit wurde beendet."
}

function Invoke-SmokeTest {
    Import-LocalEnvironment
    if (-not (Test-LiveKitPort)) {
        throw "LiveKit ist nicht erreichbar. Starten Sie den Server zuerst mit 'npm run livekit:start'."
    }

    Push-Location $projectRoot
    try {
        & node "work/livekit-smoke.mjs"
        if ($LASTEXITCODE -ne 0) { throw "Der LiveKit-Smoke-Test ist fehlgeschlagen." }
    } finally {
        Pop-Location
    }
}

switch ($Action) {
    "Setup" { Install-LiveKit }
    "Start" { Start-LiveKit }
    "Stop" { Stop-LiveKit }
    "Status" { Show-Status }
    "Smoke" { Invoke-SmokeTest }
}
