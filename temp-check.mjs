import { createRequire } from 'module';
const require = createRequire('C:/Users/CRL/AppData/Roaming/npm/node_modules/@playwright/cli/');
const { chromium } = require('playwright-core');

const browser = await chromium.launch({ channel: 'msedge' });

const check = async (w, h, label, action) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto('http://localhost:9530', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  if (action) { await action(page); await page.waitForTimeout(600); }
  const res = await page.evaluate(() => {
    const out = { winW: window.innerWidth, docScrollW: document.documentElement.scrollWidth, bad: [], scrollables: [] };
    const inScroller = (el) => {
      let p = el.parentElement;
      while (p) {
        const st = getComputedStyle(p);
        if ((st.overflowX === 'auto' || st.overflowX === 'scroll' || st.overflowX === 'hidden')) return true;
        p = p.parentElement;
      }
      return false;
    };
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !inScroller(el)) {
        out.bad.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 34), right: Math.round(r.right), txt: (el.textContent || '').trim().slice(0, 14) });
      }
    });
    document.querySelectorAll('.filters, .notify-view, .side-panel').forEach((el) => {
      out.scrollables.push({
        cls: String(el.className || '').slice(0, 20),
        clientW: el.clientWidth, scrollW: el.scrollWidth,
        overflowX: getComputedStyle(el).overflowX,
      });
    });
    return out;
  });
  console.log(`[${label} ${w}x${h}] docScrollW=${res.docScrollW} winW=${res.winW} | 溢出元素=${res.bad.length}`);
  if (res.bad.length) console.log('   ', JSON.stringify(res.bad.slice(0, 6)));
  console.log('    容器:', JSON.stringify(res.scrollables));
  await page.close();
};

await check(402, 820, '手机-日历');
await check(402, 820, '手机-通知', async (p) => p.click('[data-main="notify"]'));
await check(768, 900, '平板-日历');
await check(1440, 900, '桌面-日历');
await browser.close();
