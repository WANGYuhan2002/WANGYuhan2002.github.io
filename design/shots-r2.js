/* design/shots-r2.js — round-2 screenshots and text dumps of drafts/v2a (home + Wave Lab).
   Usage: node design/shots-r2.js [filter-substring ...]   (server: python3 -m http.server 8767 --bind 127.0.0.1)
   Writes design/shots-r2/*.png, design/shots-r2/text/*.txt, design/shots-r2/log.json, design/shots-r2/INDEX.md */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8767/drafts/v2a/';
const OUT = path.join(__dirname, 'shots-r2');
const TXT = path.join(OUT, 'text');
fs.mkdirSync(TXT, { recursive: true });
const FILTER = process.argv.slice(2);
const LOGF = path.join(OUT, 'log.json');
const LOG = fs.existsSync(LOGF) ? JSON.parse(fs.readFileSync(LOGF, 'utf8')) : { files: {}, errors: {}, notes: {} };
function save() { fs.writeFileSync(LOGF, JSON.stringify(LOG, null, 1)); }
function note(scn, s) { (LOG.notes[scn] = LOG.notes[scn] || []).push(s); console.log('  [' + scn + '] ' + s); save(); }
function fileNote(f, s) { LOG.files[f] = s; save(); console.log('  + ' + f + ' : ' + s); }
function err(scn, s) { (LOG.errors[scn] = LOG.errors[scn] || []); if (LOG.errors[scn].indexOf(s) < 0) LOG.errors[scn].push(s); save(); console.log('  ! [' + scn + '] ' + s); }

