# Abort AMS Model C DEV maintenance ONLY if Firestore Model C target is empty.
# No PROD. Requires original route state saved by enter-model-c-maintenance.ps1.
param([string]$Approval='')
$ErrorActionPreference='Stop'
if($Approval -ne 'RESTORE_DEV_WITH_EMPTY_MODEL_C_TARGET'){throw 'RESTORE_EXPLICIT_APPROVAL_REQUIRED'}
$project='audit-management-system-dev';$region='europe-west1';$main='ams-transport-proof';$accept='ams-acceptance-20261107'
$stateFile=Join-Path $env:LOCALAPPDATA 'AMS\model-c-maintenance-state.json'
if(-not(Test-Path $stateFile)){throw 'MAINTENANCE_STATE_BACKUP_MISSING'}
$s=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json
if($s.project -ne $project -or $s.region -ne $region -or $s.mainOriginalRevision -notmatch '^ams-transport-proof-[0-9]+-[a-z0-9]+$' -or $s.acceptOriginalRevision -notmatch '^ams-acceptance-20261107-[0-9]+-[a-z0-9]+$'){throw 'BACKUP_IDENTITY_INVALID'}
function CheckExit($action){if($LASTEXITCODE -ne 0){throw "$action failed ($LASTEXITCODE)"}}
function Service($name){$raw=& gcloud.cmd run services describe $name "--project=$project" "--region=$region" '--format=json';CheckExit 'Inspect DEV';return($raw|Out-String|ConvertFrom-Json)}
function TrafficArgs($rows){
 $pairs=@($rows|Where-Object {[int]$_.percent -gt 0}|ForEach-Object {"$([string]$_.revisionName)=$([int]$_.percent)"})
 if(($pairs|Measure-Object).Count -ne 1 -or [int]($pairs[0].Split('=')[1]) -ne 100){throw 'RESTORE_TRAFFIC_NOT_SINGLE_100_PERCENT'}
 $tags=@($rows|Where-Object {$_.tag -and $_.revisionName}|ForEach-Object {"$([string]$_.tag)=$([string]$_.revisionName)"})
 return @{revision=($pairs -join ',');tags=($tags -join ',')}
}
function AssertMaintenance($name){
 $svc=Service $name
 $entries=@($svc.status.traffic)
 if($entries.Count -ne 1 -or [int]$entries[0].percent -ne 100 -or $entries[0].tag){throw 'CURRENT_TRAFFIC_IS_NOT_FULL_MAINTENANCE'}
 $raw=& gcloud.cmd run revisions describe ([string]$entries[0].revisionName) "--project=$project" "--region=$region" '--format=json';CheckExit 'Inspect maintenance revision'
 $rev=$raw|Out-String|ConvertFrom-Json
 $envs=@($rev.spec.containers[0].env)
 if(@($envs|Where-Object {$_.name -eq 'AMS_DEV_MAINTENANCE_MODE' -and $_.value -eq 'true'}).Count -ne 1){throw 'CURRENT_REVISION_IS_NOT_DEV_MAINTENANCE'}
}
$active=(& gcloud.cmd config get-value project|Out-String).Trim();CheckExit 'GCP project'
if($active -ne $project){throw 'ACTIVE_GCP_PROJECT_NOT_DEV'}
# Do not restore old writers when imported source exists in Firestore.
$token=(& gcloud.cmd auth print-access-token|Out-String).Trim();CheckExit 'GCP token'
$root="https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents"
foreach($collection in @('obligation','auditcontext','event','outbox')){
 $url="$root/ams_scope_extension_20_dev_$collection?pageSize=1"
 try{$r=Invoke-RestMethod -Uri $url -Headers @{Authorization=('Bearer '+$token)} -Method Get -TimeoutSec 30}
 catch{if([int]$_.Exception.Response.StatusCode -eq 404){continue};throw}
 if(@($r.documents).Count -gt 0 -or $r.nextPageToken){throw 'RESTORE_FORBIDDEN_MODEL_C_FIRESTORE_TARGET_NOT_EMPTY'}
}
AssertMaintenance $main
AssertMaintenance $accept
foreach($service in @($main,$accept)){
 $originalImage=if($service -eq $main){[string]$s.mainOriginalImage}else{[string]$s.acceptOriginalImage}
 if($originalImage -notmatch '^europe-west1-docker\.pkg\.dev/audit-management-system-dev/'){throw 'ORIGINAL_IMAGE_NOT_DEV'}
 & gcloud.cmd run deploy $service "--project=$project" "--region=$region" "--image=$originalImage" '--no-traffic' '--tag=ams-restore' '--update-env-vars=AMS_DEV_MAINTENANCE_MODE=false' '--quiet'
 CheckExit "Restore non-maintenance template $service"
}
foreach($service in @($main,$accept)){
 $routes=if($service -eq $main){$s.mainTraffic}else{$s.acceptTraffic}
 $args=TrafficArgs $routes
 if($args.tags){& gcloud.cmd run services update-traffic $service "--project=$project" "--region=$region" "--to-revisions=$($args.revision)" "--set-tags=$($args.tags)" '--quiet'}
 else {& gcloud.cmd run services update-traffic $service "--project=$project" "--region=$region" "--to-revisions=$($args.revision)" '--clear-tags' '--quiet'}
 CheckExit "Restore original DEV routing $service"
}
if([string](TrafficArgs (Service $main).status.traffic).revision -ne [string](TrafficArgs $s.mainTraffic).revision){throw 'MAIN_ROUTE_RESTORE_NOT_VERIFIED'}
if([string](TrafficArgs (Service $accept).status.traffic).revision -ne [string](TrafficArgs $s.acceptTraffic).revision){throw 'ACCEPTANCE_ROUTE_RESTORE_NOT_VERIFIED'}
$s | Add-Member -NotePropertyName restoredUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$s | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath ($stateFile+'.restored') -Encoding UTF8
Remove-Item -LiteralPath $stateFile -Force
Write-Output 'AMS_DEV_MAINTENANCE_RESTORED_PREVIOUS_ROUTES'
Write-Output 'NO_FIRESTORE_DATA_CHANGED_NO_PROD_CHANGES'
