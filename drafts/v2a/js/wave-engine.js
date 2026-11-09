/* wave-engine.js — finite-difference wave solvers for the v2a wave lab, with a CPU and a WebGL2 backend.

   ACOUSTIC   ∂²p/∂t² + σ(x)·∂p/∂t = c(x)²·∇²p
              leapfrog in time, 5-point Laplacian (2nd order); p = 0 on the outermost grid line.
   ELASTIC    P-SV velocity–stress on a staggered grid (Virieux 1986), 2nd order in space and time;
              ρ = 1 and λ = μ (a Poisson solid, Vs = Vp/√3). The top edge can be a traction-free surface:
              σzz = 0 on it and σxz antisymmetric about it (stress imaging, Levander 1988).
   UNITS      Δx = 1 cell, Δt = 1 step. Velocity v (model units, background = 1) moves C·v cells per step,
              C = 0.5, and the solver runs 0.5·nx steps per second: at v = 1 a wave crosses the width in 4 s on
              any grid. Stability: C·vmax = 0.69 < 1/√2.
   ABSORBING  a damping layer of width B cells: σΔt = 2α/rate + smax·s², s = 0…1 into the layer. On the 480-cell
              grid the measured acoustic reflection is 0.3 % at normal and 0.7 % at 45° incidence.
              α is a weak interior attenuation (amplitude ∝ e^(−αt)).
   SOURCES    Ricker wavelets or arbitrary sample-by-sample traces (time reversal), added over a 5 × 5 Gaussian
              footprint. Kinds: 0 pressure (acoustic) / explosion (σxx = σzz), 1 shear dislocation (σxz),
              2 vertical force (vz), 3 horizontal force (vx).
   PROBES     bilinear samples after every step: acoustic (p, 0); elastic (−vz, vx) = (up, right).
   API        create({nx, ny, physics, backend, canvasGL, canvas2d}) → engine with
              setModel(model[, rect]) · setBoundary(edges[, alpha]) · setDisplay(pal, reveal) · addSource(o)
              setProbes([[x, y], …]) · step(n) → Float32Array(n·nProbes·2) · clear() · render(o)
              fieldMax() · setTrackMax(on) · readMax() · destroy()                                          */
