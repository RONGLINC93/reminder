@echo off
rem ===========================================================================
rem  reminder - macOS zip release builder (Windows)
rem  用法: 双击, 或终端运行 (路径相对 %~dp0)
rem  输出: dist\reminder-<version>-macos.zip (含 启动.command, Finder 双击即可)
rem  说明: 包内已含 node_modules (express/lunar-javascript 均为纯 JS, 跨平台可用), 解压后离线即可运行; 若缺失启动.command 会自动安装依赖
rem ===========================================================================
setlocal
chcp 65001 >nul 2>&1
set "PROJ=%~dp0"
set "VER=1.0.0"
for /f "tokens=2 delims=:," %%v in ('findstr "version" "%PROJ%package.json"') do set "VER=%%v"
set "VER=%VER:"=%"
set "VER=%VER: =%"
set "NAME=reminder-%VER%-macos"
set "DIST=%PROJ%dist"
set "STG=%DIST%\staging\%NAME%"
set "OUT=%DIST%\%NAME%.zip"
set "LAUNCHER=%PROJ%fnos\launcher\启动.command"

echo === Build macOS zip: %NAME%.zip ===
echo （包内已含 node_modules，解压后离线即可运行）
echo.

if not exist "%DIST%" mkdir "%DIST%" 2>nul
if exist "%STG%" rmdir /s /q "%STG%"
mkdir "%STG%" 2>nul

echo [1/4] 复制程序文件 ...
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

echo [2/4] 依赖 node_modules（离线运行，无需目标机联网）...
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

echo [3/4] 复制启动脚本 启动.command ...
copy /y "%LAUNCHER%" "%STG%\启动.command" >nul
if errorlevel 1 goto fail

echo [4/4] 生成压缩包 ...
if exist "%OUT%" del /f /q "%OUT%"
rem  NOTE: 用 make-zip.ps1 打包 (UTF-8 文件名 + 正斜杠), 避免中文乱码与跨平台解压异常
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fnos\make-zip.ps1" -Source "%STG%" -Destination "%OUT%"
if errorlevel 1 goto fail
if not exist "%OUT%" goto fail

echo.
echo === Done: %OUT% ===
echo 用法: 解压后在 Finder 中双击 启动.command（已含依赖，离线直接运行），自动打开 http://localhost:9530
echo （首次若提示来自身份不明的开发者，请到「系统设置 → 隐私与安全性」点击「仍要打开」）
echo.

rmdir /s /q "%STG%"

if not defined PACKAGE_ALL start "" explorer.exe /select,"%OUT%"
if not defined PACKAGE_ALL (
  echo.
  echo   窗口将在以下秒数后自动关闭:
  for /l %%n in (5,-1,1) do (echo   %%n & timeout /t 1 /nobreak >nul)
)
exit /b 0

:fail
echo.
echo Build FAILED. See the output above.
if not defined PACKAGE_ALL (
  echo.
  echo   窗口将在以下秒数后自动关闭:
  for /l %%n in (5,-1,1) do (echo   %%n & timeout /t 1 /nobreak >nul)
)
exit /b 1
