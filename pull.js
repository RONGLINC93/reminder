/**
 * 从 GitHub 拉取最新代码：读取 .env 中的仓库地址与令牌，自动 fetch / pull
 * 用法：node pull.js   （或直接双击 拉取.bat）
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

/** 远端默认分支（main / master） */
function remoteDefaultBranch() {
  const r = tryRun(['ls-remote', '--symref', authUrl, 'HEAD']);
  const m = r.out.match(/ref:\s+refs\/heads\/([^\s]+)/);
  return m ? m[1] : DEFAULT_BRANCH;
}

/** 更新远程跟踪分支（用带令牌的地址，不留痕到 .git/config） */
function syncRemoteRefs() {
  tryRun(['fetch', authUrl, '+refs/heads/*:refs/remotes/origin/*']);
}

/* ------------------------------ 1. 本地仓库 ------------------------------ */

const hasRepo = tryRun(['rev-parse', '--git-dir']).ok;
let branch = '';

if (!hasRepo) {
  console.log('未检测到 git 仓库，正在初始化并从远端拉取...');
  if (!tryRun(['init', '-b', DEFAULT_BRANCH]).ok) {
    run(['init'], '初始化仓库');
  }
  run(['remote', 'add', REMOTE, repoUrl], '添加远程仓库');
  branch = remoteDefaultBranch();
  syncRemoteRefs();
  if (!tryRun(['rev-parse', '--verify', `${REMOTE}/${branch}`]).ok) {
    console.error(`[提示] 远端仓库还没有 ${branch} 分支或暂无提交，无需拉取`);
    process.exit(0);
  }
  run(['checkout', '-B', branch, `${REMOTE}/${branch}`], `检出 ${branch}`);
} else {
  branch = tryRun(['rev-parse', '--abbrev-ref', 'HEAD']).out;
  if (!branch || branch === 'HEAD') branch = remoteDefaultBranch();

  const remotes = tryRun(['remote']).out.split(/\s+/).filter(Boolean);
  if (!remotes.includes(REMOTE)) run(['remote', 'add', REMOTE, repoUrl], '添加远程仓库');
  else {
    const cur = tryRun(['remote', 'get-url', REMOTE]).out;
    if (cur && cur !== repoUrl) run(['remote', 'set-url', REMOTE, repoUrl], '更新远程地址');
  }

  /* ------------------------------ 2. 拉取 ------------------------------ */

  const dirty = tryRun(['status', '--porcelain']).out;
  if (dirty) console.log('\n[提示] 本地有未提交的改动，会自动暂存后拉取、拉完再恢复');

  console.log(`\n正在拉取 ${branch} 分支...`);
  const pull = tryRun(['pull', '--rebase', '--autostash', authUrl, branch]);
  if (pull.out) console.log(mask(pull.out));
  if (!pull.ok) {
    console.error('[错误] 拉取失败');
    if (/CONFLICT|conflict/.test(pull.out)) {
      console.error('提示：存在冲突，请手动处理冲突后执行 git rebase --continue，或先备份改动再重新拉取');
    } else if (/would be overwritten|untracked working tree files/.test(pull.out)) {
      console.error('提示：本地有文件会被远端覆盖，请先备份或移除这些文件后重试');
    }
    process.exit(1);
  }
  console.log('拉取成功');
}

/* ------------------------------ 3. 收尾 ------------------------------ */

syncRemoteRefs();
if (tryRun(['rev-parse', '--verify', `${REMOTE}/${branch}`]).ok) {
  tryRun(['branch', `--set-upstream-to=${REMOTE}/${branch}`, branch]);
}

run(['log', '-n', '5', '--oneline'], '最近提交');
console.log('\n[完成]');
