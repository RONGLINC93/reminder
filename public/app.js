/* 提醒网站前端逻辑 */

const TYPE_META = {
  event: { label: '事件', icon: '📅', color: 'indigo' },
  birthday: { label: '生日', icon: '🎂', color: 'rose' },
  todo: { label: '办事', icon: '✅', color: 'emerald' },
  anniversary: { label: '纪念日', icon: '💝', color: 'violet' },
  other: { label: '其他', icon: '🔔', color: 'amber' },
};

const COLOR_LIST = ['indigo', 'rose', 'amber', 'emerald', 'sky', 'violet'];
const REPEAT_LABEL = { none: '不重复', daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' };
const COLOR_CSS = {
  indigo: 'var(--c-indigo)',
  rose: 'var(--c-rose)',
  amber: 'var(--c-amber)',
  emerald: 'var(--c-emerald)',
  sky: 'var(--c-sky)',
  violet: 'var(--c-violet)',
};

const WEEK_LABELS = {
  monday: ['一', '二', '三', '四', '五', '六', '日'],
  sunday: ['日', '一', '二', '三', '四', '五', '六'],
};
const WEEK_START_OPTIONS = [
  { key: 'monday', label: '星期一' },
  { key: 'sunday', label: '星期日' },
];

const state = {
  items: [],
  cursor: startOfMonth(new Date()),
  selected: keyOf(new Date()),
  view: 'month',
  lastView: 'month',
  filter: 'all',
  editingId: null,
  formType: 'event',
  formColor: 'indigo',
  settings: readLocalSettings(),
  tmpWeekStart: readLocalSettings().weekStart,
  token: localStorage.getItem('reminder.token') || '',
  user: localStorage.getItem('reminder.user') || '',
};

/* ------------------------------ 本地设置缓存 ------------------------------ */

function defaultNotify() {
  return {
    wecomBot: { enabled: false, webhook: '' },
    wecomApp: { enabled: false, corpid: '', corpsecret: '', agentid: '', touser: '@all' },
    qq: { enabled: false, baseUrl: '', token: '', targetType: 'group', targetId: '' },
    wechat: { enabled: false, provider: 'serverchan', sendKey: '', token: '' },
    webhook: { enabled: false, url: '', token: '' },
    webhookToken: '',
  };
}

function mergeNotify(src) {
  const base = defaultNotify();
  const s = src && typeof src === 'object' ? src : {};
  Object.keys(base).forEach((key) => {
    if (key === 'webhookToken') {
      base[key] = typeof s[key] === 'string' ? s[key] : '';
      return;
    }
    const part = s[key] && typeof s[key] === 'object' ? s[key] : {};
    base[key] = { ...base[key], ...part };
  });
  return base;
}

function readLocalSettings() {
  const fallback = {
    weekStart: 'monday',
    showLunar: true,
    showHoliday: true,
    dailyNotifyTime: '09:00',
    notify: defaultNotify(),
  };
  try {
    const raw = localStorage.getItem('reminder.settings');
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        return {
          weekStart: obj.weekStart === 'sunday' ? 'sunday' : 'monday',
          showLunar: obj.showLunar !== false,
          showHoliday: obj.showHoliday !== false,
          dailyNotifyTime: /^\d{2}:\d{2}$/.test(obj.dailyNotifyTime || '') ? obj.dailyNotifyTime : '09:00',
          notify: mergeNotify(obj.notify),
        };
      }
    }
  } catch (err) {
    /* 忽略本地缓存异常 */
  }
  return fallback;
}

function saveLocalSettings(settings) {
  try {
    localStorage.setItem('reminder.settings', JSON.stringify(settings));
  } catch (err) {
    /* 忽略本地缓存异常 */
  }
}

function weekStartOffset(firstDay) {
  const dow = firstDay.getDay();
  return state.settings.weekStart === 'sunday' ? dow : (dow + 6) % 7;
}

function isWeekendIndex(index) {
  return state.settings.weekStart === 'sunday' ? index === 0 || index === 6 : index >= 5;
}

function renderWeekdays() {
  const labels = WEEK_LABELS[state.settings.weekStart] || WEEK_LABELS.monday;
  document.getElementById('weekdays').innerHTML = labels
    .map((t, i) => `<span class="${isWeekendIndex(i) ? 'we' : ''}">${t}</span>`)
    .join('');
}

/* ------------------------------ 日期工具 ------------------------------ */

function keyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDaysKey(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

function diffDays(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function todayKey() {
  return keyOf(new Date());
}

function metaOf(item) {
  return TYPE_META[item.type] || TYPE_META.other;
}

function colorOf(item) {
  return COLOR_CSS[item.color] || COLOR_CSS.indigo;
}

/** 该提醒是否在某一天出现（考虑重复规则与农历） */
function occursOn(item, key) {
  if (!item.date) return false;
  if (item.lunar && item.repeat !== 'none') return lunarKeysOf(item).has(key);
  if (item.repeat === 'none') return item.date === key;
  if (diffDays(item.date, key) < 0) return false;
  const a = parseKey(item.date);
  const b = parseKey(key);
  switch (item.repeat) {
    case 'daily':
      return true;
    case 'weekly':
      return a.getDay() === b.getDay();
    case 'monthly':
      return b.getDate() === Math.min(a.getDate(), daysInMonth(b.getFullYear(), b.getMonth()));
    case 'yearly':
      return a.getMonth() === b.getMonth() &&
        b.getDate() === Math.min(a.getDate(), daysInMonth(b.getFullYear(), b.getMonth()));
    default:
      return item.date === key;
  }
}

/** 从 fromKey 当天（含）起的下一次发生日期 */
function nextOccurrence(item, fromKey) {
  if (!item.date) return null;
  if (item.repeat === 'none') return item.date;
  if (item.lunar) {
    const keys = [...lunarKeysOf(item)].filter((k) => k >= fromKey).sort();
    return keys[0] || null;
  }
  if (diffDays(item.date, fromKey) < 0) {
    // 起始日期已过：仍按规则向后推算
    for (let i = 0; i <= 800; i += 1) {
      const key = addDaysKey(fromKey, i);
      if (occursOnRaw(item, key)) return key;
    }
    return null;
  }
  for (let i = 0; i <= 800; i += 1) {
    const key = addDaysKey(fromKey, i);
    if (occursOn(item, key)) return key;
  }
  return null;
}

function occursOnRaw(item, key) {
  const a = parseKey(item.date);
  const b = parseKey(key);
  switch (item.repeat) {
    case 'daily': return true;
    case 'weekly': return a.getDay() === b.getDay();
    case 'monthly': return b.getDate() === Math.min(a.getDate(), daysInMonth(b.getFullYear(), b.getMonth()));
    case 'yearly': return a.getMonth() === b.getMonth() &&
      b.getDate() === Math.min(a.getDate(), daysInMonth(b.getFullYear(), b.getMonth()));
    default: return item.date === key;
  }
}

/* ------------------------------ 农历（阴历） ------------------------------ */

const lunarCache = new Map();
const hasLunarLib = typeof Solar !== 'undefined' && typeof Lunar !== 'undefined';

function lunarOf(key) {
  if (!hasLunarLib || !key) return null;
  try {
    const [y, m, d] = key.split('-').map(Number);
    const l = Solar.fromYmd(y, m, d).getLunar();
    const month = l.getMonth();
    const festivals = l.getFestivals() || [];
    return {
      month,
      day: l.getDay(),
      monthName: `${month < 0 ? '闰' : ''}${l.getMonthInChinese()}月`,
      dayName: l.getDayInChinese(),
      festival: festivals[0] || '',
      jieQi: l.getJieQi() || '',
    };
  } catch (err) {
    return null;
  }
}

/** 国家法定节假日（含调休补班） */
function holidayOf(key) {
  if (!hasLunarLib || typeof HolidayUtil === 'undefined' || !key) return null;
  try {
    const h = HolidayUtil.getHoliday(String(key).replace(/-/g, ''));
    if (!h) return null;
    return { name: h.getName(), work: !!h.isWork(), target: h.getTarget() };
  } catch (err) {
    return null;
  }
}

/** 日期行右侧显示的农历文字：农历节日 > 节气 > 月初 > 农历日（法定假日显示在第二行事件区） */
function dayLabel(key) {
  return state.settings.showLunar ? lunarLabel(key) : null;
}

/** 日历格子里显示的农历文字：节日 > 节气 > 月初（月份）> 农历日 */
function lunarLabel(key) {
  const info = lunarOf(key);
  if (!info) return null;
  if (info.festival) return { text: info.festival, cls: 'lunar-fest' };
  if (info.jieQi) return { text: info.jieQi, cls: 'lunar-jq' };
  if (info.dayName === '初一') return { text: info.monthName, cls: 'lunar-mon' };
  return { text: info.dayName, cls: '' };
}

function lunarParts(item) {
  if (Number.isFinite(item.lunarMonth) && Number.isFinite(item.lunarDay)) {
    return { month: item.lunarMonth, day: item.lunarDay };
  }
  const info = lunarOf(item.date);
  return info ? { month: info.month, day: info.day } : { month: NaN, day: NaN };
}

const LUNAR_MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const LUNAR_DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/** 当前选中的农历年月日 */
function lunarSelection() {
  return {
    year: Number(val('f-lunar-year')) || new Date().getFullYear(),
    month: Number(val('f-lunar-month')) || 1,
    day: Number(val('f-lunar-day')) || 1,
  };
}

/** 农历选择对应的公历日期（YYYY-MM-DD），不存在则返回 null */
function lunarSelectionSolar() {
  if (!hasLunarLib) return null;
  const { year, month, day } = lunarSelection();
  try {
    return Lunar.fromYmd(year, month, day).getSolar().toYmd();
  } catch (err) {
    return null;
  }
}

/** 渲染农历年/月/日下拉：月份含闰月，日数按该月实际天数 */
function renderLunarPicker() {
  const yearSel = document.getElementById('f-lunar-year');
  const monthSel = document.getElementById('f-lunar-month');
  const daySel = document.getElementById('f-lunar-day');
  if (!yearSel || !monthSel || !daySel) return;

  const nowYear = new Date().getFullYear();
  const cur = lunarSelection();

  const years = [];
  for (let y = 1950; y <= nowYear + 10; y += 1) years.push(y);
  yearSel.innerHTML = years.map((y) => `<option value="${y}" ${y === cur.year ? 'selected' : ''}>${y} 年</option>`).join('');

  let leapMonth = 0;
  try {
    leapMonth = LunarYear.fromYear(cur.year).getLeapMonth() || 0;
  } catch (err) {
    leapMonth = 0;
  }
  const months = [];
  for (let m = 1; m <= 12; m += 1) {
    months.push({ value: m, label: LUNAR_MONTH_NAMES[m - 1] });
    if (leapMonth === m) months.push({ value: -m, label: `闰${LUNAR_MONTH_NAMES[m - 1]}` });
  }
  if (!months.some((m) => m.value === cur.month)) cur.month = 1;
  monthSel.innerHTML = months
    .map((m) => `<option value="${m.value}" ${m.value === cur.month ? 'selected' : ''}>${m.label}</option>`)
    .join('');
  monthSel.value = String(cur.month);

  let dayCount = 29;
  try {
    const lm = LunarMonth.fromYm(cur.year, cur.month);
    if (lm && lm.getDayCount) dayCount = lm.getDayCount();
  } catch (err) {
    dayCount = 29;
  }
  if (cur.day > dayCount) cur.day = dayCount;
  daySel.innerHTML = Array.from({ length: dayCount }, (_, i) => i + 1)
    .map((d) => `<option value="${d}" ${d === cur.day ? 'selected' : ''}>${LUNAR_DAY_NAMES[d - 1]}</option>`)
    .join('');
  daySel.value = String(cur.day);
}

/** 农历提醒在各年份对应的公历日期集合（带缓存） */
function lunarKeysOf(item) {
  const cacheKey = `${item.id}:${item.updatedAt || ''}:${item.date}:${item.lunarMonth},${item.lunarDay}`;
  if (lunarCache.has(cacheKey)) return lunarCache.get(cacheKey);
  const { month, day } = lunarParts(item);
  const set = new Set();
  if (hasLunarLib && Number.isFinite(month) && Number.isFinite(day)) {
    const startYear = Number(String(item.date).slice(0, 4)) || new Date().getFullYear();
    const endYear = new Date().getFullYear() + 20;
    for (let y = Math.min(startYear, new Date().getFullYear()); y <= endYear; y += 1) {
      try {
        set.add(Lunar.fromYmd(y, month, day).getSolar().toYmd());
      } catch (err) {
        /* 该年无此闰月，跳过 */
      }
    }
  }
  lunarCache.set(cacheKey, set);
  return set;
}

function countdownText(days) {
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days === 2) return '后天';
  if (days > 0) return `${days} 天后`;
  return `逾期 ${-days} 天`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ------------------------------ 接口请求 ------------------------------ */

async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(url, {
    headers,
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (res.status === 401 && data.code === 'UNAUTHENTICATED') {
    clearAuth();
    showLogin();
    const err = new Error(data.error || '登录已过期');
    err.auth = true;
    throw err;
  }
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2200);
}

/* ------------------------------ 渲染 ------------------------------ */

function visibleItems() {
  if (state.filter === 'all') return state.items;
  return state.items.filter((i) => i.type === state.filter);
}

function renderStats() {
  const today = todayKey();
  const monthPrefix = `${state.cursor.getFullYear()}-${String(state.cursor.getMonth() + 1).padStart(2, '0')}`;
  const todayCount = visibleItems().filter((i) => occursOn(i, today)).length;
  const monthCount = visibleItems().filter((i) => {
    if (i.date.startsWith(monthPrefix)) return true;
    const next = nextOccurrence(i, `${monthPrefix}-01`);
    return !!next && next.startsWith(monthPrefix);
  }).length;
  const soonCount = visibleItems().filter((i) => {
    if (i.done) return false;
    const next = nextOccurrence(i, today);
    return !!next && diffDays(today, next) <= 7;
  }).length;

  document.getElementById('stats').innerHTML = `
    <div class="stat"><b>${todayCount}</b><span>今日提醒</span></div>
    <div class="stat"><b>${monthCount}</b><span>本月安排</span></div>
    <div class="stat ${soonCount ? 'alert' : ''}"><b>${soonCount}</b><span>7 天内</span></div>
  `;
}

function renderFilters() {
  const box = document.getElementById('filters');
  const opts = [{ key: 'all', label: '全部' }].concat(
    Object.keys(TYPE_META).map((k) => ({ key: k, label: TYPE_META[k].label, icon: TYPE_META[k].icon }))
  );
  box.innerHTML = opts.map((o) => `
    <button class="chip ${state.filter === o.key ? 'active' : ''}" data-filter="${o.key}">
      ${o.icon ? `<span>${o.icon}</span>` : ''}${o.label}
    </button>
  `).join('');
  box.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      renderAll();
    });
  });
}

