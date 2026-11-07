# AMS DEV isolated acceptance proxy - per-user persistence, no Cloud Run mutation.
# Run once without parameters; background process reconnects to the same DEV service.
param([switch]$Serve)
$ErrorActionPreference = 'Stop'
$taskName = 'AMS_DEV_ACCEPTANCE_PROXY_8086'
$regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$project = 'audit-management-system-dev'
$region = 'europe-west1'
$service = 'ams-acceptance-20261107'
$port = 8086
if (-not $Serve) {
  if (-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)) { throw 'GCLOUD_CMD_NOT_FOUND' }
  $repoRoot = Split-Path -Parent $PSScriptRoot
  if (-not (Test-Path (Join-Path $repoRoot '.git'))) { throw 'AMS_GIT_WORKTREE_NOT_FOUND' }
  $launcher = 'powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Serve'
  New-Item -Path $regPath -Force | Out-Null
  New-ItemProperty -Path $regPath -Name $taskName -Value $launcher -PropertyType String -Force | Out-Null
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'),'-Serve')
  Write-Output 'AMS_DEV_PROXY_PERSISTENCE: INSTALLED_FOR_CURRENT_WINDOWS_USER'
  Write-Output 'AMS_DEV_PROXY_TARGET: ams-acceptance-20261107 (DEV ONLY)'
  Write-Output 'AMS_DEV_PROXY_URL: http://127.0.0.1:8086/'
  Write-Output 'AMS_DEV_PROXY_BEHAVIOR: auto-start at Windows login; reconnect on proxy exit'
  Write-Output 'NOTE: local browser requires this Windows user session and valid gcloud authentication.'
  exit 0
}
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($false, 'Local\AMS_DEV_ACCEPTANCE_PROXY_8086', [ref]$createdNew)
$owns = $false
try {
  $owns = $mutex.WaitOne(0, $false)
  if (-not $owns) { exit 0 }
  $gcloudCommand = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if (-not $gcloudCommand) { exit 1 }
  $gcloud = $gcloudCommand.Source
  while ($true) {
    # Do not start a second proxy if the port is occupied by an existing proxy.
    $client = New-Object System.Net.Sockets.TcpClient
    $listening = $false
    try { $client.Connect('127.0.0.1', $port); $listening = $client.Connected } catch {} finally { $client.Dispose() }
    if ($listening) { Start-Sleep -Seconds 4; continue }
    try {
      & $gcloud 'run' 'services' 'proxy' $service "--project=$project" "--region=$region" "--port=$port" 2>$null | Out-Null
    } catch {}
    Start-Sleep -Seconds 3
  }
} finally {
  if ($owns) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
