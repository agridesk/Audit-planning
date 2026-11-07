# AMS DEV isolated acceptance deployment. Run from the Audit-planning repository root.
# NEVER changes PROD or the 100%-traffic DEV main route. No Firestore/SWAP cutover.
$ErrorActionPreference='Stop'
$project='audit-management-system-dev'
$region='europe-west1'
$main='ams-transport-proof'
$accept='ams-acceptance-20261107'
function RequireSuccess([string]$action){if($LASTEXITCODE -ne 0){throw "$action failed (exit $LASTEXITCODE)"}}
function GcloudService([string]$name){
  $raw=& gcloud.cmd run services describe $name "--project=$project" "--region=$region" '--format=json'
  RequireSuccess "Inspect $name"
  return ($raw|Out-String|ConvertFrom-Json)
}
function ActiveMain($svc){
  $rows=@($svc.status.traffic | Where-Object {$_.percent -eq 100 -and $_.revisionName})
  if($rows.Count -ne 1){throw 'MAIN_100_PERCENT_REVISION_NOT_UNIQUE'}
  return [string]$rows[0].revisionName
}
function VerifyFlags($svc){
  $items=@($svc.spec.template.spec.containers[0].env)
  foreach($name in @('AMS_SWAP20_DIRECT_COMMIT_ENABLED','AMS_SWAP20_CANONICAL_CUTOVER_VERIFIED','AMS_SWAP20_DIRECT_ROUTE')){
    $values=@($items|Where-Object {$_.name -eq $name}|ForEach-Object {$_.value})
    if($values -contains 'true'){throw "UNSAFE_SWAP_CUTOVER_FLAG_$name"}
  }
}
if(-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw 'GCLOUD_CMD_NOT_FOUND'}
if(-not (Get-Command git.exe -ErrorAction SilentlyContinue)){throw 'GIT_NOT_FOUND'}
$root=(Get-Location).Path
if(-not (Test-Path (Join-Path $root '.git'))){throw 'RUN_FROM_AUDIT_PLANNING_REPO_ROOT'}
$branch=(& git.exe branch --show-current|Out-String).Trim();RequireSuccess 'Git branch'
if($branch -ne 'dev'){throw 'DEV_BRANCH_REQUIRED'}
$dirty=(& git.exe status --porcelain --untracked-files=no|Out-String).Trim();RequireSuccess 'Tracked worktree check'
if($dirty){throw 'TRACKED_WORKTREE_NOT_CLEAN'}
$before=GcloudService $main
$mainBefore=ActiveMain $before
VerifyFlags $before
$acceptBefore=GcloudService $accept
if([string]$acceptBefore.metadata.annotations.'run.googleapis.com/ingress' -ne 'all'){throw 'ACCEPTANCE_INGRESS_NOT_ALL'}
if([string]$acceptBefore.metadata.annotations.'run.googleapis.com/invoker-iam-disabled' -eq 'true'){throw 'ACCEPTANCE_IAM_DISABLED'}
$acceptEnv=@{}
foreach($item in @($acceptBefore.spec.template.spec.containers[0].env)){if($null -ne $item.value){$acceptEnv[[string]$item.name]=[string]$item.value}}
if($acceptEnv['AMS_RUNTIME_ENV'] -ne 'DEV'){throw 'ACCEPTANCE_NOT_DEV'}
VerifyFlags $acceptBefore
$serviceAccount=[string]$acceptBefore.spec.template.spec.serviceAccountName
if(-not $serviceAccount){throw 'ACCEPTANCE_SERVICE_ACCOUNT_UNVERIFIED'}
& git.exe fetch origin dev;RequireSuccess 'Fetch dev'
& git.exe merge --ff-only origin/dev;RequireSuccess 'Fast-forward dev'
$sha=(& git.exe rev-parse HEAD|Out-String).Trim();RequireSuccess 'Git SHA'
$dirty=(& git.exe status --porcelain --untracked-files=no|Out-String).Trim();RequireSuccess 'Post-fetch tracked worktree check'
if($dirty){throw 'TRACKED_WORKTREE_NOT_CLEAN_AFTER_FETCH'}
if(-not (Test-Path 'cloudbuild.ams-transport-proof.yaml')){throw 'CLOUD_BUILD_CONFIG_MISSING'}
Write-Output "BUILDING_DEV_SHA: $sha"
Write-Output "MAIN_SERVING_BEFORE: $mainBefore"
$stage=Join-Path ([IO.Path]::GetTempPath()) ('ams-dev-release-'+[guid]::NewGuid().ToString('N'))
$zip=Join-Path ([IO.Path]::GetTempPath()) ('ams-dev-release-'+[guid]::NewGuid().ToString('N')+'.zip')
try {
  New-Item -ItemType Directory -Path $stage -Force|Out-Null
  & git.exe archive --format=zip "--output=$zip" HEAD;RequireSuccess 'Clean Git snapshot'
  Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
  Push-Location $stage
  try {
    & gcloud.cmd builds submit '.' '--config=cloudbuild.ams-transport-proof.yaml' "--substitutions=COMMIT_SHA=$sha" "--project=$project" '--quiet'
    RequireSuccess 'Cloud Build source test and no-traffic staging'
  } finally {Pop-Location}
} finally {
  if(Test-Path $zip){Remove-Item -LiteralPath $zip -Force}
  if(Test-Path $stage){Remove-Item -LiteralPath $stage -Recurse -Force}
}
$stagedMain=GcloudService $main
if((ActiveMain $stagedMain) -ne $mainBefore){throw 'MAIN_TRAFFIC_CHANGED_AFTER_STAGE'}
VerifyFlags $stagedMain
$tag=@($stagedMain.status.traffic|Where-Object {$_.tag -eq 'av001-test'})
if($tag.Count -ne 1 -or -not $tag[0].revisionName -or [int]$tag[0].percent -gt 0){throw 'STAGED_TAG_NOT_ZERO_TRAFFIC'}
$revision=[string]$tag[0].revisionName
$raw=& gcloud.cmd run revisions describe $revision "--project=$project" "--region=$region" '--format=json'
RequireSuccess 'Staged revision inspect'
$rev=$raw|Out-String|ConvertFrom-Json
$image=[string]$rev.spec.containers[0].image
$prefix="europe-west1-docker.pkg.dev/$project/cloud-run-source-deploy/ams-transport-proof@sha256:"
if(-not $image.StartsWith($prefix)){throw 'STAGED_IMAGE_NOT_FROM_DEV_ARTIFACT_REGISTRY'}
Write-Output "STAGED_IMAGE: $image"
Write-Output 'UPDATING_ISOLATED_DEV_ACCEPTANCE_ONLY'
& gcloud.cmd run deploy $accept "--image=$image" "--project=$project" "--region=$region" '--ingress=all' '--invoker-iam-check' '--no-allow-unauthenticated' "--service-account=$serviceAccount" '--max-instances=1' '--update-env-vars=AMS_DEV_SELF_PLANNING_PROXY_ORIGIN=http://127.0.0.1:8086,AMS_SWAP20_DIRECT_COMMIT_ENABLED=false,AMS_SWAP20_CANONICAL_CUTOVER_VERIFIED=false,AMS_SWAP20_DIRECT_ROUTE=false' '--quiet'
RequireSuccess 'Isolated DEV acceptance deploy'
$after=GcloudService $accept
if([string]$after.spec.template.spec.containers[0].image -ne $image){throw 'ACCEPTANCE_IMAGE_VERIFY_FAILED'}
if([string]$after.metadata.annotations.'run.googleapis.com/invoker-iam-disabled' -eq 'true'){throw 'ACCEPTANCE_IAM_VERIFY_FAILED'}
if((ActiveMain (GcloudService $main)) -ne $mainBefore){throw 'MAIN_TRAFFIC_CHANGED_AFTER_DEPLOY'}
VerifyFlags $after
Write-Output 'DEV_ACCEPTANCE: DEPLOYED_AND_IMAGE_VERIFIED'
Write-Output "SOURCE_SHA: $sha"
Write-Output 'DEV_MAIN_ROUTE: UNCHANGED'
Write-Output 'PROD: UNCHANGED'
Write-Output 'LOCAL_URL: http://127.0.0.1:8086/'
