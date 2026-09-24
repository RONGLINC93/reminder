/* 服务端日期工具（与前端逻辑保持一致） */

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

function occursOn(item, key) {
  if (!item || !item.date) return false;
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
  if (!item || !item.date) return null;
  if (item.repeat === 'none') return item.date;
  for (let i = 0; i <= 800; i += 1) {
    const key = addDaysKey(fromKey, i);
    if (diffDays(item.date, key) >= 0 && occursOn(item, key)) return key;
    // 起始日期已过期时，仍按重复规则向后推算
    if (diffDays(item.date, key) < 0 && occursOnIgnoreStart(item, key)) return key;
  }
  return null;
}

function occursOnIgnoreStart(item, key) {
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

module.exports = { keyOf, parseKey, addDaysKey, diffDays, daysInMonth, occursOn, nextOccurrence };
