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
echo   窗口将在以下秒数后自动关闭:
for /l %%n in (5,-1,1) do (echo   %%n & timeout /t 1 /nobreak >nul)