function renderCalendar() {
  const year = state.cursor.getFullYear();
  const month = state.cursor.getMonth();
  document.getElementById('cal-title').textContent = `${year} 年 ${month + 1} 月`;

  renderWeekdays();
  const grid = document.getElementById('calendar-grid');
  const first = new Date(year, month, 1);
  const offset = weekStartOffset(first);
  const total = daysInMonth(year, month);
  const cells = Math.ceil((offset + total) / 7) * 7;
  const today = todayKey();

  let html = '';
  for (let i = 0; i < cells; i += 1) {
    const cur = new Date(year, month, 1 - offset + i);
    const key = keyOf(cur);
    const other = cur.getMonth() !== month;
    const weekend = cur.getDay() === 0 || cur.getDay() === 6;
    const list = visibleItems().filter((it) => occursOn(it, key));
    const cls = ['cell'];
    if (other) cls.push('other-month');
    if (weekend) cls.push('weekend');
    if (key === state.selected) cls.push('selected');
    if (key === today) cls.push('today');

    const hol = state.settings.showHoliday !== false ? holidayOf(key) : null;
    if (hol) cls.push(hol.work ? 'workday' : 'holiday');

    // 第二行：法定假日排在最前，相当于一条提示事件，其后才是当天提醒
    const entries = [];
    if (hol) {
      entries.push({
        cls: `mini holiday-pill ${hol.work ? 'work' : 'rest'}`,
        style: '',
        text: hol.work ? `🔧 ${hol.name}·调休` : `🎉 ${hol.name}`,
        title: hol.work ? `${hol.name}（调休上班）` : `${hol.name}（放假）`,
        dot: hol.work ? '#98a2b6' : '#d8342f',
      });
    }
    list.forEach((it) => entries.push({
      cls: 'mini',
      style: `background:${colorOf(it)}`,
      text: `${metaOf(it).icon} ${escapeHtml(it.title)}`,
      title: escapeHtml(it.title),
      dot: colorOf(it),
    }));

    const minis = entries.slice(0, 2).map((e, i) => `
      <span class="${e.cls}${i === 0 ? ' first' : ''}" ${e.style ? `style="${e.style}"` : ''} title="${e.title}">${e.text}</span>
    `).join('');
    const more = entries.length > 2 ? `<span class="mini more">+${entries.length - 2}</span>` : '';
    const dots = entries.length
      ? `<div class="cell-dots">${entries.slice(0, 4).map((e) => `<i style="width:6px;height:6px;border-radius:50%;background:${e.dot};display:inline-block"></i>`).join('')}</div>`
      : '';

    const label = dayLabel(key);
    const lunarHtml = label ? `<span class="lunar ${label.cls}">${label.text}</span>` : '';

    html += `
      <div class="${cls.join(' ')}" data-date="${key}">
        <div class="daynum">
          <span>${cur.getDate()}</span>
          <span class="daynum-right">${lunarHtml}${key === today ? '<span class="today-badge">今天</span>' : ''}</span>
        </div>
        ${minis}${more}${dots}
      </div>
    `;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('[data-date]').forEach((cell) => {
    cell.addEventListener('click', () => {
      const key = cell.dataset.date;
      state.selected = key;
      const d = parseKey(key);
      if (d.getMonth() !== state.cursor.getMonth() || d.getFullYear() !== state.cursor.getFullYear()) {
        state.cursor = startOfMonth(d);
      }
      renderAll();
    });
    cell.addEventListener('dblclick', () => openModal(null, cell.dataset.date));
  });
}

function renderList() {
  const today = todayKey();
  const items = visibleItems().map((it) => ({ it, next: nextOccurrence(it, today) || it.date }))
    .sort((a, b) => {
      if (a.it.done !== b.it.done) return a.it.done ? 1 : -1;
      return a.next.localeCompare(b.next);
    });

  document.getElementById('list-summary').textContent = `共 ${items.length} 条提醒，按最近发生时间排序`;
  const box = document.getElementById('list-container');
  if (!items.length) {
    box.innerHTML = `<div class="empty">还没有提醒，点击右上角「新建提醒」开始吧</div>`;
    return;
  }
  box.innerHTML = `<div class="day-list">${items.map(({ it, next }) => itemCardHtml(it, next)).join('')}</div>`;
  bindItemActions(box);
}

function itemCardHtml(it, next) {
  const days = diffDays(todayKey(), next);
  const m = metaOf(it);
  let tagCls = 'tag';
  if (days === 0) tagCls += ' today';
  else if (days > 0 && days <= 7 && !it.done) tagCls += ' soon';
  const age = it.type === 'birthday' ? ageText(it, next) : '';
  const linfo = it.lunar ? lunarOf(next) : null;
  const lunarTxt = linfo ? `（农历 ${linfo.monthName}${linfo.dayName}${linfo.festival ? ` · ${linfo.festival}` : ''}）` : '';
  return `
    <div class="item-card" data-id="${it.id}">
      <div class="item-bar" style="background:${colorOf(it)}"></div>
      <div class="item-main">
        <div class="item-title ${it.done ? 'done' : ''}">
          <span>${escapeHtml(it.title)}</span>
          <span class="tag">${m.icon} ${m.label}</span>
          ${it.lunar ? '<span class="tag lunar-tag">农历</span>' : ''}
          ${it.done ? '<span class="tag">已完成</span>' : `<span class="${tagCls}">${countdownText(days)}</span>`}
        </div>
        <div class="item-meta">
          <span>🗓 ${next}${it.time ? ` ${it.time}` : ''}${age}${lunarTxt}</span>
          ${it.repeat !== 'none' ? `<span>🔁 ${REPEAT_LABEL[it.repeat]}</span>` : ''}
          ${it.leadDays ? `<span>⏰ 提前 ${it.leadDays} 天</span>` : ''}
        </div>
        ${it.note ? `<div class="item-note">${escapeHtml(it.note)}</div>` : ''}
      </div>
      <div class="item-actions">
        <button class="mini-btn" data-act="notify" data-id="${it.id}" title="推送到已启用的机器人">通知</button>
        <button class="mini-btn" data-act="toggle" data-id="${it.id}">${it.done ? '撤销' : '完成'}</button>
        <button class="mini-btn" data-act="edit" data-id="${it.id}">编辑</button>
        <button class="mini-btn danger" data-act="del" data-id="${it.id}">删除</button>
      </div>
    </div>
  `;
}

function ageText(it, nextKey) {
  const birth = parseKey(it.date);
  const nextDate = parseKey(nextKey);
  const age = nextDate.getFullYear() - birth.getFullYear();
  return age >= 0 && age < 130 ? ` · 满 ${age} 岁` : '';
}

function bindItemActions(root) {
  root.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      const item = state.items.find((x) => x.id === id);
      if (act === 'edit') return openModal(item);
      if (act === 'del') return removeItem(item);
      if (act === 'toggle') {
        try {
          await api(`/api/reminders/${id}/toggle`, { method: 'POST' });
          await load();
          toast('已更新状态');
        } catch (err) {
          toast(err.message);
        }
        return undefined;
      }
      if (act === 'notify') {
        try {
          const r = await api('/api/notify/send', { method: 'POST', body: JSON.stringify({ id }) });
          const ok = r.results.some((x) => x.ok);
          toast(ok ? '已推送通知' : `推送失败：${r.results.map((x) => x.msg).join('；')}`);
        } catch (err) {
          toast(err.message);
        }
      }
    });
  });
}

