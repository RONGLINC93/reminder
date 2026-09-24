@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ========================================
echo   拉取 GitHub 最新代码
echo ========================================
echo.

node pull.js

set RC=%errorlevel%
echo.
if "%RC%"=="0" (
  echo [完成] 已是最新代码
) else (
  echo [失败] 拉取未成功，请看上面的提示
)
pause
