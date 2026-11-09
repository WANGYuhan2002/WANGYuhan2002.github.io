/* hero.js — the homepage wavefield. Click to make an earthquake; station YW01 records it; the hidden velocity
   structure can be revealed or switched. Same solver as the Wave Lab (WaveEngine): WebGL2 on the GPU when
   available, typed arrays on the CPU otherwise. Everything else (arrays, DAS, time reversal, tomography,
   ambient noise, elastic waves) lives in the lab at ./lab/. */
(function () {
  'use strict';
  var WE = window.WaveEngine, WM = window.WaveModels;
  function $(id) { return document.getElementById(id); }
  var hero = $('hero'), glc = $('fieldgl'), cpuc = $('field'), ov = $('overlay'), octx = ov.getContext('2d');
  var tcv = $('trace'), tctx = tcv.getContext('2d'), list = $('events'), countEl = $('count');
  var revealBtn = $('reveal'), legend = $('legend'), modelSel = $('heroModel');
  function mm(q) { return !!(window.matchMedia && matchMedia(q).matches); }
  var reduce = mm('(prefers-reduced-motion: reduce)'), coarse = mm('(pointer: coarse)');
  if (coarse) $('hintText').textContent = 'Tap to make an earthquake';

  var eng, model, nx, ny, rate, TR, W = 0, H = 0, lastW = 0, lastH = 0, dpr = 1;
  var sta = null, buf = null, head = 0, marks = [], peak = 0.08, total = 0, reveal = false, preset = 'random', seed = 1, autoFree = false, bc = 'absorb';
  var lastUserT = -1e9, lastAutoT = 0, backend = WE.gpuAvailable() ? 'gpu' : 'cpu';
  function theme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  var pal = WE.PAL[theme()];
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function build() {
    var r = hero.getBoundingClientRect(); W = r.width; H = r.height; lastW = W; lastH = H;
    var g = WE.gridFor(backend, 'acoustic', W, H, false);
    if (eng) eng.destroy();
    eng = WE.create({ nx: g.nx, ny: g.ny, physics: 'acoustic', backend: backend, canvasGL: glc, canvas2d: cpuc });
    if (eng.backend !== backend) backend = eng.backend;                           /* GPU failed: stay on the CPU */
    glc.style.display = eng.backend === 'gpu' ? '' : 'none'; cpuc.style.display = eng.backend === 'cpu' ? '' : 'none';
    nx = eng.nx; ny = eng.ny; rate = eng.rate; TR = Math.round(rate * 6);
    model = new WM.Model(nx, ny); model.setPreset(preset, seed); eng.setModel(model);
    setBC(bc); eng.setDisplay(pal, reveal);
    var mobile = W < 700;
    sta = { x: Math.round(nx * (mobile ? 0.76 : 0.78)), y: Math.round(ny * (mobile ? 0.34 : 0.56)) };
    eng.setProbes([[sta.x, sta.y]]); buf = new Float32Array(TR); head = 0; marks = []; peak = 0.08;
    dpr = Math.min(2, window.devicePixelRatio || 1); ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr);
    hero.dataset.solver = eng.backend + ' ' + nx + 'x' + ny;
  }
  function setBC(b) { bc = b; eng.setBoundary(b === 'free' ? { top: false, bottom: true, left: true, right: true } : { top: true, bottom: true, left: true, right: true }, 0.5); }
  function setPreset(p) {
    preset = p; model.setPreset(p, seed); eng.setModel(model);
    if (model.view() === 'section') { if (bc === 'absorb') { setBC('free'); autoFree = true; } if (!reveal) setReveal(true); }
    else if (autoFree) { setBC('absorb'); autoFree = false; }
    if (modelSel && modelSel.value !== p) modelSel.value = p;
  }
  function setReveal(on) {
    reveal = on; eng.setDisplay(pal, on);
    revealBtn.setAttribute('aria-pressed', on); legend.hidden = !on;
    revealBtn.innerHTML = on ? 'Hide<span class="long"> structure</span>' : 'Reveal<span class="long"> hidden structure</span>';
  }

  /* ---------------- quakes and the catalogue ---------------- */
  function quake(x, y, who, mag) {
    x = Math.max(3, Math.min(nx - 4, x)); y = Math.max(3, Math.min(ny - 4, y));
    var M = mag || +(2.2 + Math.random() * 2.4).toFixed(1);
    eng.addSource({ x: x, y: y, amp: Math.pow(10, 0.35 * (M - 3)) });            /* M only scales the amplitude */
    marks.push(eng.n); if (marks.length > 8) marks.shift();
    total++; countEl.textContent = total;
    var km = WM.SCALE[preset] || 100, f = function (d) { return d < 100 ? d.toFixed(1) : Math.round(d); };
    var loc = model.view() === 'map' ? (47.81 - y / ny * 1.98).toFixed(2) + '°N ' + (5.96 + x / nx * 4.53).toFixed(2) + '°E'   /* map view: the screen mapped onto Switzerland */
                                     : 'x ' + f(x / nx * km) + ' · z ' + f(y / nx * km) + ' km';                            /* cross-section: distance and depth */
    var li = document.createElement('li');
    li.innerHTML = '<span class="m">M ' + M.toFixed(1) + '</span><span>' + loc + '</span><span class="who' + (who === 'you' ? ' you' : '') + '">' + who + '</span>';
    var empty = list.querySelector('.empty'); if (empty) list.innerHTML = '';
    list.insertBefore(li, list.firstChild); while (list.children.length > 4) list.removeChild(list.lastChild);
  }

  /* ---------------- drawing ---------------- */
  function sx(x) { return (x + 0.5) / nx * W; } function sy(y) { return (y + 0.5) / ny * H; }
  function drawOverlay() {
    octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
    var X = sx(sta.x), Y = sy(sta.y), s = 7;
    octx.beginPath(); octx.moveTo(X - s, Y - s * 1.7); octx.lineTo(X + s, Y - s * 1.7); octx.lineTo(X, Y); octx.closePath();
    octx.fillStyle = rgba(pal.ink, 0.95); octx.shadowColor = pal.halo; octx.shadowBlur = 6; octx.fill(); octx.shadowBlur = 0;
    if (Y >= 70) { octx.font = '500 10px "JetBrains Mono", monospace'; octx.textAlign = 'center'; octx.fillStyle = rgba(pal.ink, 0.95); octx.shadowColor = pal.halo; octx.shadowBlur = 4; octx.fillText('YW01', X, Y - 17); octx.shadowBlur = 0; }
  }
  function drawTrace() {
    var w = tcv.clientWidth, h = tcv.clientHeight, d2 = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return;
    if (tcv.width !== Math.round(w * d2) || tcv.height !== Math.round(h * d2)) { tcv.width = Math.round(w * d2); tcv.height = Math.round(h * d2); }
    tctx.setTransform(d2, 0, 0, d2, 0, 0); tctx.clearRect(0, 0, w, h);
    var m = 0, k, sec = Math.round(rate);
    for (k = 0; k < TR; k++) { var a = buf[k] < 0 ? -buf[k] : buf[k]; if (a > m) m = a; }
    peak = Math.max(0.08, m, peak * 0.995);
    var n = eng.n, amp = (h / 2 - 4) / peak, clip = h / 2 - 2;
    tctx.strokeStyle = pal.tick; tctx.lineWidth = 1; tctx.beginPath();
    for (var st = n - (n % sec); st > n - TR; st -= sec) { var xt = w - (n - st) / TR * w; tctx.moveTo(xt, h - 5); tctx.lineTo(xt, h); }
    tctx.stroke();
    tctx.font = '500 9px "JetBrains Mono", monospace'; tctx.textBaseline = 'top';
    for (var q = 0; q < marks.length; q++) {
      var age = n - marks[q]; if (age > TR) continue; var xm = w - age / TR * w;
      tctx.strokeStyle = 'rgba(' + pal.origin + ',.75)'; tctx.setLineDash([3, 3]); tctx.beginPath(); tctx.moveTo(xm, 1); tctx.lineTo(xm, h - 1); tctx.stroke(); tctx.setLineDash([]);
      if (q === marks.length - 1) { tctx.fillStyle = 'rgba(' + pal.origin + ',.95)'; tctx.textAlign = 'left'; tctx.fillText('origin', xm + 4, 1); }
    }
    var stride = Math.max(1, Math.floor(TR / Math.max(1, w)));
    tctx.strokeStyle = pal.trace; tctx.lineWidth = 1.25; tctx.lineJoin = 'round'; tctx.beginPath();
    for (k = 0; k < TR; k += stride) { var v = buf[(head + k) % TR] * amp, x2 = k / (TR - 1) * w, y2 = h / 2 - Math.max(-clip, Math.min(clip, v)); if (k) tctx.lineTo(x2, y2); else tctx.moveTo(x2, y2); }
    tctx.stroke();
  }

  /* ---------------- interaction ---------------- */
  function cellOf(e) { var r = hero.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * nx - 0.5), Math.round((e.clientY - r.top) / r.height * ny - 0.5)]; }
  function onUI(t) { return !!t.closest('a,button,input,select,label,.catalog,.seis'); }
  hero.addEventListener('pointerdown', function (e) { if (onUI(e.target) || e.button > 0) return; var c = cellOf(e); lastUserT = performance.now(); quake(c[0], c[1], 'you'); });
  var lastWake = 0, lastCell = null;
  hero.addEventListener('pointermove', function (e) {                             /* the cursor leaves a faint wake */
    if (reduce || e.pointerType !== 'mouse' || onUI(e.target) || performance.now() - lastWake < 45) return;
    var c = cellOf(e); if (lastCell && Math.abs(c[0] - lastCell[0]) + Math.abs(c[1] - lastCell[1]) < 3 * (nx / 480)) return;
    lastWake = performance.now(); lastCell = c;
    if (c[0] > 2 && c[1] > 2 && c[0] < nx - 3 && c[1] < ny - 3) eng.addSource({ x: c[0], y: c[1], amp: 0.09 * Math.max(1, nx / 480), width: 1, trace: new Float32Array([1]) });
  });
  $('hint').addEventListener('click', function () { quake(Math.round(nx * (0.3 + 0.45 * Math.random())), Math.round(ny * (0.2 + 0.4 * Math.random())), 'you'); lastUserT = performance.now(); });
  revealBtn.addEventListener('click', function () { setReveal(!reveal); });
  if (modelSel) modelSel.addEventListener('change', function () { if (modelSel.value === 'layered') seed = 1 + Math.floor(Math.random() * 1e6); setPreset(modelSel.value); lastUserT = performance.now(); });

  /* ---------------- main loop ---------------- */
  var running = false, visible = true, acc = 0, lastT = 0;
  function frame(now) {
    if (!visible || document.hidden) { running = false; return; }
    var dt = lastT ? Math.min(100, now - lastT) : 16.7; lastT = now;           /* wall-clock stepping: same speed on 60 Hz and 120 Hz screens */
    acc += dt * rate / 1000; var n = Math.min(Math.ceil(rate * 0.1), Math.floor(acc)); acc -= n;
    if (n > 0) { var b = eng.step(n); for (var k = 0; k < n; k++) { buf[head] = b[2 * k]; head = (head + 1) % TR; } }
    if (!reduce && now - lastUserT > 12000 && now - lastAutoT > 9000) { lastAutoT = now; quake(Math.round(nx * (0.3 + 0.6 * Math.random())), Math.round(ny * (0.15 + 0.5 * Math.random())), 'auto', +(1.6 + Math.random() * 0.8).toFixed(1)); }
    eng.render({ gain: 1.2 }); drawOverlay(); drawTrace();
    requestAnimationFrame(frame);
  }
  function start() { if (!running) { running = true; lastT = 0; requestAnimationFrame(frame); } }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); }).observe(hero);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
  var rt; window.addEventListener('resize', function () {
    clearTimeout(rt); rt = setTimeout(function () {
      var r = hero.getBoundingClientRect();
      if (Math.abs(r.width - lastW) > 40 || Math.abs(r.height - lastH) > 120) build();   /* a real resize rebuilds the grid */
      else { W = r.width; H = r.height; ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); }
    }, 200);
  });
  document.addEventListener('themechange', function (e) { pal = WE.PAL[e.detail === 'light' ? 'light' : 'dark']; eng.setDisplay(pal, reveal); });

  build(); start();
  if (!reduce) setTimeout(function () { quake(Math.round(nx * 0.64), Math.round(ny * 0.36), 'auto', 2.9); lastAutoT = performance.now(); }, 450);
})();