/** 法定节假日提示卡片（右侧面板与即将到来列表用） */
function holidayCardHtml(key, hol) {
  const color = hol.work ? '#98a2b6' : '#d8342f';
  const title = hol.work ? `🔧 ${hol.name} · 调休上班` : `🎉 ${hol.name}`;
  const tag = hol.work ? '<span class="tag work-tag">补班</span>' : '<span class="tag holiday-tag">放假</span>';
  return `
    <div class="item-card holiday-card">
      <div class="item-bar" style="background:${color}"></div>
      <div class="item-main">
        <div class="item-title">
          <span>${escapeHtml(title)}</span>
          ${tag}
        </div>
        <div class="item-meta"><span>法定节假日 · ${key}</span></div>
      </div>
    </div>
  `;
}

function renderSide() {
  const key = state.selected;
  const d = parseKey(key);
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  const list = visibleItems().filter((it) => occursOn(it, key));
  document.getElementById('side-title').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${week}`;
  const diff = diffDays(todayKey(), key);
  const linfo = state.settings.showLunar ? lunarOf(key) : null;
  const hol = state.settings.showHoliday !== false ? holidayOf(key) : null;
  const holTxt = hol ? ` · ${hol.name}${hol.work ? '（调休上班）' : '（放假）'}` : '';
  document.getElementById('side-subtitle').textContent =
    `${list.length} 条提醒 · ${diff === 0 ? '就是今天' : diff > 0 ? `还有 ${diff} 天` : `已过 ${-diff} 天`}`
    + (linfo ? ` · 农历 ${linfo.monthName}${linfo.dayName}${linfo.festival ? `（${linfo.festival}）` : ''}` : '')
    + holTxt;

  const box = document.getElementById('day-list');
  const holCard = hol ? holidayCardHtml(key, hol) : '';
  if (!list.length && !holCard) {
    box.innerHTML = `<div class="empty">这天还没有安排</div>`;
    return;
  }
  box.innerHTML = holCard + list.map((it) => itemCardHtml(it, key)).join('');
  bindItemActions(box);
}

function renderUpcoming() {
  const today = todayKey();
  const rows = visibleItems()
    .filter((it) => !it.done)
    .map((it) => ({ it, next: nextOccurrence(it, today) }))
    .filter((x) => x.next && diffDays(today, x.next) <= 60)
    .map(({ it, next }) => ({ next, sortKey: next, kind: 'item', it }));

  // 未来 60 天内的法定节假日：同一假期合并为一条，调休单独列出
  if (state.settings.showHoliday !== false) {
    const groups = new Map();
    for (let i = 0; i <= 60; i += 1) {
      const key = addDaysKey(today, i);
      const hol = holidayOf(key);
      if (!hol) continue;
      if (hol.work) {
        rows.push({ next: key, sortKey: key, kind: 'holiday', hol, span: 0 });
        continue;
      }
      const gk = `${hol.target}|${hol.name}`;
      if (!groups.has(gk)) groups.set(gk, { next: key, hol, span: 0 });
      groups.get(gk).span += 1;
    }
    groups.forEach((g) => rows.push({ next: g.next, sortKey: g.next, kind: 'holiday', hol: g.hol, span: g.span }));
  }

  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const top = rows.slice(0, 10);

  const box = document.getElementById('upcoming-list');
  if (!top.length) {
    box.innerHTML = `<div class="empty">未来 60 天暂无提醒</div>`;
    return;
  }
  box.innerHTML = top.map((row) => {
    const days = diffDays(today, row.next);
    const when = `<span class="upcoming-when">${countdownText(days)}</span>`;
    const date = `<span class="muted" style="font-size:12px">${row.next.slice(5)}</span>`;
    if (row.kind === 'holiday') {
      const isWork = row.hol.work;
      const span = row.span > 1 ? ` · 连休 ${row.span} 天` : '';
      return `
        <div class="upcoming-row ${isWork ? 'holiday-work' : 'holiday-rest'}">
          ${when}
          <span class="upcoming-title" title="${escapeHtml(row.hol.name)}${isWork ? '（调休上班）' : `（${row.next} 起${span ? `连休 ${row.span} 天` : '放假'}）`}">
            ${isWork ? '🔧' : '🎉'} ${escapeHtml(row.hol.name)}${isWork ? '·调休' : span}
          </span>
          ${date}
        </div>
      `;
    }
    return `
      <div class="upcoming-row">
        ${when}
        <span class="upcoming-title" title="${escapeHtml(row.it.title)}">${metaOf(row.it).icon} ${escapeHtml(row.it.title)}</span>
        ${date}
      </div>
    `;
  }).join('');
}

function setHidden(id, hidden) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', hidden);
}

function switchView(view) {
  state.view = view;
  const sw = document.getElementById('view-switch');
  if (sw) sw.querySelectorAll('.switch-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  renderAll();
}

function renderAll() {
  renderStats();
  setHidden('month-view', state.view !== 'month');
  setHidden('list-view', state.view !== 'list');

  if (state.view === 'month') {
    renderFilters();
    renderCalendar();
  } else if (state.view === 'list') {
    renderFilters();
    renderList();
  }

  renderSide();
  renderUpcoming();
}

/* ------------------------------ 弹窗表单 ------------------------------ */

function renderTypePicker() {
  document.getElementById('f-type').innerHTML = Object.keys(TYPE_META).map((k) => `
    <button type="button" class="type-opt ${state.formType === k ? 'active' : ''}" data-type="${k}">
      ${TYPE_META[k].icon} ${TYPE_META[k].label}
    </button>
  `).join('');
  document.getElementById('f-type').querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.formType = btn.dataset.type;
      if (state.formType === 'birthday') {
        document.getElementById('f-repeat').value = 'yearly';
        document.getElementById('f-lead').value = '3';
      }
      renderTypePicker();
    });
  });
}

function renderColorPicker() {
  document.getElementById('f-color').innerHTML = COLOR_LIST.map((c) => `
    <button type="button" class="color-opt ${state.formColor === c ? 'active' : ''}" data-color="${c}" style="background:${COLOR_CSS[c]}" title="${c}"></button>
  `).join('');
  document.getElementById('f-color').querySelectorAll('[data-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.formColor = btn.dataset.color;
      renderColorPicker();
    });
  });
}

function openModal(item, presetDate) {
  state.editingId = item ? item.id : null;
  document.getElementById('modal-title').textContent = item ? '编辑提醒' : '新建提醒';
  document.getElementById('f-id').value = item ? item.id : '';
  document.getElementById('f-title').value = item ? item.title : '';
  document.getElementById('f-date').value = item ? item.date : (presetDate || state.selected || todayKey());
  document.getElementById('f-time').value = item ? item.time || '' : '';
  document.getElementById('f-note').value = item ? item.note || '' : '';
  document.getElementById('f-repeat').value = item ? item.repeat || 'none' : 'none';
  document.getElementById('f-lead').value = String(item ? item.leadDays || 0 : (state.formType === 'birthday' ? 3 : 0));
  state.formType = item ? item.type : 'event';
  state.formColor = item ? item.color || TYPE_META[item.type].color : TYPE_META[state.formType].color;
  setChecked('f-lunar', !!(item && item.lunar));
  const nowYear = new Date().getFullYear();
  if (item && item.lunar) {
    const y = Number(String(item.date).slice(0, 4)) || nowYear;
    setLunarSelection(y, item.lunarMonth, item.lunarDay);
  } else {
    const info = lunarOf(document.getElementById('f-date').value);
    setLunarSelection(nowYear, info ? info.month : 1, info ? info.day : 1);
  }
  updateLunarHint();
  renderTypePicker();
  renderColorPicker();
  document.getElementById('btn-delete').classList.toggle('hidden', !item);
  document.getElementById('form-error').classList.add('hidden');
  document.getElementById('modal-mask').classList.remove('hidden');
  setTimeout(() => document.getElementById('f-title').focus(), 50);
}

function closeModal() {
  document.getElementById('modal-mask').classList.add('hidden');
  state.editingId = null;
}

/** 按年月日回填农历下拉（月份、日列表需按序刷新） */
function setLunarSelection(year, month, day) {
  renderLunarPicker();
  setVal('f-lunar-year', year);
  renderLunarPicker();
  setVal('f-lunar-month', month);
  renderLunarPicker();
  setVal('f-lunar-day', day);
  renderLunarPicker();
}

/** 表单里显示所选日期对应的农历，并在农历模式下直接选农历日期 */
function updateLunarHint() {
  const box = document.getElementById('f-lunar-hint');
  const dateInput = document.getElementById('f-date');
  if (!box) return;
  const isLunar = isChecked('f-lunar');
  setHidden('f-lunar-picker', !isLunar);
  setHidden('f-date-field', isLunar);
  if (dateInput) dateInput.required = !isLunar;
  if (!hasLunarLib) {
    box.textContent = '';
    return;
  }
  if (isLunar) {
    const solar = lunarSelectionSolar();
    const info = solar ? lunarOf(solar) : null;
    if (!solar) {
      box.textContent = '该农历日期在所选年份不存在，请重新选择';
      return;
    }
    const extra = info && info.festival ? `（${info.festival}）` : '';
    box.textContent = `对应公历 ${solar}${extra}，每年按农历自动换算`;
    return;
  }
  const info = lunarOf(val('f-date'));
  if (!info) {
    box.textContent = '';
    return;
  }
  const extra = [info.festival, info.jieQi].filter(Boolean).join(' · ');
  box.textContent = `农历 ${info.monthName}${info.dayName}${extra ? `（${extra}）` : ''}`;
}

async function submitForm(e) {
  e.preventDefault();
  const useLunar = isChecked('f-lunar');
  let dateValue = document.getElementById('f-date').value;
  if (useLunar) {
    dateValue = lunarSelectionSolar() || '';
    if (!dateValue) return showFormError('该农历日期在所选年份不存在，请重新选择');
  }
  const payload = {
    title: document.getElementById('f-title').value.trim(),
    type: state.formType,
    date: dateValue,
    time: document.getElementById('f-time').value,
    repeat: document.getElementById('f-repeat').value,
    leadDays: Number(document.getElementById('f-lead').value),
    note: document.getElementById('f-note').value,
    color: state.formColor,
    lunar: useLunar,
  };
  if (!payload.title) return showFormError('请填写标题');
  if (!payload.date) return showFormError('请选择日期');

  try {
    const id = document.getElementById('f-id').value;
    if (id) await api(`/api/reminders/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/api/reminders', { method: 'POST', body: JSON.stringify(payload) });
    closeModal();
    await load();
    toast(id ? '已保存修改' : '提醒已创建');
  } catch (err) {
    showFormError(err.message);
  }
  return undefined;
}

