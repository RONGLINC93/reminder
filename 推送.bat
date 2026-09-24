@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ========================================
echo   推送代码到 GitHub
echo ========================================
echo.

if "%~1"=="" (
  node push.js
) else (
  node push.js %*
)

set RC=%errorlevel%
echo.
if "%RC%"=="0" (
  echo [完成] 已推送到 GitHub
) else (
  echo [失败] 推送未成功，请看上面的提示
)
echo   (5 秒后自动关闭窗口)
timeout /t 5 /nobreak >nul
