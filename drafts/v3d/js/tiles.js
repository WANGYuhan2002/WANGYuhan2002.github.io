/* v3d · LIVE EARTH — everything except the globe: theme, clocks, tile motion, and the small instruments
   (real seismogram, 893-against-17,325 dots, the cable drawing, a synthetic DAS record, a toy wavefield, photos). */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduce = mq.matches;
  var fine = window.matchMedia ? window.matchMedia('(hover:hover) and (pointer:fine)').matches : false;
  var touch = window.matchMedia ? window.matchMedia('(hover:none)').matches : false;
  var TAU = Math.PI * 2;
  function css(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad(s % 60); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* size a canvas to its CSS box; returns [w, h, ctx] in CSS pixels. The box comes from the ResizeObserver
     (layout size, untouched by the tile tilt), so painting never forces a layout. */
  function fit(c) {
    var d = dpr(), w = c._cw, h = c._ch;
    if (w == null) { var r = c.getBoundingClientRect(); w = r.width; h = r.height; }
    w = Math.max(1, w); h = Math.max(1, h);
    if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
    var x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return [w, h, x];
  }
  function rng(seed) { var s = seed || 1; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

  /* ------------------------- one loop for all small canvases ------------------------- */
  var anims = [], rafId = 0, lastT = 0;
  var io = window.IntersectionObserver ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { anims.forEach(function (a) { if (a.el === e.target) { a.on = e.isIntersecting; if (a.on && a.seen) { a.seen(); a.seen = null; } } }); });
    kick();
  }, { threshold: 0.12 }) : null;
  function loop(t) {
    rafId = 0; if (document.hidden) return;
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0), any = false; lastT = t;
    for (var i = 0; i < anims.length; i++) if (anims[i].on && anims[i].fn(t, dt) !== false) any = true;
    if (any) rafId = requestAnimationFrame(loop);
  }
  function kick() { if (!rafId && !document.hidden) { lastT = performance.now(); rafId = requestAnimationFrame(loop); } }
  function animate(el, fn, seen) { var a = { el: el, fn: fn, on: !io, seen: seen || null }; anims.push(a); if (io) io.observe(el); else if (seen) { seen(); a.seen = null; } kick(); return a; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  function onResize(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(function (es) { es.forEach(function (e) { e.target._cw = e.contentRect.width; e.target._ch = e.contentRect.height; }); fn(); }).observe(el);
    else window.addEventListener('resize', function () { el._cw = el._ch = null; fn(); });
  }
  /* say "tap" on touch screens */
  [].slice.call(document.querySelectorAll('[data-verb]')).forEach(function (s) { if (touch) s.textContent = 'Tap'; });

  /* ------------------------------ theme ------------------------------ */
  (function () {
    var btn = $('themeBtn'), meta = document.querySelector('meta[name="theme-color"]');
    function stored() { try { return localStorage.getItem('yw-v3d-theme'); } catch (e) { return null; } }
    function apply(t, save) {
      root.setAttribute('data-theme', t); if (meta) meta.setAttribute('content', t === 'dark' ? '#05070b' : '#f2f3f5');
      if (btn) btn.setAttribute('aria-label', t === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme');
      if (save) { try { localStorage.setItem('yw-v3d-theme', t); } catch (e) {} }
      document.dispatchEvent(new CustomEvent('yw-theme', { detail: t }));
    }
    apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
    if (btn) btn.addEventListener('click', function () { apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true); });
    if (window.matchMedia) { var m = window.matchMedia('(prefers-color-scheme: dark)'); if (m.addEventListener) m.addEventListener('change', function (e) { if (!stored()) apply(e.matches ? 'dark' : 'light', false); }); }
  })();

  /* ------------------------------ e-mail, clocks ------------------------------ */
  (function () {
    var user = 'yuhan.wang', domain = 'eaps.ethz.ch', addr = user + '@' + domain;
    document.querySelectorAll('[data-mail]').forEach(function (a) { a.href = 'mailto:' + addr; });
    document.querySelectorAll('[data-mail-text]').forEach(function (s) { s.textContent = addr; });
    var utc = $('utc'), zh = $('zhTime'), zone = $('zhZone'), fmt = null, fz = null;
    try {
      fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      fz = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', timeZoneName: 'short' });
    } catch (e) {}
    function tick() {
      var d = new Date();
      if (utc) utc.textContent = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
      if (zh && fmt) zh.textContent = fmt.format(d);
      if (zone && fz) { var p = fz.formatToParts ? fz.formatToParts(d).filter(function (x) { return x.type === 'timeZoneName'; })[0] : null; zone.textContent = p ? p.value : ''; }
    }
    tick(); setInterval(tick, 1000);
  })();

  /* ------------------------------ tiles: entrance, tilt, counters ------------------------------ */
  (function () {
    var items = [].slice.call(document.querySelectorAll('.tile, .sec'));
    if (window.IntersectionObserver && !reduce) {
      var eo = new IntersectionObserver(function (es) {
        var k = 0;
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          var el = e.target; eo.unobserve(el);
          el.style.transitionDelay = (k++ * 70) + 'ms'; el.classList.add('in');
          setTimeout(function () { el.style.transitionDelay = ''; }, 1000 + k * 70);
          count(el);
        });
      }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
      items.forEach(function (el) { eo.observe(el); });
    } else items.forEach(function (el) { el.classList.add('in'); });

    function count(scope) {
      [].slice.call(scope.querySelectorAll('[data-count]')).forEach(function (el) {
        var to = +el.getAttribute('data-count'), t0 = performance.now(), dur = 1700; el.removeAttribute('data-count');
        (function f(t) { var x = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - x, 4); el.textContent = Math.round(to * e).toLocaleString('en-US'); if (x < 1) requestAnimationFrame(f); })(t0);
      });
    }

    if (fine && !reduce) [].slice.call(document.querySelectorAll('.tile[data-tilt]')).forEach(function (el) {
      var raf = 0, ev = null;
      function put() {
        raf = 0; if (!ev) return;
        var r = el.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height, k = Math.min(2.4, 900 / Math.max(r.width, r.height));
        el.style.setProperty('--rx', ((0.5 - y) * 2 * k).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((x - 0.5) * 2 * k).toFixed(2) + 'deg');
        el.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      }
      el.addEventListener('pointerenter', function () { el.classList.add('hov'); });
      el.addEventListener('pointermove', function (e) { ev = e; if (!raf) raf = requestAnimationFrame(put); });
      el.addEventListener('pointerleave', function () { ev = null; el.classList.remove('hov'); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
    else [].slice.call(document.querySelectorAll('.tile[data-tilt]')).forEach(function (el) {
      el.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') el.classList.add('hov'); });
      el.addEventListener('pointerleave', function () { el.classList.remove('hov'); });
    });
  })();

  /* ------------------------------ the real seismogram ------------------------------ */
  (function () {
    var SE = window.YW_SEIS, c = $('seis'), read = $('seisRead'); if (!SE || !c || !c.getContext) return;
    var M = SE.meta, band = 'bb', W = 0, H = 0, x = null, prog = reduce ? 1 : 0, go = reduce, hov = -1, env = null, peak = 1, peakT = 0;
    var T0 = M.t_start_rel, FS = M.fs, TEND = 4800, N = Math.min(SE.bb.length, Math.round((TEND - T0) * FS));
    var PL = 46, PR = 26, PT = 30, PB = 24;
    /* surface waves: from a group velocity of 4.0 km/s on; in this band their energy lasts to about 2.2 km/s,
       so the shading fades out instead of ending at a hard edge */
    var LR0 = M.dist_km / 4.0, LR1 = M.dist_km / 2.2;
    function tx(t) { return PL + (t - T0) / (TEND - T0) * (W - PL - PR); }
    function scan() {
      var d = SE[band], pw = Math.max(10, Math.round(W - PL - PR)), mn = new Float32Array(pw), mx = new Float32Array(pw), i, j, p = 0, pi = 0;
      for (i = 0; i < pw; i++) {
        var a = Math.floor(i / pw * N), b = Math.max(a + 1, Math.floor((i + 1) / pw * N)), lo = 1e9, hi = -1e9;
        for (j = a; j < b && j < N; j++) { var v = d[j]; if (v < lo) lo = v; if (v > hi) hi = v; if (Math.abs(v) > p) { p = Math.abs(v); pi = j; } }
        mn[i] = lo; mx[i] = hi;
      }
      env = { mn: mn, mx: mx, pw: pw }; peak = p || 1; peakT = T0 + pi / FS;
    }
    function ums(v) { return v / 32000 * (band === 'bb' ? M.peak_bb : M.peak_lp) * 1e6; }
    function rest() {
      if (!read) return;
      read.innerHTML = '<span>Move over the trace to read it.</span><span>P <b>' + mmss(M.phases.P) + '</b> · S <b>' + mmss(M.phases.S) + '</b> · largest motion <b>' + Math.round(ums(peak)) + ' µm/s</b> at <b>' + mmss(peakT) + '</b></span>';
    }
    function draw() {
      var f = fit(c); W = f[0]; H = f[1]; x = f[2];
      if (!env || env.pw !== Math.max(10, Math.round(W - PL - PR))) scan();
      var ink = css('--ink'), muted = css('--muted'), line = css('--line'), line2 = css('--line2'), acc = css('--accent'), accT = css('--accent-text'), faint = css('--faint');
      var mid = PT + (H - PT - PB) / 2, amp = (H - PT - PB) / 2 / (peak * 1.06), i;
      x.clearRect(0, 0, W, H);
      x.font = '400 10px "Geist Mono",ui-monospace,Menlo,monospace'; x.textBaseline = 'middle'; x.lineWidth = 1;
      /* time axis */
      var narrow = W < 460;
      for (var m = 0; m <= 80; m += 10) {
        var gx = Math.round(tx(m * 60)) + 0.5;
        x.strokeStyle = line; x.beginPath(); x.moveTo(gx, PT); x.lineTo(gx, H - PB); x.stroke();
        if (narrow && m % 20) continue;
        x.fillStyle = muted; x.textAlign = 'center'; x.fillText(m === 0 ? (narrow ? '0' : 'origin') : m + (m === 80 ? ' min' : ''), gx, H - 9);
      }
      /* amplitude axis, µm/s */
      var full = ums(peak), stepV = full > 300 ? 200 : full > 150 ? 100 : full > 60 ? 50 : 20;
      x.textAlign = 'right';
      for (var v = -Math.floor(full / stepV) * stepV; v <= full; v += stepV) {
        var gy = Math.round(mid - v / full * peak * amp) + 0.5;
        x.strokeStyle = v === 0 ? line2 : line; x.beginPath(); x.moveTo(PL, gy); x.lineTo(W - PR, gy); x.stroke();
        x.fillStyle = muted; x.fillText((v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v), PL - 8, gy);
      }
      x.save(); x.translate(10, mid); x.rotate(-Math.PI / 2); x.textAlign = 'center'; x.fillStyle = muted; x.fillText('µm/s', 0, 0); x.restore();
      /* surface waves: shaded from 4 km/s, fading out towards 2.2 km/s */
      var bx0 = tx(LR0), bx1 = Math.min(W - PR, tx(LR1)), soft = css('--accent-soft'), gr = x.createLinearGradient(bx0, 0, bx1, 0);
      gr.addColorStop(0, soft); gr.addColorStop(0.55, soft); gr.addColorStop(1, 'rgba(255,90,54,0)');
      x.fillStyle = gr; x.fillRect(bx0, PT, bx1 - bx0, H - PT - PB);
      /* the trace: min-max envelope per pixel */
      x.save(); x.beginPath(); x.rect(PL, 0, (W - PL - PR) * prog + 1, H); x.clip();
      x.beginPath();
      for (i = 0; i < env.pw; i++) { var px = PL + i + 0.5, y1 = mid - env.mx[i] * amp; if (i) x.lineTo(px, y1); else x.moveTo(px, y1); }
      for (i = env.pw - 1; i >= 0; i--) x.lineTo(PL + i + 0.5, mid - env.mn[i] * amp + 0.6);
      x.closePath(); x.fillStyle = ink; x.fill(); x.strokeStyle = ink; x.lineWidth = 0.8; x.lineJoin = 'round'; x.stroke();
      x.restore();
      /* phase marks */
      var marks = [['P', M.phases.P, 1], ['PP', M.phases.PP, 0], ['S', M.phases.S, 1], ['SS', M.phases.SS, 0]];
      x.textAlign = 'center';
      for (i = 0; i < marks.length; i++) {
        var mk = marks[i], mx_ = Math.round(tx(mk[1])) + 0.5; if (tx(mk[1]) > PL + (W - PL - PR) * prog) continue;
        x.strokeStyle = mk[2] ? acc : faint; x.lineWidth = 1; if (!mk[2]) x.setLineDash([2, 3]);
        x.beginPath(); x.moveTo(mx_, PT - 6); x.lineTo(mx_, H - PB); x.stroke(); x.setLineDash([]);
        x.font = (mk[2] ? '600 11px' : '400 10px') + ' "Geist Mono",ui-monospace,Menlo,monospace';
        x.fillStyle = mk[2] ? accT : muted; if (mk[2] || !narrow) x.fillText(mk[0], mx_, PT - 15);
      }
      x.font = '400 10px "Geist Mono",ui-monospace,Menlo,monospace'; x.fillStyle = accT; x.textAlign = 'left';
      if (bx1 - bx0 > 100) x.fillText('SURFACE WAVES →', bx0 + 6, PT - 15);
      x.strokeStyle = acc; x.beginPath(); x.moveTo(bx0, PT - 6.5); x.lineTo(bx0 + (bx1 - bx0) * 0.55, PT - 6.5); x.stroke();
      /* crosshair */
      if (hov >= 0) {
        var d = SE[band], val = d[hov], t = T0 + hov / FS, hx = Math.round(tx(t)) + 0.5, hy = mid - val * amp;
        x.strokeStyle = line2; x.beginPath(); x.moveTo(hx, PT); x.lineTo(hx, H - PB); x.stroke();
        x.fillStyle = acc; x.beginPath(); x.arc(hx, hy, 4, 0, TAU); x.fill(); x.strokeStyle = css('--tile'); x.lineWidth = 1.5; x.stroke();
      }
    }
    function step(t, dt) { if (go && prog < 1) { prog = Math.min(1, prog + dt / 2.2); draw(); return true; } return false; }
    animate(c, step, function () { go = true; kick(); });
    function at(e) {
      var r = c.getBoundingClientRect(), fx = (e.clientX - r.left - PL) / (r.width - PL - PR);
      if (fx < 0 || fx > 1) { leave(); return; }
      hov = Math.max(0, Math.min(N - 1, Math.round(fx * N)));
      var t = T0 + hov / FS, v = ums(SE[band][hov]), near = '';
      [['P', M.phases.P], ['PP', M.phases.PP], ['S', M.phases.S], ['SS', M.phases.SS]].forEach(function (p) { if (Math.abs(t - p[1]) < 25) near = ' · <em>' + p[0] + ' arrives</em>'; });
      if (!near && t > LR0 && t < LR1) near = ' · <em>surface waves</em>';
      if (!near && t < M.phases.P) near = t < 0 ? ' · before the earthquake' : ' · waves still on their way';
      if (read) read.innerHTML = '<span>' + (t < 0 ? 'origin − <b>' + mmss(-t) : 'origin + <b>' + mmss(t)) + '</b>' + near + '</span><span>ground velocity <b>' + (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1) + ' µm/s</b></span>';
      draw();
    }
    function leave() { if (hov >= 0) { hov = -1; rest(); draw(); } }
    c.addEventListener('pointermove', at); c.addEventListener('pointerdown', at); c.addEventListener('pointerleave', leave);
    [].slice.call(document.querySelectorAll('.seg [data-band]')).forEach(function (b) {
      b.addEventListener('click', function () {
        band = b.getAttribute('data-band'); env = null; hov = -1;
        [].slice.call(b.parentNode.children).forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        draw(); rest();
      });
    });
    var sP = $('sP'), sPk = $('sPeak'), sD = $('sDist');
    if (sP) sP.textContent = Math.floor(M.phases.P / 60) + ' min ' + Math.round(M.phases.P % 60) + ' s';
    if (sPk) sPk.textContent = Math.round(M.peak_bb * 1e6) + ' µm/s';
    if (sD) sD.textContent = M.dist_km.toLocaleString('en-US') + ' km';
    onResize(c, function () { env = null; draw(); });
    document.addEventListener('yw-theme', draw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    draw(); rest();
  })();

  /* ------------------------------ 893 against 17,325 ------------------------------ */
  (function () {
    var c = $('dots'); if (!c || !c.getContext) return;
    var NA = Math.round(893 / 25), NB = Math.round(17325 / 25), prog = reduce ? 1 : 0, go = reduce, r = rng(11), al = [];
    for (var i = 0; i < NB; i++) al.push(0.55 + r() * 0.45);
    function draw() {
      var f = fit(c), W = f[0], H = f[1], x = f[2], p, cols, rowsB, gap = 9;
      for (p = 12; p > 4; p -= 0.2) { cols = Math.floor(W / p); if (cols < 1) continue; rowsB = Math.ceil(NB / cols); if ((rowsB + Math.ceil(NA / cols)) * p + gap <= H) break; }
      var rad = p * 0.31, ink = css('--ink'), acc = css('--accent'), ox = (W - cols * p) / 2 + p / 2, rowsA = Math.ceil(NA / cols);
      x.clearRect(0, 0, W, H);
      var shown = prog * (NA + NB) * 1.02, k;
      x.fillStyle = ink; x.beginPath();
      for (k = 0; k < NA && k < shown; k++) { var ax = ox + (k % cols) * p, ay = p / 2 + Math.floor(k / cols) * p; x.moveTo(ax + rad, ay); x.arc(ax, ay, rad, 0, TAU); }
      x.fill();
      x.fillStyle = acc;
      for (k = 0; k < NB && k + NA < shown; k++) {
        var bx = ox + (k % cols) * p, by = rowsA * p + gap + p / 2 + Math.floor(k / cols) * p;
        x.globalAlpha = al[k]; x.beginPath(); x.arc(bx, by, rad, 0, TAU); x.fill();
      }
      x.globalAlpha = 1;
    }
    animate(c, function (t, dt) { if (go && prog < 1) { prog = Math.min(1, prog + dt / 2.0); draw(); return true; } return false; }, function () { go = true; kick(); });
    onResize(c, draw); document.addEventListener('yw-theme', draw); draw();
  })();

  /* ------------------------------ the cable ------------------------------ */
  (function () {
    var C = window.YW_CABLE, G = window.YW_GEO, fig = $('cableFig'), chEl = $('cbCh'), kmEl = $('cbKm'); if (!C || !fig) return;
    var NS = 'http://www.w3.org/2000/svg', route = C.route, pts = [], len = [], total = 0, pulse = null, glow = null, tPulse = 0, lastTxt = 0;
    function elS(tag, attrs, parent, text) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }
    function build() {
      var w = fig.clientWidth, h = fig.clientHeight; if (!w || !h) return;
      fig.innerHTML = '';
      var svg = elS('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'presentation' }, fig);
      var lon0 = 1e9, lon1 = -1e9, lat0 = 1e9, lat1 = -1e9, i, kx = Math.cos(38.444 * Math.PI / 180);
      var all = route.map(function (p) { return [p[1], p[2]]; }).concat([C.telecom_node]);
      all.forEach(function (p) { lon0 = Math.min(lon0, p[0]); lon1 = Math.max(lon1, p[0]); lat0 = Math.min(lat0, p[1]); lat1 = Math.max(lat1, p[1]); });
      var padL = 22, padR = 26, padT = 30, padB = 44, sc = Math.min((w - padL - padR) / ((lon1 - lon0) * kx), (h - padT - padB) / (lat1 - lat0));
      var offX = padL + ((w - padL - padR) - (lon1 - lon0) * kx * sc) / 2, offY = padT + ((h - padT - padB) - (lat1 - lat0) * sc) / 2;
      function P(lon, lat) { return [offX + (lon - lon0) * kx * sc, offY + (lat1 - lat) * sc]; }
      pts = route.map(function (p) { var q = P(p[1], p[2]); return { ch: p[0], x: q[0], y: q[1] }; });
      len = [0]; total = 0; for (i = 1; i < pts.length; i++) { total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); len.push(total); }
      function at(ch) {
        for (var j = 1; j < pts.length; j++) if (ch <= pts[j].ch) { var a = pts[j - 1], b = pts[j], f = (ch - a.ch) / (b.ch - a.ch); return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f]; }
        return [pts[pts.length - 1].x, pts[pts.length - 1].y];
      }
      function path(a, b) {
        var p0 = at(a), d = 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1);
        pts.forEach(function (p) { if (p.ch > a && p.ch < b) d += 'L' + p.x.toFixed(1) + ' ' + p.y.toFixed(1); });
        var p1 = at(b); return d + 'L' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1);
      }
      var beach = at(912), end = at(1872), start = at(0), node = P(C.telecom_node[0], C.telecom_node[1]), low = at(1330), texts = [];
      /* labels are placed first and pulled back inside the drawing afterwards */
      function txt(attrs, s) { var t = elS('text', attrs, svg, s); texts.push(t); return t; }
      txt({ x: 14, y: h - 14, 'class': 'cb-name' }, 'Kefalonia');
      txt({ x: w - 14, y: h - 14, 'class': 'cb-name', 'text-anchor': 'end' }, 'Ithaca');
      elS('path', { d: path(925, 1760), 'class': 'cb-halo' }, svg);
      elS('path', { d: path(0, 912), 'class': 'cb-land' }, svg);
      elS('path', { d: path(912, 1760), 'class': 'cb-sea' }, svg);
      elS('path', { d: path(1760, 1872), 'class': 'cb-land' }, svg);
      elS('path', { d: 'M' + end[0].toFixed(1) + ' ' + end[1].toFixed(1) + 'L' + node[0].toFixed(1) + ' ' + node[1].toFixed(1), 'class': 'cb-in', 'stroke-dasharray': '2 3' }, svg);
      C.coils.forEach(function (k) {
        var p = at((k.from + k.to) / 2), c = elS('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: (2.4 + Math.sqrt(k.m) / 3.6).toFixed(1), 'class': 'cb-coil' }, svg);
        elS('title', {}, c, k.m + ' m of spare fibre, channels ' + k.from + '–' + k.to);
      });
      elS('rect', { x: (start[0] - 3.5).toFixed(1), y: (start[1] - 3.5).toFixed(1), width: 7, height: 7, 'class': 'cb-end' }, svg);
      elS('circle', { cx: end[0].toFixed(1), cy: end[1].toFixed(1), r: 3.5, 'class': 'cb-end' }, svg);
      txt({ x: (start[0] - 3).toFixed(1), y: (start[1] + 26).toFixed(1), 'class': 'cb-t k' }, 'ch 0');
      txt({ x: (beach[0] - 12).toFixed(1), y: (beach[1] + 18).toFixed(1), 'class': 'cb-t k', 'text-anchor': 'end' }, 'beach manhole');
      txt({ x: (beach[0] - 12).toFixed(1), y: (beach[1] + 31).toFixed(1), 'class': 'cb-t', 'text-anchor': 'end' }, 'ch 900–920');
      txt({ x: low[0].toFixed(1), y: (low[1] + 22).toFixed(1), 'class': 'cb-t', 'text-anchor': 'middle', style: 'fill:var(--blue-text)' }, 'seafloor · ch 925–1760');
      txt({ x: (end[0] - 10).toFixed(1), y: (end[1] - 9).toFixed(1), 'class': 'cb-t k', 'text-anchor': 'end' }, 'ch 1872');
      texts.forEach(function (t) {
        var b; try { b = t.getBBox(); } catch (e) { return; }
        if (!b.width) return;
        var dx = b.x < 6 ? 6 - b.x : b.x + b.width > w - 6 ? w - 6 - b.x - b.width : 0;
        if (dx) t.setAttribute('x', (+t.getAttribute('x') + dx).toFixed(1));
      });
      /* locator: the two islands, with the frame of this drawing */
      if (G && G.kefalonia && w > 300) {
        var bb = G.kefalonia.bbox, iw = 66, ih = iw * (bb[3] - bb[1]) / ((bb[2] - bb[0]) * kx);
        var gI = elS('g', { transform: 'translate(' + (w - iw - 14).toFixed(1) + ',12)' }, svg);
        G.kefalonia.polys.slice(0, 2).forEach(function (pl) {
          var d = ''; pl.ring.forEach(function (p, j) { d += (j ? 'L' : 'M') + ((p[0] - bb[0]) / (bb[2] - bb[0]) * iw).toFixed(1) + ' ' + ((bb[3] - p[1]) / (bb[3] - bb[1]) * ih).toFixed(1); });
          elS('path', { d: d + 'Z', 'class': 'cb-in' }, gI);
        });
        var rx = (lon0 - bb[0]) / (bb[2] - bb[0]) * iw, ry = (bb[3] - lat1) / (bb[3] - bb[1]) * ih, rw = (lon1 - lon0) / (bb[2] - bb[0]) * iw, rh = (lat1 - lat0) / (bb[3] - bb[1]) * ih;
        elS('rect', { x: (rx - 1.5).toFixed(1), y: (ry - 1.5).toFixed(1), width: (rw + 3).toFixed(1), height: (rh + 3).toFixed(1), 'class': 'cb-box' }, gI);
        if (w >= 360) elS('text', { x: iw, y: (ih + 13).toFixed(1), 'class': 'cb-t', 'text-anchor': 'end' }, gI, 'Ionian Sea');
      }
      glow = elS('circle', { r: 10, 'class': 'cb-glow' }, svg); pulse = elS('circle', { r: 4, 'class': 'cb-pulse' }, svg);
      place(reduce ? along(925) : (tPulse % 8) / 8);
    }
    /* fraction of the drawn path at which a channel sits */
    function along(ch) {
      for (var j = 1; j < pts.length; j++) if (ch <= pts[j].ch) return (len[j - 1] + (ch - pts[j - 1].ch) / (pts[j].ch - pts[j - 1].ch) * (len[j] - len[j - 1])) / total;
      return 1;
    }
    function place(f) {
      if (!pulse || !pts.length) return;
      var s = f * total, j = 1; while (j < len.length - 1 && len[j] < s) j++;
      var a = pts[j - 1], b = pts[j], g = (s - len[j - 1]) / Math.max(1e-6, len[j] - len[j - 1]), x = a.x + (b.x - a.x) * g, y = a.y + (b.y - a.y) * g, ch = a.ch + (b.ch - a.ch) * g;
      pulse.setAttribute('cx', x.toFixed(1)); pulse.setAttribute('cy', y.toFixed(1)); glow.setAttribute('cx', x.toFixed(1)); glow.setAttribute('cy', y.toFixed(1));
      return ch;
    }
    function label(ch) { ch = Math.round(ch); if (chEl) chEl.textContent = 'ch ' + ('000' + ch).slice(-4); if (kmEl) kmEl.textContent = (ch * C.spacing_m / 1000).toFixed(2) + ' km'; }
    build(); onResize(fig, build);
    if (reduce) { label(925); return; }
    animate(fig, function (t, dt) {
      tPulse += dt; var f = (tPulse % 8) / 8, ch = place(f < 0.9 ? f / 0.9 : 1);
      if (glow) glow.setAttribute('opacity', f < 0.9 ? 0.22 : 0.22 * (1 - (f - 0.9) / 0.1));
      if (pulse) pulse.setAttribute('opacity', f < 0.9 ? 1 : 1 - (f - 0.9) / 0.1);
      if (ch != null && t - lastTxt > 70) { lastTxt = t; label(ch); }
      return true;
    });
  })();

  /* ------------------------------ a synthetic DAS record ------------------------------ */
  (function () {
    var c = $('wf'), C = window.YW_CABLE; if (!c || !c.getContext) return;
    var NC = 234, NR = 230, RATE = 30, KMC = (C ? C.length_km : 15.29) / NC, CH = (C ? C.channels : 1872) / NC;
    var buf = document.createElement('canvas'); buf.width = NC; buf.height = NR;
    var bx = buf.getContext('2d'), rowImg = bx.createImageData(NC, 1), r = rng(5), t = 0, acc = 0, evs = [], next = 0.4, cars = [];
    var gain = new Float32Array(NC), ph = new Float32Array(NC), seaA = Math.round(925 / CH), seaB = Math.round(1760 / CH), i;
    for (i = 0; i < NC; i++) { gain[i] = 0.6 + r() * 0.55; ph[i] = r() * TAU; }
    if (C) C.coils.forEach(function (k) { if (k.m > 100) for (var j = Math.floor(k.from / CH); j <= Math.floor(k.to / CH); j++) gain[j] *= 0.12; });
    bx.fillStyle = '#070b14'; bx.fillRect(0, 0, NC, NR);
    function quake(col, amp) { evs.push({ c: col, t0: t + 0.1, d: 1.2 + r() * 5.5, a: amp, k: r() * 100 }); if (evs.length > 6) evs.shift(); }
    function wave(tau, f, decay) { return tau < 0 ? 0 : Math.sin(TAU * f * tau) * Math.exp(-tau / decay) * Math.min(1, tau * 14); }
    function addRow() {
      t += 1 / RATE;
      if (t > next) { quake(Math.floor(seaA * 0.6 + r() * (NC - seaA * 0.6)), 0.35 + r() * 0.75); next = t + 3.2 + r() * 5.5; }
      if (cars.length < 2 && r() < 0.012) cars.push({ c: r() * seaA, v: (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.3), a: 0.25 + r() * 0.3 });
      var d = rowImg.data, j, e;
      for (var col = 0; col < NC; col++) {
        var v = (r() - 0.5) * 0.16;
        if (col >= seaA && col < seaB) v += 0.11 * Math.sin(TAU * 0.21 * t + col * 0.31 + Math.sin(col * 0.07) * 2) + 0.06 * Math.sin(TAU * 0.33 * t - col * 0.19);
        for (j = 0; j < cars.length; j++) { var dc = col - cars[j].c; if (dc > -4 && dc < 4) v += cars[j].a * Math.exp(-dc * dc / 1.6) * (0.6 + 0.4 * Math.sin(t * 9 + col)); }
        for (j = 0; j < evs.length; j++) {
          e = evs[j]; var dx = (col - e.c) * KMC, dist = Math.sqrt(dx * dx + e.d * e.d), tau = t - e.t0, g = e.a * gain[col] * Math.sqrt(1.6 / dist);
          var tp = tau - dist / 6.0, ts = tau - dist / 3.45;
          v += g * 0.5 * wave(tp, 6.5, 0.28) + g * 1.25 * wave(ts, 4.2, 0.55);
          if (ts > 0) v += g * 0.5 * Math.exp(-ts / 1.5) * Math.sin(TAU * 3.1 * ts + ph[col] + e.k) * Math.sin(ts * 5 + ph[col] * 3);
        }
        var a = Math.min(1, Math.pow(Math.abs(v), 0.82)), o = col * 4;
        if (v >= 0) { d[o] = 7 + 248 * a; d[o + 1] = 11 + 96 * a; d[o + 2] = 20 + 44 * a; }
        else { d[o] = 7 + 58 * a; d[o + 1] = 11 + 134 * a; d[o + 2] = 20 + 235 * a; }
        d[o + 3] = 255;
      }
      for (j = cars.length - 1; j >= 0; j--) { cars[j].c += cars[j].v / RATE; if (cars[j].c < -4 || cars[j].c > seaA) cars.splice(j, 1); }
      for (j = evs.length - 1; j >= 0; j--) if (t - evs[j].t0 > 11) evs.splice(j, 1);
      bx.drawImage(buf, 0, -1); bx.putImageData(rowImg, 0, NR - 1);
    }
    function paint() {
      var f = fit(c), W = f[0], H = f[1], x = f[2];
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(buf, 0, 0, NC, NR, 0, 0, W, H);
      x.strokeStyle = 'rgba(160,185,230,.22)'; x.lineWidth = 1; x.setLineDash([2, 4]); x.beginPath();
      [seaA, seaB].forEach(function (s) { var gx = Math.round(s / NC * W) + 0.5; x.moveTo(gx, 22); x.lineTo(gx, H - 20); });
      x.stroke(); x.setLineDash([]);
      x.font = '400 9.5px "Geist Mono",ui-monospace,Menlo,monospace'; x.fillStyle = 'rgba(135,148,170,.95)'; x.textAlign = 'center'; x.textBaseline = 'middle';
      var sx = (seaA + seaB) / 2 / NC * W; if (sx - 34 > 128) x.fillText('SEAFLOOR', sx, 14.5);   /* clear of the 'Kefalonia, land' label */
    }
    function run(n) { for (var k = 0; k < n; k++) addRow(); }
    c.addEventListener('pointerdown', function (e) {
      var rct = c.getBoundingClientRect(), col = Math.max(2, Math.min(NC - 3, Math.round((e.clientX - rct.left) / rct.width * NC)));
      quake(col, 1.15 + r() * 0.3); if (reduce) { run(150); paint(); }
    });
    next = 1e9; run(105); quake(Math.round(NC * 0.62), 1.0); run(125); next = t + 2.5; paint();
    onResize(c, paint);
    if (!reduce) animate(c, function (tt, dt) { acc += dt * RATE; var n = Math.min(3, Math.floor(acc)); acc -= n; if (n) { run(n); paint(); } return true; });
  })();

  /* ------------------------------ a toy wavefield for the Wave Lab tile ------------------------------ */
  (function () {
    var c = $('ripple'); if (!c || !c.getContext) return;
    /* about two screen pixels per cell, so the fronts stay sharp without costing much */
    var rc0 = c.getBoundingClientRect(), GW = Math.max(180, Math.min(300, Math.round((rc0.width || 320) / 2.1)));
    var GH = Math.max(110, Math.min(360, Math.round(GW * (rc0.height || 340) / (rc0.width || 560)))), n = GW * GH;
    var u0 = new Float32Array(n), u1 = new Float32Array(n), c2 = new Float32Array(n), dampv = new Float32Array(n), slow = new Float32Array(n);
    var buf = document.createElement('canvas'); buf.width = GW; buf.height = GH; var bx = buf.getContext('2d'), img = bx.createImageData(GW, GH);
    var r = rng(23), srcs = [], tNext = 0, time = 0, x, y, i;
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      i = y * GW + x;
      var dx = (x - GW * 0.66) / (GW * 0.2), dy = (y - GH * 0.3) / (GH * 0.17), blob = Math.exp(-(dx * dx + dy * dy) * 1.3);
      slow[i] = blob; c2[i] = 0.42 * (1 - 0.46 * blob);            /* a slow body: wavefronts bend and lag inside it */
      var e = Math.min(x, y, GW - 1 - x, GH - 1 - y); dampv[i] = e < 22 ? 0.9985 - 0.11 * Math.pow((22 - e) / 22, 2) : 0.9985;
    }
    function drop(gx, gy, a) { srcs.push({ i: Math.max(2, Math.min(GH - 3, gy | 0)) * GW + Math.max(2, Math.min(GW - 3, gx | 0)), k: 0, a: a }); }
    function stepSim() {
      var j;
      for (j = srcs.length - 1; j >= 0; j--) { var s = srcs[j], tt = (s.k - 16) / 6, w = (1 - 2 * tt * tt) * Math.exp(-tt * tt); u1[s.i] += w * s.a; if (++s.k > 34) srcs.splice(j, 1); }
      for (var yy = 1; yy < GH - 1; yy++) for (var xx = 1, k = yy * GW + 1; xx < GW - 1; xx++, k++) {
        u0[k] = (2 * u1[k] - u0[k] + c2[k] * (u1[k - 1] + u1[k + 1] + u1[k - GW] + u1[k + GW] - 4 * u1[k])) * dampv[k];
      }
      var tmp = u0; u0 = u1; u1 = tmp;
    }
    function paint() {
      var d = img.data;
      for (var k = 0, o = 0; k < n; k++, o += 4) {
        var v = u1[k], m = Math.abs(v) - 0.014, a = m > 0 ? 1 - Math.exp(-m * 30) : 0, sl = slow[k];
        if (v >= 0) { d[o] = 7 + 30 * sl + 248 * a; d[o + 1] = 11 + 10 * sl + 104 * a; d[o + 2] = 20 + 36 * sl + 46 * a; }
        else { d[o] = 7 + 30 * sl + 56 * a; d[o + 1] = 11 + 10 * sl + 138 * a; d[o + 2] = 20 + 36 * sl + 235 * a; }
        d[o + 3] = 255;
      }
      bx.putImageData(img, 0, 0);
      var f = fit(c), W = f[0], H = f[1], cx = f[2], sc = Math.max(W / GW, H / GH), dw = GW * sc, dh = GH * sc;
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; cx.drawImage(buf, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    drop(GW * 0.3, GH * 0.42, 1.2); for (i = 0; i < (reduce ? 150 : 110); i++) stepSim();
    paint(); onResize(c, paint);
    if (reduce) return;
    var tile = c.parentNode, lastMove = 0;
    tile.addEventListener('pointermove', function (e) {
      var t = performance.now(); if (t - lastMove < 420) return; lastMove = t;
      var rc = c.getBoundingClientRect(), sc = Math.max(rc.width / GW, rc.height / GH);
      drop((e.clientX - rc.left - (rc.width - GW * sc) / 2) / sc, (e.clientY - rc.top - (rc.height - GH * sc) / 2) / sc, 0.6); tNext = time + 2.5;
    });
    animate(c, function (t, dt) {
      time += dt; if (time > tNext) { drop(GW * (0.12 + r() * 0.76), GH * (0.1 + r() * 0.5), 1.0 + r() * 0.3); tNext = time + 2.2 + r() * 1.4; }
      stepSim(); stepSim(); paint(); return true;
    });
  })();

  /* ------------------------------ photographs ------------------------------ */
  (function () {
    var st = $('stack'), cap = $('stackCap'), cnt = $('stackN'); if (!st) return;
    var figs = [].slice.call(st.querySelectorAll('figure')), order = figs.map(function (f, i) { return i; }), busy = false, n = figs.length;
    var POS = ['translate3d(0,0,0) rotate(0deg) scale(1)', 'translate3d(9px,7px,0) rotate(2.4deg) scale(.985)', 'translate3d(-8px,12px,0) rotate(-2.1deg) scale(.97)', 'translate3d(4px,16px,0) rotate(1.2deg) scale(.955)'];
    function lay() {
      order.forEach(function (fi, pos) {
        var f = figs[fi]; f.style.zIndex = String(n - pos); f.style.transform = POS[Math.min(pos, POS.length - 1)];
        f.style.opacity = pos > 3 ? '0' : '1'; f.style.filter = pos ? 'brightness(' + (1 - pos * 0.07) + ')' : 'none';
      });
      var img = figs[order[0]].querySelector('img');
      if (cap) cap.innerHTML = esc(img.getAttribute('data-cap') || '').replace(/[㐀-鿿]+/g, '<span lang="zh">$&</span>');
      if (cnt) cnt.textContent = (order[0] + 1) + ' / ' + n + ' · ' + (touch ? 'tap' : 'click') + ' for the next';
    }
    st.addEventListener('click', function () {
      if (busy) return; var top = figs[order[0]];
      if (reduce) { order.push(order.shift()); lay(); return; }
      busy = true; top.style.transform = 'translate3d(46%,-5%,0) rotate(10deg) scale(.98)'; top.style.opacity = '0';
      setTimeout(function () { order.push(order.shift()); lay(); busy = false; }, 330);
    });
    lay();
  })();
})();
