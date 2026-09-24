@echo off
rem ===========================================================================
rem  全部打包 - reminder
rem  依次执行：fnOS fpk / Windows zip / Linux zip / macOS zip
rem  - fpk、win-zip 为 Windows 原生，自动跳过 pause
rem  - linux-zip、macos-zip 为 .sh，需要 WSL 或 Git Bash
rem    本机都没有时，会跳过并提示到对应系统上手动打包
rem ===========================================================================
setlocal
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ############ 全部打包：reminder ############
echo.

echo [1/4] fnOS fpk ...
echo. | 打包fpk.bat
echo.

echo [2/4] Windows zip ...
echo. | 打包win-zip.bat
echo.

echo [3/4] Linux / macOS zip ...
set "SH_OK="
wsl true >nul 2>&1 && set "SH_OK=wsl"
if not defined SH_OK where bash >nul 2>&1 && set "SH_OK=bash"

if "%SH_OK%"=="wsl" (
  echo     使用 WSL 构建 Linux / macOS 包 ...
  wsl bash "打包linux-zip.sh" && wsl bash "打包macos-zip.sh"
) else if "%SH_OK%"=="bash" (
  bash -c "command -v zip >/dev/null 2>&1" >nul 2>&1
  if errorlevel 1 (
    echo     [跳过] Git Bash 未提供 zip 命令，无法在当前系统构建 Linux / macOS 包。
    echo     请安装 zip（如启用 WSL 并安装发行版，或装 Git 的 Unix 工具集）后重试，
    echo     或直接到 Linux / macOS 上运行 打包linux-zip.sh / 打包macos-zip.sh
  ) else (
    echo     使用 Git Bash 构建 Linux / macOS 包 ...
    bash "打包linux-zip.sh" && bash "打包macos-zip.sh"
  )
) else (
  echo     [跳过] 未检测到可用的 WSL 或 Git Bash，无法在当前系统构建 Linux / macOS 包。
  echo     请到 Linux / macOS 上运行 打包linux-zip.sh / 打包macos-zip.sh
)
echo.

echo ############ 打包产物 ############
if exist fpk\*.fpk (echo   fpk  : & dir fpk\*.fpk /b) else echo   fpk  : 无
if exist dist\*win.zip (echo   win  : & dir dist\*win.zip /b) else echo   win  : 无
if exist dist\*linux.zip (echo   linux: & dir dist\*linux.zip /b) else echo   linux: 无
if exist dist\*macos.zip (echo   macos: & dir dist\*macos.zip /b) else echo   macos: 无

echo.
echo 完成。
pause
exit /b 0
