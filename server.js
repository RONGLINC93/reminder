const path = require('path');
const fs = require('fs');
const express = require('express');
const notifier = require('./lib/notifier');
const { keyOf } = require('./lib/dates');
const { lunarInfoOf, nextLunarDate } = require('./lib/lunar');

const PORT = process.env.PORT || 9530;
const CHECK_INTERVAL_MS = 60 * 1000;
const ROOT = __dirname;
// 数据目录：默认程序目录下的 data/；fnOS 等环境可通过 REMINDER_DATA_DIR 指定到共享目录
const DATA_DIR = process.env.REMINDER_DATA_DIR || path.join(ROOT, 'data');
// 监听地址：默认 '::'（IPv6 双栈，同时接受 IPv4 与 IPv6 访问），不支持时自动回退 0.0.0.0
const HOST = process.env.HOST || '::';
const DATA_FILE = path.join(DATA_DIR, 'reminders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

const WEEK_STARTS = ['monday', 'sunday'];

const DEFAULT_NOTIFY = {
  wecomBot: { enabled: false, webhook: '' },
  wecomApp: { enabled: false, corpid: '', corpsecret: '', agentid: '', touser: '@all' },
  qq: { enabled: false, baseUrl: '', token: '', targetType: 'group', targetId: '' },
  wechat: { enabled: false, provider: 'serverchan', sendKey: '', token: '' },
  webhook: { enabled: false, url: '', token: '' },
  webhookToken: '',
};

const DEFAULT_SETTINGS = {
  weekStart: 'monday',
  showLunar: true,
  showHoliday: true,
  dailyNotifyTime: '09:00',
  notify: DEFAULT_NOTIFY,
};

const app = express();
app.use(express.json({ limit: '1mb' }));
// 前端资源不缓存，避免改完页面刷新后仍是旧代码
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

/* ------------------------------ 数据存取 ------------------------------ */

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

function readAll() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('读取提醒数据失败，已回退为空列表:', err.message);
    return [];
  }
}

function writeAll(list) {
  ensureDataFile();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function defaultSettings() {
  return {
    weekStart: DEFAULT_SETTINGS.weekStart,
    showLunar: DEFAULT_SETTINGS.showLunar,
    showHoliday: DEFAULT_SETTINGS.showHoliday,
    dailyNotifyTime: DEFAULT_SETTINGS.dailyNotifyTime,
    notify: JSON.parse(JSON.stringify(DEFAULT_NOTIFY)),
  };
}

function readSettings() {
  ensureDataFile();
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return defaultSettings();
    const obj = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return normalizeSettings(obj);
  } catch (err) {
    console.error('读取设置失败，已回退为默认设置:', err.message);
    return defaultSettings();
  }
}

function normalizeSettings(obj) {
  const src = obj && typeof obj === 'object' ? obj : {};
  const base = defaultSettings();
  const out = { ...base };
  if (WEEK_STARTS.includes(src.weekStart)) out.weekStart = src.weekStart;
  if (typeof src.showLunar === 'boolean') out.showLunar = src.showLunar;
  if (typeof src.showHoliday === 'boolean') out.showHoliday = src.showHoliday;
  if (typeof src.dailyNotifyTime === 'string' && TIME_RE.test(src.dailyNotifyTime)) {
    out.dailyNotifyTime = src.dailyNotifyTime;
  }
  out.notify = sanitizeNotify(src.notify);
  return out;
}

function writeSettings(settings) {
  ensureDataFile();
  const tmp = SETTINGS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(tmp, SETTINGS_FILE);
}

/* ------------------------------ 校验工具 ------------------------------ */