let browser;
async function newCtx(theme, dsf, device) {
  const opts = device ? Object.assign({}, devices[device]) : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: dsf || 1 };
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript((t) => { try { localStorage.setItem('yw-theme', t); localStorage.setItem('yw-lab', '{"backend":"cpu"}'); } catch (e) {} }, theme);
  return ctx;
}
async function newPage(ctx, scn) {
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') err(scn, 'console.error: ' + m.text()); });
  p.on('pageerror', (e) => err(scn, 'pageerror: ' + e.message));
  return p;
}
async function openLab(ctx, scn, ch) {
  const p = await newPage(ctx, scn);
  await p.goto(BASE + 'lab/#' + ch, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction((c) => window.Lab && Lab.eng && Lab.S.ch === c && Lab.CH[c], ch, { timeout: 30000 });
  await p.waitForTimeout(700);
  return p;
}
async function waitFn(p, fn, arg, ms) { return p.waitForFunction(fn, arg, { timeout: ms || 120000, polling: 'raf' }); }
/* wait for simulated seconds (robust against a slow solver); stops early if the engine was rebuilt */
async function waitSim(p, secs) {
  const n0 = await p.evaluate(() => Lab.eng.n);
  const target = await p.evaluate((s) => Lab.eng.n + Math.round(s * Lab.rate), secs);
  const t0 = Date.now();
  await waitFn(p, (a) => Lab.eng.n >= a.target || Lab.eng.n < a.n0, { target, n0 });
  return { real: (Date.now() - t0) / 1000 };
}
async function vbox(p, sel) { const b = await p.locator(sel).first().boundingBox(); if (!b) throw new Error('no box for ' + sel); return b; }
async function clickAt(p, sel, fx, fy) { const b = await vbox(p, sel); await p.mouse.click(b.x + b.width * fx, b.y + b.height * fy); }
async function clickSel(p, sel) { await p.locator(sel).first().click({ timeout: 10000 }); }
async function closeTopt(p) { const v = await p.evaluate(() => !document.getElementById('topt').hidden); if (v) await clickSel(p, '#topt [data-act="closeTopt"]'); }
async function labState(p) {
  return p.evaluate(() => ({ hud: document.getElementById('hud').innerText.replace(/\n/g, ' '), cta: (function () { var c = document.getElementById('ctaBtn'); return c.hidden ? '(hidden)' : c.textContent + (c.disabled ? ' [disabled]' : ''); })(), t: +(Lab.eng.n / Lab.rate).toFixed(2) }));
}

async function dumpText(p, name) {
  const s = await p.evaluate(() => {
    const st = document.createElement('style'); st.id = 'r2clamp';
    st.textContent = '.st-d{display:block!important;-webkit-line-clamp:unset!important;overflow:visible!important}';
    document.head.appendChild(st);
    const det = Array.from(document.querySelectorAll('#insp details')), was = det.map((d) => d.open);
    det.forEach((d) => { d.open = true; });
    const g = (id) => { const e = document.getElementById(id); return e ? e.innerText : '(missing)'; };
    const c = document.getElementById('ctaBtn');
    const out = '## #status\n' + g('status') + '\n\n## #hud\n' + g('hud') + '\n\n## #legend\n' + g('legend') + '\n\n## #dataTitle\n' + g('dataTitle') +
      '\n\n## #ctaBtn\ntext: ' + c.textContent + '\nhidden: ' + c.hidden + '\ndisabled: ' + c.disabled + '\n\n## #insp (all details open, line clamp removed)\n' + g('insp') + '\n';
    det.forEach((d, i) => { d.open = was[i]; }); st.remove();
    return out;
  });
  fs.writeFileSync(path.join(TXT, name + '.txt'), s);
  fileNote('text/' + name + '.txt', 'text dump of ' + name + ' (dark)');
}

/* ---------------- lab scenarios: run(p, cap) where cap(name) takes the captures for that combo ---------------- */
const L2X = new Set(['play-arrival', 'arrays-seis', 'arrays-das', 'tr-focus', 'tomo-done', 'noise-late', 'elastic-rayleigh']);
const DARK_ONLY = new Set(['tomo-checker', 'tomo-crosswell', 'noise-oneside', 'elastic-shear']);
const LAB = [
  { id: 'A', names: ['play-wave'], ch: 'play', run: async (p, cap) => { await clickAt(p, '#view', 0.5, 0.5); await waitSim(p, 1.3); await cap('play-wave', 'click centre, +1.3 s sim'); } },
  { id: 'B', names: ['play-arrival'], ch: 'play', run: async (p, cap) => { await clickAt(p, '#view', 0.3, 0.5); await waitSim(p, 3.0); await cap('play-arrival', 'click 30%/50%, +3.0 s sim'); } },
  { id: 'C', names: ['play-section'], ch: 'play', run: async (p, cap) => {
    await clickSel(p, '#tools [data-tool="station"]'); await p.waitForTimeout(150); await closeTopt(p);
    for (const q of [[0.2, 0.25], [0.4, 0.78], [0.55, 0.28], [0.64, 0.82], [0.92, 0.32]]) { await clickAt(p, '#view', q[0], q[1]); await p.waitForTimeout(120); }
    const n = await p.evaluate(() => Lab.CH.play.rec.n);
    await clickSel(p, '#tools [data-tool="quake"]'); await p.waitForTimeout(150); await closeTopt(p);
    await clickAt(p, '#view', 0.12, 0.5); await waitSim(p, 3.5);
    await cap('play-section', n + ' stations total (1 default + ' + (n - 1) + ' placed with [data-tool=station]); quake at 12%/50%, +3.5 s sim');
  } },
  { id: 'D', names: ['play-layers'], ch: 'play', run: async (p, cap) => {
    await clickSel(p, '#insp [data-act="preset"][data-val="layered"]'); await p.waitForTimeout(300);
    const pr = await p.evaluate(() => Lab.model.preset + ' / bc=' + Lab.bc);
    await clickAt(p, '#view', 0.5, 0.05); await waitSim(p, 2.5); await cap('play-layers', 'preset ' + pr + '; quake at 50%/5%, +2.5 s sim');
  } },
  { id: 'E', names: ['arrays-seis'], ch: 'arrays', run: async (p, cap) => { await clickAt(p, '#view', 0.5, 0.5); await waitSim(p, 3.5); await cap('arrays-seis', '16-station surface line array (default); click centre, +3.5 s sim'); } },
  { id: 'F', names: ['arrays-das'], ch: 'arrays', run: async (p, cap) => {
    await clickSel(p, '#insp [data-act="sensor"][data-val="fiber"]'); await p.waitForTimeout(200);
    await clickSel(p, '#insp [data-act="fibPre"][data-val="surface"]'); await p.waitForTimeout(200);
    await clickSel(p, '#tools [data-tool="quake"]'); await p.waitForTimeout(150); await closeTopt(p);
    const d = await p.evaluate(() => ({ das: !!Lab.CH.arrays.das, nc: Lab.CH.arrays.das && Lab.CH.arrays.das.nc, tool: Lab.S.tool }));
    await clickAt(p, '#view', 0.5, 0.5); await waitSim(p, 3.5);
    await cap('arrays-das', 'DAS fibre along the surface (' + d.nc + ' channels, tool=' + d.tool + '); click centre, +3.5 s sim');
  } },
  { id: 'GHI', names: ['tr-recorded', 'tr-playing', 'tr-focus'], ch: 'tr', run: async (p, cap) => {
    await clickAt(p, '#view', 0.42, 0.45);
    await waitFn(p, () => Lab.CH.tr.phase === 'recorded'); await p.waitForTimeout(150);
    await cap('tr-recorded', 'source at 42%/45%; recording finished (phase recorded)');
    await clickSel(p, '#ctaBtn');
    await waitFn(p, () => Lab.CH.tr.phase === 'reverse' && Lab.CH.tr.k >= Lab.CH.tr.total / 2);
    const k = await p.evaluate(() => Lab.CH.tr.k + '/' + Lab.CH.tr.total + ' (focus at ' + Lab.CH.tr.kf + ')');
    await cap('tr-playing', 'reversed playback at step ' + k);
    await waitFn(p, () => Lab.CH.tr.phase === 'done' && !!Lab.CH.tr.img); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { var i = Lab.CH.tr.img; return 'err ' + (i.err / i.lam).toFixed(2) + ' λ, FWHM x ' + (i.wx / i.lam).toFixed(2) + ' λ, z ' + (i.wy / i.lam).toFixed(2) + ' λ'; });
    await cap('tr-focus', 'playback done, focusing image shown (' + r + ')');
  } },
  { id: 'JK', names: ['tomo-survey', 'tomo-done'], ch: 'tomo', run: async (p, cap) => {
    await clickSel(p, '#ctaBtn');
    await waitFn(p, () => { var t = Lab.CH.tomo; return t.phase !== 'survey' || (t.shot === 4 && t.k >= 0.35 * t.len) || t.shot > 4; });
    const s = await p.evaluate(() => { var t = Lab.CH.tomo; return t.phase + ' shot ' + (t.shot + 1) + '/12 k=' + t.k + '/' + t.len; });
    await cap('tomo-survey', 'during the survey: ' + s, async () => p.evaluate(() => { var t = Lab.CH.tomo; return 'after capture: ' + t.phase + ' shot ' + (t.shot + 1) + ' k=' + t.k + '/' + t.len; }));
    await waitFn(p, () => Lab.CH.tomo.phase === 'done' && !Lab.CH.tomo.bending && !!Lab.CH.tomo.inv); await p.waitForTimeout(500);
    const r = await p.evaluate(() => { var i = Lab.CH.tomo.inv; return i.mode + ' rays, ' + i.n + ' picks, r = ' + i.r.toFixed(2); });
    await cap('tomo-done', 'survey + inversion complete (' + r + ')');
  } },
  { id: 'L', names: ['tomo-checker'], ch: 'tomo', run: async (p, cap) => {
    await clickSel(p, '#insp [data-act="truth"][data-val="checker"]'); await p.waitForTimeout(300); await clickSel(p, '#ctaBtn');
    await waitFn(p, () => Lab.CH.tomo.phase === 'done' && !Lab.CH.tomo.bending && !!Lab.CH.tomo.inv); await p.waitForTimeout(500);
    const r = await p.evaluate(() => { var i = Lab.CH.tomo.inv; return Lab.model.preset + ' truth, ' + i.mode + ' rays, ' + i.n + ' picks, r = ' + i.r.toFixed(2); });
    await cap('tomo-checker', 'checkerboard survey complete (' + r + ')');
  } },
  { id: 'M', names: ['tomo-crosswell'], ch: 'tomo', run: async (p, cap) => {
    await clickSel(p, '#insp [data-act="geom"][data-val="cross"]'); await p.waitForTimeout(300); await clickSel(p, '#ctaBtn');
    await waitFn(p, () => Lab.CH.tomo.phase === 'done' && !Lab.CH.tomo.bending && !!Lab.CH.tomo.inv); await p.waitForTimeout(500);
    const r = await p.evaluate(() => { var i = Lab.CH.tomo.inv; return 'geom ' + Lab.CH.tomo.st.geom + ', ' + Lab.CH.tomo.S.length + ' shots, ' + i.mode + ' rays, ' + i.n + ' picks, r = ' + i.r.toFixed(2); });
    await cap('tomo-crosswell', 'cross-well survey complete (' + r + ')');
  } },
  { id: 'NO', names: ['noise-early', 'noise-late'], ch: 'noise', run: async (p, cap) => {
    await waitFn(p, () => Lab.CH.noise.nWin >= 5); const n1 = await p.evaluate(() => Lab.CH.noise.nWin);
    await cap('noise-early', n1 + ' windows stacked');
    const t0 = Date.now();
    try { await waitFn(p, () => Lab.CH.noise.nWin >= 40, null, 120000); } catch (e) { note('noise-late', 'did not reach 40 windows within 120 s'); }
    const n2 = await p.evaluate(() => Lab.CH.noise.nWin + ' windows, SNR ' + Lab.CH.noise.snr().toFixed(1));
    await cap('noise-late', n2 + ' (waited ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s real after noise-early)');
  } },
  { id: 'P', names: ['noise-oneside'], ch: 'noise', run: async (p, cap) => {
    await clickSel(p, '#insp [data-act="nmode"][data-val="side"]');
    await waitFn(p, () => Lab.CH.noise.st.mode === 'side' && Lab.CH.noise.nWin >= 25);
    const n = await p.evaluate(() => Lab.CH.noise.nWin + ' windows, SNR ' + Lab.CH.noise.snr().toFixed(1));
    await cap('noise-oneside', 'one side only: ' + n);
  } },
  { id: 'Q', names: ['elastic-rayleigh'], ch: 'elastic', run: async (p, cap) => {
    await p.waitForTimeout(300);
    const fx = await p.evaluate(() => (Lab.CH.elastic.sta[0].x - 0.25 * Lab.nx + 0.5) / Lab.nx);
    await clickAt(p, '#view', fx, 0.03); await waitSim(p, 3.0);
    const s = await p.evaluate(() => { var r = Lab.CH.elastic.last; return 'source at cell ' + r.x + ',' + r.y + ' (snapped to depth 3), distance ' + (r.d / Lab.nx * 10).toFixed(1) + ' km'; });
    await cap('elastic-rayleigh', 'click at ' + (fx * 100).toFixed(1) + '% x / 3% y; ' + s + '; +3.0 s sim (auto shallow shot at enter also present)');
  } },
  { id: 'R', names: ['elastic-ps'], ch: 'elastic', run: async (p, cap) => {
    await p.waitForTimeout(300);
    const fx = await p.evaluate(() => (Lab.CH.elastic.sta[0].x + 0.5) / Lab.nx);
    await clickAt(p, '#view', fx, 0.75);
    await waitFn(p, () => { var r = Lab.CH.elastic.last; return r && r.y > 0.3 * Lab.ny && Lab.eng.n - r.n >= (r.ts + 0.4) * Lab.rate; });
    const s = await p.evaluate(() => { var r = Lab.CH.elastic.last; return 'tp ' + r.tp.toFixed(2) + ' s, ts ' + r.ts.toFixed(2) + ' s, captured at +' + ((Lab.eng.n - r.n) / Lab.rate).toFixed(2) + ' s'; });
    await cap('elastic-ps', 'deep source below the station (75% y); ' + s);
  } },
  { id: 'S', names: ['elastic-shear'], ch: 'elastic', run: async (p, cap) => {
    await p.waitForTimeout(300);
    await clickSel(p, '#insp [data-act="kind"][data-val="1"]'); await p.waitForTimeout(200);
    await clickAt(p, '#view', 0.5, 0.5); await waitSim(p, 1.6);
    const k = await p.evaluate(() => Lab.CH.elastic.st.kind);
    await cap('elastic-shear', 'source kind ' + k + ' (Shear); click centre, +1.6 s sim');
  } }
];

