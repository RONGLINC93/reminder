/* 农历（阴历）转换封装，基于 lunar-javascript */

const { Solar, Lunar } = require('lunar-javascript');

/** 公历日期 -> 农历信息 */
function lunarInfoOf(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
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
}

/** 农历 -> 公历日期（YYYY-MM-DD），该年不存在此月日时返回 null */
function lunarToSolarKey(year, month, day) {
  try {
    return Lunar.fromYmd(year, month, day).getSolar().toYmd();
  } catch (err) {
    return null;
  }
}

/** 指定农历月日在 [fromYear, toYear] 每一年对应的公历日期 */
function lunarOccurrences(month, day, fromYear, toYear) {
  const out = [];
  if (!Number.isFinite(month) || !Number.isFinite(day)) return out;
  for (let y = fromYear; y <= toYear; y += 1) {
    const key = lunarToSolarKey(y, month, day);
    if (key) out.push(key);
  }
  return out;
}

/** 农历提醒的农历年月日（老数据用 date 反推） */
function lunarPartsOf(item) {
  if (Number.isFinite(item.lunarMonth) && Number.isFinite(item.lunarDay)) {
    return { month: item.lunarMonth, day: item.lunarDay };
  }
  if (item.date) {
    const info = lunarInfoOf(item.date);
    return { month: info.month, day: info.day };
  }
  return { month: NaN, day: NaN };
}

/** 农历提醒下一次发生的公历日期 */
function nextLunarDate(item, todayKey) {
  const { month, day } = lunarPartsOf(item);
  const startYear = Number(String(item.date || todayKey).slice(0, 4));
  const nowYear = Number(String(todayKey).slice(0, 4));
  const from = Math.min(startYear, nowYear);
  const keys = lunarOccurrences(month, day, from, nowYear + 3);
  return keys.find((k) => k >= todayKey) || null;
}

module.exports = { lunarInfoOf, lunarToSolarKey, lunarOccurrences, lunarPartsOf, nextLunarDate };
