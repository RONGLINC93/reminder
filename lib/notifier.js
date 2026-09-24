/* 通知推送：企业微信 / QQ / 微信推送 / 自定义通知接口 */

const fs = require('fs');
const path = require('path');
const { keyOf, addDaysKey, diffDays, nextOccurrence } = require('./dates');
const { nextLunarDate, lunarPartsOf, lunarInfoOf } = require('./lunar');

// 与 server.js 保持一致：优先使用环境变量指定的数据目录
const DATA_DIR = process.env.REMINDER_DATA_DIR || path.join(__dirname, '..', 'data');
const SENT_FILE = path.join(DATA_DIR, 'notify-sent.json');
const LOG_FILE = path.join(DATA_DIR, 'notify-log.json');
const LOG_LIMIT = 100;

const CHANNEL_LABELS = {
  wecomBot: '企业微信机器人',
  wecomApp: '企业微信应用',
  qq: 'QQ 机器人',
  wechat: '微信推送',
  webhook: '通知接口',
};

/* ------------------------------ 存储 ------------------------------ */

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function writeJson(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function sentMap() {
  const m = readJson(SENT_FILE, {});
  return m && typeof m === 'object' ? m : {};
}

function isSent(key) {
  return !!sentMap()[key];
}

function markSent(key) {
  const map = sentMap();
  map[key] = new Date().toISOString();
  // 只保留最近 2000 条记录，避免无限增长
  const keys = Object.keys(map);
  if (keys.length > 2000) {
    keys.slice(0, keys.length - 2000).forEach((k) => delete map[k]);
  }
  writeJson(SENT_FILE, map);
}

function appendLog(entry) {
  const list = readJson(LOG_FILE, []);
  list.unshift(entry);
  const trimmed = Array.isArray(list) ? list.slice(0, LOG_LIMIT) : [];
  writeJson(LOG_FILE, trimmed);
}

function getLogs(limit = 30) {
  const list = readJson(LOG_FILE, []);
  return Array.isArray(list) ? list.slice(0, limit) : [];
}

/* ------------------------------ HTTP ------------------------------ */

async function request(url, options = {}, timeout = 10000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (err) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data, text: text.slice(0, 300) };
}

async function postJson(url, body, headers = {}) {
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function postForm(url, body, headers = {}) {
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString(),
  });
}

function fail(msg) {
  return { ok: false, msg };
}

/* ------------------------------ 各通道 ------------------------------ */

/** 企业微信群机器人：markdown 消息 */
async function sendWecomBot(cfg, title, content) {
  if (!cfg.webhook) return fail('未填写机器人 Webhook 地址');
  const r = await postJson(cfg.webhook, {
    msgtype: 'markdown',
    markdown: { content: `### ${title}\n${content}` },
  });
  if (r.data && r.data.errcode === 0) return { ok: true, msg: '已发送' };
  return fail(r.data && r.data.errmsg ? `${r.data.errmsg}（errcode ${r.data.errcode}）` : r.text || `HTTP ${r.status}`);
}

/** 企业微信应用消息：先取 access_token 再发送文本 */
async function sendWecomApp(cfg, title, content) {
  if (!cfg.corpid || !cfg.corpsecret || !cfg.agentid) return fail('未填完 corpid / corpsecret / agentid');
  const tokenRes = await request(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(cfg.corpid)}&corpsecret=${encodeURIComponent(cfg.corpsecret)}`
  );
  const accessToken = tokenRes.data && tokenRes.data.access_token;
  if (!accessToken) return fail(tokenRes.data && tokenRes.data.errmsg ? tokenRes.data.errmsg : '获取 access_token 失败');
  const r = await postJson(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`, {
    touser: cfg.touser || '@all',
    msgtype: 'text',
    agentid: Number(cfg.agentid),
    text: { content: `${title}\n${content}` },
  });
  if (r.data && r.data.errcode === 0) return { ok: true, msg: '已发送' };
  return fail(r.data && r.data.errmsg ? r.data.errmsg : r.text || `HTTP ${r.status}`);
}

/** QQ 机器人：OneBot v11（go-cqhttp / Lagrange / NapCat 等） */
async function sendQQ(cfg, title, content) {
  if (!cfg.baseUrl) return fail('未填写机器人接口地址');
  if (!cfg.targetId) return fail('未填写目标 QQ 号 / 群号');
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const headers = cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {};
  const isPrivate = cfg.targetType === 'private';
  const body = {
    message_type: isPrivate ? 'private' : 'group',
    message: `${title}\n${content}`,
  };
  if (isPrivate) body.user_id = Number(cfg.targetId);
  else body.group_id = Number(cfg.targetId);
  const r = await postJson(`${base}/send_msg`, body, headers);
  if (r.ok && (!r.data || r.data.status === 'ok' || r.data.retcode === 0)) return { ok: true, msg: '已发送' };
  if (r.status === 404) {
    const legacy = await postJson(`${base}/${isPrivate ? 'send_private_msg' : 'send_group_msg'}`, body, headers);
    if (legacy.ok && (!legacy.data || legacy.data.status === 'ok' || legacy.data.retcode === 0)) return { ok: true, msg: '已发送' };
    return fail(legacy.data && legacy.data.message ? legacy.data.message : legacy.text || `HTTP ${legacy.status}`);
  }
  return fail(r.data && (r.data.message || r.data.wording) ? (r.data.message || r.data.wording) : r.text || `HTTP ${r.status}`);
}

