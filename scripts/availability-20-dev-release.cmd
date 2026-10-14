@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "REPO=%~dp0.."
set "ZIP=%USERPROFILE%\Downloads\AMS_AVAILABILITY_DEV_INTEGRATION_BUNDLE_2026-10-14.zip"
set "PROJECT=audit-management-system-dev"
set "SERVICE=ams-transport-proof"
set "REGION=europe-west1"
for %%T in (git node npm gcloud powershell) do (where %%T >nul 2>&1 || (echo ERROR: %%T ontbreekt & exit /b 1))
if not exist "%ZIP%" (echo ERROR: Download eerst AMS_AVAILABILITY_DEV_INTEGRATION_BUNDLE_2026-10-14.zip naar Downloads & exit /b 1)
cd /d "%REPO%" || exit /b 1
if not exist ".git" (echo ERROR: Git repo ontbreekt & exit /b 1)
for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"
if /I not "!BRANCH!"=="dev" (echo ERROR: Alleen DEV branch toegestaan & exit /b 1)
for /f "delims=" %%S in ('git status --porcelain') do (echo ERROR: Werkmap bevat wijzigingen; stop om verlies te voorkomen & exit /b 1)
git pull --ff-only origin dev || exit /b 1
gcloud config get-value project 2>nul | findstr /X /C:"%PROJECT%" >nul || (echo ERROR: gcloud actief project is niet DEV & exit /b 1)
gcloud firestore databases describe --database="(default)" --project="%PROJECT%" >nul || (echo ERROR: Firestore DEV database niet bereikbaar & exit /b 1)
gcloud run services describe "%SERVICE%" --region="%REGION%" --project="%PROJECT%" >nul || (echo ERROR: DEV Cloud Run service niet bereikbaar & exit /b 1)
set "DEST=%CD%\cloudrun\transport-proof"
set "STAGE=%TEMP%\ams-availability-release-stage"
if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%" || exit /b 1
powershell -NoProfile -Command "Expand-Archive -LiteralPath $env:ZIP -DestinationPath $env:STAGE -Force" || exit /b 1
if not exist "%STAGE%\server-r15.js" (echo ERROR: Release bundle incompleet & exit /b 1)
copy /y "%STAGE%\*.js" "%DEST%\" >nul || exit /b 1
copy /y "%STAGE%\*.mjs" "%DEST%\" >nul || exit /b 1
copy /y "%STAGE%\*.html" "%DEST%\" >nul || exit /b 1
powershell -NoProfile -Command "$p=Join-Path $env:DEST 'package.json';$j=Get-Content -Raw $p|ConvertFrom-Json;$j.scripts.start='node server-r15.js';$j|ConvertTo-Json -Depth 30|Set-Content -Encoding UTF8 $p;$p=Join-Path $env:DEST 'Dockerfile';$s=Get-Content -Raw $p;if($s -notmatch 'COPY availability-\\*'){ $s=$s.Replace('COPY server-r12.js ./', 'COPY server-r12.js ./' + [Environment]::NewLine + 'COPY availability-*.js ./' + [Environment]::NewLine + 'COPY availability-*.html ./' + [Environment]::NewLine + 'COPY server-r15.js ./') };Set-Content -Encoding ascii $p $s" || exit /b 1
cd /d "%DEST%" || exit /b 1
node availability-release-preflight-20.mjs || (echo ERROR: Availability tests FAILED - NO DEPLOY & exit /b 1)
cd /d "%REPO%" || exit /b 1
git add cloudrun/transport-proof || exit /b 1
git diff --cached --check || exit /b 1
git commit -m "DEV integrate My Availability 2.0 R15 after passing release preflight" || exit /b 1
git push origin dev || (echo ERROR: GitHub push FAILED - NO DEPLOY & exit /b 1)
gcloud run deploy "%SERVICE%" --source "%DEST%" --project="%PROJECT%" --region="%REGION%" --quiet || (echo ERROR: DEV deploy FAILED & exit /b 1)
echo.
echo SUCCESS: My Availability 2.0 deployed to DEV. PROD unchanged.
exit /b 0