async function runLab(sc) {
  const combos = [['dark', 1], ['light', 1], ['dark', 2], ['light', 2]];
  for (const [theme, dsf] of combos) {
    const want = sc.names.filter((n) => {
      if (theme === 'light' && DARK_ONLY.has(n)) return false;
      if (dsf === 2 && theme === 'light' && !L2X.has(n)) return false;
      return true;
    });
    if (!want.length) continue;
    const scn = sc.names.join('+');
    console.log(sc.id, scn, theme, 'dsf' + dsf);
    const ctx = await newCtx(theme, dsf);
    try {
      const p = await openLab(ctx, scn, sc.ch);
      const cap = async (name, desc, after) => {
        if (want.indexOf(name) < 0) return;
        const st = await labState(p);
        const info = desc + ' | hud: ' + st.hud + ' | cta: ' + st.cta + ' | t=' + st.t + ' s';
        if (dsf === 1) {
          await p.screenshot({ path: path.join(OUT, name + '-' + theme + '.png') });
          let extra = after ? ' | ' + (await after()) : '';
          fileNote(name + '-' + theme + '.png', info + extra);
          if (theme === 'dark') await dumpText(p, name);
        } else {
          /* freeze the solver so the two element shots show the same instant (the HUD, which shows "Paused", is in neither element) */
          await p.evaluate(() => new Promise((r) => { Lab.S.paused = true; requestAnimationFrame(() => requestAnimationFrame(r)); }));
          await p.locator('section.data').screenshot({ path: path.join(OUT, name + '-' + theme + '-data@2x.png') });
          await p.locator('#view').screenshot({ path: path.join(OUT, name + '-' + theme + '-view@2x.png') });
          await p.evaluate(() => { Lab.S.paused = false; });
          let extra = after ? ' | ' + (await after()) : '';
          fileNote(name + '-' + theme + '-data@2x.png', 'data panel @2x: ' + info + extra);
          fileNote(name + '-' + theme + '-view@2x.png', 'wave view @2x: ' + info + extra);
        }
      };
      await sc.run(p, cap);
    } catch (e) { note(sc.names.join('+'), 'FAILED (' + theme + ' dsf' + dsf + '): ' + e.message.split('\n')[0]); }
    await ctx.close();
  }
}