function showFormError(msg) {
  const box = document.getElementById('form-error');
  box.textContent = msg;
  box.classList.remove('hidden');
}

/** 删除提醒，返回是否删除成功（用户取消则返回 false） */
async function removeItem(item) {
  if (!item) return false;
  if (!confirm(`确定删除「${item.title}」吗？`)) return false;
  try {
    await api(`/api/reminders/${item.id}`, { method: 'DELETE' });
    await load();
    toast('已删除');
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
}

/* ------------------------------ 启动 ------------------------------ */

async function loadSettings() {
  try {
    const s = await api('/api/settings');
    state.settings = {
      weekStart: s.weekStart === 'sunday' ? 'sunday' : 'monday',
      showLunar: s.showLunar !== false,
      showHoliday: s.showHoliday !== false,
      dailyNotifyTime: /^\d{2}:\d{2}$/.test(s.dailyNotifyTime || '') ? s.dailyNotifyTime : '09:00',
      notify: mergeNotify(s.notify),
    };
    saveLocalSettings(state.settings);
  } catch (err) {
    /* 服务端不可用时沿用本地设置 */
  }
}

async function load() {
  try {
    state.items = await api('/api/reminders');
  } catch (err) {
    if (err.auth) return; // 已跳转登录界面，不再提示
    toast(`加载失败：${err.message}`);
    state.items = [];
  }
  await loadSettings();
  renderAll();
}

/* ------------------------------ 登录 / 鉴权 ------------------------------ */

function showLogin() {
  document.getElementById('login-user').value = state.user || '';
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('login-mask').classList.remove('hidden');
  setTimeout(() => document.getElementById('login-pass').focus(), 50);
}

function hideLogin() {
  document.getElementById('login-mask').classList.add('hidden');
}

function clearAuth() {
  state.token = '';
  state.user = '';
  localStorage.removeItem('reminder.token');
  localStorage.removeItem('reminder.user');
}

function setUserName(name) {
  const el = document.getElementById('user-name');
  if (el) el.textContent = name ? `👤 ${name}` : '';
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function doLogin(e) {
  e.preventDefault();
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '登录失败');
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('reminder.token', data.token);
    localStorage.setItem('reminder.user', data.user);
    document.getElementById('login-pass').value = '';
    hideLogin();
    setUserName(data.user);
    await load();
  } catch (err) {
    showLoginError(err.message);
  }
}

