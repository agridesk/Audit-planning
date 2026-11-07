# DEV-only, reversible AMS Model C maintenance. Never imports or changes canonical owner.
# Run from Audit-planning DEV checkout. All outputs are bounded and omit secrets.
$ErrorActionPreference = 'Stop'
$project = 'audit-management-system-dev'
$region = 'europe-west1'
$main = 'ams-transport-proof'
$accept = 'ams-acceptance-20261107'
$sheetId = '1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs'
$stateFile = Join-Path $env:LOCALAPPDATA 'AMS\model-c-maintenance-state.json'
function EnsureExit([string]$name) {
 if ($LASTEXITCODE -ne 0) { throw "$name failed ($LASTEXITCODE)" }
}
function Service([string]$name) {
 $raw = & gcloud.cmd run services describe $name "--project=$project" "--region=$region" '--format=json'
 EnsureExit "Describe DEV service $name"
 return ($raw | Out-String | ConvertFrom-Json)
}
function Revision([string]$name) {
 $raw = & gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json'
 EnsureExit "Describe DEV revision $name"
 return ($raw | Out-String | ConvertFrom-Json)
}
function MainRevision($svc,[string]$name) {
 $serving = @($svc.status.traffic | Where-Object { [int]$_.percent -eq 100 -and $_.revisionName })
 if ($serving.Count -ne 1 -or @($svc.status.traffic | Where-Object { [int]$_.percent -gt 0 }).Count -ne 1) { throw "SERVICE_TRAFFIC_AMBIGUOUS_$name" }
 return [string]$serving[0].revisionName
}
function HasEnv($revision,[string]$name,[string]$value) {
 $rows = @($revision.spec.containers[0].env | Where-Object { $_.name -eq $name })
 return ($rows.Count -eq 1 -and [string]$rows[0].value -eq $value)
}
function VerifyBaseline($svc,[string]$name) {
 $rev = Revision (MainRevision $svc $name)
 if (-not (HasEnv $rev 'AMS_RUNTIME_ENV' 'DEV')) { throw "NOT_A_DEV_SERVICE_$name" }
 if (HasEnv $rev 'AMS_DEV_MAINTENANCE_MODE' 'true') { throw "ALREADY_IN_MAINTENANCE_$name" }
 if (HasEnv $rev 'AMS_SCOPE_EXTENSION_AUTHORITY' 'FIRESTORE') { throw "SCOPE_WRITER_ALREADY_CUT_OVER_$name" }
 return $rev
}
function VerifyDEVSheetFreeze {
 $token = (& gcloud.cmd auth print-access-token | Out-String).Trim()
 EnsureExit 'Read current GCP identity'
 if (-not $token) { throw 'GCP_IDENTITY_UNAVAILABLE' }
 $url = 'https://sheets.googleapis.com/v4/spreadsheets/' + $sheetId + '/values/' + [uri]::EscapeDataString("'System_Config'!A1:C100")
 $v = Invoke-RestMethod -Uri $url -Headers @{Authorization=('Bearer ' + $token)} -Method Get -TimeoutSec 40
 if ($v.values[0][0] -ne 'KEY' -or $v.values[0][1] -ne 'DEV' -or $v.values[0][2] -ne 'PROD') { throw 'DEV_CONFIG_HEADER_INVALID' }
 $cfg = @{}
 foreach ($row in @($v.values | Select-Object -Skip 1)) { if ($row.Count -ge 2 -and $row[0]) { $cfg[[string]$row[0]] = [string]$row[1] } }
 if ($cfg['ENV'] -ne 'DEV' -or $cfg['ALLOW_DEV_WRITES'] -ne 'FALSE' -or $cfg['DEV_WRITE_MODE'] -ne 'BLOCK') { throw 'DEV_SHEETS_WRITE_GUARD_NOT_FROZEN' }
}
function VerifyMaintenance([string]$service,[string]$sha,[string]$image) {
 $svc=Service $service
 $route=@($svc.status.traffic)
 if($route.Count -ne 1 -or [int]$route[0].percent -ne 100 -or $route[0].tag){throw "MAINTENANCE_TAGGED_ROUTE_PRESENT_$service"}
 $rev=Revision ([string]$route[0].revisionName)
 if([string]$rev.spec.containers[0].image -ne $image -or -not (HasEnv $rev 'AMS_RUNTIME_ENV' 'DEV') -or -not (HasEnv $rev 'AMS_DEV_MAINTENANCE_MODE' 'true') -or -not (HasEnv $rev 'AMS_DEV_MAINTENANCE_SOURCE_SHA' $sha)){throw "MAINTENANCE_REVISION_INVALID_$service"}
 if($service -eq $main -and [string]$svc.metadata.annotations.'run.googleapis.com/ingress' -ne 'internal'){throw 'MAIN_INGRESS_CHANGED'}
 if($service -eq $accept -and ([string]$svc.metadata.annotations.'run.googleapis.com/ingress' -ne 'all' -or [string]$svc.metadata.annotations.'run.googleapis.com/invoker-iam-disabled' -eq 'true')){throw 'ACCEPTANCE_IAM_CHANGED'}
}
if (-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue) -or -not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'GIT_OR_GCLOUD_NOT_INSTALLED' }
if (-not (Test-Path '.git') -or -not (Test-Path 'cloudbuild.ams-transport-proof.yaml')) { throw 'START_FROM_AUDIT_PLANNING_REPOSITORY_ROOT' }
if (Test-Path $stateFile) { throw 'PREVIOUS_MAINTENANCE_STATE_EXISTS_REVIEW_BEFORE_RETRY' }
$branch=(& git.exe branch --show-current | Out-String).Trim();EnsureExit 'Git branch'
if($branch -ne 'dev'){throw 'DEV_BRANCH_REQUIRED'}
$dirty=(& git.exe status --porcelain --untracked-files=no | Out-String).Trim();EnsureExit 'Git tracked files'
if($dirty){throw 'TRACKED_FILES_DIRTY'}
$active=(& gcloud.cmd config get-value project | Out-String).Trim();EnsureExit 'Active GCP project'
if($active -ne $project){throw 'ACTIVE_PROJECT_MUST_BE_DEV'}
& git.exe fetch origin dev;EnsureExit 'Fetch GitHub DEV'
& git.exe merge --ff-only origin/dev;EnsureExit 'Fast-forward GitHub DEV'
$sha=(& git.exe rev-parse HEAD | Out-String).Trim();EnsureExit 'Git HEAD'
$dirty=(& git.exe status --porcelain --untracked-files=no | Out-String).Trim();EnsureExit 'Post-fetch Git tracked files'
if($dirty -or $sha -notmatch '^[a-f0-9]{40}$'){throw 'SOURCE_UNVERIFIED'}
$mainBefore=Service $main
$acceptBefore=Service $accept
if([string]$mainBefore.metadata.annotations.'run.googleapis.com/ingress' -ne 'internal' -or [string]$acceptBefore.metadata.annotations.'run.googleapis.com/ingress' -ne 'all' -or [string]$acceptBefore.metadata.annotations.'run.googleapis.com/invoker-iam-disabled' -eq 'true'){throw 'DEV_SERVICE_SECURITY_CHANGED'}
$mainRevision=VerifyBaseline $mainBefore $main
$acceptRevision=VerifyBaseline $acceptBefore $accept
VerifyDEVSheetFreeze
$state=@{
 project=$project;region=$region;sourceSha=$sha;stage='PREPARED';
 mainOriginalRevision=[string]$mainRevision.metadata.name;
 acceptOriginalRevision=[string]$acceptRevision.metadata.name;
 mainOriginalImage=[string]$mainRevision.spec.containers[0].image;
 acceptOriginalImage=[string]$acceptRevision.spec.containers[0].image;
 mainTraffic=@($mainBefore.status.traffic);
 acceptTraffic=@($acceptBefore.status.traffic);
 createdUtc=[DateTime]::UtcNow.ToString('o')
}
$folder=Split-Path -Parent $stateFile;New-Item -ItemType Directory -Path $folder -Force | Out-Null
$state | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $stateFile -Encoding UTF8
Write-Output "MAINTENANCE_BACKUP: $stateFile"
Write-Output "DEV_SOURCE_SHA: $sha"
Write-Output 'BUILD_AND_STAGE_CLEAN_SOURCE: NO MAIN TRAFFIC CHANGE YET'
$stage=Join-Path ([IO.Path]::GetTempPath()) ('ams-model-c-'+[guid]::NewGuid().ToString('N'))
$zip=Join-Path ([IO.Path]::GetTempPath()) ('ams-model-c-'+[guid]::NewGuid().ToString('N')+'.zip')
try {
 New-Item -ItemType Directory -Path $stage -Force | Out-Null
 & git.exe archive --format=zip "--output=$zip" HEAD;EnsureExit 'Archive verified source'
 Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
 Push-Location $stage
 try {
  & gcloud.cmd builds submit . '--config=cloudbuild.ams-transport-proof.yaml' "--substitutions=COMMIT_SHA=$sha" "--project=$project" '--quiet'
  EnsureExit 'Build-and-stage DEV source'
 } finally { Pop-Location }
} finally {
 if(Test-Path $zip){Remove-Item -LiteralPath $zip -Force}
 if(Test-Path $stage){Remove-Item -LiteralPath $stage -Recurse -Force}
}
$mainAfterBuild=Service $main
if((MainRevision $mainAfterBuild $main) -ne [string]$mainRevision.metadata.name){throw 'MAIN_SERVING_REVISION_CHANGED_DURING_BUILD'}
$tagged=@($mainAfterBuild.status.traffic|Where-Object {$_.tag -eq 'av001-test'})
if($tagged.Count -ne 1 -or [int]$tagged[0].percent -gt 0 -or -not $tagged[0].revisionName){throw 'NO_VERIFIED_NEW_STAGED_REVISION'}
$staged=Revision ([string]$tagged[0].revisionName)
$image=[string]$staged.spec.containers[0].image
if($image -notmatch '^europe-west1-docker\.pkg\.dev/audit-management-system-dev/cloud-run-source-deploy/ams-transport-proof@sha256:[a-f0-9]{64}$'){throw 'STAGED_IMAGE_DIGEST_INVALID'}
$state.image=$image;$state.stage='IMAGE_VERIFIED'
$state | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $stateFile -Encoding UTF8
$vars="AMS_RUNTIME_ENV=DEV,AMS_DEV_MAINTENANCE_MODE=true,AMS_DEV_MAINTENANCE_SOURCE_SHA=$sha,AMS_SWAP20_DIRECT_COMMIT_ENABLED=false,AMS_SWAP20_CANONICAL_CUTOVER_VERIFIED=false,AMS_SWAP20_DIRECT_ROUTE=false"
Write-Output 'FENCING_ISOLATED_ACCEPTANCE_SERVICE'
& gcloud.cmd run deploy $accept "--project=$project" "--region=$region" "--image=$image" '--no-traffic' '--tag=ams-maint' "--update-env-vars=$vars" '--quiet'
EnsureExit 'Create isolated maintenance revision'
$a=Service $accept;$at=@($a.status.traffic|Where-Object {$_.tag -eq 'ams-maint'})
if($at.Count -ne 1 -or [int]$at[0].percent -ne 0){throw 'ACCEPTANCE_MAINTENANCE_REVISION_UNVERIFIED'}
& gcloud.cmd run services update-traffic $accept "--project=$project" "--region=$region" "--to-revisions=$([string]$at[0].revisionName)=100" '--clear-tags' '--quiet'
EnsureExit 'Fence isolated acceptance'
VerifyMaintenance $accept $sha $image
$state.stage='ACCEPTANCE_FENCED';$state | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $stateFile -Encoding UTF8
Write-Output 'FENCING_MAIN_DEV_SERVICE_AND_ALL_TAGGED_ROUTES'
& gcloud.cmd run deploy $main "--project=$project" "--region=$region" "--image=$image" '--no-traffic' '--tag=ams-maint' "--update-env-vars=$vars" '--quiet'
EnsureExit 'Create main maintenance revision'
$m=Service $main;$mt=@($m.status.traffic|Where-Object {$_.tag -eq 'ams-maint'})
if($mt.Count -ne 1 -or [int]$mt[0].percent -ne 0){throw 'MAIN_MAINTENANCE_REVISION_UNVERIFIED'}
& gcloud.cmd run services update-traffic $main "--project=$project" "--region=$region" "--to-revisions=$([string]$mt[0].revisionName)=100" '--clear-tags' '--quiet'
EnsureExit 'Fence main DEV and remove all legacy revision tags'
VerifyMaintenance $main $sha $image
VerifyMaintenance $accept $sha $image
VerifyDEVSheetFreeze
$state.stage='MAINTENANCE_ACTIVE';$state.mainMaintenanceRevision=[string]$mt[0].revisionName;$state.acceptMaintenanceRevision=[string]$at[0].revisionName
$state | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $stateFile -Encoding UTF8
Write-Output 'AMS_DEV_MODEL_C_MAINTENANCE: ACTIVE'
Write-Output 'BOTH_CLOUD_RUN_SERVICES: 503_ON_ALL_HTTP_ROUTES'
Write-Output 'ALL_OLD_TAGGED_ROUTES: REMOVED'
Write-Output 'DEV_SHEETS_WRITE_GUARD: BLOCK'
Write-Output 'GAS_TRIGGERS_AND_SCRIPT_PROPERTIES: REQUIRE_INDEPENDENT_VERIFICATION'
Write-Output 'NO_FIRESTORE_WRITES_NO_CUTOVER_NO_PROD_CHANGES'
