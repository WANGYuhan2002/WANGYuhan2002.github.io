/* Wave models — velocity structures on an nx × ny grid, relative to a background velocity of 1.
   Map views: random blobs, uniform. Cross-sections (top edge = the Earth's surface): folded & faulted
   layers (seeded), sedimentary basin, subduction zone, salt dome.
   Edits (brush stamps, point scatterers) are kept as a list in normalised coordinates, so a scenario
   can be replayed on any grid resolution and shared as a link. */
(function () {
  'use strict';
  var VMIN = 0.5, VMAX = 1.38, VSCAT = 0.35;          /* C·VMAX = 0.69 < 1/√2 keeps the explicit schemes stable */
  var SCALE = { layered: 60, basin: 40, slab: 400, salt: 12 };   /* section width in km (catalogue only) */

  function seeded(s) { return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

  /* ---------- geological cross-sections: X = x/nx (0…1), Z = y/ny (0…1, depth) ---------- */
  function layeredFn(seed) {
    var r = seeded(seed * 7919 + 101), nI = 4 + Math.floor(r() * 2), k;     /* 4–5 interfaces → 5–6 layers */
    var v = [0.6]; for (k = 1; k <= nI; k++) v.push(v[k - 1] + 0.12 + 0.1 * r());   /* velocity grows with depth … */
    var lvz = 1 + Math.floor(r() * (nI - 1)); v[lvz] = Math.max(0.55, v[lvz - 1] - 0.1);   /* … except one low-velocity waveguide */
    var foldA = 0.022 + 0.022 * r(), foldK = 0.8 + 1.4 * r(), foldP = 6.28 * r(), dip = (r() - 0.5) * 0.14;
    var basinX = 0.2 + 0.6 * r(), basinW = 0.1 + 0.08 * r(), basinD = 0.03 + 0.04 * r();
    var z0 = []; for (k = 0; k < nI; k++) z0.push(0.12 + (k + 0.45 + 0.2 * r()) * (0.8 / nI));
    var fX = 0.25 + 0.5 * r(), fDip = (r() < 0.5 ? -1 : 1) * (0.3 + 0.4 * r()), thr = 0.03 + 0.035 * r(), fTop = z0[0] + 0.04;
    return function (X, Z) {
      var hang = (X - (fX + fDip * (Z - 0.5))) * fDip > 0, Zs = Z - (hang && Z > fTop ? thr : 0), L = 0, top = 0;
      for (var k = 0; k < nI; k++) {
        var a = foldA * (1 + 0.15 * k), d = z0[k] + a * Math.sin(6.2832 * foldK * X + foldP + 0.4 * k) + 0.35 * a * Math.sin(6.2832 * 2.3 * foldK * X + 1.7 * k) + dip * (X - 0.5);
        if (k === 0) d += basinD * Math.exp(-Math.pow((X - basinX) / basinW, 2));
        if (Zs > d) { L = k + 1; top = d; }
      }
      return v[L] + 0.12 * (Zs - top);                                        /* gentle gradient inside each layer */
    };
  }
  function basinFn() { return function (X, Z) {
    var depth = 0.4 * Math.exp(-Math.pow(Math.abs(X - 0.55) / 0.25, 3.2));    /* flat-bottomed basin */
    if (Z < depth) { var f = Z / depth; return f < 0.35 ? 0.52 : (f < 0.7 ? 0.62 : 0.74); }
    return 1.08 + 0.25 * Z;
  }; }
  function slabFn() { return function (X, Z) {
    var moho = 0.13 + 0.03 * Math.sin(3 * X), v = Z < moho ? 0.84 + 0.5 * Z : 1.12 + 0.18 * Z;
    var t = X - 0.05, top = 0.08 + 0.3 * t + 0.6 * t * t;
    if (t >= 0 && Z >= top) { var d = Z - top; if (d < 0.02) v = 0.8; else if (d < 0.12) v = 1.36; }
    else if (t > 0.2 && Z < top && Z > moho && Z > top - 0.1) v = Math.min(v, 1.0);
    return v;
  }; }
  function saltFn() { return function (X, Z) {
    var v = 0.66 + 0.64 * Math.floor(Z * 7) / 7, dx = X - 0.5, w = 0.07 + 0.18 * Math.max(0, Z - 0.6);
    if ((Math.abs(dx) < w && Z > 0.3) || Math.pow(dx / 0.19, 2) + Math.pow((Z - 0.3) / 0.09, 2) < 1) v = 1.36;
    return v;
  }; }
  /* checkerboard for the tomography resolution test: ±8 % keeps first arrivals close to straight rays */
  function checkerFn(n, amp) { return function (X, Z) { return 1 + amp * ((Math.floor(X * n) + Math.floor(Z * n * 0.62)) % 2 ? 1 : -1); }; }

  function Model(nx, ny) {
    this.nx = nx; this.ny = ny; this.N = nx * ny;
    this.v = new Float32Array(this.N); this.mask = new Uint8Array(this.N);
    this.preset = 'random'; this.seed = 1; this.edits = []; this.scat = [];
    this.res = Math.max(1, nx / 480);          /* grid refinement relative to the 480-cell reference grid */
  }
  Model.prototype.view = function () { return (this.preset === 'random' || this.preset === 'homogeneous') ? 'map' : 'section'; };
  Model.prototype.eff = function (i) { return this.mask[i] ? VSCAT : this.v[i]; };
  Model.prototype.fill = function (fn) {
    var nx = this.nx, ny = this.ny, v = this.v;
    for (var y = 0; y < ny; y++) { var Z = y / ny; for (var x = 0; x < nx; x++) v[y * nx + x] = Math.min(VMAX, Math.max(VMIN, fn(x / nx, Z))); }
  };
  Model.prototype.setPreset = function (p, seed) {
    this.preset = p; if (seed) this.seed = seed;
    this.edits = []; this.scat = []; this.mask.fill(0);
    var nx = this.nx, ny = this.ny, i;
    if (p === 'random') {
      var rnd = seeded(11), blobs = [];
      for (var k = 0; k < 10; k++) blobs.push([rnd(), rnd() * ny / nx, 0.06 + 0.1 * rnd(), (rnd() < 0.5 ? -1 : 1) * (0.12 + 0.15 * rnd())]);
      for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) {
        var X = x / nx, Y = y / nx, val = 1 + 0.08 * (y / ny - 0.5);
        for (var b = 0; b < blobs.length; b++) { var dx = X - blobs[b][0], dy = Y - blobs[b][1], s = blobs[b][2]; val += blobs[b][3] * Math.exp(-(dx * dx + dy * dy) / (2 * s * s)); }
        this.v[y * nx + x] = Math.min(1.3, Math.max(0.72, val));
      }
    } else if (p === 'layered') this.fill(layeredFn(this.seed));
    else if (p === 'basin') this.fill(basinFn());
    else if (p === 'slab') this.fill(slabFn());
    else if (p === 'salt') this.fill(saltFn());
    else if (p === 'checker') this.fill(checkerFn(6, this.checkAmp || 0.08));
    else for (i = 0; i < this.N; i++) this.v[i] = 1;
  };
  /* brush: inside 0.6 R the velocity becomes the target T; cosine taper to R. Returns the touched box. */
  Model.prototype.stamp = function (cx, cy, R, T, record) {
    var nx = this.nx, ny = this.ny, R2 = Math.ceil(R);
    T = Math.min(VMAX, Math.max(VMIN, T));
    for (var y = cy - R2; y <= cy + R2; y++) { if (y < 1 || y >= ny - 1) continue;
      for (var x = cx - R2; x <= cx + R2; x++) { if (x < 1 || x >= nx - 1) continue;
        var d = Math.hypot(x - cx, y - cy) / R; if (d >= 1) continue;
        var w = d < 0.6 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (d - 0.6) / 0.4), i = y * nx + x;
        this.v[i] += (T - this.v[i]) * w;
      } }
    if (record !== false) this.edits.push([+(cx / nx).toFixed(4), +(cy / nx).toFixed(4), +(R / nx).toFixed(4), +T.toFixed(3)]);
    return [cx - R2, cy - R2, cx + R2, cy + R2];
  };
  Model.prototype.addScatter = function (x, y, record) {
    var nx = this.nx, ny = this.ny, r = Math.max(1, Math.round(this.res)), m = Math.max(3, r + 2);   /* 3 × 3 cells on the 480 grid */
    if (x < m || y < m || x > nx - 1 - m || y > ny - 1 - m || this.scat.length >= 300) return false;
    for (var k = 0; k < this.scat.length; k++) if (Math.abs(this.scat[k][0] - x) + Math.abs(this.scat[k][1] - y) < 3 * r + 1) return false;
    this.scat.push([x, y]);
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) this.mask[(y + dy) * nx + x + dx] = 1;
    return true;
  };
  Model.prototype.clearScatter = function () { this.scat = []; this.mask.fill(0); };
  Model.prototype.serialize = function () {
    var nx = this.nx;
    return { p: this.preset, s: this.seed, e: this.edits.slice(-600), c: this.scat.map(function (q) { return [+(q[0] / nx).toFixed(4), +(q[1] / nx).toFixed(4)]; }) };
  };
  Model.prototype.load = function (o) {
    if (!o) return;
    this.setPreset(o.p || 'random', o.s || 1);
    var nx = this.nx, self = this;
    (o.e || []).forEach(function (e) { self.stamp(Math.round(e[0] * nx), Math.round(e[1] * nx), e[2] * nx, e[3], true); });
    (o.c || []).forEach(function (c) { self.addScatter(Math.round(c[0] * nx), Math.round(c[1] * nx)); });
  };
  /* straight-line travel time through the model (seconds), for expected arrivals */
  Model.prototype.travelTime = function (x0, y0, x1, y1, rate) {
    var L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(L * 2)), t = 0;
    for (var k = 0; k < n; k++) {
      var f = (k + 0.5) / n, x = Math.round(x0 + (x1 - x0) * f), y = Math.round(y0 + (y1 - y0) * f);
      t += (L / n) / (0.5 * this.eff(y * this.nx + x));            /* steps per cell = 1 / (C·v), C = 0.5 */
    }
    return t / rate;
  };

  window.WaveModels = { Model: Model, VMIN: VMIN, VMAX: VMAX, VSCAT: VSCAT, SCALE: SCALE, seeded: seeded };
})();
