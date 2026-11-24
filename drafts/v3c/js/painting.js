/* v3c · 地听 — the painting.
   A procedural ink-wash landscape for a handscroll. Mountains are washed pixel by pixel into cached tiles
   (three parallax layers), line work is drawn on top, and the live parts (fibre, light pulse, small earthquakes
   heard by the fibre, boat, birds, ink ripples) are drawn every frame. The ridgelines follow a real seismogram
   (window.YW_SEIS).
   One Painting = one canvas showing the stretch [scroll, scroll + W] of a world that is L px long. */
(function () {
'use strict';

/* ------------------------------------------------------------------ helpers */
var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function ih(x, y, s) {                       /* integer hash → 0..1 */
  var h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function n1(x, s) { var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(ih(i, 0, s), ih(i + 1, 0, s), u); }
function n2(x, y, s) {
  var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(ih(i, j, s), ih(i + 1, j, s), u), lerp(ih(i, j + 1, s), ih(i + 1, j + 1, s), u), v);
}
function fbm1(x, s, oct) {
  var a = .5, f = 1, sum = 0, norm = 0;
  for (var o = 0; o < oct; o++) { sum += a * n1(x * f, s + o * 17); norm += a; a *= .5; f *= 2.03; }
  return sum / norm;
}
function box(src, w) {                       /* centred moving average */
  var n = src.length, out = new Float32Array(n), h = w >> 1, acc = 0, cnt = 0, i;
  for (i = 0; i < Math.min(n, h + 1); i++) { acc += src[i]; cnt++; }
  for (i = 0; i < n; i++) {
    out[i] = acc / cnt;
    var add = i + h + 1, rem = i - h;
    if (add < n) { acc += src[add]; cnt++; }
    if (rem >= 0) { acc -= src[rem]; cnt--; }
  }
  return out;
}

/* ------------------------------------------------------------------ textures (built once) */
var TEX = null;
function textures() {
  if (TEX) return TEX;
  var G = new Float32Array(512 * 512), r = mulberry32(7), i, x, y;
  for (i = 0; i < G.length; i++) G[i] = r();
  var ST = new Float32Array(1024 * 256);          /* streaks that hang from a ridge: fast in x, slow in depth */
  for (y = 0; y < 256; y++) for (x = 0; x < 1024; x++) {
    var v = .5 * n2(x * .07, y * .02, 11) + .32 * n2(x * .21, y * .05, 12) + .18 * n2(x * .55, y * .12, 13);
    ST[(y << 10) + x] = sstep(.26, .74, v);
  }
  var HS = new Float32Array(256 * 256);           /* horizontal dry-brush streaks for water */
  for (y = 0; y < 256; y++) for (x = 0; x < 256; x++) {
    HS[(y << 8) + x] = .65 * n2(x * .035, y * .42, 21) + .35 * n2(x * .12, y * .9, 22);
  }
  TEX = { G: G, ST: ST, HS: HS };
  return TEX;
}

/* ------------------------------------------------------------------ the seismogram */
var SEIS = null;
/* double running integral of a sampled signal (sample i spans [i, i+1) in node units), so that a triangular
   smoothing of any width costs three look-ups: see smooth() */
function integ2(src) {
  var n = src.length, I2 = new Float64Array(n + 1), i1 = 0, acc = 0;
  for (var i = 0; i < n; i++) { var nx = i1 + src[i]; acc += (i1 + nx) / 2; I2[i + 1] = acc; i1 = nx; }
  return I2;
}
function lin(a, p) { var n = a.length - 1, i = p | 0; if (i >= n) return a[n]; return a[i] + (a[i + 1] - a[i]) * (p - i); }
/* the swings are compressed (amplitude^0.56) so that P and S show beside the surface waves. The gain comes from the
   local envelope of the record, not from each sample, so that what smoothing leaves of a squeezed stretch stays small */
function gain(src, w) {
  var g = box(box(src.map(Math.abs), w), w);
  for (var i = 0; i < g.length; i++) g[i] = Math.pow(1.6 * g[i] + 1e-5, -.44);
  return g;
}
function seis() {
  if (SEIS) return SEIS;
  var S = window.YW_SEIS, i;
  if (!S || !S.bb || !S.lp) {                     /* no data: a quiet landscape */
    var z = new Float32Array(4), z2 = new Float64Array(5);
    SEIS = { ok: false, t0: 0, fs: 1, n: 4, env: z, envL: z, gb: z, gl: z, bbI: z2, lpI: z2, phases: {} };
    return SEIS;
  }
  var n = S.bb.length, bb = new Float32Array(n), lp = new Float32Array(n), ab = new Float32Array(n);
  for (i = 0; i < n; i++) { bb[i] = S.bb[i] / 32000; lp[i] = S.lp[i] / 32000; ab[i] = Math.abs(bb[i]); }
  var e = box(box(ab, 41), 41), eL = box(box(ab, 181), 181), m = 0, mL = 0;
  for (i = 0; i < n; i++) { if (e[i] > m) m = e[i]; if (eL[i] > mL) mL = eL[i]; }
  for (i = 0; i < n; i++) { e[i] = Math.sqrt(e[i] / m); eL[i] = Math.sqrt(eL[i] / mL); }
  SEIS = { ok: true, t0: S.meta.t_start_rel, fs: S.meta.fs, n: n, env: e, envL: eL, gb: gain(bb, 31), gl: gain(lp, 61),
    bbI: integ2(bb), lpI: integ2(lp), phases: S.meta.phases || {} };
  return SEIS;
}
function samp(arr, t) {
  var s = SEIS, i = (t - s.t0) * s.fs;
  if (i <= 0) return arr[0];
  if (i >= s.n - 1) return arr[s.n - 1];
  var i0 = i | 0, f = i - i0;
  return arr[i0] * (1 - f) + arr[i0 + 1] * f;
}
/* the signal at time t, smoothed with a triangle of half-width w seconds (at least one sample), then compressed.
   Callers pass w = (shortest period to keep, in px) × (seconds per px), so that wherever the composed time axis
   squeezes the record, the cycles that would fall closer than that are smoothed away instead of being plotted */
function smooth(I2, G, t, w) {
  var s = SEIS, n = I2.length - 1, p = (t - s.t0) * s.fs + .5, h = Math.max(1, w * s.fs);
  if (p < 0) p = 0; else if (p > n) p = n;
  h = Math.min(h, p, n - p);
  if (h < .5) return 0;
  return samp(G, t) * (lin(I2, p + h) - 2 * lin(I2, p) + lin(I2, p - h)) / (h * h);
}

/* ------------------------------------------------------------------ Painting */
var TW = 1024, BL = 2;                           /* tile width, and the bleed painted on each side of a tile, CSS px */
var INK = [28, 26, 23], RED = '200,16,46';

function Painting(canvas, opt) {
  this.cv = canvas;
  this.ctx = canvas.getContext('2d');
  this.o = opt;
  this.ripples = [];
  this.micro = []; this.nextMicro = 0;
  this.flight = null;
  this.t00 = performance.now();
  this.setup();
}

Painting.prototype.setup = function () {
  textures(); seis();
  var o = this.o, H = o.H, W = o.W, L = Math.max(o.L, W);
  o.L = L;
  var u = this.u = H / 840, s = this.seed = (o.seed | 0) || 1;
  this.uf = Math.max(u, .9);                         /* the fibre keeps a readable size in small bands */
  this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  this.S = this.dpr >= 1.5 ? 1.5 : 1;
  this.wl = Math.round(H * .66);
  this.cv.width = Math.round(W * this.dpr);
  this.cv.height = Math.round(H * this.dpr);
  this.tiles = new Map();
  this.queue = [];
  var rnd = mulberry32((Math.imul(s, 2654435761) >>> 0) || 1);
  var self = this, wl = this.wl, x, i;
  var par = o.parallax !== false;
  var rate = { far: par ? .45 : 1, mid: par ? .72 : 1, near: 1 };
  this.rate = rate;

  /* ---- time along the scroll: piecewise linear, world x → seconds after the earthquake */
  var A = o.anchors || [[0, 600], [L, 4000]];
  function T(xw) {
    if (xw <= A[0][0]) return A[0][1];
    for (var k = 1; k < A.length; k++) if (xw <= A[k][0]) {
      var p = A[k - 1], q = A[k];
      return p[1] + (q[1] - p[1]) * (xw - p[0]) / Math.max(1e-6, q[0] - p[0]);
    }
    return A[A.length - 1][1];
  }
  this.T = T;
  this.xOfT = function (t) {
    for (var k = 1; k < A.length; k++) if (t <= A[k][1]) {
      var p = A[k - 1], q = A[k];
      return p[0] + (q[0] - p[0]) * (t - p[1]) / Math.max(1e-6, q[1] - p[1]);
    }
    return L;
  };

  /* seismic arrays in layer coordinates. The ridges take only the slow swell of the record: cycles shorter than
     about 70 px (LP) or 28 px (BB) on the layer are smoothed out, so that no crest carries a row of equal bumps */
  function seisArrays(len, r) {
    var E = new Float32Array(len), LP = new Float32Array(len), BB = new Float32Array(len), EL = new Float32Array(len);
    for (var xx = 0; xx < len; xx++) {
      var t = T(xx / r), dt = .02;                                 /* the most squeezed time within 40 px */
      for (var j = -40; j <= 40; j += 40) dt = Math.max(dt, T((xx + j + 1) / r) - T((xx + j) / r));
      E[xx] = samp(SEIS.env, t); EL[xx] = samp(SEIS.envL, t);
      LP[xx] = smooth(SEIS.lpI, SEIS.gl, t, 70 * u * dt);
      BB[xx] = smooth(SEIS.bbI, SEIS.gb, t, 28 * u * dt);
    }
    return { E: E, EL: EL, LP: box(LP, 5), BB: box(BB, 3) };
  }
  function raster(peaks, arr) {
    var n = arr.length;
    for (var k = 0; k < peaks.length; k++) {
      var p = peaks[k], a = Math.max(0, Math.floor(p.x - p.wl)), b = Math.min(n - 1, Math.ceil(p.x + p.wr));
      for (var xx = a; xx <= b; xx++) {
        var uu = xx < p.x ? (p.x - xx) / p.wl : (xx - p.x) / p.wr;
        if (uu >= 1) continue;
        var v = p.h * Math.pow(1 - Math.pow(uu, p.p1 || 1.32), p.p2 || 1.75);
        if (v > arr[xx]) arr[xx] = v;
      }
    }
  }
  function warp(arr, amp, freq, sd) {
    var n = arr.length, out = new Float32Array(n);
    for (var xx = 0; xx < n; xx++) {
      var xs = clamp(xx + amp * (fbm1(xx * freq, sd, 2) - .5) * 2, 0, n - 1.001), i0 = xs | 0, f = xs - i0;
      out[xx] = arr[i0] * (1 - f) + arr[i0 + 1] * f;
    }
    return out;
  }
  function softTop(h, max) { return h <= max * .8 ? h : Math.min(max, max * .8 + (h - max * .8) * .4); }
  /* places the hills stay below on the first screen: a vertical hero's name and subtitle (o.keep: [x0, x1, y]) and
     the moon (1.6 radii round it). A hill that would rise into one is scaled down as a whole, not cut flat: the dip
     is spread over a hill's width and eased in */
  var keeps = (o.keep || []).map(function (kp) { return { a: kp[0], b: kp[1], top: function () { return kp[2]; } }; });
  if (o.moon) {
    var mx = o.moon[0], my = o.moon[1], mR = 1.6 * this.moonR();
    keeps.push({ a: mx - mR, b: mx + mR, top: function (xx) { return my + Math.sqrt(Math.max(0, mR * mR - (xx - mx) * (xx - mx))); } });
  }
  this.keeps = keeps;
  function keepClear(y, base) {
    var rad = Math.round(70 * u), a = Infinity, b = -Infinity, xx, k;
    keeps.forEach(function (kp) { a = Math.min(a, kp.a); b = Math.max(b, kp.b); });
    a = Math.max(0, Math.floor(a) - 2 * rad); b = Math.min(y.length - 1, Math.ceil(b) + 2 * rad);
    if (!(a <= b)) return;
    var f = new Float32Array(b - a + 1).fill(1), g = new Float32Array(b - a + 1);
    for (xx = a; xx <= b; xx++) for (k = 0; k < keeps.length; k++) {
      var kp = keeps[k], h = base - y[xx], room = xx >= kp.a && xx <= kp.b ? Math.max(0, base - kp.top(xx)) : h;
      if (h > room) f[xx - a] = Math.min(f[xx - a], room / h);
    }
    for (xx = 0; xx < g.length; xx++) {
      var m = 1;
      for (k = Math.max(0, xx - rad); k <= Math.min(g.length - 1, xx + rad); k++) if (f[k] < m) m = f[k];
      g[xx] = m;
    }
    g = box(g, rad);
    for (xx = a; xx <= b; xx++) if (g[xx - a] < 1) y[xx] = base - (base - y[xx]) * g[xx - a];
  }

  /* ================= near layer (registered with the text) ================= */
  var n = L + 8;
  var C = new Float32Array(n), CT = new Float32Array(n);          /* CT: under the text blocks only (for the seismogram) */
  for (x = 0; x < n; x++) C[x] = CT[x] = 1;
  (o.ranges || []).forEach(function (r) {
    var a = r[0], b = r[1], low = r[2] || 0, soft = (r[3] || 150) * u;
    var i0 = Math.max(0, Math.floor(a - soft)), i1 = Math.min(n - 1, Math.ceil(b + soft));
    for (var xx = i0; xx <= i1; xx++) {
      var k = sstep(a - soft, a, xx) * (1 - sstep(b, b + soft, xx)), c = 1 - (1 - low) * k;
      if (c < C[xx]) C[xx] = c;
      if (!low && c < CT[xx]) CT[xx] = c;
    }
  });
  this.clearT = CT;
  var pkA = new Float32Array(n), pkB = new Float32Array(n), amp = new Float32Array(n);
  var allA = [];
  (o.gaps || []).forEach(function (g) {
    var w = g.b - g.a, main = [], k;
    if (w < 60) return;
    for (x = Math.max(0, g.a | 0); x < Math.min(n, g.b); x++) amp[x] = g.amp;
    if (g.peaks) {
      g.peaks.forEach(function (p) { main.push({ x: p.x, h: p.h * H, wl: p.wl * u, wr: p.wr * u, p1: p.p1, p2: p.p2 }); });
    } else {
      var cnt = clamp(Math.round(w / (270 * u)), 1, 4), focus = .28 + .44 * rnd();
      for (k = 0; k < cnt; k++) {
        var f = (k + .5) / cnt + (rnd() - .5) * .5 / cnt;
        var hh = clamp(g.amp * (.52 - .3 * Math.abs(f - focus)) * (.8 + .3 * rnd()), .07, .56);
        var ww = (80 + 110 * rnd()) * u * (.75 + hh);
        main.push({ x: g.a + f * w, h: hh * H, wl: ww * (.8 + .5 * rnd()), wr: ww * (.8 + .5 * rnd()) });
      }
    }
    var all = main.slice();
    main.forEach(function (p) {                                  /* shoulders */
      var m = 1 + (rnd() * 2 | 0);
      for (var j = 0; j < m; j++) {
        var side = rnd() < .5 ? -1 : 1, w0 = side < 0 ? p.wl : p.wr;
        all.push({ x: p.x + side * w0 * (.36 + .34 * rnd()), h: p.h * (.42 + .3 * rnd()), wl: w0 * (.42 + .3 * rnd()), wr: w0 * (.42 + .3 * rnd()) });
      }
    });
    raster(all, pkA);
    main.forEach(function (p) { allA.push(p); });
    var front = [];                                             /* a lower range in front */
    main.forEach(function (p) {
      if (rnd() < .86) {
        var side = rnd() < .5 ? -1 : 1, w0 = side < 0 ? p.wl : p.wr;
        front.push({ x: p.x + side * w0 * (.55 + .5 * rnd()), h: p.h * (.36 + .22 * rnd()), wl: w0 * (.8 + .5 * rnd()), wr: w0 * (.8 + .5 * rnd()), p1: 1.5, p2: 1.5 });
      }
    });
    if (w > 500 * u && rnd() < .7) front.push({ x: g.a + w * (.2 + .6 * rnd()), h: g.amp * H * (.1 + .08 * rnd()), wl: 150 * u, wr: 170 * u, p1: 1.6, p2: 1.4 });
    raster(front, pkB);
  });
  this.peaksA = allA;
  pkA = warp(pkA, 24 * u, .009 / u, s + 6);
  pkB = warp(pkB, 30 * u, .008 / u, s + 7);
  var sn = seisArrays(n, 1);
  var onsets = (o.phases || []).filter(function (p) { return p.label === 'P' || p.label === 'S'; });
  function onsetGap(xx) {                              /* 0 just after the P and S marks: no shore there to hide the onset */
    var v = 1;
    for (var q = 0; q < onsets.length; q++) { var mx = onsets[q].x; v = Math.min(v, 1 - sstep(mx - 70 * u, mx - 20 * u, xx) * (1 - sstep(mx + 200 * u, mx + 270 * u, xx))); }
    return v;
  }
  var yA = new Float32Array(n), yB = new Float32Array(n), yC = new Float32Array(n), topY = new Float32Array(n);
  var baseA = wl - .004 * H, baseB = wl + .004 * H, baseC = wl + .012 * H, maxH = wl - .06 * H;
  for (x = 0; x < n; x++) {
    var c = C[x], cc = c * c * (3 - 2 * c), e = sn.E[x];
    var tex = .84 + .3 * fbm1(x * .012 / u, s + 3, 3);
    var hA = cc * (pkA[x] * tex * (.58 + .66 * e) + H * .03 * amp[x] * fbm1(x * .0042 / u, s + 4, 2));
    var wig = H * (.03 * sn.LP[x] + .007 * sn.BB[x]);
    hA = softTop(Math.max(0, hA + wig * Math.min(1, hA / (.05 * H))), maxH);
    yA[x] = baseA - hA;
    var hB = cc * (pkB[x] * (.86 + .28 * fbm1(x * .015 / u, s + 13, 3)) * (.68 + .46 * e) + H * .02 * amp[x] * fbm1(x * .0061 / u, s + 14, 2));
    hB = Math.max(0, hB + wig * .55 * Math.min(1, hB / (.04 * H)));
    yB[x] = baseB - hB;
    var isl = sstep(.4, .58, fbm1(x * .0019 / u, s + 8, 2)) * cc * (onsets.length ? onsetGap(x) : 1);   /* shore in stretches, open water between */
    var hC = isl * (H * (.004 + .034 * Math.pow(fbm1(x * .0043 / u, s + 9, 3), 1.5) + .02 * Math.pow(fbm1(x * .014 / u, s + 10, 2), 2)) + H * .005 * sn.LP[x] + H * .002 * sn.BB[x]);
    yC[x] = baseC - Math.max(0, hC);
  }
  keepClear(yA, baseA); keepClear(yB, baseB); keepClear(yC, baseC);
  for (x = 0; x < n; x++) topY[x] = Math.min(yA[x], yB[x], yC[x]);
  this.topY = topY; this.nearLen = n; this.clear = C;
  function mistFn(lo, hi, f, sd) { return function (xx) { return wl - H * (lo + (hi - lo) * n1(xx * f / u, sd)); }; }
  var near = {
    name: 'near', rate: 1, len: n, top: Math.floor(H * .025), bot: Math.ceil(wl + .045 * H),
    ridges: [
      { y: yA, base: baseA, col: [40, 37, 34], a1: .8, tau1: 11 * u, a2: .5, tau2: .2 * H, mist: mistFn(.03, .12, .0035, s + 21), soft: .14 * H,
        sk: .5 / u, sx: 1 / u, s0: .3, s1: 1.0, tint: [86, 116, 104], tintK: .55, seed: s + 31, fold: { sp: .15 * H, a: .34 }, shade: .3, out: { w: 1.5, a: .8, br: .13 } },
      { y: yB, base: baseB, col: [26, 24, 22], a1: .9, tau1: 13 * u, a2: .66, tau2: .15 * H, mist: mistFn(.012, .05, .005, s + 22), soft: .09 * H,
        sk: .62 / u, sx: 1.25 / u, s0: .36, s1: .95, tint: [120, 98, 70], tintK: .4, seed: s + 32, fold: { sp: .1 * H, a: .25 }, shade: .26, out: { w: 1.7, a: .9, br: .1 } },
      { y: yC, base: baseC, col: [34, 32, 29], a1: .74, tau1: 6 * u, a2: .5, tau2: .04 * H, mist: function () { return wl + .03 * H; }, soft: .022 * H,
        sk: 1.1 / u, sx: 1.6 / u, s0: .45, s1: .8, tint: null, tintK: 0, seed: s + 33, fold: null, shade: .1, out: { w: 1.2, a: .7, br: .2 } }
    ]
  };

  /* ================= mid and far layers ================= */
  function compHero(lo, hi) {                     /* keep the opening clear behind the title */
    return function (xl) { return o.openLeft === false ? 1 : sstep(lo * W, hi * W, xl); };
  }
  function buildBack(name, r, spec) {
    var len = Math.ceil(r * (L - W) + W) + 8, sa = seisArrays(len, r);
    var ridges = [];
    spec.ridges.forEach(function (rs, ri) {
      var pk = new Float32Array(len), peaks = [], xx = (.3 + rnd()) * rs.gap * u;
      while (xx < len) {
        var hh = (rs.h0 + (rs.h1 - rs.h0) * rnd()) * H, ww = (rs.w0 + (rs.w1 - rs.w0) * rnd()) * u;
        peaks.push({ x: xx, h: hh, wl: ww * (.8 + .5 * rnd()), wr: ww * (.8 + .5 * rnd()), p1: rs.p1, p2: rs.p2 });
        if (rnd() < .55) peaks.push({ x: xx + (rnd() - .5) * ww * 1.1, h: hh * (.45 + .3 * rnd()), wl: ww * .55, wr: ww * .55, p1: rs.p1, p2: rs.p2 });
        xx += rs.gap * u * (.55 + .95 * rnd());
      }
      raster(peaks, pk);
      pk = warp(pk, 20 * u, .008 / u, s + 40 + ri);
      var y = new Float32Array(len), comp = compHero(rs.c0, rs.c1), sd = s + 50 + ri * 9 + (name === 'far' ? 100 : 0);
      for (var q = 0; q < len; q++) {
        var open = .3 + .7 * sstep(.22, .5, fbm1(q * .0011 / u, sd + 1, 2));     /* stretches of open water */
        var en = name === 'far' ? sa.EL[q] : sa.E[q];
        var h = comp(q) * open * ((pk[q] * (.86 + .3 * fbm1(q * .011 / u, sd + 2, 3)) + H * rs.roll * fbm1(q * .003 / u, sd + 3, 3)) * (rs.g0 + rs.g1 * en))
              + comp(q) * H * rs.wig * sa.LP[q];
        y[q] = rs.base - softTop(Math.max(0, h), rs.base - spec.top - 6);
      }
      keepClear(y, rs.base);
      ridges.push({ y: y, base: rs.base, col: rs.col, a1: rs.a1, tau1: rs.tau1 * u, a2: rs.a2, tau2: rs.tau2 * H, mist: mistFn(rs.m0, rs.m1, .003, sd + 4), soft: rs.soft * H,
        sk: .45 / u, sx: .8 / u, s0: rs.s0, s1: rs.s1, tint: rs.tint || null, tintK: rs.tintK || 0, seed: sd + 5, fold: rs.fold || null, shade: rs.shade || 0, out: rs.out || null, ticks: rs.ticks });
    });
    return { name: name, rate: r, len: len, top: spec.top, bot: spec.bot, ridges: ridges };
  }
  var far = buildBack('far', rate.far, {
    top: Math.floor(H * .1), bot: wl,
    ridges: [
      { gap: 520, h0: .12, h1: .34, w0: 240, w1: 520, p1: 1.7, p2: 1.5, c0: .2, c1: .66, roll: .1, g0: .6, g1: .6, wig: .006, base: wl - .012 * H,
        col: [112, 126, 134], a1: .2, tau1: 16, a2: .2, tau2: .2, m0: .05, m1: .15, soft: .16, s0: .7, s1: .45 },
      { gap: 400, h0: .08, h1: .24, w0: 200, w1: 420, p1: 1.6, p2: 1.5, c0: .26, c1: .7, roll: .08, g0: .62, g1: .6, wig: .008, base: wl - .006 * H,
        col: [96, 112, 122], a1: .26, tau1: 14, a2: .25, tau2: .15, m0: .03, m1: .1, soft: .12, s0: .68, s1: .5 }
    ]
  });
  var mid = buildBack('mid', rate.mid, {
    top: Math.floor(H * .13), bot: Math.ceil(wl + .01 * H),
    ridges: [
      { gap: 330, h0: .15, h1: .4, w0: 120, w1: 260, p1: 1.4, p2: 1.7, c0: .3, c1: .64, roll: .05, g0: .58, g1: .68, wig: .02, base: wl - .002 * H,
        col: [72, 78, 80], a1: .46, tau1: 10, a2: .32, tau2: .17, m0: .04, m1: .13, soft: .13, s0: .5, s1: .8, tint: [92, 122, 116], tintK: .5, fold: { sp: .12 * H, a: .2 }, shade: .22 },
      { gap: 270, h0: .09, h1: .25, w0: 110, w1: 230, p1: 1.4, p2: 1.6, c0: .36, c1: .7, roll: .04, g0: .62, g1: .6, wig: .016, base: wl + .002 * H,
        col: [54, 58, 59], a1: .56, tau1: 10, a2: .4, tau2: .12, m0: .02, m1: .08, soft: .09, s0: .46, s1: .85, shade: .22, out: { w: 1, a: .35, br: .3 }, ticks: true }
    ]
  });
  this.layers = { far: far, mid: mid, near: near };

  /* ================= water, seabed and the fibre ================= */
  var sb = new Float32Array(n);
  for (x = 0; x < n; x++) sb[x] = H * clamp(.874 + .024 * (fbm1(x * .0016 / u, s + 61, 3) - .5) * 2 + .004 * sn.LP[x], .85, .9);
  this.sb = sb;
  this.water = { name: 'water', rate: 1, len: n, top: wl - 2, bot: H };
  this.layers.water = this.water;

  /* shore strokes, reeds, strata: fixed lists so tiles agree at their seams */
  var strokes = [], reeds = [];
  for (x = 0; x < L; x += 62 * u) {
    var cnt2 = 1 + (ih(x | 0, 3, s) * 2.4 | 0);
    for (i = 0; i < cnt2; i++) {
      var r1 = ih(x | 0, 10 + i, s), r2 = ih(x | 0, 20 + i, s), r3 = ih(x | 0, 30 + i, s);
      strokes.push({ x: x + r1 * 60 * u, y: wl + H * (.012 + .13 * r2 * r2), len: (30 + 190 * r3) * u, a: .08 + .2 * ih(x | 0, 40 + i, s), w: (.6 + .9 * r1) * u });
    }
  }
  /* reed clumps stay off the first motion after P and S (the seismogram parts for reeds), so each onset is seen */
  function reedAt(xr, g, j) {
    for (var q = 0; q < onsets.length; q++) {
      var mx = onsets[q].x;
      if (xr > mx - 30 * u && xr < mx + 220 * u) xr = mx + (240 + 60 * ih(j, 5, s + 77)) * u;
    }
    return xr < g.b - 30 * u ? xr : null;
  }
  (o.gaps || []).forEach(function (g, gi) {
    var xr;
    if (rnd() < .75) { xr = reedAt(g.a + (g.b - g.a) * (.06 + .12 * rnd()), g, gi * 2); var k1 = 5 + (rnd() * 6 | 0); if (xr != null) reeds.push({ x: xr, k: k1, sd: gi * 13 + 1 }); }
    if (rnd() < .5) { xr = reedAt(g.b - (g.b - g.a) * (.05 + .1 * rnd()), g, gi * 2 + 1); var k2 = 4 + (rnd() * 5 | 0); if (xr != null) reeds.push({ x: xr, k: k2, sd: gi * 13 + 2 }); }
  });
  this.strokes = strokes; this.reeds = reeds;

  /* pines: on the shoulders of the main peaks, and a few by the water */
  var pines = [];
  allA.forEach(function (p, k) {
    if (p.h < .16 * H) return;
    if (rnd() < .78) { var px = p.x - p.wl * (.3 + .22 * rnd()); pines.push({ x: px, r: 0, size: (25 + 14 * rnd()) * u, lean: -.5 - .45 * rnd(), sd: k * 7 + 1 }); }
    if (rnd() < .45) { var px2 = p.x + p.wr * (.32 + .22 * rnd()); pines.push({ x: px2, r: 0, size: (22 + 12 * rnd()) * u, lean: .45 + .45 * rnd(), sd: k * 7 + 2 }); }
  });
  (o.gaps || []).forEach(function (g, gi) {
    var m = rnd() < .8 ? 2 + (rnd() * 2 | 0) : 0, x0 = g.a + (g.b - g.a) * (.1 + .7 * rnd());
    for (var j = 0; j < m; j++) pines.push({ x: x0 + j * (17 + 12 * rnd()) * u, r: 2, size: (19 + 14 * rnd()) * u, lean: (rnd() - .5) * .6, sd: gi * 31 + j });
  });
  this.pines = pines;

  /* mist sprite */
  this.mist = this.makeMist(rnd);

  /* channels along the fibre */
  this.ch0 = o.ch0 == null ? 0 : o.ch0;
  this.ch1 = o.ch1 == null ? 1872 : o.ch1;
  this.cpp = (this.ch1 - this.ch0) / L;             /* channels per px */
  var cab = window.YW_CABLE, coils = [];
  if (cab && cab.coils) {
    coils.push({ c: 20, m: (cab.facts && cab.facts.reel_m) || 134 });
    cab.coils.forEach(function (k) { coils.push({ c: (k.from + k.to) / 2, m: k.m }); });
  }
  this.coils = coils;

  /* the boxes of the phase labels (P, S, surface waves) with their ticks, as drawPhases sets them: birds fade out there */
  var fsL = Math.max(13, 16 * u), yT = this.traceY();
  this.labels = (o.phases || []).map(function (p) {
    var ya = yT - .027 * H * (p.amp || .4) - 4 * u, y1 = ya - (p.up || 26) * u, hw = (p.label.length * .5 + .6) * fsL / 2;
    return [p.x - hw, y1 - 6 * u - fsL, p.x + hw, ya];
  });

  /* birds on wires */
  var wr = o.wires;
  if (wr) {
    var birds = [], slots = [[0, .16], [1, .3], [0, .42], [2, .5], [1, .63], [3, .72], [0, .84], [2, .22]];
    slots.forEach(function (sl, k) { if (k < 6) birds.push({ w: sl[0], f: sl[1], dir: rnd() < .5 ? -1 : 1, st: 'sit', t: 0 }); });
    this.birds = birds;
    this.nextFlight = performance.now() + 5000 + rnd() * 5000;
  }
};

Painting.prototype.makeMist = function (rnd) {
  var H = this.o.H, w = 1400, h = Math.round(H * .24), c = document.createElement('canvas');
  c.width = w; c.height = h;
  var g = c.getContext('2d');
  for (var i = 0; i < 30; i++) {
    var x = rnd() * w, y = h * (.2 + .6 * rnd()), rx = 130 + 280 * rnd(), ry = (12 + 30 * rnd()) * (H / 840), a = .35 + .5 * rnd();
    for (var k = -1; k <= 1; k++) {
      g.save(); g.translate(x + k * w, y); g.scale(rx / ry, 1);
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, ry);
      gr.addColorStop(0, 'rgba(248,243,231,' + a + ')'); gr.addColorStop(.55, 'rgba(248,243,231,' + a * .5 + ')'); gr.addColorStop(1, 'rgba(248,243,231,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ry, 0, TAU); g.fill(); g.restore();
    }
  }
  return c;
};

/* ------------------------------------------------------------------ tiles */
Painting.prototype.tile = function (name, i, make) {
  var key = name + ':' + i, t = this.tiles.get(key);
  if (t) { t.used = this.frameNo; return t.c; }
  if (!make) { if (this.queue.indexOf(key) < 0) this.queue.push(key); return null; }
  var c = this.renderTile(name, i);
  this.tiles.set(key, { c: c, used: this.frameNo });
  if (this.tiles.size > 22) {                      /* drop the tile used longest ago */
    var old = null, ou = Infinity;
    this.tiles.forEach(function (v, k) { if (v.used < ou) { ou = v.used; old = k; } });
    if (old) this.tiles.delete(old);
  }
  return c;
};

Painting.prototype.renderTile = function (name, i) {
  var lay = this.layers[name], S = this.S, x0 = i * TW - BL;
  var wCss = Math.max(1, Math.min(TW + 2 * BL, lay.len - x0)), cw = Math.ceil(wCss * S), ch = Math.ceil((lay.bot - lay.top) * S);
  var c = document.createElement('canvas'); c.width = cw; c.height = ch; c._w = Math.max(1, Math.min(TW, lay.len - i * TW));   /* width without the bleed */
  var g = c.getContext('2d'), img = g.createImageData(cw, ch);
  if (name === 'water') this.washWater(img.data, cw, ch, x0, lay.top);
  else for (var k = 0; k < lay.ridges.length; k++) this.wash(img.data, cw, ch, x0, lay.top, lay.ridges[k]);
  g.putImageData(img, 0, 0);
  g.setTransform(S, 0, 0, S, -x0 * S, -lay.top * S);
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (name === 'near') {                       /* the seismogram goes behind the hills already washed in; a shore hides it whole */
    var shore = lay.ridges[2], sy = shore.y, sn = sy.length - 1, xa = Math.max(0, Math.floor(x0 - 30)), xb = Math.min(sn, Math.ceil(x0 + wCss + 30));
    g.save(); g.beginPath(); g.moveTo(xa, lay.top - 4);
    for (var xx = xa; xx <= xb; xx += 2) g.lineTo(xx, sy[xx] < shore.base - .5 ? sy[xx] + .5 : lay.bot + 4);
    g.lineTo(xb, lay.top - 4); g.closePath(); g.clip();
    g.globalCompositeOperation = 'destination-over'; this.inkTrace(g, x0 - 30, x0 + wCss + 30);
    g.restore();
  }
  if (name === 'near') this.linesNear(g, x0 - 60, x0 + wCss + 60);
  else if (name === 'mid') this.linesMid(g, x0 - 30, x0 + wCss + 30);
  else if (name === 'water') this.linesWater(g, x0 - 260, x0 + wCss + 60);
  return c;
};

function over(D, k, r, g, b, a) {                  /* source-over into straight-alpha bytes */
  var da = D[k + 3] / 255;
  if (da <= 0) { D[k] = r; D[k + 1] = g; D[k + 2] = b; D[k + 3] = a * 255; return; }
  var oa = a + da * (1 - a), w1 = a / oa, w2 = 1 - w1;
  D[k] = r * w1 + D[k] * w2; D[k + 1] = g * w1 + D[k + 1] * w2; D[k + 2] = b * w1 + D[k + 2] * w2; D[k + 3] = oa * 255;
}

/* one ridge: dark crest, vertical dry-brush streaks, a body that thins out into mist */
Painting.prototype.wash = function (D, cw, ch, x0, top, R) {
  var S = this.S, u = this.u, G = TEX.G, ST = TEX.ST, y = R.y, n = y.length - 2;
  var lut = R._lut;
  if (!lut) {
    var ln = Math.ceil((this.o.H) * 2) + 4; lut = R._lut = new Float32Array(ln);
    for (var q = 0; q < ln; q++) { var dd = q / 2; lut[q] = R.a1 * Math.exp(-dd / R.tau1) + R.a2 * Math.exp(-dd / R.tau2); }
  }
  var by = Math.min(ch, Math.round((R.base - top) * S)), col = R.col, tint = R.tint, fold = R.fold;
  for (var px = 0; px < cw; px++) {
    var xl = x0 + px / S, xi = xl | 0; if (xi < 0) xi = 0; else if (xi > n) xi = n;
    var f = xl - xi, ryc = y[xi] + (y[xi + 1] - y[xi]) * f;
    if (R.base - ryc < .7) continue;
    var ry = (ryc - top) * S, py0 = Math.floor(ry); if (py0 < 0) py0 = 0;
    var my = (R.mist(xl) - top) * S, soft = R.soft * S;
    var slope = (y[Math.min(n, xi + 7)] - y[Math.max(0, xi - 7)]) / 14;
    var sh = 1 + R.shade * clamp(slope * 1.4, -1, 1);                   /* the right flank sits in shadow */
    var tk = tint ? R.tintK * sstep(.3, .8, n1(xl * .0031 / u, R.seed + 77)) : 0;
    var sxI = ((xl * R.sx) | 0) & 1023, gx = ((x0 * S + px) | 0) & 511;
    var fph = fold ? 1.4 * n1(xl * .011 / u, R.seed + 40) + .5 * n1(xl * .05 / u, R.seed + 41) : 0;
    for (var py = py0; py < by; py++) {
      var dpx = py + .5 - ry; if (dpx < 0) dpx = 0;
      var d = dpx / S, a = lut[(d * 2) | 0];
      if (fold) {
        var p = d / fold.sp + fph;
        if (p >= 1) { var fr = p - (p | 0), g1 = 1 - fr; a += fold.a * g1 * g1 * g1 * g1 * Math.exp(-d / (R.tau2 * 2.6)); }
      }
      a *= R.s0 + R.s1 * ST[((((d * R.sk) | 0) & 255) << 10) + sxI];
      a *= sh * (.8 + .4 * G[((py & 511) << 9) + gx]);
      var m = (my - py) / soft;
      if (m < 1) { if (m <= 0) break; a *= m * m * (3 - 2 * m); }
      if (py === py0) a *= clamp(py0 + 1 - ry, 0, 1);
      if (a < .004) continue; if (a > 1) a = 1;
      var k = (py * cw + px) << 2;
      if (tk > 0) { var tt = tk * sstep(12 * u, 90 * u, d); over(D, k, col[0] + (tint[0] - col[0]) * tt, col[1] + (tint[1] - col[1]) * tt, col[2] + (tint[2] - col[2]) * tt, a); }
      else over(D, k, col[0], col[1], col[2], a);
    }
  }
};

/* water: broken reflections under the near mountains; below the seabed, a wash and strata */
Painting.prototype.washWater = function (D, cw, ch, x0, top) {
  var S = this.S, H = this.o.H, u = this.u, G = TEX.G, HS = TEX.HS, wl = this.wl, sb = this.sb, ty = this.topY, n = sb.length - 2;
  for (var px = 0; px < cw; px++) {
    var xl = x0 + px / S, xi = clamp(xl | 0, 0, n), gx = ((x0 * S + px) | 0) & 511;
    var hN = wl - ty[xi], len = Math.min(.36 * hN, .15 * H), hx = ((xl * .06 / u) | 0) & 255, py, k, a;
    if (len > 3) {
      var y0 = Math.round((wl + .012 * H - top) * S), y1 = Math.min(ch, Math.round((wl + .012 * H + len - top) * S));
      for (py = Math.max(0, y0); py < y1; py++) {
        var t = (py - y0) / (y1 - y0), hs = HS[((((py / S * 1.25 / u) | 0) & 255) << 8) + hx];
        a = .3 * Math.pow(1 - t, 1.5) * sstep(.36, .56, hs) * (.75 + .5 * G[((py & 511) << 9) + gx]) * sstep(3, 26 * u, hN);
        if (a < .004) continue;
        over(D, (py * cw + px) << 2, 44, 44, 42, Math.min(1, a));
      }
    }
    var sy = (sb[xi] + (sb[xi + 1] - sb[xi]) * (xl - xi) - top) * S, sy0 = Math.max(0, Math.floor(sy));
    var w1 = 9 * u * (n1(xl * .004 / u, this.seed + 81) - .5), w2 = 12 * u * (n1(xl * .0033 / u, this.seed + 82) - .5);
    var b1 = (.03 * H + w1) * S, b2 = (.062 * H + w2) * S;
    for (py = sy0; py < ch; py++) {
      var dd = py + .5 - sy; if (dd < 0) continue;
      a = .085 + .1 * Math.min(1, dd / (.12 * H * S));
      if (dd > b1) a += .04; if (dd > b2) a += .035;
      a *= .7 + .6 * G[((py & 511) << 9) + gx];
      a *= .86 + .28 * HS[((((py / S * .6) | 0) & 255) << 8) + hx];
      if (py === sy0) a *= clamp(sy0 + 1 - sy, 0, 1);
      k = (py * cw + px) << 2;
      over(D, k, 122, 106, 84, Math.min(1, a));
    }
  }
};

/* ------------------------------------------------------------------ line work (vector, into tiles) */
function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

Painting.prototype.outline = function (g, y, base, x0, x1, w, alpha, br, sd, col, R) {
  var n = y.length - 2, u = this.u, step = 3, chunk = 24;
  g.strokeStyle = rgba(col || INK, 1);
  for (var x = Math.max(0, Math.floor(x0 / chunk) * chunk); x < Math.min(n, x1); x += chunk) {
    if (n1(x * .041, sd + 2) < br) continue;
    var hh = base - y[Math.min(n, x + 12)];
    if (hh < 1.2) continue;
    g.beginPath();
    for (var xx = x; xx <= Math.min(n, x + chunk + 2); xx += step) g.lineTo(xx, y[xx] + .6);
    var mf = R ? sstep(.1, .62, (R.mist(x + 12) - y[Math.min(n, x + 12)]) / R.soft) : 1;
    if (mf < .03) continue;
    g.lineWidth = w * u * (.45 + 1.15 * n1(x * .017, sd + 1)) * sstep(1, 10 * u, hh);
    g.globalAlpha = alpha * (.45 + .55 * ih(x, 1, sd)) * mf;
    g.stroke();
  }
  g.globalAlpha = 1;
};

/* texture strokes that fall from the ridge (hemp-fibre strokes) */
Painting.prototype.cun = function (g, y, base, x0, x1, sd, dens, tone, R) {
  var n = y.length - 2, u = this.u, H = this.o.H, sp = 15 * u / dens;
  g.strokeStyle = rgba(INK, 1);
  for (var k = Math.floor(x0 / sp); k * sp < x1; k++) {
    var x = k * sp + ih(k, 1, sd) * sp * .9; if (x < 9 || x > n - 9) continue;
    var xi = x | 0, hh = base - y[xi]; if (hh < .055 * H) continue;
    var slope = (y[xi + 8] - y[xi - 8]) / 16;
    var lean = clamp(slope * .8, -.62, .62) + (ih(k, 2, sd) - .5) * .3;
    var len = hh * (.14 + .42 * ih(k, 3, sd)), ex = 0, ey = 0, ok = false;
    for (var tr = 0; tr < 4 && !ok; tr++) {
      ex = x + Math.sin(lean) * len; ey = y[xi] + Math.cos(lean) * len;
      var exi = clamp(ex | 0, 0, n), mxi = clamp(((x + ex) / 2) | 0, 0, n);
      ok = y[exi] < ey - 3 * u && y[mxi] < (y[xi] + ey) / 2 - 2 * u && ey < (R ? R.mist(ex) - .3 * R.soft : base - 2);
      if (!ok) { len *= .62; lean *= .55; }
    }
    if (!ok) continue;
    var bend = (ih(k, 4, sd) - .5) * len * .2;
    g.globalAlpha = tone * (.07 + .2 * ih(k, 5, sd));
    g.lineWidth = (.6 + 1.3 * ih(k, 6, sd)) * u;
    g.beginPath(); g.moveTo(x, y[xi] + 1.5);
    g.quadraticCurveTo((x + ex) / 2 + bend, (y[xi] + ey) / 2, ex, ey); g.stroke();
  }
  g.globalAlpha = 1;
};

Painting.prototype.dots = function (g, y, base, x0, x1, sd, R) {
  var n = y.length - 2, u = this.u, H = this.o.H, sp = 58 * u, w = Math.round(16 * u);
  g.fillStyle = rgba(INK, 1);
  for (var k = Math.floor(x0 / sp); k * sp < x1; k++) {
    var x = k * sp + ih(k, 1, sd) * sp; if (x < w + 2 || x > n - w - 2) continue;
    var xi = x | 0;
    if (base - y[xi] < .07 * H || ih(k, 2, sd) < .25) continue;
    if (R && R.mist(x) - y[xi] < .6 * R.soft) continue;                       /* this stretch of ridge is lost in the mist */
    if (y[xi] <= y[xi - w] && y[xi] <= y[xi + w]) continue;                  /* not under a summit, where a few dots read as a face */
    var m = 3 + (ih(k, 3, sd) * 5 | 0);
    for (var j = 0; j < m; j++) {
      var dx = (ih(k, 10 + j, sd) - .5) * 24 * u, xx = clamp(x + dx, 0, n), dy = 1.5 + ih(k, 20 + j, sd) * 9 * u;   /* along the contour */
      g.globalAlpha = .5 + .4 * ih(k, 30 + j, sd);
      g.beginPath(); g.ellipse(xx, y[xx | 0] + dy, (1.3 + 1.6 * ih(k, 40 + j, sd)) * u, (.8 + .8 * ih(k, 50 + j, sd)) * u, 0, 0, TAU); g.fill();
    }
  }
  g.globalAlpha = 1;
};

Painting.prototype.pine = function (g, x, y, s, lean, sd) {
  var tx = x + lean * s * .7, ty = y - s * .9, mx = x + lean * s * .04, my = y - s * .5, k, j;
  g.strokeStyle = rgba(INK, 1); g.fillStyle = rgba(INK, 1);
  g.globalAlpha = .95; g.lineWidth = Math.max(1.2, s * .085);
  g.beginPath(); g.moveTo(x - lean * s * .1, y + s * .14); g.quadraticCurveTo(mx, my, tx, ty); g.stroke();
  var tiers = 3 + (ih(sd, 1, 5) * 2 | 0), dir = lean < 0 ? -1 : 1;
  for (k = 0; k < tiers; k++) {
    var f = k / (tiers - 1), q = 1 - f * .6, q1 = 1 - q;                                /* q = 1 at the top */
    var px = q1 * q1 * x + 2 * q * q1 * mx + q * q * tx, py = q1 * q1 * y + 2 * q * q1 * my + q * q * ty;
    var side = k === 0 ? dir : (k % 2 ? -dir : dir);
    var w = s * (.19 + .2 * f) * (.85 + .3 * ih(sd, k, 6)), h = s * .07;
    var cx = px + side * w * .5, cy = py - (k === 0 ? h * .4 : 0);
    g.globalAlpha = .9; g.lineWidth = Math.max(.8, s * .034);
    g.beginPath(); g.moveTo(px, py + h * .5); g.quadraticCurveTo((px + cx) / 2, cy + h, cx + side * w * .55, cy + h * .35); g.stroke();
    g.globalAlpha = .93; g.beginPath();
    for (j = 0; j < 5; j++) {
      var jx = cx + (j / 4 - .5) * 2 * w * .84, jr = h * (.85 + 1.05 * Math.sin(Math.PI * (j + .5) / 5)) * (.8 + .45 * ih(sd, k * 7 + j, 8));
      g.moveTo(jx + jr, cy - jr * .3); g.arc(jx, cy - jr * .3, jr, 0, TAU);
    }
    g.moveTo(cx + w, cy + h * .2); g.ellipse(cx, cy + h * .2, w, h * .5, 0, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
};

Painting.prototype.linesNear = function (g, x0, x1) {
  var R = this.layers.near.ridges, H = this.o.H, u = this.u, self = this, s = this.seed;
  this.cun(g, R[0].y, R[0].base, x0, x1, s + 201, 1, .9, R[0]);
  this.outline(g, R[0].y, R[0].base, x0, x1, R[0].out.w, R[0].out.a, R[0].out.br, s + 211, [34, 31, 28], R[0]);
  this.dots(g, R[0].y, R[0].base, x0, x1, s + 221, R[0]);
  /* long creases from the main summits */
  g.strokeStyle = rgba(INK, 1);
  this.peaksA.forEach(function (p, k) {
    if (p.x < x0 - 200 || p.x > x1 + 200 || p.h < .16 * H) return;
    var y = R[0].y, n = y.length - 2;
    for (var j = 0; j < 4; j++) {
      var xs = clamp(p.x + (ih(k, j, s + 5) - .5) * (p.wl + p.wr) * .34, 2, n - 2) | 0;
      var hh = R[0].base - y[xs]; if (hh < .1 * H) continue;
      var dir = xs < p.x ? -1 : 1, len = hh * (.42 + .4 * ih(k, 10 + j, s + 5)), lean = dir * (.06 + .2 * ih(k, 20 + j, s + 5));
      var ex = 0, ey = 0, ok = false;
      for (var tr = 0; tr < 5 && !ok; tr++) {
        ex = xs + Math.sin(lean) * len; ey = y[xs] + Math.cos(lean) * len; ok = ey < R[0].mist(ex) - .35 * R[0].soft;
        for (var q = 1; q <= 4 && ok; q++) { var qx = clamp((xs + (ex - xs) * q / 4) | 0, 0, n); if (y[qx] > y[xs] + (ey - y[xs]) * q / 4 - 4 * u) ok = false; }
        if (!ok) { len *= .7; lean *= .5; }
      }
      if (!ok) continue;
      g.globalAlpha = .2 + .26 * ih(k, 30 + j, s + 5); g.lineWidth = (.8 + 1.5 * ih(k, 40 + j, s + 5)) * u;
      g.beginPath(); g.moveTo(xs, y[xs] + 2);
      g.bezierCurveTo(xs + dir * len * .05, y[xs] + len * .35, ex - dir * len * .12, ey - len * .3, ex, ey); g.stroke();
    }
  });
  g.globalAlpha = 1;
  this.cun(g, R[1].y, R[1].base, x0, x1, s + 202, 1.2, 1, R[1]);
  this.outline(g, R[1].y, R[1].base, x0, x1, R[1].out.w, R[1].out.a, R[1].out.br, s + 212, null, R[1]);
  this.dots(g, R[1].y, R[1].base, x0, x1, s + 222, R[1]);
  this.pines.forEach(function (p) {
    if (p.x < x0 - 40 || p.x > x1 + 40) return;
    var y = R[p.r].y, xi = clamp(p.x | 0, 0, y.length - 2);
    if (R[p.r].base - y[xi] < (p.r === 2 ? 2.5 : .05 * H)) return;
    var wr = self.o.wires;
    if (wr && p.r === 2 && p.x > wr[0] - 50 * u && p.x < wr[1] + 50 * u) return;
    var best = xi, q;
    if (p.r !== 2) for (q = Math.max(0, xi - (5 * u | 0)); q <= Math.min(y.length - 2, xi + (5 * u | 0)); q++) if (y[q] < y[best]) best = q;   /* stand on the nearest ledge */
    if (p.r !== 2 && R[p.r].mist(best) - y[best] < .5 * R[p.r].soft) return;
    var cx = best + p.lean * p.size * .45, cy = y[best] - p.size * .75, cr = .6 * p.size;   /* no crown reaches into the moon or the type, */
    if (self.keeps.some(function (kp) { return cx + cr > kp.a && cx - cr < kp.b && cy - cr < kp.top(clamp(cx, kp.a, kp.b)); })) return;
    if (self.o.L <= self.o.W && (cx - cr < 0 || cx + cr > self.o.W)) return;                  /* nor is cut by the edge of a band */
    self.pine(g, best, y[best] + 1.5 * u, p.size, p.lean, p.sd);
  });
  this.outline(g, R[2].y, R[2].base, x0, x1, R[2].out.w, R[2].out.a, R[2].out.br, s + 213);
  /* poles for the wires stand on the shore */
  var wr = this.o.wires;
  if (wr && wr[1] > x0 - 20 && wr[0] < x1 + 20) {
    var yc = R[2].y, hp = .215 * H;
    [wr[0], wr[1]].forEach(function (px, k) {
      var gy = yc[clamp(px | 0, 0, yc.length - 2)] + 2;
      g.strokeStyle = rgba(INK, 1); g.globalAlpha = .82; g.lineWidth = 1.7 * u;
      g.beginPath(); g.moveTo(px, gy); g.lineTo(px + (k ? 1.5 : -1.5) * u, gy - hp); g.stroke();
      g.lineWidth = 1.2 * u;
      for (var j = 0; j < 2; j++) { g.beginPath(); g.moveTo(px - 9 * u, gy - hp + (5 + j * 15) * u); g.lineTo(px + 9 * u, gy - hp + (4 + j * 15) * u); g.stroke(); }
    });
    g.globalAlpha = 1;
  }
};

Painting.prototype.linesMid = function (g, x0, x1) {
  var R = this.layers.mid.ridges, u = this.u, H = this.o.H, s = this.seed;
  for (var r = 0; r < R.length; r++) {
    var rr = R[r], y = rr.y, n = y.length - 2;
    if (rr.out) this.outline(g, y, rr.base, x0, x1, rr.out.w, rr.out.a, rr.out.br, s + 301 + r, [52, 56, 58], rr);
    if (!rr.ticks) continue;
    g.strokeStyle = 'rgba(46,50,52,1)'; g.lineWidth = 1 * u;
    for (var x = Math.max(4, Math.floor(x0 / 5) * 5); x < Math.min(n - 4, x1); x += 5) {      /* a fringe of distant trees */
      if (rr.base - y[x] < .035 * H || n1(x * .012 / u, s + 311) < .52) continue;
      g.globalAlpha = .2 + .3 * ih(x, 2, s + 312);
      var hh = (2.5 + 5 * ih(x, 3, s + 313)) * u;
      g.beginPath(); g.moveTo(x, y[x] + 1); g.lineTo(x + (ih(x, 4, s) - .5) * 1.5, y[x] - hh); g.stroke();
    }
    g.globalAlpha = 1;
  }
};

Painting.prototype.linesWater = function (g, x0, x1) {
  var u = this.u, H = this.o.H, wl = this.wl, sb = this.sb, n = sb.length - 2, s = this.seed, self = this, x, k;
  /* dry strokes on the water */
  g.strokeStyle = rgba([40, 40, 38], 1);
  this.strokes.forEach(function (st) {
    if (st.x + st.len < x0 || st.x > x1) return;
    var near = wl - self.topY[clamp((st.x + st.len / 2) | 0, 0, n)];
    g.lineWidth = st.w; var segs = Math.max(2, st.len / (26 * u) | 0);
    for (var q = 0; q < segs; q++) {
      if (ih(st.x | 0, q, s + 401) < .3) continue;
      var a0 = (q + .3 * ih(st.x | 0, q, s + 402)) / segs, a1 = (q + .55 + .5 * ih(st.x | 0, q, s + 403)) / segs, tp = Math.sin(Math.PI * Math.min(1, (a0 + a1) / 2));
      g.globalAlpha = st.a * tp * (near > 14 * u ? 1.25 : .7);
      g.beginPath(); g.moveTo(st.x + st.len * a0, st.y + Math.sin(a0 * 5 + st.x) * .6); g.lineTo(st.x + st.len * a1, st.y + Math.sin(a1 * 5 + st.x) * .6); g.stroke();
    }
  });
  /* reeds */
  g.strokeStyle = rgba(INK, 1);
  this.reeds.forEach(function (rd) {
    if (rd.x < x0 - 60 || rd.x > x1 + 60) return;
    for (var j = 0; j < rd.k + 3; j++) {
      var bx = rd.x + (ih(rd.sd, j, s + 411) - .5) * 40 * u, hh = (22 + 40 * ih(rd.sd, j, s + 412)) * u, ln = (ih(rd.sd, j, s + 413) - .3) * 26 * u;
      var by = wl + (.016 + .014 * ih(rd.sd, j, s + 414)) * H;
      g.globalAlpha = .4 + .45 * ih(rd.sd, j, s + 415); g.lineWidth = (.6 + .6 * ih(rd.sd, j, s + 416)) * u;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + ln * .1, by - hh * .7, bx + ln, by - hh); g.stroke();
      if (ih(rd.sd, j, s + 417) > .6) { g.beginPath(); g.ellipse(bx + ln, by - hh, .9 * u, 2.6 * u, ln * .04, 0, TAU); g.fillStyle = rgba(INK, 1); g.fill(); }
    }
  });
  g.globalAlpha = 1;
  /* seabed and strata */
  this.outline(g, sb, H + 50, x0, x1, 1.15, .62, .07, s + 421, [58, 52, 44]);
  var offs = [.03, .062, .096];
  g.strokeStyle = 'rgba(70,62,50,1)'; g.lineWidth = .8 * u;
  for (k = 0; k < offs.length; k++) {
    for (x = Math.max(0, Math.floor(x0 / 30) * 30); x < Math.min(n, x1); x += 30) {
      if (n1(x * .02, s + 430 + k) < .2) continue;
      g.globalAlpha = .2 + .2 * ih(x, k, s + 431);
      g.beginPath();
      for (var xx = x; xx <= Math.min(n, x + 31); xx += 5) {
        var wv = (k === 0 ? 9 : k === 1 ? 12 : 15) * u * (n1(xx * (k === 0 ? .004 : .0033) / u, s + 81 + k) - .5);
        g.lineTo(xx, sb[xx] + offs[k] * H + wv);
      }
      g.stroke();
    }
  }
  /* a stipple in the first bed */
  g.fillStyle = 'rgba(70,62,50,1)';
  for (x = Math.max(0, Math.floor(x0 / 9) * 9); x < Math.min(n, x1); x += 9) {
    if (ih(x, 7, s + 441) < .5) continue;
    g.globalAlpha = .12 + .16 * ih(x, 8, s + 441);
    g.beginPath(); g.arc(x + ih(x, 9, s) * 8, sb[x] + (.006 + .02 * ih(x, 10, s + 441)) * H, .75 * u, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
};

/* ------------------------------------------------------------------ live drawing */
Painting.prototype.fy = function (x) {
  var sb = this.sb, xi = clamp(x, 0, sb.length - 2), i = xi | 0;
  return sb[i] + (sb[i + 1] - sb[i]) * (xi - i) - 2.2 * this.uf;
};
Painting.prototype.xOfCh = function (c) { return (c - this.ch0) / this.cpp; };

Painting.prototype.ripple = function (xw, y) {
  var now = performance.now(), u = this.u, still = this.o.still, sd = (now | 0) % 9973;
  var k = clamp(this.o.W / 1100, .45, 1), vP = 262 * u * k, vS = 150 * u * k;        /* slower on a small canvas, so the rings stay on it */
  if (y < this.wl + 4) y = this.wl + 4;
  var rings = still
    ? [{ v: 0, R: 46 * u, a: .5, w: 2.2, irr: .08, s: sd + 1 }, { v: 0, R: 104 * u, a: .34, w: 1.6, irr: .07, s: sd + 2 }, { v: 0, R: 176 * u, a: .22, w: 1.2, irr: .06, s: sd + 3 }]
    : [{ v: vP, d: 0, a: .34, w: 1.5, irr: .045, s: sd + 1, kind: 'P' },
       { v: vS, d: 0, a: .6, w: 2.7, irr: .07, s: sd + 2, kind: 'S' },
       { v: vS, d: .3, a: .42, w: 2.1, irr: .09, s: sd + 3 },
       { v: vS, d: .66, a: .25, w: 1.5, irr: .11, s: sd + 4 }];
  var spl = [];
  for (var i = 0; i < 7; i++) spl.push({ a: ih(i, 1, sd) * TAU, r: (10 + 34 * ih(i, 2, sd)) * u, s: (1 + 2.4 * ih(i, 3, sd)) * u });
  this.ripples.push({ x: xw, y: y, t0: now, life: still ? 1.8 : 5.4, rings: rings, spl: spl, sd: sd, still: still, vP: vP, vS: vS });
  if (this.ripples.length > 6) this.ripples.shift();
};
Painting.prototype.active = function () { return this.ripples.length > 0 || this.queue.length > 0; };

Painting.prototype.drawRing = function (ctx, cx, cy, R, fade, rg, sx) {
  var N = clamp(Math.round(R * .34), 48, 240), pts = [], vis = [], i, j, u = this.u, H = this.o.H, sb = this.sb, nb = sb.length - 1;
  fade *= 1 - sstep(Math.min(330 * u, .45 * this.o.W), Math.min(640 * u, .85 * this.o.W), R);   /* gone before it grows into stray lines */
  if (fade < .012) return;
  function visAt(px, py) {                                                      /* the rings die out in the seabed */
    var bed = sb[clamp((sx + px) | 0, 0, nb)];
    return 1 - sstep(bed - 3 * u, bed + .035 * H, py);
  }
  for (i = 0; i <= N; i++) {
    var th = i / N * TAU, cs = Math.cos(th), sn = Math.sin(th);
    var rr = R * (1 + rg.irr * 2 * (n2(cs * 1.9 + 3.1, sn * 1.9 + R * .004, rg.s) - .5)) + rg.w * 1.2 * u * (n1(i * .5, rg.s + 3) - .5);
    var px = cx + cs * rr, py = cy + sn * rr * .96;
    pts.push(px, py);
    vis.push(visAt(px, py));
  }
  /* one stretch of the ring: in open water as one stroke; where it reaches the seabed piece by piece, each piece
     (5 px where the depth changes fast) as faint as the bed under it makes it */
  function part(i, e, lo, a, w, cap) {
    var j, q;
    ctx.lineWidth = w;
    if (lo > .98) {
      ctx.lineCap = cap; ctx.globalAlpha = a;
      ctx.beginPath(); ctx.moveTo(pts[i * 2], pts[i * 2 + 1]);
      for (j = i + 1; j <= e; j++) ctx.lineTo(pts[j * 2], pts[j * 2 + 1]);
      ctx.stroke(); return;
    }
    ctx.lineCap = 'butt';
    for (j = i; j < e; j++) {
      var ax = pts[j * 2], ay = pts[j * 2 + 1], bx = pts[j * 2 + 2], by = pts[j * 2 + 3], va = vis[j], vb = vis[j + 1];
      if (va < .02 && vb < .02) continue;
      var m = Math.abs(va - vb) > .1 ? Math.ceil(Math.hypot(bx - ax, by - ay) / (5 * u)) : 1;
      for (q = 0; q < m; q++) {
        var x0 = ax + (bx - ax) * q / m, y0 = ay + (by - ay) * q / m, x1 = ax + (bx - ax) * (q + 1) / m, y1 = ay + (by - ay) * (q + 1) / m;
        var v = m > 1 ? visAt((x0 + x1) / 2, (y0 + y1) / 2) : (va + vb) / 2;
        if (v < .02) continue;
        ctx.globalAlpha = a * v; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
  }
  ctx.lineJoin = 'round';
  for (i = 0; i < N; i += 10) {                                                 /* ten points at a time */
    var e = Math.min(N, i + 10), lo = 1, hi = 0;
    for (j = i; j <= e; j++) { if (vis[j] < lo) lo = vis[j]; if (vis[j] > hi) hi = vis[j]; }
    if (hi < .02) continue;
    part(i, e, lo, fade * .07, rg.w * 3.2 * u, 'butt');                         /* the wet band */
    var nz = n1(i * .13 + R * .006, rg.s + 5);                                  /* the line: a dry-brush arc */
    if (nz >= .3) part(i, e, lo, fade * (.3 + .7 * nz), rg.w * u * (.35 + 1.5 * n1(i * .09 + 7, rg.s + 9)), 'round');
  }
  ctx.globalAlpha = 1;
};

Painting.prototype.drawRipples = function (ctx, sx, now) {
  var W = this.o.W, H = this.o.H, u = this.u, wl = this.wl, self = this;
  this.ripples = this.ripples.filter(function (r) { return (now - r.t0) / 1000 < r.life; });
  if (!this.ripples.length) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, wl + .004 * H, W, H); ctx.clip();
  ctx.strokeStyle = rgba(INK, 1); ctx.lineCap = 'round';
  this.ripples.forEach(function (r) {
    var age = Math.max(0, (now - r.t0) / 1000), cx = r.x - sx, cy = r.y, k = clamp(age / r.life, 0, 1);
    var grow = r.still ? 1 : Math.sqrt(Math.min(1, age / 1.4)), R0 = (9 + 44 * grow) * u;
    if (!r.still && age < .45) {                                               /* the drop itself, before it spreads */
      ctx.fillStyle = rgba(INK, .9 * (1 - sstep(.22, .45, age)));
      ctx.beginPath(); ctx.ellipse(cx, cy, (5 + 12 * Math.min(1, age / .3)) * u, (4.6 + 10.8 * Math.min(1, age / .3)) * u, 0, 0, TAU); ctx.fill();
    }
    var ba = (r.still ? .5 : .85) * Math.pow(1 - clamp(age / (r.still ? r.life : 3.6), 0, 1), 1.5);
    if (ba > .01) {
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R0);
      g.addColorStop(0, rgba(INK, ba)); g.addColorStop(.55, rgba(INK, ba * .7)); g.addColorStop(1, rgba(INK, 0));
      ctx.fillStyle = g; ctx.beginPath();
      for (var i = 0; i <= 40; i++) { var th = i / 40 * TAU, rr = R0 * (.8 + .4 * n1(i * .4, r.sd)); ctx.lineTo(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * .9); }
      ctx.fill();
      ctx.fillStyle = rgba(INK, ba * .8);
      r.spl.forEach(function (sp) { ctx.beginPath(); ctx.arc(cx + Math.cos(sp.a) * sp.r * (.6 + .4 * grow), cy + Math.sin(sp.a) * sp.r * .7 * (.6 + .4 * grow), sp.s, 0, TAU); ctx.fill(); });
    }
    r.rings.forEach(function (rg) {
      var R = r.still ? rg.R : rg.v * (age - (rg.d || 0));
      if (R < 3) return;
      self.drawRing(ctx, cx, cy, R, Math.pow(1 - k, 1.35) * rg.a, rg, sx);
    });
  });
  ctx.restore();
};

/* small earthquakes under 海底听震: each one reaches the nearest channel first and then spreads along the fibre
   (the hyperbolic moveout a DAS record shows), so a little burst of red ticks runs out to both sides */
Painting.prototype.listen = function (x0, x1, now) {
  var em = this.o.emph, u = this.u;
  if (!em || this.o.still) return;
  this.micro = this.micro.filter(function (q) { return now - q.t0 < 1500; });
  if (now > this.nextMicro && em[1] > x0 && em[0] < x1) {
    var r = Math.random();
    this.micro.push({ x: em[0] + (em[1] - em[0]) * (.12 + .76 * Math.random()), t0: now, a: .35 + .65 * r * r, h: (18 + 40 * Math.random()) * u });
    this.nextMicro = now + 500 + 1300 * Math.random();
  }
};
Painting.prototype.quiver = function (xw, now) {
  var a = 0, u = this.u, m = this.micro;
  for (var i = 0; i < m.length; i++) {
    var q = m[i], d = Math.abs(xw - q.x); if (d > 260 * u) continue;
    var age = (now - q.t0) / 1000, ta = Math.sqrt(d * d + q.h * q.h) / (320 * u), z = (age - ta) / .11;
    var v = q.a * Math.exp(-z * z) * (1 - d / (260 * u));
    if (v > a) a = v;
  }
  return a;
};

/* how hard a point on the fibre is shaken right now */
Painting.prototype.shake = function (xw, y, now) {
  var a = 0, u = this.u;
  for (var i = 0; i < this.ripples.length; i++) {
    var r = this.ripples[i]; if (r.still) continue;
    var age = Math.max(0, (now - r.t0) / 1000), fade = Math.pow(1 - clamp(age / r.life, 0, 1), 1.2), d = Math.hypot(xw - r.x, y - r.y);
    var dp = (d - r.vP * age) / (13 * u), ds = (d - r.vS * age) / (26 * u);
    var v = (.45 * Math.exp(-dp * dp) + Math.exp(-ds * ds) * (.6 + .4 * Math.sin((d - r.vS * age) * .45 / u))) * fade;
    if (v > a) a = v;
  }
  return a;
};

Painting.prototype.drawFibre = function (ctx, sx, now) {
  var o = this.o, W = o.W, u = this.uf, x, c, y;
  var x0 = Math.max(0, sx - 30), x1 = Math.min(o.L, sx + W + 30);
  if (x1 <= x0) return;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(' + RED + ',.92)'; ctx.lineWidth = Math.max(1, 1.2 * u);
  ctx.beginPath();
  for (x = Math.floor(x0 / 6) * 6; x <= x1 + 6; x += 6) ctx.lineTo(x - sx, this.fy(x));
  ctx.stroke();
  /* one tick per channel */
  var cpp = this.cpp, stepC = cpp > .5 ? 2 : 1;
  var c0 = Math.ceil((this.ch0 + x0 * cpp) / stepC) * stepC, c1 = Math.floor(this.ch0 + x1 * cpp);
  this.listen(x0, x1, now);
  var rip = this.ripples.length > 0, mic = this.micro.length > 0, shaken = [], em = o.emph;
  ctx.strokeStyle = 'rgba(' + RED + ',.7)'; ctx.lineWidth = Math.max(.8, .9 * u);
  ctx.beginPath();
  for (c = c0; c <= c1; c += stepC) {
    x = this.xOfCh(c); y = this.fy(x);
    var h = (c % 100 === 0 ? 10 : c % 10 === 0 ? 6 : 3.2) * u;
    if (em) h *= 1 + .7 * sstep(em[0] - 200, em[0], x) * (1 - sstep(em[1], em[1] + 200, x));
    if (rip || mic) {
      var a = Math.max(rip ? this.shake(x, y, now) : 0, mic ? this.quiver(x, now) : 0);
      if (a > .03) { shaken.push([x, y, h, a]); continue; }
    }
    ctx.moveTo(x - sx, y - 1); ctx.lineTo(x - sx, y - 1 - h);
  }
  ctx.stroke();
  for (var i = 0; i < shaken.length; i++) {
    var s = shaken[i];
    ctx.strokeStyle = 'rgba(' + (200 + 40 * s[3] | 0) + ',' + (16 + 40 * s[3] | 0) + ',46,' + (.72 + .28 * s[3]) + ')';
    ctx.lineWidth = Math.max(.8, (.9 + 1.1 * s[3]) * u);
    ctx.beginPath(); ctx.moveTo(s[0] - sx, s[1] - 1); ctx.lineTo(s[0] - sx, s[1] - 1 - s[2] - 15 * u * s[3]); ctx.stroke();
  }
  /* spare fibre: the real coils, at their channels */
  ctx.strokeStyle = 'rgba(' + RED + ',.85)'; ctx.lineWidth = Math.max(.8, .9 * u);
  var fs = Math.max(12.5, 12.5 * u), lred = 'rgb(168,14,38)';                 /* the labels a shade darker than the line, to stay legible */
  ctx.font = 'italic ' + fs + 'px "EB Garamond", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (i = 0; i < this.coils.length; i++) {
    var k = this.coils[i]; x = this.xOfCh(k.c); if (x < x0 - 40 || x > x1 + 40) continue;
    y = this.fy(x); var r = clamp(2.4 + Math.sqrt(k.m) * .34, 3, 7.5) * u;
    ctx.beginPath(); ctx.arc(x - sx - r * .32, y + r + 1.5, r, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x - sx + r * .42, y + r + 2.2, r * .86, 0, TAU); ctx.stroke();
    if (o.labels !== false && x >= (o.coilLabelFrom || 0)) { ctx.fillStyle = lred; ctx.fillText(k.m + ' m coiled', x - sx, y + 2 * r + 5 + fs); }
  }
  /* channel numbers */
  if (o.labels !== false) {
    var every = o.labelEvery || 100;
    ctx.fillStyle = lred;
    for (c = Math.ceil((this.ch0 + x0 * cpp) / every) * every; c <= c1; c += every) {
      x = this.xOfCh(c); y = this.fy(x);
      var lab = 'ch ' + ('000' + c).slice(-4);
      if (c % 500 === 0) lab += '  ·  ' + (Math.round(c * 8.17 / 10) / 100).toFixed(2) + ' km';
      var tw = ctx.measureText(lab).width / 2 + 5;
      if (x - sx < -tw || x - sx > W + tw) continue;
      ctx.fillText(lab, o.parallax === false ? clamp(x - sx, tw, W - tw) : x - sx, y - 15 * u);
    }
  }
  /* light travelling in the glass */
  if (!o.still) {
    var sp = 2300 * u, v = 95 * u, t = (now - this.t00) / 1000;
    for (var q = Math.floor((x0 - v * t) / sp) - 1; ; q++) {
      var xp = q * sp + v * t; if (xp > x1 + 80) break; if (xp < x0 - 80) continue;
      var a0 = Math.max(0, xp - 78 * u);
      var gr = ctx.createLinearGradient(a0 - sx, 0, xp - sx, 0);
      gr.addColorStop(0, 'rgba(255,120,80,0)'); gr.addColorStop(.8, 'rgba(255,96,64,.85)'); gr.addColorStop(1, 'rgba(255,214,190,1)');
      ctx.save(); ctx.shadowColor = 'rgba(255,70,40,.75)'; ctx.shadowBlur = 9 * u;
      ctx.strokeStyle = gr; ctx.lineWidth = 2.3 * u; ctx.lineCap = 'round'; ctx.beginPath();
      for (x = a0; x <= xp; x += 5) ctx.lineTo(x - sx, this.fy(x));
      ctx.lineTo(xp - sx, this.fy(xp)); ctx.stroke(); ctx.restore();
    }
  }
};

Painting.prototype.clearAt = function (xw, r) {      /* 1 on open paper, 0 behind an inscription */
  var al = 1, rs = this.o.ranges || [];
  for (var i = 0; i < rs.length; i++) {
    if (rs[i][2] && !rs[i][4]) continue;                     /* low hills are no inscription, unless they give a clear zone (×r) */
    var d = xw < rs[i][0] ? rs[i][0] - xw : xw > rs[i][1] ? xw - rs[i][1] : 0, k = rs[i][4] || 1;
    al = Math.min(al, sstep(r * 1.2 * k, r * 4.5 * k, d));
  }
  return al;
};

/* the moon: o.moon = [x, y, radius]; the radius is .043 H unless the page asks for a smaller one */
Painting.prototype.moonR = function () { return this.o.moon[2] || .043 * this.o.H; };
Painting.prototype.drawMoon = function (ctx, sx) {
  var o = this.o; if (!o.moon) return;
  var x = o.moon[0] - sx * (o.parallax === false ? 1 : .06), y = o.moon[1], r = this.moonR();
  if (x < -r * 5 || x > o.W + r * 5) return;
  var al = this.clearAt(sx + x, r);
  if (al <= .01) return;
  ctx.save(); ctx.globalAlpha = al;
  var g = ctx.createRadialGradient(x, y, r * .9, x, y, r * 4.2);
  g.addColorStop(0, 'rgba(116,128,134,.26)'); g.addColorStop(.35, 'rgba(116,128,134,.11)'); g.addColorStop(1, 'rgba(116,128,134,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4.2, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(253,249,238,.97)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(90,100,106,.2)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
};

/* a few birds far off, crossing slowly; they fade out near an inscription and near a phase label */
Painting.prototype.drawFlock = function (ctx, sx, now) {
  var o = this.o; if (!o.flock) return;
  var u = this.u, t = o.still ? 0 : (now - this.t00) / 1000, W = o.W, lab = this.labels;
  var bx = o.flock[0] - sx * (o.parallax === false ? 1 : .3) - (t * 3.2 * u) % (W * 1.6), by = o.flock[1];
  if (bx < -W * .4) bx += W * 1.6;
  ctx.strokeStyle = rgba(INK, .62); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(.9, 1.15 * u);
  var pts = [[0, 0], [26, -9], [44, 7], [71, -3], [-24, 11]];
  for (var i = 0; i < pts.length; i++) {
    var x = bx + pts[i][0] * u, y = by + pts[i][1] * u + Math.sin(t * .6 + i * 1.7) * 2.2 * u, w = (5.2 - i * .35) * u, f = Math.sin(t * 3.1 + i * 2.1) * 1.7 * u;
    if (x < -20 || x > W + 20) continue;
    var al = this.clearAt(sx + x, 30 * u);
    for (var k = 0; k < lab.length; k++) {
      var b = lab[k], dx = Math.max(b[0] - sx - x, 0, sx + x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]);
      al = Math.min(al, sstep(8 * u, 26 * u, Math.hypot(dx, dy)));
    }
    if (al < .02) continue;
    ctx.globalAlpha = al;
    ctx.beginPath(); ctx.moveTo(x - w, y - f); ctx.quadraticCurveTo(x - w * .4, y - 2.4 * u - f * .4, x, y); ctx.quadraticCurveTo(x + w * .4, y - 2.4 * u - f * .4, x + w, y - f); ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

Painting.prototype.drawMist = function (ctx, sx, now, y, rate, drift, alpha) {
  var m = this.mist, W = this.o.W, t = this.o.still ? 0 : (now - this.t00) / 1000;
  var off = ((sx * rate + drift * t) % m.width + m.width) % m.width;
  ctx.globalAlpha = alpha;
  for (var x = -off; x < W; x += m.width) ctx.drawImage(m, x, y - m.height / 2);
  ctx.globalAlpha = 1;
};

Painting.prototype.drawBoat = function (ctx, sx, now) {
  var o = this.o; if (o.boat == null) return;
  var u = this.u, H = o.H, t = o.still ? 0 : (now - this.t00) / 1000;
  var x = o.boat + (o.still ? 0 : Math.sin(t * .05) * 60 * u) - sx, y = this.wl + .052 * H + (o.still ? 0 : Math.sin(t * .9) * 1.1 * u), s = 1.25 * u;
  if (x < -90 || x > o.W + 90) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = rgba(INK, .9); ctx.strokeStyle = rgba(INK, .9); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-27, -3); ctx.quadraticCurveTo(-8, 5.5, 14, 3.4); ctx.quadraticCurveTo(24, 1.5, 30, -5); ctx.quadraticCurveTo(12, .5, -27, -3); ctx.fill();   /* hull */
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-9, -1.5); ctx.quadraticCurveTo(-1, -12, 8, -1); ctx.stroke();                              /* awning */
  ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(17, -1); ctx.lineTo(17.5, -11); ctx.stroke();                                                /* a figure */
  ctx.beginPath(); ctx.moveTo(12.6, -12.4); ctx.lineTo(17.6, -16.8); ctx.lineTo(22.6, -12.4); ctx.closePath(); ctx.fill();                      /* straw hat */
  ctx.lineWidth = .9; ctx.beginPath(); ctx.moveTo(19, -9); ctx.lineTo(34, 9); ctx.stroke();                                                      /* pole */
  ctx.globalAlpha = .26; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-22, 8); ctx.lineTo(18, 8.5); ctx.moveTo(-12, 12); ctx.lineTo(9, 12.3); ctx.moveTo(-4, 15.5); ctx.lineTo(3, 15.6); ctx.stroke();
  ctx.restore();
};

/* wires between two poles, and birds that sometimes leave */
Painting.prototype.wireY = function (k, f) {
  var H = this.o.H, wr = this.o.wires, yc = this.layers.near.ridges[2].y;
  var g0 = yc[clamp(wr[0] | 0, 0, yc.length - 2)] + 2, g1 = yc[clamp(wr[1] | 0, 0, yc.length - 2)] + 2, hp = .215 * H;
  var y0 = g0 - hp + (5 + (k >> 1) * 15 + (k & 1) * 4) * this.u, y1 = g1 - hp + (4 + (k >> 1) * 15 + (k & 1) * 4) * this.u;
  return lerp(y0, y1, f) + (26 + 7 * k) * this.u * 4 * f * (1 - f);
};
Painting.prototype.drawBird = function (ctx, x, y, dir, s, flap) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s);
  ctx.fillStyle = rgba(INK, .95); ctx.strokeStyle = rgba(INK, .95);
  if (flap == null) {
    ctx.beginPath(); ctx.ellipse(0, -4.2, 5.2, 3.3, -.35, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(4.3, -7.6, 2.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -7.8); ctx.lineTo(8.6, -7.2); ctx.lineTo(6, -6.7); ctx.fill();
    ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-3.6, -2.6); ctx.lineTo(-9.6, 1.2); ctx.stroke();
  } else {
    var w = Math.sin(flap) * 5.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 1.9, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-.5, 0); ctx.quadraticCurveTo(-3, -w, -8.5, -w * 1.25 + 1); ctx.moveTo(.5, 0); ctx.quadraticCurveTo(3, -w * .9, 8.5, -w * 1.1 - 1); ctx.stroke();
  }
  ctx.restore();
};
Painting.prototype.drawWires = function (ctx, sx, now) {
  var wr = this.o.wires; if (!wr) return;
  var W = this.o.W, u = this.u, i, k;
  if (wr[1] - sx < -200 || wr[0] - sx > W + 200) return;
  ctx.strokeStyle = rgba(INK, .58); ctx.lineWidth = Math.max(.7, .8 * u);
  for (k = 0; k < 4; k++) {
    ctx.beginPath();
    for (i = 0; i <= 40; i++) { var f = i / 40; ctx.lineTo(lerp(wr[0], wr[1], f) - sx, this.wireY(k, f)); }
    ctx.stroke();
  }
  var still = this.o.still, birds = this.birds, self = this;
  if (!still && now > this.nextFlight) {
    var sit = birds.filter(function (b) { return b.st === 'sit'; }), gone = birds.filter(function (b) { return b.st === 'gone'; });
    if (gone.length && (sit.length < 4 || Math.random() < .5)) { var b1 = gone[Math.random() * gone.length | 0]; b1.st = 'arrive'; b1.t = now; }
    else if (sit.length > 2) { var b2 = sit[Math.random() * sit.length | 0]; b2.st = 'leave'; b2.t = now; b2.side = Math.random() < .5 ? -1 : 1; }
    this.nextFlight = now + 9000 + Math.random() * 9000;
  }
  birds.forEach(function (b) {
    var x = lerp(wr[0], wr[1], b.f) - sx, y = self.wireY(b.w, b.f) + .5, s = 1.05 * u;
    if (b.st === 'sit') { self.drawBird(ctx, x, y, b.dir, s, null); return; }
    if (b.st === 'gone') return;
    var p = clamp((now - b.t) / 5200, 0, 1), q = b.st === 'leave' ? p : 1 - p, e = q * q * (3 - 2 * q), sd = b.side || 1;
    if (p >= 1) { b.st = b.st === 'leave' ? 'gone' : 'sit'; return; }
    ctx.globalAlpha = 1 - sstep(.7, 1, q);
    self.drawBird(ctx, x + sd * (30 * e + 300 * e * e) * u, y - (18 * Math.sqrt(q) + 200 * e) * u, sd, s * (1 - .45 * q), q < .04 ? null : now * .018);
    ctx.globalAlpha = 1;
  });
};

