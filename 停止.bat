@echo off
chcp 65001 >nul
set PORT=9530
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r ":%PORT% "') do (
  if not "%%a"=="0" (
    taskkill /PID %%a /F >nul 2>&1
    echo 已停止端口 %PORT% 上的服务 (PID %%a)
  )
)
echo 完成。
echo   窗口将在以下秒数后自动关闭:
for /l %%n in (5,-1,1) do (echo   %%n & timeout /t 1 /nobreak >nul)
