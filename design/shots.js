const { chromium, devices } = require('playwright');
const fs = require('fs'); const OUT = process.argv[2] || 'design/shots'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(), base = 'http://127.0.0.1:8767/drafts/v2a/';
  for (const theme of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('yw-theme', t); localStorage.setItem('yw-lab', '{"backend":"cpu"}'); } catch (e) {} }, theme);
    const p = await ctx.newPage();
    await p.goto(base); await p.waitForTimeout(1800);
    const h = await p.locator('#hero').boundingBox();
    await p.mouse.click(h.x + h.width * 0.35, h.y + h.height * 0.4); await p.waitForTimeout(1600);
    await p.screenshot({ path: `${OUT}/home-${theme}.png` });
    await p.click('#lab [data-tool="array"]'); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/home-${theme}-panel.png` });
    for (const ch of ['play', 'arrays', 'tr', 'tomo', 'noise', 'elastic']) {
      await p.goto(base + 'lab/#' + ch); await p.waitForTimeout(1200);
      const v = await p.locator('#view').boundingBox();
      if (ch !== 'noise') await p.mouse.click(v.x + v.width * 0.5, v.y + v.height * 0.5);
      await p.waitForTimeout(ch === 'noise' ? 6000 : 2500);
      await p.screenshot({ path: `${OUT}/lab-${ch}-${theme}.png` });
    }
    await ctx.close();
  }
  const m = await b.newContext(devices['iPhone 13']);
  await m.addInitScript(() => { try { localStorage.setItem('yw-theme', 'dark'); } catch (e) {} });
  const q = await m.newPage(); await q.goto(base); await q.waitForTimeout(1800);
  await q.screenshot({ path: `${OUT}/home-phone.png` });
  await q.goto(base + 'lab/#play'); await q.waitForTimeout(1500);
  await q.screenshot({ path: `${OUT}/lab-phone.png`, fullPage: true });
  await b.close();
})();
