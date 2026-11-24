/* v3e · INVISIBLE — the scene behind the page.
   #sky     a live long exposure: stars turn around the pole and their trails add up in an off-screen buffer
   #ground  the horizon (its ridgeline is the real seismogram in window.YW_SEIS) and the cross-section under it
   #fx      what moves under the ground: the depth ruler, wavefronts, the small earthquakes on the fault
   One requestAnimationFrame loop. Nothing is drawn for a layer that is off-screen. */
(function () {
  'use strict';

  var root = document.documentElement;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var skyC = document.getElementById('sky'), gndC = document.getElementById('ground'), fxC = document.getElementById('fx');
  if (!skyC || !skyC.getContext) { root.className += ' no-canvas'; return; }
  var sk = skyC.getContext('2d'), gd = gndC.getContext('2d'), fx = fxC.getContext('2d');

  var W = 0, H = 0, sy = 0;
  var M = { Y0: 0, Yend: 0, Lg: 0, docH: 0, Yct: 0, anch: [[0, 0]], asc: 0, footH: 90, dz0: 0, dz1: 0 };
  var PAR = 0.25;                                   // how much slower than the page the sky slides

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s += 0x6D2B79F5; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function docTop(el) { return el.getBoundingClientRect().top + (window.pageYOffset || 0); }

  /* ================================================================ the seismogram */
  var SEIS = (function () {
    var S = window.YW_SEIS;
    if (!S || !S.bb || !S.meta) return null;
    var n = S.bb.length, bb = new Float32Array(n), lp = new Float32Array(n), i;
    for (i = 0; i < n; i++) { bb[i] = S.bb[i] / 32000; lp[i] = (S.lp ? S.lp[i] : S.bb[i]) / 32000; }
    function env(x, w) {                             // Hann-weighted mean of |x|
      var out = new Float32Array(n), h = (w - 1) >> 1, k = new Float32Array(w), s = 0, j, q, a;
      for (j = 0; j < w; j++) { k[j] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (j + 1) / (w + 1)); s += k[j]; }
      var ab = new Float32Array(n); for (j = 0; j < n; j++) ab[j] = Math.abs(x[j]);
      for (i = 0; i < n; i++) {
        a = 0;
        for (j = 0; j < w; j++) { q = i + j - h; if (q < 0) q = 0; else if (q >= n) q = n - 1; a += ab[q] * k[j]; }
        out[i] = a / s;
      }
      return out;
    }
    return { n: n, t0: S.meta.t_start_rel || -120, fs: S.meta.fs || 1, bb: bb, lp: lp,
             e121: env(bb, 121), e241: env(bb, 241), eLP: env(lp, 301), ph: S.meta.phases || {} };
  })();

  function sampLin(arr, tA, tB, n) {
    var out = new Float32Array(n), L = arr.length, i, q, a, f;
    for (i = 0; i < n; i++) {
      q = clamp((tA + (tB - tA) * i / (n - 1) - SEIS.t0) * SEIS.fs, 0, L - 1.001); a = q | 0; f = q - a;
      out[i] = arr[a] * (1 - f) + arr[a + 1] * f;
    }
    return out;
  }
  function sampBox(arr, tA, tB, n) {
    var out = new Float32Array(n), L = arr.length, dt = (tB - tA) / (n - 1), i, a, b, q, s, m;
    for (i = 0; i < n; i++) {
      a = Math.round((tA + dt * (i - 0.5) - SEIS.t0) * SEIS.fs); b = Math.round((tA + dt * (i + 0.5) - SEIS.t0) * SEIS.fs);
      if (b <= a) b = a + 1; s = 0; m = 0;
      for (q = a; q < b; q++) if (q >= 0 && q < L) { s += arr[q]; m++; }
      out[i] = m ? s / m : 0;
    }
    return out;
  }
  function norm01(a, pow) {
    var mx = 1e-12, i; for (i = 0; i < a.length; i++) if (a[i] > mx) mx = a[i];
    for (i = 0; i < a.length; i++) a[i] = Math.pow(a[i] / mx, pow);
    return a;
  }
  function normAbs(a) {
    var mx = 1e-12, i; for (i = 0; i < a.length; i++) if (Math.abs(a[i]) > mx) mx = Math.abs(a[i]);
    for (i = 0; i < a.length; i++) a[i] /= mx;
    return a;
  }
  function smooth(src, rad) {                         // Hann blur, radius in samples
    if (rad < 1) return src;
    var n = src.length, out = new Float32Array(n), w = 2 * rad + 1, k = new Float32Array(w), s = 0, i, j, q, a;
    for (j = 0; j < w; j++) { k[j] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (j + 1) / (w + 1)); s += k[j]; }
    for (i = 0; i < n; i++) {
      a = 0;
      for (j = 0; j < w; j++) { q = i + j - rad; if (q < 0) q = 0; else if (q >= n) q = n - 1; a += src[q] * k[j]; }
      out[i] = a / s;
    }
    return out;
  }

  /* ================================================================ layout */
  function depthAt(yw) {                             // metres, from the anchors in the markup (data-depth)
    var a = M.anch, i, f;
    if (yw <= 0) return 0;
    for (i = 1; i < a.length; i++) {
      if (yw <= a[i][0] || i === a.length - 1) {
        f = clamp((yw - a[i - 1][0]) / Math.max(1, a[i][0] - a[i - 1][0]), 0, 1);
        if (a[i - 1][1] > 0 && a[i][1] > 0) return a[i - 1][1] * Math.pow(a[i][1] / a[i - 1][1], f);
        return lerp(a[i - 1][1], a[i][1], f);
      }
    }
    return 0;
  }
  function ywAt(d) {                                 // inverse, on the way down only
    var a = M.anch, i, f;
    for (i = 1; i < a.length; i++) {
      if (a[i][1] < a[i - 1][1]) break;
      if (d <= a[i][1]) {
        if (a[i - 1][1] > 0) f = Math.log(d / a[i - 1][1]) / Math.log(a[i][1] / a[i - 1][1]);
        else f = d / a[i][1];
        return lerp(a[i - 1][0], a[i][0], clamp(f, 0, 1));
      }
    }
    return M.Lg;
  }
  function fmtTick(d) { return d < 1 ? Math.round(d * 100) + ' cm' : d < 1000 ? d + ' m' : d / 1000 + ' km'; }
  function fmtDepth(d) {
    if (d < 0.005) return '0 m';
    if (d < 1) return Math.round(d * 100) + ' cm';
    if (d < 10) return d.toFixed(1) + ' m';
    if (d < 1000) return Math.round(d) + ' m';
    if (d < 10000) return (d / 1000).toFixed(1) + ' km';
    return Math.round(d / 1000) + ' km';
  }

  function measure() {
    W = root.clientWidth || window.innerWidth;
    H = skyC.clientHeight || window.innerHeight;
    var ug = document.getElementById('underground'), ct = document.getElementById('contact'), ft = document.getElementById('foot');
    if (!ug) return;
    M.Y0 = docTop(ug); M.Lg = ug.offsetHeight; M.Yend = M.Y0 + M.Lg;
    M.docH = Math.max(root.scrollHeight, document.body.scrollHeight);
    M.Yct = ct ? docTop(ct) : M.docH;
    M.footH = ft ? ft.offsetHeight : 90;
    var a = [[0, 0]], els = ug.querySelectorAll('[data-depth]'), i, el;
    for (i = 0; i < els.length; i++) { el = els[i]; a.push([docTop(el) + el.offsetHeight - M.Y0, parseFloat(el.getAttribute('data-depth'))]); }
    M.anch = a;
    M.asc = a.length > 2 && a[a.length - 1][1] === 0 ? a[a.length - 1][0] - a[a.length - 2][0] : 0;
    // the descent: the one screen under the ground without a column of text, which the fault has to itself
    var ds = ug.querySelector('.descent'), fs = document.getElementById('fault');
    M.dz0 = ds ? docTop(ds) - M.Y0 : 0.3 * M.Lg;
    M.dz1 = fs ? docTop(fs) - M.Y0 : M.dz0 + H;
  }

  /* ================================================================ the ridges */
  var STEP = 2, N = 0, near, far1, far2, foot, lev = [], LEVSIG = [0, 3, 7, 16, 36, 80, 180];
  var RB = 50, RH = 220, nearMax = 0, win = [-120, 6000], markers = [];

  function buildRidges() {
    N = Math.ceil(W / STEP) + 2;
    var narrow = W < 700, i;
    win = narrow ? [420, 4400] : [-120, 6000];
    // from 700 to 860 px the ridge note runs across the whole foot of the screen: more ground, so the house stays above it
    var tablet = W >= 700 && W < 861;
    RH = clamp(0.25 * H, 120, 300); RB = tablet ? clamp(0.1 * H, 36, 104) : clamp(0.058 * H, 36, 66);
    near = new Float32Array(N); far1 = new Float32Array(N); far2 = new Float32Array(N); foot = new Float32Array(N);
    if (SEIS) {
      var g = norm01(sampLin(SEIS.e121, win[0], win[1], N), 0.5);
      var wg = normAbs(sampBox(SEIS.bb, win[0], win[1], N)), wl = normAbs(sampBox(SEIS.lp, win[0], win[1], N));
      var g2 = norm01(sampLin(SEIS.e241, win[0] - 560, win[1] + 950, N), 0.5);
      var w2 = normAbs(sampBox(SEIS.bb, win[0] - 560, win[1] + 950, N));
      var g1 = norm01(sampLin(SEIS.eLP, -120, narrow ? 6400 : 9000, N), 0.5);
      for (i = 0; i < N; i++) {
        near[i] = Math.max(6, RB + RH * g[i] + 0.115 * RH * wl[i] + 0.05 * RH * wg[i]);
        far2[i] = RB + 0.047 * H + 0.96 * RH * g2[i] + 0.05 * RH * w2[i];
        far1[i] = RB + 0.094 * H + 1.02 * RH * g1[i];
      }
      near = smooth(near, 1); far2 = smooth(far2, narrow ? 3 : 6); far1 = smooth(far1, narrow ? 7 : 14);
      var gf = norm01(sampLin(SEIS.e241, 300, narrow ? 5200 : 8200, N), 0.5), wf = normAbs(sampBox(SEIS.lp, 300, narrow ? 5200 : 8200, N));
      for (i = 0; i < N; i++) foot[N - 1 - i] = 0.62 * RH * gf[i] + 0.075 * RH * wf[i];   // mirrored: the range seen from the other side
      foot = smooth(foot, 1);
    } else {                                            // no data: a quiet synthetic range, so the page still works
      for (i = 0; i < N; i++) {
        var x = i / N;
        near[i] = RB + RH * (0.5 + 0.5 * Math.sin(x * 9 + 1)) * Math.exp(-Math.pow((x - 0.5) / 0.3, 2));
        far2[i] = near[i] * 0.9 + 0.05 * H; far1[i] = near[i] * 0.8 + 0.1 * H; foot[i] = near[N - 1 - i] * 0.6;
      }
    }
    nearMax = 0; for (i = 0; i < N; i++) if (near[i] > nearMax) nearMax = near[i];
    lev = [near];
    for (i = 1; i < LEVSIG.length; i++) lev.push(smooth(near, Math.round(LEVSIG[i] * 1.25 / STEP)));
    markers = [];
    if (SEIS) {
      var add = function (name, t, label) {
        var f = (t - win[0]) / (win[1] - win[0]);
        if (f > 0.03 && f < 0.95) markers.push({ x: f * W, name: name, label: label });
      };
      if (SEIS.ph.P) add('P', SEIS.ph.P + 14, fmtClock(SEIS.ph.P));
      if (SEIS.ph.S) add('S', SEIS.ph.S + 14, fmtClock(SEIS.ph.S));
    }
  }
  function fmtClock(s) { var m = Math.floor(s / 60); return m + ' min ' + Math.round(s - m * 60) + ' s'; }
  function ridgeAt(arr, x) { var q = clamp(x / STEP, 0, N - 1.001), a = q | 0, f = q - a; return arr[a] * (1 - f) + arr[a + 1] * f; }

  /* ================================================================ the strata */
  var layers = [], faultY0 = 0, faultX = 0, faultIn = 0, faultMargin = true;

  function buildStrata() {
    var r = rng(20250729), yw = 15, z1 = ywAt(2), z2 = ywAt(900), z3 = ywAt(8000), end = M.Lg + 40, packet = 0, i;
    var dens = W < 700 ? 0.6 : 1;
    layers = [];
    while (yw < end && layers.length < 1400) {
      var zone = yw < z1 ? 0 : yw < z2 ? 1 : yw < z3 ? 2 : 3, sp, L = { yw: yw, zone: zone };
      if (zone === 0) sp = 13 + r() * 15;
      else if (zone === 1) { if (packet > 0) { sp = 5 + r() * 3; packet--; } else { sp = 12 + r() * 26; if (r() < 0.2) packet = 2 + (r() * 4 | 0); } }
      else if (zone === 2) sp = 24 + r() * 34;
      else sp = 40 + r() * 54;
      L.a = Math.exp(-yw / 620);
      var sig = yw * 0.075, li = 0;
      while (li < LEVSIG.length - 2 && sig > LEVSIG[li + 1]) li++;
      L.li = li; L.lf = clamp((sig - LEVSIG[li]) / (LEVSIG[li + 1] - LEVSIG[li]), 0, 1);
      L.amp = Math.min(zone > 1 ? 17 : 11, yw * 0.006);
      L.p1 = yw * 0.0023 + 1.7; L.p2 = -yw * 0.0031 + 0.4;
      var t = zone === 0 ? 0 : zone === 1 ? clamp((yw - z1) / Math.max(1, z2 - z1), 0, 1) : 1;
      var c0 = [186, 134, 96], c1 = [150, 126, 132], c2 = [118, 128, 196], c3 = [98, 112, 190];
      var c = zone === 0 ? c0 : zone === 1 ? [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)] : zone === 2 ? c2 : c3;
      L.col = (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0);
      L.alpha = (zone === 0 ? 0.36 : zone === 1 ? 0.3 : zone === 2 ? 0.27 : 0.22) * (0.65 + r() * 0.6);
      L.lw = r() < 0.16 ? 1.25 : 0.75;
      L.dash = zone === 0 && r() < 0.35 ? [7 + r() * 9, 4 + r() * 5] : (zone >= 2 && r() < 0.18 ? [26 + r() * 40, 5 + r() * 8] : null);
      L.sp = sp;
      // what fills the bed between this line and the next
      var kind = 0, p = r();
      if (zone === 0) kind = 1;                                        // pebbles
      else if (zone === 1) kind = packet > 0 ? 0 : p < 0.26 ? 2 : p < 0.46 ? 3 : p < 0.64 ? 4 : 0;   // dots, dashes, joints
      else if (zone === 2) kind = p < 0.5 ? 5 : 0;                     // inclined joints
      else kind = p < 0.42 ? 6 : 0;                                    // crosses
      L.kind = kind; L.marks = null;
      if (kind) {
        var per = kind === 1 ? 430 : kind === 2 ? 560 : kind === 3 ? 760 : kind === 4 ? 70 * sp : kind === 5 ? 110 * sp : 3000;
        var cnt = Math.min(520, Math.round(W * sp / per * dens)), mk = new Float32Array(cnt * 3);
        for (i = 0; i < cnt; i++) { mk[i * 3] = r() * W; mk[i * 3 + 1] = 0.12 + r() * 0.76; mk[i * 3 + 2] = r(); }
        L.marks = mk;
      }
      layers.push(L);
      yw += sp;
    }
    // The fault comes into view at the top of the descent and runs through it well inside the screen.
    // Where there is an outer margin (1328 px and wider) it then bends out and runs on down the margin,
    // beside the text; on narrower screens it bends away and fades out before the text starts.
    faultY0 = M.dz0;
    var colR = (W + Math.min(1160, W - 2 * padPx())) / 2;
    faultMargin = W - colR >= 84;
    faultX = faultMargin ? Math.min(W - 44, colR + Math.max(26, (W - colR) * 0.52)) : W + 40;
    faultIn = W * (W < 700 ? 0.9 : 0.84);
  }
  function padPx() { return clamp(W * 0.05, 20, 72); }
  var BEND = 230;
  function inDescent(yw) { return yw > M.dz0 && yw < M.dz1; }
  function faultEnd() { return faultMargin ? M.Lg - M.asc * 0.4 : M.dz1; }
  function faultFade(yw) { return sstep(M.dz0, M.dz0 + 200, yw) * (1 - sstep(faultEnd() - 200, faultEnd(), yw)); }   // 0..1 along the fault
  function layerOff(L, i) {                          // px below the baseline, at sample i
    var x = i * STEP, y = L.yw + L.amp * (Math.sin(x * 0.0041 + L.p1) + 0.55 * Math.sin(x * 0.0113 + L.p2));
    if (L.a > 0.004) y -= L.a * (lev[L.li][i] * (1 - L.lf) + lev[L.li + 1][i] * L.lf);
    return y;
  }
  function faultXAt(yw) {
    var bend = sstep(M.dz0 - 60, M.dz0 + BEND, yw) * (1 - sstep(M.dz1 - BEND, M.dz1 + 60, yw)), k = W < 700 ? 0.45 : 1;   // a calmer trace on phones, clear of the words
    return lerp(faultX, faultIn, bend) + k * (20 * Math.sin(yw * 0.0032 + 0.5) + 8 * Math.sin(yw * 0.0113));
  }

  var BODY = null;
  function bodyStops() {
    var z1 = ywAt(2), z2 = ywAt(900), z3 = ywAt(8000);
    BODY = [[-1e6, [5, 6, 15]], [0, [5, 6, 15]], [Math.min(260, z1 * 0.5), [14, 9, 12]], [z1, [17, 11, 14]], [z2, [12, 12, 28]], [z3, [9, 11, 31]], [Math.max(z3 + 1, M.Lg - M.asc), [7, 9, 26]], [M.Lg, [5, 6, 15]], [1e7, [5, 6, 15]]];
  }
  function bodyCol(yw) {
    for (var i = 1; i < BODY.length; i++) if (yw <= BODY[i][0]) {
      var f = clamp((yw - BODY[i - 1][0]) / Math.max(1, BODY[i][0] - BODY[i - 1][0]), 0, 1), a = BODY[i - 1][1], b = BODY[i][1];
      return 'rgb(' + (lerp(a[0], b[0], f) | 0) + ',' + (lerp(a[1], b[1], f) | 0) + ',' + (lerp(a[2], b[2], f) | 0) + ')';
    }
    return 'rgb(5,6,15)';
  }

  /* ================================================================ draw: ground */
  var statsMs = 0;
  function ridgeFill(arr, base, style) {
    var i;
    gd.beginPath(); gd.moveTo(-2, H + 2);
    for (i = 0; i < N; i++) gd.lineTo(i * STEP, base - arr[i]);
    gd.lineTo(W + 2, H + 2); gd.closePath(); gd.fillStyle = style; gd.fill();
  }

  function drawGround() {
    var t0 = performance.now(), i, j, k, L, y, base = M.Y0 - sy;
    gd.setTransform(DPR, 0, 0, DPR, 0, 0);
    gd.clearRect(0, 0, W, H);

    if (sy < M.Yend && base - RB - 1.6 * RH - 0.1 * H < H) {
      var ridgeOn = base > -30;
      if (ridgeOn) {                                   // the far ranges rise more slowly: they sink behind the near one
        var b1 = M.Y0 - sy * 0.84, b2 = M.Y0 - sy * 0.92, g;
        g = gd.createLinearGradient(0, b1 - far1Max(), 0, b1); g.addColorStop(0, '#262148'); g.addColorStop(0.5, '#181a3c'); g.addColorStop(1, '#101230');
        ridgeFill(far1, b1, g);
        g = gd.createLinearGradient(0, b2 - 1.2 * RH, 0, b2); g.addColorStop(0, '#11122c'); g.addColorStop(1, '#090a1b');
        ridgeFill(far2, b2, g);
      }
      // the near ground: black against the sky, a cross-section once you are inside it
      var grad = gd.createLinearGradient(0, 0, 0, H);
      for (i = 0; i <= 6; i++) grad.addColorStop(i / 6, bodyCol(i / 6 * H - base));
      gd.save();
      gd.beginPath();
      if (ridgeOn) { gd.moveTo(-2, H + 2); for (i = 0; i < N; i++) gd.lineTo(i * STEP, base - near[i]); gd.lineTo(W + 2, H + 2); gd.closePath(); }
      else gd.rect(0, 0, W, H);
      gd.fillStyle = grad; gd.fill();
      gd.clip();

      var reveal = sstep(0.015 * H, 0.5 * H, sy), fadeA = M.asc || 1, bottom = M.Lg;
      if (reveal > 0.003) {
        gd.lineJoin = 'round';
        var first = 0;
        // layers are sorted by depth; skip those above the screen quickly
        for (k = 0; k < layers.length; k++) { first = k; if (base + layers[k].yw + 18 >= 0) break; }
        for (k = Math.max(0, first - 1); k < layers.length; k++) {
          L = layers[k];
          var top = base + L.yw - (L.a > 0.004 ? L.a * nearMax : 0) - 18;
          if (top > H) break;
          var al = L.alpha * reveal * (k < 3 ? 0.55 + 0.15 * k : 1) * (1 - sstep(bottom - fadeA, bottom - fadeA * 0.25, L.yw));
          if (al < 0.004) continue;
          var st = L.a > 0.004 ? 1 : 3;
          gd.beginPath();
          for (i = 0; i < N; i += st) { y = base + layerOff(L, i); if (i) gd.lineTo(i * STEP, y); else gd.moveTo(0, y); }
          y = base + layerOff(L, N - 1); gd.lineTo((N - 1) * STEP, y);
          gd.strokeStyle = 'rgba(' + L.col + ',' + al.toFixed(3) + ')'; gd.lineWidth = L.lw;
          if (L.dash) gd.setLineDash(L.dash);
          gd.stroke();
          if (L.dash) gd.setLineDash([]);
          // the bed below this line
          if (L.marks && k + 1 < layers.length) {
            var L2 = layers[k + 1], mk = L.marks, n3 = mk.length, x, ix, ya, yb, tt, s, ma = al * 1.15;
            gd.beginPath();
            for (j = 0; j < n3; j += 3) {
              x = mk[j]; ix = clamp(Math.round(x / STEP), 0, N - 1); tt = mk[j + 1]; s = mk[j + 2];
              ya = base + layerOff(L, ix); yb = base + layerOff(L2, ix); y = ya + (yb - ya) * tt;
              if (y < -8 || y > H + 8) continue;
              if (L.kind === 1) { var rr = 0.5 + s * 1.3; gd.moveTo(x + rr, y); gd.arc(x, y, rr, 0, 6.2832); }
              else if (L.kind === 2) { gd.moveTo(x + 0.7, y); gd.arc(x, y, 0.7, 0, 6.2832); }
              else if (L.kind === 3) { gd.moveTo(x - 3 - s * 4, y); gd.lineTo(x + 3 + s * 4, y); }
              else if (L.kind === 4) { gd.moveTo(x + (s - 0.5) * 3, ya + 2); gd.lineTo(x - (s - 0.5) * 3, yb - 2); }
              else if (L.kind === 5) { gd.moveTo(x - 4 - s * 5, ya + 3); gd.lineTo(x + 4 + s * 5, yb - 3); }
              else { gd.moveTo(x - 2.5, y); gd.lineTo(x + 2.5, y); gd.moveTo(x, y - 2.5); gd.lineTo(x, y + 2.5); }
            }
            if (L.kind <= 2) { gd.fillStyle = 'rgba(' + L.col + ',' + (ma * 0.85).toFixed(3) + ')'; gd.fill(); }
            else { gd.strokeStyle = 'rgba(' + L.col + ',' + (ma * 0.8).toFixed(3) + ')'; gd.lineWidth = 0.7; gd.stroke(); }
          }
        }
        drawFault(base, reveal);
      }
      // a lamp in the middle of the view, dark towards the edges
      var R = Math.max(W, H) * 0.78, vg = gd.createRadialGradient(W * 0.5, H * 0.5, R * 0.22, W * 0.5, H * 0.5, R);
      vg.addColorStop(0, 'rgba(4,5,13,0)'); vg.addColorStop(1, 'rgba(4,5,13,' + (0.62 * reveal).toFixed(3) + ')');
      gd.fillStyle = vg; gd.fillRect(0, 0, W, H);
      gd.restore();

      if (ridgeOn) drawOrnaments(base);
    }

    // the horizon comes back at the very end of the page
    var fb = M.docH - sy;
    if (fb - M.footH - 0.8 * RH < H + 4 && sy + H > M.Yct) {
      var fbase = fb - M.footH - 22;
      ridgeFill(foot, fbase, '#05060f');
      gd.fillStyle = '#05060f'; gd.fillRect(0, fbase - 1, W, H - fbase + 2);
    }
    statsMs = performance.now() - t0;
  }
  function far1Max() { return RB + 0.094 * H + 1.02 * RH; }

  function drawFault(base, reveal) {
    var yw, y, x, a = reveal;
    if (a < 0.01 || base + faultY0 > H + 40) return;
    var from = Math.max(faultY0, -base - 40), to = Math.min(faultEnd(), -base + H + 40);
    if (to <= from) return;
    var path = function (off) {
      gd.beginPath();
      for (yw = from; yw <= to + 14; yw += 14) { x = faultXAt(yw) + off; y = base + yw; if (yw === from) gd.moveTo(x, y); else gd.lineTo(x, y); }
    };
    // every stroke fades in over the first 200 px of the fault and out over its last 200 px
    var ya = base + M.dz0, yb = base + faultEnd(), f = 200 / Math.max(400, yb - ya);
    var style = function (rgb, al) {
      var g = gd.createLinearGradient(0, ya, 0, yb), c = 'rgba(' + rgb + ',', on = c + (al * a).toFixed(3) + ')';
      g.addColorStop(0, c + '0)'); g.addColorStop(f, on); g.addColorStop(1 - f, on); g.addColorStop(1, c + '0)');
      return g;
    };
    path(0); gd.strokeStyle = style('4,5,12', 0.9); gd.lineWidth = 9; gd.stroke();
    var edge = style('232,206,176', 0.4);
    path(-3.6); gd.strokeStyle = edge; gd.lineWidth = 0.8; gd.stroke();
    path(3.6); gd.stroke();
    gd.beginPath();
    for (yw = Math.ceil(from / 13) * 13; yw <= to; yw += 13) { x = faultXAt(yw); y = base + yw; gd.moveTo(x - 2.6, y + 1.6); gd.lineTo(x + 2.6, y - 1.6); }
    gd.strokeStyle = style('232,206,176', 0.22); gd.lineWidth = 0.6; gd.stroke();
    // strike-slip: one side moves towards you, the other away
    var yws = M.dz0 + 420, ys = base + yws, o = W < 700 ? 13 : 22, r = W < 700 ? 4.5 : 6.5, c = r * 0.707;
    x = faultXAt(yws);
    if (x + o + r + 2 < W && ys > -30 && ys < H + 30) {
      gd.strokeStyle = 'rgba(232,206,176,' + (0.55 * a * faultFade(yws)).toFixed(3) + ')'; gd.fillStyle = gd.strokeStyle; gd.lineWidth = 0.9;
      gd.beginPath(); gd.arc(x - o, ys, r, 0, 6.2832); gd.stroke(); gd.beginPath(); gd.arc(x - o, ys, 1.4, 0, 6.2832); gd.fill();
      gd.beginPath(); gd.arc(x + o, ys, r, 0, 6.2832); gd.moveTo(x + o - c, ys - c); gd.lineTo(x + o + c, ys + c); gd.moveTo(x + o + c, ys - c); gd.lineTo(x + o - c, ys + c); gd.stroke();
    }
  }

  function drawOrnaments(base) {
    var narrow = W < 700, k = narrow ? 0.72 : 1, fade = 1 - sstep(0.1 * H, 0.75 * H, sy);
    // a small house with a lit window, and a round tree, on the plain before the first arrival
    var xh = narrow ? W * 0.13 : W * 0.066, yh = base - ridgeAt(near, xh) + 1.5;
    gd.fillStyle = 'rgba(40,42,74,' + (0.55 + 0.45 * fade).toFixed(2) + ')';
    gd.fillRect(xh - 13 * k, yh - 11 * k, 26 * k, 12 * k);
    gd.fillStyle = '#05060f';
    gd.beginPath();
    gd.moveTo(xh - 16.5 * k, yh - 10.5 * k); gd.lineTo(xh, yh - 20 * k); gd.lineTo(xh + 16.5 * k, yh - 10.5 * k); gd.closePath();
    gd.rect(xh + 7 * k, yh - 20 * k, 3 * k, 6 * k);
    gd.fill();
    gd.beginPath(); gd.arc(xh + 27 * k, yh - 9 * k, 9 * k, 0, 6.2832); gd.arc(xh + 34 * k, yh - 5 * k, 6 * k, 0, 6.2832); gd.fill();
    var gl = gd.createRadialGradient(xh - 5 * k, yh - 5 * k, 0, xh - 5 * k, yh - 5 * k, 30 * k);
    gl.addColorStop(0, 'rgba(255,205,140,' + (0.34 * fade).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(255,205,140,0)');
    gd.fillStyle = gl; gd.fillRect(xh - 40 * k, yh - 40 * k, 80 * k, 60 * k);
    gd.fillStyle = 'rgba(255,214,150,' + (0.95 * fade).toFixed(3) + ')'; gd.fillRect(xh - 8 * k, yh - 7.5 * k, 4.5 * k, 4.5 * k);

    // a utility pole and its wires, lit by the window like the one in the photograph
    var xp = narrow ? W * 0.3 : W * 0.118, hp = (narrow ? 0.105 : 0.135) * H, yp = base - ridgeAt(near, xp) + 3, tx = xp + hp * 0.045, ty = yp - hp;
    var xq = narrow ? W * 0.56 : W * 0.205, hq = hp * 0.62, yq = base - ridgeAt(near, xq) + 3, qx = xq + hq * 0.03, qy = yq - hq;
    gd.lineCap = 'round';
    gd.strokeStyle = 'rgba(206,210,238,' + (0.3 * fade).toFixed(3) + ')'; gd.lineWidth = 0.7;
    var d;
    for (d = 0; d < 3; d++) {
      var oy = d * 4.2, ox = (d - 1) * 9;
      gd.beginPath(); gd.moveTo(tx + ox, ty + 8 + oy * 0.4); gd.quadraticCurveTo((tx + qx) / 2, (ty + qy) / 2 + 26 + oy, qx + ox * 0.6, qy + 5 + oy * 0.3); gd.stroke();
      gd.beginPath(); gd.moveTo(tx + ox, ty + 8 + oy * 0.4); gd.quadraticCurveTo(tx * 0.45, ty + hp * 0.3 + oy, -6, ty + hp * (0.2 + d * 0.035)); gd.stroke();
      gd.beginPath(); gd.moveTo(qx + ox * 0.6, qy + 5 + oy * 0.3); gd.quadraticCurveTo(qx + (W * 0.1), qy + hq * 0.45 + oy, qx + W * 0.21, base - ridgeAt(near, Math.min(W - 2, qx + W * 0.21)) - 2); gd.stroke();
    }
    gd.strokeStyle = 'rgba(222,224,244,' + (0.82 * fade).toFixed(3) + ')'; gd.lineWidth = 1.7;
    gd.beginPath(); gd.moveTo(xp, yp); gd.lineTo(tx, ty); gd.stroke();
    gd.lineWidth = 1.3;
    gd.beginPath(); gd.moveTo(tx - 11, ty + 9); gd.lineTo(tx + 11, ty + 7); gd.moveTo(tx - 8, ty + 19); gd.lineTo(tx + 8, ty + 17.5); gd.stroke();
    gd.strokeStyle = 'rgba(206,210,238,' + (0.5 * fade).toFixed(3) + ')'; gd.lineWidth = 1.1;
    gd.beginPath(); gd.moveTo(xq, yq); gd.lineTo(qx, qy); gd.moveTo(qx - 6.5, qy + 6); gd.lineTo(qx + 6.5, qy + 4.5); gd.stroke();

    // the first arrivals (iasp91 travel times), marked on the ridge they shaped; each label sits beside its
    // tick, with a dark halo that keeps the wires and the poles from running through the letters
    if (fade > 0.02 && markers.length && !narrow) {
      gd.textBaseline = 'alphabetic'; gd.textAlign = 'left'; gd.lineJoin = 'round';
      var lab = function (txt, font, x, y, al) {
        gd.font = font;
        gd.strokeStyle = 'rgba(9,9,26,' + (0.9 * fade).toFixed(3) + ')'; gd.lineWidth = 3.5; gd.strokeText(txt, x, y);
        gd.fillStyle = 'rgba(241,233,216,' + (al * fade).toFixed(3) + ')'; gd.fillText(txt, x, y);
      };
      for (var m = 0; m < markers.length; m++) {
        var mx = Math.round(markers[m].x) + 0.5, my = base - ridgeAt(near, markers[m].x) - 6;
        gd.strokeStyle = 'rgba(241,233,216,' + (0.55 * fade).toFixed(3) + ')'; gd.lineWidth = 0.8;
        gd.beginPath(); gd.moveTo(mx, my); gd.lineTo(mx, my - 27); gd.stroke();
        lab(markers[m].name, '500 10px "IBM Plex Mono", ui-monospace, monospace', mx + 5, my - 18, 0.95);
        lab(markers[m].label, '400 9px "IBM Plex Mono", ui-monospace, monospace', mx + 5, my - 6, 0.7);
      }
    }
  }

  /* ================================================================ draw: fx (ruler, wavefronts, fault) */
  var rings = [], ringT = 2.2, sparks = [], sparkT = 0, burst = 0, burstY = 0, quiet = 0, glow = null, fxLive = false, depthEl = document.getElementById('depth'), depthV = document.getElementById('depthV'), lastDepthTxt = '';
  var TICKS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

  function depthReadout(base) {                      // down from the surface, and back up to 0 m as the star-trail photograph rises
    if (!depthEl) return;
    // from 1400 px the read-out is a box in the left margin, level with the words that rise with the photograph: it leaves first
    var show = base < H * 0.42 && sy < M.Yend - H * (W >= 1400 ? 0.42 : 0.12);
    if (show !== depthEl._on) { depthEl._on = show; depthEl.className = show ? 'depth on' : 'depth'; }
    if (!show) return;
    var yw = sy + H * 0.5 - M.Y0, d = depthAt(yw), txt = d < 50 && yw > M.Lg - M.asc ? '0 m' : fmtDepth(d);
    if (txt !== lastDepthTxt) { lastDepthTxt = txt; depthV.textContent = txt; }
  }

  function drawFx(now, dt) {
    var base = M.Y0 - sy, under = base < H * 0.5 && sy < M.Yend - H * 0.35, i, y, a;
    depthReadout(base);
    fx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!under && !fxLive) return;
    fx.clearRect(0, 0, W, H);
    fxLive = under;
    if (!under) return;
    var vis = sstep(H * 0.45, -H * 0.1, base) * (1 - sstep(M.Yend - H * 1.1, M.Yend - H * 0.6, sy));

    // depth ruler in the left margin
    if (W >= 1400 && vis > 0.01) {
      var x0 = 26;
      fx.strokeStyle = 'rgba(241,233,216,' + (0.2 * vis).toFixed(3) + ')'; fx.lineWidth = 1;
      fx.beginPath(); fx.moveTo(x0 + 0.5, Math.max(0, base)); fx.lineTo(x0 + 0.5, H); fx.stroke();
      fx.font = '400 9.5px "IBM Plex Mono", ui-monospace, monospace'; fx.textBaseline = 'middle'; fx.textAlign = 'left';
      var lim = M.Lg - M.asc;
      for (i = 0; i < TICKS.length; i++) {
        var yw = ywAt(TICKS[i]); if (yw >= lim) break;
        y = base + yw; if (y < -10 || y > H + 10) continue;
        if (Math.abs(y - H * 0.5) < 34) continue;                        // leave room for the readout
        fx.strokeStyle = 'rgba(241,233,216,' + (0.5 * vis).toFixed(3) + ')';
        fx.beginPath(); fx.moveTo(x0, y + 0.5); fx.lineTo(x0 + 9, y + 0.5); fx.stroke();
        fx.fillStyle = 'rgba(241,233,216,' + (0.5 * vis).toFixed(3) + ')';
        fx.fillText(fmtTick(TICKS[i]), x0 + 14, y + 1);
        // minor ticks towards the next value
        if (i + 1 < TICKS.length) {
          var yn = base + Math.min(lim, ywAt(TICKS[i + 1])), m;
          fx.strokeStyle = 'rgba(241,233,216,' + (0.22 * vis).toFixed(3) + ')';
          fx.beginPath();
          for (m = 1; m < 5; m++) { var ym = y + (yn - y) * m / 5; if (ym > 0 && ym < H && Math.abs(ym - H * 0.5) > 30) { fx.moveTo(x0, ym + 0.5); fx.lineTo(x0 + 4, ym + 0.5); } }
          fx.stroke();
        }
      }
    }
    if (REDUCE) return;

    // wavefronts coming up from below
    ringT -= dt;
    if (ringT <= 0 && vis > 0.5 && rings.length < 4) {
      ringT = 3.4 + Math.random() * 3.2;
      rings.push({ x: W * (0.12 + Math.random() * 0.76), y: sy + H * (1.08 + Math.random() * 0.45), t: 0 });
    }
    fx.lineWidth = 1;
    for (i = rings.length - 1; i >= 0; i--) {
      var r = rings[i]; r.t += dt;
      var life = 8.5, rp = r.t * 210, rs = rp / 1.73, cy = r.y - sy;
      if (r.t > life) { rings.splice(i, 1); continue; }
      a = vis * (1 - r.t / life) * 0.34;
      if (cy - rp < H + 4) {
        fx.strokeStyle = 'rgba(255,214,164,' + (a * 0.45).toFixed(3) + ')'; fx.lineWidth = 0.8;
        fx.beginPath(); fx.arc(r.x, cy, rp, Math.PI, 2 * Math.PI); fx.stroke();
        fx.strokeStyle = 'rgba(255,190,120,' + a.toFixed(3) + ')'; fx.lineWidth = 1.3;
        fx.beginPath(); fx.arc(r.x, cy, rs, Math.PI, 2 * Math.PI); fx.stroke();
        fx.strokeStyle = 'rgba(255,190,120,' + (a * 0.4).toFixed(3) + ')'; fx.lineWidth = 0.8;
        fx.beginPath(); fx.arc(r.x, cy, Math.max(0, rs - 9), Math.PI, 2 * Math.PI); fx.stroke();
      }
    }

    // small earthquakes on the fault: mostly in swarms, like the ones the cable recorded. While the descent
    // is on screen (the fault's own screen) they come more often and burn bigger.
    var fa = vis, cen = -base + H * 0.5, desc = cen > M.dz0 && cen < M.dz1 + 120;
    if (fa > 0.05 && base + faultY0 + 120 < H) {
      sparkT -= dt; quiet = burst > 0 ? 0 : quiet + dt;
      if (sparkT <= 0 || (desc && quiet > 2.6)) {
        var lo = Math.max(faultY0 + 160, -base + 40), hi = Math.min(faultMargin ? M.Lg - M.asc : M.dz1 - 160, -base + H - 40);
        if (hi > lo) {
          if (burst > 0) { burst--; sparkT = 0.05 + Math.random() * 0.16; addSpark(clamp(burstY + (Math.random() - 0.5) * 70, lo, hi), 0.5 + Math.random() * 0.7); }
          else if (quiet > 2.6 && desc || Math.random() < (desc ? 0.45 : 0.28)) {
            var blo = lo, bhi = hi;                    // while the descent is on screen, its swarms break inside it
            if (desc && Math.min(hi, M.dz1 - 90) > Math.max(lo, M.dz0 + 170)) { blo = Math.max(lo, M.dz0 + 170); bhi = Math.min(hi, M.dz1 - 90); }
            burst = 7 + (Math.random() * 12 | 0); burstY = blo + Math.random() * (bhi - blo); sparkT = 0.1; quiet = 0; glow = { yw: burstY, t: 0 };
          }
          else { sparkT = 0.35 + Math.random() * 0.9; addSpark(lo + Math.random() * (hi - lo), 0.6 + Math.random() * 0.9); }
        } else sparkT = 0.5;
      }
      if (glow) {                                    // the stretch of fault that is slipping glows while the swarm lasts
        glow.t += dt;
        if (glow.t > 2.6) glow = null;
        else {
          var inD = inDescent(glow.yw), env = Math.sin(Math.PI * glow.t / 2.6), ff = fa * faultFade(glow.yw);
          var gx = faultXAt(glow.yw), gy = base + glow.yw, ga = ff * env * (inD ? 0.26 : 0.12), gr = inD ? (W < 700 ? 96 : 140) : 56;
          var gg = fx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          gg.addColorStop(0, 'rgba(255,190,120,' + ga.toFixed(3) + ')'); gg.addColorStop(0.35, 'rgba(255,170,110,' + (ga * 0.42).toFixed(3) + ')'); gg.addColorStop(1, 'rgba(255,170,110,0)');
          fx.fillStyle = gg; fx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
          // the patch that slips: a short bright stretch of the trace, which grows and fades with the swarm
          var half = (inD ? 74 : 32) * (0.5 + 0.5 * env), yy, sl = fx.createLinearGradient(0, gy - half, 0, gy + half);
          sl.addColorStop(0, 'rgba(255,214,164,0)'); sl.addColorStop(0.5, 'rgba(255,230,196,' + (ff * env * (inD ? 0.9 : 0.5)).toFixed(3) + ')'); sl.addColorStop(1, 'rgba(255,214,164,0)');
          fx.strokeStyle = sl; fx.lineWidth = inD ? 1.7 : 1.1; fx.beginPath();
          for (yy = -half; yy <= half + 0.1; yy += 6) { var sxp = faultXAt(glow.yw + yy); if (yy === -half) fx.moveTo(sxp, gy + yy); else fx.lineTo(sxp, gy + yy); }
          fx.stroke();
        }
      }
      for (i = sparks.length - 1; i >= 0; i--) {
        var sp = sparks[i]; sp.t += dt;
        if (sp.t > 1.5) { sparks.splice(i, 1); continue; }
        var px = faultXAt(sp.yw) + (sp.s - 0.9) * 5, py = base + sp.yw, q = sp.t / 1.5, sa = fa * faultFade(sp.yw) * (1 - q);
        fx.fillStyle = 'rgba(255,224,178,' + (sa * 0.95).toFixed(3) + ')';
        fx.beginPath(); fx.arc(px, py, 1.5 * sp.k * sp.s * (1 - q * 0.5), 0, 6.2832); fx.fill();
        fx.strokeStyle = 'rgba(255,196,128,' + (sa * 0.5).toFixed(3) + ')'; fx.lineWidth = 0.8;
        fx.beginPath(); fx.arc(px, py, 2 + q * 26 * sp.k * sp.s, 0, 6.2832); fx.stroke();
      }
    } else if (sparks.length) { sparks.length = 0; glow = null; }
  }
  function addSpark(yw, s) { sparks.push({ yw: yw, t: 0, s: s, k: inDescent(yw) ? 1.9 : 1 }); }

  /* ================================================================ the sky */
  var Sky = (function () {
    var tb = document.createElement('canvas'), tc = tb.getContext('2d');   // the exposure so far
    var hz = document.createElement('canvas'), hc = hz.getContext('2d', { alpha: false });   // Milky Way haze, low resolution, opaque (added to the sky)
    var MX = 30, EXT = 0, bw = 0, bh = 0, cx = 0, cy = 0, n = 0, maxR = 1, HS = 1;   // haze at full size: upscaling a small one shows as a weave
    var R, TH, DA, PX, PY, CX, CY, IN, bk = [], bright = [];
    var expT = 0, pre = (REDUCE ? 27 : 9) * Math.PI / 180, ang = pre, fast = false, tx = 0, ty = 0, gx = 0, gy = 0, grad = null, built = false, flash = 0;
    var OM = 1.5 * Math.PI / 180, TAU = 14, plane = null, met = null, metT = 11;
    var COL = [[226, 234, 255, 0.33], [190, 228, 255, 0.2], [255, 255, 255, 0.15], [255, 236, 200, 0.13], [255, 205, 150, 0.08], [176, 240, 214, 0.07], [160, 186, 255, 0.04]];
    var BV = [0.2, 0.36, 0.62, 0.96], LW = [0.6, 0.8, 1.05, 1.4];

    function build() {
      var narrow = W < 700, i, j, r = rng(1729 + (W | 0));
      EXT = Math.round(PAR * H) + 26; bw = W + 2 * MX; bh = H + 2 * EXT;
      tb.width = Math.round(bw * DPR); tb.height = Math.round(bh * DPR);
      tc.setTransform(DPR, 0, 0, DPR, 0, 0);
      cx = MX + W * (narrow ? 0.76 : 0.705); cy = EXT + H * (narrow ? 0.2 : 0.23);
      maxR = Math.sqrt(Math.pow(Math.max(cx, bw - cx), 2) + Math.pow(Math.max(cy, bh - cy), 2)) + 4;
      n = Math.min(narrow ? 6500 : 11000, Math.round(Math.PI * maxR * maxR / (narrow ? 560 : 760)));
      R = new Float32Array(n); TH = new Float32Array(n); DA = new Float32Array(n); PX = new Float32Array(n); PY = new Float32Array(n);
      CX = new Float32Array(n); CY = new Float32Array(n); IN = new Uint8Array(n);
      bk = []; bright = [];
      for (i = 0; i < COL.length; i++) for (j = 0; j < 4; j++) bk.push({ style: 'rgb(' + Math.round(COL[i][0] * BV[j]) + ',' + Math.round(COL[i][1] * BV[j]) + ',' + Math.round(COL[i][2] * BV[j]) + ')', head: 'rgb(' + COL[i][0] + ',' + COL[i][1] + ',' + COL[i][2] + ')', w: LW[j], ids: [], lvl: j });
      for (i = 0; i < n; i++) {
        R[i] = i === 0 ? 9 : maxR * Math.sqrt(r()); TH[i] = r() * 6.28318;
        var u = r(), f = Math.pow(u, 2.2), lvl = i === 0 ? 3 : f < 0.16 ? 0 : f < 0.46 ? 1 : f < 0.8 ? 2 : 3, c = 0, p = r(), acc = 0;
        for (j = 0; j < COL.length; j++) { acc += COL[j][3]; if (p <= acc) { c = j; break; } }
        if (i === 0) c = 2;
        bk[c * 4 + lvl].ids.push(i);
        PX[i] = cx + R[i] * Math.cos(TH[i]); PY[i] = cy + R[i] * Math.sin(TH[i]); DA[i] = 0;
        IN[i] = PX[i] > -4 && PX[i] < bw + 4 && PY[i] > -4 && PY[i] < bh + 4 ? 1 : 0;
      }
      for (j = 0; j < bk.length; j++) if (bk[j].lvl >= 2) bright.push(bk[j]);
      // haze: a soft diagonal band, drawn once at low resolution
      hz.width = Math.ceil(bw / HS); hz.height = Math.ceil(bh / HS);
      var hw = hz.width, hh = hz.height, g, t, hxp, hyp, rad;
      hc.globalCompositeOperation = 'source-over'; hc.fillStyle = '#000'; hc.fillRect(0, 0, hw, hh);
      hc.globalCompositeOperation = 'lighter';
      for (i = 0; i < 95; i++) {
        t = r(); var off = (r() + r() + r() - 1.5) * 0.11;
        hxp = (0.02 + t * 0.96 + off * 0.5) * hw; hyp = (0.86 - t * 0.9 + off) * hh; rad = (0.05 + r() * 0.11) * hw;
        g = hc.createRadialGradient(hxp, hyp, 0, hxp, hyp, rad);
        var warm = Math.abs(t - 0.42) < 0.14 && r() < 0.5, al = 0.028 + r() * 0.034;
        g.addColorStop(0, warm ? 'rgba(214,170,150,' + al + ')' : 'rgba(118,132,226,' + al + ')'); g.addColorStop(0.5, warm ? 'rgba(214,170,150,' + (al * 0.36).toFixed(4) + ')' : 'rgba(118,132,226,' + (al * 0.36).toFixed(4) + ')'); g.addColorStop(1, 'rgba(100,110,200,0)');
        hc.fillStyle = g; hc.fillRect(hxp - rad, hyp - rad, rad * 2, rad * 2);
      }
      grad = sk.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#040615'); grad.addColorStop(0.34, '#090d25'); grad.addColorStop(0.7, '#131737'); grad.addColorStop(1, '#231d3f');
      built = true; plane = null; met = null;
      expose(true);
    }

    function extras(dt) {                            // things a long exposure also catches
      var x, y, g;
      tc.globalCompositeOperation = 'lighter';
      if (!plane && expT > 4 && expT < 6) { plane = { x: bw * 0.93, y: -6, vx: -9, vy: 30, acc: 0, n: 0 }; }
      if (plane && plane.n < 60) {                    // a plane: one dot each time its light blinks
        plane.x += plane.vx * dt * (fast ? 9 : 1); plane.y += plane.vy * dt * (fast ? 9 : 1); plane.acc += Math.sqrt(plane.vx * plane.vx + plane.vy * plane.vy) * dt * (fast ? 9 : 1);
        while (plane.acc > 11) { plane.acc -= 11; plane.n++; tc.fillStyle = plane.n % 2 ? 'rgba(255,238,214,.5)' : 'rgba(255,200,190,.36)'; tc.fillRect(plane.x - 0.7, plane.y - 0.7, 1.4, 1.4); }
      }
      metT -= dt;
      if (!met && metT <= 0) {
        metT = 16 + Math.random() * 22;
        var a = Math.PI * (0.62 + Math.random() * 0.3), L = 50 + Math.random() * 80;
        x = bw * (0.15 + Math.random() * 0.75); y = EXT + H * (0.04 + Math.random() * 0.38);
        met = { x0: x, y0: y, x1: x + Math.cos(a) * L, y1: y + Math.sin(a) * L, p: 0 };
      }
      if (met) {
        var p0 = met.p; met.p = Math.min(1, met.p + dt * 3.2);
        var ax = met.x0 + (met.x1 - met.x0) * p0, ay = met.y0 + (met.y1 - met.y0) * p0, bx = met.x0 + (met.x1 - met.x0) * met.p, by = met.y0 + (met.y1 - met.y0) * met.p;
        tc.strokeStyle = 'rgba(255,246,228,' + (0.04 + 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, met.p)), 1.6)).toFixed(3) + ')'; tc.lineWidth = 0.9; tc.lineCap = 'butt';
        tc.beginPath(); tc.moveTo(ax, ay); tc.lineTo(bx, by); tc.stroke();
        if (met.p >= 1) met = null;
      }
    }

    function expose(all) {                           // add to the buffer what the stars have travelled since their last stroke
      var j, q, i, b, ids, r, a1, x, y, d, len, inside, any;
      tc.globalCompositeOperation = 'lighter'; tc.lineCap = 'butt';
      for (j = 0; j < bk.length; j++) {
        b = bk[j]; ids = b.ids; any = false;
        tc.beginPath();
        for (q = 0; q < ids.length; q++) {
          i = ids[q]; r = R[i]; a1 = TH[i] - ang; x = cx + r * Math.cos(a1); y = cy + r * Math.sin(a1);
          CX[i] = x; CY[i] = y;
          d = ang - DA[i]; len = d * r;
          if (len < 1.2 && !(all && len > 0.3)) continue;
          inside = x > -4 && x < bw + 4 && y > -4 && y < bh + 4;
          if (inside || IN[i] || d > 0.03) {
            tc.moveTo(PX[i], PY[i]);
            if (len > 5) tc.arc(cx, cy, r, TH[i] - DA[i], a1, true); else tc.lineTo(x, y);
            any = true;
          }
          DA[i] = ang; PX[i] = x; PY[i] = y; IN[i] = inside ? 1 : 0;
        }
        if (any) { tc.strokeStyle = b.style; tc.lineWidth = b.w; tc.stroke(); }
      }
    }

    function reset() {
      if (!built) return;
      for (var i = 0; i < n; i++) { TH[i] -= ang; DA[i] = 0; PX[i] = cx + R[i] * Math.cos(TH[i]); PY[i] = cy + R[i] * Math.sin(TH[i]); }
      pre = REDUCE ? 27 * Math.PI / 180 : 0; expT = 0; ang = pre; flash = REDUCE ? 0 : 1; plane = null; met = null; metT = 5;
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, bw, bh);
      expose(true);
    }

    var lastDt = 0.016;
    function tick(dt) {
      if (REDUCE) return;
      lastDt = dt;
      expT += dt * (fast ? 9 : 1);
      ang = pre + OM * TAU * Math.log(1 + expT / TAU);
    }

    function draw(now, mode) {
      if (!built) return;
      expose(false);
      if (!REDUCE) extras(lastDt);
      tx += (gx - tx) * 0.045; ty += (gy - ty) * 0.045;
      var maxS = Math.max(0, M.docH - H);
      var par = mode === 'hero' ? -PAR * Math.min(sy, H) : PAR * clamp(maxS - sy, 0, H);
      var ox = Math.round((tx - MX) * DPR) / DPR, oy = Math.round((par + ty - EXT) * DPR) / DPR;
      var hy = mode === 'hero' ? M.Y0 - sy - RB - RH * 0.5 : M.docH - sy - M.footH - 22 - RH * 0.3;
      sk.setTransform(DPR, 0, 0, DPR, 0, 0);
      sk.globalCompositeOperation = 'source-over'; sk.globalAlpha = 1;
      sk.fillStyle = grad; sk.fillRect(0, 0, W, H);
      // light behind the range
      var gxp = mode === 'hero' ? (W < 700 ? 0.6 : 0.52) : 0.58, rr = Math.max(W, H) * 0.62, g;
      sk.save(); sk.translate(W * gxp, hy); sk.scale(1, 0.4);
      g = sk.createRadialGradient(0, 0, 0, 0, 0, rr);
      g.addColorStop(0, 'rgba(255,192,122,0.7)'); g.addColorStop(0.2, 'rgba(244,152,98,0.44)'); g.addColorStop(0.5, 'rgba(170,96,126,0.2)'); g.addColorStop(1, 'rgba(60,40,104,0)');
      sk.fillStyle = g; sk.fillRect(-W * 1.5, -rr, W * 3, rr * 2); sk.restore();
      sk.globalCompositeOperation = 'lighter';
      sk.imageSmoothingEnabled = true; sk.imageSmoothingQuality = 'high'; sk.globalAlpha = 1; sk.drawImage(hz, ox, oy, bw, bh);
      sk.globalAlpha = 1; sk.drawImage(tb, ox, oy, bw, bh);
      // the stars themselves, at the head of their trails
      var j, q, i, ids, x, y;
      for (j = 0; j < bright.length; j++) {
        ids = bright[j].ids; sk.fillStyle = bright[j].head; var s = bright[j].lvl === 3 ? 1.7 : 1.2;
        for (q = 0; q < ids.length; q++) {
          i = ids[q]; x = CX[i] + ox; y = CY[i] + oy;
          if (x < -2 || x > W + 2 || y < -2 || y > H + 2) continue;
          sk.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      // the pole star
      x = CX[0] + ox; y = CY[0] + oy;
      g = sk.createRadialGradient(x, y, 0, x, y, 16); g.addColorStop(0, 'rgba(255,250,236,.85)'); g.addColorStop(0.18, 'rgba(255,240,214,.3)'); g.addColorStop(1, 'rgba(255,240,214,0)');
      sk.fillStyle = g; sk.fillRect(x - 16, y - 16, 32, 32);
      if (flash > 0.01) { sk.globalCompositeOperation = 'source-over'; sk.fillStyle = 'rgba(6,8,23,' + (flash * 0.55).toFixed(3) + ')'; sk.fillRect(0, 0, W, H); flash *= 0.9; }
      sk.globalCompositeOperation = 'source-over';
    }

    return {
      build: build, tick: tick, draw: draw, reset: reset,
      setFast: function (v) { fast = !!v; },
      tilt: function (nx, ny) { gx = -nx * 13; gy = -ny * 9; },
      info: function () { return { t: expT, deg: ang * 180 / Math.PI, fast: fast }; }
    };
  })();

  /* ================================================================ loop */
  var cbs = [], lastT = 0, lastSy = -1, dirty = true, skyWas = false, lastW = 0, lastH = 0, resizeTimer = 0, ready = false;

  function sizeAll() {
    measure();
    [skyC, gndC, fxC].forEach(function (c) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); });
    buildRidges(); bodyStops(); buildStrata(); Sky.build();
    lastW = W; lastH = H; dirty = true;
  }
  function relayout() {                              // the page got taller or shorter: keep the ground in step
    var oldLg = M.Lg, oldY0 = M.Y0, oldDz = M.dz0 + M.dz1;
    measure();
    if (Math.abs(M.Lg - oldLg) > 2 || Math.abs(M.Y0 - oldY0) > 1 || Math.abs(M.dz0 + M.dz1 - oldDz) > 2) { bodyStops(); buildStrata(); }
    dirty = true;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!ready) return;
    var dt = Math.min(0.1, Math.max(0.001, (now - lastT) / 1000)); lastT = now;
    if (window.__lenis) window.__lenis.raf(now);
    sy = window.pageYOffset || root.scrollTop || 0;
    var scrolled = sy !== lastSy;
    Sky.tick(dt);
    var mode = sy < M.Y0 + 2 ? 'hero' : (sy + H > M.Yct + 2 ? 'foot' : '');
    if (mode && (!REDUCE || scrolled || dirty || !skyWas)) Sky.draw(now, mode);
    skyWas = !!mode;
    if (scrolled || dirty) drawGround();
    drawFx(now, dt);
    for (var i = 0; i < cbs.length; i++) cbs[i](now, dt, sy);
    lastSy = sy; dirty = false;
  }

  function start() {
    sizeAll(); ready = true;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var w = root.clientWidth || window.innerWidth, h = skyC.clientHeight || window.innerHeight;
        if (w === lastW && Math.abs(h - lastH) < 130) { relayout(); return; }      // a phone's URL bar, not a real resize
        sizeAll();
      }, 180);
    });
    if (window.ResizeObserver) { var ro = new ResizeObserver(function () { clearTimeout(start._t); start._t = setTimeout(relayout, 120); }); ro.observe(document.getElementById('main')); }
    window.addEventListener('load', function () { relayout(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { relayout(); });
    requestAnimationFrame(frame);
  }

  window.YWScene = {
    onFrame: function (fn) { cbs.push(fn); },
    sky: Sky, metrics: M, depthAt: depthAt, fmtDepth: fmtDepth, reduce: REDUCE, dpr: DPR,
    size: function () { return { W: W, H: H }; },
    stats: function () { return { groundMs: statsMs, layers: layers.length, N: N }; },
    redraw: function () { dirty = true; }
  };
  start();
})();