function logout() {
  if (!confirm('确定退出登录吗？')) return;
  fetch('/api/logout', {
    method: 'POST',
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
  }).catch(() => {});
  clearAuth();
  setUserName('');
  showLogin();
}

function showPassError(msg) {
  const el = document.getElementById('pass-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function changePassword() {
  const oldPass = document.getElementById('s-old-pass').value;
  const newPass = document.getElementById('s-new-pass').value;
  const newPass2 = document.getElementById('s-new-pass2').value;
  document.getElementById('pass-error').classList.add('hidden');
  if (!newPass) return showPassError('请输入新密码');
  if (newPass !== newPass2) return showPassError('两次输入的新密码不一致');
  try {
    const r = await fetch('/api/auth/change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ oldPass, newPass }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || '修改失败');
    alert('密码已修改，请重新登录');
    logout();
  } catch (err) {
    showPassError(err.message);
  }
}

/* ------------------------------ 设置弹窗 ------------------------------ */

function renderWeekStartPicker() {
  document.getElementById('s-weekstart').innerHTML = WEEK_START_OPTIONS.map((o) => `
    <button type="button" class="type-opt ${state.tmpWeekStart === o.key ? 'active' : ''}" data-weekstart="${o.key}">
      ${o.label}
    </button>
  `).join('');
  document.getElementById('s-weekstart').querySelectorAll('[data-weekstart]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tmpWeekStart = btn.dataset.weekstart;
      renderWeekStartPicker();
    });
  });
}

