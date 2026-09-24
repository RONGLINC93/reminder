@echo off
rem ===========================================================================
rem  reminder - Windows zip release builder
rem  Usage: double-click, or run from a terminal (paths are relative to %~dp0).
rem  Output: dist\reminder-<version>-win.zip
rem  Contents: server.js / package.json / public / lib / node_modules
rem            运行.bat (launcher) / 停止.bat / README.md / CHANGELOG.md
rem  NOTE: keep this file ASCII-only; batch parsing of non-ASCII is fragile.
rem ===========================================================================
setlocal
chcp 65001 >nul 2>&1
set "PROJ=%~dp0"
set "VER=1.0.0"
for /f "tokens=2 delims=:," %%v in ('findstr "version" "%PROJ%package.json"') do set "VER=%%v"
set "VER=%VER:"=%"
set "VER=%VER: =%"
set "NAME=reminder-%VER%-win"
set "DIST=%PROJ%dist"
set "STG=%DIST%\staging\%NAME%"
set "OUT=%DIST%\%NAME%.zip"

echo === Build Windows zip: %NAME%.zip ===
echo.

if not exist "%DIST%" mkdir "%DIST%" 2>nul
if exist "%STG%" rmdir /s /q "%STG%"
mkdir "%STG%" 2>nul

echo [1/3] Copy application files...
copy /y "%PROJ%server.js" "%STG%\" >nul
if errorlevel 1 goto fail
copy /y "%PROJ%package.json" "%STG%\" >nul
if errorlevel 1 goto fail
if exist "%PROJ%package-lock.json" copy /y "%PROJ%package-lock.json" "%STG%\" >nul
if exist "%PROJ%README.md" copy /y "%PROJ%README.md" "%STG%\" >nul
if exist "%PROJ%CHANGELOG.md" copy /y "%PROJ%CHANGELOG.md" "%STG%\" >nul
xcopy "%PROJ%public" "%STG%\public" /e /i /y /q >nul
if errorlevel 1 goto fail
xcopy "%PROJ%lib" "%STG%\lib" /e /i /y /q >nul
if errorlevel 1 goto fail
copy /y "%PROJ%运行.bat" "%STG%\运行.bat" >nul
if errorlevel 1 goto fail
if exist "%PROJ%停止.bat" copy /y "%PROJ%停止.bat" "%STG%\" >nul

echo [2/3] Dependencies...
if exist "%PROJ%node_modules" (
  robocopy "%PROJ%node_modules" "%STG%\node_modules" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul
  if errorlevel 8 (
    xcopy "%PROJ%node_modules" "%STG%\node_modules" /e /i /y /q >nul
    if errorlevel 1 goto fail
  )
) else (
  echo     node_modules not found, running npm install --omit=dev ...
  pushd "%STG%"
  npm install --omit=dev
  set "RC=%ERRORLEVEL%"
  popd
  if not "%RC%"=="0" goto fail
)

echo [3/3] Create zip archive...
if exist "%OUT%" del /f /q "%OUT%"
tar -a -c -f "%OUT%" -C "%STG%" . >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Compress-Archive -Path '%STG%\*' -DestinationPath '%OUT%' -Force"
)
if errorlevel 1 goto fail
if not exist "%OUT%" goto fail

echo.
echo === Done: %OUT% ===
echo Usage: unzip, then double-click 运行.bat (http://localhost:9530).
echo.

start "" explorer.exe /select,"%OUT%"
pause
exit /b 0

:fail
echo.
echo Build FAILED. See the output above.
echo.
pause
exit /b 1