/* the seismogram itself, written with a fine brush along the water's edge, the whole length of the scroll.
   It is painted into the near tiles, behind the hills (shores and islands hide it, the near mist veils it), as one
   ribbon. The hand lifts the brush every 150 to 290 px: each stroke enters with a small press, runs thinner and
   paler as the ink is used up, and breaks up dry at its end before the next one starts. Along the way the width
   follows the shaking (the brush presses where the record is strong) and a slow drift of the hand. Where the
   composed time axis squeezes the record, cycles closer than about 10 px are smoothed away (see smooth()), under an
   inscription closer than about 30 px, so the line never turns into a plotted squiggle. Nor into a plotted sine
   where the surface waves ring on: each stroke swings with its own strength, presses with its own weight, and the
   hand's rhythm wanders (the wavelength by about a fifth), except at the marks P, S and surface waves, which stay
   on their arrivals. It parts for reed clumps and the feet of the poles. */
Painting.prototype.traceY = function () { return this.wl - .003 * this.o.H; };
Painting.prototype.inkTrace = function (g, xa, xb) {
  var S = SEIS; if (!S.ok) return;
  var o = this.o, H = o.H, s = this.seed, T = this.T, y0 = this.traceY(), A0 = .027 * H, step = 1.25, i, k;
  var u = Math.max(this.u, .75);                                 /* the brush keeps its size in the small bands */
  var x0 = Math.max(0, Math.floor(xa / step) * step), x1 = Math.min(o.L, xb);
  var n = Math.floor((x1 - x0) / step) + 1;
  if (n < 4) return;
  var fa = 0, fb = 0;                                            /* before the first arrival the line rises out of the paper */
  if (o.phases && o.phases.length) { var px = o.phases[0].x; fa = Math.min(112, .2 * px); fb = px - Math.min(120, .3 * px); }
  var holes = [], ur = this.u;                                    /* reeds and poles are drawn to the painting's own scale */
  this.reeds.forEach(function (rd) { holes.push([rd.x, 21 * ur + 6, 10 * ur + 6]); });
  if (o.wires) { holes.push([o.wires[0], 9 * ur, 13 * ur]); holes.push([o.wires[1], 9 * ur, 13 * ur]); }
  var B = this._strokeAt;                                        /* where the brush is lifted: fixed along the world */
  if (!B) { B = this._strokeAt = [0]; for (k = 0; B[k] < o.L + 600; k++) B.push(B[k] + (150 + 140 * ih(k, 7, s + 505)) * u); }
  var sk = 0; while (sk < B.length - 2 && B[sk + 1] <= x0) sk++;
  var marks = (o.phases || []).map(function (p) { return p.x; });
  var X = new Float32Array(n), Y = new Float32Array(n), Wd = new Float32Array(n), Al = new Float32Array(n);
  function slope(xx) { return T(xx + 1) - T(xx); }
  for (i = 0; i < n; i++) {
    var x = x0 + i * step, dt = Math.max(.02, (T(x + 60) - T(x - 60)) / 120);
    var dtS = Math.max(dt, slope(x - 40), slope(x), slope(x + 40));   /* smoothing: the most squeezed time nearby */
    var ct = this.clearT[clamp(x | 0, 0, this.nearLen - 1)];
    var A = A0 * clamp(1.15 - .45 * dt, .62, 1) * (.55 + .45 * ct);     /* smaller swings where time is squeezed, and calmer under an inscription */
    var free = 1;
    for (k = 0; k < marks.length; k++) free = Math.min(free, sstep(40 * u, 130 * u, Math.abs(x - marks[k])));
    var t = T(x) + 12 * u * dtS * (n1(x * .0125 / u, s + 509) - .5) * free;   /* the hand's rhythm */
    while (sk < B.length - 2 && B[sk + 1] <= x) sk++;
    var len = B[sk + 1] - B[sk], gap = (2.5 + 3.5 * ih(sk, 8, s + 505)) * u, d = x - B[sk], q = d / (len - gap);
    var swing = lerp(.5 + .7 * ih(sk, 11, s + 507), .5 + .7 * ih(sk + 1, 11, s + 507), sstep(.7, 1, d / len))   /* each stroke its own strength, */
          * (.8 + .4 * n1(x * .03 / u, s + 511));                                                                       /* each crest a little its own */
    X[i] = x;
    Y[i] = y0 - A * swing * smooth(S.bbI, S.gb, t, lerp(30, 9.5, sstep(.25, .85, ct)) * u * dtS) + 1.6 * u * (n1(x * .0062 / u, s + 504) - .5);
    var press = clamp((.16 + .84 * sstep(.14, .85, samp(S.env, t)) + .5 * (n1(x * .013 / u, s + 501) - .5)) * (.78 + .44 * ih(sk, 12, s + 510)), 0, 1);
    var keep = 1;
    for (k = 0; k < holes.length; k++) keep = Math.min(keep, sstep(holes[k][1], holes[k][1] + holes[k][2], Math.abs(x - holes[k][0])));
    var stroke = q >= 1 ? 0 : (.35 + .65 * sstep(0, 6 * u, d) + .28 * (1 - sstep(6 * u, 22 * u, d)))      /* the press of the entry */
          * (1 - .66 * sstep(.6, 1, q))                                                                    /* thinner as it runs out */
          * (1 - sstep(.72, .97, q) * (1 - sstep(.2, .46, n1(x * .11 / u, s + 506 + sk))));               /* and dry at the end */
    Wd[i] = u * (.78 + 1.12 * press) * stroke * (.3 + .7 * keep);
    Al[i] = (.42 + .28 * n1(x * .0047 / u, s + 503)) * (1.12 - .36 * clamp(q, 0, 1)) * keep * (fb > fa ? .18 + .82 * sstep(fa, fb, x) : 1);
  }
  Y = box(box(Y, 3), 3);                                         /* round the corners where one sample spans many px */
  var span = Math.max(1, X[n - 1] - X[0]), gr = g.createLinearGradient(X[0], 0, X[n - 1], 0);
  for (i = 0; i < n; i += 6) gr.addColorStop((X[i] - X[0]) / span, rgba(INK, Al[i].toFixed(3)));
  gr.addColorStop(1, rgba(INK, Al[n - 1].toFixed(3)));
  var NX = new Float32Array(n), NY = new Float32Array(n);
  for (i = 0; i < n; i++) {
    var a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), tx = X[b] - X[a], ty = Y[b] - Y[a], l = Math.hypot(tx, ty) || 1;
    var wd = Wd[i] * (1 + .3 * clamp(ty / tx, -1, 1));            /* the brush presses on the way down and lifts on the way up */
    NX[i] = -ty / l * wd * .5; NY[i] = tx / l * wd * .5;
  }
  g.fillStyle = gr;
  g.beginPath();
  for (i = 0; i < n; i++) g.lineTo(X[i] + NX[i], Y[i] + NY[i]);
  for (i = n - 1; i >= 0; i--) g.lineTo(X[i] - NX[i], Y[i] - NY[i]);
  g.closePath(); g.fill();
};