const val = (id) => {
  const el = document.getElementById(id);
  return el ? el.value : '';
};
const setVal = (id, v) => {
  const el = document.getElementById(id);
  if (el) el.value = v == null ? '' : v;
};
const isChecked = (id) => {
  const el = document.getElementById(id);
  return !!(el && el.checked);
};
const setChecked = (id, v) => {
  const el = document.getElementById(id);
  if (el) el.checked = !!v;
};

function fillNotifyForm() {
  const n = state.settings.notify;
  setVal('s-daily-time', state.settings.dailyNotifyTime || '09:00');
  setVal('s-webhook-token', n.webhookToken || '');

  setChecked('n-wecomBot-enabled', n.wecomBot.enabled);
  setVal('n-wecomBot-webhook', n.wecomBot.webhook);

  setChecked('n-wecomApp-enabled', n.wecomApp.enabled);
  setVal('n-wecomApp-corpid', n.wecomApp.corpid);
  setVal('n-wecomApp-corpsecret', n.wecomApp.corpsecret);
  setVal('n-wecomApp-agentid', n.wecomApp.agentid);
  setVal('n-wecomApp-touser', n.wecomApp.touser);

  setChecked('n-qq-enabled', n.qq.enabled);
  setVal('n-qq-baseUrl', n.qq.baseUrl);
  setVal('n-qq-token', n.qq.token);
  setVal('n-qq-targetType', n.qq.targetType === 'private' ? 'private' : 'group');
  setVal('n-qq-targetId', n.qq.targetId);

  setChecked('n-wechat-enabled', n.wechat.enabled);
  setVal('n-wechat-provider', n.wechat.provider === 'pushplus' ? 'pushplus' : 'serverchan');
  setVal('n-wechat-sendKey', n.wechat.sendKey);
  setVal('n-wechat-token', n.wechat.token);

  setChecked('n-webhook-enabled', n.webhook.enabled);
  setVal('n-webhook-url', n.webhook.url);
  setVal('n-webhook-token', n.webhook.token);
}

function collectNotify() {
  return {
    webhookToken: val('s-webhook-token'),
    wecomBot: { enabled: isChecked('n-wecomBot-enabled'), webhook: val('n-wecomBot-webhook') },
    wecomApp: {
      enabled: isChecked('n-wecomApp-enabled'),
      corpid: val('n-wecomApp-corpid'),
      corpsecret: val('n-wecomApp-corpsecret'),
      agentid: val('n-wecomApp-agentid'),
      touser: val('n-wecomApp-touser') || '@all',
    },
    qq: {
      enabled: isChecked('n-qq-enabled'),
      baseUrl: val('n-qq-baseUrl'),
      token: val('n-qq-token'),
      targetType: val('n-qq-targetType') === 'private' ? 'private' : 'group',
      targetId: val('n-qq-targetId'),
    },
    wechat: {
      enabled: isChecked('n-wechat-enabled'),
      provider: val('n-wechat-provider') === 'pushplus' ? 'pushplus' : 'serverchan',
      sendKey: val('n-wechat-sendKey'),
      token: val('n-wechat-token'),
    },
    webhook: {
      enabled: isChecked('n-webhook-enabled'),
      url: val('n-webhook-url'),
      token: val('n-webhook-token'),
    },
  };
}

function collectSettings() {
  return {
    weekStart: state.tmpWeekStart === 'sunday' ? 'sunday' : 'monday',
    showLunar: state.settings.showLunar,
    showHoliday: state.settings.showHoliday,
    dailyNotifyTime: /^\d{2}:\d{2}$/.test(val('s-daily-time')) ? val('s-daily-time') : '09:00',
    notify: collectNotify(),
  };
}

