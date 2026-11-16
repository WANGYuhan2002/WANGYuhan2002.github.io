/* hero.js — the homepage wavefield and its toolbar.
   Physics: the 2-D constant-density acoustic wave equation (pressure p, P waves only), solved by WaveEngine on the GPU
   (WebGL2) where available, else on the CPU. Toolbar: acoustic point sources ("earthquakes"), low- and high-velocity
   brushes, an eraser, point scatterers, receivers (stations placed one by one, line or ring arrays; every station can be
   dragged), model presets and boundaries, and a short explanation. The six larger experiments live in ./lab/. */
(function () {
  'use strict';
  var WE = window.WaveEngine, WM = window.WaveModels;
  function $(id) { return document.getElementById(id); }
  var hero = $('hero'), glc = $('fieldgl'), cpuc = $('field'), ov = $('overlay'), octx = ov.getContext('2d');
  var tcv = $('trace'), tctx = tcv.getContext('2d'), list = $('events'), countEl = $('count');
  var seisLabel = $('seisLabel'), lab = $('lab'), pop = $('labPop');
  function mm(q) { return !!(window.matchMedia && matchMedia(q).matches); }
  var reduce = mm('(prefers-reduced-motion: reduce)'), coarse = mm('(pointer: coarse)');
  if (coarse) $('hintText').textContent = 'Tap to make an earthquake';

  /* ---------------- state ---------------- */
  var eng, model, nx, ny, rate, TR, W = 0, H = 0, lastW = 0, lastH = 0, dpr = 1, res = 1;
  var tool = 'quake', panel = null, brushR = 14, brushS = 0.2, quakeM = 3.2, quakeRandom = true;
  var arrMode = 'stations', arrN = 12, bc = 'absorb', preset = 'random', seed = 1, autoFree = false, agc = false, paused = false;   /* the velocity model is always drawn under the waves */
  var stations = [], netKind = 'single', marks = [], peak = 0.08, head = 0, total = 0, drag = null, cursor = null, cs = null, saved = null;
  var lastUserT = -1e9, lastAutoT = 0, backend = WE.gpuAvailable() ? 'gpu' : 'cpu', q = 1, watch = new WE.Watchdog();   /* q: grid scale, lowered for this visit if the device falls behind */
  var MAXSTA = 12;
  function theme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  var pal = WE.PAL[theme()];
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function clampX(x) { return Math.max(1, Math.min(nx - 2, Math.round(x))); }
  function clampY(y) { return Math.max(1, Math.min(ny - 2, Math.round(y))); }

  /* ---------------- grid, model, boundaries ---------------- */
  function snapshot() { return { m: model.serialize(), st: stations.map(function (s) { return [s.x / nx, s.y / nx, s.code]; }), kind: netKind }; }
  function build() {
    if (eng) { saved = snapshot(); eng.destroy(); }
    var r = hero.getBoundingClientRect(); W = r.width; H = r.height; lastW = W; lastH = H;
    var g = WE.gridFor(backend, 'acoustic', W, H, false, q);
    eng = WE.create({ nx: g.nx, ny: g.ny, physics: 'acoustic', backend: backend, canvasGL: glc, canvas2d: cpuc });
    if (eng.backend !== backend) backend = eng.backend;                           /* GPU failed: stay on the CPU */
    glc.style.display = eng.backend === 'gpu' ? '' : 'none'; cpuc.style.display = eng.backend === 'cpu' ? '' : 'none';
    nx = eng.nx; ny = eng.ny; rate = eng.rate; TR = Math.round(rate * 6); res = Math.max(1, nx / 480);
    model = new WM.Model(nx, ny);
    if (saved) model.load(saved.m); else model.setPreset(preset, seed);
    eng.setModel(model); setBC(bc); eng.setDisplay(pal, true);
    marks = []; peak = 0.08; head = 0;
    if (saved && saved.st.length) setStations(saved.st.map(function (p) { return { x: p[0] * nx, y: p[1] * nx, code: p[2] }; }), saved.kind);
    else oneStation();
    dpr = Math.min(2, window.devicePixelRatio || 1); ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr);
    hero.dataset.solver = eng.backend + ' ' + nx + 'x' + ny;
  }
  function setBC(b) {
    bc = b;
    eng.setBoundary(b === 'box' ? { top: false, bottom: false, left: false, right: false } : (b === 'free' ? { top: false, bottom: true, left: true, right: true } : { top: true, bottom: true, left: true, right: true }), 0.5);
  }
  function setPreset(p) { preset = p; model.setPreset(p, seed); eng.setModel(model); }
  /* cross-sections get a free surface on top; map views go back to absorbing edges */
  function choosePreset(p) {
    setPreset(p);
    if (model.view() === 'section') { if (bc === 'absorb') { setBC('free'); autoFree = true; } }
    else if (autoFree && bc === 'free') { setBC('absorb'); autoFree = false; }
    if (panel === 'model') openPanel('model');
  }

  /* ---------------- receivers ---------------- */
  function setStations(arr, kind) {
    netKind = kind;
    stations = arr.map(function (s) { return { x: clampX(s.x), y: clampY(s.y), code: s.code, buf: new Float32Array(TR) }; });
    probes(); peak = 0.08; updateSeisLabel();
    /* the seismogram strip keeps one height whatever the number of stations, so adding a station never pushes the page up;
       several stations share it as a record section (at most SHOWN traces: every k-th one for a larger array) */
    var h = seisH();
    tcv.style.height = h + 'px'; hero.style.setProperty('--seis-h', (h + 60) + 'px');
    tcv.parentNode.classList.toggle('many', stations.length > 1);
    if (panel === 'array') updateCounts();
  }
  function probes() { eng.setProbes(stations.map(function (s) { return [s.x, s.y]; })); }
  function oneStation() { var m = W < 700; setStations([{ x: nx * (m ? 0.76 : 0.78), y: ny * (m ? 0.34 : 0.56), code: 'YW01' }], 'single'); }
  function nextCode() { for (var k = 1; k <= 99; k++) { var c = 'YW' + (k < 10 ? '0' : '') + k; if (!stations.some(function (s) { return s.code === c; })) return c; } return 'YW'; }
  function addStation(c) {
    var keep = netKind === 'single' || netKind === 'stations';
    if (keep && stations.length >= MAXSTA) { flashHint('Up to ' + MAXSTA + ' stations: drag one, or double-click to remove it'); return; }
    var arr = keep ? stations.map(function (s) { return { x: s.x, y: s.y, code: s.code }; }) : [];
    if (!keep) stations = [];
    arr.push({ x: c[0], y: c[1], code: nextCode() });
    var bufs = keep ? stations.map(function (s) { return s.buf; }) : [];
    setStations(arr, 'stations');
    for (var k = 0; k < bufs.length; k++) stations[k].buf = bufs[k];               /* existing records survive */
  }
  function removeStation(k) {
    if (stations.length <= 1) return;
    var arr = stations.filter(function (s, i) { return i !== k; }), bufs = arr.map(function (s) { return s.buf; });
    setStations(arr.map(function (s) { return { x: s.x, y: s.y, code: s.code }; }), arr.length === 1 && arr[0].code === 'YW01' ? 'single' : netKind);
    for (var i = 0; i < bufs.length; i++) stations[i].buf = bufs[i];
  }
  var SHOWN = 12;
  function seisH() { return W <= 640 ? 92 : 108; }                                  /* fixed strip height (CSS px), as in the page CSS */
  function traceStep() { return Math.max(1, Math.ceil(stations.length / SHOWN)); }   /* 1, or 2 for 13–24 stations */
  function updateSeisLabel() {
    var n = stations.length, s = netKind === 'line' ? 'Line array · ' + n + ' stations' : (netKind === 'ring' ? 'Ring array · ' + n + ' stations' : (n === 1 ? 'Station ' + stations[0].code : n + ' stations')), k = traceStep();
    seisLabel.textContent = s + (k > 1 ? ' (every ' + (k === 2 ? '2nd' : k + 'th') + ' shown)' : '') + ' · pressure' + (agc ? ' · AGC 0.5 s' : '');
  }
  function arrayPositions(d) {
    var out = [], n = arrN, k;
    if (arrMode === 'line') { for (k = 0; k < n; k++) { var f = n > 1 ? k / (n - 1) : 0; out.push([d.x0 + (d.x1 - d.x0) * f, d.y0 + (d.y1 - d.y0) * f]); } }
    else { var r = Math.hypot(d.x1 - d.x0, d.y1 - d.y0); for (k = 0; k < n; k++) { var an = -Math.PI / 2 + 2 * Math.PI * k / n; out.push([d.x0 + r * Math.cos(an), d.y0 + r * Math.sin(an)]); } }
    return out.map(function (p) { return [clampX(p[0]), clampY(p[1])]; });
  }

  /* ---------------- sources and the catalogue ---------------- */
  function quake(x, y, who, mag) {
    x = Math.max(3, Math.min(nx - 4, x)); y = Math.max(3, Math.min(ny - 4, y));
    var M = mag || +(2.2 + Math.random() * 2.4).toFixed(1);
    eng.addSource({ x: x, y: y, amp: Math.pow(10, 0.35 * (M - 3)) });            /* an acoustic point source; M only scales the amplitude */
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

  /* ---------------- structure: brushes and scatterers ---------------- */
  function stamp(c) {
    var T = tool === 'slow' ? 1 - brushS : (tool === 'fast' ? 1 + brushS : 1);
    eng.setModel(model, model.stamp(c[0], c[1], brushR * res, T));
  }
  function paintTo(c) {
    var d = Math.hypot(c[0] - drag.last[0], c[1] - drag.last[1]), stp = Math.max(1, brushR * res / 4);
    if (d < stp) return;
    var n = Math.ceil(d / stp);
    for (var k = 1; k <= n; k++) stamp([Math.round(drag.last[0] + (c[0] - drag.last[0]) * k / n), Math.round(drag.last[1] + (c[1] - drag.last[1]) * k / n)]);
    drag.last = c;
  }
  function scatterAt(c) { if (model.addScatter(c[0], c[1])) eng.setModel(model, [c[0] - 4, c[1] - 4, c[0] + 4, c[1] + 4]); }
  function sprinkle(n) {
    var m = eng.B, tries = 0;
    while (n > 0 && tries < 3000) { tries++; if (model.addScatter(Math.round(m + Math.random() * (nx - 2 * m)), Math.round(m + Math.random() * (ny - 2 * m)))) n--; }
    eng.setModel(model);
  }
  function clearWaves() { eng.clear(); marks = []; peak = 0.08; stations.forEach(function (s) { s.buf.fill(0); }); }

  /* ---------------- drawing ---------------- */
  function sx(x) { return (x + 0.5) / nx * W; } function sy(y) { return (y + 0.5) / ny * H; }
  /* stations: a crisp halo outline under the fill (no blurred shadow) */
  function tri(x, y, s, alpha, col) {
    octx.beginPath(); octx.moveTo(x - s, y - s * 1.7); octx.lineTo(x + s, y - s * 1.7); octx.lineTo(x, y); octx.closePath();
    octx.lineJoin = 'round'; octx.lineWidth = 1.5; octx.strokeStyle = pal.halo; octx.globalAlpha = alpha; octx.stroke(); octx.globalAlpha = 1;
    octx.fillStyle = rgba(col || pal.ink, alpha); octx.fill();
  }
  function drawOverlay() {
    octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
    var sc = model.scat, rs = Math.max(2.4, 1.6 * res / nx * W), k;
    for (k = 0; k < sc.length; k++) { octx.beginPath(); octx.arc(sx(sc[k][0]), sy(sc[k][1]), rs, 0, 6.2832); octx.fillStyle = rgba(pal.ink, 0.9); octx.fill(); octx.lineWidth = 1; octx.strokeStyle = rgba(pal.edge || pal.ink, 0.6); octx.stroke(); }
    var many = stations.length > 1, arrays = netKind === 'line' || netKind === 'ring', s0 = many ? 5 : 6.5;
    octx.font = '600 10.5px "JetBrains Mono", monospace'; octx.textAlign = 'center'; octx.lineJoin = 'round'; octx.miterLimit = 2;
    for (k = 0; k < stations.length; k++) {
      var st = stations[k], X = sx(st.x), Y = Math.max(13, sy(st.y)), active = drag && drag.kind === 'station' && drag.k === k;
      tri(X, Y, active ? s0 * 1.3 : s0, active ? 1 : 0.96, active ? pal.pos : null);
      if ((!arrays || k === 0 || k === stations.length - 1) && Y >= 70) {
        var ly = Y - (many ? 13 : 17); octx.lineWidth = 3; octx.strokeStyle = pal.halo; octx.strokeText(st.code, X, ly);
        octx.fillStyle = rgba(pal.ink, 0.96); octx.fillText(st.code, X, ly);
      }
    }
    if (drag && drag.kind === 'array') {
      var pts = arrayPositions(drag);
      octx.setLineDash([3, 4]); octx.lineWidth = 1.25; octx.strokeStyle = rgba(pal.pos, 0.85); octx.beginPath();
      if (arrMode === 'line') { octx.moveTo(sx(drag.x0), sy(drag.y0)); octx.lineTo(sx(drag.x1), sy(drag.y1)); }
      else { octx.arc(sx(drag.x0), sy(drag.y0), Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) / nx * W, 0, 6.2832); }
      octx.stroke(); octx.setLineDash([]);
      for (k = 0; k < pts.length; k++) tri(sx(pts[k][0]), sy(pts[k][1]), 5, 0.6);
    }
    if (cursor && !coarse && (tool === 'slow' || tool === 'fast' || tool === 'erase')) {
      octx.beginPath(); octx.arc(sx(cursor[0]), sy(cursor[1]), brushR * res / nx * W, 0, 6.2832);
      octx.setLineDash([3, 4]); octx.lineWidth = 1.25; octx.strokeStyle = tool === 'slow' ? rgba(pal.slow, 1) : (tool === 'fast' ? rgba(pal.fast, 1) : rgba(pal.ink, 0.8)); octx.stroke(); octx.setLineDash([]);
    }
  }
  /* seismograms: one trace, or a record section with variable-area wiggles; one common gain (relative amplitudes
     are kept) or a 0.5-s sliding-RMS gain per trace (AGC) */
  function drawTrace() {
    var w = tcv.clientWidth, h = tcv.clientHeight, d2 = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return;
    if (tcv.width !== Math.round(w * d2) || tcv.height !== Math.round(h * d2)) { tcv.width = Math.round(w * d2); tcv.height = Math.round(h * d2); }
    tctx.setTransform(d2, 0, 0, d2, 0, 0); tctx.clearRect(0, 0, w, h);
    var n = stations.length, many = n > 1, m = 0, s, k, step = eng.n;
    for (s = 0; s < n; s++) { var bf = stations[s].buf; for (k = 0; k < TR; k++) { var a = bf[k] < 0 ? -bf[k] : bf[k]; if (a > m) m = a; } }
    peak = Math.max(0.08, m, peak * 0.995);
    var ks = traceStep(), rows = Math.ceil(n / ks);                                /* traces drawn: every ks-th station */
    var left = many ? 42 : 0, top = many ? 4 : 2, bot = many ? 4 : 2, ww = w - left, sp = (h - top - bot) / rows;
    var amp = (many ? 0.95 * sp : (h / 2 - 4)) / peak, clip = many ? 1.4 * sp : h / 2 - 2, sec = Math.round(rate), st, xt;
    tctx.lineWidth = 1; tctx.strokeStyle = pal.grid; tctx.beginPath();            /* a grid line every second, and short ticks at the bottom */
    for (st = step - (step % sec); st > step - TR; st -= sec) { xt = Math.round(left + ww - (step - st) / TR * ww) + 0.5; tctx.moveTo(xt, 0); tctx.lineTo(xt, h - 5); }
    tctx.stroke(); tctx.strokeStyle = pal.tick; tctx.beginPath();
    for (st = step - (step % sec); st > step - TR; st -= sec) { xt = Math.round(left + ww - (step - st) / TR * ww) + 0.5; tctx.moveTo(xt, h - 5); tctx.lineTo(xt, h); }
    tctx.stroke();
    if (!many) { tctx.strokeStyle = pal.grid; tctx.beginPath(); tctx.moveTo(0, Math.round(h / 2) + 0.5); tctx.lineTo(w, Math.round(h / 2) + 0.5); tctx.stroke(); }
    tctx.font = '500 10px "JetBrains Mono", monospace'; tctx.textBaseline = 'top';
    for (var qq = 0; qq < marks.length; qq++) {
      var age = step - marks[qq]; if (age > TR) continue; var xm = left + ww - age / TR * ww;
      tctx.strokeStyle = 'rgba(' + pal.origin + ',.8)'; tctx.setLineDash([2, 3]); tctx.beginPath(); tctx.moveTo(xm, 1); tctx.lineTo(xm, h - 1); tctx.stroke(); tctx.setLineDash([]);
      if (qq === marks.length - 1) { tctx.fillStyle = 'rgba(' + pal.origin + ',.95)'; tctx.textAlign = 'left'; tctx.fillText('origin', xm + 4, 1); }
    }
    var stride = Math.max(1, Math.floor(TR / Math.max(1, ww)));
    var half = Math.round(rate * 0.25), floor = 0.02 * peak, lvl = many ? 0.45 * sp : 0.35 * h;
    if (agc && (!cs || cs.length !== TR + 1)) cs = new Float64Array(TR + 1);
    for (s = 0; s < n; s += ks) {
      var row = s / ks, y0 = many ? top + sp * (row + 0.5) : h / 2, buf = stations[s].buf, x2, y2, v;
      if (agc) { for (k = 0; k < TR; k++) { var o = buf[(head + k) % TR]; cs[k + 1] = cs[k] + o * o; } }
      var gain = function (k) { if (!agc) return amp; var lo = Math.max(0, k - half), hi = Math.min(TR, k + half), r = Math.sqrt((cs[hi] - cs[lo]) / (hi - lo)); return lvl / Math.max(r, floor); };
      if (many && (sp >= 11 || row % 2 === 0)) { tctx.font = '500 10px "JetBrains Mono", monospace'; tctx.fillStyle = pal.label; tctx.textAlign = 'left'; tctx.textBaseline = 'middle'; tctx.fillText(stations[s].code, 0, y0); tctx.textBaseline = 'top'; }
      tctx.beginPath(); tctx.moveTo(left, y0);                                     /* variable-area fill of the positive half, also for one trace */
      for (k = 0; k < TR; k += stride) { v = buf[(head + k) % TR] * gain(k); x2 = left + k / (TR - 1) * ww; tctx.lineTo(x2, y0 - Math.max(0, Math.min(clip, v))); }
      tctx.lineTo(left + ww, y0); tctx.closePath(); tctx.fillStyle = pal.fill; if (!many) tctx.globalAlpha = 0.7; tctx.fill(); tctx.globalAlpha = 1;
      tctx.strokeStyle = pal.trace; tctx.lineWidth = many ? 1 : 1.6; tctx.lineJoin = 'round'; tctx.beginPath();
      for (k = 0; k < TR; k += stride) { v = buf[(head + k) % TR] * gain(k); x2 = left + k / (TR - 1) * ww; y2 = y0 - Math.max(-clip, Math.min(clip, v)); if (k) tctx.lineTo(x2, y2); else tctx.moveTo(x2, y2); }
      tctx.stroke();
    }
  }

  /* ---------------- pointer interaction ---------------- */
  function cellOf(e) { var r = hero.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * nx - 0.5), Math.round((e.clientY - r.top) / r.height * ny - 0.5)]; }
  function onUI(t) { return !!t.closest('a,button,input,select,label,.catalog,.seis,.lab,.lab-pop'); }
  function hitStation(e) {
    var r = hero.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = -1, bd = coarse ? 22 : 13;
    for (var k = 0; k < stations.length; k++) { var d = Math.hypot(sx(stations[k].x) - mx, Math.max(13, sy(stations[k].y)) - 7 - my); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  function capture(e) { try { hero.setPointerCapture(e.pointerId); } catch (_) {} }
  var hintT = 0;
  function flashHint(s) { var ht = $('hintText'), old = ht.dataset.base || ht.textContent; ht.dataset.base = old; ht.textContent = s; clearTimeout(hintT); hintT = setTimeout(function () { ht.textContent = old; }, 2600); }
  hero.addEventListener('pointerdown', function (e) {
    if (onUI(e.target) || e.button > 0) return;
    var c = cellOf(e), k = hitStation(e); lastUserT = performance.now();
    if (k >= 0 && tool !== 'slow' && tool !== 'fast' && tool !== 'erase' && tool !== 'scatter') { capture(e); drag = { kind: 'station', k: k }; return; }   /* stations can always be moved */
    if (tool === 'quake') { quake(c[0], c[1], 'you', quakeRandom ? null : quakeM); return; }
    capture(e);
    if (tool === 'slow' || tool === 'fast' || tool === 'erase') { drag = { kind: 'paint', last: c }; stamp(c); }
    else if (tool === 'scatter') { scatterAt(c); drag = { kind: 'scatter', last: c }; updateCounts(); }
    else if (tool === 'array') { if (arrMode === 'stations') addStation(c); else drag = { kind: 'array', x0: c[0], y0: c[1], x1: c[0], y1: c[1] }; }
  });
  hero.addEventListener('dblclick', function (e) { if (onUI(e.target)) return; var k = hitStation(e); if (k >= 0) removeStation(k); });
  var lastWake = 0, lastCell = null;
  hero.addEventListener('pointermove', function (e) {
    var c = cellOf(e); cursor = c;
    if (drag) {
      if (drag.kind === 'station') { var s = stations[drag.k]; s.x = clampX(c[0]); s.y = clampY(c[1]); probes(); }
      else if (drag.kind === 'paint') paintTo(c);
      else if (drag.kind === 'scatter') { if (Math.hypot(c[0] - drag.last[0], c[1] - drag.last[1]) >= 7 * res) { scatterAt(c); drag.last = c; updateCounts(); } }
      else if (drag.kind === 'array') { drag.x1 = c[0]; drag.y1 = c[1]; }
      return;
    }
    if (onUI(e.target)) { hero.style.cursor = ''; return; }
    hero.style.cursor = hitStation(e) >= 0 && tool !== 'slow' && tool !== 'fast' && tool !== 'erase' && tool !== 'scatter' ? 'grab' : '';
    if (tool !== 'quake' || reduce || e.pointerType !== 'mouse' || performance.now() - lastWake < 45) return;   /* the cursor leaves a faint wake */
    if (lastCell && Math.abs(c[0] - lastCell[0]) + Math.abs(c[1] - lastCell[1]) < 3 * res) return;
    lastWake = performance.now(); lastCell = c;
    if (c[0] > 2 && c[1] > 2 && c[0] < nx - 3 && c[1] < ny - 3) eng.addSource({ x: c[0], y: c[1], amp: 0.09 * res, width: 1, trace: new Float32Array([1]) });
  });
  function endDrag() {
    if (drag && drag.kind === 'array' && Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) >= 6) {
      var pre = arrMode === 'line' ? 'L' : 'R';
      setStations(arrayPositions(drag).map(function (p, k) { return { x: p[0], y: p[1], code: pre + (k < 9 ? '0' : '') + (k + 1) }; }), arrMode);
    }
    drag = null;
  }
  hero.addEventListener('pointerup', endDrag); hero.addEventListener('pointercancel', endDrag);
  hero.addEventListener('pointerleave', function () { cursor = null; });
  $('hint').addEventListener('click', function () { selectTool('quake', true); quake(Math.round(nx * (0.3 + 0.45 * Math.random())), Math.round(ny * (0.2 + 0.4 * Math.random())), 'you', quakeRandom ? null : quakeM); lastUserT = performance.now(); });

  /* ---------------- toolbar & option panels ---------------- */
  var TITLES = { quake: 'Acoustic source', slow: 'Low-velocity body', fast: 'High-velocity body', erase: 'Erase structure', scatter: 'Point scatterers', array: 'Receivers', model: 'Model & boundaries', info: 'What is this wavefield?' };
  function rng(id, label, min, max, st, val, out) { return '<div class="pop-row"><label for="' + id + '">' + label + '</label><output id="' + id + 'o">' + out + '</output></div><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + st + '" value="' + val + '">'; }
  function segBtn(attr, val, label, on) { return '<button type="button" data-' + attr + '="' + val + '" aria-pressed="' + on + '">' + label + '</button>'; }
  function cells(r) { return Math.round(r * res) + ' cells'; }
  function panelHTML(name) {
    var h = '<div class="pop-top"><p class="pop-h">' + TITLES[name] + '</p><button class="pop-x" type="button" aria-label="Close panel">×</button></div>';
    if (name === 'quake') h += '<p class="pop-hint">Click anywhere on the wavefield to fire an <b>acoustic point source</b>: a pressure pulse with a Ricker time function (peak frequency ≈ ' + eng.fHz.toFixed(0) + ' Hz). It sends out P waves only. The magnitude only scales its amplitude.</p>' +
      rng('pM', 'Magnitude', 1.5, 5, 0.1, quakeM, quakeRandom ? 'random' : 'M ' + quakeM.toFixed(1)) + '<label class="chk"><input type="checkbox" id="pMr"' + (quakeRandom ? ' checked' : '') + '> random magnitude</label>';
    else if (name === 'slow' || name === 'fast') h += '<p class="pop-hint">Drag to paint. Inside the brush the velocity becomes <b>' + (name === 'slow' ? '1 − strength' : '1 + strength') + '</b> (background = 1), with a soft edge.</p>' +
      rng('pR', 'Radius', 4, 40, 1, brushR, cells(brushR)) + rng('pS', 'Strength', 5, name === 'fast' ? 38 : 50, 1, Math.round(brushS * 100), (name === 'slow' ? '−' : '+') + Math.round(brushS * 100) + ' %');
    else if (name === 'erase') h += '<p class="pop-hint">Drag to restore the background velocity (v = 1).</p>' + rng('pR', 'Radius', 4, 40, 1, brushR, cells(brushR));
    else if (name === 'scatter') h += '<p class="pop-hint">Click or drag to drop point scatterers: small inclusions at 35 % of the background velocity. Each one re-radiates the passing wavefield, and many of them build up a coda.</p><div class="pop-row"><span>Scatterers</span><output id="pScn">' + model.scat.length + '</output></div><div class="btns"><button class="pbtn" type="button" id="pSpr">Sprinkle 30</button><button class="pbtn" type="button" id="pScl">Clear all</button></div>';
    else if (name === 'array') h += '<p class="pop-hint">Receivers record the pressure p(t) in the strip below. <b>Drag</b> any station to move it' + (coarse ? '' : ', <b>double-click</b> one to remove it') + '.</p>' +
      '<div class="seg" role="group" aria-label="Receiver layout">' + segBtn('arr', 'stations', 'Stations', arrMode === 'stations') + segBtn('arr', 'line', 'Line', arrMode === 'line') + segBtn('arr', 'ring', 'Ring', arrMode === 'ring') + '</div>' +
      '<p class="pop-hint" style="margin:.5rem 0 0">' + ({ stations: (coarse ? 'Tap' : 'Click') + ' on the wavefield to add a station (up to ' + MAXSTA + '). <output id="pStn">' + stations.length + '</output> placed.', line: 'Drag from the first to the last station.', ring: 'Drag from the centre of the ring outwards.' })[arrMode] + '</p>' +
      (arrMode !== 'stations' ? rng('pN', 'Stations in the array', 4, 24, 1, arrN, arrN) : '') +
      '<p class="pop-hint" style="margin:.8rem 0 .1rem">Seismogram display</p><div class="seg" role="group" aria-label="Seismogram gain">' + segBtn('agc', '0', 'True amplitude', !agc) + segBtn('agc', '1', 'AGC 0.5 s', agc) + '</div>' +
      '<div class="btns"><button class="pbtn" type="button" id="pAtop" title="A line array 6 cells below the top edge">Along the top edge</button><button class="pbtn" type="button" id="pAcl">Back to one station</button></div>';
    else if (name === 'model') h += '<p class="pop-hint" style="margin-bottom:.1rem">Map view · starting model (resets painted bodies)</p><div class="grid2" role="group" aria-label="Map-view models">' + pbtn('random', 'Random blobs') + pbtn('homogeneous', 'Uniform') + '</div>' +
      '<p class="pop-hint" style="margin:.7rem 0 .1rem">Cross-sections · the top edge is the Earth\'s surface</p><div class="grid2" role="group" aria-label="Cross-section models">' + pbtn('layered', 'Folded &amp; faulted layers') + pbtn('basin', 'Sedimentary basin') + pbtn('slab', 'Subduction zone') + pbtn('salt', 'Salt dome') + '</div>' +
      '<div class="btns" style="margin-top:.45rem"><button class="pbtn" type="button" id="pReroll" title="Another random folded, faulted layering">New random layering</button></div>' +
      '<p class="pop-hint" style="margin:.8rem 0 .2rem">Boundaries</p>' +
      '<label class="radio"><input type="radio" name="pbc" value="absorb"' + (bc === 'absorb' ? ' checked' : '') + '><span>Absorbing on all sides<small>a damping layer: waves leave the screen</small></span></label>' +
      '<label class="radio"><input type="radio" name="pbc" value="free"' + (bc === 'free' ? ' checked' : '') + '><span>Free surface on top<small>p = 0 at the top edge: reflects with reversed polarity</small></span></label>' +
      '<label class="radio"><input type="radio" name="pbc" value="box"' + (bc === 'box' ? ' checked' : '') + '><span>Reflecting box<small>p = 0 on all edges, no damping layer</small></span></label>' +
      '<div class="btns"><button class="pbtn" type="button" id="pPause">' + (paused ? 'Resume' : 'Pause') + '</button><button class="pbtn" type="button" id="pClear">Clear waves</button></div>' +
      '<p class="pop-more">More models, arrays, fibre-optic cables, time reversal, tomography and elastic waves: <a href="lab/">the Wave Lab →</a></p>';
    else if (name === 'info') h += '<div class="pop-info">' +
      '<p><b>Equation.</b> The 2-D constant-density acoustic wave equation <code>∂²p/∂t² = c(x, z)² ∇²p</code>. p is pressure, so only P waves exist here: no S or surface waves (those are in the Wave Lab\'s elastic experiment). Cyan is compression (p &gt; 0), coral is rarefaction (p &lt; 0).</p>' +
      '<p><b>Velocity model.</b> Always drawn under the waves: red is slower than the background velocity (v &lt; 1), blue is faster, and thin lines mark sharp interfaces. Recovering this structure from recorded waves is what <b>seismic tomography</b> does.</p>' +
      '<p><b>Source.</b> Each click adds an acoustic point source to the pressure field: a Ricker wavelet (the second derivative of a Gaussian) with a peak frequency of ' + eng.fHz.toFixed(1) + ' Hz, spread over a 5 × 5-cell Gaussian footprint. The magnitude only scales its amplitude.</p>' +
      '<p><b>Receivers.</b> Each station samples p(t) at its position every time step (bilinear interpolation); the strip below shows the last 6 s. Place stations one by one, or as a line or ring array.</p>' +
      '<p><b>Numerics.</b> Second-order finite differences (leapfrog in time, 5-point Laplacian) on a ' + nx + ' × ' + ny + ' grid, computed live ' + (eng.backend === 'gpu' ? 'on your GPU (WebGL2, 32-bit float textures)' : 'on your CPU') + '. Courant number c·Δt/Δx ≤ 0.69 &lt; 1/√2, about ' + Math.round(eng.ppw) + ' grid points per dominant wavelength.</p>' +
      '<p><b>Boundaries.</b> The outermost grid line holds p = 0 (Dirichlet). Absorbing edges add a ' + eng.B + '-cell layer in which the equation gains a damping term σ(x)·∂p/∂t that ramps up quadratically, so outgoing waves fade instead of bouncing back (measured reflection: 0.3 % at normal, 0.7 % at 45° incidence). A free surface removes the layer on top: pressure vanishes there and waves reflect with reversed polarity, which is why "Along the top edge" puts receivers 6 cells below it. A reflecting box removes the layer everywhere. A weak uniform attenuation e<sup>−0.5 t</sup> lets the field calm down.</p>' +
      '<p><b>Not physical:</b> magnitudes only scale the source amplitude, and coordinates are a cosmetic mapping of the screen onto Switzerland.</p></div>' +
      '<p class="pop-more">Six bigger experiments on the same solver: <a href="lab/">the Wave Lab →</a></p>';
    return h;
  }
  function pbtn(p, label) { return '<button type="button" data-pre="' + p + '" aria-pressed="' + (preset === p) + '">' + label + '</button>'; }
  function wire() {
    pop.querySelector('.pop-x').onclick = closePanel;
    var el;
    if ((el = $('pM'))) el.oninput = function () { quakeM = +el.value; quakeRandom = false; $('pMr').checked = false; $('pMo').textContent = 'M ' + quakeM.toFixed(1); };
    if ((el = $('pMr'))) el.onchange = function () { quakeRandom = this.checked; $('pMo').textContent = quakeRandom ? 'random' : 'M ' + quakeM.toFixed(1); };
    if ((el = $('pR'))) el.oninput = function () { brushR = +this.value; $('pRo').textContent = cells(brushR); };
    if ((el = $('pS'))) el.oninput = function () { brushS = this.value / 100; $('pSo').textContent = (tool === 'slow' ? '−' : '+') + this.value + ' %'; };
    if ((el = $('pN'))) el.oninput = function () { arrN = +this.value; $('pNo').textContent = arrN; };
    if ((el = $('pSpr'))) el.onclick = function () { sprinkle(30); updateCounts(); };
    if ((el = $('pScl'))) el.onclick = function () { model.clearScatter(); eng.setModel(model); updateCounts(); };
    if ((el = $('pAtop'))) el.onclick = function () {
      var y = 6 * res, m = arrMode; arrMode = 'line'; var pts = arrayPositions({ x0: nx * 0.06, y0: y, x1: nx * 0.94, y1: y }); arrMode = m;
      setStations(pts.map(function (p, k) { return { x: p[0], y: p[1], code: 'L' + (k < 9 ? '0' : '') + (k + 1) }; }), 'line');
    };
    if ((el = $('pAcl'))) el.onclick = oneStation;
    pop.querySelectorAll('[data-agc]').forEach(function (b) { b.onclick = function () { agc = b.dataset.agc === '1'; pop.querySelectorAll('[data-agc]').forEach(function (o) { o.setAttribute('aria-pressed', o === b); }); updateSeisLabel(); }; });
    pop.querySelectorAll('[data-arr]').forEach(function (b) { b.onclick = function () { arrMode = b.dataset.arr; openPanel('array'); }; });
    pop.querySelectorAll('[data-pre]').forEach(function (b) { b.onclick = function () { choosePreset(b.dataset.pre); }; });
    if ((el = $('pReroll'))) el.onclick = function () { seed = 2 + Math.floor(Math.random() * 1e6); choosePreset('layered'); };
    pop.querySelectorAll('input[name="pbc"]').forEach(function (r) { r.onchange = function () { setBC(r.value); autoFree = false; }; });
    if ((el = $('pPause'))) el.onclick = function () { paused = !paused; this.textContent = paused ? 'Resume' : 'Pause'; };
    if ((el = $('pClear'))) el.onclick = clearWaves;
  }
  function updateCounts() { var o = $('pScn'); if (o) o.textContent = model.scat.length; var s = $('pStn'); if (s) s.textContent = stations.length; }
  function openPanel(name) {
    panel = name; pop.innerHTML = panelHTML(name); pop.classList.toggle('wide', name === 'info'); pop.hidden = false; wire();
    lab.querySelectorAll('[data-panel]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.panel === name); });
  }
  function closePanel() { panel = null; pop.hidden = true; lab.querySelectorAll('[data-panel]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); }); }
  function selectTool(t, silent) {
    var same = tool === t; tool = t;
    lab.querySelectorAll('[data-tool]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tool === t); });
    hero.classList.toggle('editing', t !== 'quake');
    if (silent) return;
    if (same && panel === t) closePanel(); else openPanel(t);
  }
  lab.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tool) selectTool(b.dataset.tool);
    else if (b.dataset.panel) { if (panel === b.dataset.panel) closePanel(); else openPanel(b.dataset.panel); }
  });
  var KEYS = { q: 'quake', s: 'slow', f: 'fast', e: 'erase', c: 'scatter', a: 'array' };
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (hero.getBoundingClientRect().bottom < 80) return;                     /* only while the hero is on screen */
    var k = e.key.toLowerCase();
    if (KEYS[k]) selectTool(KEYS[k]);
    else if (k === 'm' || k === 'i') { var p = k === 'm' ? 'model' : 'info'; if (panel === p) closePanel(); else openPanel(p); }
    else if (k === 'p') { paused = !paused; var pb = $('pPause'); if (pb) pb.textContent = paused ? 'Resume' : 'Pause'; }
    else if (k === 'escape') closePanel();
  });

  /* ---------------- main loop ---------------- */
  var running = false, visible = true, acc = 0, lastT = 0;
  function frame(now) {
    if (!visible || document.hidden) { running = false; return; }
    var dt = lastT ? Math.min(100, now - lastT) : 16.7; lastT = now;           /* wall-clock stepping: same speed on 60 Hz and 120 Hz screens */
    var want = paused ? 0 : dt * rate / 1000, n = 0, solverMs = 0;
    if (!paused) { acc += want; n = Math.min(Math.ceil(rate * 0.1), Math.floor(acc)); acc -= n; }
    if (n > 0) {
      var t0 = performance.now(), b = eng.step(n), nP = stations.length; solverMs = performance.now() - t0;
      for (var s = 0; s < n; s++) { for (var k = 0; k < nP; k++) stations[k].buf[head] = b[(s * nP + k) * 2]; head = (head + 1) % TR; }
    }
    if (watch.frame(now, want, n, paused, solverMs) && q > 0.5 + 1e-6) {           /* falling behind real time: one notch coarser */
      q = Math.max(0.5, +(q * 0.75).toFixed(3));
      build(); if (panel) openPanel(panel); requestAnimationFrame(frame); return;
    }
    if (!reduce && !paused && tool === 'quake' && !drag && now - lastUserT > 12000 && now - lastAutoT > 9000) { lastAutoT = now; quake(Math.round(nx * (0.3 + 0.6 * Math.random())), Math.round(ny * (0.15 + 0.5 * Math.random())), 'auto', +(1.6 + Math.random() * 0.8).toFixed(1)); }
    eng.render({ gain: 1.2 }); drawOverlay(); drawTrace();
    requestAnimationFrame(frame);
  }
  function start() { if (!running) { running = true; lastT = 0; watch.t0 = 0; requestAnimationFrame(frame); } }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); }).observe(hero);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
  var rt; window.addEventListener('resize', function () {
    clearTimeout(rt); rt = setTimeout(function () {
      var r = hero.getBoundingClientRect();
      if (Math.abs(r.width - lastW) > 40 || Math.abs(r.height - lastH) > 120) { build(); if (panel) openPanel(panel); }   /* a real resize rebuilds the grid; the scene is kept */
      else { W = r.width; H = r.height; ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); }
    }, 200);
  });
  document.addEventListener('themechange', function (e) { pal = WE.PAL[e.detail === 'light' ? 'light' : 'dark']; eng.setDisplay(pal, true); });

  build(); start();
  if (!reduce) setTimeout(function () { quake(Math.round(nx * 0.64), Math.round(ny * 0.36), 'auto', 2.9); lastAutoT = performance.now(); }, 450);
})();
