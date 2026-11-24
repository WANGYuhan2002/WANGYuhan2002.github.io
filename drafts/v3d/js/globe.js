/* v3d · LIVE EARTH — the globe.
   Real earthquakes (USGS M 4.5+ feed of the past seven days; a dated snapshot when the feed cannot be reached),
   drawn on an orthographic dot globe on a 2-D canvas. Selecting one shows its surface-wave path and its first
   P ray through the Earth to Zürich, with iasp91 arrival times for the event's depth (js/tt.js, ObsPy TauP).
   Hypocentres sit at their true depth inside the globe. Waves of earthquakes younger than about 90 minutes are
   drawn where they are now, as dashed rings, and a selected one ticks its arrivals at Zürich in real time. */
(function () {
  'use strict';
  var G = window.YW_GEO, TT = window.YW_TT;
  var cv = document.getElementById('globe'), slot = document.getElementById('globeSlot'), hero = document.getElementById('top');
  if (!cv || !slot || !hero || !G || !TT || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var RAD = Math.PI / 180, DEG = 180 / Math.PI, TAU = Math.PI * 2, KM = 111.195, WEEK = 7 * 864e5, RE = 6371;
  var FLIGHT = 180 * KM / TT.rayleigh_kms;          /* seconds until the surface wave reaches the antipode */
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduce = mq.matches;
  var NBSP = ' ';

  /* ------------------------------ vectors ------------------------------ */
  function vec(lat, lon) { var c = Math.cos(lat * RAD); return [c * Math.cos(lon * RAD), c * Math.sin(lon * RAD), Math.sin(lat * RAD)]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function angle(a, b) { return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))); }
  function slerp(a, b, f, om, so) {
    if (so < 1e-5) return a;
    var s1 = Math.sin((1 - f) * om) / so, s2 = Math.sin(f * om) / so;
    return [a[0] * s1 + b[0] * s2, a[1] * s1 + b[1] * s2, a[2] * s1 + b[2] * s2];
  }
  var ZV = vec(G.zurich.lat, G.zurich.lon);

  /* ------------------------------ land dots ------------------------------ */
  var DX, DY, DZ, DL, ND = 0;
  (function () {
    var m = G.mask, bin = atob(m.b64), bytes = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    function land(lat, lon) {
      var row = Math.min(m.h - 1, Math.max(0, Math.floor((90 - lat) / m.res)));
      var col = ((Math.floor((lon + 180) / m.res) % m.w) + m.w) % m.w, k = row * m.w + col;
      return (bytes[k >> 3] >> (7 - (k & 7))) & 1;
    }
    var s = 1.25, xs = [], ys = [], zs = [], r = 0;
    for (var lat = -90 + s / 2; lat < 90; lat += s, r++) {
      var n = Math.max(1, Math.round(360 * Math.cos(lat * RAD) / s));
      for (var k = 0; k < n; k++) {
        var lon = -180 + (k + (r % 2 ? 0.5 : 0)) * 360 / n;
        if (land(lat, lon)) { var v = vec(lat, lon); xs.push(v[0]); ys.push(v[1]); zs.push(v[2]); }
      }
    }
    ND = xs.length; DX = new Float32Array(xs); DY = new Float32Array(ys); DZ = new Float32Array(zs); DL = new Uint8Array(ND);
  })();

  /* ------------------------------ the sun ------------------------------ */
  var SUN = { v: [1, 0, 0] };
  function updateSun() {
    var d = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 864e5;
    var g = (357.529 + 0.98560028 * d) * RAD, q = 280.459 + 0.98564736 * d;
    var L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
    var ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    var gmst = (18.697374558 + 24.06570982441908 * d) % 24; if (gmst < 0) gmst += 24;
    var lon = ((ra * DEG - gmst * 15 + 540) % 360 + 360) % 360 - 180;
    SUN.lat = dec * DEG; SUN.lon = lon; SUN.v = vec(SUN.lat, SUN.lon);
    for (var i = 0; i < ND; i++) {
      var t = DX[i] * SUN.v[0] + DY[i] * SUN.v[1] + DZ[i] * SUN.v[2];
      DL[i] = t > 0.14 ? 3 : t > 0 ? 2 : t > -0.14 ? 1 : 0;
    }
    dirty = true;
  }

  /* ------------------------------ travel times ------------------------------ */
  var NDIST = Math.round(180 / TT.step) + 1;
  function depthIdx(h) {
    var D = TT.depths, i = 0; while (i < D.length - 2 && h >= D[i + 1]) i++;
    return [i, Math.max(0, Math.min(1, (h - D[i]) / (D[i + 1] - D[i])))];
  }
  function rowAt(A, di) {
    var a = A[di[0]], b = A[di[0] + 1], f = di[1], out = new Array(NDIST);
    for (var j = 0; j < NDIST; j++) out[j] = a[j] == null ? b[j] : b[j] == null ? a[j] : a[j] + (b[j] - a[j]) * f;
    return out;
  }
  function curves(depth) {
    var di = depthIdx(depth), k = di[1] < 0.5 ? di[0] : di[0] + 1;
    return { P: rowAt(TT.P, di), S: rowAt(TT.S, di), Pn: TT.Pn[k], Sn: TT.Sn[k] };
  }
  /* first arrival at a distance; never interpolated across the jump from one phase to another */
  function arrival(T, N, deg) {
    var x = Math.max(0, Math.min(180, deg)) / TT.step, j = Math.min(NDIST - 2, Math.floor(x)), g = x - j, a = T[j], b = T[j + 1];
    if (a == null) return { t: b, n: TT.names[N[j + 1]] };
    if (b == null) return { t: a, n: TT.names[N[j]] };
    if (N[j] !== N[j + 1] && Math.abs(b - a) > 40) { var k = g < 0.5 ? j : j + 1; return { t: T[k], n: TT.names[N[k]] }; }
    return { t: a + (b - a) * g, n: TT.names[N[g < 0.5 ? j : j + 1]] };
  }
  /* largest distance (degrees) the first arrival has reached t seconds after origin; -1 before it starts */
  function reach(T, t) {
    var best = -1;
    for (var j = 0; j < NDIST - 1; j++) {
      var a = T[j], b = T[j + 1]; if (a == null || b == null) continue;
      if (t >= b) best = (j + 1) * TT.step;
      else if (t >= a && b > a && b - a < 40) best = (j + (t - a) / (b - a)) * TT.step;
    }
    return best;
  }
  /* radius along the first P ray (fraction of the Earth's radius), from the tabulated iasp91 paths */
  function rayRadii(deg, phase, rr) {
    var Rr = TT.rays, k = Math.max(0, Math.min(Rr.r.length - 1, Math.round(deg / Rr.step) - 1)), d;
    if (Rr.phase[k] !== phase) for (d = 1; d <= 4; d++) {
      if (Rr.phase[k - d] === phase) { k -= d; break; }
      if (Rr.phase[k + d] === phase) { k += d; break; }
    }
    var src = Rr.r[k], n = Rr.n, out = new Array(n), below = false, i;
    for (i = 0; i < n; i++) { var r = src[i]; if (!below) { if (r <= rr) below = true; else r = rr; } out[i] = r; }
    if (!below) for (i = 0; i < n; i++) { var f = i / (n - 1); out[i] = rr + (1 - rr) * f * f * (3 - 2 * f); }
    out[n - 1] = 1;
    return out;
  }
  var PHASE = {
    P: 'through the mantle', p: 'straight up', Pdiff: 'around the core', PKIKP: 'through the inner core', PKP: 'through the outer core',
    S: 'through the mantle', s: 'straight up', SKS: 'by way of the outer core', SKIKS: 'by way of the inner core'
  };

  /* ------------------------------ formats ------------------------------ */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad(s % 60); }
  function minsec(s) { s = Math.round(s); var m = Math.floor(s / 60); return (m ? m + NBSP + 'min ' : '') + (s % 60) + NBSP + 's'; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function utcDate(ms) { var d = new Date(ms); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function utcTime(ms, sec) { var d = new Date(ms); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + (sec ? ':' + pad(d.getUTCSeconds()) : ''); }
  function ago(ms) {
    var s = Math.max(0, ms) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    var d = Math.floor(s / 86400), h = Math.floor((s - d * 86400) / 3600); return d + ' d' + (h ? ' ' + h + ' h' : '') + ' ago';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function placeHTML(s) { return esc(s).replace(/(\d) (?=km\b)/g, '$1&nbsp;'); }
  function num(n) { return Math.round(n).toLocaleString('en-US'); }

  /* ------------------------------ state ------------------------------ */
  var S = 0, R = 0, CX = 0, CY = 0, VW = 0, VH = 0, DPR = 1, scale = 1;
  var rot = { lon: 40, lat: 16 }, base = { lon: 40, lat: 16 }, vel = { lon: 0, lat: 0 }, mode = 'spin', swayT0 = 0, fly = null;
  var cl = 1, sl = 0, cp = 1, sp = 0;
  var quakes = [], byMag = [], byId = {}, sel = null, geo = null, hover = null, live = false, ref = Date.now(), maxMag = 7, flightQ = null;
  var rp = null, still = false, liveDone = {}, liveOn = false, liveT = 0;
  var flashes = [], dirty = true, visible = true, raf = 0, last = 0, showAll = false, touched = false, booted = false;

  function setRot() { cl = Math.cos(rot.lon * RAD); sl = Math.sin(rot.lon * RAD); cp = Math.cos(rot.lat * RAD); sp = Math.sin(rot.lat * RAD); }
  function proj(v, r, o) {
    var x1 = v[0] * cl + v[1] * sl, y1 = -v[0] * sl + v[1] * cl, z1 = v[2];
    o[0] = CX + R * r * y1; o[1] = CY - R * r * (-x1 * sp + z1 * cp); o[2] = r * (x1 * cp + z1 * sp); return o;
  }
  function now() { return live ? Date.now() : ref; }
  /* the selected earthquake's waves have not all reached Zürich yet (live feed only) */
  function inFlight(q, g) { if (!live || !q || !g) return false; var a = (Date.now() - q.t) / 1000; return a >= 0 && a < g.lr + 90; }

  /* ------------------------------ layout ------------------------------ */
  function layout() {
    var w = slot.clientWidth, h = slot.clientHeight; if (!w || !h) return;
    var narrow = window.innerWidth <= 720, mid = window.innerWidth <= 1040;
    var D = narrow ? Math.min(w * 0.84, h * 0.92) : mid ? Math.min(w * 0.98, h * 0.94) : Math.min(h * 0.985, w);
    D = Math.max(200, D);
    S = Math.round(D * 1.2); R = D / 2; CX = CY = S / 2; VW = w; VH = h;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = cv.style.height = S + 'px';
    cv.width = cv.height = Math.round(S * DPR);
    scale = Math.max(0.7, Math.min(1.25, R / 300));
    dirty = true;
  }

  /* ------------------------------ sprites ------------------------------ */
  var GLOW = document.createElement('canvas'); GLOW.width = GLOW.height = 96;
  (function () {
    var c = GLOW.getContext('2d'), g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
    g.addColorStop(0, 'rgba(255,96,58,.62)'); g.addColorStop(0.3, 'rgba(255,90,54,.22)'); g.addColorStop(1, 'rgba(255,90,54,0)');
    c.fillStyle = g; c.fillRect(0, 0, 96, 96);
  })();

  /* ------------------------------ drawing ------------------------------ */
  var o = [0, 0, 0], o2 = [0, 0, 0], BK = [[], [], [], [], [], [], [], []];
  var BSTYLE = ['rgba(98,126,178,.22)', 'rgba(112,142,198,.34)', 'rgba(150,178,228,.50)', 'rgba(190,210,248,.64)',
                'rgba(100,130,186,.40)', 'rgba(120,152,210,.58)', 'rgba(178,202,246,.84)', 'rgba(228,238,255,.98)'];
  function mix(a, b, f) { return Math.round(a + (b - a) * f); }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
  function font(px, w) { ctx.font = (w || 400) + ' ' + px + 'px "Geist Mono",ui-monospace,Menlo,monospace'; }
  /* a label in a rounded box, kept inside the part of the canvas that the globe slot shows;
     `avoid` (optional) holds boxes already drawn: the label steps down until it is clear of them */
  function tag(x, y, text, o_, avoid) {
    o_ = o_ || {}; font(o_.size || 10.5, 500);
    var w = ctx.measureText(text).width, padx = 7, h = 19, bw = w + padx * 2, bx, by, k, tries = 0, hit;
    var vx0 = Math.max(4, (S - VW) / 2 + 6), vx1 = Math.min(S - 4, (S + VW) / 2 - 6), vy0 = Math.max(4, (S - VH) / 2 + 6), vy1 = Math.min(S - 4, (S + VH) / 2 - 6);
    do {
      bx = Math.max(vx0, Math.min(vx1 - bw, x - (o_.align === 'left' ? 0 : bw / 2))); by = Math.max(vy0, Math.min(vy1 - h, y - h / 2));
      hit = false;
      if (avoid) for (k = 0; k < avoid.length; k++) { var a = avoid[k]; if (bx < a[0] + a[2] + 4 && bx + bw + 4 > a[0] && by < a[1] + a[3] + 3 && by + h + 3 > a[1]) { hit = true; break; } }
      if (hit) y += h + 4;
    } while (hit && ++tries < 5);
    ctx.fillStyle = o_.bg || 'rgba(7,11,20,.82)'; ctx.strokeStyle = o_.line || 'rgba(160,185,230,.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, h, 9.5); else ctx.rect(bx, by, bw, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = o_.color || '#eef2f8'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, bx + padx, by + h / 2 + 0.5);
    var box = [bx, by, bw, h]; if (avoid) avoid.push(box); return box;
  }
  /* small circle at deltaDeg around c, front side only; `top` collects its highest well-visible point */
  function ringOnSphere(c, deltaDeg, top) {
    var d = deltaDeg * RAD, cd = Math.cos(d), sd = Math.sin(d);
    var u = norm(cross(c, Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), v = cross(c, u), pen = false, p = [0, 0, 0];
    ctx.beginPath();
    for (var i = 0; i <= 120; i++) {
      var a = i / 120 * TAU, ca = Math.cos(a), sa = Math.sin(a);
      p[0] = cd * c[0] + sd * (ca * u[0] + sa * v[0]); p[1] = cd * c[1] + sd * (ca * u[1] + sa * v[1]); p[2] = cd * c[2] + sd * (ca * u[2] + sa * v[2]);
      proj(p, 1, o);
      if (o[2] > 0.01) {
        if (pen) ctx.lineTo(o[0], o[1]); else { ctx.moveTo(o[0], o[1]); pen = true; }
        if (top && o[2] > 0.15 && o[1] < top[1]) { top[0] = o[0]; top[1] = o[1]; }
      } else pen = false;
    }
    ctx.stroke();
  }
  /* the replay: P, S and surface fronts of the selected earthquake, bright and solid */
  function fronts(q, c, T, alpha) {
    var dP = reach(c.P, T), dS = reach(c.S, T), dR = T * TT.rayleigh_kms / KM;
    ctx.lineCap = 'round';
    if (dR > 0.4 && dR < 179.6) {
      ctx.strokeStyle = 'rgba(255,90,54,' + 0.20 * alpha + ')'; ctx.lineWidth = 7 * scale; ringOnSphere(q.v, dR);
      ctx.strokeStyle = 'rgba(255,104,70,' + 0.95 * alpha + ')'; ctx.lineWidth = 2.1 * scale; ringOnSphere(q.v, dR);
    }
    if (dS > 0.4 && dS < 179.6) { ctx.strokeStyle = 'rgba(255,176,143,' + 0.9 * alpha + ')'; ctx.lineWidth = 1.5 * scale; ringOnSphere(q.v, dS); }
    if (dP > 0.4 && dP < 179.6) { ctx.strokeStyle = 'rgba(207,225,255,' + 0.85 * alpha + ')'; ctx.lineWidth = 1.1 * scale; ringOnSphere(q.v, dP); }
  }
  /* waves in flight right now: thin dashed rings, quieter than the replay; returns where to put their label */
  function ghostFronts(q, c, T, strong) {
    var dP = reach(c.P, T), dS = reach(c.S, T), dR = T * TT.rayleigh_kms / KM, k = strong ? 1.4 : 1;
    var tR = [0, 1e9], tS = [0, 1e9], tP = [0, 1e9];
    ctx.lineCap = 'round'; ctx.lineWidth = scale; ctx.setLineDash([2, 5]);
    if (dP > 0.4 && dP < 179.6) { ctx.strokeStyle = 'rgba(207,225,255,' + 0.3 * k + ')'; ringOnSphere(q.v, dP, tP); }
    if (dS > 0.4 && dS < 179.6) { ctx.strokeStyle = 'rgba(255,190,165,' + 0.34 * k + ')'; ringOnSphere(q.v, dS, tS); }
    if (dR > 0.4 && dR < 179.6) { ctx.setLineDash([3, 5]); ctx.lineWidth = 1.3 * scale; ctx.strokeStyle = 'rgba(255,150,120,' + 0.58 * k + ')'; ringOnSphere(q.v, dR, tR); }
    ctx.setLineDash([]);
    return tR[1] < 1e9 ? tR : tS[1] < 1e9 ? tS : tP[1] < 1e9 ? tP : null;
  }

  function draw(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, S, S);
    setRot();
    var g, i, n, b, q, a;

    /* atmosphere, then the sphere lit from the real position of the sun */
    g = ctx.createRadialGradient(CX, CY, R * 0.985, CX, CY, R * 1.18);
    g.addColorStop(0, 'rgba(96,150,255,.36)'); g.addColorStop(0.3, 'rgba(84,138,250,.13)'); g.addColorStop(1, 'rgba(84,138,250,0)');
    ctx.fillStyle = g; circle(CX, CY, R * 1.18); ctx.fill();
    proj(SUN.v, 1, o); var sdx = o[0] - CX, sdy = o[1] - CY, sxv = o[2];
    if (sxv < 0) { var l = Math.hypot(sdx, sdy) || 1; sdx = sdx / l * R * 1.02; sdy = sdy / l * R * 1.02; }
    var lit = Math.max(0, sxv);
    g = ctx.createRadialGradient(CX + sdx * 0.72, CY + sdy * 0.72, R * 0.04, CX, CY, R * 1.02);
    g.addColorStop(0, 'rgb(' + mix(18, 30, lit) + ',' + mix(36, 60, lit) + ',' + mix(70, 118, lit) + ')');
    g.addColorStop(0.5, '#0b1629'); g.addColorStop(1, '#060a14');
    ctx.fillStyle = g; circle(CX, CY, R); ctx.fill();
    g = ctx.createRadialGradient(CX, CY, R * 0.78, CX, CY, R);
    g.addColorStop(0, 'rgba(110,160,255,0)'); g.addColorStop(1, 'rgba(120,170,255,.22)');
    ctx.fillStyle = g; circle(CX, CY, R); ctx.fill();

    /* the core, a ball inside the glass planet */
    var rc = R * TT.cmb, ri = R * TT.icb;
    g = ctx.createRadialGradient(CX - rc * 0.34, CY - rc * 0.38, rc * 0.04, CX, CY, rc);
    g.addColorStop(0, 'rgba(255,150,104,.21)'); g.addColorStop(0.55, 'rgba(214,92,60,.11)'); g.addColorStop(1, 'rgba(150,58,46,.075)');
    ctx.fillStyle = g; circle(CX, CY, rc); ctx.fill();
    ctx.strokeStyle = 'rgba(255,176,146,.26)'; ctx.lineWidth = 1; circle(CX, CY, rc - 0.5); ctx.stroke();
    g = ctx.createRadialGradient(CX - ri * 0.22, CY - ri * 0.26, 0, CX, CY, ri * 1.5);
    g.addColorStop(0, 'rgba(255,214,178,.50)'); g.addColorStop(0.42, 'rgba(255,150,100,.22)'); g.addColorStop(0.66, 'rgba(255,120,80,.07)'); g.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = g; circle(CX, CY, ri * 1.5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,160,.30)'; ctx.setLineDash([2, 4]); circle(CX, CY, ri); ctx.stroke(); ctx.setLineDash([]);

    /* graticule */
    ctx.strokeStyle = 'rgba(150,180,235,.075)'; ctx.lineWidth = 1; ctx.beginPath();
    var pen, lat, lon;
    for (lon = -180; lon < 180; lon += 30) { pen = false; for (lat = -84; lat <= 84; lat += 6) { proj(vec(lat, lon), 1, o); if (o[2] > 0) { if (pen) ctx.lineTo(o[0], o[1]); else { ctx.moveTo(o[0], o[1]); pen = true; } } else pen = false; } }
    for (lat = -60; lat <= 60; lat += 30) { pen = false; for (lon = -180; lon <= 180; lon += 6) { proj(vec(lat, lon), 1, o); if (o[2] > 0) { if (pen) ctx.lineTo(o[0], o[1]); else { ctx.moveTo(o[0], o[1]); pen = true; } } else pen = false; } }
    ctx.stroke();

    /* land */
    for (b = 0; b < 8; b++) BK[b].length = 0;
    var rs = 1.22 * scale;
    for (i = 0; i < ND; i++) {
      var x = DX[i], y = DY[i], z = DZ[i], x1 = x * cl + y * sl, xv = x1 * cp + z * sp;
      if (xv < 0.03) continue;
      BK[DL[i] + (xv > 0.4 ? 4 : 0)].push(CX + R * (-x * sl + y * cl), CY - R * (-x1 * sp + z * cp), rs * (0.5 + 0.62 * xv));
    }
    for (b = 0; b < 8; b++) {
      a = BK[b]; n = a.length; if (!n) continue;
      ctx.fillStyle = BSTYLE[b]; ctx.beginPath();
      for (i = 0; i < n; i += 3) { ctx.moveTo(a[i] + a[i + 2], a[i + 1]); ctx.arc(a[i], a[i + 1], a[i + 2], 0, TAU); }
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(150,190,255,.34)'; ctx.lineWidth = 1; circle(CX, CY, R - 0.5); ctx.stroke();
    font(8.5 * Math.max(0.9, scale)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,190,165,.5)';
    if (R > 150) { ctx.fillText('OUTER CORE', CX, CY + rc - 11 * scale); ctx.fillText('INNER CORE', CX, CY + ri + 10 * scale); }

    /* the selected path: surface route (dashed) and the first P ray through the interior */
    var tnow = now();
    if (sel && geo) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(255,180,150,.6)'; ctx.lineWidth = 1.15; ctx.beginPath(); pen = false;
      for (i = 0; i < geo.surf.length; i++) { proj(geo.surf[i], 1, o); if (o[2] > 0) { if (pen) ctx.lineTo(o[0], o[1]); else { ctx.moveTo(o[0], o[1]); pen = true; } } else pen = false; }
      ctx.stroke(); ctx.setLineDash([]);
      var m = geo.ray.length, pass, px, py, pd;
      for (pass = 0; pass < 2; pass++) {
        proj(geo.ray[0], geo.rr[0], o); px = o[0]; py = o[1]; pd = o[2];
        for (i = 1; i < m; i++) {
          proj(geo.ray[i], geo.rr[i], o);
          var f = i / (m - 1), al = ((pd + o[2]) / 2 > 0 ? 1 : 0.42) * ((geo.rr[i] + geo.rr[i - 1]) / 2 < TT.cmb - 0.004 ? 0.55 : 1);
          ctx.strokeStyle = 'rgba(' + mix(255, 255, f) + ',' + mix(118, 240, f) + ',' + mix(84, 232, f) + ',' + (pass ? 0.96 * al : 0.14 * al) + ')';
          ctx.lineWidth = (pass ? 1.8 : 6.5) * scale;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(o[0], o[1]); ctx.stroke();
          px = o[0]; py = o[1]; pd = o[2];
        }
      }
      /* now and then a soft light runs down the ray: the first wave on its way to Zürich */
      if (!rp && !still && !reduce) {
        var cyc = (t / 1000 + 4) % 7;
        if (cyc < 2.6) {
          var fq = ease(cyc / 2.6), xq = fq * (m - 1), iq = Math.min(m - 2, Math.floor(xq)), gq = xq - iq, qa = Math.sin(Math.PI * cyc / 2.6);
          proj(geo.ray[iq], geo.rr[iq], o); proj(geo.ray[iq + 1], geo.rr[iq + 1], o2);
          var qx = o[0] + (o2[0] - o[0]) * gq, qy = o[1] + (o2[1] - o[1]) * gq;
          ctx.fillStyle = 'rgba(255,226,210,' + 0.16 * qa + ')'; circle(qx, qy, 10 * scale); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,' + 0.92 * qa + ')'; circle(qx, qy, 2.4 * scale); ctx.fill();
        }
      }
    }

    /* waves still on their way, where they are now (live feed only; they make way for a replay) */
    var ghostTags = [];
    if (live && !rp && !still) for (i = 0; i < quakes.length; i++) {
      q = quakes[i]; var age = (tnow - q.t) / 1000; if (age > FLIGHT) break; if (age < 0) continue;
      if (!q.c) q.c = curves(q.depth);
      var top = ghostFronts(q, q.c, age, q === sel);
      /* labels for the newest few only (one on a small globe), so they never crowd it */
      if (top && ghostTags.length < (R < 220 ? 1 : 3)) ghostTags.push([top[0], top[1], 'M ' + q.mag.toFixed(1) + ' · ' + Math.max(1, Math.round(age / 60)) + ' MIN AGO']);
    }
    /* replay, or (reduced motion) the moment the S wave reaches Zürich */
    if (rp && sel && geo) {
      fronts(sel, geo.c, rp.T, 1);
      var fp = Math.min(1, rp.T / geo.p.t), xi = fp * (geo.ray.length - 1), i0 = Math.min(geo.ray.length - 2, Math.floor(xi)), fr = xi - i0;
      proj(geo.ray[i0], geo.rr[i0], o); proj(geo.ray[i0 + 1], geo.rr[i0 + 1], o2);
      var hx = o[0] + (o2[0] - o[0]) * fr, hy = o[1] + (o2[1] - o[1]) * fr;
      if (fp < 1) { ctx.fillStyle = 'rgba(255,255,255,.22)'; circle(hx, hy, 8 * scale); ctx.fill(); ctx.fillStyle = '#fff'; circle(hx, hy, 3 * scale); ctx.fill(); }
    } else if (still && sel && geo) fronts(sel, geo.c, geo.s.t, 1);

    /* earthquakes, the big ones first so the small ones stay on top */
    for (i = 0; i < byMag.length; i++) {
      q = byMag[i]; proj(q.v, q.rr, o); q.sx = o[0]; q.sy = o[1]; q.dv = o[2];
      var mr = q.mr * scale;
      if (q.dv <= 0.02) { ctx.fillStyle = 'rgba(255,128,96,.17)'; circle(q.sx, q.sy, mr * 0.62); ctx.fill(); continue; }
      var old = Math.max(0, Math.min(1, (tnow - q.t) / WEEK)), al2 = (1 - 0.5 * old) * (0.5 + 0.5 * Math.min(1, q.dv * 1.6));
      if (q.depth > 70) { proj(q.v, 1, o2); ctx.strokeStyle = 'rgba(255,170,140,' + 0.5 * al2 + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(o2[0], o2[1]); ctx.lineTo(q.sx, q.sy); ctx.stroke(); }
      ctx.globalAlpha = al2; ctx.drawImage(GLOW, q.sx - mr * 3.4, q.sy - mr * 3.4, mr * 6.8, mr * 6.8);
      ctx.fillStyle = '#ff5a36'; circle(q.sx, q.sy, mr); ctx.fill();
      ctx.fillStyle = 'rgba(255,226,214,.92)'; circle(q.sx, q.sy, mr * 0.36); ctx.fill();
      ctx.globalAlpha = 1;
      var inAir = live && tnow >= q.t && tnow - q.t < FLIGHT * 1000;
      if (!reduce && (inAir || q.fresh || q.mag >= 6 || q === sel)) {
        var per = inAir || q.fresh ? 2.2 : 3.4, ph = ((t / 1000 + q.seed * per) % per) / per;
        ctx.strokeStyle = 'rgba(255,110,76,' + (1 - ph) * (inAir ? 0.8 : 0.62) * al2 + ')'; ctx.lineWidth = inAir ? 1.6 : 1.2;
        circle(q.sx, q.sy, mr + ph * (mr * 2.2 + 9)); ctx.stroke();
      }
    }

    /* Zürich */
    var placed = [];
    proj(ZV, 1, o); var zx = o[0], zy = o[1], zf = o[2] > 0;
    ctx.save(); ctx.translate(zx, zy); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = zf ? '#fff' : 'rgba(255,255,255,.28)'; var zs = 3.6 * scale; ctx.fillRect(-zs, -zs, zs * 2, zs * 2); ctx.restore();
    if (zf) {
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; circle(zx, zy, 9 * scale); ctx.stroke();
      for (i = flashes.length - 1; i >= 0; i--) {
        var fl = flashes[i], ft = (t - fl.t0) / 1300; if (ft >= 1) { flashes.splice(i, 1); continue; }
        ctx.strokeStyle = fl.c.replace('A', String((1 - ft) * 0.9)); ctx.lineWidth = 2 * (1 - ft) + 0.6; circle(zx, zy, 9 * scale + ft * 34 * scale); ctx.stroke();
      }
      tag(zx + 13 * scale, zy - 15 * scale, 'ZÜRICH', { align: 'left', size: 9.5, bg: 'rgba(7,11,20,.7)' }, placed);
    } else flashes.length = 0;

    /* selection mark, labels of the waves in flight (clear of the other labels), then the hover mark */
    if (sel && sel.dv > 0.02) {
      var sr = sel.mr * scale;
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.3; circle(sel.sx, sel.sy, sr + 4.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; circle(sel.sx, sel.sy, sr + 9); ctx.stroke();
      if (hover !== sel) tag(sel.sx - Math.max(-1, Math.min(1, (sel.sx - CX) / (R * 0.5))) * 22, sel.sy - sr - 22, 'M ' + sel.mag.toFixed(1), { bg: 'rgba(255,90,54,.92)', line: 'rgba(255,255,255,.25)', color: '#fff' }, placed);
    }
    for (i = 0; i < ghostTags.length; i++) tag(ghostTags[i][0], ghostTags[i][1] - 15, ghostTags[i][2], { size: 9.5, bg: 'rgba(7,11,20,.84)', line: 'rgba(255,150,120,.45)', color: '#ffcdbd' }, placed);
    if (hover && hover.dv > 0.02) {
      var hr = hover.mr * scale;
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2; circle(hover.sx, hover.sy, hr + 4.5); ctx.stroke();
      var txt = 'M ' + hover.mag.toFixed(1) + ' · ' + hover.place; if (txt.length > 46) txt = txt.slice(0, 45) + '…';
      tag(hover.sx, hover.sy - hr - 22, txt);
    }
    dirty = false;
    if (!booted) { booted = true; cv.classList.add('on'); }
  }

  /* ------------------------------ motion ------------------------------ */
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function wrap(d) { return ((d + 540) % 360 + 360) % 360 - 180; }
  function flyTo(target) {
    if (!target) return;
    if (reduce) { rot.lon = target.lon; rot.lat = target.lat; base.lon = rot.lon; base.lat = rot.lat; mode = 'idle'; dirty = true; return; }
    fly = { t0: performance.now(), lon0: rot.lon, lat0: rot.lat, dlon: wrap(target.lon - rot.lon), dlat: target.lat - rot.lat, dur: 1250 }; mode = 'fly';
  }
  /* Look at the path from the side: 34 degrees off its great-circle plane, so the surface route and the ray
     through the interior do not fall on one line. Of the two sides, take the one nearer to 20 degrees north. */
  function focusFor(q) {
    var m = [q.v[0] + ZV[0], q.v[1] + ZV[1], q.v[2] + ZV[2]];
    if (Math.hypot(m[0], m[1], m[2]) < 0.2) m = q.v; m = norm(m);
    var nr = cross(q.v, ZV), ln = Math.hypot(nr[0], nr[1], nr[2]), best = null;
    if (ln < 0.05) nr = cross(m, [0, 0, 1]); nr = norm(nr);
    var ca = Math.cos(34 * RAD), sa = Math.sin(34 * RAD);
    for (var s = -1; s <= 1; s += 2) {
      var f = norm([m[0] * ca + s * nr[0] * sa, m[1] * ca + s * nr[1] * sa, m[2] * ca + s * nr[2] * sa]);
      var c = { lon: Math.atan2(f[1], f[0]) * DEG, lat: Math.asin(f[2]) * DEG };
      if (!best || Math.abs(c.lat - 20) < Math.abs(best.lat - 20)) best = c;
    }
    best.lat = Math.max(-50, Math.min(60, best.lat));
    return best;
  }
  function step(t, dt) {
    if (mode === 'fly' && fly) {
      var f = Math.min(1, (t - fly.t0) / fly.dur), e = ease(f);
      rot.lon = fly.lon0 + fly.dlon * e; rot.lat = fly.lat0 + fly.dlat * e;
      if (f >= 1) { mode = 'idle'; base.lon = rot.lon; base.lat = rot.lat; swayT0 = t; fly = null; }
    } else if (mode === 'inertia') {
      rot.lon -= vel.lon * dt; rot.lat = Math.max(-78, Math.min(78, rot.lat + vel.lat * dt));
      var k = Math.exp(-dt * 2.4); vel.lon *= k; vel.lat *= k;
      if (Math.abs(vel.lon) + Math.abs(vel.lat) < 1.2) { mode = 'idle'; base.lon = rot.lon; base.lat = rot.lat; swayT0 = t; }
    } else if (mode === 'spin' && !reduce) {
      rot.lon += 5 * dt;
    } else if (mode === 'idle' && !reduce) {
      var s = (t - swayT0) / 1000, amp = 6 * Math.min(1, s / 4);
      rot.lon = base.lon + amp * Math.sin(s * TAU / 44);
    }
    if (rp && geo) {
      rp.T = (t - rp.start) / 1000 * rp.k;
      if (rp.T >= geo.end) endReplay();
      else paintArrivals(rp.T, t, rp.done);
    } else if (geo && !still) {
      var on = inFlight(sel, geo);
      if (on && t - liveT > 500) { liveT = t; paintLive(t); }
      else if (!on && liveOn) restArrivals();
      liveOn = on;
    }
  }
  function frame(t) {
    raf = 0; if (!visible || document.hidden) return;
    var dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    step(t, dt);
    if (!reduce || dirty || mode === 'fly' || mode === 'inertia' || mode === 'drag' || rp || flashes.length) draw(t);
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  /* ------------------------------ the panel ------------------------------ */
  var el = { mag: $('evMag'), place: $('evPlace'), meta: $('evMeta'), dist: $('evDist'), link: $('evLink'), tP: $('tP'), tS: $('tS'), tR: $('tR'),
    nP: $('nP'), nS: $('nS'), fP: $('fP'), fS: $('fS'), fR: $('fR'), mP: $('mP'), mS: $('mS'), mR: $('mR'),
    replay: $('replay'), replayText: $('replayText'), clock: $('clock'), list: $('qlist'), listTitle: $('listTitle'), listToggle: $('listToggle'),
    status: $('status'), statusText: $('statusText'), sentence: $('liveSentence'), hint: $('hint'), flight: $('flight') };
  var rows = el.fP ? [el.fP.parentNode.parentNode, el.fS.parentNode.parentNode, el.fR.parentNode.parentNode] : [];
  var REPLAY_TXT = reduce ? 'Show the arrival' : 'Replay the arrival';
  if (el.replayText) el.replayText.textContent = REPLAY_TXT;

  /* fill the three tracks up to T seconds after origin; `seen` remembers which arrivals already flashed */
  function paintArrivals(T, t, seen) {
    if (!geo) return;
    var end = geo.end, ts = [geo.p.t, geo.s.t, geo.lr], fs = [el.fP, el.fS, el.fR], cols = ['rgba(207,225,255,A)', 'rgba(255,176,143,A)', 'rgba(255,90,54,A)'];
    for (var i = 0; i < 3; i++) {
      if (!fs[i]) continue;
      fs[i].style.width = (Math.min(T, ts[i]) / end * 100).toFixed(2) + '%';
      var done = T >= ts[i];
      if (done && seen && !seen[i]) { seen[i] = true; flashes.push({ t0: t, c: cols[i] }); wake(); }
      rows[i].classList.toggle('done', done);
    }
    if (rp && el.clock) el.clock.innerHTML = 'origin + <b>' + mmss(T) + '</b><br>' + Math.round(rp.k) + '× real time';
  }
  /* the selected earthquake is younger than its surface-wave arrival: show where its waves are now */
  function paintLive(t) {
    var a = (Date.now() - sel.t) / 1000;
    paintArrivals(a, t, liveDone);
    if (el.clock) el.clock.innerHTML = 'origin + <b>' + mmss(a) + '</b><br>live, real time';
  }
  function restArrivals() {
    if (!geo) return;
    if (!still && inFlight(sel, geo)) { liveOn = true; paintLive(performance.now()); return; }
    paintArrivals(geo.end + 1, 0, null);
    if (el.clock) el.clock.innerHTML = 'travel times<br>in <b>min:s</b>';
  }
  function setReplayBtn(on, text) { if (!el.replay) return; el.replay.setAttribute('aria-pressed', on ? 'true' : 'false'); el.replayText.textContent = text; }
  function startReplay() {
    if (!sel || !geo) return;
    if (reduce) { still = !still; setReplayBtn(still, still ? 'Hide the arrival' : REPLAY_TXT); restArrivals(); dirty = true; wake(); return; }
    rp = { start: performance.now(), k: geo.end / 12, T: 0, done: {} };
    setReplayBtn(true, 'Stop');
    flyTo(focusFor(sel)); paintArrivals(0, 0, null); dirty = true; wake();
  }
  function endReplay() { rp = null; setReplayBtn(false, REPLAY_TXT); restArrivals(); dirty = true; }
  if (el.replay) el.replay.addEventListener('click', function () { if (rp) endReplay(); else startReplay(); });

  function updatePanel() {
    if (!sel || !geo || !el.mag) return;
    el.mag.textContent = sel.mag.toFixed(1);
    el.place.textContent = sel.place;
    el.meta.innerHTML = '<span>' + utcDate(sel.t) + ', ' + utcTime(sel.t, true) + ' UTC</span><br><span>' + (sel.depth < 1 ? 'near the surface' : num(sel.depth) + ' km deep') +
      (live ? ' · <span id="evAgo">' + ago(Date.now() - sel.t) + '</span>' : '') + '</span>';
    el.dist.textContent = geo.deg.toFixed(1) + '° · ' + num(geo.km) + ' km';
    el.tP.textContent = mmss(geo.p.t); el.tS.textContent = mmss(geo.s.t); el.tR.innerHTML = '<small>≈ </small>' + mmss(geo.lr);
    el.nP.textContent = geo.p.n === 'P' ? 'first wave' : geo.p.n; el.nP.parentNode.title = geo.p.n + ': ' + (PHASE[geo.p.n] || '');
    el.nS.textContent = geo.s.n === 'S' ? 'shear wave' : geo.s.n; el.nS.parentNode.title = geo.s.n + ': ' + (PHASE[geo.s.n] || '');
    el.mP.style.left = (geo.p.t / geo.end * 100).toFixed(2) + '%'; el.mS.style.left = (geo.s.t / geo.end * 100).toFixed(2) + '%'; el.mR.style.left = (geo.lr / geo.end * 100).toFixed(2) + '%';
    el.link.href = 'https://earthquake.usgs.gov/earthquakes/eventpage/' + encodeURIComponent(sel.id);
    el.link.innerHTML = 'USGS<span class="lk-x"> event page</span> ↗';
    restArrivals();
  }
  function geometry(q) {
    var om = angle(q.v, ZV), so = Math.sin(om), deg = om * DEG, c = q.c || (q.c = curves(q.depth));
    var p = arrival(c.P, c.Pn, deg), s = arrival(c.S, c.Sn, deg), lr = deg * KM / TT.rayleigh_kms, i;
    var rr = rayRadii(deg, p.n, q.rr), surf = [], ray = [];
    for (i = 0; i <= 72; i++) surf.push(slerp(q.v, ZV, i / 72, om, so));
    for (i = 0; i < rr.length; i++) ray.push(slerp(q.v, ZV, i / (rr.length - 1), om, so));
    return { deg: deg, km: deg * KM, c: c, p: p, s: s, lr: lr, surf: surf, ray: ray, rr: rr, end: lr * 1.05 + 30 };
  }
  function select(q, opts) {
    if (!q) return;
    rp = null; still = false; setReplayBtn(false, REPLAY_TXT);
    sel = q; geo = geometry(q);
    liveDone = {}; liveOn = false;
    if (inFlight(q, geo)) { var a = (Date.now() - q.t) / 1000; [geo.p.t, geo.s.t, geo.lr].forEach(function (x, i) { if (a >= x) liveDone[i] = true; }); }
    if (el.replay) el.replay.disabled = false;
    updatePanel(); markList(); drawTimeline(); dirty = true;
    if (!opts || opts.fly !== false) flyTo(focusFor(q));
    wake();
  }
  /* on a phone the globe sits above the list and the strip: bring it back into view before it turns */
  function reveal() {
    if (window.innerWidth > 720) return;
    var r = slot.getBoundingClientRect(), seen = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 54);
    if (seen < r.height * 0.6) slot.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }
  function pickFromUI(q) { if (!q) return; used(); reveal(); select(q); }

  /* ------------------------------ lists ------------------------------ */
  function listTime(q) { return live ? ago(Date.now() - q.t).replace(' ago', '') : new Date(q.t).getUTCDate() + ' ' + MON[new Date(q.t).getUTCMonth()]; }
  function renderList() {
    if (!el.list) return;
    var ae = document.activeElement, fid = ae && el.list.contains(ae) ? ae.getAttribute('data-id') : null;
    var items = showAll ? quakes : byMag.slice(0, 7), h = '';
    for (var i = 0; i < items.length; i++) {
      var q = items[i];
      h += '<li><button class="q" type="button" data-id="' + esc(q.id) + '"><b>' + q.mag.toFixed(1) + '</b><span>' + esc(q.place) + '</span><time>' + listTime(q) + '</time></button></li>';
    }
    el.list.innerHTML = h;
    el.listTitle.textContent = showAll ? 'All ' + quakes.length + ', newest first' : live ? 'Largest this week' : 'Largest in the snapshot';
    el.listToggle.textContent = showAll ? 'Largest only' : 'Show all ' + quakes.length;
    el.listToggle.setAttribute('aria-pressed', showAll ? 'true' : 'false');
    markList();
    if (fid) { var bs = el.list.querySelectorAll('.q'); for (i = 0; i < bs.length; i++) if (bs[i].getAttribute('data-id') === fid) { bs[i].focus({ preventScroll: true }); break; } }
  }
  function refreshTimes() {
    if (!el.list) return;
    var bs = el.list.querySelectorAll('.q');
    for (var i = 0; i < bs.length; i++) { var q = byId[bs[i].getAttribute('data-id')], tm = bs[i].querySelector('time'); if (q && tm) tm.textContent = listTime(q); }
  }
  function markList() {
    if (el.list) {
      var bs = el.list.querySelectorAll('.q');
      for (var i = 0; i < bs.length; i++) { if (sel && bs[i].getAttribute('data-id') === sel.id) bs[i].setAttribute('aria-current', 'true'); else bs[i].removeAttribute('aria-current'); }
    }
    if (el.flight) { if (flightQ && flightQ === sel) el.flight.setAttribute('aria-current', 'true'); else el.flight.removeAttribute('aria-current'); }
  }
  if (el.list) el.list.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.q') : null; if (!b) return;
    pickFromUI(byId[b.getAttribute('data-id')]);
  });
  if (el.listToggle) el.listToggle.addEventListener('click', function () { showAll = !showAll; renderList(); });
  if (el.flight) el.flight.addEventListener('click', function () { pickFromUI(flightQ); });

  /* ------------------------------ data ------------------------------ */
  function ingest(rowsIn, isLive, refMs) {
    var keep = sel ? sel.id : null, first = !quakes.length;
    live = isLive; ref = refMs;
    quakes = rowsIn.filter(function (r) { return r && r[3] != null && isFinite(r[0]) && isFinite(r[1]); }).map(function (r, i) {
      var depth = Math.max(0, r[2] || 0);
      return { lon: r[0], lat: r[1], depth: depth, mag: r[3], t: r[4], place: r[5] || 'location not named', id: String(r[6]), v: vec(r[1], r[0]),
        rr: 1 - Math.min(depth, 700) / RE, mr: 2.3 + Math.pow(Math.max(0, r[3] - 4.4), 1.55) * 2.35, seed: (i * 0.6180339) % 1,
        fresh: refMs - r[4] < 864e5, sx: -99, sy: -99, dv: -1, c: null };
    }).sort(function (a, b) { return b.t - a.t; });
    byMag = quakes.slice().sort(function (a, b) { return b.mag - a.mag || b.t - a.t; });
    byId = {}; quakes.forEach(function (q) { byId[q.id] = q; });
    maxMag = byMag.length ? byMag[0].mag : 7;
    var big = byMag[0], gb = big ? geometry(big) : null;
    if (el.status) {
      el.status.setAttribute('data-state', isLive ? 'live' : 'snapshot');
      el.statusText.innerHTML = isLive
        ? '<b>Live</b> · USGS · magnitude 4.5+ · <span class="nw">past 7 days</span><span class="upd"> · <span class="nw">updated ' + utcTime(Date.now()) + ' UTC</span></span>'
        : '<b>Snapshot</b> of <span class="nw">' + utcDate(refMs) + ', ' + utcTime(refMs) + ' UTC</span><span class="sep"> · </span><br class="mbr"><span class="nw">USGS feed not reachable</span>';
    }
    if (el.sentence && big) {
      var how = PHASE[gb.p.n] ? PHASE[gb.p.n] + ' ' : '';
      el.sentence.innerHTML = '<b>' + quakes.length + '</b> earthquakes of magnitude 4.5 or more ' +
        (isLive ? 'in the past seven days' : 'in the seven days to ' + utcDate(refMs) + ', ' + utcTime(refMs) + '&nbsp;UTC') +
        '. The largest, <em>M&nbsp;' + big.mag.toFixed(1) + '</em> (' + placeHTML(big.place) + '), sent its first wave ' + esc(how) + 'to Zürich in <b>' + minsec(gb.p.t) + '</b>.';
    }
    renderList(); flightNote();
    var again = keep ? byId[keep] : null;
    if (again && (rp || still)) { sel = again; geo = geometry(again); markList(); dirty = true; }   /* a refresh does not cut a running replay */
    else select(again || big, { fly: first || !again });
    drawTimeline();
  }
  function load(first) {
    var ctl = window.AbortController ? new AbortController() : null, done = false;
    var to = setTimeout(function () { if (ctl) ctl.abort(); fail(); }, 4000);
    function fail() { if (done) return; done = true; clearTimeout(to); if (first) ingest(G.quakes.rows, false, Date.parse(G.quakes.fetched) || Date.now()); }
    if (!window.fetch || /[?&]snapshot\b/.test(location.search)) { fail(); return; }
    fetch(G.quakes.feed, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        if (done) return; var rows_ = (j.features || []).map(function (f) { var c = f.geometry.coordinates, p = f.properties; return [c[0], c[1], c[2], p.mag, p.time, p.place, f.id]; });
        if (!rows_.length) throw new Error('empty feed');
        done = true; clearTimeout(to); ingest(rows_, true, Date.now());
      }).catch(fail);
  }

  /* earthquakes whose waves are still travelling, said in words; the chip selects the newest of them */
  function flightNote() {
    if (!el.flight) return;
    var fl = [], i, a;
    if (live) for (i = 0; i < quakes.length; i++) { a = (Date.now() - quakes[i].t) / 1000; if (a > FLIGHT) break; if (a >= 0) fl.push(quakes[i]); }
    hero.classList.toggle('inflight', fl.length > 0);
    if (!fl.length) { el.flight.hidden = true; flightQ = null; markList(); return; }
    var q = fl[0], mins = Math.max(1, Math.round((Date.now() - q.t) / 60000)), m = 'M ' + q.mag.toFixed(1), long, short;
    if (fl.length > 1) { long = 'Waves in flight now · ' + fl.length + ' earthquakes'; short = 'Waves in flight · ' + fl.length + ' earthquakes'; }
    else { long = 'Waves in flight now · ' + m + ', ' + mins + ' min ago'; short = 'Waves in flight · ' + m + ' · ' + mins + ' min'; }
    el.flight.innerHTML = '<span class="fl-l">' + long + '</span><span class="fl-s">' + short + '</span>';
    el.flight.title = 'Show the newest: ' + m + ', ' + q.place;
    flightQ = q; el.flight.hidden = false; markList();
  }

  /* ------------------------------ timeline ------------------------------ */
  var tl = $('tl'), tctx = tl && tl.getContext ? tl.getContext('2d') : null, TW = 0, TH = 0;
  var TL_FONT = '400 10px "Geist Mono",ui-monospace,Menlo,monospace', TL_AXIS = '#8592a8';
  function tlLayout() {
    if (!tctx) return; var r = tl.getBoundingClientRect(); TW = r.width; TH = r.height; if (!TW) return;
    var d = Math.min(window.devicePixelRatio || 1, 2); tl.width = Math.round(TW * d); tl.height = Math.round(TH * d); tctx.setTransform(d, 0, 0, d, 0, 0); drawTimeline();
  }
  function drawTimeline() {
    if (!tctx || !TW) return; var c = tctx, narrow = TW < 560;
    c.clearRect(0, 0, TW, TH);
    c.font = TL_FONT; c.textBaseline = 'middle'; if ('letterSpacing' in c) c.letterSpacing = '0.08em';
    c.textAlign = 'left'; c.fillStyle = 'rgba(178,190,208,.92)';
    if (!quakes.length) { c.fillText('LOADING THE USGS FEED…', narrow ? 16 : 26, 15); return; }
    var padL = narrow ? 40 : 64, padR = narrow ? 16 : 30, padT = 30, padB = 22, t1 = now(), t0 = t1 - WEEK;
    var mTop = Math.max(7, Math.ceil(maxMag * 2) / 2) + 0.2, mBot = 4.4;
    var X = function (t) { return padL + (t - t0) / WEEK * (TW - padL - padR); }, Y = function (m) { return TH - padB - (m - mBot) / (mTop - mBot) * (TH - padT - padB); };
    var head = live ? (narrow ? '7 DAYS · ' : 'THE PAST 7 DAYS · ') : (narrow ? 'TO ' : '7 DAYS TO ') + utcDate(ref).toUpperCase() + ' · ';
    c.fillText(head + quakes.length + ' EARTHQUAKES' + (narrow ? '' : ' · MAGNITUDE AGAINST TIME, UTC'), narrow ? 16 : 26, 15);
    c.lineWidth = 1;
    for (var m = 5; m <= mTop; m++) {
      c.strokeStyle = 'rgba(160,185,230,.09)'; c.beginPath(); c.moveTo(padL, Math.round(Y(m)) + 0.5); c.lineTo(TW - padR, Math.round(Y(m)) + 0.5); c.stroke();
      if (narrow && m % 2 === 0) continue;
      c.fillStyle = TL_AXIS; c.textAlign = 'right'; c.fillText('M ' + m, padL - 10, Y(m));
    }
    var d0 = new Date(t0); var day = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() + 1);
    c.textAlign = 'left';
    for (; day < t1; day += 864e5) {
      var x = Math.round(X(day)) + 0.5, dd = new Date(day);
      c.strokeStyle = 'rgba(160,185,230,.13)'; c.beginPath(); c.moveTo(x, padT - 4); c.lineTo(x, TH - 4); c.stroke();
      c.fillStyle = TL_AXIS; c.fillText((narrow ? '' : DOW[dd.getUTCDay()].toUpperCase() + ' ') + dd.getUTCDate(), x + 5, TH - 9);
    }
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.moveTo(Math.round(X(t1)) + 0.5, padT - 6); c.lineTo(Math.round(X(t1)) + 0.5, TH - 4); c.stroke();
    c.textAlign = 'right'; c.fillStyle = 'rgba(238,242,248,.9)'; c.fillText(live ? 'NOW' : 'SNAPSHOT', TW - padR - 6, 15);
    for (var i = byMag.length - 1; i >= 0; i--) {
      var q = byMag[i], r = 1.6 + (q.mag - 4.5) * 1.75; q.tx = X(q.t); q.ty = Y(q.mag);
      c.fillStyle = 'rgba(255,96,58,' + (q === sel || q === hover ? 1 : 0.62) + ')'; c.beginPath(); c.arc(q.tx, q.ty, r, 0, TAU); c.fill();
    }
    var marks = [hover, sel];
    for (i = 0; i < 2; i++) {
      q = marks[i]; if (!q || (i === 0 && q === sel)) continue; r = 1.6 + (q.mag - 4.5) * 1.75;
      if (i === 1) { c.strokeStyle = 'rgba(255,106,72,.5)'; c.beginPath(); c.moveTo(Math.round(q.tx) + 0.5, q.ty + r + 3); c.lineTo(Math.round(q.tx) + 0.5, TH - 4); c.stroke(); }
      c.strokeStyle = '#fff'; c.lineWidth = 1.3; c.beginPath(); c.arc(q.tx, q.ty, r + 3.5, 0, TAU); c.stroke(); c.lineWidth = 1;
      var label = 'M ' + q.mag.toFixed(1) + (i === 0 ? ' · ' + (q.place.length > 34 ? q.place.slice(0, 33) + '…' : q.place) : '');
      c.font = '500 10px "Geist Mono",ui-monospace,Menlo,monospace'; if ('letterSpacing' in c) c.letterSpacing = '0.02em';
      var w = c.measureText(label).width, lx = q.tx + r + 9; if (lx + w > TW - padR) lx = q.tx - r - 9 - w;
      c.fillStyle = 'rgba(6,10,18,.85)'; c.fillRect(lx - 4, q.ty - 9, w + 8, 18);
      c.textAlign = 'left'; c.fillStyle = '#fff'; c.fillText(label, lx, q.ty + 0.5);
      c.font = TL_FONT; if ('letterSpacing' in c) c.letterSpacing = '0.08em';
    }
  }
  function tlPick(e) {
    var r = tl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 15 * 15;
    for (var i = 0; i < quakes.length; i++) { var q = quakes[i], d = (q.tx - x) * (q.tx - x) + (q.ty - y) * (q.ty - y); if (d < bd) { bd = d; best = q; } }
    return best;
  }
  if (tl) {
    tl.addEventListener('pointermove', function (e) { var q = tlPick(e); if (q !== hover) { hover = q; tl.style.cursor = q ? 'pointer' : 'crosshair'; drawTimeline(); dirty = true; wake(); } });
    tl.addEventListener('pointerleave', function () { if (hover) { hover = null; drawTimeline(); dirty = true; wake(); } });
    tl.addEventListener('click', function (e) { pickFromUI(tlPick(e)); });
  }

  /* ------------------------------ pointer ------------------------------ */
  function used() { if (!touched) { touched = true; if (el.hint) el.hint.classList.add('off'); } }
  function pick(x, y, thr) {
    var best = null, bs = 1e9;
    for (var i = 0; i < quakes.length; i++) {
      var q = quakes[i]; if (q.dv <= 0.02) continue;
      var d = Math.hypot(q.sx - x, q.sy - y), reachPx = thr + q.mr * scale; if (d > reachPx) continue;
      var sc = d - q.mr * scale * 0.5; if (sc < bs) { bs = sc; best = q; }
    }
    return best;
  }
  var drag = null;
  cv.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button > 0) return;
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: 0, id: e.pointerId, touch: e.pointerType === 'touch' };
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    vel.lon = vel.lat = 0; mode = 'drag'; fly = null; cv.classList.add('drag'); wake();
  });
  cv.addEventListener('pointermove', function (e) {
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag && e.pointerId === drag.id) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y, t = performance.now(), dt = Math.max(0.008, (t - drag.t) / 1000), k = DEG / R;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      rot.lon -= dx * k; if (!drag.touch) rot.lat = Math.max(-78, Math.min(78, rot.lat + dy * k));
      vel.lon = 0.6 * vel.lon + 0.4 * (dx * k / dt); vel.lat = drag.touch ? 0 : 0.6 * vel.lat + 0.4 * (dy * k / dt);
      drag.x = e.clientX; drag.y = e.clientY; drag.t = t; dirty = true;
      if (drag.moved > 6) used();
      return;
    }
    if (e.pointerType === 'touch') return;
    var q = pick(x, y, 9);
    if (q !== hover) { hover = q; cv.classList.toggle('hot', !!q); drawTimeline(); dirty = true; wake(); }
  });
  function release(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag; drag = null; cv.classList.remove('drag');
    if (!cancelled && d.moved < 7) {
      var r = cv.getBoundingClientRect(), q = pick(e.clientX - r.left, e.clientY - r.top, d.touch ? 20 : 11);
      base.lon = rot.lon; base.lat = rot.lat; swayT0 = performance.now(); mode = 'idle';
      if (q) { used(); select(q); }
      return;
    }
    if (performance.now() - d.t > 90) vel.lon = vel.lat = 0;
    vel.lon = Math.max(-400, Math.min(400, vel.lon)); vel.lat = Math.max(-250, Math.min(250, vel.lat));
    mode = reduce ? 'idle' : 'inertia'; base.lon = rot.lon; base.lat = rot.lat; swayT0 = performance.now();
  }
  cv.addEventListener('pointerup', function (e) { release(e, false); });
  cv.addEventListener('pointercancel', function (e) { release(e, true); });
  cv.addEventListener('pointerleave', function () { if (hover && !drag) { hover = null; cv.classList.remove('hot'); drawTimeline(); dirty = true; } });

  /* ------------------------------ stars, life cycle ------------------------------ */
  (function () {
    var st = $('stars'); if (!st) return; var h = '', s = 7;
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    for (var i = 0; i < 110; i++) { var big = rnd() > 0.88; h += '<i style="left:' + (rnd() * 100).toFixed(2) + '%;top:' + (rnd() * 100).toFixed(2) + '%;opacity:' + (0.12 + rnd() * 0.5).toFixed(2) + (big ? ';width:2px;height:2px' : '') + '"></i>'; }
    st.innerHTML = h;
  })();

  if (window.ResizeObserver) new ResizeObserver(function () { layout(); tlLayout(); wake(); }).observe(hero);
  else window.addEventListener('resize', function () { layout(); tlLayout(); wake(); });
  if (window.IntersectionObserver) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) wake(); }, { threshold: 0.02 }).observe(hero);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
  if (mq.addEventListener) mq.addEventListener('change', function (e) { reduce = e.matches; dirty = true; wake(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { dirty = true; drawTimeline(); wake(); });

  layout(); tlLayout(); updateSun(); wake();
  load(true);
  setInterval(updateSun, 60000);
  setInterval(function () { if (!document.hidden) load(false); }, 5 * 60000);
  /* once a minute: ages in the list, the chip, the panel and the strip (the list itself is not rebuilt, so focus stays) */
  setInterval(function () {
    if (!live || document.hidden) return;
    refreshTimes(); flightNote(); drawTimeline(); dirty = true;
    var ag = $('evAgo'); if (ag && sel) ag.textContent = ago(Date.now() - sel.t);
  }, 60000);

  window.__v3dGlobe = {
    select: function (id) { if (byId[id]) select(byId[id]); }, replay: startReplay,
    state: function () { return { live: live, n: quakes.length, sel: sel && sel.id, mode: mode, sun: [SUN.lat, SUN.lon], dots: ND, flight: flightQ && flightQ.id, rp: !!rp, still: still }; },
    /* testing only: pretend the newest earthquake happened `min` minutes ago */
    age: function (min) { if (quakes[0]) { quakes[0].t = Date.now() - min * 60000; ingest(quakes.map(function (q) { return [q.lon, q.lat, q.depth, q.mag, q.t, q.place, q.id]; }), true, Date.now()); } }
  };
})();
