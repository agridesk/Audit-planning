# DEV-only, read-only Model C maintenance status diagnostic.
# No changes to Cloud Run, Firestore, Sheets, IAM, traffic, or PROD.
$ErrorActionPreference = 'Stop'
$project = 'audit-management-system-dev'
$region = 'europe-west1'
function CheckLast([string]$op) { if ($LASTEXITCODE -ne 0) { throw "$op failed ($LASTEXITCODE)" } }
function JsonFromGcloud([string[]]$argv) {
  $raw = & gcloud.cmd @argv
  CheckLast 'gcloud describe'
  return ($raw | Out-String | ConvertFrom-Json)
}
Write-Output 'AMS DEV MODEL C STATUS — READ ONLY'
$active = (& gcloud.cmd config get-value project 2>$null | Out-String).Trim()
CheckLast 'gcloud project'
if ($active -ne $project) { throw "ACTIVE_PROJECT_NOT_DEV: $active" }
foreach ($service in @('ams-transport-proof','ams-acceptance-20261107')) {
  $svc = JsonFromGcloud -argv @('run','services','describe',$service,"--project=$project","--region=$region",'--format=json')
  $ingress = [string]$svc.metadata.annotations.'run.googleapis.com/ingress'
  Write-Output "SERVICE: $service | ingress=$ingress"
  foreach ($route in @($svc.status.traffic)) {
    $revision = [string]$route.revisionName
    if (-not $revision) { continue }
    $rev = JsonFromGcloud -argv @('run','revisions','describe',$revision,"--project=$project","--region=$region",'--format=json')
    $env = @{}
    foreach ($variable in @($rev.spec.containers[0].env)) {
      if ($null -ne $variable.value) { $env[[string]$variable.name] = [string]$variable.value }
    }
    $tag = if ($route.tag) { [string]$route.tag } else { '-' }
    $maintenance = if ($env.ContainsKey('AMS_DEV_MAINTENANCE_MODE')) { $env['AMS_DEV_MAINTENANCE_MODE'] } else { 'UNSET' }
    $authority = if ($env.ContainsKey('AMS_SCOPE_EXTENSION_AUTHORITY')) { $env['AMS_SCOPE_EXTENSION_AUTHORITY'] } else { 'UNSET' }
    $migration = if ($env.ContainsKey('AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED')) { $env['AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED'] } else { 'UNSET' }
    $fence = if ($env.ContainsKey('AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED')) { $env['AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED'] } else { 'UNSET' }
    Write-Output "REVISION: $revision | traffic=$($route.percent)% | tag=$tag | maintenance=$maintenance | authority=$authority | migrated=$migration | fenced=$fence"
  }
}
$token = (& gcloud.cmd auth print-access-token | Out-String).Trim()
CheckLast 'gcloud token'
if (-not $token) { throw 'TOKEN_UNAVAILABLE' }
$headers = @{ Authorization = 'Bearer ' + $token }
$root = 'https://firestore.googleapis.com/v1/projects/' + $project + '/databases/(default)/documents/'
foreach ($suffix in @('obligation','auditcontext','event','outbox')) {
  $collection = 'ams_scope_extension_20_dev_' + $suffix
  $uri = $root + $collection + '?pageSize=1'
  try {
    $result = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 30
    $documents = @($result.documents | Where-Object { $null -ne $_ })
    if ($documents.Count -gt 0 -or $result.nextPageToken) { Write-Output "FIRESTORE: $collection = NONEMPTY" }
    else { Write-Output "FIRESTORE: $collection = EMPTY" }
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 404) { Write-Output "FIRESTORE: $collection = EMPTY_OR_NOT_FOUND" }
    else { Write-Output "FIRESTORE: $collection = CHECK_FAILED_HTTP_$status" }
  }
}
Write-Output 'DIAGNOSIS COMPLETE — NO CHANGES MADE'
