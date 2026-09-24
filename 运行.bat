@echo off
chcp 65001 >nul
cd /d "%~dp0"

set PORT=9530
set TITLE=提醒网站 - 运行中(请勿关闭此窗口)

REM 若 9530 端口已被占用，先尝试释放（避免 EADDRINUSE 闪退）
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r ":%PORT% "') do (
  if not "%%a"=="0" taskkill /PID %%a /F >nul 2>&1
)

REM 启动服务器（独立窗口，关此窗口才会停止服务）
start "%TITLE%" cmd /k "title %TITLE% && echo 提醒网站启动中... && node server.js & if errorlevel 1 pause"

REM 等待服务就绪（最多约 10 秒）
set COUNT=0
:WAIT
powershell -Command "try { (Invoke-WebRequest -Uri 'http://localhost:%PORT%/api/health' -UseBasicParsing -TimeoutSec 1).StatusCode } catch { 0 }" >nul 2>&1
if %errorlevel%==0 goto OPEN
timeout /t 1 /nobreak >nul
set /a COUNT+=1
if %COUNT% LSS 10 goto WAIT

:OPEN
start "" http://localhost:%PORT%
