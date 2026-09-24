@echo off
rem ===========================================================================
rem  fnOS (FeiNiu) fpk builder - reminder
rem  Usage: double-click, or run from a terminal (paths are relative to %~dp0).
rem  Prereq: fnpack.exe (Windows x86) in fnos\ or on PATH
rem          https://developer.fnnas.com/docs/cli/fnpack/
rem  Output: fpk\reminder-<version>.fpk
rem  NOTE: keep this file ASCII-only; batch parsing of non-ASCII is fragile.
rem ===========================================================================
setlocal
chcp 65001 >nul 2>&1
set "PROJ=%~dp0"
set "TOOLS=%PROJ%fnos"
set "PKG=%TOOLS%\reminder"
set "SERVER=%PKG%\app\server"
set "OUTDIR=%PROJ%fpk"

echo === Build fnOS fpk: reminder ===
echo.

echo [1/6] Check icons...
if not exist "%PKG%\ICON.PNG" (
  if exist "%TOOLS%\make-icons.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TOOLS%\make-icons.ps1" -Root "%TOOLS%"
  )
)
if not exist "%PKG%\ICON.PNG" (
  echo     ICON.PNG missing - run fnos\make-icons.ps1 first.
  goto fail
)

echo [2/6] Copy application files...
if exist "%SERVER%" rmdir /s /q "%SERVER%"
mkdir "%SERVER%" 2>nul
copy /y "%PROJ%server.js" "%SERVER%\server.js" >nul
if errorlevel 1 goto fail
copy /y "%PROJ%package.json" "%SERVER%\package.json" >nul
if errorlevel 1 goto fail
if exist "%PROJ%package-lock.json" copy /y "%PROJ%package-lock.json" "%SERVER%\package-lock.json" >nul
xcopy "%PROJ%public" "%SERVER%\public" /e /i /y /q >nul
if errorlevel 1 goto fail
xcopy "%PROJ%lib" "%SERVER%\lib" /e /i /y /q >nul
if errorlevel 1 goto fail

rem --- dependencies: reuse project node_modules, otherwise install ---
if exist "%PROJ%node_modules" (
  echo     Copying node_modules ...
  robocopy "%PROJ%node_modules" "%SERVER%\node_modules" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul
  if errorlevel 8 (
    xcopy "%PROJ%node_modules" "%SERVER%\node_modules" /e /i /y /q >nul
    if errorlevel 1 goto fail
  )
) else (
  echo     node_modules not found, running npm install --omit=dev ...
  pushd "%SERVER%"
  npm install --omit=dev
  set "RC=%ERRORLEVEL%"
  popd
  if not "%RC%"=="0" goto fail
)

echo [3/6] Sync manifest version from package.json...
powershell -NoProfile -ExecutionPolicy Bypass -File "%TOOLS%\sync-version.ps1" -From "%PROJ%package.json" -Manifest "%PKG%\manifest"
if errorlevel 1 goto fail

echo [4/6] Normalize newlines to LF...
powershell -NoProfile -ExecutionPolicy Bypass -File "%TOOLS%\normalize-lf.ps1" -Path "%PKG%"
if errorlevel 1 goto fail

echo [5/6] Locate fnpack...
set "FNPACK="
if exist "%TOOLS%\fnpack.exe" set "FNPACK=%TOOLS%\fnpack.exe"
if not defined FNPACK if exist "%PROJ%fnpack.exe" set "FNPACK=%PROJ%fnpack.exe"
if not defined FNPACK for %%I in (fnpack.exe) do if not "%%~$PATH:I"=="" set "FNPACK=%%~$PATH:I"
if not defined FNPACK goto nofnpack
echo     %FNPACK%

echo [6/6] Pack and rename (with version)...
pushd "%PKG%"
"%FNPACK%" build
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" goto fail

set "APPNAME="
set "VERSION="
for /f "tokens=2 delims==" %%V in ('findstr /b /c:"appname" "%PKG%\manifest"') do set "APPNAME=%%V"
for /f "tokens=2 delims==" %%V in ('findstr /b /c:"version" "%PKG%\manifest"') do set "VERSION=%%V"
set "APPNAME=%APPNAME: =%"
set "VERSION=%VERSION: =%"
if not defined APPNAME set "APPNAME=reminder"
set "RAW=%PKG%\%APPNAME%.fpk"
if not exist "%RAW%" goto fail
if not exist "%OUTDIR%" mkdir "%OUTDIR%"
set "OUT=%OUTDIR%\%APPNAME%.fpk"
if defined VERSION set "OUT=%OUTDIR%\%APPNAME%-%VERSION%.fpk"
move /y "%RAW%" "%OUT%" >nul
if errorlevel 1 goto fail

echo.
echo === Done: %OUT% ===
echo.
echo Install: upload it in the fnOS App Center, or over SSH run
echo   appcenter-cli install-fpk "%OUT%"
echo.

if exist "%OUT%" start "" explorer.exe /select,"%OUT%"

pause
exit /b 0

:nofnpack
echo.
echo fnpack.exe not found.
echo Download the Windows x86 build from
echo   https://developer.fnnas.com/docs/cli/fnpack/
echo The downloaded file has no extension - rename it to fnpack.exe and put it in:
echo   %TOOLS%
echo.
pause
exit /b 1

:fail
echo.
echo Build FAILED. See the output above.
echo.
pause
exit /b 1
