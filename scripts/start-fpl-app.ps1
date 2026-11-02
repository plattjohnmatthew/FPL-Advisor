$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
$appUrl = "http://localhost:3000"
$npmPath = "C:\Program Files\nodejs\npm.cmd"
$stdoutLog = Join-Path $projectPath ".next\desktop-launcher.log"
$stderrLog = Join-Path $projectPath ".next\desktop-launcher-error.log"
$portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue

if (-not $portInUse) {
  $staleLock = Join-Path $projectPath ".next\dev\lock"
  if (Test-Path -LiteralPath $staleLock) {
    Remove-Item -LiteralPath $staleLock -Force
  }

  if (-not (Test-Path -LiteralPath $npmPath)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Node.js could not be found at $npmPath.", "FPL Research could not start", "OK", "Error") | Out-Null
    exit 1
  }

  Start-Process -FilePath $npmPath -ArgumentList "run", "dev" -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Milliseconds 500
    try {
      $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
      $ready = $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
      $ready = $false
    }
  } while (-not $ready -and (Get-Date) -lt $deadline)

  if (-not $ready) {
    Add-Type -AssemblyName PresentationFramework
    $details = if (Test-Path -LiteralPath $stderrLog) { (Get-Content -LiteralPath $stderrLog -Tail 8) -join "`n" } else { "No startup log was produced." }
    [System.Windows.MessageBox]::Show("The app did not start.`n`n$details`n`nLog: $stderrLog", "FPL Research could not start", "OK", "Error") | Out-Null
    exit 1
  }
}

Start-Process $appUrl
