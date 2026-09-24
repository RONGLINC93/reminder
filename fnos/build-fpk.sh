#!/usr/bin/env bash
# ============================================================================
# 飞牛 fpk 打包脚本（Linux / macOS / WSL / 飞牛 NAS 本机）
#   用法：./build-fpk.sh
#   前置：fnpack 已放入 PATH，或放在本目录下名为 fnpack / fnpack.exe
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ="$(cd "${HERE}/.." && pwd)"
PKG="${HERE}/reminder"
SERVER="${PKG}/app/server"
OUTDIR="${PROJ}/fpk"

echo "=== 飞牛 fpk 打包：提醒 ==="

echo "[1/6] 检查图标 ..."
if [ ! -f "${PKG}/ICON.PNG" ]; then
  echo "    未找到 ICON.PNG，请先在 Windows 上运行 fnos\\make-icons.ps1 生成图标"
  exit 1
fi

echo "[2/6] 复制程序文件到打包目录 ..."
rm -rf "${SERVER}"
mkdir -p "${SERVER}"
cp "${PROJ}/server.js" "${PROJ}/package.json" "${SERVER}/"
[ -f "${PROJ}/package-lock.json" ] && cp "${PROJ}/package-lock.json" "${SERVER}/"
cp -r "${PROJ}/public" "${SERVER}/public"
cp -r "${PROJ}/lib" "${SERVER}/lib"

# 依赖：优先复用项目根 node_modules，缺失则自动安装
if [ -d "${PROJ}/node_modules" ]; then
  echo "    复制 node_modules ..."
  cp -r "${PROJ}/node_modules" "${SERVER}/node_modules"
else
  echo "    未找到 node_modules，执行 npm install --omit=dev ..."
  ( cd "${SERVER}" && npm install --omit=dev )
fi

echo "[3/6] 同步 manifest 版本号（唯一来源 package.json） ..."
PKG_VERSION="$(awk -F'"' '/"version"/ { print $4; exit }' "${PROJ}/package.json")"
if [ -n "${PKG_VERSION}" ]; then
  sed -i "s/^[[:space:]]*version[[:space:]]*=.*$/version               = ${PKG_VERSION}/" "${PKG}/manifest"
  echo "    manifest version = ${PKG_VERSION}"
else
  echo "    package.json 中未找到 version，保持 manifest 原值"
fi

echo "[4/6] 统一换行符为 LF，并赋予脚本可执行权限 ..."
while IFS= read -r -d '' f; do
  case "${f}" in
    *.png|*.jpg|*.jpeg|*.ico|*.gif) continue ;;
  esac
  sed -i 's/\r$//' "${f}"
done < <(find "${PKG}" -type f ! -path "*/app/server/*" -print0)
chmod 0755 "${PKG}"/cmd/* 2>/dev/null || true

echo "[5/6] 查找 fnpack ..."
FNPACK="${FNPACK:-}"
if [ -z "${FNPACK}" ] && [ -x "${HERE}/fnpack" ]; then
  FNPACK="${HERE}/fnpack"
fi
if [ -z "${FNPACK}" ] && [ -x "${HERE}/fnpack.exe" ]; then
  FNPACK="${HERE}/fnpack.exe"
fi
if [ -z "${FNPACK}" ]; then
  FNPACK="$(command -v fnpack || true)"
fi
if [ -z "${FNPACK}" ]; then
  FNPACK="$(command -v fnpack.exe || true)"
fi
if [ -z "${FNPACK}" ]; then
  echo "未找到 fnpack。请从 https://developer.fnnas.com/docs/cli/fnpack/ 下载对应平台的版本，"
  echo "放入 PATH，或命名为 fnpack / fnpack.exe 放在 ${HERE} 下。"
  exit 1
fi
echo "    使用 ${FNPACK}"

echo "[6/6] 打包并重命名产物（带版本号） ..."
( cd "${PKG}" && "${FNPACK}" build )

read_field() {
  awk -F= -v k="$1" '
    $1 ~ "^[[:space:]]*" k "[[:space:]]*$" {
      v = $2
      sub(/^[[:space:]]+/, "", v)
      sub(/[[:space:]]+$/, "", v)
      print v
      exit
    }
  ' "${PKG}/manifest"
}

APPNAME="$(read_field appname)"
VERSION="$(read_field version)"
APPNAME="${APPNAME:-reminder}"

RAW="${PKG}/${APPNAME}.fpk"
OUT="${RAW}"
if [ -f "${RAW}" ]; then
  mkdir -p "${OUTDIR}"
  if [ -n "${VERSION}" ]; then
    OUT="${OUTDIR}/${APPNAME}-${VERSION}.fpk"
  else
    OUT="${OUTDIR}/${APPNAME}.fpk"
  fi
  mv -f "${RAW}" "${OUT}"
fi

echo
echo "打包完成：${OUT}"
echo "  应用：${APPNAME}   版本：${VERSION:-未知}"
echo "安装：把 fpk 上传到飞牛应用中心，或 SSH 登录后执行："
echo "  appcenter-cli install-fpk $(basename "${OUT}")"