async function loadNotifyLogs() {
  const box = document.getElementById('notify-logs');
  if (!box) return;
  try {
    const logs = await api('/api/notify/logs?limit=8');
    if (!logs.length) {
      box.innerHTML = `<div class="empty">暂无推送记录</div>`;
      return;
    }
    box.innerHTML = logs.map((l) => {
      const okCount = l.results.filter((r) => r.ok).length;
      const time = String(l.time || '').slice(5, 16).replace('T', ' ');
      return `
        <div class="log-row">
          <span class="muted">${escapeHtml(time)}</span>
          <span class="log-title">${escapeHtml(l.title)}</span>
          <span class="log-stat ${okCount ? 'ok' : 'bad'}">${okCount}/${l.results.length}</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    box.innerHTML = `<div class="empty">记录加载失败</div>`;
  }
}

function renderNotifyView() {
  fillNotifyForm();
  loadNotifyLogs();
}

async function testNotify() {
  const box = document.getElementById('notify-test-result');
  if (!box) return;
  box.textContent = '发送中…';
  try {
    const saved = await api('/api/settings', { method: 'PUT', body: JSON.stringify(collectSettings()) });
    applySettings(saved);
    const r = await api('/api/notify/test', { method: 'POST', body: JSON.stringify({ channel: 'all' }) });
    box.innerHTML = r.results
      .map((x) => `<span class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✅' : '❌'} ${escapeHtml(x.label)}${x.ok ? '' : `：${escapeHtml(x.msg)}`}</span>`)
      .join(' ');
    loadNotifyLogs();
  } catch (err) {
    box.textContent = `失败：${err.message}`;
  }
}

function applySettings(saved) {
  state.settings = {
    weekStart: saved.weekStart === 'sunday' ? 'sunday' : 'monday',
    showLunar: saved.showLunar !== false,
    showHoliday: saved.showHoliday !== false,
    dailyNotifyTime: /^\d{2}:\d{2}$/.test(saved.dailyNotifyTime || '') ? saved.dailyNotifyTime : '09:00',
    notify: mergeNotify(saved.notify),
  };
  state.tmpWeekStart = state.settings.weekStart;
  saveLocalSettings(state.settings);
}

function openSettings(panel) {
  state.tmpWeekStart = state.settings.weekStart;
  setChecked('s-showlunar', state.settings.showLunar);
  setChecked('s-showholiday', state.settings.showHoliday);
  renderWeekStartPicker();
  setVal('s-old-pass', '');
  setVal('s-new-pass', '');
  setVal('s-new-pass2', '');
  document.getElementById('pass-error').classList.add('hidden');
  document.getElementById('settings-screen').classList.remove('hidden');
  switchSettingsPanel(panel || 'general');
}

function closeSettings() {
  document.getElementById('settings-screen').classList.add('hidden');
}

/** 设置界面左侧功能切换：高亮导航项并显示对应面板 */
function switchSettingsPanel(panel) {
  document.querySelectorAll('.settings-nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.panel === panel);
  });
  document.querySelectorAll('#settings-screen .settings-panel').forEach((p) => {
    p.classList.toggle('hidden', p.dataset.panel !== panel);
  });
  if (panel === 'notify') renderNotifyView();
}

async function saveSettings() {
  try {
    const saved = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        weekStart: state.tmpWeekStart === 'sunday' ? 'sunday' : 'monday',
        showLunar: isChecked('s-showlunar'),
        showHoliday: isChecked('s-showholiday'),
      }),
    });
    applySettings(saved);
    closeSettings();
    renderAll();
    toast('设置已保存');
  } catch (err) {
    toast(`保存失败：${err.message}`);
  }
}

async function saveNotifySettings() {
  try {
    const saved = await api('/api/settings', { method: 'PUT', body: JSON.stringify(collectSettings()) });
    applySettings(saved);
    toast('机器人设置已保存');
  } catch (err) {
    toast(`保存失败：${err.message}`);
  }
}

function bindEvents() {
  document.getElementById('prev-month').addEventListener('click', () => {
    state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1);
    renderAll();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1);
    renderAll();
  });
  document.getElementById('btn-today').addEventListener('click', () => {
    state.cursor = startOfMonth(new Date());
    state.selected = todayKey();
    renderAll();
  });
  document.getElementById('btn-new').addEventListener('click', () => openModal(null, state.selected));
  document.getElementById('btn-settings').addEventListener('click', () => openSettings('general'));
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-cancel').addEventListener('click', closeSettings);
  document.getElementById('settings-save').addEventListener('click', saveSettings);
  document.querySelectorAll('.settings-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchSettingsPanel(btn.dataset.panel));
  });
  document.getElementById('notify-save').addEventListener('click', saveNotifySettings);
  document.getElementById('notify-test').addEventListener('click', testNotify);
  document.getElementById('btn-new-day').addEventListener('click', () => openModal(null, state.selected));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-delete').addEventListener('click', async () => {
    const item = state.items.find((x) => x.id === state.editingId);
    const ok = await removeItem(item);
    if (ok) closeModal();
  });
  document.getElementById('reminder-form').addEventListener('submit', submitForm);
  document.getElementById('f-date').addEventListener('change', updateLunarHint);
  document.getElementById('f-lunar').addEventListener('change', () => {
    const repeat = document.getElementById('f-repeat');
    if (isChecked('f-lunar') && repeat.value === 'none') repeat.value = 'yearly';
    updateLunarHint();
  });
  ['f-lunar-year', 'f-lunar-month', 'f-lunar-day'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      renderLunarPicker();
      updateLunarHint();
    });
  });
  document.getElementById('modal-mask').addEventListener('click', (e) => {
    if (e.target.id === 'modal-mask') closeModal();
  });
  document.getElementById('view-switch').querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('login-form').addEventListener('submit', doLogin);
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-change-pass').addEventListener('click', changePassword);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeModal();
    closeSettings();
  });
}

bindEvents();
renderTypePicker();
renderColorPicker();
renderLunarPicker();
renderWeekStartPicker();
renderWeekdays();

// 启动：已有会话则尝试验证并加载，否则显示登录界面
if (state.token) {
  setUserName(state.user);
  load(); // 若会话失效会触发 401 并自动跳转登录
} else {
  showLogin();
}
