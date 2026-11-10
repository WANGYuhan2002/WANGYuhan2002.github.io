/* lab.js — the Wave Lab shell.
   One solver (WaveEngine), one velocity model (WaveModels) and six chapters, registered by lab-chapters.js.
   The shell owns the layout, the tool strip, the frame loop, the data panel, sharing and export, settings,
   sound and haptics; a chapter only describes its experiment:
     { id, title, goal, physics, tools[], enter(), save(), serialize(), load(o), steps(), results(), explain(),
       act(name, val), input(id, val), down/move/up(cell, event), handles(), moveHandle(id, cell),
       onSamples(block, n, nProbes), tick(dt, n), overlay(ctx), data(ctx, w, h), hud(), legend(), csv() }   */
(function () {
  'use strict';
  var WE = window.WaveEngine, WM = window.WaveModels;
  function $(id) { return document.getElementById(id); }
  var root = document.documentElement, view = $('view'), glc = $('glc'), cpuc = $('cpuc'), ovc = $('ovc'), octx = ovc.getContext('2d');
  var dcv = $('datac'), dctx = dcv.getContext('2d'), insp = $('insp'), toolsEl = $('tools'), topt = $('topt');
  var hudEl = $('hud'), progEl = $('prog'), toastEl = $('toast'), legendEl = $('legend');
  var setPop = $('setPop'), sharePop = $('sharePop'), exportMenu = $('exportMenu'), exportBtn = $('exportBtn'), setBtn = $('setBtn');
  function mm(q) { return !!(window.matchMedia && matchMedia(q).matches); }
  var reduceMotion = mm('(prefers-reduced-motion: reduce)'), coarse = mm('(pointer: coarse)');

  var L = window.Lab = { CH: {}, ORDER: [], WE: WE, WM: WM, coarse: coarse, reduceMotion: reduceMotion, marks: [] };
  var S = L.S = { ch: 'play', backend: WE.gpuAvailable() ? 'gpu' : 'cpu', fine: false, speed: 1, sound: false, haptics: false,
    reveal: true, paused: false, tool: 'quake', mag: 3.2, magRandom: true, fmul: 1, brushR: 14, brushS: 0.2, explain: false };
  S.q = 1;                                                               /* grid scale; lowered automatically on a busy device */
  try { var saved = JSON.parse(localStorage.getItem('yw-lab') || '{}'); if (saved.backend === 'cpu' || (saved.backend === 'gpu' && WE.gpuAvailable())) S.backend = saved.backend; if (saved.fine) S.fine = true; if (saved.speed) S.speed = saved.speed; if (saved.q >= 0.5 && saved.q < 1) S.q = saved.q; } catch (e) {}
  function persist() { try { localStorage.setItem('yw-lab', JSON.stringify({ backend: S.backend, fine: S.fine, speed: S.speed, q: S.q })); } catch (e) {} }

  /* ---------------- theme (shared with the homepage: localStorage 'yw-theme') ---------------- */
  function theme() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  (function () {
    var btn = $('themeBtn'), meta = document.querySelector('meta[name="theme-color"]');
    function stored() { try { return localStorage.getItem('yw-theme'); } catch (e) { return null; } }
    function apply(t, save) {
      root.setAttribute('data-theme', t); if (meta) meta.setAttribute('content', t === 'light' ? '#f4f3ee' : '#070a12');
      btn.setAttribute('aria-label', t === 'light' ? 'Switch to the dark theme' : 'Switch to the light theme');
      if (save) { try { localStorage.setItem('yw-theme', t); } catch (e) {} }
      document.dispatchEvent(new CustomEvent('themechange', { detail: t }));
    }
    btn.addEventListener('click', function () { apply(theme() === 'light' ? 'dark' : 'light', true); });
    if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', function (e) { if (!stored()) apply(e.matches ? 'light' : 'dark', false); });
    window.addEventListener('storage', function (e) { if (e.key === 'yw-theme' && (e.newValue === 'light' || e.newValue === 'dark')) apply(e.newValue, false); });
  })();
  /* the velocity model is always shown under the waves; in the lab it is the object of study, so its tint is stronger than on the homepage */
  function labPal() { var b = WE.PAL[theme()], o = {}; for (var k in b) o[k] = b[k]; o.tint = b.tint * 1.25; return o; }
  L.pal = labPal();
  document.addEventListener('themechange', function () { L.pal = labPal(); if (L.eng) L.eng.setDisplay(L.pal, S.reveal); });

  /* ---------------- engine, model, coordinates ---------------- */
  var acc = 0;
  L.build = function () {
    var ch = L.CH[S.ch], r = view.getBoundingClientRect();
    L.W = r.width; L.H = r.height;
    var phys = ch.physics || 'acoustic', g = WE.gridFor(S.backend, phys, L.W, L.H, S.fine, S.q);
    if (L.eng) L.eng.destroy();
    L.eng = WE.create({ nx: g.nx, ny: g.ny, physics: phys, backend: S.backend, canvasGL: glc, canvas2d: cpuc });
    glc.style.display = L.eng.backend === 'gpu' ? '' : 'none'; cpuc.style.display = L.eng.backend === 'cpu' ? '' : 'none';
    L.nx = L.eng.nx; L.ny = L.eng.ny; L.rate = L.eng.rate; L.TR = Math.round(L.rate * 6); L.res = Math.max(1, L.nx / 480);
    L.model = new WM.Model(L.nx, L.ny);
    L.eng.setDisplay(L.pal, S.reveal);
    L.marks = []; acc = 0; L.peakSnd = 0;
    sizeOverlay();
    ch.enter();
    status();
  };
  L.sx = function (x) { return (x + 0.5) / L.nx * L.W; };
  L.sy = function (y) { return (y + 0.5) / L.ny * L.H; };
  L.cellOf = function (e) { var r = view.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * L.nx - 0.5), Math.round((e.clientY - r.top) / r.height * L.ny - 0.5)]; };
  L.clampIn = function (x, y, m) { m = m == null ? 2 : m; return [Math.max(m, Math.min(L.nx - 1 - m, Math.round(x))), Math.max(m, Math.min(L.ny - 1 - m, Math.round(y)))]; };
  L.toN = function (p) { return [+(p[0] / L.nx).toFixed(4), +(p[1] / L.nx).toFixed(4)]; };      /* normalised by the width: survives a new grid */
  L.fromN = function (p, m) { return L.clampIn(p[0] * L.nx, p[1] * L.nx, m); };
  L.KM = 10;                                                                                      /* the lab's domain is 10 km wide → v = 1 is 2.5 km/s */
  L.km = function (cells) { return cells / L.nx * L.KM; };
  L.fmt = function (v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); };
  L.setModel = function (rect) { L.eng.setModel(L.model, rect); };
  L.BC = { absorb: { top: true, bottom: true, left: true, right: true }, free: { top: false, bottom: true, left: true, right: true }, box: { top: false, bottom: false, left: false, right: false } };
  L.setBC = function (bc, alpha) { L.bc = bc; L.eng.setBoundary(L.BC[bc] || bc, alpha == null ? 0.5 : alpha); };
  L.magAmp = function (M) { return Math.pow(10, 0.35 * (M - 3)); };
  L.quake = function (x, y, o) {
    o = o || {};
    var M = o.mag != null ? o.mag : (S.magRandom ? +(2.2 + Math.random() * 2.4).toFixed(1) : S.mag);
    var s = L.eng.addSource({ x: x, y: y, amp: L.magAmp(M) * (o.ampMul || 1), kind: o.kind || 0, fmul: o.fmul || S.fmul });
    L.marks.push({ n: L.eng.n, x: s.x, y: s.y, M: M, t: performance.now() }); if (L.marks.length > 12) L.marks.shift();
    if (S.sound && o.sound !== false) thump(Math.min(1, 0.3 + 0.17 * (M - 2)));
    return s;
  };
  L.setProbes = function (pts) { L.eng.setProbes(pts); };

  /* receivers: ring buffers of two components (acoustic: p, 0 · elastic: up, right) */
  function Rec(pts, len) {
    this.pts = pts; this.n = pts.length; this.len = len; this.head = 0; this.count = 0; this.peak = 0;
    this.z = []; this.x = []; for (var k = 0; k < this.n; k++) { this.z.push(new Float32Array(len)); this.x.push(new Float32Array(len)); }
  }
  Rec.prototype.push = function (block, n, nP, off) {
    for (var s = 0; s < n; s++) {
      var b = (s * nP + off) * 2;
      for (var k = 0; k < this.n; k++) { this.z[k][this.head] = block[b + 2 * k]; this.x[k][this.head] = block[b + 2 * k + 1]; }
      this.head = (this.head + 1) % this.len;
    }
    this.count += n;
  };
  Rec.prototype.get = function (k, i, comp) { return (comp ? this.x : this.z)[k][(this.head + i) % this.len]; };   /* i = 0 is the oldest sample */
  Rec.prototype.clear = function () { for (var k = 0; k < this.n; k++) { this.z[k].fill(0); this.x[k].fill(0); } this.peak = 0; };
  /* a new receiver set; traces of receivers listed in keep (old index per new receiver, or -1) are carried over */
  Rec.prototype.remap = function (pts, keep) {
    var r = new Rec(pts, this.len); r.head = this.head; r.count = this.count; r.peak = this.peak;
    for (var k = 0; k < pts.length; k++) if (keep[k] >= 0) { r.z[k] = this.z[keep[k]]; r.x[k] = this.x[keep[k]]; }
    return r;
  };
  L.Rec = Rec;

  /* ---------------- tool strip ---------------- */
  var ICON = {
    quake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9.6" opacity=".5"/></svg>',
    slow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3.5c4.6 0 8.5 3.3 8 8.1-.5 4.7-4.6 8.5-9.2 8-4.4-.4-7.6-4.2-7.2-8.6C4 6.6 7.6 3.5 12 3.5z"/><path d="M8.3 12h7.4"/></svg>',
    fast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3.5c4.6 0 8.5 3.3 8 8.1-.5 4.7-4.6 8.5-9.2 8-4.4-.4-7.6-4.2-7.2-8.6C4 6.6 7.6 3.5 12 3.5z"/><path d="M8.3 12h7.4M12 8.3v7.4"/></svg>',
    erase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M14.5 4.5 20 10l-8.5 8.5H6l-2.5-2.5z"/><path d="M9 10l5.5 5.5M11 18.5h9"/></svg>',
    scatter: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="7" r="1.7"/><circle cx="15.5" cy="5" r="1.7"/><circle cx="11" cy="12" r="1.7"/><circle cx="18.5" cy="13.5" r="1.7"/><circle cx="6.5" cy="17.5" r="1.7"/><circle cx="14" cy="19.5" r="1.7"/></svg>',
    line: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.5 8h6l-3 5.2zM9 8h6l-3 5.2zM16.5 8h6l-3 5.2z"/><path d="M2 17.5h20" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2.4"/></svg>',
    ring: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8" stroke-dasharray="2.4 2.4"/><path d="M12 2.2 9.8 6h4.4zM21.8 12 18 9.8v4.4zM12 21.8l2.2-3.8H9.8zM2.2 12 6 14.2V9.8z" fill="currentColor" stroke="none"/></svg>',
    fiber: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 18c3-8 6 2 9-5s6-4 9-9"/><circle cx="3" cy="18" r="1.7" fill="currentColor" stroke="none"/></svg>',
    source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l2.3 6.2L21 9.5l-5.3 4.1L17.6 21 12 17.2 6.4 21l1.9-7.4L3 9.5l6.7-.3z" stroke-linejoin="round"/></svg>',
    station: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7h11l-5.5 9.5z" fill="currentColor" stroke="none"/><path d="M18.5 3.5v6M15.5 6.5h6"/><path d="M3 20h18" stroke-dasharray="2 2.4"/></svg>'
  };
  var TOOL = { quake: ['Earthquake', 'Q'], slow: ['Low-velocity body', 'S'], fast: ['High-velocity body', 'F'], erase: ['Erase structure', 'E'], scatter: ['Point scatterers', 'C'],
    line: ['Line array', 'L'], ring: ['Ring array', 'O'], fiber: ['Fibre-optic cable (DAS)', 'D'], source: ['Hidden source', 'Q'], station: ['Stations', 'T'] };
  L.TOOL = TOOL;
  function renderTools() {
    var ch = L.CH[S.ch], h = '';
    (ch.tools || []).forEach(function (t) {
      if (t === '|') { h += '<span class="sep" aria-hidden="true"></span>'; return; }
      var d = TOOL[t]; h += '<button type="button" data-tool="' + t + '" aria-pressed="' + (S.tool === t) + '" aria-label="' + d[0] + ' (' + d[1] + ')" title="' + d[0] + ' · ' + d[1] + '">' + ICON[t] + '</button>';
    });
    toolsEl.innerHTML = h; toolsEl.style.display = (ch.tools && ch.tools.length) ? '' : 'none';
  }
  toolsEl.addEventListener('click', function (e) { var b = e.target.closest('[data-tool]'); if (b) L.selectTool(b.dataset.tool, true); });
  L.selectTool = function (t, fromClick) {
    var same = S.tool === t, ch = L.CH[S.ch]; S.tool = t;
    toolsEl.querySelectorAll('[data-tool]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tool === t); });
    if (fromClick) { if (same && !topt.hidden) closeTopt(); else openTopt(t); } else if (!topt.hidden) openTopt(t);
    if (ch.onTool) ch.onTool(t);
  };
  function openTopt(t) { var h = toptHTML(t); if (h == null) { closeTopt(); return; } topt.innerHTML = h; topt.hidden = false; }
  function closeTopt() { topt.hidden = true; }
  L.closeTopt = closeTopt;
  function toptHTML(t) {
    var ch = L.CH[S.ch], body = ch.toolOptions ? ch.toolOptions(t) : null;
    if (body == null) {
      if (t === 'quake') {
        var fh = function (m) { return L.fmt(L.eng.fHz * m, 0) + ' Hz'; }, ppw = L.eng.ppw / S.fmul;
        body = '<p>Click or tap the wavefield to fire ' + (L.eng.physics === 'elastic' ? 'a source' : 'an <b>acoustic point source</b> (a pressure pulse, P waves only)') + ' with a Ricker time function. <kbd>Shift</kbd>-click for a big one.</p>' +
          L.range('tMag', 'Magnitude', 1.5, 5, 0.1, S.mag, S.magRandom ? 'random' : 'M ' + S.mag.toFixed(1)) + L.check('tMagR', 'random magnitude', S.magRandom) +
          '<p style="margin:.7rem 0 .3rem">Peak frequency</p>' + L.seg('fmul', [['0.6', fh(0.6)], ['1', fh(1)], ['1.6', fh(1.6)]], String(S.fmul), 'sm') +
          '<p style="margin:.4rem 0 0">' + L.fmt(ppw, 0) + ' grid points per wavelength at v = 1' + (ppw < 9 ? ': short waves start to suffer from <b>numerical dispersion</b> (they trail ripples).' : '.') + '</p>';
      }
      else if (t === 'slow' || t === 'fast') body = '<p>Drag to paint. Inside the brush the velocity becomes <b>' + (t === 'slow' ? '1 − strength' : '1 + strength') + '</b> (background 1), with a soft edge.</p>' + L.range('tR', 'Radius', 4, 40, 1, S.brushR, brushKm()) + L.range('tS', 'Strength', 5, t === 'fast' ? 38 : 50, 1, Math.round(S.brushS * 100), (t === 'slow' ? '−' : '+') + Math.round(S.brushS * 100) + ' %');
      else if (t === 'erase') body = '<p>Drag to restore the background velocity (v = 1).</p>' + L.range('tR', 'Radius', 4, 40, 1, S.brushR, brushKm());
      else if (t === 'scatter') body = '<p>Click or drag to drop point scatterers: small inclusions at 35 % of the background velocity. Each one re-radiates the passing wave; many of them build up a coda.</p><div class="btns"><button class="pbtn" type="button" data-act="sprinkle">Sprinkle 30</button><button class="pbtn" type="button" data-act="clearScat">Clear all</button></div>';
      else return null;
    }
    return '<p class="topt-h"><span>' + TOOL[t][0] + '</span><button type="button" data-act="closeTopt" aria-label="Close tool options">×</button></p>' + body;
  }
  function brushKm() { return 'r = ' + L.fmt(S.brushR / 480 * L.KM, 2) + ' km'; }

  /* ---------------- inspector: numbered steps, results, explanation ---------------- */
  L.opt = function (act, val, label, on, title, dis) { return '<button class="opt" type="button" data-act="' + act + '" data-val="' + val + '" aria-pressed="' + !!on + '"' + (title ? ' title="' + title + '"' : '') + (dis ? ' disabled' : '') + '>' + label + '</button>'; };
  L.seg = function (act, items, cur, cls) { return '<div class="seg' + (cls ? ' ' + cls : '') + '" role="group">' + items.map(function (it) { return '<button type="button" data-act="' + act + '" data-val="' + it[0] + '" aria-pressed="' + (String(cur) === String(it[0])) + '"' + (it[2] ? ' disabled title="' + it[2] + '"' : '') + '>' + it[1] + '</button>'; }).join('') + '</div>'; };
  L.range = function (id, label, min, max, step, val, out) { return '<div class="rng"><div class="row"><label for="' + id + '">' + label + '</label><output id="' + id + 'o">' + out + '</output></div><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>'; };
  L.check = function (id, label, on) { return '<label class="chk"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + label + '</label>'; };
  L.btn = function (act, label, cls, dis, val) { return '<button class="pbtn' + (cls ? ' ' + cls : '') + '" type="button" data-act="' + act + '"' + (val != null ? ' data-val="' + val + '"' : '') + (dis ? ' disabled' : '') + '>' + label + '</button>'; };
  L.text = function (id, s) { var el = $(id); if (el && el.textContent !== s) el.textContent = s; };
  L.html = function (id, s) { var el = $(id); if (el && el.innerHTML !== s) el.innerHTML = s; };
  L.refresh = function () {
    var ch = L.CH[S.ch], i = L.ORDER.indexOf(ch.id), st = ch.steps ? ch.steps() : [], now = -1, k, top = insp.scrollTop;
    for (k = 0; k < st.length; k++) if (!st[k].done) { now = k; break; }
    var h = '<p class="ch-k">Experiment ' + (i + 1) + ' of ' + L.ORDER.length + '</p><h1>' + ch.title + '</h1><p class="goal">' + ch.goal + '</p><ol class="steps">';
    st.forEach(function (s, k) {
      h += '<li class="st' + (s.done ? ' done' : '') + (k === now ? ' now' : '') + '"><span class="st-n" aria-hidden="true">' + (s.done ? '✓' : (k + 1)) + '</span><div><p class="st-t">' + s.t + '</p>' +
        (s.d ? '<p class="st-d">' + s.d + '</p>' : '') + (s.c ? '<div class="st-c">' + s.c + '</div>' : '') + '</div></li>';
    });
    h += '</ol>' + (ch.results ? ch.results() : '');
    h += '<details class="explain" id="explain"' + (S.explain ? ' open' : '') + '><summary>What’s going on</summary>' + (ch.explain ? ch.explain() : '') + '</details>';
    var prev = L.ORDER[i - 1], next = L.ORDER[i + 1];
    h += '<nav class="ch-nav" aria-label="Previous and next experiment">' + (prev ? '<a href="#' + prev + '">← ' + L.CH[prev].title + '</a>' : '') + (next ? '<a class="next" href="#' + next + '">Next: ' + L.CH[next].title + ' →</a>' : '<a class="next" href="../">Back to the homepage →</a>') + '</nav>';
    insp.innerHTML = h; insp.scrollTop = top;
    var ex = $('explain'); if (ex) ex.addEventListener('toggle', function () { S.explain = ex.open; });
  };

  /* delegated events for the inspector, tool options, data controls and pop-ups */
  function onAct(e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var a = b.dataset.act, v = b.dataset.val, ch = L.CH[S.ch];
    if (a === 'closeTopt') { closeTopt(); return; }
    if (a === 'fmul') { S.fmul = +v; openTopt('quake'); return; }
    if (a === 'sprinkle') { sprinkle(30); if (ch.onEdit) ch.onEdit(); return; }
    if (a === 'clearScat') { L.model.clearScatter(); L.setModel(); if (ch.onEdit) ch.onEdit(); return; }
    if (settingsAct(a, v)) return;
    if (ch.act) ch.act(a, v, b);
  }
  function onInput(e) {
    var t = e.target; if (!t.id) return;
    if (e.type === 'input' && (t.type === 'checkbox' || t.type === 'radio')) return;
    if (e.type === 'change' && t.type === 'range') return;
    var v = t.type === 'checkbox' ? t.checked : t.value, o = $(t.id + 'o');
    if (t.id === 'tMag') { S.mag = +v; S.magRandom = false; var r = $('tMagR'); if (r) r.checked = false; if (o) o.textContent = 'M ' + S.mag.toFixed(1); return; }
    if (t.id === 'tMagR') { S.magRandom = v; var mo = $('tMago'); if (mo) mo.textContent = v ? 'random' : 'M ' + S.mag.toFixed(1); return; }
    if (t.id === 'tR') { S.brushR = +v; if (o) o.textContent = brushKm(); return; }
    if (t.id === 'tS') { S.brushS = v / 100; if (o) o.textContent = (S.tool === 'slow' ? '−' : '+') + v + ' %'; return; }
    if (settingsInput(t.id, v)) return;
    var ch = L.CH[S.ch]; if (ch.input) ch.input(t.id, v, t);
  }
  [insp, topt, $('dataCtl'), setPop, sharePop, $('ctaBtn')].forEach(function (el) { el.addEventListener('click', onAct); el.addEventListener('input', onInput); el.addEventListener('change', onInput); });

  /* ---------------- pointer: handles first, then the chapter, then the common tools ---------------- */
  var drag = null; L.cursor = null;
  function hitHandle(e) {
    var ch = L.CH[S.ch]; if (!ch.handles) return null;
    var r = view.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = coarse ? 24 : 15;
    ch.handles().forEach(function (h) { var d = Math.hypot(L.sx(h.x) - mx, L.sy(h.y) - my + (h.dy || 0)); if (d < bd) { bd = d; best = h; } });
    return best;
  }
  function capture(e) { try { view.setPointerCapture(e.pointerId); } catch (_) {} }
  function stamp(c) {
    var t = S.tool, T = t === 'slow' ? 1 - S.brushS : (t === 'fast' ? 1 + S.brushS : 1);
    L.setModel(L.model.stamp(c[0], c[1], S.brushR * L.res, T));
  }
  function paintTo(c) {
    var d = Math.hypot(c[0] - drag.last[0], c[1] - drag.last[1]), stp = Math.max(1, S.brushR * L.res / 4);
    if (d < stp) return;
    var n = Math.ceil(d / stp);
    for (var k = 1; k <= n; k++) stamp([Math.round(drag.last[0] + (c[0] - drag.last[0]) * k / n), Math.round(drag.last[1] + (c[1] - drag.last[1]) * k / n)]);
    drag.last = c;
  }
  function scatterAt(c) { if (L.model.addScatter(c[0], c[1])) L.setModel([c[0] - 4, c[1] - 4, c[0] + 4, c[1] + 4]); }
  function sprinkle(n) {
    var m = L.eng.B + 4, tries = 0;
    while (n > 0 && tries < 4000) { tries++; var x = Math.round(m + Math.random() * (L.nx - 2 * m)), y = Math.round(m + Math.random() * (L.ny - 2 * m)); if (L.model.addScatter(x, y)) n--; }
    L.setModel();
  }
  L.sprinkle = sprinkle;
  L.lastUser = performance.now();
  document.addEventListener('pointerdown', function () { L.lastUser = performance.now(); }, true);
  document.addEventListener('keydown', function () { L.lastUser = performance.now(); }, true);
  view.addEventListener('pointerdown', function (e) {
    if (e.button > 0 || e.target.closest('button, a, input, label, .topt')) return;
    ensureAudio();
    var c = L.cellOf(e), ch = L.CH[S.ch], h = hitHandle(e);
    if (h) { drag = { kind: 'handle', h: h }; capture(e); return; }
    if (ch.down && ch.down(c, e)) { drag = { kind: 'chapter' }; capture(e); return; }
    var t = S.tool;
    if (t === 'quake') {
      var big = e.shiftKey, src = L.quake(c[0], c[1], big ? { mag: 7 } : (ch.quakeOpts ? ch.quakeOpts() : null));
      if (big) mega();
      if (ch.onQuake) ch.onQuake(src);
    } else if (t === 'slow' || t === 'fast' || t === 'erase') { capture(e); drag = { kind: 'paint', last: c }; stamp(c); }
    else if (t === 'scatter') { capture(e); drag = { kind: 'scatter', last: c }; scatterAt(c); }
  });
  view.addEventListener('pointermove', function (e) {
    var c = L.cellOf(e), ch = L.CH[S.ch]; L.cursor = c;
    if (!drag) { view.style.cursor = hitHandle(e) ? 'grab' : ''; return; }
    if (drag.kind === 'handle') ch.moveHandle(drag.h.id, L.clampIn(c[0], c[1], 1));
    else if (drag.kind === 'chapter') { if (ch.move) ch.move(c, e); }
    else if (drag.kind === 'paint') paintTo(c);
    else if (drag.kind === 'scatter' && Math.hypot(c[0] - drag.last[0], c[1] - drag.last[1]) >= 7 * L.res) { scatterAt(c); drag.last = c; }
  });
  function endDrag(e) {
    if (!drag) return;
    var ch = L.CH[S.ch], k = drag.kind;
    if (k === 'handle' && ch.dropHandle) ch.dropHandle(drag.h.id);
    if (k === 'chapter' && ch.up) ch.up(L.cellOf(e), e);
    drag = null;
    if ((k === 'paint' || k === 'scatter') && ch.onEdit) ch.onEdit();
  }
  view.addEventListener('pointerup', endDrag); view.addEventListener('pointercancel', endDrag);
  view.addEventListener('dblclick', function (e) { var ch = L.CH[S.ch], h = hitHandle(e); if (h && ch.removeHandle) ch.removeHandle(h.id); });
  view.addEventListener('pointerleave', function () { L.cursor = null; });
  L.dragging = function () { return drag; };

  /* ---------------- overlay ---------------- */
  function sizeOverlay() { var d = Math.min(2, window.devicePixelRatio || 1); L.dpr = d; ovc.width = Math.round(L.W * d); ovc.height = Math.round(L.H * d); }
  L.rgba = function (c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  /* marks on the field: a crisp halo outline under the fill (no blurred shadows) */
  function halo(ctx, alpha, lw) { ctx.lineJoin = 'round'; ctx.lineWidth = lw || 1.5; ctx.strokeStyle = L.pal.halo; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.stroke(); ctx.globalAlpha = 1; }
  L.tri = function (ctx, x, y, s, alpha, col) {
    ctx.beginPath(); ctx.moveTo(x - s, y - s * 1.7); ctx.lineTo(x + s, y - s * 1.7); ctx.lineTo(x, y); ctx.closePath();
    halo(ctx, alpha); ctx.fillStyle = L.rgba(col || L.pal.ink, alpha); ctx.fill();
  };
  L.label = function (ctx, s, x, y, align, col) {
    ctx.font = '600 10.5px "JetBrains Mono", monospace'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = 3; ctx.strokeStyle = L.pal.halo; ctx.strokeText(s, x, y);
    ctx.fillStyle = col || L.rgba(L.pal.ink, 0.96); ctx.fillText(s, x, y);
  };
  L.star = function (ctx, x, y, r, col, alpha) {
    ctx.beginPath();
    for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
    ctx.closePath(); halo(ctx, alpha); ctx.fillStyle = L.rgba(col, alpha); ctx.fill();
  };
  function drawOverlay() {
    var ch = L.CH[S.ch], k, pal = L.pal, now = performance.now();
    octx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); octx.clearRect(0, 0, L.W, L.H);
    var sc = L.model.scat, rs = Math.max(2.2, 1.6 * L.res / L.nx * L.W);
    for (k = 0; k < sc.length; k++) { octx.beginPath(); octx.arc(L.sx(sc[k][0]), L.sy(sc[k][1]), rs, 0, 6.2832); octx.fillStyle = L.rgba(pal.ink, 0.9); octx.fill(); octx.lineWidth = 1; octx.strokeStyle = L.rgba(pal.edge || pal.ink, 0.6); octx.stroke(); }
    if (!ch.noMarks) for (k = 0; k < L.marks.length; k++) {
      var m = L.marks[k], age = (now - m.t) / 2500; if (age >= 1) continue;
      if (age < 0.5 && !L.reduceMotion) { octx.beginPath(); octx.arc(L.sx(m.x), L.sy(m.y), 7 + 30 * age, 0, 6.2832); octx.lineWidth = 1.2; octx.strokeStyle = L.rgba(pal.neg, 0.55 * (1 - age)); octx.stroke(); }
      L.star(octx, L.sx(m.x), L.sy(m.y), 7, pal.neg, 0.9 * (1 - age));
    }
    if (ch.overlay) ch.overlay(octx);
    var t = S.tool;
    if (L.cursor && !coarse && (t === 'slow' || t === 'fast' || t === 'erase') && (ch.tools || []).indexOf(t) >= 0) {
      octx.beginPath(); octx.arc(L.sx(L.cursor[0]), L.sy(L.cursor[1]), S.brushR * L.res / L.nx * L.W, 0, 6.2832);
      octx.setLineDash([3, 4]); octx.lineWidth = 1.25; octx.strokeStyle = t === 'slow' ? L.rgba(pal.slow, 1) : (t === 'fast' ? L.rgba(pal.fast, 1) : L.rgba(pal.ink, 0.8)); octx.stroke(); octx.setLineDash([]);
    }
  }

  /* ---------------- data panel helpers ---------------- */
  L.font = function (ctx, px, w) { ctx.font = (w || 500) + ' ' + px + 'px "JetBrains Mono", monospace'; };
  L.panelLabel = function (ctx, s, x, y, col) { L.font(ctx, 10, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = col || L.pal.label; ctx.fillText(s, x, y); };
  /* time axis of a rolling window: a grid line every second through the trace area (from gridTop), short ticks, labels relative to now */
  L.timeAxis = function (ctx, X, Y, w, h, len, nowStep, gridTop) {
    var pal = L.pal, sec = Math.round(L.rate), st, xt;
    ctx.lineWidth = 1;
    if (gridTop != null) {
      ctx.strokeStyle = pal.grid; ctx.beginPath();
      for (st = nowStep - (nowStep % sec); st > nowStep - len; st -= sec) { xt = X + w - (nowStep - st) / len * w; ctx.moveTo(xt + 0.5, gridTop); ctx.lineTo(xt + 0.5, Y); }
      ctx.stroke();
    }
    ctx.strokeStyle = pal.tick; ctx.beginPath();
    for (st = nowStep - (nowStep % sec); st > nowStep - len; st -= sec) { xt = X + w - (nowStep - st) / len * w; ctx.moveTo(xt + 0.5, Y); ctx.lineTo(xt + 0.5, Y + h); }
    ctx.stroke();
    L.font(ctx, 10); ctx.textBaseline = 'bottom';
    var secs = Math.floor(len / L.rate);
    for (var s = 0; s <= secs; s += (w < 360 ? 2 : 1)) {
      var xs = X + w - s * L.rate / len * w; ctx.textAlign = s === 0 ? 'right' : 'center'; ctx.fillStyle = s === 0 ? L.rgba(pal.pos, 0.95) : pal.label;
      ctx.fillText(s === 0 ? 'now' : '−' + s + ' s', xs - (s === 0 ? 1 : 0), Y + h + 11);
    }
  };
  /* record section: wiggles with variable-area fill, one common gain (relative amplitudes kept) or AGC */
  var cs = null;
  L.drawSection = function (ctx, X, Y, w, h, rec, o) {
    o = o || {};
    var pal = L.pal, n = rec.n, len = rec.len, comp = o.comp || 0, many = n > 1, m = 0, k, s, v;
    var idx = o.order || null, nn = idx ? idx.length : n;
    for (s = 0; s < nn; s++) { var a = (comp ? rec.x : rec.z)[idx ? idx[s] : s]; for (k = 0; k < len; k++) { v = a[k] < 0 ? -a[k] : a[k]; if (v > m) m = v; } }
    rec.peak = Math.max(o.floor || 0.02, m, rec.peak * 0.995);
    var left = o.left != null ? o.left : (many ? 42 : 0), ww = w - left, sp = h / nn;
    var amp = (many ? 0.95 * sp : h / 2 - 3) / rec.peak * (o.gain || 1), clip = many ? 1.4 * sp : h / 2 - 1;
    var stride = Math.max(1, Math.floor(len / Math.max(1, ww * 1.5))), half = Math.round(L.rate * 0.25), floor = 0.02 * rec.peak, lvl = many ? 0.45 * sp : 0.35 * h;
    if (o.marks) {
      L.font(ctx, 10, 600); ctx.textBaseline = 'top'; ctx.lineWidth = 1;
      for (var q = 0; q < o.marks.length; q++) {
        var age = o.now - o.marks[q].n; if (age < 0 || age > len) continue;
        var xm = X + left + ww - age / len * ww;
        ctx.strokeStyle = 'rgba(' + pal.origin + ',.8)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(xm + 0.5, Y); ctx.lineTo(xm + 0.5, Y + h); ctx.stroke(); ctx.setLineDash([]);
        if (q === o.marks.length - 1) { ctx.fillStyle = 'rgba(' + pal.origin + ',.95)'; ctx.textAlign = 'left'; ctx.fillText(o.markLabel || 'origin', xm + 4, Y + 1); }
      }
    }
    if (o.agc && (!cs || cs.length !== len + 1)) cs = new Float64Array(len + 1);
    for (s = 0; s < nn; s++) {
      var tr = idx ? idx[s] : s, y0 = many ? Y + sp * (s + 0.5) : Y + h / 2, x2, y2;
      if (o.agc) { for (k = 0; k < len; k++) { var ov = rec.get(tr, k, comp); cs[k + 1] = cs[k] + ov * ov; } }
      var gain = function (k) { if (!o.agc) return amp; var lo = Math.max(0, k - half), hi = Math.min(len, k + half), r = Math.sqrt((cs[hi] - cs[lo]) / (hi - lo)); return lvl / Math.max(r, floor); };
      if (many && o.codes !== false && (sp >= 11 || s % 2 === 0)) { L.font(ctx, 10); ctx.fillStyle = pal.label; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(rec.pts[tr].code || '', X, y0); }
      if (!many) { ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X + left, Math.round(y0) + 0.5); ctx.lineTo(X + left + ww, Math.round(y0) + 0.5); ctx.stroke(); }
      if (o.fill !== false) {                                                /* variable-area fill of the positive half, also for a single trace */
        ctx.beginPath(); ctx.moveTo(X + left, y0);
        for (k = 0; k < len; k += stride) { v = rec.get(tr, k, comp) * gain(k); ctx.lineTo(X + left + k / (len - 1) * ww, y0 - Math.max(0, Math.min(clip, v))); }
        ctx.lineTo(X + left + ww, y0); ctx.closePath(); ctx.fillStyle = o.fillStyle || pal.fill;
        if (!many) ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = o.stroke || pal.trace; ctx.lineWidth = many ? 1 : 1.6; ctx.lineJoin = 'round'; ctx.beginPath();
      for (k = 0; k < len; k += stride) { v = rec.get(tr, k, comp) * gain(k); x2 = X + left + k / (len - 1) * ww; y2 = y0 - Math.max(-clip, Math.min(clip, v)); if (k) ctx.lineTo(x2, y2); else ctx.moveTo(x2, y2); }
      ctx.stroke();
    }
    return { x: X + left, w: ww, y: Y, h: h };                                /* the trace area, for the time axis */
  };
  /* diverging colour for signed values in −1…1 (the wavefield's own pos/neg colours over the panel background) */
  L.div = function (v) {
    var pal = L.pal, b = pal.pn || pal.bg, c = v >= 0 ? pal.pos : pal.neg, a = Math.min(1, Math.abs(v)); a = Math.pow(a, 0.7);
    return [b[0] + (c[0] - b[0]) * a, b[1] + (c[1] - b[1]) * a, b[2] + (c[2] - b[2]) * a];
  };
  /* velocity colour (slow → berry, fast → cobalt), the saturated swatches of the structure shown under the waves */
  L.velCol = function (dv, span) {
    var pal = L.pal, b = pal.pn || pal.bg, c = dv < 0 ? pal.slow : pal.fast, a = Math.min(1, Math.abs(dv) / (span || 0.25)); a = Math.pow(a, 0.85) * 0.92;
    return [b[0] + (c[0] - b[0]) * a, b[1] + (c[1] - b[1]) * a, b[2] + (c[2] - b[2]) * a];
  };
  L.colorbar = function (ctx, x, y, w, h, fn, lo, hi, title) {
    for (var i = 0; i < w; i++) { var c = fn(-1 + 2 * i / (w - 1)); ctx.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; ctx.fillRect(x + i, y, 1.5, h); }
    ctx.lineWidth = 1; ctx.strokeStyle = L.pal.tick; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    L.font(ctx, 10); ctx.fillStyle = L.pal.label; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText(lo, x, y + h + 3); ctx.textAlign = 'right'; ctx.fillText(hi, x + w, y + h + 3);
    if (title) { ctx.textAlign = 'center'; ctx.fillText(title, x + w / 2, y + h + 3); }
  };
  function drawData() {
    var w = dcv.clientWidth, h = dcv.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return;
    if (dcv.width !== Math.round(w * d) || dcv.height !== Math.round(h * d)) { dcv.width = Math.round(w * d); dcv.height = Math.round(h * d); }
    dctx.setTransform(d, 0, 0, d, 0, 0); dctx.clearRect(0, 0, w, h);
    var ch = L.CH[S.ch]; if (ch.data) ch.data(dctx, w, h);
  }
  L.setData = function (title, ctl) { $('dataTitle').innerHTML = title; if (ctl != null) $('dataCtl').innerHTML = ctl; };

  /* ---------------- HUD, legend, status, toast ---------------- */
  function status() {
    var e = L.eng, gpu = e.backend === 'gpu';
    $('status').innerHTML = '<b>' + (gpu ? 'GPU' : 'CPU') + '</b> · ' + e.nx + ' × ' + e.ny + ' · ' + (e.physics === 'elastic' ? 'elastic P-SV' : 'acoustic') + (S.backend === 'gpu' && !gpu ? ' · no WebGL2' : '');
  }
  L.status = status;
  var lastHud = '';
  function hud() {
    var ch = L.CH[S.ch], items = ch.hud ? ch.hud() : null;
    if (!items) items = ['t = ' + L.fmt(L.eng.n / L.rate, 1) + ' s'];
    if (S.paused) items.unshift('<b class="em">Paused</b> · Space to resume');
    var h = items.map(function (s) { return '<span>' + s + '</span>'; }).join('');
    if (h !== lastHud) {
      hudEl.innerHTML = h; lastHud = h;
      /* drop trailing details while anything is cut off: the first item is the one that matters */
      var sp = hudEl.children, cut = function () { for (var q = 0; q < sp.length; q++) if (sp[q].style.display !== 'none' && sp[q].scrollWidth > sp[q].clientWidth + 1) return true; return false; };
      for (var k = sp.length - 1; k > 0 && cut(); k--) sp[k].style.display = 'none';
    }
    var c = ch.cta ? ch.cta() : null, cb = $('ctaBtn');                     /* the chapter's main action, right above the field */
    if (!c) { if (!cb.hidden) cb.hidden = true; }
    else { if (cb.hidden) cb.hidden = false; if (cb.textContent !== c.label) cb.textContent = c.label; cb.disabled = !!c.disabled; cb.dataset.act = c.act; cb.dataset.val = c.val == null ? '' : c.val; }
    var p = ch.progress ? ch.progress() : null;
    progEl.style.width = p == null ? '0' : (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%';
  }
  L.legendAcoustic = function () {
    return '<span><i class="sw" style="background:var(--cyan)"></i>p &gt; 0</span><span><i class="sw" style="background:var(--coral)"></i>p &lt; 0</span>' + L.legendVel();
  };
  L.legendVel = function () { return '<span class="vramp" title="Velocity model under the waves: slower than v = 1 to faster">slow<i></i>fast</span>'; };
  L.updateLegend = function () { var ch = L.CH[S.ch]; legendEl.innerHTML = ch.legend ? ch.legend() : L.legendAcoustic(); fitLegend(); };
  /* the legend stays on one line: drop trailing items (the least important ones) while it does not fit */
  function fitLegend() {
    var it = legendEl.children, n = it.length, k, tot = 0, cw = legendEl.clientWidth, gap = parseFloat(getComputedStyle(legendEl).columnGap) || 0;
    for (k = 0; k < n; k++) it[k].style.display = '';
    if (!cw) return;
    for (k = 0; k < n; k++) tot += it[k].offsetWidth + (k ? gap : 0);
    for (k = n - 1; k > 0 && tot > cw + 0.5; k--) { tot -= it[k].offsetWidth + gap; it[k].style.display = 'none'; }
  }
  var tt = 0;
  L.toast = function (s, ms) { toastEl.textContent = s; toastEl.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 2600); };
  function mega() {
    if (!reduceMotion) { view.classList.remove('shake'); void view.offsetWidth; view.classList.add('shake'); }
    if (S.haptics && navigator.vibrate) navigator.vibrate([60, 40, 120]);
    L.toast('M 7.0. Hold on to something.');
  }

  /* ---------------- sound ("geophone") and haptics ---------------- */
  var AC = null, gRumble = null, armed = true, lastVib = 0;
  function ensureAudio() {
    if (!S.sound || AC) { if (AC && AC.state === 'suspended') AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      var len = AC.sampleRate * 2, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++) { var wn = Math.random() * 2 - 1; last = (last + 0.02 * wn) / 1.02; d[i] = last * 3.5; }   /* brown noise */
      var src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
      var lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
      gRumble = AC.createGain(); gRumble.gain.value = 0;
      src.connect(lp); lp.connect(gRumble); gRumble.connect(AC.destination); src.start();
    } catch (e) { AC = null; }
  }
  function thump(a) {
    if (!AC) return;
    var t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.45);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * a + 0.001, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.65);
  }
  /* the chapter's primary receiver drives a low rumble; a fresh arrival makes the phone buzz */
  function sense(block, n, nP, dt) {
    var ch = L.CH[S.ch]; if (!(S.sound || S.haptics) || !nP || ch.quiet) return;
    var off = ch.primary ? ch.primary() : 0, comp = 0, e = 0;
    for (var s = 0; s < n; s++) { var v = block[(s * nP + off) * 2 + comp]; e += v * v; }
    var rms = Math.sqrt(e / Math.max(1, n)), ref = ch.ampRef || 0.25;
    L.peakSnd = Math.max(rms, (L.peakSnd || 0) * Math.exp(-dt / 6000));
    var env = rms / Math.max(L.peakSnd, 0.08 * ref);
    if (S.sound && gRumble) gRumble.gain.setTargetAtTime(Math.min(1, env) * 0.6, AC.currentTime, 0.04);
    if (S.haptics && navigator.vibrate) {
      if (armed && env > 0.5 && rms > 0.1 * ref && performance.now() - lastVib > 350) { navigator.vibrate(Math.round(25 + 90 * Math.min(1, env))); lastVib = performance.now(); armed = false; }
      if (env < 0.2) armed = true;
    }
  }

  /* ---------------- settings, share, export ---------------- */
  function settingsHTML() {
    var gpu = WE.gpuAvailable();
    return '<h3>Settings</h3>' +
      '<div class="grp"><p>Solver</p>' + L.seg('set-backend', [['gpu', 'GPU · WebGL2', gpu ? '' : 'WebGL2 with float render targets is not available in this browser'], ['cpu', 'CPU']], S.backend) +
      '<small>Same finite-difference scheme on both; the GPU version runs a finer grid. Current grid: ' + L.eng.nx + ' × ' + L.eng.ny + ' cells, ' + Math.round(L.rate) + ' steps/s.</small></div>' +
      '<div class="grp"><p>Grid</p>' + L.seg('set-fine', [['0', 'Standard'], ['1', 'Fine', S.backend === 'gpu' ? '' : 'Fine grids need the GPU solver']], S.fine ? '1' : '0') +
      (S.q < 1 ? '<small>Reduced to ' + Math.round(S.q * 100) + ' % because this device could not keep up in real time. ' + L.btn('set-q', 'Back to 100 %') + '</small>' : '') + '</div>' +
      '<div class="grp"><p>Speed</p>' + L.seg('set-speed', [['0.5', '0.5×'], ['1', '1×'], ['2', '2×']], String(S.speed)) + '</div>' +
      '<div class="grp"><p>Senses</p>' + L.check('set-sound', 'Sound: a geophone rumble that follows the main receiver', S.sound) +
      L.check('set-haptics', 'Vibrate on arrivals' + (navigator.vibrate ? '' : ' (not supported here)'), S.haptics) + '</div>';
  }
  function settingsAct(a, v) {
    if (a === 'set-backend') { if (S.backend !== v) { saveCh(); S.backend = v; if (v === 'cpu') S.fine = false; persist(); L.build(); L.refresh(); setPop.innerHTML = settingsHTML(); L.toast(L.eng.backend === 'gpu' ? 'GPU solver · ' + L.nx + ' × ' + L.ny : 'CPU solver · ' + L.nx + ' × ' + L.ny); } return true; }
    if (a === 'set-fine') { var f = v === '1'; if (S.fine !== f) { saveCh(); S.fine = f; persist(); L.build(); L.refresh(); setPop.innerHTML = settingsHTML(); } return true; }
    if (a === 'set-speed') { S.speed = +v; persist(); setPop.innerHTML = settingsHTML(); return true; }
    if (a === 'set-q') { saveCh(); S.q = 1; persist(); L.build(); L.refresh(); setPop.innerHTML = settingsHTML(); return true; }
    if (a === 'share-copy') { copyLink(); return true; }
    if (a === 'share-close') { sharePop.hidden = true; return true; }
    return false;
  }
  function settingsInput(id, v) {
    if (id === 'set-sound') { S.sound = v; if (v) ensureAudio(); else if (gRumble) gRumble.gain.setTargetAtTime(0, AC.currentTime, 0.05); return true; }
    if (id === 'set-haptics') { S.haptics = v; if (v && navigator.vibrate) navigator.vibrate(30); return true; }
    return false;
  }
  function togglePop(pop, btn, html) {
    var open = pop.hidden; closePops();
    if (open) { if (html) pop.innerHTML = html; pop.hidden = false; if (btn) btn.setAttribute('aria-expanded', 'true'); }
  }
  function closePops() { [setPop, sharePop, exportMenu].forEach(function (p) { p.hidden = true; }); [setBtn, exportBtn].forEach(function (b) { b.setAttribute('aria-expanded', 'false'); }); }
  setBtn.addEventListener('click', function (e) { e.stopPropagation(); togglePop(setPop, setBtn, settingsHTML()); });
  exportBtn.addEventListener('click', function (e) { e.stopPropagation(); togglePop(exportMenu, exportBtn); });
  document.addEventListener('click', function (e) { if (!e.target.closest('.pop, .menu, #setBtn, #exportBtn, #shareBtn')) closePops(); });
  exportMenu.addEventListener('click', function (e) { var b = e.target.closest('[data-exp]'); if (!b) return; closePops(); if (b.dataset.exp === 'png') exportPNG(); else exportCSV(); });

  function saveCh() { var ch = L.CH[S.ch]; if (ch && ch.save && L.eng) ch.save(); }
  L.saveCh = saveCh;
  function b64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), out = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; }
  function encode(obj) {
    var json = JSON.stringify(obj), bytes = new TextEncoder().encode(json);
    if (!window.CompressionStream) return Promise.resolve('j' + b64(bytes));
    return new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer().then(function (ab) { return 'z' + b64(new Uint8Array(ab)); });
  }
  function decode(str) {
    var t = str[0], bytes = unb64(str.slice(1));
    if (t === 'z') return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text().then(JSON.parse);
    return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)));
  }
  function shareURL() {
    saveCh(); var ch = L.CH[S.ch];
    return encode({ v: 1, c: S.ch, s: ch.serialize ? ch.serialize() : null }).then(function (code) { return location.origin + location.pathname + '#s=' + code; });
  }
  var lastURL = '';
  function copyLink() {
    var inp = $('shareURL'); if (inp) { inp.select(); try { document.execCommand('copy'); } catch (e) {} }
    if (navigator.clipboard && lastURL) navigator.clipboard.writeText(lastURL).then(function () { L.toast('Link copied'); }, function () {});
  }
  $('shareBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    shareURL().then(function (url) {
      lastURL = url; history.replaceState(null, '', url);
      var ch = L.CH[S.ch], what = ch.shareWhat || 'the velocity model, your edits and the receivers';
      sharePop.innerHTML = '<h3>Share this scenario</h3><p style="margin:.4rem 0 0">The link rebuilds <b>' + ch.title + '</b> with ' + what + '. Waves are not stored: they are recomputed when the link is opened.</p>' +
        '<div class="share-box"><input id="shareURL" type="text" readonly value="' + url.replace(/"/g, '&quot;') + '" aria-label="Link to this scenario"><button class="pbtn go" type="button" data-act="share-copy">Copy</button></div>' +
        '<small>' + url.length + ' characters.</small>';
      closePops(); sharePop.hidden = false;
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { L.toast('Link copied to the clipboard'); }, function () {});
    });
  });
  function stamp8() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  function exportPNG() {
    var ch = L.CH[S.ch]; renderField();                                     /* draw now: the WebGL buffer is only valid within this task */
    var w = L.W, h = L.H, dh = dcv.clientHeight, cap = 46, sc = 2, c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = Math.round(w * sc); c.height = Math.round((h + dh + 30 + cap) * sc); x.scale(sc, sc);
    var css = getComputedStyle(root);
    x.fillStyle = css.getPropertyValue('--bg').trim() || '#070a12'; x.fillRect(0, 0, w, h + dh + 30 + cap);
    x.imageSmoothingEnabled = true; x.drawImage(L.eng.canvas, 0, 0, w, h); x.drawImage(ovc, 0, 0, w, h);
    x.fillStyle = css.getPropertyValue('--bg2').trim() || '#0b1019'; x.fillRect(0, h, w, dh + 30);
    x.fillStyle = css.getPropertyValue('--ink2').trim(); x.font = '500 10px "JetBrains Mono", monospace'; x.textBaseline = 'top'; x.textAlign = 'left';
    x.fillText($('dataTitle').textContent.toUpperCase(), 16, h + 10); x.drawImage(dcv, 0, h + 30, w, dh);
    x.fillStyle = css.getPropertyValue('--ink').trim(); x.font = '700 15px "Space Grotesk", sans-serif'; x.fillText('Wave Lab · ' + ch.title, 16, h + dh + 40);
    x.fillStyle = css.getPropertyValue('--muted').trim(); x.font = '400 10px "JetBrains Mono", monospace';
    x.fillText(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · ' + (L.eng.backend === 'gpu' ? 'GPU' : 'CPU') + ' ' + L.nx + ' × ' + L.ny + ' · t = ' + L.fmt(L.eng.n / L.rate, 2) + ' s · wangyuhan2002.github.io', 16, h + dh + 60);
    c.toBlob(function (b) { if (b) { download(b, 'wave-lab_' + ch.id + '_' + stamp8() + '.png'); L.toast('Snapshot saved'); } }, 'image/png');
  }
  function exportCSV() {
    var ch = L.CH[S.ch], csv = ch.csv ? ch.csv() : null;
    if (!csv) { L.toast('Nothing recorded yet'); return; }
    download(new Blob([csv], { type: 'text/csv' }), 'wave-lab_' + ch.id + '_' + stamp8() + '.csv'); L.toast('Traces saved');
  }
  L.recCSV = function (rec, comps, unit) {
    if (!rec || !rec.count) return null;
    var len = Math.min(rec.len, rec.count), head = ['time_s'], rows = [], k, c;
    for (k = 0; k < rec.n; k++) comps.forEach(function (cn) { head.push((rec.pts[k].code || ('R' + (k + 1))) + (comps.length > 1 ? '_' + cn : '')); });
    rows.push(head.join(','));
    for (var i = rec.len - len; i < rec.len; i++) {
      var r = [L.fmt((i - rec.len + 1) / L.rate, 4)];
      for (k = 0; k < rec.n; k++) for (c = 0; c < comps.length; c++) r.push(rec.get(k, i, c).toExponential(5));
      rows.push(r.join(','));
    }
    return '# Wave Lab · ' + L.CH[S.ch].title + ' · ' + unit + ' · time relative to the last sample · grid ' + L.nx + 'x' + L.ny + '\n' + rows.join('\n');
  };

  /* ---------------- chapters ---------------- */
  L.register = function (ch) { L.CH[ch.id] = ch; L.ORDER.push(ch.id); };
  L.go = function (id, loaded) {
    if (!L.CH[id]) id = 'play';
    var prev = L.CH[S.ch];
    if (L.eng && prev) { saveCh(); if (prev.leave) prev.leave(); }
    S.ch = id; var ch = L.CH[id];
    document.querySelectorAll('.rail a').forEach(function (a) { if (a.dataset.ch === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (loaded) ch.load(loaded);
    S.tool = (ch.tools && ch.tools[0]) || 'none'; closeTopt();
    L.build(); renderTools(); L.refresh(); L.updateLegend();
    document.title = ch.title + ' · Wave Lab · Yuhan Wang';
  };
  function route() {
    var h = location.hash.slice(1);
    if (h.indexOf('s=') === 0) {
      decode(h.slice(2)).then(function (o) { if (o && L.CH[o.c]) { L.go(o.c, o.s || {}); L.toast('Shared scenario loaded'); } else L.go('play'); }, function () { L.toast('This link could not be read'); L.go('play'); });
      return;
    }
    L.go(L.CH[h] ? h : (L.eng ? S.ch : 'play'));
  }
  window.addEventListener('hashchange', function () { var h = location.hash.slice(1); if (h.indexOf('s=') === 0) return; if (L.CH[h] && h !== S.ch) L.go(h); });

  /* ---------------- keyboard ---------------- */
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var k = e.key, ch = L.CH[S.ch];
    if (/^[1-6]$/.test(k)) { location.hash = L.ORDER[+k - 1]; return; }
    if (k === ' ' || k === 'p' || k === 'P') { e.preventDefault(); S.paused = !S.paused; return; }
    if (k === 'Escape') { closePops(); closeTopt(); return; }
    if (k === '?') { L.toast('1–6 experiments · Q S F E C T tools · Space pause · Shift-click: M 7', 5000); return; }
    var t = (ch.tools || []).filter(function (t) { return t !== '|' && TOOL[t][1].toLowerCase() === k.toLowerCase(); })[0];
    if (t) L.selectTool(t, true);
  });

  /* ---------------- main loop ---------------- */
  var running = false, lastT = 0;
  L.stepMs = 1;
  function renderField() {
    var ch = L.CH[S.ch];
    L.eng.render({ gain: ch.gain ? ch.gain() : 1.2, gain2: ch.gain2 ? ch.gain2() : null, mode: ch.mode ? ch.mode() : 'field' });
  }
  function frame(now) {
    if (document.hidden) { running = false; return; }
    if (!L.eng) { requestAnimationFrame(frame); return; }                     /* a shared link is still being decoded */
    var dt = lastT ? Math.min(100, now - lastT) : 16.7; lastT = now;
    var ch = L.CH[S.ch], n = 0, want = 0, ff = !!(ch.ffwd && ch.ffwd());
    if (!S.paused) {
      if (ff) {                                                              /* fast-forward: as many steps as fit in ~22 ms */
        n = Math.max(4, Math.min(6000, Math.round(22 / Math.max(0.004, L.stepMs))));
        if (ch.ffwdCap) n = Math.min(n, ch.ffwdCap());
      } else {
        var mul = S.speed * (ch.speedMul ? ch.speedMul() : 1);
        want = dt * L.rate * mul / 1000;
        acc += want; n = Math.min(Math.ceil(L.rate * mul * 0.1), Math.floor(acc)); acc -= n; if (acc > 4) acc = 0;
        if (ch.stepCap) { var cap = ch.stepCap(); if (cap < n) { want = n = cap; } }
      }
    }
    var quiet = S.paused || ff || (ch.busy && ch.busy());
    if (ch.tick) ch.tick(dt, n);
    var solverMs = 0;
    if (n > 0) {
      var t0 = performance.now(), block = L.eng.step(n);
      solverMs = performance.now() - t0; L.stepMs = 0.8 * L.stepMs + 0.2 * solverMs / n;
      if (ch.onSamples) ch.onSamples(block, n, L.eng.nP);
      sense(block, n, L.eng.nP, dt);
    }
    if (ch.after) ch.after(n);
    renderField(); drawOverlay(); drawData(); hud();
    if (watch.frame(now, want, n, quiet, solverMs) && S.q > 0.5 + 1e-6) degrade();
    requestAnimationFrame(frame);
  }
  function start() { if (!running) { running = true; lastT = 0; watch.t0 = 0; requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
  var watch = new WE.Watchdog();
  L.watch = watch;
  function degrade() {                                                       /* one step coarser; the chapter's scenario is kept */
    if (S.fine) S.fine = false; else S.q = Math.max(0.5, +(S.q * 0.75).toFixed(3));
    persist(); saveCh(); L.build(); L.refresh(); watch.t0 = 0;
    L.toast('This device could not keep up: grid reduced to ' + L.nx + ' × ' + L.ny + ' (Settings to undo)', 4200);
  }
  var rt = 0, lastW = 0, lastH = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt); rt = setTimeout(function () {
      var r = view.getBoundingClientRect();
      if (Math.abs(r.width - lastW) > 60 || Math.abs(r.height - lastH) > 120) { lastW = r.width; lastH = r.height; saveCh(); L.build(); L.refresh(); }
      else { L.W = r.width; L.H = r.height; sizeOverlay(); }
      fitLegend();
    }, 250);
  });
  L.start = function () {
    var r = view.getBoundingClientRect(); lastW = r.width; lastH = r.height;
    route(); start();
    if (window.console && console.log) console.log('%cWave Lab%c — every frame is a finite-difference solution of the wave equation, computed in your browser. Try Shift-click.', 'font-weight:700;color:#56e1f0', 'color:inherit');
  };
})();