/* ---------------- T, U: settings, shortcuts, tool options (dark) ---------------- */
async function runSettings() {
  const ctx = await newCtx('dark', 1);
  try {
    const p = await openLab(ctx, 'settings', 'play');
    await clickSel(p, '#setBtn'); await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, 'settings-dark.png') }); fileNote('settings-dark.png', 'lab #play with the settings popover (#setPop) open');
    fs.writeFileSync(path.join(TXT, 'settings.txt'), await p.evaluate(() => document.getElementById('setPop').innerText)); fileNote('text/settings.txt', '#setPop innerText');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.keyboard.press('?'); await p.waitForTimeout(450);
    await p.screenshot({ path: path.join(OUT, 'shortcuts-dark.png') });
    const t = await p.evaluate(() => { var e = document.getElementById('toast'); return (e.classList.contains('on') ? '' : '(toast not visible) ') + e.innerText; });
    fileNote('shortcuts-dark.png', '"?" has no overlay: it shows a toast (#toast) at the top of the wavefield: ' + t);
    fs.writeFileSync(path.join(TXT, 'shortcuts.txt'), 'No shortcuts overlay exists; "?" shows a 5-s toast (#toast):\n' + t + '\n\nRail footer (.rail-foot):\n' + await p.evaluate(() => document.querySelector('.rail-foot').innerText) + '\n');
    fileNote('text/shortcuts.txt', 'toast text shown by "?" plus the rail footer');
  } catch (e) { note('settings', 'FAILED: ' + e.message.split('\n')[0]); }
  await ctx.close();
}
async function runToolOptions() {
  const ctx = await newCtx('dark', 1);
  try {
    const p = await openLab(ctx, 'tool-options', 'play');
    const tools = await p.evaluate(() => Array.from(document.querySelectorAll('#tools [data-tool]')).map((b) => b.dataset.tool));
    for (const t of tools) {
      try {
        let tries = 0;
        while (tries < 2) {
          await clickSel(p, '#tools [data-tool="' + t + '"]'); await p.waitForTimeout(300); tries++;
          if (await p.evaluate(() => !document.getElementById('topt').hidden)) break;
        }
        const vis = await p.evaluate(() => !document.getElementById('topt').hidden);
        await p.mouse.move(5, 5);
        await p.screenshot({ path: path.join(OUT, 'topt-' + t + '-dark.png') });
        fileNote('topt-' + t + '-dark.png', 'tool ' + t + ', clicked ' + tries + '×, #topt ' + (vis ? 'visible' : 'NOT visible'));
        fs.writeFileSync(path.join(TXT, 'topt-' + t + '.txt'), vis ? await p.evaluate(() => document.getElementById('topt').innerText) : '(#topt not visible)');
        fileNote('text/topt-' + t + '.txt', '#topt innerText for tool ' + t);
      } catch (e) { note('tool-options', t + ' FAILED: ' + e.message.split('\n')[0]); }
    }
  } catch (e) { note('tool-options', 'FAILED: ' + e.message.split('\n')[0]); }
  await ctx.close();
}

