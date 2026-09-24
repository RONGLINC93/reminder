#!/usr/bin/env bash
# 提醒 - Linux 启动脚本
# 用法：chmod +x 启动.sh && ./启动.sh   （自定义端口：PORT=8080 ./启动.sh）
cd "$(dirname "$0")" || exit 1

PORT="${PORT:-9530}"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js，请先安装 Node.js 16 或更高版本：https://nodejs.org/"
  exit 1
fi

# 首次运行若无依赖，自动安装生产依赖（确保为当前平台正确版本）
if [ ! -d node_modules ]; then
  echo "未检测到 node_modules，正在安装依赖（npm install --omit=dev）..."
  npm install --omit=dev
fi

echo "提醒网站启动中，端口 ${PORT} ..."
echo "浏览器访问：http://localhost:${PORT}（同时支持 IPv4 与 IPv6）"

if command -v xdg-open >/dev/null 2>&1; then
  ( sleep 1; xdg-open "http://localhost:${PORT}" ) >/dev/null 2>&1 &
fi

exec node server.js
