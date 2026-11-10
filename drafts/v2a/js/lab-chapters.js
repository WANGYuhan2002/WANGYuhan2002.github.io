/* lab-chapters.js — the six Wave Lab experiments. Each one is a small story: numbered steps in the inspector,
   its own receivers and data panel, and a short "what's going on". The shell (lab.js) does everything else. */
(function () {
  'use strict';
  var L = window.Lab, S = L.S, C = L.WE.C;

  /* ---------------- shared bits ---------------- */
  function modelChips(cur, act, opts) {
    act = act || 'preset'; opts = opts || {};
    var h = '';
    if (!opts.noMap) h += '<p class="st-d" style="margin:0 0 .3rem">Map view</p><div class="grid2">' + L.opt(act, 'random', 'Random blobs', cur === 'random') + L.opt(act, 'homogeneous', opts.half ? 'Half-space' : 'Uniform', cur === 'homogeneous') + '</div>';
    else h += '<div class="grid2" style="margin-bottom:4px">' + L.opt(act, 'homogeneous', 'Half-space', cur === 'homogeneous') + '</div>';
    h += '<p class="st-d" style="margin:.55rem 0 .3rem">Cross-sections · top edge = the surface</p><div class="grid2">' +
      L.opt(act, 'layered', 'Folded &amp; faulted layers', cur === 'layered') + L.opt(act, 'basin', 'Sedimentary basin', cur === 'basin') +
      L.opt(act, 'slab', 'Subduction zone', cur === 'slab') + L.opt(act, 'salt', 'Salt dome', cur === 'salt') + '</div>';
    if (cur === 'layered') h += '<div class="btns">' + L.btn('reroll', 'New random layering') + '</div>';
    return h;
  }
  function bcRadios(cur) {
    function r(v, t, s) { return '<label class="radio"><input type="radio" name="bc" id="bc-' + v + '" value="' + v + '"' + (cur === v ? ' checked' : '') + '><span>' + t + '<small>' + s + '</small></span></label>'; }
    return r('absorb', 'Absorbing on all sides', 'a damping layer: waves leave the screen') + r('free', 'Free surface on top', 'p = 0 at the top edge: reflects with reversed polarity') + r('box', 'Reflecting box', 'p = 0 on all edges, no damping layer');
  }
  function pad2(k) { return (k < 9 ? '0' : '') + (k + 1); }
  /* triangles for receivers; labels for the first and last of an array (and all of them when there are few) */
  function stations(ctx, pts, o) {
    o = o || {}; var many = pts.length > 1, s = many ? 5 : 7;
    for (var k = 0; k < pts.length; k++) {
      var p = pts[k], X = L.sx(p.x), Y = Math.max(s * 1.7 + 2, L.sy(p.y));
      L.tri(ctx, X, Y, s, o.alpha || 0.95, o.col);
      if (o.labels !== false && (pts.length <= 4 || k === 0 || k === pts.length - 1)) {
        var ly = Y - s * 1.7 - 5; if (ly < 12) ly = Y + 13;
        L.label(ctx, p.code, X, ly);
      }
    }
  }
  function placeholder(ctx, w, h, s) { L.font(ctx, 11, 400); ctx.fillStyle = L.pal.label; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, w / 2, h / 2); }
  function physicsExplain(extra) {
    var e = L.eng;
    return '<p><b>Equation.</b> The 2-D constant-density acoustic wave equation <code>∂²p/∂t² = c(x, z)² ∇²p</code> for the pressure p. Only P waves exist here; S and surface waves need the elastic solver of experiment 6.</p>' +
      '<p><b>Numerics.</b> Second-order finite differences (leapfrog in time, 5-point Laplacian) on a ' + e.nx + ' × ' + e.ny + ' grid, computed live ' + (e.backend === 'gpu' ? 'on your GPU (WebGL2 fragment shaders on 32-bit float textures)' : 'on your CPU (typed arrays)') +
      '. Courant number c·Δt/Δx ≤ 0.69 &lt; 1/√2 and ' + Math.round(e.ppw) + ' grid points per dominant wavelength at v = 1. Sources are Ricker wavelets with a peak frequency of ' + L.fmt(e.fHz, 1) + ' Hz.</p>' +
      '<p><b>Units.</b> The model is ' + L.KM + ' km wide; v = 1 means 2.5 km/s, and a wave at v = 1 crosses the width in 4 s.</p>' + (extra || '');
  }
  var bcExplain = '<p><b>Boundaries.</b> The outermost grid line holds p = 0. Absorbing edges add a layer in which the equation gains a damping term σ·∂p/∂t that ramps up quadratically, so outgoing waves fade instead of bouncing back (measured reflection 0.3 % at normal and 0.7 % at 45° incidence). A free surface keeps p = 0 without the layer: waves reflect with reversed polarity. A reflecting box removes the layer everywhere.</p>';

  /* ======================================================================================
     1 · PLAYGROUND
     ====================================================================================== */
  var MAXSTA = 12;
  L.register({
    id: 'play', title: 'Playground', physics: 'acoustic',
    goal: 'Build a medium, then shake it. Every click is an acoustic source, every edit changes how the waves travel, and the stations you place record what arrives.',
    tools: ['quake', '|', 'slow', 'fast', 'erase', 'scatter', '|', 'station'],
    shareWhat: 'the model, your edits, the boundaries and your stations',
    st: { m: null, sta: null, bc: 'absorb', agc: false, autoFree: false, did: {} },
    enter: function () {
      var st = this.st, pts;
      if (st.m) L.model.load(st.m); else L.model.setPreset('random');
      L.setModel(); L.setBC(st.bc);
      if (st.sta && st.sta.length) pts = st.sta.map(function (q) { var p = L.fromN(q, 3); return { x: p[0], y: p[1], code: q[2] || 'YW01' }; });
      else { var p0 = L.clampIn(L.nx * 0.78, L.ny * 0.56, 3); pts = [{ x: p0[0], y: p0[1], code: 'YW01' }]; }
      this.rec = new L.Rec(pts, L.TR); this.probes(); this.head(); this.auto = performance.now();
      if (!st.did.quake) setTimeout(function () { if (S.ch === 'play' && L.eng) L.quake(Math.round(L.nx * 0.42), Math.round(L.ny * 0.38), { mag: 2.9, sound: false }); }, 350);
    },
    probes: function () { L.setProbes(this.rec.pts.map(function (p) { return [p.x, p.y]; })); },
    head: function () {
      var n = this.rec.n;
      L.setData((n === 1 ? 'Station <b>' + this.rec.pts[0].code + '</b>' : '<b>' + n + '</b> stations') + ' · pressure p(t) · last 6 s', L.seg('agc', [['0', 'True amplitude'], ['1', 'AGC 0.5 s']], this.st.agc ? '1' : '0', 'sm'));
    },
    save: function () { this.st.m = L.model.serialize(); this.st.sta = this.rec.pts.map(function (p) { var q = L.toN([p.x, p.y]); return [q[0], q[1], p.code]; }); },
    serialize: function () { var st = this.st; return { m: st.m, sta: st.sta, bc: st.bc, agc: st.agc ? 1 : 0 }; },
    load: function (o) {
      var st = this.st; st.m = o.m || null; st.bc = o.bc || 'absorb'; st.agc = !!o.agc; st.did = { model: true };
      st.sta = Array.isArray(o.sta) && Array.isArray(o.sta[0]) ? o.sta : (o.sta ? [[o.sta[0], o.sta[1], 'YW01']] : null);   /* older links held one station */
    },
    steps: function () {
      var st = this.st, d = st.did;
      return [
        { t: 'Pick a starting model', d: 'A map view, or a geological cross-section whose top edge is the Earth’s surface.', c: modelChips(L.model.preset), done: !!(d.model || d.edit || d.sta || d.bc) },   /* moving on counts as a choice */
        { t: 'Shape the medium', d: 'With the tools above the field: paint <b>slow</b> (S) or <b>fast</b> (F) bodies, <b>erase</b> (E), or drop point <b>scatterers</b> (C). Click a tool again for its options.', c: '<div class="btns">' + L.btn('sprinkle', 'Sprinkle 30 scatterers') + L.btn('resetEdits', 'Undo all edits') + '</div>', done: !!d.edit },
        { t: 'Place your stations', d: 'With the station tool (T), click to add up to ' + MAXSTA + ' stations; drag any station to move it, double-click to remove it. With more than one, the panel below becomes a record section.', c: '<div class="btns">' + L.btn('oneSta', 'Back to one station', '', this.rec && this.rec.n === 1) + '</div>', done: !!d.sta },
        { t: 'Make an earthquake', d: 'Click anywhere with the earthquake tool (Q): an acoustic point source, a Ricker pulse of pressure. Its options set the magnitude and the peak frequency.', done: !!d.quake },
        { t: 'Change the boundaries', c: bcRadios(st.bc), done: !!d.bc }
      ];
    },
    explain: function () { return physicsExplain(bcExplain + '<p><b>Receivers</b> sample p(t) at their positions every time step (bilinear interpolation). <b>Not physical:</b> magnitudes only scale the source amplitude.</p>'); },
    act: function (a, v) {
      if (a === 'preset') this.choose(v);
      else if (a === 'reroll') this.choose('layered', 2 + Math.floor(Math.random() * 1e6));
      else if (a === 'resetEdits') { L.model.setPreset(L.model.preset, L.model.seed); L.setModel(); }
      else if (a === 'agc') { this.st.agc = v === '1'; this.head(); }
      else if (a === 'oneSta') { var p = this.rec.pts[0]; this.rec = this.rec.remap([{ x: p.x, y: p.y, code: p.code }], [0]); this.probes(); this.head(); L.refresh(); }
    },
    choose: function (p, seed) {
      var st = this.st; L.model.setPreset(p, seed || L.model.seed); L.setModel(); st.did.model = true;
      if (L.model.view() === 'section') { if (st.bc === 'absorb') { st.bc = 'free'; st.autoFree = true; L.setBC('free'); } }
      else if (st.autoFree && st.bc === 'free') { st.bc = 'absorb'; st.autoFree = false; L.setBC('absorb'); }
      L.refresh();
    },
    input: function (id, v) { if (id.indexOf('bc-') === 0) { var st = this.st; st.bc = v; st.autoFree = false; L.setBC(v); st.did.bc = true; L.refresh(); } },
    onEdit: function () { if (!this.st.did.edit) { this.st.did.edit = true; L.refresh(); } },
    onQuake: function () { if (!this.st.did.quake) { this.st.did.quake = true; L.refresh(); } },
    toolOptions: function (t) {
      if (t === 'station') return '<p>Click to add a station (up to ' + MAXSTA + '). Drag any station to move it; double-click one to remove it.</p><div class="btns">' + L.btn('oneSta', 'Back to one station') + '</div>';
      return null;
    },
    down: function (c) {
      if (S.tool !== 'station') return false;
      var pts = this.rec.pts;
      if (pts.length >= MAXSTA) { L.toast('Up to ' + MAXSTA + ' stations: drag one, or double-click to remove it'); return true; }
      var used = pts.map(function (p) { return p.code; }), code = 'YW01';
      for (var k = 1; k < 100; k++) { code = 'YW' + (k < 10 ? '0' : '') + k; if (used.indexOf(code) < 0) break; }
      var q = L.clampIn(c[0], c[1], 2), np = pts.map(function (p) { return { x: p.x, y: p.y, code: p.code }; }).concat([{ x: q[0], y: q[1], code: code }]);
      this.rec = this.rec.remap(np, np.map(function (p, i) { return i < pts.length ? i : -1; }));
      this.probes(); this.head();
      if (!this.st.did.sta) { this.st.did.sta = true; L.refresh(); } else L.refresh();
      return true;
    },
    handles: function () { return this.rec.pts.map(function (r, i) { return { x: r.x, y: r.y, id: i, dy: -8 }; }); },
    moveHandle: function (id, c) { var r = this.rec.pts[id]; r.x = c[0]; r.y = c[1]; this.probes(); if (!this.st.did.sta) { this.st.did.sta = true; } },
    dropHandle: function () { L.refresh(); },
    removeHandle: function (id) {
      var pts = this.rec.pts; if (pts.length <= 1) return;
      var keep = [], np = [];
      pts.forEach(function (p, i) { if (i !== id) { np.push({ x: p.x, y: p.y, code: p.code }); keep.push(i); } });
      this.rec = this.rec.remap(np, keep); this.probes(); this.head(); L.refresh();
    },
    onSamples: function (b, n, nP) { this.rec.push(b, n, nP, 0); },
    tick: function () {
      var now = performance.now();
      if (!L.reduceMotion && !S.paused && !L.dragging() && S.tool === 'quake' && now - L.lastUser > 12000 && now - this.auto > 9000) {
        this.auto = now; L.quake(Math.round(L.nx * (0.3 + 0.6 * Math.random())), Math.round(L.ny * (0.15 + 0.6 * Math.random())), { mag: +(1.6 + Math.random() * 0.8).toFixed(1), sound: false });
      }
    },
    overlay: function (ctx) { stations(ctx, this.rec.pts); },
    data: function (ctx, w, h) {
      var many = this.rec.n > 1;
      L.drawSection(ctx, 14, 4, w - 28, h - 24, this.rec, { agc: this.st.agc, marks: L.marks, now: L.eng.n });
      L.timeAxis(ctx, many ? 52 : 14, h - 20, many ? w - 66 : w - 28, 6, this.rec.len, L.eng.n);
    },
    csv: function () { return L.recCSV(this.rec, ['p'], 'pressure, arbitrary units'); }
  });

  /* ======================================================================================
     2 · ARRAYS & DAS
     ====================================================================================== */
  function resample(poly, ds) {
    var out = [[poly[0][0], poly[0][1]]], carry = 0;
    for (var k = 1; k < poly.length; k++) {
      var ax = poly[k - 1][0], ay = poly[k - 1][1], bx = poly[k][0], by = poly[k][1], len = Math.hypot(bx - ax, by - ay), t = ds - carry;
      if (len < 1e-9) continue;
      while (t <= len) { out.push([ax + (bx - ax) * t / len, ay + (by - ay) * t / len]); t += ds; }
      carry = len - (t - ds);
    }
    return out;
  }
  function smooth(poly, w) {
    if (poly.length < 3) return poly;
    return poly.map(function (p, i) { var sx = 0, sy = 0, n = 0; for (var k = Math.max(0, i - w); k <= Math.min(poly.length - 1, i + w); k++) { sx += poly[k][0]; sy += poly[k][1]; n++; } return i === 0 || i === poly.length - 1 ? p : [sx / n, sy / n]; });
  }
  /* DAS: the cable is sampled every grid cell. Acoustic medium (ρ = 1): ∂v_t/∂t = −∂p/∂s along the cable gives the
     tangential particle velocity (leaky time integration); the axial strain rate over a gauge length G is
     ε̇ = [v_t(s + G/2) − v_t(s − G/2)] / G. */
  function Das(poly, gauge, len) {
    var pts = resample(poly, 1); this.pts = pts; this.np = pts.length;
    this.g = Math.max(1, Math.round(gauge / 2)); this.vt = new Float32Array(this.np);
    var stride = Math.max(1, Math.round(this.np / 160)); this.ch = [];
    for (var i = this.g + 1; i < this.np - this.g - 1; i += stride) this.ch.push(i);
    this.nc = this.ch.length; this.len = len; this.buf = new Float32Array(Math.max(1, this.nc) * len); this.head = 0; this.count = 0; this.peak = 0;
    this.leak = Math.exp(-1 / (0.3 * L.rate));                       /* leaky integration, time constant 0.3 s: a high-pass far below the 9-Hz signal */
  }
  Das.prototype.push = function (block, n, nP, off) {
    var np = this.np, vt = this.vt, g = this.g, ch = this.ch, nc = this.nc, len = this.len, buf = this.buf;
    for (var s = 0; s < n; s++) {
      var b = (s * nP + off) * 2;
      for (var i = 1; i < np - 1; i++) vt[i] = vt[i] * this.leak - 0.5 * (block[b + 2 * (i + 1)] - block[b + 2 * (i - 1)]);
      for (var c = 0; c < nc; c++) { var j = ch[c]; buf[c * len + this.head] = (vt[j + g] - vt[j - g]) / (2 * g); }
      this.head = (this.head + 1) % len;
    }
    this.count += n;
  };
  var wf = { cv: null, img: null };
  function drawWaterfall(ctx, X, Y, w, h, das, perCh) {
    var nc = das.nc, len = das.len, cols = Math.max(2, Math.min(len, Math.round(w))), c, k;
    if (!nc) return;
    if (!wf.cv || wf.cv.width !== cols || wf.cv.height !== nc) { wf.cv = document.createElement('canvas'); wf.cv.width = cols; wf.cv.height = nc; wf.img = wf.cv.getContext('2d').createImageData(cols, nc); }
    var d = wf.img.data, buf = das.buf, pk = 0;
    for (k = 0; k < buf.length; k++) { var a = buf[k] < 0 ? -buf[k] : buf[k]; if (a > pk) pk = a; }
    das.peak = Math.max(pk, das.peak * 0.99, 1e-12);
    var bin = len / cols;
    for (c = 0; c < nc; c++) {
      var base = c * len, cp = das.peak;
      if (perCh) { cp = 1e-12; for (k = 0; k < len; k++) { var q = buf[base + k] < 0 ? -buf[base + k] : buf[base + k]; if (q > cp) cp = q; } }
      for (var col = 0; col < cols; col++) {
        var i0 = Math.floor(col * bin), i1 = Math.max(i0 + 1, Math.floor((col + 1) * bin)), best = 0;
        for (k = i0; k < i1; k++) { var v = buf[base + (das.head + k) % len]; if ((v < 0 ? -v : v) > (best < 0 ? -best : best)) best = v; }
        var rgb = L.div(best / (0.75 * cp)), j = 4 * (c * cols + col);
        d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; d[j + 3] = 255;
      }
    }
    wf.cv.getContext('2d').putImageData(wf.img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(wf.cv, X, Y, w, h);
    ctx.strokeStyle = L.pal.tick; ctx.strokeRect(X + 0.5, Y + 0.5, w - 1, h - 1);
  }
  L.register({
    id: 'arrays', title: 'Arrays & DAS', physics: 'acoustic',
    goal: 'Record the same wavefield in two ways: with a line of seismometers, or with a fibre-optic cable that turns every few metres of glass into a strain sensor.',
    tools: ['quake', '|', 'line', 'ring', 'fiber'],
    shareWhat: 'the model, the array or the cable you laid out',
    st: { m: null, sensor: 'array', n: 16, arr: null, fib: null, gauge: 10, perCh: false, agc: false, did: {} },
    enter: function () {
      var st = this.st;
      if (st.m) L.model.load(st.m); else L.model.setPreset('layered', 4);
      L.setModel(); L.setBC('free');
      if (!st.arr) st.arr = this.presetArr('surface');
      if (!st.fib) st.fib = this.presetFib('surface');
      this.apply();
    },
    presetArr: function (k) {
      var d = 6 * L.res, m = L.eng.B + 4;                                     /* stay out of the absorbing layers */
      return k === 'borehole' ? { g: 'line', a: L.toN([L.nx * 0.72, 8 * L.res]), b: L.toN([L.nx * 0.72, L.ny - m]) } : { g: 'line', a: L.toN([m, d]), b: L.toN([L.nx - 1 - m, d]) };
    },
    presetFib: function (k) {
      var d = 4 * L.res, nx = L.nx, ny = L.ny, m = L.eng.B + 4, P;
      if (k === 'borehole') P = [[nx * 0.72, d], [nx * 0.72, ny - m]];
      else if (k === 'L') P = [[m, d], [nx * 0.62, d], [nx * 0.62, ny - m]];
      else if (k === 'loop') { P = []; var R = Math.min(0.3 * ny, ny / 2 - m); for (var i = 0; i <= 72; i++) { var a = i / 72 * 6.2832; P.push([nx * 0.5 + R * Math.cos(a), ny * 0.5 + R * Math.sin(a)]); } }
      else P = [[m, d], [nx - 1 - m, d]];
      return P.map(L.toN);
    },
    positions: function (g, n) {
      var a = L.fromN(g.a, 1), b = L.fromN(g.b, 1), out = [], k;
      if (g.g === 'line') for (k = 0; k < n; k++) { var f = n > 1 ? k / (n - 1) : 0; out.push(L.clampIn(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 1)); }
      else { var r = Math.hypot(b[0] - a[0], b[1] - a[1]); for (k = 0; k < n; k++) { var an = -Math.PI / 2 + 2 * Math.PI * k / n; out.push(L.clampIn(a[0] + r * Math.cos(an), a[1] + r * Math.sin(an), 1)); } }
      return out;
    },
    apply: function () {
      var st = this.st;
      if (st.sensor === 'array') {
        var pre = st.arr.g === 'line' ? 'L' : 'R';
        this.rec = new L.Rec(this.positions(st.arr, st.n).map(function (p, k) { return { x: p[0], y: p[1], code: pre + pad2(k) }; }), L.TR);
        this.das = null; L.setProbes(this.rec.pts.map(function (p) { return [p.x, p.y]; }));
      } else {
        var poly = st.fib.map(function (p) { return [p[0] * L.nx, Math.min(L.ny - 2, p[1] * L.nx)]; });
        this.das = new Das(poly, st.gauge * L.res, L.TR); this.rec = null;
        L.setProbes(this.das.pts);
      }
      this.head(); L.updateLegend();
    },
    head: function () {
      var st = this.st;
      if (st.sensor === 'array') L.setData((st.arr.g === 'line' ? 'Line' : 'Ring') + ' array · <b>' + st.n + '</b> stations · pressure · last 6 s', L.seg('agc', [['0', 'True amplitude'], ['1', 'AGC 0.5 s']], st.agc ? '1' : '0', 'sm'));
      else L.setData('DAS · axial strain rate · <b>' + this.das.nc + '</b> channels over ' + L.fmt(L.km(this.das.np - 1), 1) + ' km · gauge ' + L.fmt(L.km(2 * this.das.g), 2) + ' km · last 6 s', L.seg('perch', [['0', 'Common scale'], ['1', 'Per channel']], st.perCh ? '1' : '0', 'sm'));
    },
    save: function () { this.st.m = L.model.serialize(); },
    serialize: function () { var st = this.st; return { m: st.m, sensor: st.sensor, n: st.n, arr: st.arr, fib: st.fib, gauge: st.gauge }; },
    load: function (o) { var st = this.st; st.m = o.m || null; st.sensor = o.sensor === 'fiber' ? 'fiber' : 'array'; st.n = o.n || 16; st.arr = o.arr || null; st.fib = o.fib || null; st.gauge = o.gauge || 10; st.did = { sensor: true, layout: true }; },
    steps: function () {
      var st = this.st, d = st.did, arr = st.sensor === 'array';
      var lay = arr ? '<p class="st-d" style="margin:0">Drag across the wavefield with <b>Line</b> (L: first to last station) or <b>Ring</b> (O: centre outwards).</p>' + L.range('nSta', 'Stations', 4, 48, 1, st.n, st.n) +
        '<div class="btns">' + L.btn('arrPre', 'Along the surface', '', false, 'surface') + L.btn('arrPre', 'Vertical borehole', '', false, 'borehole') + '</div>'
        : '<p class="st-d" style="margin:0">Draw the cable with the fibre tool (D), or pick a layout:</p><div class="grid2" style="margin-top:.4rem">' + L.opt('fibPre', 'surface', 'Along the surface') + L.opt('fibPre', 'borehole', 'Down a borehole') + L.opt('fibPre', 'L', 'L-shaped') + L.opt('fibPre', 'loop', 'A loop') + '</div>' +
          L.range('gauge', 'Gauge length', 4, 24, 1, st.gauge, L.fmt(st.gauge / 480 * L.KM, 2) + ' km');
      return [
        { t: 'Choose a sensor', c: L.seg('sensor', [['array', 'Seismometers'], ['fiber', 'DAS fibre']], st.sensor), done: !!d.sensor },
        { t: arr ? 'Lay out the array' : 'Lay the cable', c: lay, done: !!d.layout },
        { t: 'Make an earthquake', d: 'Click on the wavefield (Q).', c: '<div class="btns">' + L.btn('repeat', 'Repeat the last quake', '', !L.marks.length) + '</div>', done: !!d.quake },
        { t: 'Compare the two records', d: 'Fire the same quake for both sensors. Each arrival is a band across the record; its slope is the apparent slowness 1/v<sub>app</sub>, so steep bands are slow waves. The fibre only feels strain <b>along</b> the cable: a wave that hits it broadside leaves almost no trace.', done: !!(d.qa && d.qf) }
      ];
    },
    explain: function () {
      return '<p><b>Seismometers</b> record the pressure p at a point. A line of them is a record section: distance on one axis, time on the other.</p>' +
        '<p><b>DAS</b> (distributed acoustic sensing) sends laser pulses down an optical fibre and measures the Rayleigh back-scatter from tiny flaws in the glass. Changes in the phase of the back-scattered light give the <b>axial strain rate</b> of the cable averaged over a gauge length G, every few metres along tens of kilometres of fibre.</p>' +
        '<p><b>Here:</b> the cable is sampled every grid cell. In an acoustic medium (ρ = 1) the tangential particle velocity follows ∂v<sub>t</sub>/∂t = −∂p/∂s along the cable, and the strain rate is <code>ε̇ = [v<sub>t</sub>(s + G/2) − v<sub>t</sub>(s − G/2)] / G</code>. For a plane P wave arriving at angle θ to the cable, ε̇ ∝ cos²θ: maximal along the cable, zero broadside.</p>' + physicsExplain();
    },
    act: function (a, v) {
      var st = this.st;
      if (a === 'sensor') { if (st.sensor !== v) { st.sensor = v; st.did.sensor = true; this.apply(); if (!this.fromTool) L.selectTool(v === 'fiber' ? 'fiber' : 'line'); L.refresh(); } }
      else if (a === 'arrPre') { st.arr = this.presetArr(v); st.sensor = 'array'; st.did.layout = true; this.apply(); L.refresh(); }
      else if (a === 'fibPre') { st.fib = this.presetFib(v); st.sensor = 'fiber'; st.did.layout = true; this.apply(); L.refresh(); }
      else if (a === 'repeat') { var m = L.marks[L.marks.length - 1]; if (m) { L.quake(m.x, m.y, { mag: m.M }); this.onQuake(); } }
      else if (a === 'agc') { st.agc = v === '1'; this.head(); }
      else if (a === 'perch') { st.perCh = v === '1'; this.head(); }
    },
    input: function (id, v) {
      var st = this.st, o = document.getElementById(id + 'o');
      if (id === 'nSta') { st.n = +v; if (o) o.textContent = v; if (st.sensor === 'array') this.apply(); }
      else if (id === 'gauge') { st.gauge = +v; if (o) o.textContent = L.fmt(st.gauge / 480 * L.KM, 2) + ' km'; if (st.sensor === 'fiber') this.apply(); }
    },
    cta: function () { return { label: 'Repeat the last quake', act: 'repeat', disabled: !L.marks.length }; },
    onQuake: function () { var d = this.st.did, f = false; if (!d.quake) { d.quake = true; f = true; } if (this.st.sensor === 'array' && !d.qa) { d.qa = true; f = true; } if (this.st.sensor === 'fiber' && !d.qf) { d.qf = true; f = true; } if (f) L.refresh(); },
    onTool: function (t) { this.fromTool = true; if ((t === 'line' || t === 'ring') && this.st.sensor !== 'array') this.act('sensor', 'array'); if (t === 'fiber' && this.st.sensor !== 'fiber') this.act('sensor', 'fiber'); this.fromTool = false; },
    toolOptions: function (t) {
      if (t === 'line') return '<p>Drag from the first to the last station. Station count is set in step 2.</p>';
      if (t === 'ring') return '<p>Drag from the centre of the ring outwards.</p>';
      if (t === 'fiber') return '<p>Press and draw the cable’s path. Release to start recording; the start of the cable is channel 0.</p>';
      return null;
    },
    down: function (c) {
      var t = S.tool;
      if (t === 'line' || t === 'ring') { this.drag = { g: t, a: c, b: c }; return true; }
      if (t === 'fiber') { this.drawing = [c]; return true; }
      return false;
    },
    move: function (c) {
      if (this.drag) this.drag.b = c;
      else if (this.drawing) { var l = this.drawing[this.drawing.length - 1]; if (Math.hypot(c[0] - l[0], c[1] - l[1]) >= 2) this.drawing.push(L.clampIn(c[0], c[1], 2)); }
    },
    up: function () {
      var st = this.st;
      if (this.drag) {
        var g = this.drag; this.drag = null;
        if (Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) >= 6) { st.arr = { g: g.g, a: L.toN(g.a), b: L.toN(g.b) }; st.sensor = 'array'; st.did.layout = true; this.apply(); L.refresh(); }
      } else if (this.drawing) {
        var P = this.drawing, len = 0; this.drawing = null;
        for (var k = 1; k < P.length; k++) len += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
        if (len >= 20) { st.fib = smooth(P, 2).map(L.toN); st.sensor = 'fiber'; st.did.layout = true; this.apply(); L.refresh(); }
        else L.toast('Draw a longer cable');
      }
    },
    onSamples: function (b, n, nP) { if (this.rec) this.rec.push(b, n, nP, 0); else if (this.das) this.das.push(b, n, nP, 0); },
    overlay: function (ctx) {
      var pal = L.pal, k;
      if (this.das) {
        var P = this.das.pts; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); for (k = 0; k < P.length; k++) { var X = L.sx(P[k][0]), Y = Math.max(2, L.sy(P[k][1])); if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
        ctx.strokeStyle = pal.halo; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = L.rgba(pal.pos, 0.95); ctx.lineWidth = 2.2; ctx.stroke();
        var step = Math.round(L.nx / L.KM);                                   /* a tick every km */
        for (k = step; k < P.length; k += step) { ctx.beginPath(); ctx.arc(L.sx(P[k][0]), Math.max(2, L.sy(P[k][1])), 2.4, 0, 6.2832); ctx.fillStyle = L.rgba(pal.ink, 0.9); ctx.fill(); }
        ctx.beginPath(); ctx.arc(L.sx(P[0][0]), Math.max(2, L.sy(P[0][1])), 4, 0, 6.2832); ctx.fillStyle = L.rgba(pal.pos, 1); ctx.fill();
        var ly = L.sy(P[0][1]) < 24 ? L.sy(P[0][1]) + 18 : L.sy(P[0][1]) - 9; L.label(ctx, '0 km', L.sx(P[0][0]) + 4, ly, 'left');
      } else if (this.rec) stations(ctx, this.rec.pts);
      if (this.drag) {
        var g = this.drag; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = L.rgba(pal.pos, 0.85); ctx.beginPath();
        if (g.g === 'line') { ctx.moveTo(L.sx(g.a[0]), L.sy(g.a[1])); ctx.lineTo(L.sx(g.b[0]), L.sy(g.b[1])); }
        else ctx.arc(L.sx(g.a[0]), L.sy(g.a[1]), Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) / L.nx * L.W, 0, 6.2832);
        ctx.stroke(); ctx.setLineDash([]);
        this.positions({ g: g.g, a: L.toN(g.a), b: L.toN(g.b) }, this.st.n).forEach(function (p) { L.tri(ctx, L.sx(p[0]), L.sy(p[1]), 5, 0.55); });
      }
      if (this.drawing) {
        ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeStyle = L.rgba(pal.pos, 0.9); ctx.beginPath();
        this.drawing.forEach(function (p, i) { if (i) ctx.lineTo(L.sx(p[0]), L.sy(p[1])); else ctx.moveTo(L.sx(p[0]), L.sy(p[1])); });
        ctx.stroke(); ctx.setLineDash([]);
      }
    },
    data: function (ctx, w, h) {
      if (this.rec) { L.drawSection(ctx, 14, 4, w - 28, h - 24, this.rec, { agc: this.st.agc, marks: L.marks, now: L.eng.n }); L.timeAxis(ctx, 52, h - 20, w - 66, 6, this.rec.len, L.eng.n); return; }
      var das = this.das, left = 50, X = 14 + left, Wd = w - 28 - left, H = h - 26;
      drawWaterfall(ctx, X, 4, Wd, H, das, this.st.perCh);
      L.font(ctx, 9); ctx.fillStyle = L.pal.label; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('0 km', X - 6, 4);
      ctx.textBaseline = 'bottom'; ctx.fillText(L.fmt(L.km(das.np - 1), 1) + ' km', X - 6, 4 + H);
      ctx.save(); ctx.translate(18, 4 + H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('along cable', 0, 0); ctx.restore();
      if (L.marks.length) { var age = L.eng.n - L.marks[L.marks.length - 1].n; if (age <= das.len) { var xm = X + Wd - age / das.len * Wd; ctx.strokeStyle = 'rgba(' + L.pal.origin + ',.7)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xm + 0.5, 4); ctx.lineTo(xm + 0.5, 4 + H); ctx.stroke(); ctx.setLineDash([]); } }
      L.timeAxis(ctx, X, h - 20, Wd, 6, das.len, L.eng.n);
    },
    legend: function () { return L.legendAcoustic() + (this.das ? '<span><i class="sw" style="background:var(--cyan);height:3px;border-radius:2px"></i>fibre · dot = 1 km</span>' : ''); },
    csv: function () {
      if (this.rec) return L.recCSV(this.rec, ['p'], 'pressure, arbitrary units');
      var das = this.das; if (!das || !das.count) return null;
      var rows = ['time_s,' + das.ch.map(function (i) { return 'ch_' + L.fmt(L.km(i), 3) + 'km'; }).join(',')];
      for (var t = 0; t < das.len; t++) { var r = [L.fmt((t - das.len + 1) / L.rate, 4)]; for (var c = 0; c < das.nc; c++) r.push(das.buf[c * das.len + (das.head + t) % das.len].toExponential(4)); rows.push(r.join(',')); }
      return '# Wave Lab · DAS · axial strain rate (arbitrary units) · channel = distance along the cable\n' + rows.join('\n');
    }
  });

  /* ======================================================================================
     3 · TIME REVERSAL
     ====================================================================================== */
  L.register({
    id: 'tr', title: 'Time reversal', physics: 'acoustic',
    goal: 'Record a wave on a ring of sensors, send the recordings back reversed in time, and watch the wave collapse onto its source.',
    tools: ['source', '|', 'scatter'],
    shareWhat: 'the mirror, the scatterers and the source position',
    st: { m: null, mirror: 'ring', src: null, did: {} },
    noMarks: true,
    enter: function () {
      var st = this.st;
      if (st.m) L.model.load(st.m); else L.model.setPreset('homogeneous');
      L.setModel(); L.setBC(st.mirror === 'cavity' ? 'box' : 'absorb', 0);        /* lossless interior: the wave equation stays time-reversible */
      this.mirror(); this.phase = 'idle'; this.k = 0; this.img = null; this.gainHold = 0; this.focusTr = null; L.eng.setTrackMax(false);
      this.head();
      if (st.src) { var self = this; setTimeout(function () { if (S.ch === 'tr' && self.phase === 'idle') self.fire(L.fromN(st.src, 4)); }, 300); }
    },
    mirror: function () {
      var st = this.st, nx = L.nx, ny = L.ny, B = L.eng.B, pts = [], k;
      if (st.mirror === 'ring') { var R = Math.min(nx, ny) / 2 - B - 8; this.R = R; for (k = 0; k < 48; k++) { var a = -Math.PI / 2 + 2 * Math.PI * k / 48; pts.push([nx / 2 + R * Math.cos(a), ny / 2 + R * Math.sin(a)]); } }
      else if (st.mirror === 'line') { var y = B + 6; for (k = 0; k < 40; k++) pts.push([B + 6 + (nx - 2 * B - 12) * k / 39, y]); this.lineY = y; }
      else pts.push([nx * 0.24, ny * 0.3]);
      this.pts = pts.map(function (p, i) { return { x: Math.round(p[0]), y: Math.round(p[1]), code: 'M' + pad2(i) }; });
      L.setProbes(this.pts.map(function (p) { return [p.x, p.y]; }));
    },
    head: function () { L.setData('Time-reversal mirror · <b>' + this.pts.length + '</b> sensor' + (this.pts.length > 1 ? 's' : '') + ' · pressure', ''); },
    inside: function (c) {
      var st = this.st;
      if (st.mirror === 'ring') return Math.hypot(c[0] - L.nx / 2, c[1] - L.ny / 2) < this.R - 10;
      if (st.mirror === 'line') return c[1] > this.lineY + 12 && c[1] < L.ny - L.eng.B - 4 && c[0] > L.eng.B && c[0] < L.nx - L.eng.B;
      return c[0] > 6 && c[1] > 6 && c[0] < L.nx - 7 && c[1] < L.ny - 7 && Math.hypot(c[0] - this.pts[0].x, c[1] - this.pts[0].y) > 20;
    },
    fire: function (c) {
      var st = this.st, e = L.eng, n0 = Math.round(1.2 / e.f0), dmax = 0;
      e.clear(); e.setTrackMax(false); this.img = null;
      this.src = c; st.src = L.toN(c);
      this.pts.forEach(function (p) { dmax = Math.max(dmax, Math.hypot(p.x - c[0], p.y - c[1])); });
      var coda = L.model.scat.length ? 1.2 * L.rate : 0.35 * L.rate;
      this.len = st.mirror === 'cavity' ? Math.round(8 * L.rate) : Math.round(dmax / (C * 0.95) + 2.6 * n0 + coda);
      this.rec = this.pts.map(function () { return new Float32Array(this.len); }, this);
      e.addSource({ x: c[0], y: c[1], amp: 1 }); this.n0 = n0;
      this.phase = 'record'; this.k = 0; st.did.fire = true;
      L.setProbes(this.pts.map(function (p) { return [p.x, p.y]; }));
      L.refresh();
    },
    reverse: function () {
      if (this.phase !== 'recorded' && this.phase !== 'done') return;
      var e = L.eng, mx = 0, k, i, nR = this.pts.length;
      for (k = 0; k < nR; k++) for (i = 0; i < this.len; i++) { var a = Math.abs(this.rec[k][i]); if (a > mx) mx = a; }
      var g = 1 / (Math.max(mx, 1e-9) * Math.sqrt(nR));
      e.clear(); e.setTrackMax(true);
      for (k = 0; k < nR; k++) {
        var tr = new Float32Array(this.len), r = this.rec[k];
        for (i = 0; i < this.len; i++) tr[i] = r[this.len - 1 - i] * g;
        e.addSource({ x: this.pts[k].x, y: this.pts[k].y, trace: tr, amp: 1 });
      }
      L.setProbes(this.pts.map(function (p) { return [p.x, p.y]; }).concat([[this.src[0], this.src[1]]]));
      this.kf = this.len - 1 - this.n0;                                             /* the reversed wave reaches the source here */
      this.total = this.len + Math.round(0.7 * L.rate); this.focusTr = new Float32Array(this.total);
      this.phase = 'reverse'; this.k = 0; this.gainHold = 0; this.st.did.reverse = true; L.refresh();
    },
    finish: function () {
      var mx = L.eng.readMax(); this.phase = 'done'; if (!mx) return;
      var nx = L.nx, ny = L.ny, st = this.st, best = -1, bi = 0, gmax = 0, i, x, y;
      for (i = 0; i < mx.length; i++) {
        if (mx[i] > gmax) gmax = mx[i];
        x = i % nx; y = (i / nx) | 0;
        if (!this.inside([x, y]) && st.mirror !== 'cavity') continue;
        if (st.mirror === 'cavity' && Math.hypot(x - this.pts[0].x, y - this.pts[0].y) < 14) continue;
        if (mx[i] > best) { best = mx[i]; bi = i; }
      }
      var fx = bi % nx, fy = (bi / nx) | 0, half = best / 2;
      function width(dx, dy) { var a = 0, b = 0, j; for (j = 1; j < 200; j++) { var q = mx[(fy + dy * j) * nx + fx + dx * j]; if (!(q >= half)) { var p = mx[(fy + dy * (j - 1)) * nx + fx + dx * (j - 1)]; a = j - 1 + (p - half) / Math.max(1e-12, p - (q || 0)); break; } } for (j = 1; j < 200; j++) { var q2 = mx[(fy - dy * j) * nx + fx - dx * j]; if (!(q2 >= half)) { var p2 = mx[(fy - dy * (j - 1)) * nx + fx - dx * (j - 1)]; b = j - 1 + (p2 - half) / Math.max(1e-12, p2 - (q2 || 0)); break; } } return a + b; }
      var wx = width(1, 0), wy = width(0, 1), lam = L.eng.ppw;   /* wavelength at v = 1, in cells */
      this.img = { x: fx, y: fy, err: Math.hypot(fx - this.src[0], fy - this.src[1]), wx: wx, wy: wy, lam: lam, gain2: Math.sqrt(gmax / Math.max(best, 1e-12)) };
      this.view = 'image'; st.did.look = true; L.refresh(); L.updateLegend();
    },
    save: function () { this.st.m = L.model.serialize(); },
    serialize: function () { var st = this.st; return { m: L.model.serialize(), mirror: st.mirror, src: st.src }; },
    load: function (o) { var st = this.st; st.m = o.m || null; st.mirror = ['ring', 'line', 'cavity'].indexOf(o.mirror) >= 0 ? o.mirror : 'ring'; st.src = o.src || null; st.did = { mirror: true }; },
    steps: function () {
      var st = this.st, d = st.did, ph = this.phase;
      var rec = ph === 'record' ? '<p class="live" id="trLive">Recording…</p>' : '';
      return [
        { t: 'Pick a time-reversal mirror', d: st.mirror === 'cavity' ? 'One sensor in a box with perfectly reflecting walls: the echoes act as many virtual sensors.' : (st.mirror === 'line' ? 'A line of 40 sensors on one side only: limited aperture.' : 'A ring of 48 sensors around the source: full aperture.'),
          c: L.seg('mirror', [['ring', 'Ring'], ['line', 'Line'], ['cavity', '1 sensor + box']], st.mirror) + '<div class="btns">' + L.btn('trScat', L.model.scat.length ? 'Remove scatterers' : 'Add 40 scatterers') + '</div>', done: !!d.mirror || !!d.fire },
        { t: 'Fire a hidden source', d: 'Click inside the mirror. The source sends out one pulse; every sensor records what reaches it.' + (st.mirror === 'cavity' ? ' The box rings for 8 s.' : ''), c: rec, done: !!d.fire && ph !== 'record' && ph !== 'idle' },
        { t: 'Play it backwards', d: 'Each sensor becomes a loudspeaker and re-emits its own recording, last sample first. Physics does the rest.', c: '<div class="btns">' + L.btn('reverse', '◀◀ Time-reverse', 'go', !(ph === 'recorded' || ph === 'done')) + '</div>', done: !!d.reverse && ph !== 'reverse' },
        { t: 'Look at the focus', d: 'The image shows the largest pressure each point reached while the reversed waves played: a spot where the source was.', c: this.img ? L.seg('trView', [['image', 'Focusing image'], ['field', 'Wavefield']], this.view || 'image') : '', done: !!d.look }
      ];
    },
    results: function () {
      var r = this.img; if (!r) return '';
      var lam = r.lam;
      return '<div class="res"><h3>Refocusing</h3><dl class="kv"><dt>Focus vs. true source</dt><dd>' + L.fmt(L.km(r.err), 2) + ' km · ' + L.fmt(r.err / lam, 2) + ' λ</dd>' +
        '<dt>Spot width (FWHM), x</dt><dd>' + L.fmt(r.wx / lam, 2) + ' λ</dd><dt>Spot width (FWHM), z</dt><dd>' + L.fmt(r.wy / lam, 2) + ' λ</dd><dt>Wavelength λ</dt><dd>' + L.fmt(L.km(lam), 2) + ' km</dd></dl>' +
        '<p>' + (this.st.mirror === 'line' ? 'With a one-sided mirror the spot is stretched away from the line: the aperture limits the resolution. Add scatterers and try again: they bend extra energy back into the mirror.' : (this.st.mirror === 'cavity' ? 'One sensor was enough: the reverberations in the box carry the information that a full ring would have collected.' : 'A full ring focuses to about half a wavelength, the diffraction limit.')) + '</p></div>';
    },
    explain: function () {
      return '<p><b>Why it works.</b> Without losses, the wave equation is unchanged when t → −t. If every sensor re-emits its recording reversed in time, the wave retraces its path and converges on the source at the moment the original pulse left it, then spreads out again (no sink absorbs it).</p>' +
        '<p><b>Diffraction limit.</b> The focal spot cannot be smaller than about λ/2. A mirror that sees the wave from only one side yields a larger, elongated spot; scattering or reflecting walls send extra energy to the mirror and sharpen the focus (Fink’s time-reversal mirrors and chaotic cavities).</p>' +
        '<p><b>Here:</b> interior attenuation is switched off (α = 0) so the simulation is reversible; the recordings are normalised and injected as sources at the sensor positions. The image is max<sub>t</sub> p(x, t)² during the reversed run.</p>' + physicsExplain();
    },
    act: function (a, v) {
      var st = this.st;
      if (a === 'mirror') { if (st.mirror !== v) { st.mirror = v; st.did.mirror = true; st.src = null; L.setBC(v === 'cavity' ? 'box' : 'absorb', 0); L.eng.clear(); L.eng.setTrackMax(false); this.mirror(); this.phase = 'idle'; this.img = null; this.head(); L.refresh(); } }
      else if (a === 'trScat') { if (L.model.scat.length) L.model.clearScatter(); else L.sprinkle(40); L.setModel(); this.phase = this.phase === 'record' ? 'idle' : this.phase; L.refresh(); }
      else if (a === 'reverse') this.reverse();
      else if (a === 'trView') { this.view = v; L.refresh(); L.updateLegend(); }
    },
    down: function (c) {
      if (S.tool !== 'source') return false;
      if (!this.inside(c)) { L.toast(this.st.mirror === 'line' ? 'Click below the line of sensors' : (this.st.mirror === 'ring' ? 'Click inside the ring' : 'Click away from the sensor')); return true; }
      this.fire(c); return true;
    },
    onEdit: function () { if (this.phase === 'recorded' || this.phase === 'done') { this.phase = 'idle'; this.img = null; L.refresh(); } },
    cta: function () {
      var ph = this.phase;
      if (ph === 'recorded' || ph === 'done') return { label: '◀◀ Time-reverse', act: 'reverse' };
      if (ph === 'reverse') return { label: 'Reversing…', act: 'reverse', disabled: true };
      if (ph === 'record') return { label: 'Recording…', act: 'reverse', disabled: true };
      return null;
    },
    busy: function () { return this.phase !== 'idle'; },                    /* never rebuild under a recording, a replay or its image */
    speedMul: function () { if (this.phase === 'reverse' && Math.abs(this.k - this.kf) < 0.35 * L.rate) return 0.22; return 1; },
    stepCap: function () { if (this.phase === 'record') return this.len - this.k; if (this.phase === 'reverse') return Math.max(1, this.total - this.k); return 1e9; },
    onSamples: function (b, n, nP) {
      var nR = this.pts.length, s, k;
      if (this.phase === 'record') {
        for (s = 0; s < n && this.k < this.len; s++, this.k++) for (k = 0; k < nR; k++) this.rec[k][this.k] = b[(s * nP + k) * 2];
        if (this.k >= this.len) { this.phase = 'recorded'; L.refresh(); }
      } else if (this.phase === 'reverse') {
        for (s = 0; s < n && this.k < this.total; s++, this.k++) { var v = b[(s * nP + nR) * 2]; this.focusTr[this.k] = v * v; }
        if (this.k >= this.total) this.finish();
      }
    },
    after: function () {
      if (this.phase === 'record') L.text('trLive', 'Recording… ' + L.fmt(this.k / L.rate, 1) + ' / ' + L.fmt(this.len / L.rate, 1) + ' s');
      if (this.phase === 'reverse' || (this.phase === 'done' && this.view !== 'image')) { var m = L.eng.fieldMax(); this.gainHold = Math.max(m, this.gainHold * 0.985); }
    },
    gain: function () { if (this.phase === 'reverse' || (this.phase === 'done' && this.view !== 'image')) return Math.min(60, 0.9 / Math.max(1e-6, this.gainHold)); return 1.2; },
    gain2: function () { return this.img ? this.img.gain2 : 1; },
    mode: function () { return this.phase === 'done' && this.view === 'image' && this.img ? 'max' : 'field'; },
    progress: function () { if (this.phase === 'record') return this.k / this.len; if (this.phase === 'reverse') return this.k / this.total; return null; },
    hud: function () {
      var ph = this.phase;
      if (ph === 'idle') return ['Click ' + (this.st.mirror === 'ring' ? 'inside the ring' : (this.st.mirror === 'line' ? 'below the line' : 'anywhere in the box')) + ' to fire a source'];
      if (ph === 'record') return ['<b class="em">● Recording</b> ' + L.fmt(this.k / L.rate, 1) + ' s'];
      if (ph === 'recorded') return ['Recorded ' + L.fmt(this.len / L.rate, 1) + ' s'];
      if (ph === 'reverse') return ['<b class="em">◀◀ Reversed</b> · ' + L.fmt((this.total - this.k) / L.rate, 1) + ' s' + (Math.abs(this.k - this.kf) < 0.35 * L.rate ? ' · slow motion' : '')];
      return [this.view === 'image' ? 'Focusing image' : 'After the focus'];
    },
    legend: function () {
      if (this.mode() === 'max') return '<span><i class="sw" style="background:linear-gradient(90deg,transparent,' + 'rgb(' + L.pal.hot.join(',') + '))"></i>peak p² (1 = focus)</span><span>○ true source</span><span>✕ focus</span>';
      return L.legendAcoustic() + '<span>▼ mirror sensors</span>';
    },
    overlay: function (ctx) {
      var pal = L.pal;
      stations(ctx, this.pts, { labels: false, alpha: 0.9, col: pal.pos });
      if (this.st.mirror === 'ring') { ctx.setLineDash([3, 5]); ctx.strokeStyle = L.rgba(pal.pos, 0.35); ctx.beginPath(); ctx.arc(L.sx(L.nx / 2), L.sy(L.ny / 2), this.R / L.nx * L.W, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
      if (this.src && this.phase !== 'idle') {
        var X = L.sx(this.src[0]), Y = L.sy(this.src[1]);
        if (this.phase === 'record' && this.k < this.n0 * 2) L.star(ctx, X, Y, 8, pal.neg, 0.95);
        ctx.beginPath(); ctx.arc(X, Y, 9, 0, 6.2832); ctx.lineWidth = 1.5; ctx.strokeStyle = L.rgba(pal.ink, 0.85); ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        if (this.phase !== 'reverse') L.label(ctx, 'true source', X, Y - 14);
      }
      if (this.img && this.phase === 'done') {
        var fx = L.sx(this.img.x), fy = L.sy(this.img.y);
        ctx.strokeStyle = L.rgba(pal.ink, 0.95); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(fx - 6, fy - 6); ctx.lineTo(fx + 6, fy + 6); ctx.moveTo(fx + 6, fy - 6); ctx.lineTo(fx - 6, fy + 6); ctx.stroke();
        L.label(ctx, 'focus', fx, fy + 20);
      }
    },
    data: function (ctx, w, h) {
      if (!this.rec || this.phase === 'idle') { placeholder(ctx, w, h, 'Fire a source inside the mirror: its recordings appear here'); return; }
      var pal = L.pal, nR = this.pts.length, show = [], k, i, wl = this.phase === 'reverse' || this.phase === 'done' ? w * 0.68 : w - 28, X = 14 + 38, Wt = wl - 14 - 38 - 10, H = h - 28;
      var step = Math.max(1, Math.round(nR / 24)); for (k = 0; k < nR; k += step) show.push(k);
      var len = this.len, kRec = this.phase === 'record' ? this.k : len, peak = 1e-9;
      show.forEach(function (r) { for (i = 0; i < kRec; i++) { var a = Math.abs(this.rec[r][i]); if (a > peak) peak = a; } }, this);
      var sp = H / show.length, amp = (show.length > 1 ? 0.9 * sp : H / 2 - 3) / peak, stride = Math.max(1, Math.floor(len / (Wt * 1.5)));
      for (var q = 0; q < show.length; q++) {
        var r = show[q], y0 = 4 + sp * (q + 0.5), a = this.rec[r];
        if (show.length <= 12 || q % 2 === 0) { L.font(ctx, 9); ctx.fillStyle = pal.label; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(this.pts[r].code, 14, y0); }
        ctx.beginPath(); ctx.moveTo(X, y0);
        for (i = 0; i < kRec; i += stride) ctx.lineTo(X + i / (len - 1) * Wt, y0 - Math.max(0, Math.min(1.4 * sp, a[i] * amp)));
        ctx.lineTo(X + Math.min(kRec, len - 1) / (len - 1) * Wt, y0); ctx.closePath(); ctx.fillStyle = pal.fill; ctx.fill();
        ctx.beginPath(); for (i = 0; i < kRec; i += stride) { var yy = y0 - Math.max(-1.4 * sp, Math.min(1.4 * sp, a[i] * amp)); if (i) ctx.lineTo(X + i / (len - 1) * Wt, yy); else ctx.moveTo(X, yy); }
        ctx.strokeStyle = pal.trace; ctx.lineWidth = 1; ctx.stroke();
      }
      /* playhead: forward → it runs left to right; reversed → right to left over the same recording */
      var ph = this.phase === 'record' ? this.k : (this.phase === 'reverse' ? len - 1 - Math.min(this.k, len - 1) : null);
      if (ph != null) {
        var xp = X + ph / (len - 1) * Wt;
        if (this.phase === 'reverse') { ctx.fillStyle = L.rgba(pal.bg, 0.55); ctx.fillRect(xp, 2, X + Wt - xp, H + 4); }
        ctx.strokeStyle = L.rgba(this.phase === 'reverse' ? pal.neg : pal.pos, 0.95); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(xp, 2); ctx.lineTo(xp, H + 6); ctx.stroke();
      }
      L.font(ctx, 9); ctx.fillStyle = pal.label; ctx.textBaseline = 'top';
      ctx.textAlign = 'left'; ctx.fillText('0 s', X, H + 10); ctx.textAlign = 'right'; ctx.fillText(L.fmt(len / L.rate, 1) + ' s', X + Wt, H + 10);
      ctx.textAlign = 'center'; ctx.fillText(this.phase === 'reverse' || this.phase === 'done' ? '◀ re-emitted last sample first' : 'recording time →', X + Wt / 2, H + 10);
      if (this.focusTr && (this.phase === 'reverse' || this.phase === 'done')) {
        var x0 = wl + 10, W2 = w - x0 - 14, H2 = H - 14, f = this.focusTr, mxF = 1e-12, kk = Math.min(this.k, this.total);
        for (i = 0; i < kk; i++) if (f[i] > mxF) mxF = f[i];
        L.panelLabel(ctx, 'p² AT THE TRUE SOURCE', x0, 2);
        ctx.strokeStyle = pal.tick; ctx.strokeRect(x0 + 0.5, 16.5, W2 - 1, H2 - 1);
        var xf = x0 + this.kf / (this.total - 1) * W2; ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(' + pal.origin + ',.7)'; ctx.beginPath(); ctx.moveTo(xf, 17); ctx.lineTo(xf, 16 + H2); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); for (i = 0; i < kk; i += Math.max(1, Math.floor(this.total / W2))) { var yv = 16 + H2 - 2 - f[i] / mxF * (H2 - 8); if (i) ctx.lineTo(x0 + i / (this.total - 1) * W2, yv); else ctx.moveTo(x0, yv); }
        ctx.strokeStyle = L.rgba(pal.hot, 0.95); ctx.lineWidth = 1.4; ctx.stroke();
        L.font(ctx, 9); ctx.fillStyle = pal.label; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('expected focus', xf, H + 10);
      }
    },
    csv: function () {
      if (!this.rec) return null;
      var rows = ['time_s,' + this.pts.map(function (p) { return p.code; }).join(',')];
      for (var i = 0; i < this.len; i++) { var r = [L.fmt(i / L.rate, 4)]; for (var k = 0; k < this.pts.length; k++) r.push(this.rec[k][i].toExponential(5)); rows.push(r.join(',')); }
      return '# Wave Lab · time-reversal mirror recordings · pressure, arbitrary units · source at (' + L.fmt(L.km(this.src[0]), 3) + ', ' + L.fmt(L.km(this.src[1]), 3) + ') km\n' + rows.join('\n');
    }
  });

  /* ======================================================================================
     4 · TRAVEL-TIME TOMOGRAPHY
     ====================================================================================== */
  function cgls(apply, adjoint, b, n, iters) {
    var x = new Float64Array(n), r = Float64Array.from(b), s = adjoint(r), p = Float64Array.from(s), g = dot(s, s), g0 = g;
    for (var it = 0; it < iters && g > 1e-24 * g0; it++) {
      var q = apply(p), dl = dot(q, q); if (dl < 1e-30) break;
      var al = g / dl, i;
      for (i = 0; i < n; i++) x[i] += al * p[i];
      for (i = 0; i < r.length; i++) r[i] -= al * q[i];
      s = adjoint(r); var g2 = dot(s, s), be = g2 / g; g = g2;
      for (i = 0; i < n; i++) p[i] = s[i] + be * p[i];
    }
    return x;
  }
  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  L.register({
    id: 'tomo', title: 'Tomography', physics: 'acoustic',
    goal: 'Shoot a survey through a velocity model, recover the model from nothing but first-arrival travel times, and compare it with the truth.',
    tools: ['quake', '|', 'slow', 'fast', 'erase'],
    shareWhat: 'the true model, your edits and the survey geometry',
    st: { m: null, truth: 'random', geom: 'ring', smooth: 0.5, rays: 'bent', did: {} },
    noMarks: false,
    enter: function () {
      var st = this.st;
      if (st.m) L.model.load(st.m); else L.model.setPreset(st.truth === 'checker' ? 'checker' : (st.truth === 'custom' ? 'homogeneous' : 'random'));
      L.setModel(); L.setBC('absorb');
      this.geometry(); this.phase = 'idle'; this.rays = []; this.inv = null; this.shot = 0; this.gridSetup();
      this.head();
    },
    geometry: function () {
      var nx = L.nx, ny = L.ny, m = L.eng.B + 6, x0 = m, y0 = m, x1 = nx - 1 - m, y1 = ny - 1 - m, st = this.st, Sx = [], Rx = [], k;
      this.box = [x0, y0, x1, y1];
      if (st.geom === 'ring') {
        var W = x1 - x0, H = y1 - y0, P = 2 * (W + H);
        var at = function (t) { t = ((t % P) + P) % P; if (t < W) return [x0 + t, y0, 0]; t -= W; if (t < H) return [x1, y0 + t, 1]; t -= H; if (t < W) return [x1 - t, y1, 2]; t -= W; return [x0, y1 - t, 3]; };
        for (k = 0; k < 12; k++) Sx.push(at((k + 0.5) * P / 12));
        for (k = 0; k < 48; k++) Rx.push(at((k + 0.25) * P / 48));
      } else {
        for (k = 0; k < 10; k++) Sx.push([x0, y0 + (y1 - y0) * (k + 0.5) / 10, 3]);
        for (k = 0; k < 40; k++) Rx.push([x1, y0 + (y1 - y0) * (k + 0.5) / 40, 1]);
      }
      this.S = Sx.map(function (p) { return [Math.round(p[0]), Math.round(p[1]), p[2]]; }); this.R = Rx.map(function (p, i) { return { x: Math.round(p[0]), y: Math.round(p[1]), side: p[2], code: 'R' + pad2(i) }; });
      L.setProbes(this.R.map(function (p) { return [p.x, p.y]; }));
    },
    gridSetup: function () {
      var b = this.box, W = b[2] - b[0], H = b[3] - b[1];
      this.gx = 18; this.gz = Math.max(6, Math.round(18 * H / W)); this.cw = W / this.gx; this.chh = H / this.gz;
      /* the true model on the inversion grid: mean slowness per cell */
      var nC = this.gx * this.gz, s = new Float64Array(nC), c = new Float64Array(nC), nx = L.nx;
      for (var y = Math.ceil(b[1]); y <= b[3]; y++) for (var x = Math.ceil(b[0]); x <= b[2]; x++) {
        var j = this.cell(x, y); if (j < 0) continue; var v = L.model.mask[y * nx + x] ? L.WE.VSCAT : L.model.v[y * nx + x]; s[j] += 1 / v; c[j]++;
      }
      this.truth = new Float64Array(nC); for (var j2 = 0; j2 < nC; j2++) this.truth[j2] = c[j2] ? c[j2] / s[j2] : 1;
    },
    span: function () { var m = 0.05; for (var j = 0; j < this.truth.length; j++) m = Math.max(m, Math.abs(this.truth[j] - 1)); return Math.ceil(m * 20) / 20; },
    cell: function (x, y) { var b = this.box, i = Math.floor((x - b[0]) / this.cw), k = Math.floor((y - b[1]) / this.chh); if (i < 0 || k < 0 || i >= this.gx || k >= this.gz) return -1; return k * this.gx + i; },
    startSurvey: function () {
      this.gridSetup(); this.rays = []; this.inv = null; this.shot = 0; this.phase = 'survey'; this.st.did.survey = false;
      this.nextShot(); L.refresh();
    },
    nextShot: function () {
      var e = L.eng, s = this.S[this.shot], n0 = Math.round(1.2 / e.f0), self = this, dmax = 0;
      e.clear(); e.addSource({ x: s[0], y: s[1], amp: 1 }); this.n0 = n0;
      this.use = this.R.map(function (r) { var d = Math.hypot(r.x - s[0], r.y - s[1]); var ok = d > 0.18 * L.nx && (self.st.geom !== 'ring' || r.side !== s[2]); if (ok) dmax = Math.max(dmax, d); return ok ? d : 0; });
      this.len = Math.round(dmax / (C * 0.68) + 2.5 * n0); this.k = 0;
      this.buf = new Float32Array(this.R.length * this.len);
      L.marks.push({ n: e.n, x: s[0], y: s[1], M: 3, t: performance.now() });
    },
    /* first-arrival picker: the envelope (|p| averaged over one dominant period) inside the window predicted from the
       distance and the velocity range; the pick is the first envelope peak that reaches pickThr of the window maximum,
       refined by a parabola. The envelope has one peak per arrival, so Ricker side lobes cannot trigger it. */
    pickThr: 0.15,
    pick: function () {
      var nR = this.R.length, len = this.len, s = this.S[this.shot], n0 = this.n0, f0 = L.eng.f0, T = Math.max(2, Math.round(1 / f0)), h = T >> 1;
      var cs = new Float64Array(len + 1), env = new Float32Array(len);
      for (var r = 0; r < nR; r++) {
        var d = this.use[r]; if (!d) continue;
        var a = this.buf.subarray(r * len, (r + 1) * len), i;
        for (i = 0; i < len; i++) cs[i + 1] = cs[i] + Math.abs(a[i]);
        for (i = 0; i < len; i++) { var lo2 = Math.max(0, i - h), hi2 = Math.min(len, i + h + 1); env[i] = (cs[hi2] - cs[lo2]) / (hi2 - lo2); }
        var lo = Math.max(1, Math.floor(n0 + d / (C * 1.42) - 0.8 / f0)), hi = Math.min(len - 2, Math.ceil(n0 + d / (C * 0.68) + 0.8 / f0)), wm = 0;
        for (i = lo; i <= hi; i++) if (env[i] > wm) wm = env[i];
        if (wm < 1e-9) continue;
        for (i = lo; i <= hi; i++) if (env[i] >= this.pickThr * wm) break;
        while (i < hi && env[i + 1] >= env[i]) i++;
        var y0 = env[i - 1], y1 = env[i], y2 = env[i + 1], dn = y0 - 2 * y1 + y2, off = dn < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / dn)) : 0;
        this.rays.push({ s: [s[0], s[1]], r: [this.R[r].x, this.R[r].y], t: i + off - n0, d: d, shot: this.shot, ri: r, pk: i + off });
      }
    },
    /* ---------- inversion: straight rays, then optionally bent rays traced through the current model ---------- */
    rowFromPolyline: function (P) {                                         /* ray length (cells / C) per inversion cell */
      var acc = {}, Lr = 0;
      for (var a = 1; a < P.length; a++) {
        var x0 = P[a - 1][0], y0 = P[a - 1][1], dx = P[a][0] - x0, dy = P[a][1] - y0, Ls = Math.hypot(dx, dy), m = Math.max(1, Math.ceil(Ls / 0.5));
        for (var k = 0; k < m; k++) { var f = (k + 0.5) / m, j = this.cell(x0 + dx * f, y0 + dy * f); if (j >= 0) acc[j] = (acc[j] || 0) + Ls / m / C; }
        Lr += Ls;
      }
      var J = Object.keys(acc).map(Number);
      return { j: J, v: J.map(function (j) { return acc[j]; }), L: Lr };
    },
    /* one damped, smoothed least-squares update around the slowness model s0 (null = 1 everywhere) */
    solve: function (G, s0in) {
      var rays = this.rays, nC = this.gx * this.gz, n = nC + 1, gx = this.gx, gz = this.gz, k, i, q;
      var s0 = s0in || new Float64Array(nC).fill(1), hits = new Float64Array(nC), cn = 0;
      G.forEach(function (g) { for (var q = 0; q < g.j.length; q++) { hits[g.j[q]] += g.v[q] * C; cn += g.v[q] * g.v[q]; } });
      cn = Math.sqrt(cn / nC);
      var lamD = 0.08 * cn, lamS = (0.25 + 2.6 * this.st.smooth) * cn, pairs = [];
      for (k = 0; k < gz; k++) for (i = 0; i < gx; i++) { if (i < gx - 1) pairs.push([k * gx + i, k * gx + i + 1]); if (k < gz - 1) pairs.push([k * gx + i, (k + 1) * gx + i]); }
      var nr = rays.length, rows = nr + nC + pairs.length, b = new Float64Array(rows);
      for (k = 0; k < nr; k++) { var g = G[k], tp = 0; for (q = 0; q < g.j.length; q++) tp += g.v[q] * s0[g.j[q]]; b[k] = rays[k].t - tp; }   /* data residual */
      for (k = 0; k < nC; k++) b[nr + k] = -lamD * (s0[k] - 1);                                                  /* damp the total model … */
      for (q = 0; q < pairs.length; q++) b[nr + nC + q] = -lamS * (s0[pairs[q][0]] - s0[pairs[q][1]]);           /* … and smooth it */
      var tscale = cn;                                                                                           /* the static shift column, scaled like the others */
      function A(x) {
        var y = new Float64Array(rows), q;
        for (k = 0; k < nr; k++) { var g = G[k], sum = x[nC] * tscale; for (q = 0; q < g.j.length; q++) sum += g.v[q] * x[g.j[q]]; y[k] = sum; }
        for (q = 0; q < nC; q++) y[nr + q] = lamD * x[q];
        for (q = 0; q < pairs.length; q++) y[nr + nC + q] = lamS * (x[pairs[q][0]] - x[pairs[q][1]]);
        return y;
      }
      function At(y) {
        var x = new Float64Array(n), q;
        for (k = 0; k < nr; k++) { var g = G[k], yk = y[k]; x[nC] += tscale * yk; for (q = 0; q < g.j.length; q++) x[g.j[q]] += g.v[q] * yk; }
        for (q = 0; q < nC; q++) x[q] += lamD * y[nr + q];
        for (q = 0; q < pairs.length; q++) { var yy = lamS * y[nr + nC + q]; x[pairs[q][0]] += yy; x[pairs[q][1]] -= yy; }
        return x;
      }
      var x = cgls(A, At, b, n, 90), sN = new Float64Array(nC), v = new Float64Array(nC), pre = 0, post = 0;
      for (k = 0; k < nC; k++) { sN[k] = Math.max(1 / 1.6, Math.min(2, s0[k] + x[k])); v[k] = 1 / sN[k]; }
      var Ax = A(x); for (k = 0; k < nr; k++) { pre += b[k] * b[k]; post += (b[k] - Ax[k]) * (b[k] - Ax[k]); }
      /* correlation of the recovered and true slowness perturbations, over cells crossed by rays */
      var t = this.truth, sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0, nn = 0;
      for (k = 0; k < nC; k++) if (hits[k] > 0) { var u = 1 / t[k] - 1, w = sN[k] - 1; sa += u; sb += w; sab += u * w; saa += u * u; sbb += w * w; nn++; }
      var cov = sab / nn - sa / nn * sb / nn, r = cov / Math.sqrt(Math.max(1e-20, (saa / nn - Math.pow(sa / nn, 2)) * (sbb / nn - Math.pow(sb / nn, 2))));
      var hm = 0; for (k = 0; k < nC; k++) hm = Math.max(hm, hits[k]);
      return { s: sN, v: v, hits: hits, hmax: hm, rmsPre: Math.sqrt(pre / nr) / L.rate, rmsPost: Math.sqrt(post / nr) / L.rate, r: r, n: nr, tau: x[nC] * tscale / L.rate };
    },
    /* bent rays by pseudo-bending (Um & Thurber 1987): start from the straight ray; in every sweep each interior point
       is set to the midpoint of its neighbours, then moved along the path normal by d = −(∂s/∂n)·l²/(2s), the offset
       that minimises the travel time of its two segments (l = half the neighbour distance). At convergence the path
       curvature equals |∇⊥s|/s: the ray equation. Slowness is interpolated bilinearly between cell centres; where the
       model is uniform the ray stays straight, so the geometry adds no bias of its own. */
    bendPaths: function (sl, init) {
      var b = this.box, gx = this.gx, gz = this.gz, cw = this.cw, chh = this.chh, hmin = Math.min(cw, chh);
      function sAt(x, z) {
        var fx = (x - b[0]) / cw - 0.5, fz = (z - b[1]) / chh - 0.5, i0 = Math.max(0, Math.min(gx - 2, Math.floor(fx))), k0 = Math.max(0, Math.min(gz - 2, Math.floor(fz)));
        var tx = Math.max(0, Math.min(1, fx - i0)), tz = Math.max(0, Math.min(1, fz - k0)), j = k0 * gx + i0;
        return (sl[j] * (1 - tx) + sl[j + 1] * tx) * (1 - tz) + (sl[j + gx] * (1 - tx) + sl[j + gx + 1] * tx) * tz;
      }
      return this.rays.map(function (ry, idx) {
        var M = Math.max(4, Math.min(24, Math.ceil(ry.d / (0.5 * hmin)))), P = [], k, it;
        if (init && init[idx] && init[idx].length === M + 1) P = init[idx].map(function (q) { return [q[0], q[1]]; });   /* warm start from the last iteration */
        else for (k = 0; k <= M; k++) P.push([ry.s[0] + (ry.r[0] - ry.s[0]) * k / M, ry.s[1] + (ry.r[1] - ry.s[1]) * k / M]);
        for (it = 0; it < 80; it++) {
          var maxMove = 0;
          for (k = 1; k < M; k++) {
            var mx = (P[k - 1][0] + P[k + 1][0]) / 2, mz = (P[k - 1][1] + P[k + 1][1]) / 2;
            var tx = P[k + 1][0] - P[k - 1][0], tz = P[k + 1][1] - P[k - 1][1], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl, l = tl / 2;
            var e = 0.5, s0 = sAt(mx, mz), gn = (sAt(mx + e * nx, mz + e * nz) - sAt(mx - e * nx, mz - e * nz)) / (2 * e);
            var d = Math.max(-0.5 * l, Math.min(0.5 * l, -gn * l * l / (2 * s0)));
            var X = [Math.max(b[0], Math.min(b[2], mx + d * nx)), Math.max(b[1], Math.min(b[3], mz + d * nz))];
            maxMove = Math.max(maxMove, Math.hypot(X[0] - P[k][0], X[1] - P[k][1])); P[k] = X;
          }
          if (maxMove < 0.02) break;
        }
        return P;
      });
    },
    invert: function () {
      if (this.rays.length < 8) return;
      var self = this, rows = this.rays.map(function (ry) { return self.rowFromPolyline([ry.s, ry.r]); }), S0 = this.solve(rows, null);
      S0.mode = 'straight'; this.invStraight = S0; this.paths = null; this.inv = S0;
      if (this.st.rays === 'bent' && this.phase !== 'survey') {                   /* three linearised iterations with re-traced rays */
        var cur = S0;
        for (var it = 0; it < 3; it++) {
          var P = this.bendPaths(cur.s, this.paths), nxt = this.solve(P.map(function (pp) { return self.rowFromPolyline(pp); }), cur.s);
          nxt.rmsPre = S0.rmsPre; cur = nxt; this.paths = P;
        }
        cur.mode = 'bent'; this.inv = cur;
      }
    },
    save: function () { this.st.m = L.model.serialize(); },
    serialize: function () { var st = this.st; return { m: L.model.serialize(), truth: st.truth, geom: st.geom, smooth: st.smooth, rays: st.rays }; },
    load: function (o) { var st = this.st; st.m = o.m || null; st.truth = o.truth || 'random'; st.geom = o.geom === 'cross' ? 'cross' : 'ring'; st.smooth = o.smooth != null ? o.smooth : 0.5; st.rays = o.rays === 'straight' ? 'straight' : 'bent'; st.did = { truth: true }; },
    steps: function () {
      var st = this.st, d = st.did, ph = this.phase, inv = this.inv;
      return [
        { t: 'Pick the true model', d: 'The survey will try to recover it; it stays visible under the waves. Or paint your own with the slow and fast brushes.', c: '<div class="grid3">' + L.opt('truth', 'random', 'Random blobs', st.truth === 'random') + L.opt('truth', 'checker', 'Checker&shy;board', st.truth === 'checker') + L.opt('truth', 'custom', 'Paint your own', st.truth === 'custom') + '</div>', done: !!d.truth || ph !== 'idle' },
        { t: 'Run the survey', d: st.geom === 'ring' ? '12 shots fired one after another, 48 receivers all around: rays cross in every direction.' : 'Cross-well: 10 shots in a borehole on the left, 40 receivers in one on the right. Rays are nearly horizontal.',
          c: L.seg('geom', [['ring', 'Surround'], ['cross', 'Cross-well']], st.geom) + '<div class="btns">' + L.btn('survey', ph === 'survey' ? 'Surveying…' : (ph === 'done' ? 'Run again' : 'Fire ' + this.S.length + ' shots'), 'go', ph === 'survey') + '</div>' + (ph === 'survey' ? '<p class="live" id="tomoLive"></p>' : ''), done: ph === 'done' },
        { t: 'Invert the travel times', d: 'First arrivals are picked automatically, then a damped, smoothed least-squares problem (CGLS) finds the slowness in ' + this.gx + ' × ' + this.gz + ' cells that best explains them. <b>Bent rays</b> re-bend every ray through the current model, three times.',
          c: L.seg('rays', [['straight', 'Straight rays'], ['bent', 'Bent rays']], st.rays) + L.range('smooth', 'Smoothing', 0, 100, 1, Math.round(st.smooth * 100), Math.round(st.smooth * 100) + ' %'), done: !!inv && ph === 'done' },
        { t: 'Compare with the truth', d: 'The panel below shows the true model, the recovered model and the ray coverage. Try the checkerboard: it shows where the survey can resolve detail, and where the rays smear it.', done: !!d.compare }
      ];
    },
    results: function () {
      var r = this.inv; if (!r) return '';
      return '<div class="res"><h3>Inversion · ' + (r.mode === 'bent' ? 'bent' : 'straight') + ' rays</h3><dl class="kv"><dt>Picked rays</dt><dd>' + r.n + '</dd><dt>RMS residual, v = 1 start</dt><dd>' + L.fmt(r.rmsPre * 1000, 0) + ' ms</dd><dt>RMS residual, recovered</dt><dd>' + L.fmt(r.rmsPost * 1000, 0) + ' ms</dd>' +
        '<dt>Correlation with the truth</dt><dd>r = ' + L.fmt(r.r, 2) + '</dd>' +
        (r.mode === 'bent' && this.invStraight ? '<dt>Straight rays alone</dt><dd>r = ' + L.fmt(this.invStraight.r, 2) + ' · ' + L.fmt(this.invStraight.rmsPost * 1000, 0) + ' ms</dd>' : '') +
        '</dl><p>' + this.verdict(r) + '</p></div>';
    },
    explain: function () {
      return '<p><b>Forward problem.</b> A travel time is the integral of slowness s = 1/v along the ray: <code>t = ∫ s dl</code>. With straight rays and the model split into cells, t = Σ L<sub>j</sub>·s<sub>j</sub>, a linear system <code>G·s = t</code> with one row per source–receiver pair.</p>' +
        '<p><b>Inverse problem.</b> There are more unknowns than independent data, so the solution is regularised: minimise <code>‖G·δs + τ − δt‖² + λ<sub>d</sub>²‖δs‖² + λ<sub>s</sub>²‖∇δs‖²</code> by conjugate gradients (CGLS). τ is one constant time shift: it absorbs the bias of the automatic picker, which times the peak of the first pulse.</p>' +
        '<p><b>Bent rays.</b> First arrivals take the fastest path, which bends around slow regions. In bent-ray mode the straight-ray model is the starting point; every ray is then bent towards the path of least travel time through the current model (pseudo-bending, Um &amp; Thurber 1987), and the model is updated again: three linearised iterations.</p>' +
        '<p><b>Picking.</b> For each trace the first-arrival window is predicted from the distance and the range of velocities. The pick is the first peak of the envelope (|p| averaged over one period) that reaches 15 % of the window maximum, refined to sub-sample precision by a parabola. Strong later arrivals focused by slow regions are skipped that way.</p>' + physicsExplain();
    },
    act: function (a, v) {
      var st = this.st;
      if (a === 'truth') { st.truth = v; st.did.truth = true; st.m = null; L.model.setPreset(v === 'checker' ? 'checker' : (v === 'custom' ? 'homogeneous' : 'random')); L.setModel(); this.reset(); if (v === 'custom') L.selectTool('slow'); L.refresh(); }
      else if (a === 'geom') { if (st.geom !== v) { st.geom = v; L.eng.clear(); this.geometry(); this.reset(); this.head(); L.refresh(); } }
      else if (a === 'survey') this.startSurvey();
      else if (a === 'rays') { if (st.rays !== v) { st.rays = v; this.head(); if (this.rays.length && this.phase !== 'survey') this.invert(); L.refresh(); } }
    },
    verdict: function (r) {
      var st = this.st;
      if (st.geom === 'cross' && st.truth === 'checker' && r.r < 0.4) return 'Almost nothing: the rays are nearly horizontal, and along every row the fast and slow squares average out to the same travel time. The checkerboard lies in the null space of this survey; only crossing rays can see it.';
      if (r.r > 0.75) return r.mode === 'bent' ? 'The large structures are back. Bent rays follow the fast paths that first arrivals really take, so strong anomalies are less underestimated than with straight rays.' : 'The large structures are back. Straight rays ignore ray bending, so strong anomalies come out weaker and smoother than they are.';
      return 'Blurry: with straight rays and few crossing directions part of the model stays unresolved, and it is smeared along the dominant ray direction.';
    },
    head: function () { L.setData('Travel-time tomography · <b>' + this.S.length + '</b> shots × <b>' + this.R.length + '</b> receivers · ' + (this.st.rays === 'bent' ? 'bent' : 'straight') + ' rays', ''); },
    reset: function () { this.phase = 'idle'; this.rays = []; this.inv = null; this.gridSetup(); },
    cta: function () { var ph = this.phase; return { label: ph === 'survey' ? 'Surveying…' : (ph === 'done' ? 'Run the survey again' : 'Fire ' + this.S.length + ' shots'), act: 'survey', disabled: ph === 'survey' }; },
    input: function (id, v) {
      if (id !== 'smooth') return;
      var self = this; this.st.smooth = v / 100; var o = document.getElementById('smootho'); if (o) o.textContent = v + ' %';
      clearTimeout(this.tmr);                                                   /* re-invert once the slider settles */
      if (this.rays.length && this.phase !== 'survey') this.tmr = setTimeout(function () { self.invert(); var r = document.querySelector('.res'); if (r) r.outerHTML = self.results(); }, 220);
    },
    onEdit: function () { if (this.st.truth !== 'custom') this.st.truth = 'custom'; this.reset(); L.refresh(); },
    ffwd: function () { return this.phase === 'survey'; },
    busy: function () { return this.phase !== 'idle'; },                    /* never rebuild under a survey or its results */
    ffwdCap: function () { return Math.max(1, this.len - this.k); },
    onSamples: function (b, n, nP) {
      if (this.phase !== 'survey') return;
      var nR = this.R.length, len = this.len;
      for (var s = 0; s < n && this.k < len; s++, this.k++) for (var r = 0; r < nR; r++) this.buf[r * len + this.k] = b[(s * nP + r) * 2];
      if (this.k >= len) {
        this.pick(); this.invert(); this.shot++;                              /* during the survey: straight rays, fast, after every shot */
        if (this.shot < this.S.length) this.nextShot();
        else {
          var self = this; this.phase = 'done'; L.eng.clear(); this.st.did.compare = true;            /* truth and result are side by side now */
          if (this.st.rays === 'bent') { this.bending = true; setTimeout(function () { self.invert(); self.bending = false; L.refresh(); }, 40); }   /* let the screen update first */
          L.refresh();
        }
      }
    },
    after: function () { if (this.phase === 'survey') L.text('tomoLive', 'Shot ' + (this.shot + 1) + ' of ' + this.S.length + ' · ' + this.rays.length + ' travel times picked'); },
    progress: function () { return this.phase === 'survey' ? (this.shot + this.k / this.len) / this.S.length : null; },
    hud: function () { if (this.phase === 'survey') return ['<b class="em">Shot ' + (this.shot + 1) + ' / ' + this.S.length + '</b>', 'fast-forward'];   /* the bar under the field shows the progress */ if (this.phase === 'done') return [this.bending ? 'Bending rays…' : this.rays.length + ' rays']; return ['Ready to shoot']; },
    legend: function () { return L.legendAcoustic() + '<span>★ shot</span><span>▼ receiver</span><span>— ray</span>'; },
    overlay: function (ctx) {
      var pal = L.pal, self = this;
      if (this.rays.length) {
        ctx.lineWidth = 1; ctx.strokeStyle = L.rgba(pal.ink, Math.min(0.16, 7 / this.rays.length + 0.04)); ctx.beginPath();
        if (this.paths && this.inv && this.inv.mode === 'bent') this.paths.forEach(function (P) { ctx.moveTo(L.sx(P[0][0]), L.sy(P[0][1])); for (var q = 1; q < P.length; q++) ctx.lineTo(L.sx(P[q][0]), L.sy(P[q][1])); });
        else this.rays.forEach(function (r) { ctx.moveTo(L.sx(r.s[0]), L.sy(r.s[1])); ctx.lineTo(L.sx(r.r[0]), L.sy(r.r[1])); });
        ctx.stroke();
      }
      if (this.phase === 'survey') {
        var s = this.S[this.shot]; ctx.strokeStyle = L.rgba(pal.neg, 0.35); ctx.beginPath();
        this.R.forEach(function (r, i) { if (self.use[i]) { ctx.moveTo(L.sx(s[0]), L.sy(s[1])); ctx.lineTo(L.sx(r.x), L.sy(r.y)); } }); ctx.stroke();
      }
      stations(ctx, this.R, { labels: false, alpha: 0.8 });
      this.S.forEach(function (s, i) { L.star(ctx, L.sx(s[0]), L.sy(s[1]), i === self.shot && self.phase === 'survey' ? 8 : 5.5, pal.neg, i === self.shot && self.phase === 'survey' ? 1 : 0.75); });
    },
    data: function (ctx, w, h) {
      var pal = L.pal, gx = this.gx, gz = this.gz, inv = this.inv, self = this, narrow = w < 640;
      var mw = narrow ? (w - 28 - 16) / 3 : Math.min((w * 0.66 - 28) / 3, (h - 58) * gx / gz), mh = mw * gz / gx, y0 = 18;
      var x0 = narrow ? 14 : w - 14 - 3 * mw - 16;
      function map(X, title, val) {
        L.panelLabel(ctx, title, X, 2);
        for (var k = 0; k < gz; k++) for (var i = 0; i < gx; i++) { var c = val(k * gx + i); ctx.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; ctx.fillRect(X + i * mw / gx, y0 + k * mh / gz, mw / gx + 0.6, mh / gz + 0.6); }
        ctx.strokeStyle = pal.tick; ctx.strokeRect(X + 0.5, y0 + 0.5, mw - 1, mh - 1);
      }
      var span = this.span();
      map(x0, 'TRUE MODEL', function (j) { return L.velCol(self.truth[j] - 1, span); });
      map(x0 + mw + 8, inv ? 'RECOVERED · ' + (inv.mode === 'bent' ? 'BENT' : 'STRAIGHT') + ' RAYS' : 'RECOVERED', function (j) { return inv ? L.velCol(inv.v[j] - 1, span) : pal.bg; }, false);
      map(x0 + 2 * (mw + 8), 'RAY COVERAGE', function (j) { var a = inv ? Math.min(1, inv.hits[j] / (0.5 * inv.hmax)) : 0, b = pal.bg, c = pal.ink; return [b[0] + (c[0] - b[0]) * a * 0.8, b[1] + (c[1] - b[1]) * a * 0.8, b[2] + (c[2] - b[2]) * a * 0.8]; }, false);
      if (!inv) { L.font(ctx, 10, 400); ctx.fillStyle = pal.label; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('run the survey', x0 + mw + 8 + mw / 2, y0 + mh / 2); }
      L.colorbar(ctx, x0, y0 + mh + 8, Math.min(2 * mw + 8, 220), 7, function (t) { return L.velCol(t * span, span); }, '−' + Math.round(span * 100) + ' %', '+' + Math.round(span * 100) + ' %', 'velocity vs. v = 1');
      if (narrow) return;
      /* left: the current (or last) shot gather with its picks */
      var gw = x0 - 14 - 22, GH = h - 30;
      L.panelLabel(ctx, this.phase === 'idle' ? 'SHOT GATHER' : 'SHOT ' + Math.min(this.shot + 1, this.S.length) + ' · GATHER AND PICKS', 14, 2);
      if (!this.buf) { L.font(ctx, 10, 400); ctx.fillStyle = pal.label; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('waiting for the first shot', 14 + gw / 2, 18 + GH / 2); return; }
      var nR = this.R.length, len = this.len, kk = this.phase === 'survey' ? this.k : len, sp = GH / nR, peak = 1e-9, r, i;
      for (r = 0; r < nR; r++) for (i = 0; i < kk; i++) { var aa = Math.abs(this.buf[r * len + i]); if (aa > peak) peak = aa; }
      var stride = Math.max(1, Math.floor(len / (gw * 1.5)));
      ctx.lineWidth = 0.8; ctx.strokeStyle = pal.trace;
      for (r = 0; r < nR; r++) {
        if (!this.use[r]) continue;
        var yb = 18 + sp * (r + 0.5); ctx.beginPath();
        for (i = 0; i < kk; i += stride) { var yy = yb - Math.max(-1.5 * sp, Math.min(1.5 * sp, this.buf[r * len + i] / peak * 2.2 * sp * 4)); if (i) ctx.lineTo(14 + i / (len - 1) * gw, yy); else ctx.moveTo(14, yy); }
        ctx.stroke();
      }
      var sh = this.phase === 'survey' ? this.shot : this.S.length - 1;
      ctx.fillStyle = L.rgba(pal.neg, 0.95);
      this.rays.forEach(function (ry) { if (ry.shot === sh) { ctx.beginPath(); ctx.arc(14 + ry.pk / (len - 1) * gw, 18 + sp * (ry.ri + 0.5), 1.8, 0, 6.2832); ctx.fill(); } });
      L.font(ctx, 9); ctx.fillStyle = pal.label; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText('0 s', 14, h - 11); ctx.textAlign = 'right'; ctx.fillText(L.fmt(len / L.rate, 1) + ' s · dots = picks', 14 + gw, h - 11);
    },
    csv: function () {
      if (!this.rays.length) return null;
      return '# Wave Lab · picked first-arrival travel times · coordinates in km\nshot,receiver,src_x_km,src_z_km,rec_x_km,rec_z_km,distance_km,travel_time_s\n' +
        this.rays.map(function (r) { return [r.shot + 1, r.ri + 1, L.fmt(L.km(r.s[0]), 3), L.fmt(L.km(r.s[1]), 3), L.fmt(L.km(r.r[0]), 3), L.fmt(L.km(r.r[1]), 3), L.fmt(L.km(r.d), 3), L.fmt(r.t / L.rate, 4)].join(','); }).join('\n');
    }
  });

  /* ======================================================================================
     5 · AMBIENT NOISE
     ====================================================================================== */
  L.register({
    id: 'noise', title: 'Ambient noise', physics: 'acoustic',
    goal: 'Two stations, nothing but random noise, and patience: cross-correlating their recordings turns the noise into the wave that travels between them.',
    tools: [],
    shareWhat: 'the model, the two stations and the noise distribution',
    st: { m: null, A: null, B: null, mode: 'ring', did: {} },
    noMarks: true, quiet: true,
    enter: function () {
      var st = this.st;
      if (st.m) L.model.load(st.m); else L.model.setPreset('homogeneous');
      L.setModel(); L.setBC('absorb');
      var a = st.A ? L.fromN(st.A, 4) : L.clampIn(L.nx * 0.38, L.ny * 0.5, 4), b = st.B ? L.fromN(st.B, 4) : L.clampIn(L.nx * 0.62, L.ny * 0.5, 4);
      this.sta = [{ x: a[0], y: a[1], code: 'A' }, { x: b[0], y: b[1], code: 'B' }];
      this.W = Math.round(3 * L.rate); this.Lg = Math.round(3 * L.rate); this.Lb = this.W + 2 * this.Lg + 4;
      this.flash = []; this.resetCC(); this.probes();
      L.setData('Noise at <b>A</b> and <b>B</b> → their cross-correlation', '');
    },
    probes: function () { L.setProbes(this.sta.map(function (p) { return [p.x, p.y]; })); },
    /* noise sources live in an annulus around the station pair (a stand-in for distant ocean or traffic noise) */
    ring: function () {
      var a = this.sta[0], b = this.sta[1], m = L.eng.B + 4, hx = (L.nx - 2 * m) / 2, hy = (L.ny - 2 * m) / 2;
      var d = Math.hypot(b.x - a.x, b.y - a.y) / 2, r2 = Math.max(hx, hy) * 1.15, r1 = Math.min(Math.max(d + 0.12 * L.nx, 0.55 * hy), r2 * 0.8);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r1: r1, r2: r2, m: m };
    },
    speedMul: function () { return 4; },
    resetCC: function () {
      this.rec = new L.Rec(this.sta, L.TR); this.a = new Float32Array(this.Lb); this.b = new Float32Array(this.Lb); this.cnt = 0;
      this.stack = new Float64Array(2 * this.Lg + 1); this.nWin = 0; this.rows = [];
      this.tAB = L.model.travelTime(this.sta[0].x, this.sta[0].y, this.sta[1].x, this.sta[1].y, L.rate);
    },
    save: function () { var st = this.st; st.m = L.model.serialize(); st.A = L.toN([this.sta[0].x, this.sta[0].y]); st.B = L.toN([this.sta[1].x, this.sta[1].y]); },
    serialize: function () { var st = this.st; return { m: st.m, A: st.A, B: st.B, mode: st.mode }; },
    load: function (o) { var st = this.st; st.m = o.m || null; st.A = o.A || null; st.B = o.B || null; st.mode = ['ring', 'side', 'off'].indexOf(o.mode) >= 0 ? o.mode : 'ring'; st.did = { place: true }; },
    snr: function () {
      if (!this.nWin) return 0;
      var Lg = this.Lg, st = this.stack, t = Math.round(this.tAB * L.rate), w = Math.round(0.12 * L.rate), pk = 0, e = 0, n = 0, i;
      for (i = -w; i <= w; i++) { if (t + i <= Lg) pk = Math.max(pk, Math.abs(st[Lg + t + i])); if (-t + i >= -Lg) pk = Math.max(pk, Math.abs(st[Lg - t + i])); }
      for (i = -Lg; i <= Lg; i++) if (Math.abs(Math.abs(i) - t) > 0.4 * L.rate) { e += st[Lg + i] * st[Lg + i]; n++; }
      return pk / Math.sqrt(e / Math.max(1, n) + 1e-30);
    },
    steps: function () {
      var st = this.st, d = st.did;
      return [
        { t: 'Place two stations', d: 'Drag A and B. Their distance sets the travel time t<sub>AB</sub> that should appear in the correlation.', done: !!d.place || this.nWin > 0 },
        { t: 'Switch on the noise', d: 'Weak sources pop off at random places and times in a ring around the stations, like distant ocean waves or traffic.', c: L.seg('nmode', [['off', 'Off'], ['ring', 'All around'], ['side', 'One side only']], st.mode), done: st.mode !== 'off' && this.nWin > 0 },
        { t: 'Let the stack converge', d: 'Every 3 s the two records are cross-correlated, and the result is added to the stack. The lower panel shows, row by row, how far the stack stands above its own noise: watch two bright lines appear.', c: '<p class="live" id="nLive">' + this.liveText() + '</p>', done: this.nWin >= 12 },
        { t: 'Read the correlation', d: 'Peaks at <b>±t<sub>AB</sub></b>: positive lag is the wave from A to B, negative lag the wave from B to A. Put the noise on <b>one side only</b> and one of the two disappears: the noise must come from the direction of the station line.', done: !!d.side && this.nWin >= 6 }
      ];
    },
    liveText: function () { return this.nWin ? this.nWin + ' windows (' + Math.round(this.nWin * this.W / L.rate) + ' s of noise) · SNR ' + L.fmt(this.snr(), 1) : 'no windows yet'; },
    explain: function () {
      return '<p><b>Noise interferometry.</b> If noise sources surround two receivers evenly, the long-time cross-correlation of their records, <code>C<sub>AB</sub>(τ) = ⟨p<sub>A</sub>(t)·p<sub>B</sub>(t + τ)⟩</code>, converges to the Green’s function between them (filtered by the noise spectrum): a wave as if A were a source and B a receiver, plus its time-reversed twin.</p>' +
        '<p><b>Stationary phase.</b> Only noise sources roughly in line with A and B contribute coherently; the rest averages out. That is why one-sided noise gives a one-sided correlation. Seismologists use this to image the crust from ocean-generated noise, without any earthquakes.</p>' +
        '<p><b>Here:</b> about 40 noise sources per second at random places in a ring around the two stations (or only on its left side), Ricker wavelets with random signs and amplitudes. Their peak frequencies vary by ±30 % to widen the noise band, and the clock runs four times faster than in the other experiments. Each 3-s window is correlated for lags of ±3 s and normalised by the energy of both records before stacking.</p>' + physicsExplain();
    },
    act: function (a, v) {
      var st = this.st;
      if (a === 'nmode') { st.mode = v; if (v === 'side') st.did.side = true; this.resetCC(); L.refresh(); }
      else if (a === 'restack') { this.resetCC(); L.refresh(); }
    },
    cta: function () { return this.st.mode === 'off' ? { label: 'Switch on the noise', act: 'nmode', val: 'ring' } : { label: 'Restart the stack', act: 'restack', disabled: !this.nWin }; },
    handles: function () { return this.sta.map(function (p, i) { return { x: p.x, y: p.y, id: i, dy: -8 }; }); },
    moveHandle: function (id, c) { this.sta[id].x = c[0]; this.sta[id].y = c[1]; this.probes(); },
    dropHandle: function () { this.resetCC(); this.st.did.place = true; L.refresh(); },
    tick: function (dt, n) {
      if (this.st.mode === 'off' || !n || L.dragging()) return;
      var lam = 40 * n / L.rate, k = 0, Lp = Math.exp(-lam), p = 1;
      do { k++; p *= Math.random(); } while (p > Lp && k < 60); k--;                                            /* Poisson count */
      var ring = this.ring(), side = this.st.mode === 'side';
      for (var q = 0; q < k; q++) {
        var x, y, tries = 0;
        do { var phi = side ? Math.PI + (Math.random() - 0.5) * 1.3 : Math.random() * 6.2832, r = ring.r1 + Math.random() * (ring.r2 - ring.r1);
             x = ring.x + r * Math.cos(phi); y = ring.y + r * Math.sin(phi); tries++; }
        while ((x < ring.m || y < ring.m || x > L.nx - 1 - ring.m || y > L.ny - 1 - ring.m) && tries < 30);
        if (tries >= 30) continue;
        L.eng.addSource({ x: x, y: y, amp: (Math.random() < 0.5 ? -1 : 1) * (0.06 + 0.14 * Math.random()), fmul: 0.75 + 0.6 * Math.random(), delay: Math.floor(Math.random() * n) });   /* random peak frequencies widen the band */
        this.flash.push({ x: x, y: y, t: performance.now() });
      }
      while (this.flash.length > 80) this.flash.shift();
    },
    onSamples: function (blk, n, nP) {
      this.rec.push(blk, n, nP, 0);
      var Lb = this.Lb, W = this.W, Lg = this.Lg;
      for (var s = 0; s < n; s++) {
        var i = this.cnt % Lb; this.a[i] = blk[(s * nP) * 2]; this.b[i] = blk[(s * nP + 1) * 2]; this.cnt++;
        if (this.cnt >= W + 2 * Lg && (this.cnt - W - 2 * Lg) % W === 0) this.window();
      }
    },
    window: function () {
      var Lb = this.Lb, W = this.W, Lg = this.Lg, a = this.a, b = this.b, end = this.cnt - Lg, start = end - W, ea = 0, eb = 0, t, l;
      for (t = start; t < end; t++) { var av = a[t % Lb], bv = b[t % Lb]; ea += av * av; eb += bv * bv; }
      if (ea < 1e-20 || eb < 1e-20) return;
      var cc = new Float32Array(2 * Lg + 1), nrm = 1 / Math.sqrt(ea * eb);
      for (l = -Lg; l <= Lg; l++) { var sum = 0; for (t = start; t < end; t++) sum += a[t % Lb] * b[(t + l) % Lb]; cc[l + Lg] = sum * nrm; }
      for (l = 0; l < cc.length; l++) this.stack[l] += cc[l];
      this.nWin++; this.rows.push(Float32Array.from(this.stack)); if (this.rows.length > 40) this.rows.shift();   /* running stack after this window */
      L.text('nLive', this.liveText());
      if (this.nWin === 1 || this.nWin === 12 || this.nWin === 6) L.refresh();
    },
    hud: function () { return [this.st.mode === 'off' ? 'Noise off' : (this.st.mode === 'side' ? 'Noise from one side' : 'Noise all around'), '4× time-lapse', 't = ' + L.fmt(L.eng.n / L.rate, 0) + ' s']; },
    legend: function () { return L.legendAcoustic() + '<span>○ noise source</span>'; },
    overlay: function (ctx) {
      var pal = L.pal, now = performance.now();
      this.flash.forEach(function (f) { var age = (now - f.t) / 900; if (age < 1) { ctx.beginPath(); ctx.arc(L.sx(f.x), L.sy(f.y), 2 + 8 * age, 0, 6.2832); ctx.strokeStyle = L.rgba(pal.ink, 0.45 * (1 - age)); ctx.lineWidth = 1; ctx.stroke(); } });
      var a = this.sta[0], b = this.sta[1];
      ctx.setLineDash([4, 5]); ctx.strokeStyle = L.rgba(pal.ink, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L.sx(a.x), L.sy(a.y)); ctx.lineTo(L.sx(b.x), L.sy(b.y)); ctx.stroke(); ctx.setLineDash([]);
      L.label(ctx, L.fmt(L.km(Math.hypot(b.x - a.x, b.y - a.y)), 1) + ' km · t_AB ≈ ' + L.fmt(this.tAB, 2) + ' s', (L.sx(a.x) + L.sx(b.x)) / 2, (L.sy(a.y) + L.sy(b.y)) / 2 + 16);
      stations(ctx, this.sta);
    },
    data: function (ctx, w, h) {
      var pal = L.pal, narrow = w < 640, lw = narrow ? 0 : Math.round(w * 0.3), X2 = narrow ? 14 : lw + 26, W2 = w - X2 - 14, Lg = this.Lg, k, i;
      if (!narrow) {
        L.panelLabel(ctx, 'RAW NOISE · LAST 6 S', 14, 2);
        L.drawSection(ctx, 14, 16, lw, h - 38, this.rec, { left: 18, gain: 0.45 });
        L.timeAxis(ctx, 32, h - 20, lw - 18, 6, this.rec.len, L.eng.n);
      }
      var H1 = Math.round((h - 34) * 0.48), y1 = 16, xs = function (l) { return X2 + (l + Lg) / (2 * Lg) * W2; };
      L.panelLabel(ctx, 'CORRELATION STACK C_AB(τ) · ' + this.nWin + ' WINDOWS', X2, 2);
      ctx.strokeStyle = pal.tick; ctx.strokeRect(X2 + 0.5, y1 + 0.5, W2 - 1, H1 - 1);
      var tl = this.tAB * L.rate;
      [-tl, tl].forEach(function (l) { if (Math.abs(l) <= Lg) { ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(' + pal.origin + ',.75)'; ctx.beginPath(); ctx.moveTo(xs(l), y1); ctx.lineTo(xs(l), y1 + H1 + (h - 34 - H1)); ctx.stroke(); ctx.setLineDash([]); } });
      L.font(ctx, 9); ctx.fillStyle = 'rgba(' + pal.origin + ',.95)'; ctx.textBaseline = 'top';
      if (tl <= Lg) { ctx.textAlign = 'left'; ctx.fillText('A→B  +t_AB', xs(tl) + 4, y1 + 3); ctx.textAlign = 'right'; ctx.fillText('−t_AB  B→A', xs(-tl) - 4, y1 + 3); }
      ctx.strokeStyle = pal.tick; ctx.beginPath(); ctx.moveTo(xs(0) + 0.5, y1); ctx.lineTo(xs(0) + 0.5, y1 + H1); ctx.stroke();
      if (this.nWin) {
        var st = this.stack, m = 1e-12; for (i = 0; i < st.length; i++) m = Math.max(m, Math.abs(st[i]));
        var stride = Math.max(1, Math.floor(st.length / (W2 * 1.5)));
        ctx.beginPath(); for (i = 0; i < st.length; i += stride) { var yy = y1 + H1 / 2 - st[i] / m * (H1 / 2 - 4); if (i) ctx.lineTo(xs(i - Lg), yy); else ctx.moveTo(xs(-Lg), yy); }
        ctx.strokeStyle = pal.trace; ctx.lineWidth = 1.3; ctx.stroke();
      } else { L.font(ctx, 10, 400); ctx.fillStyle = pal.label; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.st.mode === 'off' ? 'switch on the noise' : 'collecting the first 3-s window…', X2 + W2 / 2, y1 + H1 / 2); }
      /* emergence: every window's correlation as one row, newest at the bottom */
      var y2 = y1 + H1 + 6, H2 = h - 34 - H1 - 6, rows = this.rows, nr = 40, rh = H2 / nr;
      L.font(ctx, 9); ctx.fillStyle = pal.label; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.strokeStyle = pal.tick; ctx.strokeRect(X2 + 0.5, y2 + 0.5, W2 - 1, H2 - 1);
      var cols = Math.min(2 * Lg + 1, Math.round(W2)), bin = (2 * Lg + 1) / cols, cw = W2 / cols;
      var half = Math.max(1, Math.round(0.5 / L.eng.f0)), b0 = pal.bg, hc = pal.hot;
      for (k = 0; k < rows.length; k++) {
        var row = rows[k], n2 = row.length, csum = new Float64Array(n2 + 1), e2 = 0;
        for (i = 0; i < n2; i++) { csum[i + 1] = csum[i] + Math.abs(row[i]); e2 += row[i] * row[i]; }
        var rms = Math.sqrt(e2 / n2) + 1e-12, yr = y2 + H2 - (rows.length - k) * rh;
        for (var c = 0; c < cols; c++) {
          var j0 = Math.floor(c * bin), lo2 = Math.max(0, j0 - half), hi2 = Math.min(n2, j0 + half + 1);
          var env = (csum[hi2] - csum[lo2]) / (hi2 - lo2) / rms, a = Math.max(0, Math.min(1, (env - 0.9) / 2.2));   /* envelope in units of the row's RMS */
          ctx.fillStyle = 'rgb(' + ((b0[0] + (hc[0] - b0[0]) * a) | 0) + ',' + ((b0[1] + (hc[1] - b0[1]) * a) | 0) + ',' + ((b0[2] + (hc[2] - b0[2]) * a) | 0) + ')';
          ctx.fillRect(X2 + c * cw, yr, cw + 0.5, rh + 0.5);
        }
      }
      L.font(ctx, 9); ctx.fillStyle = pal.label; ctx.textBaseline = 'top';
      ctx.textAlign = 'left'; ctx.fillText('−' + L.fmt(Lg / L.rate, 0) + ' s', X2, h - 14); ctx.textAlign = 'center'; ctx.fillText(W2 > 520 ? 'lag τ · rows: stack envelope / RMS after each window, newest last' : 'lag τ', X2 + W2 / 2, h - 14); ctx.textAlign = 'right'; ctx.fillText('+' + L.fmt(Lg / L.rate, 0) + ' s', X2 + W2, h - 14);
    },
    csv: function () {
      if (!this.nWin) return null;
      var Lg = this.Lg, rows = ['lag_s,stack_normalised'];
      for (var i = 0; i < this.stack.length; i++) rows.push(L.fmt((i - Lg) / L.rate, 4) + ',' + (this.stack[i] / this.nWin).toExponential(5));
      return '# Wave Lab · ambient-noise cross-correlation stack C_AB · ' + this.nWin + ' windows of 3 s · t_AB = ' + L.fmt(this.tAB, 3) + ' s\n' + rows.join('\n');
    }
  });

  /* ======================================================================================
     6 · ELASTIC WAVES
     ====================================================================================== */
  var KINDS = [['0', 'Explosion'], ['1', 'Shear'], ['2', 'Vertical force']], KMUL = [1, 0.35, 2.2];   /* shear sources radiate ~5× more S than P: scaled down so both stay readable */
  L.register({
    id: 'elastic', title: 'Elastic waves', physics: 'elastic',
    goal: 'Rock is solid, so it carries two kinds of body waves, P and S, and, along the free surface, the slow and strong Rayleigh wave.',
    tools: ['quake', '|', 'slow', 'fast', 'erase', 'scatter'],
    shareWhat: 'the model, your edits, the source type and the station',
    st: { m: null, kind: 0, sx: null, did: {} },
    ampRef: 0.12,
    enter: function () {
      var st = this.st;
      if (st.m) L.model.load(st.m); else L.model.setPreset('homogeneous');
      L.setModel(); L.setBC('free');
      var x = st.sx != null ? Math.round(st.sx * L.nx) : Math.round(L.nx * 0.72);
      this.sta = [{ x: Math.max(4, Math.min(L.nx - 5, x)), y: 0.5, code: 'YW01' }];
      this.rec = new L.Rec(this.sta, L.TR); this.last = null;
      L.setProbes([[this.sta[0].x, 0.5]]);
      /* calibrated amplitudes and display gains. The field is shown as |∇·v| (P) and |∇×v| (S) per cell; for a fixed
         physical source these scale as 1/ppw², so source amplitude and gain both grow ∝ ppw (seismograms stay put).
         Measured on a homogeneous grid, M 3 explosion at 0.25 widths: |∇·v| ≈ 0.074 · (21/ppw)² → displayed ≈ 0.6. */
      var f = L.eng.ppw / 21; this.ampK = f; this.g = 8.1 * f;
      L.setData('Station <b>YW01</b> on the surface · ground velocity · Z (up) and X (right) · last 6 s', '');
      if (!st.did.shallow) { var self = this; setTimeout(function () { if (S.ch === 'elastic' && L.eng) self.fireAt(Math.round(L.nx * 0.3), 3, 3); }, 350); }
    },
    quakeOpts: function () { return { kind: this.st.kind, ampMul: this.ampK * KMUL[this.st.kind] }; },
    /* a Rayleigh wave decays within about one wavelength of the surface: clicks in the top strip snap to 3 cells depth */
    down: function (c) {
      if (S.tool !== 'quake' || c[1] > 0.07 * L.ny) return false;
      var s = L.quake(c[0], 3, this.quakeOpts()); this.onQuake(s); return true;
    },
    fireAt: function (x, y, M) { var s = L.quake(x, y, { mag: M, kind: this.st.kind, ampMul: this.ampK * KMUL[this.st.kind], sound: false }); this.onQuake(s); },
    onQuake: function (s) {
      var st = this.st, p = this.sta[0], d = Math.hypot(s.x - p.x, s.y - p.y), tp = L.model.travelTime(s.x, s.y, p.x, 1, L.rate) + (Math.round(1.2 / L.eng.f0) / L.rate);
      var tpOnly = L.model.travelTime(s.x, s.y, p.x, 1, L.rate);
      this.last = { n: L.eng.n, x: s.x, y: s.y, tp: tp, ts: Math.sqrt(3) * tpOnly + (tp - tpOnly), d: d };
      var f = false;
      if (s.y <= 0.07 * L.ny && !st.did.shallow) { st.did.shallow = true; f = true; }
      if (s.y > 0.3 * L.ny && !st.did.deep) { st.did.deep = true; f = true; }
      if (f) L.refresh(); this.liveSP();
    },
    liveSP: function () {
      var r = this.last; if (!r) return;
      var dt = r.ts - r.tp, vp = 2.5 * this.vAt(r);
      L.html('spLive', '<dl class="kv"><dt>Distance to YW01</dt><dd>' + L.fmt(L.km(r.d), 1) + ' km</dd><dt>Predicted S − P</dt><dd>' + L.fmt(dt, 2) + ' s</dd>' +
        '<dt>Mean V<sub>P</sub> on the path</dt><dd>' + L.fmt(vp, 2) + ' km/s</dd><dt>Δt · V<sub>P</sub> / (√3 − 1)</dt><dd>' + L.fmt(dt * vp / (Math.sqrt(3) - 1), 1) + ' km</dd></dl>');
    },
    vAt: function (r) { var p = this.sta[0], L1 = Math.hypot(r.x - p.x, r.y - 1); return L1 / Math.max(1e-6, (r.tp - Math.round(1.2 / L.eng.f0) / L.rate) * L.rate * C); },
    save: function () { this.st.m = L.model.serialize(); this.st.sx = +(this.sta[0].x / L.nx).toFixed(4); },
    serialize: function () { var st = this.st; return { m: st.m, kind: st.kind, sx: st.sx }; },
    load: function (o) { var st = this.st; st.m = o.m || null; st.kind = +o.kind || 0; st.sx = o.sx != null ? o.sx : null; st.did = { shallow: true }; },
    steps: function () {
      var st = this.st, d = st.did;
      return [
        { t: 'Click just below the surface', d: 'Look for the slow, strong wave hugging the top edge: a <b>Rayleigh wave</b>. The ground under the station moves in ellipses (particle-motion plot, bottom right).', done: !!d.shallow },
        { t: 'Click deep below the station', d: '<b>P</b> arrives first, <b>S</b> later. The S − P time grows with distance: <code>d ≈ Δt<sub>S−P</sub> · V<sub>P</sub>V<sub>S</sub> / (V<sub>P</sub> − V<sub>S</sub>)</code>, the oldest trick for locating earthquakes.', c: '<div id="spLive"></div>', done: !!d.deep },
        { t: 'Change the source', d: 'An explosion radiates P only. A shear dislocation (a small fault) radiates mostly S, in four lobes. A vertical force is a hammer blow, the classic Lamb problem.', c: L.seg('kind', KINDS, String(st.kind)), done: !!d.kind },
        { t: 'Try a layered crust', d: 'At every interface part of the P energy converts into S, and back: the extra arrivals in the seismogram.', c: modelChips(L.model.preset, 'preset', { noMap: true }), done: !!d.model }
      ];
    },
    explain: function () {
      var e = L.eng;
      return '<p><b>Equations.</b> Momentum balance and Hooke’s law for an isotropic solid, as a first-order system: <code>ρ ∂v/∂t = ∇·σ</code>, <code>∂σ/∂t = λ (∇·v) I + μ (∇v + ∇vᵀ)</code>, in the vertical plane (P-SV). ρ = 1 and λ = μ, so V<sub>S</sub> = V<sub>P</sub>/√3 everywhere.</p>' +
        '<p><b>Numerics.</b> Velocity–stress finite differences on a staggered grid (Virieux 1986), 2nd order, on ' + e.nx + ' × ' + e.ny + ' cells ' + (e.backend === 'gpu' ? 'on the GPU' : 'on the CPU (a coarser grid; switch to the GPU solver in Settings for a finer one)') + '. Peak frequency ' + L.fmt(e.fHz, 1) + ' Hz, ' + Math.round(e.ppw) + ' grid points per P wavelength at v = 1.</p>' +
        '<p><b>Free surface.</b> The top edge is traction-free: σ<sub>zz</sub> = 0 on it and σ<sub>xz</sub> is mirrored with opposite sign above it (stress imaging). The other edges absorb.</p>' +
        '<p><b>Colours.</b> Cyan is the divergence ∇·v (volume change: P waves), amber the curl ∇×v (rotation: S waves). The seismograms show the ground velocity at the surface: Z positive up, X positive to the right.</p>';
    },
    act: function (a, v) {
      var st = this.st;
      if (a === 'kind') { st.kind = +v; st.did.kind = true; L.refresh(); }
      else if (a === 'preset') { L.model.setPreset(v, L.model.seed); L.setModel(); st.did.model = true; L.refresh(); }
      else if (a === 'reroll') { L.model.setPreset('layered', 2 + Math.floor(Math.random() * 1e6)); L.setModel(); L.refresh(); }
    },
    handles: function () { var p = this.sta[0]; return [{ x: p.x, y: 0.5, id: 0, dy: -8 }]; },
    moveHandle: function (id, c) { this.sta[0].x = c[0]; L.setProbes([[c[0], 0.5]]); },
    onSamples: function (b, n, nP) { this.rec.push(b, n, nP, 0); },
    gain: function () { return this.g; }, gain2: function () { return this.g; },
    legend: function () { return '<span><i class="sw" style="background:var(--cyan)"></i>P · |∇·v|</span><span><i class="sw" style="background:var(--amber)"></i>S · |∇×v|</span>' + L.legendVel(); },
    overlay: function (ctx) { stations(ctx, this.sta); },
    data: function (ctx, w, h) {
      var pal = L.pal, narrow = w < 640, hw = narrow ? 0 : Math.min(200, Math.round(h * 0.95)), Wt = w - 28 - (hw ? hw + 18 : 0), H = h - 26, half = H / 2, rec = this.rec;
      var mz = 1e-9, k, i;
      for (i = 0; i < rec.len; i++) { mz = Math.max(mz, Math.abs(rec.z[0][i]), Math.abs(rec.x[0][i])); }
      rec.peak = Math.max(mz, rec.peak * 0.995, 1e-6);
      var amp = (half / 2 - 3) / rec.peak, stride = Math.max(1, Math.floor(rec.len / (Wt * 1.5)));
      [0, 1].forEach(function (c) {
        var y0 = 4 + half * (c + 0.5); L.font(ctx, 9); ctx.fillStyle = pal.label; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(c ? 'X' : 'Z', 14, y0);
        ctx.beginPath(); for (k = 0; k < rec.len; k += stride) { var yy = y0 - Math.max(-half / 2, Math.min(half / 2, rec.get(0, k, c) * amp)); if (k) ctx.lineTo(28 + k / (rec.len - 1) * (Wt - 14), yy); else ctx.moveTo(28, yy); }
        ctx.strokeStyle = c ? L.rgba(pal.sw, 0.95) : pal.trace; ctx.lineWidth = 1.2; ctx.stroke();
      });
      var r = this.last;
      if (r) {
        [['origin', 0], ['P', r.tp], ['S', r.ts]].forEach(function (m) {
          var age = L.eng.n - r.n - m[1] * L.rate; if (age < 0 || age > rec.len) return;
          var xm = 28 + (Wt - 14) - age / rec.len * (Wt - 14);
          ctx.strokeStyle = m[0] === 'origin' ? 'rgba(' + pal.origin + ',.7)' : (m[0] === 'P' ? L.rgba(pal.pos, 0.8) : L.rgba(pal.sw, 0.85)); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xm + 0.5, 4); ctx.lineTo(xm + 0.5, 4 + H); ctx.stroke(); ctx.setLineDash([]);
          L.font(ctx, 9); ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(m[0] === 'origin' ? 'origin' : 'predicted ' + m[0], xm + 3, 4);
        });
      }
      L.timeAxis(ctx, 28, h - 20, Wt - 14, 6, rec.len, L.eng.n);
      if (!hw) return;
      /* particle motion over the last 1.2 s: X horizontal, Z vertical */
      var x0 = w - 14 - hw, y0 = 16, S2 = Math.min(hw, H - 14), n = Math.round(1.2 * L.rate), pm = 1e-9;
      L.panelLabel(ctx, 'PARTICLE MOTION · LAST 1.2 S', x0, 2);
      ctx.strokeStyle = pal.tick; ctx.strokeRect(x0 + 0.5, y0 + 0.5, S2 - 1, S2 - 1);
      ctx.beginPath(); ctx.moveTo(x0 + S2 / 2, y0); ctx.lineTo(x0 + S2 / 2, y0 + S2); ctx.moveTo(x0, y0 + S2 / 2); ctx.lineTo(x0 + S2, y0 + S2 / 2); ctx.stroke();
      for (i = rec.len - n; i < rec.len; i++) pm = Math.max(pm, Math.abs(rec.get(0, i, 0)), Math.abs(rec.get(0, i, 1)));
      pm = Math.max(pm, 0.06 * rec.peak);
      for (i = rec.len - n + 1; i < rec.len; i += 1) {
        var a = (i - (rec.len - n)) / n;
        ctx.strokeStyle = L.rgba(pal.ink, 0.15 + 0.8 * a); ctx.lineWidth = 1.2; ctx.beginPath();
        ctx.moveTo(x0 + S2 / 2 + rec.get(0, i - 1, 1) / pm * (S2 / 2 - 6), y0 + S2 / 2 - rec.get(0, i - 1, 0) / pm * (S2 / 2 - 6));
        ctx.lineTo(x0 + S2 / 2 + rec.get(0, i, 1) / pm * (S2 / 2 - 6), y0 + S2 / 2 - rec.get(0, i, 0) / pm * (S2 / 2 - 6)); ctx.stroke();
      }
      L.font(ctx, 9); ctx.fillStyle = pal.label; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('X →', x0 + S2 - 3, y0 + S2 / 2 - 2); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('Z ↑', x0 + S2 / 2 + 3, y0 + 2);
    },
    csv: function () { return L.recCSV(this.rec, ['Z_up', 'X_right'], 'ground velocity, arbitrary units'); }
  });

  L.start();
})();