const TYPES = ['event', 'birthday', 'todo', 'anniversary', 'other'];
const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const COLORS = ['indigo', 'rose', 'amber', 'emerald', 'sky', 'violet'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isDate(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function str(v, max = 500) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** 只保留已知字段，避免写入任意内容 */
function sanitizeNotify(input) {
  const src = input && typeof input === 'object' ? input : {};
  const pick = (name) => (src[name] && typeof src[name] === 'object' ? src[name] : {});
  const wecomBot = pick('wecomBot');
  const wecomApp = pick('wecomApp');
  const qq = pick('qq');
  const wechat = pick('wechat');
  const webhook = pick('webhook');
  return {
    wecomBot: { enabled: !!wecomBot.enabled, webhook: str(wecomBot.webhook) },
    wecomApp: {
      enabled: !!wecomApp.enabled,
      corpid: str(wecomApp.corpid, 100),
      corpsecret: str(wecomApp.corpsecret, 200),
      agentid: str(wecomApp.agentid, 20),
      touser: str(wecomApp.touser, 200) || '@all',
    },
    qq: {
      enabled: !!qq.enabled,
      baseUrl: str(qq.baseUrl, 200),
      token: str(qq.token, 200),
      targetType: qq.targetType === 'private' ? 'private' : 'group',
      targetId: str(qq.targetId, 40),
    },
    wechat: {
      enabled: !!wechat.enabled,
      provider: wechat.provider === 'pushplus' ? 'pushplus' : 'serverchan',
      sendKey: str(wechat.sendKey, 100),
      token: str(wechat.token, 200),
    },
    webhook: { enabled: !!webhook.enabled, url: str(webhook.url), token: str(webhook.token, 200) },
    webhookToken: str(src.webhookToken, 200),
  };
}

let seq = Date.now();
function genId() {
  seq += 1;
  return `${seq.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(payload, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);

  if (has('title')) {
    const title = String(payload.title ?? '').trim();
    if (!title) throw new HttpError(400, '标题不能为空');
    if (title.length > 60) throw new HttpError(400, '标题不能超过 60 个字');
    out.title = title;
  } else if (!partial) {
    throw new HttpError(400, '缺少标题');
  }

  if (has('type')) {
    if (!TYPES.includes(payload.type)) throw new HttpError(400, '提醒类型不合法');
    out.type = payload.type;
  } else if (!partial) {
    out.type = 'event';
  }

  if (has('date')) {
    if (!isDate(payload.date)) throw new HttpError(400, '日期格式应为 YYYY-MM-DD');
    out.date = payload.date;
  } else if (!partial) {
    throw new HttpError(400, '缺少日期');
  }

  if (has('time')) {
    const time = payload.time == null ? '' : String(payload.time).trim();
    if (time && !TIME_RE.test(time)) throw new HttpError(400, '时间格式应为 HH:MM');
    out.time = time || '';
  }

  if (has('repeat')) {
    if (!REPEATS.includes(payload.repeat)) throw new HttpError(400, '重复方式不合法');
    out.repeat = payload.repeat;
  }

  if (has('leadDays')) {
    const n = Number(payload.leadDays);
    if (!Number.isFinite(n) || n < 0 || n > 365) throw new HttpError(400, '提前提醒天数应在 0-365 之间');
    out.leadDays = Math.floor(n);
  }

  if (has('note')) {
    out.note = String(payload.note ?? '').slice(0, 500);
  }

  if (has('color')) {
    if (!COLORS.includes(payload.color)) throw new HttpError(400, '颜色不合法');
    out.color = payload.color;
  }

  if (has('done')) out.done = !!payload.done;

  if (has('lunar')) out.lunar = !!payload.lunar;

  return out;
}

/** 农历提醒：记录农历月日（闰月为负数），便于按年换算 */
function applyLunar(item) {
  if (!item.lunar || !item.date) {
    delete item.lunarMonth;
    delete item.lunarDay;
    return item;
  }
  const info = lunarInfoOf(item.date);
  item.lunarMonth = info.month;
  item.lunarDay = info.day;
  return item;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------ 接口路由 ------------------------------ */

app.get('/api/reminders', (req, res) => {
  const list = readAll().sort((a, b) => (a.date === b.date ? (a.time || '') .localeCompare(b.time || '') : a.date.localeCompare(b.date)));
  res.json(list);
});

app.post('/api/reminders', (req, res, next) => {
  try {
    const data = normalize(req.body || {});
    const now = new Date().toISOString();
    const item = {
      id: genId(),
      title: data.title,
      type: data.type || 'event',
      date: data.date,
      time: data.time || '',
      repeat: data.repeat || 'none',
      leadDays: data.leadDays == null ? 0 : data.leadDays,
      note: data.note || '',
      color: data.color || 'indigo',
      lunar: !!data.lunar,
      done: false,
      createdAt: now,
      updatedAt: now,
    };
    applyLunar(item);
    const list = readAll();
    list.push(item);
    writeAll(list);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

app.put('/api/reminders/:id', (req, res, next) => {
  try {
    const data = normalize(req.body || {}, { partial: true });
    const list = readAll();
    const idx = list.findIndex((x) => x.id === req.params.id);
    if (idx === -1) throw new HttpError(404, '提醒不存在');
    const updated = applyLunar({ ...list[idx], ...data, updatedAt: new Date().toISOString() });
    list[idx] = updated;
    writeAll(list);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/reminders/:id', (req, res, next) => {
  try {
    const list = readAll();
    const idx = list.findIndex((x) => x.id === req.params.id);
    if (idx === -1) throw new HttpError(404, '提醒不存在');
    const [removed] = list.splice(idx, 1);
    writeAll(list);
    res.json(removed);
  } catch (err) {
    next(err);
  }
});

app.post('/api/reminders/:id/toggle', (req, res, next) => {
  try {
    const list = readAll();
    const idx = list.findIndex((x) => x.id === req.params.id);
    if (idx === -1) throw new HttpError(404, '提醒不存在');
    list[idx].done = !list[idx].done;
    list[idx].updatedAt = new Date().toISOString();
    writeAll(list);
    res.json(list[idx]);
  } catch (err) {
    next(err);
  }
});

app.get('/api/settings', (req, res) => res.json(readSettings()));

app.put('/api/settings', (req, res, next) => {
  try {
    const body = req.body || {};
    const current = readSettings();
    if (Object.prototype.hasOwnProperty.call(body, 'weekStart')) {
      if (!WEEK_STARTS.includes(body.weekStart)) throw new HttpError(400, '每周第一天只能是 monday 或 sunday');
      current.weekStart = body.weekStart;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'showLunar')) {
      if (typeof body.showLunar !== 'boolean') throw new HttpError(400, 'showLunar 应为布尔值');
      current.showLunar = body.showLunar;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'showHoliday')) {
      if (typeof body.showHoliday !== 'boolean') throw new HttpError(400, 'showHoliday 应为布尔值');
      current.showHoliday = body.showHoliday;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'dailyNotifyTime')) {
      if (!TIME_RE.test(String(body.dailyNotifyTime || ''))) throw new HttpError(400, '每日推送时间格式应为 HH:MM');
      current.dailyNotifyTime = body.dailyNotifyTime;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'notify')) {
      current.notify = sanitizeNotify(body.notify);
    }
    writeSettings(current);
    res.json(current);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ 通知推送接口 ------------------------------ */

/** 发送测试消息 */
app.post('/api/notify/test', async (req, res, next) => {
  try {
    const settings = readSettings();
    const channel = (req.body || {}).channel;
    const title = '🔔 提醒网站测试通知';
    const content = `这是一条测试消息。\n时间：${new Date().toLocaleString('zh-CN')}`;
    let results;
    if (channel && channel !== 'all') {
      const notify = { ...settings.notify };
      Object.keys(notify).forEach((k) => {
        if (k !== channel && notify[k] && typeof notify[k] === 'object') notify[k] = { ...notify[k], enabled: false };
      });
      results = await notifier.broadcast(notify, title, content, 'test');
    } else {
      results = await notifier.broadcast(settings.notify, title, content, 'test');
    }
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

/** 手动推送指定提醒 */
app.post('/api/notify/send', async (req, res, next) => {
  try {
    const id = (req.body || {}).id;
    const item = readAll().find((x) => x.id === id);
    if (!item) throw new HttpError(404, '提醒不存在');
    const settings = readSettings();
    const today = keyOf(new Date());
    const next = notifier.itemNextDate(item, today) || item.date;
    const results = await notifier.broadcast(
      settings.notify,
      `⏰ 提醒：${item.title}`,
      notifier.buildMessage(item, next),
      'manual'
    );
    res.json({ title: item.title, next, results });
  } catch (err) {
    next(err);
  }
});

/** 推送记录 */
app.get('/api/notify/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json(notifier.getLogs(limit));
});

/** 对外通知接口：接收外部系统消息并转发到已启用机器人 */
app.post('/api/webhook/notify', async (req, res, next) => {
  try {
    const settings = readSettings();
    const expected = settings.notify.webhookToken;
    if (!expected) throw new HttpError(403, '未配置入站 Token，请先在设置中填写「入站 Token」');
    const header = req.get('Authorization') || '';
    const body = req.body || {};
    const provided = header.startsWith('Bearer ') ? header.slice(7) : (body.token || '');
    if (provided !== expected) throw new HttpError(401, 'Token 校验失败');
    const title = String(body.title || '外部通知').slice(0, 100);
    const content = String(body.content || body.text || '').slice(0, 1000);
    const results = await notifier.broadcast(settings.notify, title, content, 'webhook');
    res.json({ ok: results.some((r) => r.ok), results });
  } catch (err) {
    next(err);
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, count: readAll().length }));

app.use((err, req, res, next) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || '服务器内部错误' });
});

ensureDataFile();

/* ------------------------------ 定时推送 ------------------------------ */

async function checkAndNotify() {
  try {
    const settings = readSettings();
    const enabled = Object.keys(settings.notify || {})
      .filter((k) => settings.notify[k] && settings.notify[k].enabled).length;
    if (!enabled) return;
    const { sent } = await notifier.runDueCheck(settings, readAll(), new Date());
    if (sent) console.log(`[notify] 已推送 ${sent} 条提醒`);
  } catch (err) {
    console.error('[notify] 定时检查失败:', err.message);
  }
}

function start(port, host) {
  const server = app.listen(port, host, () => {
    const addr = server.address();
    const shown = addr && addr.address ? `${addr.address}:${addr.port} (${addr.family})` : `http://localhost:${port}`;
    console.log(`提醒网站已启动: http://localhost:${port}`);
    console.log(`监听地址: ${shown}`);
    setTimeout(checkAndNotify, 8000);
    setInterval(checkAndNotify, CHECK_INTERVAL_MS);
  });

  server.on('error', (err) => {
    if (host !== '0.0.0.0' && (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL' || err.code === 'EINVAL')) {
      console.warn(`[listen] ${host} 不可用（${err.code}），回退到 0.0.0.0（仅 IPv4）`);
      start(port, '0.0.0.0');
      return;
    }
    if (err.code === 'EADDRINUSE') {
      console.error(`[listen] 端口 ${port} 已被占用，请修改端口后重试`);
    }
    console.error(err);
    process.exit(1);
  });
}

start(PORT, HOST);
