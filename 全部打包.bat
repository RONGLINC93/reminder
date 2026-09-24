@echo off
rem ===========================================================================
rem  全部打包 - reminder
rem  依次执行：fnOS fpk / Windows zip / Linux zip / macOS zip
rem  - 四个均为 Windows 原生 bat，PowerShell 负责压缩
rem  - 子脚本在 PACKAGE_ALL=1 时不打开资源管理器、不暂停
rem ===========================================================================
setlocal
chcp 65001 >nul 2>&1
cd /d "%~dp0"

set "PACKAGE_ALL=1"

echo ############ 全部打包：reminder ############
echo.

echo [1/4] fnOS fpk ...
call "打包fpk.bat"
if errorlevel 1 goto fail
echo.

echo [2/4] Windows zip ...
call "打包win-zip.bat"
if errorlevel 1 goto fail
echo.

echo [3/4] Linux zip ...
call "打包linux-zip.bat"
if errorlevel 1 goto fail
echo.

echo [4/4] macOS zip ...
call "打包macos-zip.bat"
if errorlevel 1 goto fail
echo.

set "PACKAGE_ALL="

echo ############ 打包产物 (dist/) ############
if exist dist\*.fpk (echo   fpk  : & dir dist\*.fpk /b) else echo   fpk  : 无
if exist dist\*win.zip (echo   win  : & dir dist\*win.zip /b) else echo   win  : 无
if exist dist\*linux.zip (echo   linux: & dir dist\*linux.zip /b) else echo   linux: 无
if exist dist\*macos.zip (echo   macos: & dir dist\*macos.zip /b) else echo   macos: 无

echo.
echo 完成。
if not defined PACKAGE_ALL (
  echo.
  echo   窗口将在以下秒数后自动关闭:
  for /l %%n in (5,-1,1) do (echo   %%n & timeout /t 1 /nobreak >nul)
)
exit /b 0

:fail
set "PACKAGE_ALL="
echo.
echo [ERROR] 打包失败, 见上方输出。
if not defined PACKAGE_ALL (
  echo.
  echo   窗口将在以下秒数后自动关闭:
  for /l %%n in (5,-1,1) do (echo   %%n & timeout /t 1 /nobreak >nul)
)
exit /b 1
