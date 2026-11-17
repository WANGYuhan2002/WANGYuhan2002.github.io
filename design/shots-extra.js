const { chromium, devices } = require('playwright');
const fs = require('fs'); const OUT = process.argv[2] || 'design/shots'; fs.mkdirSync(OUT, { recursive: true });
const errs = [];
const watch = (p, tag) => { p.on('console', m => { if (m.type() === 'error') errs.push(`[${tag}] console: ${m.text()}`); }); p.on('pageerror', e => errs.push(`[${tag}] pageerror: ${e.message}`)); };
const fails = [];
const tryit = async (name, fn) => { try { await fn(); } catch (e) { fails.push(`${name}: ${e.message.split('\n')[0]}`); } };
(async () => {
  const b = await chromium.launch(), base = 'http://127.0.0.1:8767/drafts/v2a/';
  for (const theme of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('yw-theme', t); localStorage.setItem('yw-lab', '{"backend":"cpu"}'); } catch (e) {} }, theme);
    const p = await ctx.newPage(); watch(p, theme);
    await p.goto(base); await p.waitForTimeout(1800);
    await tryit(`home-${theme}-scroll`, () => p.screenshot({ path: `${OUT}/home-${theme}-scroll.png`, fullPage: true }));
    const tools = await p.$$eval('#lab [data-tool]', els => els.map(e => e.dataset.tool));
    console.log('tools', theme, tools);
    for (const t of tools) {
      if (t === 'array') continue;
      await tryit(`home-${theme}-tool-${t}`, async () => {
        const sel = `#lab [data-tool="${t}"]`;
        await p.locator(sel).scrollIntoViewIfNeeded();
        await p.click(sel, { timeout: 3000 }); await p.waitForTimeout(300);
        await p.screenshot({ path: `${OUT}/home-${theme}-tool-${t}.png` });
        await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      });
    }
    for (const ch of ['play', 'arrays', 'tr', 'tomo', 'noise', 'elastic']) {
      await tryit(`lab-${ch}-${theme}-late`, async () => {
        await p.goto(base + 'lab/#' + ch); await p.waitForTimeout(1200);
        try {
          const v = await p.locator('#view').boundingBox();
          if (ch !== 'noise') await p.mouse.click(v.x + v.width * 0.5, v.y + v.height * 0.5);
          await p.waitForTimeout(300);
          const cb = p.locator('#ctaBtn');
          const ok = await cb.evaluate(e => !e.hidden && !e.disabled);
          const label = await cb.textContent();
          if (ok) { await cb.click({ timeout: 3000 }); console.log('cta', ch, theme, 'clicked:', label); }
          else console.log('cta', ch, theme, 'not clickable (hidden/disabled):', label);
        } catch (e) { fails.push(`lab-${ch}-${theme}-late click: ${e.message.split('\n')[0]}`); }
        await p.waitForTimeout(8000);
        await p.screenshot({ path: `${OUT}/lab-${ch}-${theme}-late.png` });
      });
    }
    await ctx.close();
  }
  await tryit('lab-phone-light', async () => {
    const m = await b.newContext(devices['iPhone 13']);
    await m.addInitScript(() => { try { localStorage.setItem('yw-theme', 'light'); } catch (e) {} });
    const q = await m.newPage(); watch(q, 'phone-light');
    await q.goto(base + 'lab/#arrays'); await q.waitForTimeout(1500);
    await q.screenshot({ path: `${OUT}/lab-phone-light.png`, fullPage: true });
    await m.close();
  });
  await b.close();
  console.log('FAILS', JSON.stringify(fails, null, 1));
  console.log('ERRORS', JSON.stringify([...new Set(errs)], null, 1));
})();
