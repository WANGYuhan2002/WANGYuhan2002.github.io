/* r2-mock.js — drawing helpers for the round-2 static mocks (design/v2a-design-spec-r2.md).
   Copies of the real helpers in drafts/v2a/js/lab.js, changed only where the spec says so.
   No solver: every trace and image is synthetic. */
(function () {
  'use strict';
  var root = document.documentElement, C = 0.5;
  /* E · PAL, with the two fields of spec 3.2 */
  var PAL = {
    dark: { bg: [8, 11, 19], pos: [86, 225, 240], neg: [255, 128, 88], slow: [217, 86, 155], fast: [77, 134, 255],
      vs: [124, 50, 108], vf: [38, 86, 196], edge: [170, 190, 230], edgeA: 0.32, ink: [238, 242, 248],
      sw: [255, 190, 84], hot: [255, 226, 150], halo: 'rgba(4,6,12,.9)', mix: 0.92, core: 0.30, tint: 0.50, faint: 0.07,
      trace: 'rgba(238,242,248,.86)', fill: 'rgba(86,225,240,.38)', tick: 'rgba(148,170,214,.18)', grid: 'rgba(148,170,214,.08)',
      label: '#8b97ab', origin: '255,128,88', panel: '#0b1019', pn: [11, 16, 25],
      sub: '#b3bfd0', axis: 'rgba(148,170,214,.34)' },
    light: { bg: [246, 245, 240], pos: [0, 124, 143], neg: [212, 71, 43], slow: [181, 60, 125], fast: [43, 97, 212],
      vs: [132, 84, 112], vf: [62, 96, 168], edge: [40, 52, 80], edgeA: 0.18, ink: [19, 26, 38],
      sw: [165, 104, 0], hot: [196, 84, 20], halo: 'rgba(255,255,255,.95)', mix: 0.94, core: 0, tint: 0.32, faint: 0.06,
      trace: 'rgba(19,26,38,.84)', fill: 'rgba(0,124,143,.26)', tick: 'rgba(28,36,52,.18)', grid: 'rgba(28,36,52,.07)',
      label: '#667185', origin: '212,71,43', panel: '#fbfaf7', pn: [251, 250, 247],
      sub: '#3a4658', axis: 'rgba(28,36,52,.34)' }
  };
  var L = window.L = { PAL: PAL, C: C, KM: 10, nx: 400, ny: 220, rate: 200, ppw: 13.2, B: 36, marks: [], hi: -1 };
  L.TR = Math.round(L.rate * 6); L.f0 = C / L.ppw; L.fHz = L.f0 * L.rate; L.n0 = Math.round(1.2 / L.f0); L.NOW = 100000;
  L.theme = function () { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; };
  L.setPal = function () { var b = PAL[L.theme()], o = {}; for (var k in b) o[k] = b[k]; L.pal = o; };
  L.setPal();
  L.rgba = function (c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  L.km = function (cells) { return cells / L.nx * L.KM; };
  L.fmt = function (v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); };
  L.view = function (W, H, nx) { L.W = W; L.H = H; L.nx = nx || 400; L.ny = Math.round(L.nx * H / W); };
  L.sx = function (x) { return (x + 0.5) / L.nx * L.W; };
  L.sy = function (y) { return (y + 0.5) / L.ny * L.H; };
  L.BC = { absorb: { top: true, bottom: true, left: true, right: true }, free: { top: false, bottom: true, left: true, right: true }, box: { top: false, bottom: false, left: false, right: false } };

  /* deterministic random numbers */
  L.rng = function (seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  L.gauss = function (r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
  L.ricker = function (t, f) { var a = Math.PI * f * t; a *= a; return (1 - 2 * a) * Math.exp(-a); };

  /* ---------- canvas text roles (spec 3.3) ---------- */
  L.font = function (ctx, px, w) { ctx.font = (w || 500) + ' ' + px + 'px "JetBrains Mono", monospace'; };
  L.fontS = function (ctx, px, w) { ctx.font = (w || 400) + ' ' + px + 'px "Inter", system-ui, sans-serif'; };
  /* 3.3: maxW — drop trailing ' · …' segments until the title fits its plot */
  L.shortened = [];
  L.panelLabel = function (ctx, s, x, y, col, maxW) {
    L.fontS(ctx, 11, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = col || L.pal.sub;
    var s0 = s; while (maxW != null && ctx.measureText(s).width > maxW && s.lastIndexOf(' · ') > 0) s = s.slice(0, s.lastIndexOf(' · '));
    if (s !== s0 && L.shortened.indexOf(s0 + ' → ' + s) < 0) L.shortened.push(s0 + ' → ' + s);
    ctx.fillText(s, x, y); return ctx.measureText(s).width;
  };
  L.axisTitle = function (ctx) { L.fontS(ctx, 10.5, 400); ctx.fillStyle = L.pal.label; };
  L.annot = function (ctx, col) { L.fontS(ctx, 10.5, 500); ctx.fillStyle = col; };
  L.num = function (ctx) { L.font(ctx, 10); ctx.fillStyle = L.pal.label; };
  /* text with a subscript: parts = [[text, sub?], …] */
  L.subText = function (ctx, parts, x, y, align, setFont) {
    var w = 0, k, ws = [];
    for (k = 0; k < parts.length; k++) { setFont(parts[k][1]); ws.push(ctx.measureText(parts[k][0]).width); w += ws[k]; }
    var x0 = align === 'right' ? x - w : (align === 'center' ? x - w / 2 : x), sa = ctx.textAlign;
    ctx.textAlign = 'left';
    for (k = 0; k < parts.length; k++) { setFont(parts[k][1]); ctx.fillText(parts[k][0], x0, y + (parts[k][1] ? 3 : 0)); x0 += ws[k]; }
    ctx.textAlign = sa; return w;
  };

  /* ---------- marks on the field (LJ) ---------- */
  function halo(ctx, alpha, lw) { ctx.lineJoin = 'round'; ctx.lineWidth = lw || 1.5; ctx.strokeStyle = L.pal.halo; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.stroke(); ctx.globalAlpha = 1; }
  L.tri = function (ctx, x, y, s, alpha, col) {
    ctx.beginPath(); ctx.moveTo(x - s, y - s * 1.7); ctx.lineTo(x + s, y - s * 1.7); ctx.lineTo(x, y); ctx.closePath();
    halo(ctx, alpha); ctx.fillStyle = L.rgba(col || L.pal.ink, alpha); ctx.fill();
  };
  /* 5.1: 7th argument mono → "station code" role, otherwise the "text label" role */
  L.label = function (ctx, s, x, y, align, col, mono) {
    ctx.font = mono ? '500 10.5px "JetBrains Mono", monospace' : '600 11px "Inter", system-ui, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = 3; ctx.strokeStyle = L.pal.halo; ctx.strokeText(s, x, y);
    ctx.fillStyle = col || L.rgba(L.pal.ink, 0.96); ctx.fillText(s, x, y);
  };
  /* 5.1: hollow star (persistent source marker) */
  L.star = function (ctx, x, y, r, col, alpha, hollow) {
    ctx.beginPath();
    for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
    ctx.closePath();
    if (hollow) { ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = L.pal.halo; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = L.rgba(col, alpha); ctx.stroke(); return; }
    halo(ctx, alpha); ctx.fillStyle = L.rgba(col, alpha); ctx.fill();
  };
  /* LC stations(): 5.1 labels:'all', 5.9 highlight */
  L.stations = function (ctx, pts, o) {
    o = o || {}; var many = pts.length > 1, s0 = many ? 5 : 6.5;
    for (var k = 0; k < pts.length; k++) {
      var on = k === L.hi, s = on ? s0 * 1.3 : s0, p = pts[k], X = L.sx(p.x), Y = Math.max(s * 1.7 + 2, L.sy(p.y));
      L.tri(ctx, X, Y, s, on ? 1 : (o.alpha || 0.96), on ? L.pal.pos : o.col);
      if (on || (o.labels !== false && (o.labels === 'all' || pts.length <= 4 || k === 0 || k === pts.length - 1))) {
        var ly = Y - s * 1.7 - 5; if (ly < 12) ly = Y + 13;
        L.label(ctx, p.code, X, ly, null, null, true);
      }
    }
  };
  /* 5.1 scale bar */
  L.scaleBar = function (ctx) {
    var pxkm = L.W / L.KM, km = pxkm >= 70 ? 1 : 2, x = 14, y = L.H - 14, x2 = x + km * pxkm;
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x2, y); ctx.lineTo(x2, y - 5);
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; ctx.lineWidth = 3.5; ctx.strokeStyle = L.pal.halo; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = L.rgba(L.pal.ink, 0.9); ctx.stroke();
    ctx.font = '500 10.5px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';   /* 5.1: (x + km·pxkm + 6, y − 2), baseline middle */
    ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = 3; ctx.strokeStyle = L.pal.halo; ctx.strokeText(km + ' km', x2 + 6, y - 2);
    ctx.fillStyle = L.rgba(L.pal.ink, 0.96); ctx.fillText(km + ' km', x2 + 6, y - 2);
  };
  /* 5.1 reflecting edges */
  L.edges = function (ctx, bc) {
    var B = L.BC[bc] || bc; ctx.lineWidth = 2; ctx.strokeStyle = L.rgba(L.pal.ink, 0.5); ctx.beginPath();
    if (B.top === false) { ctx.moveTo(0, 2); ctx.lineTo(L.W, 2); }
    if (B.bottom === false) { ctx.moveTo(0, L.H - 2); ctx.lineTo(L.W, L.H - 2); }
    if (B.left === false) { ctx.moveTo(2, 0); ctx.lineTo(2, L.H); }
    if (B.right === false) { ctx.moveTo(L.W - 2, 0); ctx.lineTo(L.W - 2, L.H); }
    ctx.stroke();
  };
  /* E cpuBackground: velocity tint + interface lines → an nx × ny bitmap, drawn scaled like the solver's canvas */
  L.wash = function (model) {
    var nx = model.nx, ny = model.ny, pal = L.pal, a = pal.tint, bg = pal.bg, v = model.v, vs = pal.vs, vf = pal.vf, ed = pal.edge, eA = pal.edgeA;
    var cv = document.createElement('canvas'); cv.width = nx; cv.height = ny;
    var c2 = cv.getContext('2d'), img = c2.createImageData(nx, ny), d = img.data, W0 = new Float32Array(nx * ny), x, y, i;
    for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) {
      i = y * nx + x; var vi = v[i], dd = 0;
      if (x < nx - 1) dd = Math.abs(v[i + 1] - vi); if (y < ny - 1) dd = Math.max(dd, Math.abs(v[i + nx] - vi));
      var s = (dd - 0.02) / 0.08; s = s <= 0 ? 0 : (s >= 1 ? 1 : s); W0[i] = s * s * (3 - 2 * s);
    }
    for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) {
      i = y * nx + x; var dv = v[i] - 1, t = Math.min(1, Math.abs(dv) / 0.4) * a, col = dv < 0 ? vs : vf;
      var r = bg[0] + (col[0] - bg[0]) * t, g = bg[1] + (col[1] - bg[1]) * t, b = bg[2] + (col[2] - bg[2]) * t, acc = 0;
      for (var dy = -1; dy <= 1; dy++) { var yy = Math.max(0, Math.min(ny - 1, y + dy)), ky = dy ? 1 : 2; for (var dx = -1; dx <= 1; dx++) { var xx = Math.max(0, Math.min(nx - 1, x + dx)); acc += (dx ? ky : 2 * ky) * W0[yy * nx + xx]; } }
      var w = acc / 16 * eA; if (w > 0.001) { r += (ed[0] - r) * w; g += (ed[1] - g) * w; b += (ed[2] - b) * w; }
      d[4 * i] = r; d[4 * i + 1] = g; d[4 * i + 2] = b; d[4 * i + 3] = 255;
    }
    c2.putImageData(img, 0, 0); return cv;
  };
  L.drawWash = function (ctx, model) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(L.wash(model), 0, 0, L.W, L.H); };

  /* ---------- data panel helpers ---------- */
  /* 5.2: ticks 4 px (callers pass h = 4); a "now" line at the right edge when gridTop is given */
  L.timeAxis = function (ctx, X, Y, w, h, len, nowStep, gridTop) {
    var pal = L.pal, sec = Math.round(L.rate), st, xt;
    ctx.lineWidth = 1;
    if (gridTop != null) {
      ctx.strokeStyle = pal.grid; ctx.beginPath();
      for (st = nowStep - (nowStep % sec); st > nowStep - len; st -= sec) { xt = X + w - (nowStep - st) / len * w; ctx.moveTo(xt + 0.5, gridTop); ctx.lineTo(xt + 0.5, Y); }
      ctx.stroke();
      ctx.strokeStyle = L.rgba(pal.pos, 0.45); ctx.beginPath(); ctx.moveTo(X + w - 0.5, gridTop); ctx.lineTo(X + w - 0.5, Y); ctx.stroke();
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
  /* lane text with a rgba(pn,.85) backing (5.2); flips to the left of its line when flip() says so */
  L.laneText = function (ctx, s, xm, y, right, col, off, flipAt) {
    L.annot(ctx, col); ctx.textBaseline = 'top'; off = off == null ? 9 : off;
    var w = ctx.measureText(s).width, flip = flipAt != null ? xm + flipAt > right : xm + off + w > right, x0 = flip ? xm - off - w : xm + off;
    ctx.fillStyle = L.rgba(L.pal.pn, 0.85); ctx.fillRect(x0 - 2, y - 1, w + 4, 14);
    L.annot(ctx, col); ctx.textAlign = 'left'; ctx.fillText(s, x0, y);
    return { x: x0, w: w };
  };
  /* 5.2 record section */
  L.drawSection = function (ctx, X, Y, w, h, rec, o) {
    o = o || {};
    var pal = L.pal, n = rec.n, len = rec.len, comp = o.comp || 0, many = n > 1, m = 0, k, s, v;
    var idx = o.order || null, nn = idx ? idx.length : n;
    var lane = o.lane != null ? o.lane : (o.marks || o.pred ? 14 : 0), YT = Y + lane, hT = h - lane;
    for (s = 0; s < nn; s++) { var a = (comp ? rec.x : rec.z)[idx ? idx[s] : s]; for (k = 0; k < len; k++) { v = a[k] < 0 ? -a[k] : a[k]; if (v > m) m = v; } }
    rec.peak = Math.max(o.floor || 0.02, m);
    var left = o.left != null ? o.left : (many ? 42 : 0), right = o.right || 0, ww = w - left - right, sp = hT / nn;
    var amp = (many ? 0.95 * sp : hT / 2 - 3) / rec.peak * (o.gain || 1), clip = many ? 1.4 * sp : hT / 2 - 1;
    var stride = Math.max(1, Math.floor(len / Math.max(1, ww * 1.5)));
    var xOf = function (age) { return X + left + ww - age / len * ww; }, q, xm;
    ctx.lineWidth = 1; ctx.strokeStyle = pal.axis; ctx.beginPath(); ctx.moveTo(X + left, Y + h - 0.5); ctx.lineTo(X + left + ww, Y + h - 0.5); ctx.stroke();
    var mk = [];
    if (o.marks) for (q = 0; q < o.marks.length; q++) {
      var age = o.now - o.marks[q].n; if (age < 0 || age > len) continue;
      xm = Math.round(xOf(age)) + 0.5; mk.push([xm, q === o.marks.length - 1]);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(' + pal.origin + ',.5)'; ctx.beginPath(); ctx.moveTo(xm, YT - 2); ctx.lineTo(xm, Y + h); ctx.stroke();
    }
    var base = [];
    for (s = 0; s < nn; s++) {
      var tr = idx ? idx[s] : s, y0 = many ? YT + sp * (s + 0.5) : YT + hT / 2, x2, y2, hiT = tr === o.hi; base.push([tr, y0]);
      if (many && o.codes !== false && (sp >= 11 || s % 2 === 0)) { L.font(ctx, 10); ctx.fillStyle = hiT ? pal.sub : pal.label; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(rec.pts[tr].code || '', X, y0); }
      if (many && o.rowText && (sp >= 11 || s % 2 === 0)) { L.font(ctx, 10); ctx.fillStyle = pal.label; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(o.rowText(tr), X + w, y0); }
      if (!many) { ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X + left, Math.round(y0) + 0.5); ctx.lineTo(X + left + ww, Math.round(y0) + 0.5); ctx.stroke(); }
      if (o.fill !== false) {
        ctx.beginPath(); ctx.moveTo(X + left, y0);
        for (k = 0; k < len; k += stride) { v = rec.get(tr, k, comp) * amp; ctx.lineTo(X + left + k / (len - 1) * ww, y0 - Math.max(0, Math.min(clip, v))); }
        ctx.lineTo(X + left + ww, y0); ctx.closePath(); ctx.fillStyle = o.fillStyle || pal.fill;
        if (!many) ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = hiT ? L.rgba(pal.pos, 1) : (o.stroke || pal.trace); ctx.lineWidth = hiT ? (many ? 1.4 : 1.6) : (many ? 1 : 1.6); ctx.lineJoin = 'round'; ctx.beginPath();
      for (k = 0; k < len; k += stride) { v = rec.get(tr, k, comp) * amp; x2 = X + left + k / (len - 1) * ww; y2 = y0 - Math.max(-clip, Math.min(clip, v)); if (k) ctx.lineTo(x2, y2); else ctx.moveTo(x2, y2); }
      ctx.stroke();
      if (!many && o.pen) { var vl = rec.get(tr, len - 1, comp) * amp; ctx.beginPath(); ctx.arc(X + left + ww, y0 - Math.max(-clip, Math.min(clip, vl)), 3, 0, 6.2832); ctx.fillStyle = L.rgba(pal.pos, 1); ctx.fill(); }
    }
    /* predictions, after the traces */
    var predPts = [];
    if (o.pred) {
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.strokeStyle = L.rgba(pal.pos, 0.9);
      if (many) {
        ctx.beginPath(); var pen = false;
        base.forEach(function (b) { var pn = o.pred(b[0]); if (pn == null || o.now - pn < 0 || o.now - pn > len) { pen = false; return; } var xp = xOf(o.now - pn); predPts.push([xp, b[1]]); if (pen) ctx.lineTo(xp, b[1]); else ctx.moveTo(xp, b[1]); pen = true; });
        ctx.stroke(); ctx.setLineDash([]);
      } else {
        var pn1 = o.pred(base[0][0]);
        if (pn1 != null && o.now - pn1 >= 0 && o.now - pn1 <= len) {
          var xp1 = Math.round(xOf(o.now - pn1)) + 0.5; predPts.push([xp1, base[0][1]]);
          ctx.beginPath(); ctx.moveTo(xp1, YT - 2); ctx.lineTo(xp1, Y + h); ctx.stroke(); ctx.setLineDash([]);
          L.laneText(ctx, 'predicted arrival', xp1, Y + 2, X + left + ww, L.rgba(pal.pos, 0.95), 4);
        }
        ctx.setLineDash([]);
      }
    }
    /* lane: stars and the origin label, last */
    var lab = null;
    mk.forEach(function (q2) { L.star(ctx, q2[0], Y + 7, 4.5, pal.neg, q2[1] ? 0.95 : 0.5); if (q2[1]) lab = L.laneText(ctx, 'origin time', q2[0], Y + 2, X + left + ww, 'rgba(' + pal.origin + ',.95)', 9, 80); });
    var g = { x: X + left, w: ww, y: YT, h: hT, sp: sp, marks: mk, pred: predPts, originLabel: lab };
    if (o.link) L.sec = { y: YT, sp: sp, nn: nn, idx: idx };
    return g;
  };
  L.div = function (v) {
    var pal = L.pal, b = pal.pn || pal.bg, c = v >= 0 ? pal.pos : pal.neg, a = Math.min(1, Math.abs(v)); a = Math.pow(a, 0.7);
    return [b[0] + (c[0] - b[0]) * a, b[1] + (c[1] - b[1]) * a, b[2] + (c[2] - b[2]) * a];
  };
  L.velCol = function (dv, span) {
    var pal = L.pal, b = pal.pn || pal.bg, c = dv < 0 ? pal.slow : pal.fast, a = Math.min(1, Math.abs(dv) / (span || 0.25)); a = Math.pow(a, 0.85) * 0.92;
    return [b[0] + (c[0] - b[0]) * a, b[1] + (c[1] - b[1]) * a, b[2] + (c[2] - b[2]) * a];
  };
  /* colour bar: end numbers in the number role, the centre title in the axis-title role */
  L.colorbar = function (ctx, x, y, w, h, fn, lo, hi, title, words) {
    for (var i = 0; i < w; i++) { var c = fn(-1 + 2 * i / (w - 1)); ctx.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; ctx.fillRect(x + i, y, 1.5, h); }
    ctx.lineWidth = 1; ctx.strokeStyle = L.pal.tick; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (words) L.axisTitle(ctx); else L.num(ctx);
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText(lo, x, y + h + 3); ctx.textAlign = 'right'; ctx.fillText(hi, x + w, y + h + 3);
    if (title) { L.axisTitle(ctx); ctx.textAlign = 'center'; ctx.fillText(title, x + w / 2, y + h + 3); }
  };
  /* 5.4 (revised) apparent-velocity protractor: same horizontal run Hx, drops v·Hx/pxPerSec·pxPerKm; maxW = 0.3 · g.w; bottom = the axis line it must not cover */
  L.slopeFan = function (ctx, x, y, pxPerSec, pxPerKm, maxW, bottom) {
    var D = 44, Hx = D * pxPerSec / (3.5 * pxPerKm);
    if (Hx > maxW) { D = 30; Hx = D * pxPerSec / (3.5 * pxPerKm); }
    if (Hx < 24) return null;
    var pal = L.pal, V = [1.5, 2.5, 3.5], labs = ['1.5', '2.5', '3.5 km/s'], k, drop = function (v) { return v * Hx / pxPerSec * pxPerKm; };
    L.num(ctx); var lw = labs.map(function (s) { return ctx.measureText(s).width; });
    L.axisTitle(ctx); var tw = ctx.measureText('apparent velocity').width;
    var bx0 = x, bx1 = Math.max(x + tw, x + Hx + 4 + Math.max.apply(null, lw)), by0 = y - 6 - 11, by1 = y + drop(3.5) + 6;
    var r0 = { x0: bx0 - 6, y0: by0 - 6, x1: bx1 + 6, y1: by1 + 6, Hx: Hx, D: D, coversAxis: bottom != null && by1 + 6 > bottom - 0.5 };
    ctx.fillStyle = L.rgba(pal.pn, 0.92); ctx.beginPath(); ctx.roundRect(r0.x0 + 0.5, r0.y0 + 0.5, r0.x1 - r0.x0, Math.min(r0.y1, bottom != null ? bottom - 1 : 1e9) - r0.y0, 6); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = pal.tick; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = pal.label; ctx.beginPath();
    for (k = 0; k < 3; k++) { ctx.moveTo(x, y); ctx.lineTo(x + Hx, y + drop(V[k])); }
    ctx.stroke();
    L.num(ctx); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (k = 0; k < 3; k++) ctx.fillText(labs[k], x + Hx + 4, y + drop(V[k]));
    L.axisTitle(ctx); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('apparent velocity', x, y - 6);
    return r0;
  };
  L.placeholder = function (ctx, x, y, s) { L.axisTitle(ctx); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); };

  /* synthetic receiver records: fn(trace, timeBeforeNow_s, comp) → value; i = 0 is the oldest sample */
  L.Rec = function (pts, len, fn) {
    this.pts = pts; this.n = pts.length; this.len = len; this.z = []; this.x = []; this.peak = 0;
    for (var k = 0; k < this.n; k++) {
      var z = new Float32Array(len), x = new Float32Array(len);
      for (var i = 0; i < len; i++) { var t = (len - 1 - i) / L.rate; z[i] = fn(k, t, 0); x[i] = fn(k, t, 1); }
      this.z.push(z); this.x.push(x);
    }
  };
  L.Rec.prototype.get = function (k, i, comp) { return (comp ? this.x : this.z)[k][i]; };

  /* ---------- legend (6.5) and figure-key facts (4.1) ---------- */
  function starPath(cx, cy, r) { var p = ''; for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; p += (k ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2); } return p + 'Z'; }
  L.glyph = function (name) {
    var G = { star: '<path d="M6 .8l1.5 3.3 3.6.4-2.7 2.4.8 3.5L6 8.6 2.8 10.4l.8-3.5L.9 4.5l3.6-.4z" fill="var(--coral)"/>',
      tri: '<path d="M1.5 2.5h9L6 10z" fill="currentColor"/>', sensor: '<path d="M1.5 2.5h9L6 10z" fill="var(--cyan)"/>',
      ray: '<path d="M1 9.5 11 2.5" stroke="currentColor" stroke-width="1" opacity=".6"/>',
      ring: '<circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.6"/>',
      cross: '<path d="M2.5 2.5l7 7M9.5 2.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
      noise: '<circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" stroke-width="1" opacity=".6"/>',
      fibre: '<path d="M1 6h10" stroke="var(--cyan)" stroke-width="2"/><circle cx="6" cy="6" r="1.6" fill="currentColor"/>' };
    return '<svg viewBox="0 0 12 12" aria-hidden="true">' + (G[name] || '') + '</svg>';
  };
  L.legendVel = function (name) {
    return '<span class="lg vkey" title="Velocity model under the waves. The colour saturates 40 % below and above the background velocity of 2.5 km/s."><em>' + (name || 'velocity') + '</em><b>1.5</b><i></i><b>3.5 km/s</b></span>';
  };
  L.legendAcoustic = function () {
    return '<span class="lg"><em>pressure</em><i class="sw" style="background:var(--coral)"></i>−<i class="sw" style="background:var(--cyan)"></i>+</span>' + L.legendVel();
  };
  L.facts = function (bc, elastic) {
    var f = L.fHz, B = { free: 'free surface on top', box: 'reflecting box' }[bc];
    return '<span title="Size of the model">' + L.KM + ' × ' + L.fmt(L.km(L.ny), 1) + ' km</span>' + (B ? '<span title="Boundary condition">' + B + '</span>' : '') +
      '<span title="Background velocity (v = 1)">' + (elastic ? 'V<sub>P</sub> 2.5 · V<sub>S</sub> 1.44 km/s' : 'v₀ 2.5 km/s') + '</span>' +
      '<span title="Peak frequency of the source wavelet and its wavelength at the background velocity">f₀ ' + L.fmt(f, 1) + ' Hz · λ ' + L.fmt(2.5 / f, 2) + ' km</span>';
  };
  /* LJ fitLegend(), revised 4.1: both blocks are flex:none; hide whole trailing items while legend + facts + 16 > fkey */
  L.fitKey = function (fkey) {
    var lg = fkey.querySelector('.legend'), fa = fkey.querySelector('.facts'), k, hid = [];
    [].slice.call(lg.children).concat([].slice.call(fa.children)).forEach(function (e) { e.style.display = ''; });
    var over = function () { return lg.offsetWidth + fa.offsetWidth + 16 > fkey.clientWidth; };
    for (k = fa.children.length - 1; k >= 0 && over(); k--) { fa.children[k].style.display = 'none'; hid.push(fa.children[k].textContent); }
    for (k = lg.children.length - 1; k > 0 && over(); k--) { lg.children[k].style.display = 'none'; hid.push(lg.children[k].textContent); }
    return { hidden: hid, spare: fkey.clientWidth - lg.offsetWidth - fa.offsetWidth - 16 };
  };

  /* ---------- inspector (LJ L.refresh, spec 4.3) ---------- */
  var ROLE = { setup: 'Set up', observe: 'Observe', process: 'Process', interpret: 'Interpret', explore: 'Explore' };
  L.steps = function (st) {
    var now = -1, k, h = '<ol class="steps">';
    for (k = 0; k < st.length; k++) if (!st[k].done) { now = k; break; }
    st.forEach(function (s, k) {
      h += '<li class="st' + (s.done ? ' done' : '') + (k === now ? ' now' : '') + '"><span class="st-n" aria-hidden="true">' + (s.done ? '✓' : (k + 1)) + '</span><div>' + (s.k ? '<i class="st-k">' + ROLE[s.k] + '</i>' : '') + '<p class="st-t">' + s.t + '</p>' +
        (s.d ? '<p class="st-d">' + s.d + '</p>' : '') + (s.eq ? '<div class="eq">' + s.eq + '</div>' : '') + (s.c ? '<div class="st-c">' + s.c + '</div>' : '') + '</div></li>';
    });
    return h + '</ol>';
  };
  L.opt = function (act, val, label, on) { return '<button class="opt" type="button" aria-pressed="' + !!on + '">' + label + '</button>'; };
  L.seg = function (act, items, cur, cls) { return '<div class="seg' + (cls ? ' ' + cls : '') + '" role="group">' + items.map(function (it) { return '<button type="button" aria-pressed="' + (String(cur) === String(it[0])) + '">' + it[1] + '</button>'; }).join('') + '</div>'; };
  L.btn = function (act, label, cls, dis) { return '<button class="pbtn' + (cls ? ' ' + cls : '') + '" type="button"' + (dis ? ' disabled' : '') + '>' + label + '</button>'; };
  L.range = function (id, label, min, max, step, val, out) { return '<div class="rng"><div class="row"><label for="' + id + '">' + label + '</label><output>' + out + '</output></div><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>'; };

  /* ---------- canvas sizing and theme ---------- */
  L.fit = function (cv) {
    var w = cv.clientWidth, h = cv.clientHeight, d = 2;
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
    var ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h); return { ctx: ctx, w: w, h: h };
  };
  L.initTheme = function (btn, redraw) {
    if (/light/.test(location.hash)) root.setAttribute('data-theme', 'light'); else root.setAttribute('data-theme', 'dark');
    L.setPal();
    btn.addEventListener('click', function () { root.setAttribute('data-theme', L.theme() === 'light' ? 'dark' : 'light'); L.setPal(); redraw(); });
    window.addEventListener('hashchange', function () { root.setAttribute('data-theme', /light/.test(location.hash) ? 'light' : 'dark'); L.setPal(); redraw(); });
  };
  /* Bessel J0 (for the synthetic focal spot) */
  L.J0 = function (x) { var s = 0, n = 48; for (var k = 0; k < n; k++) s += Math.cos(x * Math.sin((k + 0.5) / n * Math.PI)); return s / n; };
})();
