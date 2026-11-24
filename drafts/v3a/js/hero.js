/* v3a · FIBRE · hero
   The Kefalonia–Ithaca cable in 3-D (three.js) and its DAS waterfall (2-D canvas), driven by one simulation.
   Real: the channel layout and its numbers (window.YW_CABLE). The route is approximate.
   Synthetic: the terrain, every earthquake, the traffic and the ocean waves. Wave speeds are slowed down and
   traffic is sped up so that the eye can follow both.
   The simulation, the waterfall and the quake button run from the first moment. The scene attaches when it is
   ready: the 3-D view when three.js and WebGL are there, otherwise a 2-D map; a three.js that arrives late still
   replaces the map. */
(function () {
  'use strict';
  var C = window.YW_CABLE, hero = document.getElementById('hero');
  if (!C || !hero) return;
  var $ = function (id) { return document.getElementById(id); };
  var sceneCv = $('scene'), wfCv = $('wf'), labelsEl = $('labels'), linkSvg = $('link'), wfPanel = $('wfPanel'), wfWrap = $('wfWrap');
  var evCountEl = $('evCount'), wfCursor = $('wfCursor'), wfTip = $('wfTip'), wfPulse = $('wfPulse'), tagEl = $('evTag'), quakeBtn = $('quakeBtn');
  var copyEl = hero.querySelector('.hero-copy');
  var reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ------------------------------------------------------------------ geometry */
  var N = C.channels;
  var LON0 = 20.601, LAT0 = 38.445, KY = 111.195, KX = KY * Math.cos(LAT0 * Math.PI / 180);
  var LAND_H = 1.15, SEA_D = 0.62;            // schematic relief, km (exaggerated)
  var VP = 1.9, VS = 1.1;                      // display speeds, km per second of screen time
  var FP = 2.0, FS = 1.15;                     // wavelet frequencies, Hz of screen time
  var ROW_HZ = 30, ROW_DT = 1 / ROW_HZ, WF_ROWS = 300, MAXEV = 6;

  function hash(i, j) { var s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, y) {
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function fbm(x, y) { var s = 0, a = 0.5, f = 1; for (var o = 0; o < 4; o++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
  function cr(p0, p1, p2, p3, t) { var t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
  /* schematic coasts, [north km, east km]: Kefalonia's east coast and Ithaca's west coast, drawn to pass the cable's landings */
  var CW = [[-6, 1.2], [-4.5, 0.3], [-3.5, -0.2], [-2.6, -0.6], [-2.0, -0.85], [-1.2, -1.25], [-0.75, -1.55], [-0.5, -1.84], [-0.3, -1.62], [0, -1.52], [0.5, -1.47], [1.0, -1.40], [1.5, -1.30], [2.0, -1.32], [2.4, -1.50], [2.8, -2.1], [3.2, -3.2], [3.6, -4.8], [4.0, -7], [5, -12], [7, -20]];
  var CE = [[-6, 3.5], [-4.5, 3.4], [-3, 3.3], [-2, 3.25], [-1.2, 3.32], [-0.78, 3.50], [-0.59, 3.566], [-0.4, 3.56], [-0.1, 3.47], [0.5, 3.2], [1.2, 3.0], [2, 2.9], [3, 3.0], [4, 3.3], [5, 3.6], [7, 4.2]];
  function coast(P, y) {
    var n = P.length; if (y <= P[0][0]) return P[0][1]; if (y >= P[n - 1][0]) return P[n - 1][1];
    var k = 0; while (k < n - 2 && y > P[k + 1][0]) k++;
    var t = (y - P[k][0]) / (P[k + 1][0] - P[k][0]);
    return cr(P[Math.max(k - 1, 0)][1], P[k][1], P[k + 1][1], P[Math.min(k + 2, n - 1)][1], t);
  }
  function H(x, y) {
    var land = Math.max(coast(CW, y) - x, x - coast(CE, y));
    var n = fbm(x * 0.5 + 3.1, y * 0.5 - 1.7), n2 = fbm(x * 1.9 + 11.0, y * 1.9 + 5.0);
    if (land > 0) return LAND_H * (1 - Math.exp(-land / 1.5)) * (0.8 + 0.5 * n) + 0.07 * n2 * Math.min(1, land * 3);
    var s = -land;
    return -SEA_D * (1 - Math.exp(-s / 0.8)) * (0.85 + 0.35 * n) + 0.035 * n2 * Math.min(1, s * 3);
  }

  /* channel positions: the approximate route (lon, lat by channel number) in local km, draped on the terrain */
  var PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N);
  var TX = new Float32Array(N), TY = new Float32Array(N), TZ = new Float32Array(N);
  (function () {
    var R = C.route, RC = [], RX = [], RY = [], k = 0, c;
    R.forEach(function (p) { RC.push(p[0]); RX.push((p[1] - LON0) * KX); RY.push((p[2] - LAT0) * KY); });
    for (c = 0; c < N; c++) {
      var cc = c * RC[RC.length - 1] / (N - 1); while (k < RC.length - 2 && cc > RC[k + 1]) k++;
      var t = (cc - RC[k]) / (RC[k + 1] - RC[k]), a = Math.max(k - 1, 0), e = Math.min(k + 2, RC.length - 1);
      PX[c] = cr(RX[a], RX[k], RX[k + 1], RX[e], t); PY[c] = cr(RY[a], RY[k], RY[k + 1], RY[e], t);
      PZ[c] = H(PX[c], PY[c]) + 0.012;
    }
    for (c = 0; c < N; c++) {
      var i0 = Math.max(c - 4, 0), i1 = Math.min(c + 4, N - 1), dx = PX[i1] - PX[i0], dy = PY[i1] - PY[i0], dz = PZ[i1] - PZ[i0], l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      TX[c] = dx / l; TY[c] = dy / l; TZ[c] = dz / l;
    }
  })();

  var SEG = new Uint8Array(N), COIL = new Uint8Array(N), GAIN = new Float32Array(N), VGAIN = new Float32Array(N),
      NOISE = new Float32Array(N), OCEAN = new Float32Array(N), GROUND = new Float32Array(N);
  var SEA0 = 925, SEA1 = 1760, ROAD0 = 40, ROAD1 = 925;
  (function () {
    var c, g = 0;
    C.segments.forEach(function (s, i) { for (c = s.from; c < Math.min(s.to, N); c++) SEG[c] = i; if (s.key === 'sea') { SEA0 = s.from; SEA1 = s.to; } });
    C.coils.forEach(function (k) { for (c = k.from; c <= k.to && c < N; c++) COIL[c] = 1; });
    for (c = 0; c < N; c++) {
      var key = C.segments[SEG[c]].key, smooth = 0.5 + 0.5 * vnoise(c * 0.021, 3.7), fine = hash(c, 9);
      GAIN[c] = (0.62 + 0.42 * smooth + 0.22 * fine) * (COIL[c] ? 0.05 : 1);      // coils: about 20 times weaker
      VGAIN[c] = COIL[c] ? 0.7 : 1;
      NOISE[c] = key === 'sea' ? 0.026 : key === 'cabin' ? 0.034 : 0.05;
      if (key === 'sea') { var edge = Math.min(1, (c - SEA0) / 40, (SEA1 - c) / 40); OCEAN[c] = Math.max(0, edge) * (0.22 + 0.78 * Math.exp(PZ[c] / 0.2)); }
      GROUND[c] = g; if (!COIL[c]) g++;                                              // a coil is many channels at one point of the road
    }
    [133, 588, 1121, 1490].forEach(function (b) { NOISE[b] = 0.2; });               // a few noisy channels, as on any real cable
  })();

  /* ------------------------------------------------------------------ simulation */
  var simT = 0, events = [], vehicles = [], evTotal = 0, lastUser = -99, nextAuto = 1e9, nextCar = 0.5;
  var sigQ = new Float32Array(N), sigH = new Float32Array(N), sigV = new Float32Array(N), exc = new Float32Array(N);
  var view = null, mode = 'none', T = null, tagEv = null, tagW = 0;

  function showCount() { if (evCountEl) evCountEl.textContent = (evTotal < 10 ? '0' : '') + evTotal; }
  /* hist: the history the waterfall opens with. It is drawn in the record but not in the scene, and not counted. */
  function addEvent(x, y, z, mag, user, hist) {
    var e = { x: x, y: y, z: z, t0: simT, mag: mag, amp: 0.95 * Math.pow(10, 0.34 * (mag - 1)), user: !!user, hist: !!hist,
              tP: new Float32Array(N), tS: new Float32Array(N), cP: new Float32Array(N), cS: new Float32Array(N) };
    for (var c = 0; c < N; c++) {
      var dx = PX[c] - x, dy = PY[c] - y, dz = PZ[c] - z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      var cosT = (dx * TX[c] + dy * TY[c] + dz * TZ[c]) / d, sin2 = 2 * cosT * Math.sqrt(Math.max(0, 1 - cosT * cosT));
      var g = e.amp / (0.5 + 0.55 * d);
      e.tP[c] = d / VP; e.tS[c] = d / VS;
      e.cP[c] = g * 0.45 * (0.22 + 0.78 * cosT * cosT);                 // a fibre feels strain along itself: cos² for P
      e.cS[c] = g * (0.28 * (cosT >= 0 ? 1 : -1) + 0.72 * sin2);        // and sin 2θ for S, with its change of sign
    }
    events.push(e); if (events.length > MAXEV) events.shift();
    if (!hist) { evTotal++; showCount(); }
    if (user) { lastUser = simT; tagEvent(e); }
    return e;
  }
  /* epicentres for the page's own earthquakes: at sea, and only where the current view shows them clear of the
     headline and the waterfall */
  var SPOTS = [[2.3, 0.5], [1.4, -1.2], [1.9, -0.3], [0.9, -0.5], [1.2, 0.4]];
  function spot() {
    for (var k = 0; k < 24; k++) {
      var s = SPOTS[(Math.random() * SPOTS.length) | 0], x = s[0] + (Math.random() - 0.5) * 0.7, y = s[1] + (Math.random() - 0.5) * 0.7;
      if (H(x, y) < -0.12 && (!view || view.clear(x, y))) return [x, y];
    }
    return [1.6, -0.4];
  }
  function autoEvent(hist) { var p = spot(); addEvent(p[0], p[1], H(p[0], p[1]) - (0.7 + Math.random() * 1.2), 0.5 + Math.random() * 0.6, false, hist); }
  function userEvent(x, y) {
    x = Math.max(-6.2, Math.min(6.4, x)); y = Math.max(-5.5, Math.min(5.0, y));
    return addEvent(x, y, H(x, y) - (0.55 + Math.random() * 0.8), 1.2 + Math.random() * 1.2, true);
  }
  function spawnCar() {
    var fwd = Math.random() < 0.5, g0 = GROUND[ROAD0], g1 = GROUND[ROAD1 - 1];
    vehicles.push({ pos: fwd ? g0 - 10 : g1 + 10, vel: (fwd ? 1 : -1) * (15 + Math.random() * 16), amp: 0.3 + Math.random() * 0.32, w: 2.6 + Math.random() * 2 });
  }

  /* one time step: fills sigQ (earthquakes, ocean), sigV (vehicles), and the afterglow exc used by the fibre in the scene */
  function stepSim() {
    var c, i, e, tau, x, v, anyHist = false;
    simT += ROW_DT;
    while (events.length && simT - events[0].t0 > 14) events.shift();
    for (c = 0; c < N; c++) { sigQ[c] = 0; sigV[c] = 0; sigH[c] = 0; }
    for (i = 0; i < events.length; i++) {
      e = events[i]; tau = simT - e.t0; if (tau > 13) continue; if (e.hist) anyHist = true;
      for (c = 0; c < N; c++) {
        v = 0; x = tau - e.tP[c];
        if (x > 0 && x < 2.4) v += e.cP[c] * Math.sin(6.2832 * FP * x) * Math.exp(-x / 0.45) * (x < 0.05 ? x / 0.05 : 1);
        x = tau - e.tS[c];
        if (x > 0 && x < 5) v += e.cS[c] * (Math.sin(6.2832 * FS * x) * Math.exp(-x / 0.8) * (x < 0.08 ? x / 0.08 : 1) + 0.3 * (Math.random() * 2 - 1) * Math.exp(-x / 1.7));
        if (v) { sigQ[c] += v; if (e.hist) sigH[c] += v; }
      }
    }
    var t = simT;
    for (c = SEA0; c < SEA1 && c < N; c++)
      sigQ[c] += OCEAN[c] * 0.055 * (Math.sin(0.0449 * c - 1.26 * t) + 0.32 * Math.sin(0.0661 * c + 1.62 * t + 1.3) + 0.5 * Math.sin(0.0283 * c - 0.93 * t + 4.1));
    for (i = vehicles.length - 1; i >= 0; i--) {
      var vh = vehicles[i]; vh.pos += vh.vel * ROW_DT;
      if (vh.pos < GROUND[ROAD0] - 30 || vh.pos > GROUND[ROAD1 - 1] + 30) { vehicles.splice(i, 1); continue; }
      for (c = ROAD0; c < ROAD1; c++) {
        var u = (GROUND[c] - vh.pos) / vh.w; if (u > 3.2 || u < -3.2) continue;
        var gg = Math.exp(-u * u);
        sigV[c] += vh.amp * (-1.5 * u * gg * (vh.vel > 0 ? 1 : -1) + 0.28 * (Math.random() * 2 - 1) * gg);
      }
    }
    if (simT >= nextCar) { spawnCar(); nextCar = simT + 3.2 + Math.random() * 5.5; }
    if (simT >= nextAuto) {
      if (simT - lastUser > 6) autoEvent(false);
      nextAuto = simT + 10 + Math.random() * 6;
    }
    for (c = 0; c < N; c++) {
      var a = Math.abs(GAIN[c] * (anyHist ? sigQ[c] - sigH[c] : sigQ[c]) * 1.5 + VGAIN[c] * sigV[c] * 0.8); if (a > 1) a = 1;
      exc[c] = Math.max(exc[c] * 0.88, a);
    }
  }

  /* ------------------------------------------------------------------ waterfall */
  var LUT = new Uint8ClampedArray(513 * 3);
  (function () {
    var bg = [5, 9, 17];
    for (var i = 0; i <= 512; i++) {
      var s = i / 256 - 1, k = Math.pow(Math.abs(s), 0.82), mid = s > 0 ? [255, 174, 76] : [104, 164, 250], top = s > 0 ? [255, 241, 216] : [226, 239, 255];
      var t1 = Math.min(1, k / 0.72), t2 = Math.max(0, (k - 0.72) / 0.28);
      for (var j = 0; j < 3; j++) { var v = bg[j] + (mid[j] - bg[j]) * t1; LUT[i * 3 + j] = v + (top[j] - v) * t2; }
    }
  })();
  var wfBuf = document.createElement('canvas'); wfBuf.width = N; wfBuf.height = WF_ROWS;
  var bctx = wfBuf.getContext('2d'), rowImg = bctx.createImageData(N, 1), wctx = wfCv ? wfCv.getContext('2d') : null;
  bctx.fillStyle = 'rgb(5,9,17)'; bctx.fillRect(0, 0, N, WF_ROWS);
  function pushRow() {
    var d = rowImg.data, c, v, s, k, o;
    for (c = 0; c < N; c++) {
      v = GAIN[c] * sigQ[c] + VGAIN[c] * sigV[c] + NOISE[c] * (Math.random() * 2 - 1);
      s = Math.tanh(v * 1.55); k = ((s + 1) * 256) | 0; o = c * 4;
      d[o] = LUT[k * 3]; d[o + 1] = LUT[k * 3 + 1]; d[o + 2] = LUT[k * 3 + 2]; d[o + 3] = 255;
    }
    bctx.drawImage(wfBuf, 0, 1, N, WF_ROWS - 1, 0, 0, N, WF_ROWS - 1);     // the record moves up; now is at the bottom
    bctx.putImageData(rowImg, 0, WF_ROWS - 1);
  }
  function blitWf() { if (wctx) { wctx.imageSmoothingEnabled = true; wctx.imageSmoothingQuality = 'high'; wctx.drawImage(wfBuf, 0, 0, N, WF_ROWS, 0, 0, wfCv.width, wfCv.height); } }
  function sizeWf() {
    if (!wfCv) return; var r = wfCv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (wfCv.width !== w || wfCv.height !== h) { wfCv.width = w; wfCv.height = h; blitWf(); }
  }
  function advance(seconds) { var n = Math.round(seconds * ROW_HZ); for (var i = 0; i < n; i++) { stepSim(); pushRow(); } blitWf(); }

  /* the record opens with ten seconds of history, so the page does not open on an empty plot */
  (function prefill() {
    simT = -10.5; nextCar = -10.4;
    for (var i = 0; i < 315; i++) { if (i === 10 || i === 150) autoEvent(true); stepSim(); pushRow(); }
  })();

  /* waterfall furniture: segment brackets, coil ticks, channel axis */
  (function furniture() {
    var segs = $('wfSegs'); if (!segs) return;
    var names = { cabin: ['', ''], land: ['Kefalonia · coast road', 'road'], coil: ['beach manhole', ''], sea: ['seafloor', 'seafloor'], ithaca: ['Ithaca', 'Ith.'] };
    C.segments.forEach(function (s) {
      var el = document.createElement('span'); el.className = 'seg seg-' + s.key;
      el.style.left = (s.from / N * 100) + '%'; el.style.width = ((s.to - s.from) / N * 100) + '%';
      var nm = names[s.key] || ['', '']; el.innerHTML = '<b class="long">' + nm[0] + '</b><b class="short">' + nm[1] + '</b>';
      segs.appendChild(el);
    });
    C.coils.forEach(function (k) {
      var el = document.createElement('i'); el.className = 'coil'; el.style.left = (k.from / N * 100) + '%'; el.style.width = Math.max(0.25, (k.to - k.from + 1) / N * 100) + '%';
      el.title = 'spare fibre: channels ' + k.from + '–' + k.to + ', ' + k.m + ' m'; segs.appendChild(el);
    });
  })();
  var tickSet = '';
  function buildTicks() {
    var axis = $('wfAxis'); if (!axis || !wfWrap) return;
    var set = wfWrap.offsetWidth < 420 ? [0, 600, 1200, 1872] : [0, 400, 800, 1200, 1600, 1872];
    if (String(set) === tickSet) return; tickSet = String(set); axis.innerHTML = '';
    set.forEach(function (c) {
      var el = document.createElement('span'); el.className = 'tick'; el.style.left = (c / N * 100) + '%';
      el.innerHTML = '<b>' + c + '</b><em>' + (c * C.spacing_m / 1000).toFixed(1) + ' km</em>'; axis.appendChild(el);
    });
  }

  /* ------------------------------------------------------------------ hero layout, measured without transforms */
  var W = 2, Hh = 2, portrait = false, box = { cl: 0, cr: 0, ct: 0, cb: 0, bottom: 1e4, wfX: 0, wfY: 0, wfW: 1 };
  function measure() {
    W = Math.max(2, hero.clientWidth); Hh = Math.max(2, hero.clientHeight);
    if (copyEl) { box.cl = copyEl.offsetLeft; box.ct = copyEl.offsetTop; box.cr = box.cl + copyEl.offsetWidth; box.cb = box.ct + copyEl.offsetHeight; }
    if (wfPanel) {
      box.bottom = wfPanel.offsetTop - 8;
      if (wfWrap) { box.wfX = wfPanel.offsetLeft + wfWrap.offsetLeft; box.wfY = wfPanel.offsetTop + wfWrap.offsetTop; box.wfW = wfWrap.offsetWidth; }
    } else box.bottom = Hh;
    /* the scene goes where it can be largest: right of the headline (landscape) or under it (phones, tall screens) */
    var room = box.bottom - 40, beside = Math.min((W - 54 - box.cr) / 1.35, room - 80), below = Math.min((W - 52) / 1.35, room - box.cb - 18);
    portrait = W <= 860 || below > beside * 1.15;
  }

  /* ------------------------------------------------------------------ overlay: labels, the hover link, the event tag */
  var labels = [];
  function label(cls, html, x, y, z, half) { var el = document.createElement('span'); el.className = 'lab ' + cls; el.innerHTML = html; labelsEl.appendChild(el); labels.push({ el: el, x: x, y: y, z: z, pin: cls.indexOf('pin') >= 0, left: cls.indexOf('left') >= 0, half: half || 0 }); }
  if (labelsEl) {
    label('isle', '<span>Kefalonia</span>', -3.2, 0.4, H(-3.2, 0.4) + 0.05, 50);
    label('isle', '<span>Ithaca</span>', 4.0, -1.2, H(4.0, -1.2) + 0.05, 36);
    [[0, 'interrogator', 'major'], [400, '', ''], [800, '', ''], [910, 'beach manhole', 'major'], [1200, '', ''], [1600, '', ''], [1871, 'end of fibre', 'major left']].forEach(function (k) {
      var c = k[0]; label('pin ' + k[2], '<i></i><b>' + (c === 1871 ? 1872 : c === 910 ? 900 : c) + '</b>' + (k[1] ? '<em>' + k[1] + '</em>' : ''), PX[c], PY[c], PZ[c]);
    });
  }
  function placeLabels(project) {
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i], s = project(L.x, L.y, L.z), x = s[0], y = s[1];
      var x0 = L.left ? x - 110 : x - L.half, x1 = L.left ? x : x + (L.half || 24);
      var ok = s[2] < 1 && y > 62 && x0 > 6 && x1 < W - 6 && y < box.bottom - (L.pin ? 22 : 14) &&
               !(x1 > box.cl - 12 && x0 < box.cr + 12 && y > box.ct - 14 && y < box.cb + (L.pin ? 18 : 10));
      L.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; L.el.style.visibility = ok ? 'visible' : 'hidden';
    }
  }
  var linkLine = linkSvg ? linkSvg.querySelector('line') : null, linkDot = linkSvg ? linkSvg.querySelector('circle') : null, linkOn = false;
  function hideLink() { if (linkSvg && linkOn) { linkSvg.style.opacity = 0; linkOn = false; } }
  function showLink(sx, sy, ch) {
    if (!linkSvg) return;
    var x2 = box.wfX + (ch / (N - 1)) * box.wfW, y2 = box.wfY;
    linkLine.setAttribute('x1', sx); linkLine.setAttribute('y1', sy); linkLine.setAttribute('x2', x2); linkLine.setAttribute('y2', y2);
    linkDot.setAttribute('cx', sx); linkDot.setAttribute('cy', sy); if (!linkOn) { linkSvg.style.opacity = 1; linkOn = true; }
  }
  function tagEvent(e) {
    if (!tagEl) return; tagEv = e;
    tagEl.innerHTML = '<b>M ' + e.mag.toFixed(1) + '</b> · ' + (-e.z).toFixed(1) + ' km deep · synthetic';
    tagEl.classList.add('on'); tagW = tagEl.offsetWidth;
  }
  function overlay(project, introCh) {
    placeLabels(project);
    if (markCh >= 0) { var m = project(PX[markCh], PY[markCh], PZ[markCh]); showLink(m[0], m[1], markCh); }
    else if (introCh >= 0 && introCh < 1) { var pc = Math.round(introCh * (N - 1)), m2 = project(PX[pc], PY[pc], PZ[pc]); showLink(m2[0], m2[1], pc); }
    else hideLink();
    if (tagEv && tagEl) {
      if (simT - tagEv.t0 > 4.2 || events.indexOf(tagEv) < 0) { tagEl.classList.remove('on'); tagEv = null; }
      else {
        var s = project(tagEv.x, tagEv.y, H(tagEv.x, tagEv.y)), lx = s[0] + 14;
        if (lx + tagW > W - 10) lx = s[0] - 14 - tagW;                         // flip to the left of the epicentre, and stay on screen
        lx = Math.max(10, Math.min(W - tagW - 10, lx));
        tagEl.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + s[1].toFixed(1) + 'px)';
      }
    }
  }
  function ping(x, y) {
    if (reduced) return; var el = document.createElement('i'); el.className = 'ping'; el.style.left = x + 'px'; el.style.top = y + 'px'; hero.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1300);
  }
  /* the interrogator's pulse: it draws the cable in on arrival, then runs down the fibre every eleven seconds */
  function pulseAt(clock, st) {
    var rv = reduced ? 1.01 : Math.min(1.01, Math.max(0, (clock - 0.25) / 2.3));
    if (clock - st.t0 > 11) st.t0 += 11 * Math.floor((clock - st.t0) / 11);
    var pt = clock - st.t0, on = !reduced && pt >= 0 && pt < 2.6;
    var ch = on ? pt / 2.6 : (rv < 1 ? rv : -1);
    if (wfPulse) { if (ch >= 0 && ch <= 1) { wfPulse.style.left = (ch * 100) + '%'; wfPulse.style.opacity = 1; } else wfPulse.style.opacity = 0; }
    return { reveal: rv, pulse: on ? ch : -1, intro: clock < 2.6 && !reduced ? ch : -1 };
  }

  /* ------------------------------------------------------------------ hover: the waterfall is the cable, unrolled */
  var markCh = -1;
  function segName(c) { var s = C.segments[SEG[Math.max(0, Math.min(N - 1, c))]]; return s.key === 'land' ? 'Kefalonia, coast road' : s.key === 'coil' ? 'beach manhole (coil)' : s.key === 'sea' ? 'seafloor' : s.key === 'ithaca' ? 'Ithaca' : 'interrogator'; }
  function pad4(n) { n = String(n); while (n.length < 4) n = '0' + n; return n; }
  function still() { if (view && (reduced || !running)) view.frame(performance.now(), true, 0); }
  if (wfWrap) {
    var setMark = function (ev) {
      var r = wfWrap.getBoundingClientRect(), f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), ch = Math.round(f * (N - 1));
      if (ch === markCh) return;
      markCh = ch;
      if (wfCursor) { wfCursor.style.left = (f * 100) + '%'; wfCursor.style.opacity = 1; }
      if (wfTip) {
        wfTip.innerHTML = '<b>ch ' + pad4(markCh) + ' · ' + (markCh * C.spacing_m / 1000).toFixed(2) + ' km</b> <span>' + segName(markCh) + (COIL[markCh] ? ' · spare fibre' : '') + '</span>';
        var x = f * r.width, tw = wfTip.offsetWidth, left = x + 10 + tw > r.width - 4 ? x - 10 - tw : x + 10;
        wfTip.style.left = Math.max(4, left).toFixed(1) + 'px'; wfTip.style.opacity = 1;
      }
      still();
    };
    wfWrap.addEventListener('pointermove', setMark);
    wfWrap.addEventListener('pointerdown', setMark);
    wfWrap.addEventListener('pointerleave', function () {
      markCh = -1; if (wfCursor) wfCursor.style.opacity = 0; if (wfTip) wfTip.style.opacity = 0; hideLink(); still();
    });
  }

  /* ------------------------------------------------------------------ the visitor's earthquakes, before any scene exists too */
  hero.addEventListener('click', function (ev) {
    if (!view || (ev.target.closest && ev.target.closest('a, button, .wf-panel, .top'))) return;
    var hit = view.pick(ev.clientX, ev.clientY); if (!hit) return;
    var r = hero.getBoundingClientRect();
    userEvent(hit[0], hit[1]); ping(ev.clientX - r.left, ev.clientY - r.top); hero.classList.add('touched');
    if (reduced) { advance(2.2); still(); }
  });
  if (quakeBtn) quakeBtn.addEventListener('click', function () {
    var p = spot(), e = userEvent(p[0], p[1]); hero.classList.add('touched');
    if (view) { var s = view.project(e.x, e.y, H(e.x, e.y)); ping(s[0], s[1]); }
    if (reduced) { advance(2.2); still(); }
  });

  /* ------------------------------------------------------------------ the loop: simulation and waterfall, then the scene */
  var running = false, heroVis = true, raf = 0, last = 0, acc = 0;
  function loop(now) {
    raf = 0; if (!running) return;
    var dt = Math.min(0.1, (now - last) / 1000), steps = 0; last = now; acc += dt;
    while (acc >= ROW_DT && steps < 5) { stepSim(); pushRow(); acc -= ROW_DT; steps++; }
    if (acc > ROW_DT * 5) acc = 0;
    if (steps) blitWf();
    if (view) view.frame(now, false, dt);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (running || reduced || !heroVis || document.hidden) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function relayout() { measure(); buildTicks(); sizeWf(); if (view) view.resize(); still(); }

  var api = { quake: function (x, y) { return userEvent(x, y); }, events: events, H: H, PZ: PZ, project: null, setRig: null,
              state: function () { return { simT: simT, n: evTotal, cars: vehicles.length, mode: mode, running: running }; } };
  window.__v3a = api;

  /* ------------------------------------------------------------------ 3-D scene */
  function init3D() {
    var probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return null;
    var renderer;
    try { renderer = new T.WebGLRenderer({ canvas: sceneCv, antialias: false, alpha: false, powerPreference: 'high-performance' }); }
    catch (err) { return null; }
    var gl2 = renderer.capabilities.isWebGL2;
    var hdr = gl2 && renderer.extensions.has('EXT_color_buffer_float');
    renderer.setClearColor(0x000000, 1);

    var scene = new T.Scene(), camera = new T.PerspectiveCamera(30, 1.6, 0.1, 90); camera.up.set(0, 0, 1);
    var add = T.AdditiveBlending;
    function mat(o) { o.transparent = true; o.blending = add; o.depthTest = false; o.depthWrite = false; return new T.ShaderMaterial(o); }

    /* events shared by every shader */
    var uEv = [], uEvA = [], i;
    for (i = 0; i < MAXEV; i++) { uEv.push(new T.Vector4(0, 0, 0, -99)); uEvA.push(0); }
    var U = { uTime: { value: 0 }, uEv: { value: uEv }, uEvA: { value: uEvA }, uVP: { value: VP }, uVS: { value: VS }, uIntro: { value: reduced ? 1 : 0 } };

    /* --- terrain: a surface drawn only as scan-lines, depth contours and a coastline --- */
    var X0 = -8.4, X1 = 9.0, Y0 = -8.6, Y1 = 8.0, GX = 330, GY = 316;
    var tp = new Float32Array((GX + 1) * (GY + 1) * 3), ti = new Uint32Array(GX * GY * 6), p = 0, q = 0, j;
    for (j = 0; j <= GY; j++) for (i = 0; i <= GX; i++) { var tx = X0 + (X1 - X0) * i / GX, ty = Y0 + (Y1 - Y0) * j / GY; tp[p++] = tx; tp[p++] = ty; tp[p++] = H(tx, ty); }
    for (j = 0; j < GY; j++) for (i = 0; i < GX; i++) { var a = j * (GX + 1) + i, b = a + 1, c2 = a + GX + 1, d2 = c2 + 1; ti[q++] = a; ti[q++] = b; ti[q++] = c2; ti[q++] = b; ti[q++] = d2; ti[q++] = c2; }
    var tgeo = new T.BufferGeometry(); tgeo.setAttribute('position', new T.BufferAttribute(tp, 3)); tgeo.setIndex(new T.BufferAttribute(ti, 1));
    var EVLOOP = [
      'vec3 fronts(vec3 w, float lines){',
      '  vec3 g = vec3(0.0);',
      '  for (int i = 0; i < ' + MAXEV + '; i++) {',
      '    float A = uEvA[i]; if (A <= 0.0) continue;',
      '    float tau = uTime - uEv[i].w; if (tau < 0.0) continue;',
      '    float d = distance(w, uEv[i].xyz);',
      '    float att = A / (0.6 + 0.5 * d) * (1.0 - smoothstep(4.5, 9.5, tau));',
      '    float rp = (d - uVP * tau) / 0.085, rs = (d - uVS * tau) / 0.13;',
      '    float wake = exp(-max(uVS * tau - d, 0.0) / 0.6) * step(d, uVS * tau);',
      '    g += vec3(0.60, 0.79, 1.0) * exp(-rp * rp) * att * 0.6;',
      '    g += vec3(1.0, 0.69, 0.33) * (exp(-rs * rs) * 1.3 + wake * 0.12) * att;',
      '  }',
      '  return g * (0.09 + 1.6 * lines);',
      '}'].join('\n');
    var terrainMat = mat({
      uniforms: Object.assign({ uFocus: { value: new T.Vector2(0.4, 0.2) }, uFade: { value: new T.Vector2(2.6, 8.2) } }, U),
      extensions: { derivatives: true },
      vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'precision highp float; varying vec3 vW;',
        'uniform float uTime, uVP, uVS, uIntro; uniform vec4 uEv[' + MAXEV + ']; uniform float uEvA[' + MAXEV + ']; uniform vec2 uFocus, uFade;',
        'float gline(float coord, float w){ float fw = fwidth(coord); float d = abs(fract(coord - 0.5) - 0.5) / max(fw, 1e-6);',
        '  return (1.0 - smoothstep(w - 0.6, w + 0.6, d)) * (1.0 - smoothstep(0.30, 0.70, fw)); }',
        EVLOOP,
        'void main(){',
        '  float sea = 1.0 - smoothstep(-0.015, 0.015, vW.z);',
        '  float scan = gline(vW.x * 9.0, 0.55), crs = gline(vW.y * 2.0, 0.5), iso = gline(vW.z * 12.0, 0.5);',
        '  vec3 base = mix(vec3(0.78, 0.63, 0.46), vec3(0.30, 0.50, 0.84), sea);',
        '  float deep = mix(0.60, 1.0, smoothstep(-0.55, 0.0, vW.z));',
        '  float lines = scan * 0.55 + crs * 0.14 + iso * 0.28;',
        '  vec3 col = base * (scan * 0.30 + crs * 0.07 + iso * 0.14) * deep;',
        '  float cz = abs(vW.z) / max(fwidth(vW.z), 1e-6);',
        '  col += vec3(0.96, 0.85, 0.66) * (1.0 - smoothstep(0.4, 1.5, cz)) * 0.26;',
        '  col += fronts(vW, lines);',
        '  float r = distance(vW.xy, uFocus);',
        '  float fade = (1.0 - smoothstep(uFade.x, uFade.y, r)) * smoothstep(0.0, 1.0, uIntro * 14.0 - r);',
        '  gl_FragColor = vec4(col * fade, 1.0);',
        '}'].join('\n')
    });
    scene.add(new T.Mesh(tgeo, terrainMat));

    /* height map, for clipping the wave shells to the ground */
    var HW = 256, HH = 192, HMIN = -0.9, HMAX = 1.7, hd = new Uint8Array(HW * HH * 4);
    for (j = 0; j < HH; j++) for (i = 0; i < HW; i++) { var hv = (H(X0 + (X1 - X0) * (i + 0.5) / HW, Y0 + (Y1 - Y0) * (j + 0.5) / HH) - HMIN) / (HMAX - HMIN); hd[(j * HW + i) * 4] = Math.max(0, Math.min(255, Math.round(hv * 255))); hd[(j * HW + i) * 4 + 3] = 255; }
    var hmap = new T.DataTexture(hd, HW, HH, T.RGBAFormat, T.UnsignedByteType); hmap.magFilter = hmap.minFilter = T.LinearFilter; hmap.needsUpdate = true;

    /* --- the fibre --- */
    var excData = new Uint8Array(N * 4), excTex = new T.DataTexture(excData, N, 1, T.RGBAFormat, T.UnsignedByteType);
    excTex.magFilter = excTex.minFilter = T.LinearFilter; excTex.needsUpdate = true;
    function tube(radius, step, sides) {
      var rings = Math.floor((N - 1) / step) + 1, pos = new Float32Array(rings * sides * 3), ch = new Float32Array(rings * sides), idx = new Uint32Array((rings - 1) * sides * 6), o = 0, k = 0, m = 0, r, s;
      for (r = 0; r < rings; r++) {
        var c = Math.min(N - 1, r * step), tx = TX[c], ty = TY[c], tz = TZ[c];
        var nx = ty, ny = -tx, nz = 0, nl = Math.sqrt(nx * nx + ny * ny) || 1; nx /= nl; ny /= nl;       // n = t × up
        var bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;                       // b = n × t
        for (s = 0; s < sides; s++) {
          var an = s / sides * 6.2832, ca = Math.cos(an) * radius, sa = Math.sin(an) * radius;
          pos[o++] = PX[c] + nx * ca + bx * sa; pos[o++] = PY[c] + ny * ca + by * sa; pos[o++] = PZ[c] + nz * ca + bz * sa; ch[k++] = c / (N - 1);
        }
      }
      for (r = 0; r < rings - 1; r++) for (s = 0; s < sides; s++) { var a0 = r * sides + s, a1 = r * sides + (s + 1) % sides, b0 = a0 + sides, b1 = a1 + sides; idx[m++] = a0; idx[m++] = b0; idx[m++] = a1; idx[m++] = a1; idx[m++] = b0; idx[m++] = b1; }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aCh', new T.BufferAttribute(ch, 1)); g.setIndex(new T.BufferAttribute(idx, 1)); return g;
    }
    var CU = { uExc: { value: excTex }, uPulse: { value: -1 }, uReveal: { value: reduced ? 1.01 : 0 }, uMark: { value: -1 } };
    function cableMat(gain) {
      return mat({
        uniforms: Object.assign({ uGain: { value: gain } }, CU),
        vertexShader: 'attribute float aCh; varying float vCh; varying vec3 vW; void main(){ vCh = aCh; vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'precision highp float; varying float vCh; varying vec3 vW; uniform sampler2D uExc; uniform float uPulse, uReveal, uMark, uGain;',
          'void main(){',
          '  if (vCh > uReveal) discard;',
          '  float e = texture2D(uExc, vec2(vCh, 0.5)).r;',
          '  float dh = (uReveal - vCh) / 0.014, dp = (vCh - uPulse) / 0.008, dm = (vCh - uMark) / 0.0035;',
          '  float head = exp(-dh * dh) * step(uReveal, 1.0), p = exp(-dp * dp), m = exp(-dm * dm);',
          '  vec3 amber = vec3(1.0, 0.64, 0.26), hot = vec3(1.0, 0.92, 0.76);',
          '  float under = 1.0 - smoothstep(-0.06, 0.02, vW.z);',
          '  vec3 col = amber * mix(0.62, 0.46, under) + mix(amber, hot, clamp(e * 1.3, 0.0, 1.0)) * e * 2.6 + hot * (p * 1.5 + head * 2.4 + m * 3.0);',
          '  gl_FragColor = vec4(col * uGain, 1.0);',
          '}'].join('\n')
      });
    }
    scene.add(new T.Mesh(tube(0.017, 1, 6), cableMat(1.0)));
    scene.add(new T.Mesh(tube(0.075, 3, 8), cableMat(0.055)));

    /* plumb lines from the seabed cable to the sea surface, and its trace on the surface */
    (function () {
      var v = [], c;
      for (c = SEA0 + 15; c < SEA1; c += 44) { v.push(PX[c], PY[c], PZ[c], PX[c], PY[c], 0); }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(v), 3));
      var m = new T.LineBasicMaterial({ color: 0x6f9fe0, transparent: true, opacity: 0.20, blending: add, depthTest: false });
      scene.add(new T.LineSegments(g, m));
      var s = []; for (c = SEA0; c < SEA1; c += 6) { if (((c / 6) | 0) % 2 === 0) s.push(PX[c], PY[c], 0, PX[Math.min(c + 6, SEA1 - 1)], PY[Math.min(c + 6, SEA1 - 1)], 0); }
      var g2 = new T.BufferGeometry(); g2.setAttribute('position', new T.BufferAttribute(new Float32Array(s), 3));
      scene.add(new T.LineSegments(g2, new T.LineBasicMaterial({ color: 0x6f9fe0, transparent: true, opacity: 0.22, blending: add, depthTest: false })));
    })();

    /* --- motes drifting in the water column: they give the sea its depth --- */
    var snowMat = null;
    (function () {
      var n = 520, pos = new Float32Array(n * 3), seed = new Float32Array(n), k = 0, tries = 0;
      while (k < n && tries < 20000) {
        tries++; var x = -3.2 + Math.random() * 8.4, y = -5.2 + Math.random() * 9.6, h = H(x, y); if (h > -0.08) continue;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = h * Math.random() * 0.92 - 0.02; seed[k] = Math.random(); k++;
      }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos.subarray(0, k * 3), 3)); g.setAttribute('aS', new T.BufferAttribute(seed.subarray(0, k), 1));
      snowMat = mat({
        uniforms: { uTime: U.uTime, uScale: { value: 400 }, uIntro: U.uIntro },
        vertexShader: 'attribute float aS; varying float vA; uniform float uTime, uScale; void main(){ vec3 p = position; float t = uTime * 0.05 + aS * 40.0; p.x += 0.10 * sin(t * 1.3 + aS * 9.0); p.y += 0.10 * cos(t + aS * 5.0); p.z += 0.03 * sin(t * 2.1 + aS * 17.0); vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(t * 6.0 + aS * 30.0)); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = max(1.0, (0.012 + 0.018 * aS) * uScale / -mv.z); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'precision highp float; varying float vA; uniform float uIntro; void main(){ float d = length(gl_PointCoord - 0.5); float g = 1.0 - smoothstep(0.1, 0.5, d); gl_FragColor = vec4(vec3(0.50, 0.68, 1.0) * g * vA * 0.5 * uIntro, 1.0); }'
      });
      var pts = new T.Points(g, snowMat); pts.frustumCulled = false; scene.add(pts);
    })();

    /* --- wave shells (clipped to the ground): thin wavefronts, not lit volumes --- */
    var sphere = new T.SphereGeometry(1, 96, 64), shells = [];
    function shellMat(col) {
      return mat({
        side: T.FrontSide,
        uniforms: { uHmap: { value: hmap }, uHB: { value: new T.Vector4(X0, Y0, 1 / (X1 - X0), 1 / (Y1 - Y0)) }, uHR: { value: new T.Vector2(HMIN, HMAX - HMIN) }, uCol: { value: new T.Vector3(col[0], col[1], col[2]) }, uA: { value: 0 } },
        vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(position); gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: [
          'precision highp float; varying vec3 vW; varying vec3 vN; uniform sampler2D uHmap; uniform vec4 uHB; uniform vec2 uHR; uniform vec3 uCol; uniform float uA;',
          'void main(){',
          '  vec2 uv = clamp((vW.xy - uHB.xy) * uHB.zw, 0.0, 1.0);',
          '  float h = uHR.x + texture2D(uHmap, uv).r * uHR.y;',
          '  if (vW.z > h) discard;',
          '  vec3 V = normalize(cameraPosition - vW);',
          '  float rim = pow(clamp(1.0 - abs(dot(normalize(vN), V)), 0.0, 1.0), 2.4);',
          '  float skin = exp(-max(h - vW.z, 0.0) / 0.22);',
          '  float fall = exp(-max(h - vW.z, 0.0) / 3.2);',
          '  gl_FragColor = vec4(uCol * (rim * 0.45 + skin * 0.12) * fall * uA, 1.0);',
          '}'].join('\n')
      });
    }
    for (i = 0; i < MAXEV; i++) {
      var sp = new T.Mesh(sphere, shellMat([0.56, 0.76, 1.0])), ss = new T.Mesh(sphere, shellMat([1.0, 0.66, 0.30]));
      sp.visible = ss.visible = false; sp.frustumCulled = ss.frustumCulled = false; scene.add(sp); scene.add(ss); shells.push([sp, ss]);
    }
    var hypoPos = new Float32Array(MAXEV * 3), hypoA = new Float32Array(MAXEV), hgeo = new T.BufferGeometry();
    hgeo.setAttribute('position', new T.BufferAttribute(hypoPos, 3)); hgeo.setAttribute('aA', new T.BufferAttribute(hypoA, 1));
    var hypoMat = mat({
      uniforms: { uScale: { value: 400 } },
      vertexShader: 'attribute float aA; varying float vA; uniform float uScale; void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (0.22 + 0.5 * aA) * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'precision highp float; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float g = exp(-d * d * 26.0) + 0.5 * exp(-d * d * 190.0); gl_FragColor = vec4(vec3(1.0, 0.80, 0.52) * g * vA, 1.0); }'
    });
    var hypo = new T.Points(hgeo, hypoMat); hypo.frustumCulled = false; scene.add(hypo);
    var stemPos = new Float32Array(MAXEV * 6), sgeo = new T.BufferGeometry(); sgeo.setAttribute('position', new T.BufferAttribute(stemPos, 3));
    var stemMat = new T.LineBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0.32, blending: add, depthTest: false });
    var stems = new T.LineSegments(sgeo, stemMat); stems.frustumCulled = false; scene.add(stems);

    /* --- post: two blur levels for the glow, then grade, vignette and grain --- */
    var fsScene = new T.Scene(), fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsQuad = new T.Mesh(new T.PlaneGeometry(2, 2), null); fsScene.add(fsQuad);
    var FSV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    function fsMat(uniforms, frag) { return new T.ShaderMaterial({ uniforms: uniforms, vertexShader: FSV, fragmentShader: 'precision highp float; varying vec2 vUv;\n' + frag, depthTest: false, depthWrite: false }); }
    var rtOpt = { depthBuffer: false, type: hdr ? T.HalfFloatType : T.UnsignedByteType, minFilter: T.LinearFilter, magFilter: T.LinearFilter };
    var rtScene = new T.WebGLRenderTarget(4, 4, Object.assign({ samples: gl2 && window.innerWidth > 860 ? 4 : 0 }, rtOpt));   // phones have the pixel density; they skip MSAA
    var rtA0 = new T.WebGLRenderTarget(4, 4, rtOpt), rtA1 = new T.WebGLRenderTarget(4, 4, rtOpt), rtB0 = new T.WebGLRenderTarget(4, 4, rtOpt), rtB1 = new T.WebGLRenderTarget(4, 4, rtOpt);
    var mDown = fsMat({ t: { value: null }, uTexel: { value: new T.Vector2() } },
      'uniform sampler2D t; uniform vec2 uTexel; void main(){ vec3 c = texture2D(t, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(t, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(t, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(t, vUv + uTexel * vec2(1.0, 1.0)).rgb; gl_FragColor = vec4(clamp(c * 0.25, 0.0, 48.0), 1.0); }');
    var mBlur = fsMat({ t: { value: null }, uDir: { value: new T.Vector2() } },
      'uniform sampler2D t; uniform vec2 uDir; void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227027; c += (texture2D(t, vUv + uDir * 1.3846).rgb + texture2D(t, vUv - uDir * 1.3846).rgb) * 0.316216; c += (texture2D(t, vUv + uDir * 3.2308).rgb + texture2D(t, vUv - uDir * 3.2308).rgb) * 0.070270; gl_FragColor = vec4(c, 1.0); }');
    var mComp = fsMat({ tS: { value: null }, tA: { value: null }, tB: { value: null }, uTime: { value: 0 }, uAspect: { value: 1.6 }, uFloor: { value: 0.34 }, uPP: { value: new T.Vector2(0.6, 0.6) } }, [
      'uniform sampler2D tS, tA, tB; uniform float uTime, uAspect, uFloor; uniform vec2 uPP;',
      'void main(){',
      '  vec3 s = texture2D(tS, vUv).rgb, g = texture2D(tA, vUv).rgb * 0.95 + texture2D(tB, vUv).rgb * 1.05;',
      '  vec2 p = vUv - uPP; p.x *= uAspect;',
      '  vec3 bg = mix(vec3(0.016, 0.027, 0.051), vec3(0.026, 0.052, 0.098), exp(-dot(p, p) * 3.0));',
      '  vec3 col = bg + s + g;',
      '  col = 1.0 - exp(-col * 1.22);',
      '  vec2 q = vUv - 0.5; col *= mix(1.0, 0.50, smoothstep(0.22, 0.98, length(q * vec2(1.12, 1.0))));',
      '  col = mix(col, vec3(0.016, 0.027, 0.051), (1.0 - smoothstep(0.0, uFloor, vUv.y)) * 0.9);',
      '  float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);',
      '  col += (n - 0.5) * 0.03;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'].join('\n'));
    function pass(m, target) { fsQuad.material = m; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); }

    /* --- camera rig --- */
    var dpr = 1, px = 0, py = 0, pxs = 0, pys = 0, vec = new T.Vector3(), ray = new T.Raycaster(), ndc = new T.Vector2(), clock = 0, pst = { t0: 7 };
    var rig = {};
    function layout() {
      if (portrait) rig = { az: 180, el: 41, dist: 24, fov: 46, tx: 0.35, ty: -0.05, tz: -0.2, ppx: 0.5, ppy: 0.52, zoom: 1.25 };
      else if (W / Hh < 1.45) rig = { az: 180, el: 33, dist: 19, fov: 30, tx: 0.3, ty: -0.3, tz: -0.2, ppx: 0.64, ppy: 0.385, zoom: 1.25 };
      else rig = { az: 180, el: 31, dist: 16.5, fov: 30, tx: 0.3, ty: -0.3, tz: -0.2, ppx: 0.67, ppy: 0.375, zoom: 1.25 };
      if (api.dbg) Object.assign(rig, api.dbg);
      mComp.uniforms.uFloor.value = portrait ? 0.30 : 0.36;
    }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2); var cap = portrait ? 2.3e6 : 3.4e6; if (W * Hh * dpr * dpr > cap) dpr = Math.sqrt(cap / (W * Hh));
      layout();
      renderer.setPixelRatio(dpr); renderer.setSize(W, Hh, false);
      var bw = Math.round(W * dpr), bh = Math.round(Hh * dpr);
      rtScene.setSize(bw, bh); rtA0.setSize(bw >> 2, bh >> 2); rtA1.setSize(bw >> 2, bh >> 2); rtB0.setSize(bw >> 3, bh >> 3); rtB1.setSize(bw >> 3, bh >> 3);
      mComp.uniforms.uAspect.value = W / Hh;
      fitRig();
      hypoMat.uniforms.uScale.value = (Hh * rig.zoom * dpr) / (2 * Math.tan(camera.fov * Math.PI / 360));
      if (snowMat) snowMat.uniforms.uScale.value = hypoMat.uniforms.uScale.value;
    }
    function applyView() {
      camera.fov = rig.fov || 30; camera.aspect = W / Hh; var fw = W * rig.zoom, fh = Hh * rig.zoom;
      camera.setViewOffset(fw, fh, fw / 2 - rig.ppx * W, fh / 2 - rig.ppy * Hh, W, Hh);
    }
    /* keep the whole cable between the headline and the waterfall, and in landscape to the right of the headline */
    function screenPts(step) {
      var pts = [], c, s; applyView(); placeCamera(0, true);
      for (c = 0; c < N; c += step) { s = project(PX[c], PY[c], PZ[c]); pts.push([s[0], s[1], 0]); }
      s = project(PX[N - 1], PY[N - 1], PZ[N - 1]); pts.push([s[0], s[1], 110]);      // room for 'end of fibre' left of its dot
      return pts;
    }
    function fitRig() {
      var top = portrait ? box.cb + 30 : 80, bot = box.bottom - 40, left = portrait ? 28 : 0, right = W - 24, it, i, pts;
      for (it = 0; it < 6; it++) {
        pts = screenPts(16); var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
        for (i = 0; i < pts.length; i++) { b.x0 = Math.min(b.x0, pts[i][0]); b.x1 = Math.max(b.x1, pts[i][0]); b.y0 = Math.min(b.y0, pts[i][1]); b.y1 = Math.max(b.y1, pts[i][1]); }
        var k = Math.max((b.y1 - b.y0) / Math.max(60, bot - top), portrait ? (b.x1 - b.x0) / Math.max(60, right - left) : 0);
        if (k > 1.005) { rig.dist *= k * 1.02; continue; }
        var dy = b.y1 > bot ? bot - b.y1 : b.y0 < top ? top - b.y0 : 0, dx = b.x1 > right ? right - b.x1 : (portrait && b.x0 < left) ? left - b.x0 : 0;
        if (portrait && !dx) dx = ((left + right) / 2 - (b.x0 + b.x1) / 2) * 0.9;
        if (Math.abs(dy) < 1 && Math.abs(dx) < 1) break;
        rig.ppy += dy / Hh; rig.ppx += dx / W;
      }
      /* landscape: the part of the cable level with the headline block must lie to its right. Shrink the view about
         its centre by k and shift it by dx, with the largest k for which that fits; refine twice for perspective. */
      if (!portrait) for (it = 0; it < 3; it++) {
        pts = screenPts(12);
        var P0 = rig.ppx * W, P1 = rig.ppy * Hh, L = box.cr + 30;
        var solve = function (k) {
          var need = 0, xmax = -1e9;
          for (var j = 0; j < pts.length; j++) {
            var x = P0 + k * (pts[j][0] - P0), y = P1 + k * (pts[j][1] - P1);
            if (y > box.ct - 20 && y < box.cb + 28) need = Math.max(need, L + pts[j][2] - x);
            xmax = Math.max(xmax, x);
          }
          return { dx: need, ok: xmax + need <= right, xmax: xmax };
        };
        var r1 = solve(1);
        if (r1.ok) { if (r1.dx < 0.5) break; rig.ppx += r1.dx / W; continue; }
        var lo = 0.42, hi = 1, best = solve(lo);
        for (var n = 0; n < 16; n++) { var mid = (lo + hi) / 2, rm = solve(mid); if (rm.ok) { lo = mid; best = rm; } else hi = mid; }
        if (!best.ok) best.dx = Math.max(0, right - best.xmax);         // no room at all: stay on screen rather than clear
        rig.dist /= lo; rig.ppx += best.dx / W;
      }
      applyView();
      mComp.uniforms.uPP.value.set(rig.ppx, 1 - rig.ppy - 0.08);
    }
    function placeCamera(t, neutral) {
      if (!neutral) { pxs += (px - pxs) * 0.04; pys += (py - pys) * 0.04; }
      var az = (rig.az + (reduced || neutral ? 0 : 2.4 * Math.sin(t * 0.09) + pxs * 3.2)) * Math.PI / 180, el = (rig.el + (reduced || neutral ? 0 : 0.6 * Math.sin(t * 0.13 + 1.0) - pys * 1.6)) * Math.PI / 180;
      camera.position.set(rig.tx + rig.dist * Math.cos(el) * Math.cos(az), rig.ty + rig.dist * Math.cos(el) * Math.sin(az), rig.tz + rig.dist * Math.sin(el));
      camera.lookAt(rig.tx, rig.ty, rig.tz); camera.updateMatrixWorld();
      terrainMat.uniforms.uFocus.value.set(rig.tx, rig.ty);
    }
    function project(x, y, z) { vec.set(x, y, z == null ? H(x, y) : z).project(camera); return [(vec.x * 0.5 + 0.5) * W, (-vec.y * 0.5 + 0.5) * Hh, vec.z]; }
    function pick(cx, cy) {
      var r = hero.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); var o = ray.ray.origin, d = ray.ray.direction, pt = 0, t, k2;
      for (var n = 1; n <= 260; n++) {
        t = 0.25 * n;
        if (o.z + d.z * t - H(o.x + d.x * t, o.y + d.y * t) <= 0) {
          var lo = pt, hi = t; for (k2 = 0; k2 < 12; k2++) { var mid = (lo + hi) / 2; if (o.z + d.z * mid - H(o.x + d.x * mid, o.y + d.y * mid) > 0) lo = mid; else hi = mid; }
          return [o.x + d.x * hi, o.y + d.y * hi];
        }
        pt = t;
      }
      return null;
    }
    function clear(x, y) {
      var s = project(x, y, H(x, y));
      return s[2] < 1 && s[0] > (portrait ? 34 : box.cr + 70) && s[0] < W - 80 && s[1] > (portrait ? box.cb + 44 : 100) && s[1] < box.bottom - 80;
    }
    hero.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'touch') return; var r = hero.getBoundingClientRect(); px = (ev.clientX - r.left) / r.width * 2 - 1; py = (ev.clientY - r.top) / r.height * 2 - 1; });
    hero.addEventListener('pointerleave', function () { px = 0; py = 0; });

    /* --- frame --- */
    function frame(now, once, dt) {
      if (!once) clock += dt;
      var i, e, tsim = simT + (once ? 0 : acc), act = 0;
      U.uTime.value = tsim;
      U.uIntro.value = reduced ? 1 : Math.min(1, clock / 2.2);
      for (i = 0; i < events.length; i++) { var ta = tsim - events[i].t0; if (!events[i].hist && ta > 0.02 && ta < 9.5) act++; }
      var norm = 1 / Math.sqrt(Math.max(1, act));            // several earthquakes at once share the light instead of adding up
      for (i = 0; i < MAXEV; i++) {
        e = events[i]; var pair = shells[i];
        if (!e || e.hist) { uEvA[i] = 0; pair[0].visible = pair[1].visible = false; hypoA[i] = 0; stemPos[i * 6 + 2] = stemPos[i * 6 + 5] = -50; continue; }
        var tau = tsim - e.t0, ab = Math.min(e.amp, 1.5) * norm;
        uEv[i].set(e.x, e.y, e.z, e.t0); uEvA[i] = tau < 10 ? ab : 0;
        var rp = VP * tau, rs = VS * tau, lifeP = Math.max(0, 1 - tau / 4.5), lifeS = Math.max(0, 1 - tau / 6);
        pair[0].visible = tau > 0.02 && lifeP > 0; pair[1].visible = tau > 0.02 && lifeS > 0;
        if (pair[0].visible) { pair[0].position.set(e.x, e.y, e.z); pair[0].scale.setScalar(rp); pair[0].material.uniforms.uA.value = ab * (e.user ? 0.45 : 0.22) * lifeP * lifeP / (1 + rp * 0.3); }
        if (pair[1].visible) { pair[1].position.set(e.x, e.y, e.z); pair[1].scale.setScalar(rs); pair[1].material.uniforms.uA.value = ab * (e.user ? 0.7 : 0.35) * lifeS * lifeS / (1 + rs * 0.3); }
        hypoPos[i * 3] = e.x; hypoPos[i * 3 + 1] = e.y; hypoPos[i * 3 + 2] = e.z;
        hypoA[i] = Math.min(1, e.amp) * Math.max(0, 1 - tau / 6) * (tau < 0.15 ? tau / 0.15 : 1);
        var top = H(e.x, e.y), sa = Math.max(0, 1 - tau / 6);
        stemPos[i * 6] = e.x; stemPos[i * 6 + 1] = e.y; stemPos[i * 6 + 2] = e.z; stemPos[i * 6 + 3] = e.x; stemPos[i * 6 + 4] = e.y; stemPos[i * 6 + 5] = e.z + (top - e.z) * sa;
      }
      hgeo.attributes.position.needsUpdate = true; hgeo.attributes.aA.needsUpdate = true; sgeo.attributes.position.needsUpdate = true;
      for (i = 0; i < N; i++) excData[i * 4] = exc[i] * 255;
      excTex.needsUpdate = true;

      var pu = pulseAt(clock, pst);
      CU.uReveal.value = pu.reveal; CU.uPulse.value = pu.pulse;
      CU.uMark.value = markCh >= 0 ? markCh / (N - 1) : -1;

      placeCamera(clock);
      overlay(project, pu.intro);

      renderer.setRenderTarget(rtScene); renderer.clear(); renderer.render(scene, camera);
      mDown.uniforms.t.value = rtScene.texture; mDown.uniforms.uTexel.value.set(1 / rtScene.width, 1 / rtScene.height); pass(mDown, rtA0);
      mBlur.uniforms.t.value = rtA0.texture; mBlur.uniforms.uDir.value.set(1 / rtA0.width, 0); pass(mBlur, rtA1);
      mBlur.uniforms.t.value = rtA1.texture; mBlur.uniforms.uDir.value.set(0, 1 / rtA0.height); pass(mBlur, rtA0);
      mDown.uniforms.t.value = rtA0.texture; mDown.uniforms.uTexel.value.set(0.5 / rtA0.width, 0.5 / rtA0.height); pass(mDown, rtB0);
      mBlur.uniforms.t.value = rtB0.texture; mBlur.uniforms.uDir.value.set(1.5 / rtB0.width, 0); pass(mBlur, rtB1);
      mBlur.uniforms.t.value = rtB1.texture; mBlur.uniforms.uDir.value.set(0, 1.5 / rtB0.height); pass(mBlur, rtB0);
      mComp.uniforms.tS.value = rtScene.texture; mComp.uniforms.tA.value = rtA0.texture; mComp.uniforms.tB.value = rtB0.texture; mComp.uniforms.uTime.value = reduced ? 0.37 : clock; pass(mComp, null);
    }
    api.setRig = function (o) { api.dbg = o; resize(); frame(performance.now(), true, 0); return rig; };
    return { project: project, pick: pick, clear: clear, frame: frame, resize: resize, destroy: null };
  }

  /* ------------------------------------------------------------------ without WebGL or three.js: a map view */
  function init2D() {
    var cv = document.createElement('canvas'); cv.className = 'map2d'; cv.setAttribute('aria-hidden', 'true');
    if (sceneCv) { sceneCv.style.display = 'none'; hero.insertBefore(cv, sceneCv); } else hero.insertBefore(cv, hero.firstChild);
    var ctx = cv.getContext('2d'), base = document.createElement('canvas'), g2 = base.getContext('2d');
    var dpr = 1, s = 40, ox = 0, oy = 0, R = { x0: 0, y0: 0, x1: 1, y1: 1 }, clock = 0, pst = { t0: 7 }, c;
    var gx0 = 1e9, gx1 = -1e9, gy0 = 1e9, gy1 = -1e9;
    for (c = 0; c < N; c += 4) { gx0 = Math.min(gx0, PX[c]); gx1 = Math.max(gx1, PX[c]); gy0 = Math.min(gy0, PY[c]); gy1 = Math.max(gy1, PY[c]); }
    function xy(x, y) { return [ox + x * s, oy - y * s]; }
    function project(x, y) { var p = xy(x, y); return [p[0], p[1], 0]; }
    function fit() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = base.width = Math.round(W * dpr); cv.height = base.height = Math.round(Hh * dpr);
      R = portrait ? { x0: 22, x1: W - 18, y0: box.cb + 26, y1: box.bottom - 34 } : { x0: box.cr + 40, x1: W - 24, y0: 84, y1: box.bottom - 34 };
      if (R.y1 - R.y0 < 90) R.y1 = R.y0 + 90;
      s = 0.86 * Math.min((R.x1 - R.x0) / (gx1 - gx0), (R.y1 - R.y0) / (gy1 - gy0));
      ox = (R.x0 + R.x1) / 2 - s * (gx0 + gx1) / 2; oy = (R.y0 + R.y1) / 2 + s * (gy0 + gy1) / 2;
      paintBase();
    }
    /* the still part: terrain as scan-lines that fade out at the edge of the map, and the two coastlines */
    function paintBase() {
      var x, y, h, cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2, rx = (R.x1 - R.x0) / 2 + 30, ry = (R.y1 - R.y0) / 2 + 26;
      g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.clearRect(0, 0, W, Hh);
      for (y = Math.round(R.y0 - 26); y <= R.y1 + 26; y += 5) for (x = Math.round(R.x0 - 30); x <= R.x1 + 30; x += 3) {
        var ex = (x - cx) / rx, ey = (y - cy) / ry, v = 1 - (ex * ex + ey * ey); if (v <= 0) continue;
        h = H((x - ox) / s, (oy - y) / s); var al = Math.min(1, v * 2.2);
        g2.fillStyle = h > 0 ? 'rgba(199,160,117,' + (al * (0.10 + 0.22 * Math.min(1, h / LAND_H))).toFixed(3) + ')' : 'rgba(77,128,214,' + (al * (0.07 + 0.16 * Math.min(1, -h / SEA_D))).toFixed(3) + ')';
        g2.fillRect(x, y, 3, 1);
      }
      g2.save(); g2.beginPath(); g2.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); g2.clip();
      g2.lineWidth = 1; g2.strokeStyle = 'rgba(245,217,168,.5)';
      var ya = (oy - R.y1 - 30) / s, yb = (oy - R.y0 + 30) / s;
      [CW, CE].forEach(function (P) { g2.beginPath(); for (var k = 0, wy = ya; wy <= yb; wy += 0.05, k++) { var q = xy(coast(P, wy), wy); if (!k) g2.moveTo(q[0], q[1]); else g2.lineTo(q[0], q[1]); } g2.stroke(); });
      g2.restore();
    }
    function frame(now, once, dt) {
      if (!once) clock += dt;
      var tsim = simT + (once ? 0 : acc), i, e, p, a, b;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* wavefronts on the surface, clipped to the map and stopped at 3.5 km */
      ctx.save(); ctx.beginPath(); ctx.rect(R.x0 - 24, R.y0 - 20, R.x1 - R.x0 + 48, R.y1 - R.y0 + 40); ctx.clip();
      for (i = 0; i < events.length; i++) {
        e = events[i]; if (e.hist) continue; var tau = tsim - e.t0; if (tau < 0 || tau > 9) continue; p = xy(e.x, e.y);
        ctx.fillStyle = 'rgba(255,214,160,' + (0.9 * Math.max(0, 1 - tau / 5)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 6.2832); ctx.fill();
        [[VP, '150,200,255'], [VS, '255,178,84']].forEach(function (k) {
          var r2 = k[0] * k[0] * tau * tau - e.z * e.z; if (r2 <= 0) return; var rk = Math.sqrt(r2); if (rk > 3.5) return;
          ctx.beginPath(); ctx.arc(p[0], p[1], rk * s, 0, 6.2832); ctx.strokeStyle = 'rgba(' + k[1] + ',' + (0.75 * (1 - tau / 9) * (1 - rk / 3.5)).toFixed(3) + ')'; ctx.lineWidth = 1.4; ctx.stroke();
        });
      }
      ctx.restore();
      /* the cable, drawn in by the first pulse, glowing where it is shaken */
      var pu = pulseAt(clock, pst), cmax = Math.min(N - 1, Math.floor(pu.reveal * (N - 1)));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); for (c = 0; c <= cmax; c += 4) { a = xy(PX[c], PY[c]); if (!c) ctx.moveTo(a[0], a[1]); else ctx.lineTo(a[0], a[1]); }
      ctx.strokeStyle = 'rgba(255,180,84,.16)'; ctx.lineWidth = 7; ctx.stroke();
      for (c = 0; c + 4 <= cmax; c += 4) {
        a = xy(PX[c], PY[c]); b = xy(PX[c + 4], PY[c + 4]); var e2 = exc[c];
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = 'rgba(255,' + Math.round(170 + 70 * e2) + ',' + Math.round(84 + 130 * e2) + ',' + (0.7 + 0.3 * e2).toFixed(3) + ')'; ctx.lineWidth = 1.6 + 2.6 * e2; ctx.stroke();
      }
      var hc = pu.pulse >= 0 ? pu.pulse : (pu.reveal < 1 ? pu.reveal : -1);
      if (hc >= 0) {
        p = xy(PX[Math.round(hc * (N - 1))], PY[Math.round(hc * (N - 1))]);
        var gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 14); gr.addColorStop(0, 'rgba(255,236,206,1)'); gr.addColorStop(1, 'rgba(255,180,84,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1], 14, 0, 6.2832); ctx.fill();
      }
      if (markCh >= 0) { p = xy(PX[markCh], PY[markCh]); ctx.fillStyle = '#ffe6c2'; ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 6.2832); ctx.fill(); }
      overlay(project, pu.intro);
    }
    function pick(cx, cy) {
      var r = hero.getBoundingClientRect(), X = cx - r.left, Y = cy - r.top;
      if (X < R.x0 - 30 || X > R.x1 + 30 || Y < R.y0 - 30 || Y > R.y1 + 30) return null;
      return [(X - ox) / s, -(Y - oy) / s];
    }
    function clear(x, y) { var q = xy(x, y); return q[0] > R.x0 + 24 && q[0] < R.x1 - 24 && q[1] > R.y0 + 20 && q[1] < R.y1 - 20; }
    function destroy() { if (cv.parentNode) cv.parentNode.removeChild(cv); if (sceneCv) sceneCv.style.display = ''; }
    return { project: project, pick: pick, clear: clear, frame: frame, resize: fit, destroy: destroy };
  }

  /* ------------------------------------------------------------------ start */
  var stillDone = false;
  function attach(v, m) {
    if (view && view.destroy) view.destroy();
    view = v; mode = m; api.project = v.project;
    hero.classList.toggle('gl', m === '3d'); hero.classList.toggle('flat', m === '2d');
    relayout();
    if (!reduced) nextAuto = simT + (m === '3d' ? 3.6 : 2.0);       // the first one comes once the cable has drawn in
    else if (!stillDone) {
      /* one still frame: an earthquake caught a moment after it began */
      stillDone = true; events.length = 0; addEvent(0.9, -1.3, H(0.9, -1.3) - 0.9, 1.5, true); advance(1.6); still();
    } else still();
  }
  window.__fibreInit = function (lib) {
    if (mode === '3d') return;
    if (lib && lib.WebGLRenderer) { T = lib; var v = init3D(); if (v) { attach(v, '3d'); return; } }
    if (mode === 'none') attach(init2D(), '2d');
  };

  measure(); buildTicks(); sizeWf(); blitWf();
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(hero); else window.addEventListener('resize', relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  if (window.IntersectionObserver) new IntersectionObserver(function (en) { heroVis = en[0].isIntersecting; if (heroVis) start(); else stop(); }, { threshold: 0.02 }).observe(hero);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  start();
  if (window.THREE) window.__fibreInit(window.THREE);
  setTimeout(function () { if (mode === 'none') window.__fibreInit(null); }, 12000);   // a library that never arrives must not leave the hero empty
})();
