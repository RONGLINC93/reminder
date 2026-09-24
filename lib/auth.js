/* 简单账号鉴权模块：账号密码存于 data 目录的 auth.json（默认 admin/admin，
 * 可用环境变量 REMINDER_USER / REMINDER_PASS 覆盖初始值）；
 * 登录后签发随机 Token，会话保存在内存中（进程重启需重新登录）。 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createAuth(dataDir) {
  const AUTH_FILE = path.join(dataDir, 'auth.json');
  // 会话有效期：7 天
  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  // token -> { user, expires }
  const sessions = new Map();

  function ensureAuthFile() {
    if (fs.existsSync(AUTH_FILE)) return;
    const user = process.env.REMINDER_USER || 'admin';
    const pass = process.env.REMINDER_PASS || 'admin';
    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(AUTH_FILE, JSON.stringify({ user, pass }, null, 2), 'utf8');
    } catch (err) {
      console.error('[auth] 初始化账号文件失败:', err.message);
    }
  }

  function readAuth() {
    ensureAuthFile();
    try {
      const obj = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
      return {
        user: typeof obj.user === 'string' && obj.user ? obj.user : 'admin',
        pass: typeof obj.pass === 'string' ? obj.pass : 'admin',
      };
    } catch (err) {
      return { user: 'admin', pass: 'admin' };
    }
  }

  function updateCredentials(user, pass) {
    ensureAuthFile();
    const u = String(user || '').trim();
    if (!u) throw new Error('用户名不能为空');
    if (!pass) throw new Error('密码不能为空');
    if (pass.length > 200) throw new Error('密码过长');
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ user: u, pass }, null, 2), 'utf8');
  }

  function verify(user, pass) {
    const a = readAuth();
    return user === a.user && pass === a.pass;
  }

  function issueToken(user) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { user, expires: Date.now() + SESSION_TTL_MS });
    return token;
  }

  function validToken(token) {
    if (!token || !sessions.has(token)) return false;
    const s = sessions.get(token);
    if (s.expires <= Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function currentUser(token) {
    const s = sessions.get(token);
    return s ? s.user : null;
  }

  function revoke(token) {
    if (token) sessions.delete(token);
  }

  function revokeAll() {
    sessions.clear();
  }

  return {
    readAuth,
    updateCredentials,
    verify,
    issueToken,
    validToken,
    currentUser,
    revoke,
    revokeAll,
    SESSION_TTL_MS,
  };
}

module.exports = { createAuth };
