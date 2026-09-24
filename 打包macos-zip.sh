#!/usr/bin/env bash
# ============================================================================
# 提醒 - macOS zip 发布包打包脚本
#   用法：./打包macos-zip.sh
#   输出：dist/reminder-<version>-macos.zip（含 启动.command，Finder 双击即可）
#   依赖：zip（macOS 自带）、node / npm（仅在缺少 node_modules 时需要）
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(awk -F'"' '/"version"/ { print $4; exit }' "${HERE}/package.json")"
VERSION="${VERSION:-1.0.0}"
NAME="reminder-${VERSION}-macos"
DIST="${HERE}/dist"
STG="${DIST}/staging/${NAME}"
OUT="${DIST}/${NAME}.zip"

echo "=== 打包 macOS zip：${NAME}.zip ==="

command -v zip >/dev/null 2>&1 || { echo "未找到 zip 命令。macOS 自带 zip，如缺失请安装 Xcode 命令行工具：xcode-select --install"; exit 1; }

echo "[1/3] 复制程序文件 ..."
rm -rf "${STG}"
mkdir -p "${STG}"
cp "${HERE}/server.js" "${HERE}/package.json" "${STG}/"
[ -f "${HERE}/package-lock.json" ] && cp "${HERE}/package-lock.json" "${STG}/"
[ -f "${HERE}/README.md" ] && cp "${HERE}/README.md" "${STG}/"
[ -f "${HERE}/CHANGELOG.md" ] && cp "${HERE}/CHANGELOG.md" "${STG}/"
cp -r "${HERE}/public" "${STG}/public"
cp -r "${HERE}/lib" "${STG}/lib"

echo "[2/3] 依赖 ..."
if [ -d "${HERE}/node_modules" ]; then
  cp -r "${HERE}/node_modules" "${STG}/node_modules"
else
  echo "    未找到 node_modules，执行 npm install --omit=dev ..."
  ( cd "${STG}" && npm install --omit=dev )
fi

# macOS 启动脚本（Finder 双击即可运行）
cat > "${STG}/启动.command" <<'EOF'
#!/usr/bin/env bash
# 提醒 - macOS 启动脚本（Finder 双击即可）
# 自定义端口：PORT=8080 ./启动.command
cd "$(dirname "$0")" || exit 1

PORT="${PORT:-9530}"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js，请先安装 Node.js 16 或更高版本：https://nodejs.org/"
  exit 1
fi

echo "提醒网站启动中，端口 ${PORT} ..."
echo "浏览器访问：http://localhost:${PORT}（同时支持 IPv4 与 IPv6）"

( sleep 1; open "http://localhost:${PORT}" ) >/dev/null 2>&1 &

exec node server.js
EOF
chmod +x "${STG}/启动.command"

echo "[3/3] 生成压缩包 ..."
rm -f "${OUT}"
( cd "${STG}" && zip -qr "${OUT}" . )

echo
echo "=== 完成：${OUT} ==="
echo "用法：解压后在 Finder 中双击 启动.command，自动打开 http://localhost:9530"
echo "（首次若提示来自身份不明的开发者，请到「系统设置 → 隐私与安全性」点击「仍要打开」）"