(function () {
  'use strict';
  var C = 0.5, VSCAT = 0.35, MAXS = 64, PBATCH = 32, THRESH = 0.05;

  /* canvas palettes: "glow" on the dark theme, "ink on paper" on the light theme */
  var PAL = {
    dark: { bg: [7, 10, 16], pos: [79, 216, 232], neg: [255, 122, 92], slow: [235, 88, 64], fast: [64, 132, 255], ink: [238, 243, 246],
      sw: [255, 186, 72], hot: [255, 214, 110], halo: 'rgba(0,0,0,.85)', mix: 0.9, tint: 0.42, faint: 0.07,
      trace: 'rgba(238,243,246,.88)', fill: 'rgba(79,216,232,.45)', tick: 'rgba(255,255,255,.08)', grid: 'rgba(255,255,255,.07)',
      label: '#7c8a95', origin: '255,122,92', panel: '#0b0f17' },
    light: { bg: [243, 245, 247], pos: [11, 120, 148], neg: [217, 71, 47], slow: [217, 71, 47], fast: [47, 111, 214], ink: [16, 29, 39],
      sw: [180, 110, 0], hot: [214, 92, 20], halo: 'rgba(255,255,255,.95)', mix: 0.92, tint: 0.34, faint: 0.06,
      trace: 'rgba(16,29,39,.85)', fill: 'rgba(11,120,148,.3)', tick: 'rgba(16,29,39,.14)', grid: 'rgba(16,29,39,.08)',
      label: '#5d6f7b', origin: '217,71,47', panel: '#eef1f4' }
  };
  /* soft threshold + gamma: weak coda stays invisible, the main pulses keep their shape */
  var LUT = new Float32Array(1025);
  for (var k0 = 0; k0 <= 1024; k0++) { var a0 = Math.max(0, (k0 / 1024 - THRESH) / (1 - THRESH)); LUT[k0] = Math.pow(a0, 0.75); }

  function common(e, o) {
    e.nx = o.nx; e.ny = o.ny; e.N = o.nx * o.ny; e.physics = o.physics === 'elastic' ? 'elastic' : 'acoustic';
    e.rate = 0.5 * o.nx;                                         /* steps per second */
    var sc = Math.max(1, o.nx / 480);                            /* keep the physical wavelength on finer grids */
    e.ppw = (e.physics === 'elastic' ? 28 : 13.2) * sc * (o.fmul ? 1 / o.fmul : 1);   /* cells per P wavelength at v = 1 (elastic: S and Rayleigh waves are √3 shorter) */
    e.f0 = C / e.ppw;                                            /* Ricker peak frequency, cycles per step */
    e.fHz = e.f0 * e.rate;
    e.B = Math.round(36 * sc); e.smax = 0.30 / sc; e.alpha = 0.5;
    e.edges = { top: true, bottom: true, left: true, right: true };
    e.n = 0; e.src = []; e.nP = 0; e.px = new Float32Array(0); e.py = new Float32Array(0);
    e.pal = PAL.dark; e.reveal = false; e.lastMax = 0;
    e.act = { x: new Float32Array(MAXS), y: new Float32Array(MAXS), a: new Float32Array(MAXS), w: new Float32Array(MAXS), k: new Uint8Array(MAXS), n: 0 };
  }
  function sponge(e, x, y) {
    var B = e.B, s = 0, ed = e.edges, nx = e.nx, ny = e.ny;
    if (ed.top && y < B) s = Math.max(s, (B - y) / B);
    if (ed.bottom && ny - 1 - y < B) s = Math.max(s, (B - (ny - 1 - y)) / B);
    if (ed.left && x < B) s = Math.max(s, (B - x) / B);
    if (ed.right && nx - 1 - x < B) s = Math.max(s, (B - (nx - 1 - x)) / B);
    return s;
  }
  function hAt(e, x, y) { var s = sponge(e, x, y); return (2 * e.alpha / e.rate + e.smax * s * s) / 2; }   /* h = σΔt/2 */
  function rectOf(e, r) {
    if (!r) return [0, 0, e.nx - 1, e.ny - 1];
    return [Math.max(0, (r[0] | 0) - 1), Math.max(0, (r[1] | 0) - 1), Math.min(e.nx - 1, (r[2] | 0) + 1), Math.min(e.ny - 1, (r[3] | 0) + 1)];
  }
  /* sources active in the current step → e.act (pruned when finished) */
  function activeSources(e) {
    var A = e.act, n = 0;
    for (var k = e.src.length - 1; k >= 0; k--) {
      var s = e.src[k], t = e.n - s.start, a;
      if (t < 0) continue;
      if (s.trace) { if (t >= s.trace.length) { e.src.splice(k, 1); continue; } a = s.amp * s.trace[t]; }
      else { if (t > 2 * s.n0) { e.src.splice(k, 1); continue; } var q = Math.PI * s.f * (t - s.n0); a = s.amp * (1 - 2 * q * q) * Math.exp(-q * q); }
      if (n < MAXS) { A.x[n] = s.x; A.y[n] = s.y; A.a[n] = a; A.w[n] = s.width; A.k[n] = s.kind; n++; }
    }
    A.n = n; return n;
  }
  function addSource(e, o) {
    var f = e.f0 * (o.fmul || 1), n0 = Math.round(1.2 / f), m = e.physics === 'elastic' ? 2 : 1;
    var s = { x: Math.max(m + 1, Math.min(e.nx - m - 2, Math.round(o.x))), y: Math.max(m + 1, Math.min(e.ny - 3, Math.round(o.y))),
      amp: o.amp == null ? 1 : o.amp, kind: o.kind || 0, width: o.width || 2.2, start: e.n + (o.delay || 0), f: f, n0: n0, trace: o.trace || null };
    e.src.push(s); return s;
  }
  function rgb(c) { return [c[0] / 255, c[1] / 255, c[2] / 255]; }
  function bil(a, nx, ny, x, y) {
    var i0 = Math.floor(x), j0 = Math.floor(y);
    if (i0 < 0) i0 = 0; else if (i0 > nx - 2) i0 = nx - 2;
    if (j0 < 0) j0 = 0; else if (j0 > ny - 2) j0 = ny - 2;
    var fx = x - i0, fy = y - j0; fx = fx < 0 ? 0 : (fx > 1 ? 1 : fx); fy = fy < 0 ? 0 : (fy > 1 ? 1 : fy);
    var i = j0 * nx + i0;
    return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + nx] * (1 - fx) + a[i + nx + 1] * fx) * fy;
  }

  /* ---------- materials, shared by both backends ---------- */
  function acMaterial(e, model, R) {
    var nx = e.nx;
    for (var y = R[1]; y <= R[3]; y++) for (var x = R[0]; x <= R[2]; x++) {
      var i = y * nx + x, v = model.mask[i] ? VSCAT : model.v[i]; e.v[i] = v; e.c2[i] = (C * v) * (C * v);
    }
  }
  function acDamping(e) {
    for (var y = 0; y < e.ny; y++) for (var x = 0; x < e.nx; x++) { var h = hAt(e, x, y), i = y * e.nx + x; e.P[i] = 1 / (1 + h); e.Q[i] = 1 - h; }
  }
  function elMaterial(e, model, R) {
    var nx = e.nx, ny = e.ny, x, y, i;
    for (y = R[1]; y <= R[3]; y++) for (x = R[0]; x <= R[2]; x++) {
      i = y * nx + x; var v = model.mask[i] ? VSCAT : model.v[i], vp = C * v;
      e.v[i] = v; e.L2M[i] = vp * vp; e.MU[i] = vp * vp / 3; e.LAM[i] = vp * vp / 3;
    }
    for (y = Math.max(0, R[1] - 1); y <= R[3]; y++) for (x = Math.max(0, R[0] - 1); x <= R[2]; x++) {   /* μ at σxz points: harmonic mean of 4 */
      var x1 = Math.min(nx - 1, x + 1), y1 = Math.min(ny - 1, y + 1), M = e.MU;
      e.MUxz[y * nx + x] = 4 / (1 / M[y * nx + x] + 1 / M[y * nx + x1] + 1 / M[y1 * nx + x] + 1 / M[y1 * nx + x1]);
    }
  }
  function elDamping(e) { for (var y = 0; y < e.ny; y++) for (var x = 0; x < e.nx; x++) e.D[y * e.nx + x] = Math.exp(-hAt(e, x, y)); }

  /* ---------- CPU background colours (velocity tint + interface lines) ---------- */
  function cpuBackground(e, R) {
    var nx = e.nx, ny = e.ny, pal = e.pal, a = e.reveal ? pal.tint : pal.faint, bg = pal.bg, ink = pal.ink, v = e.v, B = e.bgc;
    for (var y = R[1]; y <= R[3]; y++) for (var x = R[0]; x <= R[2]; x++) {
      var i = y * nx + x, vi = v[i], dv = vi - 1, t = Math.min(1, Math.abs(dv) / 0.4) * a, col = dv < 0 ? pal.slow : pal.fast;
      var r = bg[0] + (col[0] - bg[0]) * t, g = bg[1] + (col[1] - bg[1]) * t, b = bg[2] + (col[2] - bg[2]) * t;
      if (e.reveal && ((x < nx - 1 && Math.abs(v[i + 1] - vi) > 0.06) || (y < ny - 1 && Math.abs(v[i + nx] - vi) > 0.06))) { r += (ink[0] - r) * 0.42; g += (ink[1] - g) * 0.42; b += (ink[2] - b) * 0.42; }
      B[3 * i] = r; B[3 * i + 1] = g; B[3 * i + 2] = b;
    }
  }
  function cpuInit(e, o) {
    var cv = o.canvas2d; cv.width = e.nx; cv.height = e.ny;
    e.canvas = cv; e.ctx = cv.getContext('2d', { alpha: false }); e.img = e.ctx.createImageData(e.nx, e.ny);
    e.bgc = new Uint8ClampedArray(e.N * 3); e.mx = null;
  }

  /* =============================== CPU · acoustic =============================== */
  function CpuAcoustic(o) {
    common(this, o); this.backend = 'cpu'; var N = this.N;
    this.u0 = new Float32Array(N); this.u1 = new Float32Array(N); this.u2 = new Float32Array(N);
    this.c2 = new Float32Array(N).fill(C * C); this.P = new Float32Array(N); this.Q = new Float32Array(N); this.v = new Float32Array(N).fill(1);
    cpuInit(this, o); acDamping(this); cpuBackground(this, rectOf(this));
  }
  var CA = CpuAcoustic.prototype;
  CA.setModel = function (model, r) { var R = rectOf(this, r); acMaterial(this, model, R); cpuBackground(this, R); };
  CA.setBoundary = function (edges, alpha) { if (edges) this.edges = edges; if (alpha != null) this.alpha = alpha; acDamping(this); };
  CA.setDisplay = function (pal, reveal) { this.pal = pal; this.reveal = !!reveal; cpuBackground(this, rectOf(this)); };
  CA.addSource = function (o) { return addSource(this, o); };
  CA.setProbes = function (pts) { this.nP = pts.length; this.px = new Float32Array(pts.map(function (p) { return p[0]; })); this.py = new Float32Array(pts.map(function (p) { return p[1]; })); };
  CA.clear = function () { this.u0.fill(0); this.u1.fill(0); this.u2.fill(0); this.src = []; if (this.mx) this.mx.fill(0); };
  CA.step = function (n) {
    var nx = this.nx, ny = this.ny, nP = this.nP, out = new Float32Array(n * nP * 2), A = this.act;
    for (var s = 0; s < n; s++) {
      var u0 = this.u0, u1 = this.u1, u2 = this.u2, c2 = this.c2, P = this.P, Q = this.Q, x, y, i;
      for (y = 1; y < ny - 1; y++) { i = y * nx + 1; for (x = 1; x < nx - 1; x++, i++) u2[i] = P[i] * (2 * u1[i] - Q[i] * u0[i] + c2[i] * (u1[i - 1] + u1[i + 1] + u1[i - nx] + u1[i + nx] - 4 * u1[i])); }
      var na = activeSources(this);
      for (var k = 0; k < na; k++) for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        x = A.x[k] + dx; y = A.y[k] + dy; if (x < 1 || y < 1 || x > nx - 2 || y > ny - 2) continue;
        u2[y * nx + x] += A.a[k] * Math.exp(-(dx * dx + dy * dy) / A.w[k]);
      }
      this.u0 = u1; this.u1 = u2; this.u2 = u0; this.n++;
      if (this.mx) { var m = this.mx, uu = this.u1; for (i = 0; i < this.N; i++) { var q = uu[i] * uu[i]; if (q > m[i]) m[i] = q; } }
      for (var p = 0, o2 = s * nP * 2; p < nP; p++, o2 += 2) { out[o2] = bil(this.u1, nx, ny, this.px[p], this.py[p]); out[o2 + 1] = 0; }
    }
    return out;
  };
  CA.render = function (o) {
    var d = this.img.data, u = this.u1, N = this.N, bg = this.bgc, pal = this.pal, P0 = pal.pos, N0 = pal.neg, mx = pal.mix, g = o.gain, m = 0, i, j;
    if (o.mode === 'max' && this.mx) {
      var X = this.mx, pk = 0; for (i = 0; i < N; i++) if (X[i] > pk) pk = X[i];
      var gm = (o.gain2 || 1) / Math.sqrt(pk || 1), H = pal.hot;
      for (i = 0, j = 0; i < N; i++, j += 4) { var a = Math.sqrt(X[i]) * gm; if (a > 1) a = 1; var t = LUT[a * 1024 | 0], kk = 1 - t * mx;
        d[j] = bg[3 * i] * kk + H[0] * t; d[j + 1] = bg[3 * i + 1] * kk + H[1] * t; d[j + 2] = bg[3 * i + 2] * kk + H[2] * t; d[j + 3] = 255; }
    } else {
      for (i = 0, j = 0; i < N; i++, j += 4) {
        var w = u[i], aw = w < 0 ? -w : w; if (aw > m) m = aw;
        var v = w * g; if (v > 1) v = 1; else if (v < -1) v = -1;
        var tt = LUT[(v < 0 ? -v : v) * 1024 | 0], k2 = 1 - tt * mx, c = v >= 0 ? P0 : N0;
        d[j] = bg[3 * i] * k2 + c[0] * tt; d[j + 1] = bg[3 * i + 1] * k2 + c[1] * tt; d[j + 2] = bg[3 * i + 2] * k2 + c[2] * tt; d[j + 3] = 255;
      }
      this.lastMax = m;
    }
    this.ctx.putImageData(this.img, 0, 0);
  };
  CA.fieldMax = function () { var m = 0, u = this.u1; for (var i = 0; i < this.N; i++) { var a = u[i] < 0 ? -u[i] : u[i]; if (a > m) m = a; } return m; };
  CA.setTrackMax = function (on) { this.mx = on ? new Float32Array(this.N) : null; };
  CA.readMax = function () { return this.mx ? this.mx.slice() : null; };
  CA.destroy = function () {};

  /* =============================== CPU · elastic =============================== */
  function CpuElastic(o) {
    common(this, o); this.backend = 'cpu'; var N = this.N;
    this.vx = new Float32Array(N); this.vz = new Float32Array(N); this.sxx = new Float32Array(N); this.szz = new Float32Array(N); this.sxz = new Float32Array(N);
    this.v = new Float32Array(N).fill(1); this.L2M = new Float32Array(N).fill(C * C); this.LAM = new Float32Array(N).fill(C * C / 3);
    this.MU = new Float32Array(N).fill(C * C / 3); this.MUxz = new Float32Array(N).fill(C * C / 3); this.D = new Float32Array(N);
    cpuInit(this, o); elDamping(this); cpuBackground(this, rectOf(this));
  }
  var CE = CpuElastic.prototype;
  CE.setModel = function (model, r) { var R = rectOf(this, r); elMaterial(this, model, R); cpuBackground(this, R); };
  CE.setBoundary = function (edges, alpha) { if (edges) this.edges = edges; if (alpha != null) this.alpha = alpha; elDamping(this); };
  CE.setDisplay = CA.setDisplay; CE.addSource = CA.addSource; CE.setProbes = CA.setProbes;
  CE.clear = function () { this.vx.fill(0); this.vz.fill(0); this.sxx.fill(0); this.szz.fill(0); this.sxz.fill(0); this.src = []; };
  CE.step = function (n) {
    var nx = this.nx, ny = this.ny, nP = this.nP, out = new Float32Array(n * nP * 2), A = this.act;
    var vx = this.vx, vz = this.vz, sxx = this.sxx, szz = this.szz, sxz = this.sxz, L2M = this.L2M, LAM = this.LAM, MUxz = this.MUxz, D = this.D;
    var free = !this.edges.top, j0 = free ? 0 : 1, x, y, i, k, dx, dy;
    for (var s = 0; s < n; s++) {
      var na = activeSources(this);
      /* velocities from the stress divergence */
      for (y = j0; y < ny - 1; y++) { i = y * nx + 1; for (x = 1; x < nx - 1; x++, i++) {
        var up = y > 0 ? sxz[i - nx] : -sxz[i];                                   /* σxz image above the free surface */
        vx[i] = (vx[i] + (sxx[i + 1] - sxx[i]) + (sxz[i] - up)) * D[i];
        vz[i] = (vz[i] + (sxz[i] - sxz[i - 1]) + (szz[i + nx] - szz[i])) * D[i];
      } }
      for (k = 0; k < na; k++) if (A.k[k] >= 2) for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) {
        x = A.x[k] + dx; y = A.y[k] + dy; if (x < 1 || y < 1 || x > nx - 2 || y > ny - 2) continue;
        var wf = A.a[k] * Math.exp(-(dx * dx + dy * dy) / A.w[k]); if (A.k[k] === 2) vz[y * nx + x] += wf; else vx[y * nx + x] += wf;
      }
      /* stresses from the velocity gradients */
      for (y = j0; y < ny - 1; y++) { i = y * nx + 1; for (x = 1; x < nx - 1; x++, i++) {
        var dvx = vx[i] - vx[i - 1];
        if (y === 0) { sxx[i] = (sxx[i] + (L2M[i] - LAM[i] * LAM[i] / L2M[i]) * dvx) * D[i]; szz[i] = 0; }   /* σzz = 0 on the surface */
        else { var dvz = vz[i] - vz[i - nx]; sxx[i] = (sxx[i] + L2M[i] * dvx + LAM[i] * dvz) * D[i]; szz[i] = (szz[i] + LAM[i] * dvx + L2M[i] * dvz) * D[i]; }
        sxz[i] = (sxz[i] + MUxz[i] * ((vx[i + nx] - vx[i]) + (vz[i + 1] - vz[i]))) * D[i];
      } }
      for (k = 0; k < na; k++) if (A.k[k] < 2) for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) {
        x = A.x[k] + dx; y = A.y[k] + dy; if (x < 1 || y < 1 || x > nx - 2 || y > ny - 2) continue;
        var wm = A.a[k] * Math.exp(-(dx * dx + dy * dy) / A.w[k]); i = y * nx + x;
        if (A.k[k] === 0) { sxx[i] += wm; if (!(free && y === 0)) szz[i] += wm; } else sxz[i] += wm;
      }
      this.n++;
      for (var p = 0, o2 = s * nP * 2; p < nP; p++, o2 += 2) {
        out[o2] = -bil(vz, nx, ny, this.px[p], this.py[p] - 0.5); out[o2 + 1] = bil(vx, nx, ny, this.px[p] - 0.5, this.py[p]);
      }
    }
    return out;
  };
  CE.render = function (o) {
    var d = this.img.data, nx = this.nx, ny = this.ny, bg = this.bgc, pal = this.pal, P0 = pal.pos, S0 = pal.sw, mx = pal.mix, g = o.gain, g2 = o.gain2 || g;
    var vx = this.vx, vz = this.vz, m = 0;
    for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) {
      var i = y * nx + x, j = 4 * i, r = bg[3 * i], gg = bg[3 * i + 1], b = bg[3 * i + 2];
      if (x > 0 && y > 0 && x < nx - 1 && y < ny - 1) {
        var dv = (vx[i] - vx[i - 1]) + (vz[i] - vz[i - nx]), cu = (vx[i + nx] - vx[i]) - (vz[i + 1] - vz[i]);
        var ad = dv < 0 ? -dv : dv, ac = cu < 0 ? -cu : cu; if (ad > m) m = ad;
        var a = ad * g; if (a > 1) a = 1; var t = LUT[a * 1024 | 0], kk = 1 - t * mx;
        r = r * kk + P0[0] * t; gg = gg * kk + P0[1] * t; b = b * kk + P0[2] * t;
        a = ac * g2; if (a > 1) a = 1; t = LUT[a * 1024 | 0]; kk = 1 - t * mx;
        r = r * kk + S0[0] * t; gg = gg * kk + S0[1] * t; b = b * kk + S0[2] * t;
      }
      d[j] = r; d[j + 1] = gg; d[j + 2] = b; d[j + 3] = 255;
    }
    this.lastMax = m; this.ctx.putImageData(this.img, 0, 0);
  };
  CE.fieldMax = function () { return this.lastMax; };
  CE.setTrackMax = function () {}; CE.readMax = function () { return null; }; CE.destroy = function () {};

  /* =============================== GPU (WebGL2) =============================== */
  var HDR = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';
  var VS = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
  var SRC = 'uniform int uNs;uniform vec4 uSrc[' + MAXS + '];\n';
  var FS = {
    /* acoustic leapfrog step: r = p(t+Δt), g = p(t) */
    ac: HDR + 'uniform sampler2D uS,uM;uniform ivec2 uN;' + SRC + 'out vec4 o;\n' +
      'void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 s=texelFetch(uS,p,0);\n' +
      'if(p.x<1||p.y<1||p.x>uN.x-2||p.y>uN.y-2){o=vec4(0.0,s.r,0.0,1.0);return;}\n' +
      'vec4 m=texelFetch(uM,p,0);\n' +
      'float lap=texelFetch(uS,p+ivec2(1,0),0).r+texelFetch(uS,p-ivec2(1,0),0).r+texelFetch(uS,p+ivec2(0,1),0).r+texelFetch(uS,p-ivec2(0,1),0).r-4.0*s.r;\n' +
      'float un=m.g*(2.0*s.r-m.b*s.g+m.r*lap);vec2 fp=vec2(p);\n' +
      'for(int k=0;k<' + MAXS + ';k++){if(k>=uNs)break;vec4 q=uSrc[k];vec2 d=fp-q.xy;float d2=dot(d,d);if(d2<=8.0)un+=q.z*exp(-d2/mod(q.w,16.0));}\n' +
      'o=vec4(un,s.r,0.0,1.0);}',
    /* elastic: velocities (r = vx at i+½, g = vz at j+½) */
    vel: HDR + 'uniform sampler2D uV,uT,uD;uniform ivec2 uN;uniform int uFree;' + SRC + 'out vec4 o;\n' +
      'void main(){ivec2 p=ivec2(gl_FragCoord.xy);int j0=uFree==1?0:1;\n' +
      'if(p.x<1||p.x>uN.x-2||p.y<j0||p.y>uN.y-2){o=vec4(0.0);return;}\n' +
      'vec2 v=texelFetch(uV,p,0).rg;vec3 t=texelFetch(uT,p,0).rgb;\n' +
      'float up=p.y>0?texelFetch(uT,p-ivec2(0,1),0).b:-t.b;\n' +
      'float vx=v.x+(texelFetch(uT,p+ivec2(1,0),0).r-t.r)+(t.b-up);\n' +
      'float vz=v.y+(t.b-texelFetch(uT,p-ivec2(1,0),0).b)+(texelFetch(uT,p+ivec2(0,1),0).g-t.g);\n' +
      'float d=texelFetch(uD,p,0).r;vx*=d;vz*=d;vec2 fp=vec2(p);\n' +
      'for(int k=0;k<' + MAXS + ';k++){if(k>=uNs)break;vec4 q=uSrc[k];float kd=floor(q.w/16.0);if(kd<1.5)continue;vec2 dd=fp-q.xy;float d2=dot(dd,dd);if(d2>8.0)continue;\n' +
      ' float w=q.z*exp(-d2/mod(q.w,16.0));if(kd<2.5)vz+=w;else vx+=w;}\n' +
      'o=vec4(vx,vz,0.0,1.0);}',
    /* elastic: stresses (r = σxx, g = σzz at i, j; b = σxz at i+½, j+½) */
    str: HDR + 'uniform sampler2D uV,uT,uM,uD;uniform ivec2 uN;uniform int uFree;' + SRC + 'out vec4 o;\n' +
      'void main(){ivec2 p=ivec2(gl_FragCoord.xy);int j0=uFree==1?0:1;\n' +
      'if(p.x<1||p.x>uN.x-2||p.y<j0||p.y>uN.y-2){o=vec4(0.0);return;}\n' +
      'vec4 m=texelFetch(uM,p,0);vec3 t=texelFetch(uT,p,0).rgb;vec2 v=texelFetch(uV,p,0).rg;\n' +
      'float dvx=v.x-texelFetch(uV,p-ivec2(1,0),0).r;float sxx,szz;\n' +
      'if(p.y==0){sxx=t.r+(m.r-m.g*m.g/m.r)*dvx;szz=0.0;}\n' +
      'else{float dvz=v.y-texelFetch(uV,p-ivec2(0,1),0).g;sxx=t.r+m.r*dvx+m.g*dvz;szz=t.g+m.g*dvx+m.r*dvz;}\n' +
      'float sxz=t.b+m.b*((texelFetch(uV,p+ivec2(0,1),0).r-v.x)+(texelFetch(uV,p+ivec2(1,0),0).g-v.y));\n' +
      'float d=texelFetch(uD,p,0).r;sxx*=d;szz*=d;sxz*=d;vec2 fp=vec2(p);\n' +
      'for(int k=0;k<' + MAXS + ';k++){if(k>=uNs)break;vec4 q=uSrc[k];float kd=floor(q.w/16.0);if(kd>1.5)continue;vec2 dd=fp-q.xy;float d2=dot(dd,dd);if(d2>8.0)continue;\n' +
      ' float w=q.z*exp(-d2/mod(q.w,16.0));if(kd<0.5){sxx+=w;szz+=w;}else sxz+=w;}\n' +
      'if(p.y==0)szz=0.0;\n' +
      'o=vec4(sxx,szz,sxz,1.0);}',
    /* divergence (P) and curl (S) of the velocity field, for display */
    dc: HDR + 'uniform sampler2D uV;uniform ivec2 uN;out vec4 o;\n' +
      'void main(){ivec2 p=ivec2(gl_FragCoord.xy);if(p.x<1||p.y<1||p.x>uN.x-2||p.y>uN.y-2){o=vec4(0.0);return;}\n' +
      'vec2 c=texelFetch(uV,p,0).rg;\n' +
      'float dv=(c.x-texelFetch(uV,p-ivec2(1,0),0).r)+(c.y-texelFetch(uV,p-ivec2(0,1),0).g);\n' +
      'float cu=(texelFetch(uV,p+ivec2(0,1),0).r-c.x)-(texelFetch(uV,p+ivec2(1,0),0).g-c.y);\n' +
      'o=vec4(dv,cu,0.0,1.0);}',
    /* running maximum of p² (time-reversal image) */
    mx: HDR + 'uniform sampler2D uS,uX;out vec4 o;\n' +
      'void main(){ivec2 p=ivec2(gl_FragCoord.xy);float u=texelFetch(uS,p,0).r;o=vec4(max(texelFetch(uX,p,0).r,u*u),0.0,0.0,1.0);}',
    /* 8 × 8 block maximum of |r|, |g| */
    red: HDR + 'uniform sampler2D uF;uniform ivec2 uN;out vec4 o;\n' +
      'void main(){ivec2 p=ivec2(gl_FragCoord.xy)*8;vec2 m=vec2(0.0);\n' +
      'for(int j=0;j<8;j++)for(int i=0;i<8;i++){ivec2 q=p+ivec2(i,j);if(q.x<uN.x&&q.y<uN.y)m=max(m,abs(texelFetch(uF,q,0).rg));}\n' +
      'o=vec4(m,0.0,1.0);}',
    /* probes: one fragment per probe, one row per step of the batch */
    probe: HDR + 'uniform sampler2D uF,uP;uniform ivec2 uN;uniform int uEl;out vec4 o;\n' +
      'vec4 bl(vec2 x){ivec2 i=clamp(ivec2(floor(x)),ivec2(0),uN-2);vec2 f=clamp(x-vec2(i),0.0,1.0);\n' +
      ' return mix(mix(texelFetch(uF,i,0),texelFetch(uF,i+ivec2(1,0),0),f.x),mix(texelFetch(uF,i+ivec2(0,1),0),texelFetch(uF,i+ivec2(1,1),0),f.x),f.y);}\n' +
      'void main(){vec2 q=texelFetch(uP,ivec2(int(gl_FragCoord.x),0),0).xy;\n' +
      'if(uEl==0)o=vec4(bl(q).r,0.0,0.0,1.0);else o=vec4(-bl(q-vec2(0.0,0.5)).g,bl(q-vec2(0.5,0.0)).r,0.0,1.0);}',
    /* display: velocity tint + interface lines + wavefield (acoustic ±p, elastic P/S, or the TR image) */
    show: HDR + 'uniform sampler2D uF,uM;uniform ivec2 uN;uniform vec2 uView;uniform int uMode;\n' +
      'uniform vec3 uBg,uPos,uNeg,uSlow,uFast,uInk,uSw;uniform float uGain,uGain2,uMix,uTint,uTh,uReveal;out vec4 o;\n' +
      'vec2 bl(vec2 g){vec2 q=g-0.5;vec2 fl=floor(q);vec2 f=q-fl;ivec2 i=ivec2(fl),lo=ivec2(0),hi=uN-1;\n' +
      ' return mix(mix(texelFetch(uF,clamp(i,lo,hi),0).rg,texelFetch(uF,clamp(i+ivec2(1,0),lo,hi),0).rg,f.x),mix(texelFetch(uF,clamp(i+ivec2(0,1),lo,hi),0).rg,texelFetch(uF,clamp(i+ivec2(1,1),lo,hi),0).rg,f.x),f.y);}\n' +
      'float ramp(float a){return pow(max(0.0,(min(a,1.0)-uTh)/(1.0-uTh)),0.75);}\n' +
      'void main(){vec2 uv=gl_FragCoord.xy/uView;uv.y=1.0-uv.y;vec2 g=uv*vec2(uN);ivec2 c=clamp(ivec2(g),ivec2(0),uN-1);\n' +
      'float v=texelFetch(uM,c,0).a,dv=v-1.0;vec3 col=mix(uBg,dv<0.0?uSlow:uFast,min(1.0,abs(dv)/0.4)*uTint);\n' +
      'if(uReveal>0.5){float vr=texelFetch(uM,min(c+ivec2(1,0),uN-1),0).a,vd=texelFetch(uM,min(c+ivec2(0,1),uN-1),0).a;if(abs(vr-v)>0.06||abs(vd-v)>0.06)col=mix(col,uInk,0.42);}\n' +
      'vec2 f=bl(g);\n' +
      'if(uMode==0){float u=clamp(f.r*uGain,-1.0,1.0);float a=ramp(abs(u));col=col*(1.0-a*uMix)+(u>=0.0?uPos:uNeg)*a;}\n' +
      'else if(uMode==1){float a=ramp(abs(f.r)*uGain);col=col*(1.0-a*uMix)+uPos*a;float b=ramp(abs(f.g)*uGain2);col=col*(1.0-b*uMix)+uSw*b;}\n' +
      'else{float a=ramp(sqrt(max(f.r,0.0))*uGain);col=col*(1.0-a*uMix)+uSw*a;}\n' +
      'o=vec4(col,1.0);}'
  };
  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function programs(gl) {
    var vs = compile(gl, gl.VERTEX_SHADER, VS), out = {};
    Object.keys(FS).forEach(function (k) {
      var p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS[k])); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link ' + k + ': ' + gl.getProgramInfoLog(p));
      var cache = {}; out[k] = { p: p, u: function (n) { return n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n)); } };
    });
    return out;
  }
  function mkTex(gl, w, h, data) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('float framebuffer incomplete');
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t: t, f: f, w: w, h: h };
  }
  function delTex(gl, T) { if (T) { gl.deleteTexture(T.t); gl.deleteFramebuffer(T.f); } }

  function Gpu(o) {
    common(this, o); this.backend = 'gpu';
    var cv = o.canvasGL, gl = cv.__gl || cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 unavailable');
    if (gl.isContextLost && gl.isContextLost()) throw new Error('WebGL context lost');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('float render targets unavailable');
    cv.__gl = gl; this.gl = gl; this.canvas = cv;
    this.prog = gl.__wp || (gl.__wp = programs(gl));
    this.vao = gl.__vao || (gl.__vao = gl.createVertexArray());
    var nx = this.nx, ny = this.ny, N = this.N;
    if (nx > gl.getParameter(gl.MAX_TEXTURE_SIZE) || ny > gl.getParameter(gl.MAX_TEXTURE_SIZE)) throw new Error('grid too large');
    this.v = new Float32Array(N).fill(1);
    if (this.physics === 'elastic') {
      this.V = [mkTex(gl, nx, ny), mkTex(gl, nx, ny)]; this.T = [mkTex(gl, nx, ny), mkTex(gl, nx, ny)]; this.cv = 0; this.ct = 0;
      this.M = mkTex(gl, nx, ny); this.Dt = mkTex(gl, nx, ny); this.DC = mkTex(gl, nx, ny);
      this.L2M = new Float32Array(N).fill(C * C); this.LAM = new Float32Array(N).fill(C * C / 3); this.MU = new Float32Array(N).fill(C * C / 3);
      this.MUxz = new Float32Array(N).fill(C * C / 3); this.D = new Float32Array(N);
    } else {
      this.S = [mkTex(gl, nx, ny), mkTex(gl, nx, ny)]; this.cs = 0; this.M = mkTex(gl, nx, ny);
      this.c2 = new Float32Array(N).fill(C * C); this.P = new Float32Array(N); this.Q = new Float32Array(N);
    }
    this.R1 = mkTex(gl, Math.ceil(nx / 8), Math.ceil(ny / 8)); this.R2 = mkTex(gl, Math.ceil(nx / 64), Math.ceil(ny / 64));
    this.srcBuf = new Float32Array(MAXS * 4); this.X = null; this.PP = null; this.PO = null; this.pCap = 0;
    this.dprCap = o.dprCap || 1.5;
    this.setBoundary(this.edges); this._uploadMat(rectOf(this));
  }
  var G = Gpu.prototype;
  G._draw = function (prog, target, w, h) {
    var gl = this.gl; gl.useProgram(prog.p); gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null); gl.viewport(0, 0, w, h); gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  G._bind = function (prog, name, unit, T) { var gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, T.t); gl.uniform1i(prog.u(name), unit); };
  G._uploadMat = function (R) {
    var gl = this.gl, nx = this.nx, w = R[2] - R[0] + 1, h = R[3] - R[1] + 1, a = new Float32Array(w * h * 4), b = null, el = this.physics === 'elastic';
    if (el) b = new Float32Array(w * h * 4);
    for (var y = R[1]; y <= R[3]; y++) for (var x = R[0]; x <= R[2]; x++) {
      var i = y * nx + x, j = ((y - R[1]) * w + (x - R[0])) * 4;
      if (el) { a[j] = this.L2M[i]; a[j + 1] = this.LAM[i]; a[j + 2] = this.MUxz[i]; a[j + 3] = this.v[i]; b[j] = this.D[i]; }
      else { a[j] = this.c2[i]; a[j + 1] = this.P[i]; a[j + 2] = this.Q[i]; a[j + 3] = this.v[i]; }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.M.t); gl.texSubImage2D(gl.TEXTURE_2D, 0, R[0], R[1], w, h, gl.RGBA, gl.FLOAT, a);
    if (el) { gl.bindTexture(gl.TEXTURE_2D, this.Dt.t); gl.texSubImage2D(gl.TEXTURE_2D, 0, R[0], R[1], w, h, gl.RGBA, gl.FLOAT, b); }
  };
  G.setModel = function (model, r) {
    var R = rectOf(this, r);
    if (this.physics === 'elastic') { elMaterial(this, model, R); R = [Math.max(0, R[0] - 1), Math.max(0, R[1] - 1), R[2], R[3]]; }
    else acMaterial(this, model, R);
    this._uploadMat(R);
  };
  G.setBoundary = function (edges, alpha) {
    if (edges) this.edges = edges; if (alpha != null) this.alpha = alpha;
    if (this.physics === 'elastic') elDamping(this); else acDamping(this);
    this._uploadMat(rectOf(this));
  };
  G.setDisplay = function (pal, reveal) { this.pal = pal; this.reveal = !!reveal; };
  G.addSource = function (o) { return addSource(this, o); };
  G.setProbes = function (pts) {
    var gl = this.gl, n = pts.length; this.nP = n; this.px = new Float32Array(pts.map(function (p) { return p[0]; })); this.py = new Float32Array(pts.map(function (p) { return p[1]; }));
    if (!n) return;
    if (n > this.pCap) { delTex(gl, this.PP); delTex(gl, this.PO); this.pCap = Math.max(n, 16); this.PP = mkTex(gl, this.pCap, 1); this.PO = mkTex(gl, this.pCap, PBATCH); this.rb = new Float32Array(this.pCap * PBATCH * 4); }
    var a = new Float32Array(this.pCap * 4);
    for (var k = 0; k < n; k++) { a[4 * k] = pts[k][0]; a[4 * k + 1] = pts[k][1]; }
    gl.bindTexture(gl.TEXTURE_2D, this.PP.t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.pCap, 1, gl.RGBA, gl.FLOAT, a);
  };
  G.clear = function () {
    var gl = this.gl, L = this.physics === 'elastic' ? this.V.concat(this.T) : this.S.slice();
    if (this.X) L = L.concat(this.X);
    L.forEach(function (T) { gl.bindFramebuffer(gl.FRAMEBUFFER, T.f); gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.src = [];
  };
  G._sources = function (prog) {
    var n = activeSources(this), A = this.act, b = this.srcBuf, gl = this.gl;
    for (var k = 0; k < n; k++) { b[4 * k] = A.x[k]; b[4 * k + 1] = A.y[k]; b[4 * k + 2] = A.a[k]; b[4 * k + 3] = A.w[k] + 16 * A.k[k]; }
    gl.uniform1i(prog.u('uNs'), n); if (n) gl.uniform4fv(prog.u('uSrc'), b);
  };
  G._stepOnce = function () {
    var gl = this.gl, P = this.prog, nx = this.nx, ny = this.ny, pr;
    if (this.physics === 'elastic') {
      var free = this.edges.top ? 0 : 1;
      pr = P.vel; gl.useProgram(pr.p);
      this._bind(pr, 'uV', 0, this.V[this.cv]); this._bind(pr, 'uT', 1, this.T[this.ct]); this._bind(pr, 'uD', 2, this.Dt);
      gl.uniform2i(pr.u('uN'), nx, ny); gl.uniform1i(pr.u('uFree'), free); this._sources(pr);
      this._draw(pr, this.V[1 - this.cv], nx, ny); this.cv = 1 - this.cv;
      pr = P.str; gl.useProgram(pr.p);
      this._bind(pr, 'uV', 0, this.V[this.cv]); this._bind(pr, 'uT', 1, this.T[this.ct]); this._bind(pr, 'uM', 2, this.M); this._bind(pr, 'uD', 3, this.Dt);
      gl.uniform2i(pr.u('uN'), nx, ny); gl.uniform1i(pr.u('uFree'), free);
      var b = this.srcBuf, n = this.act.n; gl.uniform1i(pr.u('uNs'), n); if (n) gl.uniform4fv(pr.u('uSrc'), b);
      this._draw(pr, this.T[1 - this.ct], nx, ny); this.ct = 1 - this.ct;
    } else {
      pr = P.ac; gl.useProgram(pr.p);
      this._bind(pr, 'uS', 0, this.S[this.cs]); this._bind(pr, 'uM', 1, this.M); gl.uniform2i(pr.u('uN'), nx, ny); this._sources(pr);
      this._draw(pr, this.S[1 - this.cs], nx, ny); this.cs = 1 - this.cs;
      if (this.X) {
        pr = P.mx; gl.useProgram(pr.p); this._bind(pr, 'uS', 0, this.S[this.cs]); this._bind(pr, 'uX', 1, this.X[this.cx]);
        this._draw(pr, this.X[1 - this.cx], nx, ny); this.cx = 1 - this.cx;
      }
    }
    this.n++;
  };
  G.step = function (n) {
    var gl = this.gl, nP = this.nP, out = new Float32Array(n * nP * 2), done = 0, el = this.physics === 'elastic';
    while (done < n) {
      var m = Math.min(PBATCH, n - done);
      for (var k = 0; k < m; k++) {
        this._stepOnce();
        if (nP) {
          var pr = this.prog.probe; gl.useProgram(pr.p);
          this._bind(pr, 'uF', 0, el ? this.V[this.cv] : this.S[this.cs]); this._bind(pr, 'uP', 1, this.PP);
          gl.uniform2i(pr.u('uN'), this.nx, this.ny); gl.uniform1i(pr.u('uEl'), el ? 1 : 0);
          gl.bindVertexArray(this.vao); gl.bindFramebuffer(gl.FRAMEBUFFER, this.PO.f); gl.viewport(0, k, nP, 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
      if (nP) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.PO.f);
        gl.readPixels(0, 0, nP, m, gl.RGBA, gl.FLOAT, this.rb);
        for (var r = 0; r < m; r++) for (var p = 0; p < nP; p++) {
          var j = (r * nP + p) * 4, q = ((done + r) * nP + p) * 2; out[q] = this.rb[j]; out[q + 1] = this.rb[j + 1];
        }
      }
      done += m;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  };
  G._fit = function () {
    var cv = this.canvas, d = Math.min(this.dprCap, window.devicePixelRatio || 1), w = Math.max(1, Math.round(cv.clientWidth * d)), h = Math.max(1, Math.round(cv.clientHeight * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  };
  G.render = function (o) {
    var gl = this.gl, P = this.prog, el = this.physics === 'elastic', pal = this.pal, pr, mode = o.mode === 'max' && this.X ? 2 : (el ? 1 : 0), F;
    this._fit();
    if (el) { pr = P.dc; gl.useProgram(pr.p); this._bind(pr, 'uV', 0, this.V[this.cv]); gl.uniform2i(pr.u('uN'), this.nx, this.ny); this._draw(pr, this.DC, this.nx, this.ny); F = this.DC; }
    else F = mode === 2 ? this.X[this.cx] : this.S[this.cs];
    var g = o.gain, g2 = o.gain2 || o.gain;
    if (mode === 2) { var pk = this._reduce(F); g = (o.gain2 || 1) / Math.sqrt(pk || 1); }
    pr = P.show; gl.useProgram(pr.p);
    this._bind(pr, 'uF', 0, F); this._bind(pr, 'uM', 1, this.M);
    gl.uniform2i(pr.u('uN'), this.nx, this.ny); gl.uniform2f(pr.u('uView'), this.canvas.width, this.canvas.height); gl.uniform1i(pr.u('uMode'), mode);
    gl.uniform3fv(pr.u('uBg'), rgb(pal.bg)); gl.uniform3fv(pr.u('uPos'), rgb(pal.pos)); gl.uniform3fv(pr.u('uNeg'), rgb(pal.neg));
    gl.uniform3fv(pr.u('uSlow'), rgb(pal.slow)); gl.uniform3fv(pr.u('uFast'), rgb(pal.fast)); gl.uniform3fv(pr.u('uInk'), rgb(pal.ink));
    gl.uniform3fv(pr.u('uSw'), rgb(mode === 2 ? pal.hot : pal.sw));
    gl.uniform1f(pr.u('uGain'), g); gl.uniform1f(pr.u('uGain2'), g2); gl.uniform1f(pr.u('uMix'), pal.mix);
    gl.uniform1f(pr.u('uTint'), this.reveal ? pal.tint : pal.faint); gl.uniform1f(pr.u('uTh'), THRESH); gl.uniform1f(pr.u('uReveal'), this.reveal ? 1 : 0);
    this._draw(pr, null, this.canvas.width, this.canvas.height);
  };
  G._reduce = function (F) {
    var gl = this.gl, pr = this.prog.red; gl.useProgram(pr.p);
    this._bind(pr, 'uF', 0, F); gl.uniform2i(pr.u('uN'), F.w, F.h); this._draw(pr, this.R1, this.R1.w, this.R1.h);
    this._bind(pr, 'uF', 0, this.R1); gl.uniform2i(pr.u('uN'), this.R1.w, this.R1.h); this._draw(pr, this.R2, this.R2.w, this.R2.h);
    var n = this.R2.w * this.R2.h, buf = this.redBuf || (this.redBuf = new Float32Array(n * 4)), m = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.R2.f); gl.readPixels(0, 0, this.R2.w, this.R2.h, gl.RGBA, gl.FLOAT, buf); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for (var k = 0; k < n; k++) if (buf[4 * k] > m) m = buf[4 * k];
    return m;
  };
  G.fieldMax = function () {
    if (this.physics === 'elastic') return this._reduce(this.DC);
    return this._reduce(this.S[this.cs]);
  };
  G.setTrackMax = function (on) {
    var gl = this.gl;
    if (this.X) { delTex(gl, this.X[0]); delTex(gl, this.X[1]); this.X = null; }
    if (on && this.physics !== 'elastic') { this.X = [mkTex(gl, this.nx, this.ny), mkTex(gl, this.nx, this.ny)]; this.cx = 0; }
  };
  G.readMax = function () {
    if (!this.X) return null;
    var gl = this.gl, N = this.N, buf = new Float32Array(N * 4), out = new Float32Array(N);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.X[this.cx].f); gl.readPixels(0, 0, this.nx, this.ny, gl.RGBA, gl.FLOAT, buf); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for (var i = 0; i < N; i++) out[i] = buf[4 * i];
    return out;
  };
  G.destroy = function () {
    var gl = this.gl, self = this;
    ['S', 'V', 'T', 'X'].forEach(function (k) { if (self[k]) { delTex(gl, self[k][0]); delTex(gl, self[k][1]); } });
    ['M', 'Dt', 'DC', 'R1', 'R2', 'PP', 'PO'].forEach(function (k) { delTex(gl, self[k]); });
  };

  var gpuOK = null;
  function gpuAvailable() {
    if (gpuOK !== null) return gpuOK;
    try {
      var c = document.createElement('canvas'), gl = c.getContext('webgl2');
      gpuOK = !!(gl && gl.getExtension('EXT_color_buffer_float'));
      var l = gl && gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
    } catch (e) { gpuOK = false; }
    return gpuOK;
  }
  function create(o) {
    if (o.backend === 'gpu') { try { return new Gpu(o); } catch (e) { if (window.console) console.warn('[wave-engine] GPU backend unavailable, using the CPU:', e.message); } }
    return o.physics === 'elastic' ? new CpuElastic(o) : new CpuAcoustic(o);
  }
  /* grid size for a backend, physics and canvas width (CSS px) */
  function gridFor(backend, physics, W, H, fine) {
    var nx;
    if (physics === 'elastic') nx = backend === 'gpu' ? (W < 700 ? 400 : (fine ? 960 : 720)) : (W < 700 ? 180 : 300);
    else nx = backend === 'gpu' ? (W < 700 ? (fine ? 560 : 400) : (fine ? 1280 : (W < 1100 ? 720 : 960))) : (W < 700 ? 200 : (W < 1100 ? 400 : 480));
    return { nx: nx, ny: Math.max(Math.round(nx * 0.23), Math.round(nx * H / W)) };
  }

  window.WaveEngine = { create: create, gpuAvailable: gpuAvailable, gridFor: gridFor, PAL: PAL, LUT: LUT, C: C, VSCAT: VSCAT, MAXS: MAXS };
})();
