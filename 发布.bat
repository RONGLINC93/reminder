@echo off
rem 切换到 UTF-8 代码页, 避免中文输出乱码
chcp 65001 >nul 2>&1

rem ===========================================================================
rem  Reminder - 一键发布新版本 (Windows)
rem
rem  依次执行:
rem    1) 全部打包.bat  构建全部产物 (Windows/Linux/macOS zip + fnOS fpk)
rem    2) release.js    从 package.json 读 version, 创建 git tag 并推送,
rem                     再用 GitHub API 创建 Release 并上传 dist/ 下的产物
rem    3) 发布成功后, release.js 自动把 package.json 的 version patch +1
rem                     并本地 commit, 供下一次发布直接使用
rem
rem  用法: 双击本文件, 或在 cmd 中执行  发布.bat
rem
rem  前置:
rem    - Node.js 14+ 已安装并在 PATH 中
rem    - .env 配置好 GITHUB_REPO_URL 与 GITHUB_TOKEN (拉取.bat / 推送.bat 同款)
rem    - GITHUB_TOKEN 需有 repo 权限 (创建 Release + 上传资产)
rem    - fnos\fnpack.exe 已就位 (打包 fpk 步骤依赖)
rem    - 发布前请先 推送.bat 把代码提交到 GitHub, 且 package.json 无未提交改动
rem
rem  注意:
rem    - 发布完成后才会自动叠加版本号 (patch +1 并本地 commit, 不推送),
rem      发布失败则版本号保持不变
rem    - Release body 自动从 CHANGELOG.md 提取该版本段 (支持 "## v1.0.0" 或 "## [1.0.0]")
rem    - 发布结果会持久化到 dist\.last-release.json 供查阅
rem ===========================================================================

cd /d "%~dp0"

echo === [1/2] 打包全部产物 ===
echo.
rem  设置 PACKAGE_ALL 让 全部打包.bat 内部不再打开资源管理器 / 不再暂停
set "PACKAGE_ALL=1"
call "%~dp0全部打包.bat"
set "PACKAGE_ALL="
if errorlevel 1 goto fail

echo.
echo === [2/2] 创建 GitHub Release 并上传产物 ===
echo.
node "%~dp0release.js"
if errorlevel 2 goto warn
if errorlevel 1 goto fail

rem 全部成功 - 从 dist\.last-release.json 读取并显示结果
echo.
echo === [结果] 发布成功 ===
if exist "dist\.last-release.json" (
  node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log('  版本:    '+j.tagName);console.log('  Release: '+j.html_url);console.log('  资产:');for (const a of j.assets){console.log('    - '+a.name+(a.ok?'  [OK]':'  [FAIL HTTP '+a.status+']'));}" "dist\.last-release.json"
) else (
  echo   (dist\.last-release.json 未生成, 见上方 release.js 输出)
)
echo.
echo   详情: dist\.last-release.json
echo   窗口将在以下秒数后自动关闭:
for /l %%n in (5,-1,1) do (echo   %%n & timeout /t 1 /nobreak >nul)
exit /b 0

:warn
rem Release 已建, 部分资产上传失败
echo.
echo === [结果] Release 已创建, 部分资产上传失败 ===
if exist "dist\.last-release.json" (
  node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log('  Release: '+j.html_url);console.log('  资产:');for (const a of j.assets){console.log('    - '+a.name+(a.ok?'  [OK]':'  [FAIL HTTP '+a.status+']'));}" "dist\.last-release.json"
)
echo.
echo   失败资产可手动重传到上方 Release URL
echo   窗口将在以下秒数后自动关闭:
for /l %%n in (5,-1,1) do (echo   %%n & timeout /t 1 /nobreak >nul)
exit /b 2

:fail
echo.
echo [ERROR] 发布失败, 见上方输出。
echo   窗口将在以下秒数后自动关闭:
for /l %%n in (5,-1,1) do (echo   %%n & timeout /t 1 /nobreak >nul)
exit /b 1