Painting.prototype.drawPhases = function (ctx, sx) {
  var ph = this.o.phases; if (!ph) return;
  var u = this.u, W = this.o.W, y0 = this.traceY(), A = .027 * this.o.H;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.font = 'italic ' + Math.max(13, 16 * u) + 'px "EB Garamond", Georgia, serif';
  for (var i = 0; i < ph.length; i++) {
    var p = ph[i], x = p.x - sx; if (x < -80 || x > W + 80) continue;
    var ya = y0 - A * (p.amp || .4) - 4 * u, y1 = ya - (p.up || 26) * u;
    ctx.strokeStyle = rgba(INK, .55); ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(x, ya); ctx.lineTo(x, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(243,236,221,.9)'; ctx.lineWidth = 4;              /* a little paper around the letters */
    ctx.strokeText(p.label, x, y1 - 6 * u);
    ctx.fillStyle = rgba(INK, .88);
    ctx.fillText(p.label, x, y1 - 6 * u);
  }
};

Painting.prototype.render = function (now, sx, force) {
  var ctx = this.ctx, o = this.o, W = o.W, H = o.H, d = this.dpr, self = this;
  this.frameNo = (this.frameNo || 0) + 1;
  var budget = force ? 99 : 2;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, W, H);
  this.drawMoon(ctx, sx);
  function layer(name) {
    var lay = self.layers[name], off = sx * lay.rate, i0 = Math.max(0, Math.floor(off / TW)), i1 = Math.floor((off + W) / TW), S = self.S;
    for (var i = i0; i <= i1; i++) {
      if (i * TW >= lay.len) break;
      var key = name + ':' + i, have = self.tiles.has(key), t = self.tile(name, i, have || budget > 0);
      if (!have && t) { budget--; var qi = self.queue.indexOf(key); if (qi >= 0) self.queue.splice(qi, 1); }
      if (!t) continue;
      /* the inner part of the tile, its edges snapped to device pixels so that neighbours meet without a seam */
      var a = Math.round((i * TW - off) * d) / d, b = Math.round((i * TW + t._w - off) * d) / d;
      ctx.drawImage(t, BL * S, 0, t._w * S, t.height, a, lay.top, b - a, t.height / S);
    }
  }
  var wl = this.wl;
  layer('far');
  this.drawFlock(ctx, sx, now);
  this.drawMist(ctx, sx, now, wl - .17 * H, .5, 5, .9);
  layer('mid');
  this.drawMist(ctx, sx, now, wl - .1 * H, .82, -3.6, .85);
  layer('near');                                 /* carries the seismogram, painted under its hills (inkTrace) */
  this.drawMist(ctx, sx, now, wl - .03 * H, 1.04, 2.2, .42);
  layer('water');
  this.drawBoat(ctx, sx, now);
  this.drawWires(ctx, sx, now);
  this.drawPhases(ctx, sx);
  this.drawFibre(ctx, sx, now);
  this.drawRipples(ctx, sx, now);
  /* tiles asked for but not painted yet: one per frame */
  if (budget > 0 && this.queue.length) {
    var k = this.queue.shift(), parts = k.split(':');
    if (!this.tiles.has(k)) this.tile(parts[0], +parts[1], true);
  }
};

/* paint ahead while the reader is still */
Painting.prototype.ahead = function (sx, dir) {
  var names = ['near', 'water', 'mid', 'far'], W = this.o.W;
  for (var n = 0; n < names.length; n++) {
    var lay = this.layers[names[n]], off = sx * lay.rate, i = dir >= 0 ? Math.floor((off + W) / TW) + 1 : Math.floor(off / TW) - 1;
    if (i < 0 || i * TW >= lay.len) continue;
    if (!this.tiles.has(names[n] + ':' + i)) { this.tile(names[n], i, true); return true; }
  }
  return false;
};

Painting.prototype.destroy = function () { this.tiles.clear(); this.ripples = []; this.micro = []; };

window.YWInk = { Painting: Painting, sstep: sstep, clamp: clamp };
})();