/* ---------------- home ---------------- */
async function openHome(ctx, scn) {
  const p = await newPage(ctx, scn);
  await p.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.getElementById('hero') && document.getElementById('hero').dataset.solver, null, { timeout: 30000 });
  return p;
}
async function homeAt(p, fx, fy) { const b = await vbox(p, '#hero'); return [b.x + b.width * fx, b.y + b.height * fy]; }
async function hitInfo(p, x, y) { return p.evaluate((a) => { var e = document.elementFromPoint(a[0], a[1]); return e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : '') : 'none'; }, [x, y]); }
async function runHome() {
  for (const theme of ['dark', 'light']) {
    for (const [name, wait] of [['home-wave', 900], ['home-arrival', 3200]]) {
      const ctx = await newCtx(theme, 1);
      try {
        const p = await openHome(ctx, name); await p.waitForTimeout(1800);
        const [x, y] = await homeAt(p, 0.62, 0.30); const hit = await hitInfo(p, x, y);
        await p.mouse.click(x, y); await p.waitForTimeout(wait);
        const solver = await p.evaluate(() => document.getElementById('hero').dataset.solver);
        await p.screenshot({ path: path.join(OUT, name + '-' + theme + '.png') });
        fileNote(name + '-' + theme + '.png', 'home, click hero 62%/30% (element hit: ' + hit + '), +' + (wait / 1000) + ' s real; solver ' + solver);
      } catch (e) { note(name, 'FAILED (' + theme + '): ' + e.message.split('\n')[0]); }
      await ctx.close();
    }
    const ctx = await newCtx(theme, 1);
    try {
      const p = await openHome(ctx, 'home-array'); await p.waitForTimeout(1800);
      await clickSel(p, '#lab [data-tool="array"]'); await p.waitForTimeout(250);
      await clickSel(p, '#labPop [data-arr="line"]'); await p.waitForTimeout(250);
      const [x0, y0] = await homeAt(p, 0.25, 0.30), [x1, y1] = await homeAt(p, 0.70, 0.30);
      const hit = await hitInfo(p, x0, y0);
      await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x1, y1, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(200);
      const lbl = await p.evaluate(() => document.getElementById('seisLabel').innerText);
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      await clickSel(p, '#lab [data-tool="quake"]'); await p.waitForTimeout(150);
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      const popHidden = await p.evaluate(() => document.getElementById('labPop').hidden);
      const [qx, qy] = await homeAt(p, 0.5, 0.62); await p.mouse.click(qx, qy); await p.waitForTimeout(3000);
      await p.screenshot({ path: path.join(OUT, 'home-array-' + theme + '.png') });
      fileNote('home-array-' + theme + '.png', 'line array dragged 25%→70% at 30% y (start hit: ' + hit + '); strip label "' + lbl + '"; popover hidden=' + popHidden + '; quake at 50%/62%, +3 s real');
    } catch (e) { note('home-array', 'FAILED (' + theme + '): ' + e.message.split('\n')[0]); }
    await ctx.close();
  }
}
async function runHomePops() {
  const ctx = await newCtx('dark', 1);
  try {
    const p = await openHome(ctx, 'home-pops'); await p.waitForTimeout(1500);
    const items = [['quake', '[data-tool="quake"]'], ['slow', '[data-tool="slow"]'], ['fast', '[data-tool="fast"]'], ['erase', '[data-tool="erase"]'], ['scatter', '[data-tool="scatter"]'], ['array', '[data-tool="array"]'], ['model', '[data-panel="model"]'], ['info', '[data-panel="info"]']];
    for (const [name, sel] of items) {
      try {
        await p.keyboard.press('Escape'); await p.waitForTimeout(120);
        await clickSel(p, '#lab ' + sel); await p.waitForTimeout(350);
        let open = await p.evaluate(() => !document.getElementById('labPop').hidden);
        if (!open) { await clickSel(p, '#lab ' + sel); await p.waitForTimeout(350); open = await p.evaluate(() => !document.getElementById('labPop').hidden); }
        await p.mouse.move(5, 5);
        await p.screenshot({ path: path.join(OUT, 'home-pop-' + name + '-dark.png') });
        fileNote('home-pop-' + name + '-dark.png', 'home toolbar #lab ' + sel + ' → #labPop ' + (open ? 'open' : 'NOT open'));
        fs.writeFileSync(path.join(TXT, 'home-pop-' + name + '.txt'), open ? await p.evaluate(() => document.getElementById('labPop').innerText) : '(#labPop not open)');
        fileNote('text/home-pop-' + name + '.txt', '#labPop innerText for ' + sel);
      } catch (e) { note('home-pops', name + ' FAILED: ' + e.message.split('\n')[0]); }
    }
  } catch (e) { note('home-pops', 'FAILED: ' + e.message.split('\n')[0]); }
  await ctx.close();
}
async function runPhone() {
  let ctx = await newCtx('dark', 0, 'iPhone 13');
  try {
    const p = await openHome(ctx, 'home-phone'); await p.waitForTimeout(1800);
    const [x, y] = await homeAt(p, 0.5, 0.4); const hit = await hitInfo(p, x, y);
    await p.touchscreen.tap(x, y); await p.waitForTimeout(1000);
    await p.screenshot({ path: path.join(OUT, 'home-phone.png') });
    fileNote('home-phone.png', 'iPhone 13 dark, home viewport after one tap at hero 50%/40% (hit ' + hit + ') + 1 s');
  } catch (e) { note('home-phone', 'FAILED: ' + e.message.split('\n')[0]); }
  await ctx.close();
  ctx = await newCtx('dark', 0, 'iPhone 13');
  try {
    const p = await openLab(ctx, 'lab-phone-arrays', 'arrays');
    await p.locator('#view').scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
    const b = await vbox(p, '#view'); await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await waitSim(p, 3.0);
    const q = await p.evaluate(() => Lab.marks.length);
    await p.screenshot({ path: path.join(OUT, 'lab-phone-arrays.png'), fullPage: true });
    fileNote('lab-phone-arrays.png', 'iPhone 13 dark, lab #arrays fullPage after one tap in #view centre + 3 s sim (' + q + ' quake marks)');
  } catch (e) { note('lab-phone-arrays', 'FAILED: ' + e.message.split('\n')[0]); }
  await ctx.close();
  ctx = await newCtx('dark', 0, 'iPhone 13');
  try {
    const p = await openLab(ctx, 'lab-phone-tomo', 'tomo');
    await p.locator('#ctaBtn').tap();
    await waitFn(p, () => Lab.CH.tomo.phase === 'done' && !Lab.CH.tomo.bending && !!Lab.CH.tomo.inv); await p.waitForTimeout(500);
    const r = await p.evaluate(() => { var i = Lab.CH.tomo.inv; return i.mode + ' rays, ' + i.n + ' picks, r = ' + i.r.toFixed(2) + ', grid ' + Lab.nx + 'x' + Lab.ny; });
    await p.screenshot({ path: path.join(OUT, 'lab-phone-tomo.png'), fullPage: true });
    fileNote('lab-phone-tomo.png', 'iPhone 13 dark, lab #tomo fullPage after the survey completed (' + r + ')');
  } catch (e) { note('lab-phone-tomo', 'FAILED: ' + e.message.split('\n')[0]); }
  await ctx.close();
}

