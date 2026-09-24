/**
 * 推送到 GitHub：读取 .env 中的仓库地址与令牌，自动 add / commit / push
 * 用法：node push.js "提交说明"   （或直接双击 推送.bat）
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const REMOTE = 'origin';
const DEFAULT_BRANCH = 'main';

/* ------------------------------ 读取 .env ------------------------------ */

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('[错误] 未找到 .env 文件，请在项目根目录创建并填写：');
    console.error('  GITHUB_REPO_URL=https://github.com/用户名/仓库名.git');
    console.error('  GITHUB_TOKEN=ghp_xxxxxxxxxxxx');
    process.exit(1);
  }
  const env = {};
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2];
  });
  return env;
}

const env = loadEnv();
const token = env.GITHUB_TOKEN || '';
const repoUrl = (env.GITHUB_REPO_URL || env.GITHUB_REPO || '').trim();
if (!repoUrl || !token) {
  console.error('[错误] .env 中缺少 GITHUB_REPO_URL 或 GITHUB_TOKEN');
  process.exit(1);
}

// 令牌只用于命令行，不写入 .git/config
const authUrl = repoUrl.replace(/^https:\/\//, `https://x-access-token:${token}@`);
const mask = (s) => String(s == null ? '' : s).split(token).join('******');

/* ------------------------------ git 封装 ------------------------------ */

function tryRun(args) {
  try {
    const out = execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: ((e.stdout || '') + (e.stderr || '')).toString().trim() };
  }
}

function run(args, label) {
  console.log(`\n[${label}] git ${mask(args.join(' '))}`);
  const r = tryRun(args);
  if (r.out) console.log(mask(r.out));
  if (!r.ok) {
    console.error(`[失败] ${label}`);
    process.exit(1);
  }
  return r.out;
}

/* ------------------------------ 1. 本地仓库 ------------------------------ */

let branch = '';
if (!tryRun(['rev-parse', '--git-dir']).ok) {
  console.log('未检测到 git 仓库，正在初始化...');
  if (!tryRun(['init', '-b', DEFAULT_BRANCH]).ok) {
    run(['init'], '初始化仓库');
    run(['checkout', '-b', DEFAULT_BRANCH], `创建分支 ${DEFAULT_BRANCH}`);
  }
  branch = DEFAULT_BRANCH;
} else {
  branch = tryRun(['rev-parse', '--abbrev-ref', 'HEAD']).out || DEFAULT_BRANCH;
  if (branch === 'HEAD') branch = DEFAULT_BRANCH;
}

/* ------------------------------ 2. 提交身份 ------------------------------ */

if (!tryRun(['config', 'user.name']).out) run(['config', 'user.name', 'reminder-sync'], '配置 user.name');
if (!tryRun(['config', 'user.email']).out) run(['config', 'user.email', 'sync@local'], '配置 user.email');

/* ------------------------------ 3. 远程地址 ------------------------------ */

const remotes = tryRun(['remote']).out.split(/\s+/).filter(Boolean);
if (!remotes.includes(REMOTE)) {
  run(['remote', 'add', REMOTE, repoUrl], '添加远程仓库');
} else {
  const cur = tryRun(['remote', 'get-url', REMOTE]).out;
  if (cur && cur !== repoUrl) run(['remote', 'set-url', REMOTE, repoUrl], '更新远程地址');
}

/* ------------------------------ 4. add + commit ------------------------------ */

const status = run(['status', '--porcelain'], '检查改动');
const msg = process.argv.slice(2).join(' ').trim() || `手动推送 ${new Date().toLocaleString('zh-CN')}`;
if (status) {
  run(['add', '-A'], '暂存改动');
  run(['commit', '-m', msg], `提交：${msg}`);
} else {
  console.log('\n[提示] 工作区没有未提交的改动，直接同步远端');
}

/* ------------------------------ 5. push ------------------------------ */

console.log(`\n正在推送 ${branch} 分支...`);
const push = tryRun(['push', authUrl, `${branch}:${branch}`]);
if (push.out) console.log(mask(push.out));
if (!push.ok) {
  console.error('[错误] 推送失败');
  if (/rejected|non-fast-forward|fetch first/i.test(push.out)) {
    console.error('提示：远端有新提交，请先双击 拉取.bat 同步后再推送');
  }
  process.exit(1);
}
console.log('推送成功');

// 刷新远程跟踪引用，保证 git status 的领先/落后显示准确
tryRun(['fetch', authUrl, '+refs/heads/*:refs/remotes/origin/*']);
if (tryRun(['rev-parse', '--verify', `${REMOTE}/${branch}`]).ok) {
  tryRun(['branch', `--set-upstream-to=${REMOTE}/${branch}`, branch]);
}

run(['log', '-n', '3', '--oneline'], '最近提交');
console.log('\n[完成]');