/** 微信推送：Server 酱 Turbo / PushPlus */
async function sendWechat(cfg, title, content) {
  if (cfg.provider === 'pushplus') {
    if (!cfg.token) return fail('未填写 PushPlus token');
    const r = await postJson('https://www.pushplus.plus/send', {
      token: cfg.token, title, content, template: 'txt',
    });
    if (r.data && (r.data.code === 200 || r.data.msg === '请求成功')) return { ok: true, msg: '已发送' };
    return fail(r.data && r.data.msg ? r.data.msg : r.text || `HTTP ${r.status}`);
  }
  if (!cfg.sendKey) return fail('未填写 Server 酱 SendKey');
  const r = await postForm(`https://sctapi.ftqq.com/${encodeURIComponent(cfg.sendKey)}.send`, {
    title, desp: content,
  });
  if (r.data && (r.data.code === 0 || r.data.success)) return { ok: true, msg: '已发送' };
  return fail(r.data && r.data.message ? r.data.message : r.text || `HTTP ${r.status}`);
}

/** 自定义通知接口：POST JSON，可选 Bearer Token */
async function sendWebhook(cfg, title, content) {
  if (!cfg.url) return fail('未填写通知接口地址');
  const headers = cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {};
  const r = await postJson(cfg.url, {
    type: 'reminder',
    title,
    content,
    time: new Date().toISOString(),
  }, headers);
  if (r.ok) return { ok: true, msg: `已发送（HTTP ${r.status}）` };
  return fail(r.text || `HTTP ${r.status}`);
}

const SENDERS = {
  wecomBot: sendWecomBot,
  wecomApp: sendWecomApp,
  qq: sendQQ,
  wechat: sendWechat,
  webhook: sendWebhook,
};

function enabledChannels(notify) {
  const cfg = notify || {};
  return Object.keys(SENDERS).filter((name) => cfg[name] && cfg[name].enabled);
}

/** 向所有已启用通道推送一条消息 */
async function broadcast(notify, title, content, source = 'manual') {
  const names = enabledChannels(notify);
  if (!names.length) {
    return [{ channel: '-', label: '无启用通道', ok: false, msg: '请先在设置中启用至少一个机器人' }];
  }
  const results = await Promise.all(names.map(async (name) => {
    try {
      const r = await SENDERS[name](notify[name], title, content);
      return { channel: name, label: CHANNEL_LABELS[name], ...r };
    } catch (err) {
      return { channel: name, label: CHANNEL_LABELS[name], ok: false, msg: err.message || '请求异常' };
    }
  }));
  appendLog({
    time: new Date().toISOString(),
    title,
    source,
    results: results.map(({ channel, label, ok, msg }) => ({ channel, label, ok, msg })),
  });
  return results;
}

/* ------------------------------ 定时检查 ------------------------------ */

function dueKey(item, nextDate) {
  return `${item.id}@${nextDate}`;
}

/** 提醒下一次发生日期：农历提醒按农历换算 */
function itemNextDate(item, today) {
  if (item.lunar && item.repeat !== 'none') {
    return nextLunarDate(item, today) || nextOccurrence(item, today);
  }
  return nextOccurrence(item, today);
}

/** 找出到点需要推送的提醒（提前 leadDays 天，且不早于提醒日前一天补发） */
function pickDueItems(items, now, defaultTime = '09:00') {
  const today = keyOf(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const due = [];
  items.forEach((item) => {
    if (item.done) return;
    const next = itemNextDate(item, today);
    if (!next) return;
    const notifyDate = addDaysKey(next, -(Number(item.leadDays) || 0));
    if (diffDays(today, notifyDate) > 0) return; // 还没到推送日
    if (diffDays(notifyDate, today) > 1) return; // 过期太久不再补推
    const at = item.time || defaultTime || '09:00';
    const [h, m] = at.split(':').map(Number);
    const atMinutes = (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0);
    if (diffDays(today, next) === 0 && nowMinutes < atMinutes) return; // 当天但未到提醒时间
    if (isSent(dueKey(item, next))) return;
    due.push({ item, next, notifyDate });
  });
  return due;
}

function countdownText(days) {
  if (days === 0) return '就是今天';
  if (days > 0) return `还有 ${days} 天`;
  return `已过 ${-days} 天`;
}

const TYPE_LABEL = {
  event: '事件', birthday: '生日', todo: '办事', anniversary: '纪念日', other: '其他',
};

function buildMessage(item, nextDate) {
  const type = TYPE_LABEL[item.type] || '提醒';
  const days = diffDays(keyOf(new Date()), nextDate);
  const lines = [
    `类型：${type}`,
    `日期：${nextDate}${item.time ? ` ${item.time}` : ''}`,
    `倒计时：${countdownText(days)}`,
  ];
  if (item.lunar) {
    const { month, day } = lunarPartsOf(item);
    if (Number.isFinite(month) && Number.isFinite(day)) {
      const info = lunarInfoOf(item.date);
      lines.push(`农历：${info.monthName}${info.dayName}`);
    }
  }
  if (item.repeat && item.repeat !== 'none') {
    const map = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' };
    lines.push(`重复：${map[item.repeat] || item.repeat}`);
  }
  if (item.note) lines.push(`备注：${item.note}`);
  return lines.join('\n');
}

async function runDueCheck(settings, items, now = new Date()) {
  const due = pickDueItems(items, now, settings && settings.dailyNotifyTime);
  let sentCount = 0;
  for (const { item, next } of due) {
    const title = `⏰ 提醒：${item.title}`;
    const results = await broadcast(settings.notify, title, buildMessage(item, next), 'auto');
    markSent(dueKey(item, next));
    if (results.some((r) => r.ok)) sentCount += 1;
  }
  return { checked: due.length, sent: sentCount };
}

module.exports = {
  CHANNEL_LABELS,
  broadcast,
  runDueCheck,
  pickDueItems,
  itemNextDate,
  buildMessage,
  isSent,
  markSent,
  getLogs,
  appendLog,
  dueKey,
};