function writeIndex() {
  const files = Object.keys(LOG.files).filter((f) => fs.existsSync(path.join(OUT, f))).sort();
  let s = '# design/shots-r2 · index\n\nGenerated by `design/shots-r2.js` (Playwright Chromium, headless, CPU solver forced via `yw-lab`). Viewport 1440×900 unless noted. "t" is the simulated time of the lab engine; "+x s sim" waits are in simulated seconds.\n\n## Files\n\n';
  files.forEach((f) => { s += '- `' + f + '` — ' + LOG.files[f] + '\n'; });
  s += '\n## Scenario notes / failures\n\n';
  const nk = Object.keys(LOG.notes); if (!nk.length) s += '- none\n'; nk.forEach((k) => LOG.notes[k].forEach((n) => { s += '- **' + k + '**: ' + n + '\n'; }));
  s += '\n## Console errors / page errors (verbatim)\n\n';
  const ek = Object.keys(LOG.errors); if (!ek.length) s += '- none in any scenario\n'; ek.forEach((k) => LOG.errors[k].forEach((n) => { s += '- **' + k + '**: `' + n.replace(/`/g, "'") + '`\n'; }));
  fs.writeFileSync(path.join(OUT, 'INDEX.md'), s);
}

(async () => {
  browser = await chromium.launch();
  const sel = (id) => !FILTER.length || FILTER.some((f) => id.indexOf(f) >= 0);
  for (const sc of LAB) if (sel('lab:' + sc.id + ':' + sc.names.join(','))) await runLab(sc);
  if (sel('settings')) await runSettings();
  if (sel('toolopt')) await runToolOptions();
  if (sel('home-main')) await runHome();
  if (sel('home-pops')) await runHomePops();
  if (sel('phone')) await runPhone();
  await browser.close();
  writeIndex();
  console.log('done');
})();
