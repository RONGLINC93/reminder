#!/usr/bin/env node
/**
 * 把 CHANGELOG.md 中“当前版本”的真实变更写入两处 fnOS 发布素材，
 * 让“更新说明”在应用中心与升级向导里都显示真实内容：
 *   1) fnos/reminder/manifest 的 changelog 字段（应用中心“更新说明”）
 *   2) fnos/reminder/wizard/upgrade 升级向导第一个 tips 的 helpText（用户升级时看到）
 *
 * 版本段匹配规则：优先 “## [<version>]” / “## v<version>”，
 * 找不到则回退到 “## [未发布]” 段（当前开发版本的变更都记在这里）。
 *
 * 用法（路径以脚本所在目录为基准，不依赖当前工作目录）：
 *   node fnos/sync-changelog.js
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;                       // fnos/
const ROOT = path.resolve(HERE, '..');        // 项目根
const PKG_DIR = path.join(HERE, 'reminder');  // fnos/reminder/

function readVersion() {
  const p = path.join(ROOT, 'package.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return String(j.version || '').trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 返回 CHANGELOG.md 中当前版本的完整段（含 ## 标题行）
function extractBlock(version) {
  const clPath = path.join(ROOT, 'CHANGELOG.md');
  if (!fs.existsSync(clPath)) return null;
  const text = fs.readFileSync(clPath, 'utf-8');
  // 1) 精确版本段
  const re = new RegExp(
    `^##\\s+(?:v)?\\[?${escapeRegex(version)}\\]?\\b[\\s\\S]*?(?=^## |\\Z)`, 'm'
  );
  let m = text.match(re);
  // 2) 回退到 [未发布] 段（当前开发版本）
  if (!m) {
    const re2 = /^##\s+\[未发布\][\s\S]*?(?=^## |\\Z)/m;
    m = text.match(re2);
  }
  return m ? m[0] : null;
}

// 纯文本（用于 manifest 单行 changelog）：去掉 ## 标题，保留 ### 子标题与 - 条目
function toPlain(block) {
  const out = [];
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^##\s+/.test(line)) continue;                       // 主标题
    if (/^###\s+/.test(line)) { out.push(line.replace(/^###\s+/, '').trim()); continue; }
    out.push(line.replace(/\*\*/g, ''));
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

// HTML（用于升级向导 helpText）：### 子标题加粗，条目按 <br> 换行
function toHtml(block) {
  const out = [];
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^##\s+/.test(line)) continue;                       // 主标题
    if (/^###\s+/.test(line)) { out.push('<br><strong>' + line.replace(/^###\s+/, '').trim() + '</strong>'); continue; }
    out.push(line.replace(/\*\*/g, ''));
  }
  return out.join('<br>').trim();
}

function setManifestChangelog(plain) {
  const manifestPath = path.join(PKG_DIR, 'manifest');
  let s = fs.readFileSync(manifestPath, 'utf-8');
  // 删除所有已有的 changelog 行（避免重复），再在末尾追加一行规范格式
  s = s.replace(/^[ \t]*changelog[ \t]*=.*$(\r?\n)?/gm, '');
  s = s.replace(/\s+$/, '') + '\n' + 'changelog               = ' + plain + '\n';
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  fs.writeFileSync(manifestPath, s, 'utf-8');
}

function setUpgradeNotes(html, version) {
  const upPath = path.join(PKG_DIR, 'wizard', 'upgrade');
  const arr = JSON.parse(fs.readFileSync(upPath, 'utf-8'));
  const prefix = '升级只会替换程序文件，全部提醒数据与通知配置都会保留。';
  const help = prefix + '<br><br><strong>v' + version + ' 更新内容：</strong><br>' + html;
  let wrote = false;
  for (const step of arr) {
    for (const it of step.items || []) {
      if (it.type === 'tips') { it.helpText = help; wrote = true; break; }
    }
    if (wrote) break;
  }
  if (!wrote) {
    console.error('[sync-changelog] 升级向导未找到 tips 项，无法写入更新说明');
    process.exit(1);
  }
  fs.writeFileSync(upPath, JSON.stringify(arr, null, 2) + '\n', 'utf-8');
}

function main() {
  const version = readVersion();
  if (!version) {
    console.error('[sync-changelog] 未读到 package.json 的 version');
    process.exit(1);
  }
  const block = extractBlock(version);
  if (!block) {
    console.error('[sync-changelog] CHANGELOG.md 未找到 v' + version + ' 段，也没有 [未发布] 段');
    process.exit(1);
  }
  setManifestChangelog(toPlain(block));
  setUpgradeNotes(toHtml(block), version);
  console.log('    changelog -> v' + version + ' 已写入 manifest 与升级向导');
}

main();
