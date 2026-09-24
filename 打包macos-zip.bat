@echo off
rem ===========================================================================
rem  reminder - macOS zip release builder (Windows)
rem  用法: 双击, 或终端运行 (路径相对 %~dp0)
rem  输出: dist\reminder-<version>-macos.zip (含 启动.command, Finder 双击即可)
rem  说明: 包内不含 node_modules; 解压后首次双击 启动.command 会自动安装该平台依赖
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
echo （包内不含 node_modules；解压后首次运行 启动.command 会自动安装依赖）
echo.

if not exist "%DIST%" mkdir "%DIST%" 2>nul
if exist "%STG%" rmdir /s /q "%STG%"
mkdir "%STG%" 2>nul

echo [1/3] 复制程序文件 ...
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

echo [2/3] 复制启动脚本 启动.command ...
copy /y "%LAUNCHER%" "%STG%\启动.command" >nul
if errorlevel 1 goto fail

echo [3/3] 生成压缩包 ...
if exist "%OUT%" del /f /q "%OUT%"
powershell -NoProfile -Command "Compress-Archive -Path '%STG%\*' -DestinationPath '%OUT%' -Force"
if errorlevel 1 goto fail
if not exist "%OUT%" goto fail

echo.
echo === Done: %OUT% ===
echo 用法: 解压后在 Finder 中双击 启动.command（首次会自动安装依赖），自动打开 http://localhost:9530
echo （首次若提示来自身份不明的开发者，请到「系统设置 → 隐私与安全性」点击「仍要打开」）
echo.

if not defined PACKAGE_ALL start "" explorer.exe /select,"%OUT%"
if not defined PACKAGE_ALL pause
exit /b 0

:fail
echo.
echo Build FAILED. See the output above.
if not defined PACKAGE_ALL pause
exit /b 1
