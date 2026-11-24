/* v3a · FIBRE · the page around the hero: the fibre readout, reveals, the dot matrix, the small live diagrams. */
(function () {
  'use strict';
  var C = window.YW_CABLE || { channels: 1872, spacing_m: 8.17, segments: [], coils: [] };
  var N = C.channels, $ = function (id) { return document.getElementById(id); };
  var reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad4(n) { n = String(n); while (n.length < 4) n = '0' + n; return n; }
  function onVisible(el, fn) {
    if (!window.IntersectionObserver) { fn(true); return; }
    new IntersectionObserver(function (en) { fn(en[0].isIntersecting); }, { rootMargin: '80px 0px 80px 0px' }).observe(el);
  }
  /* a canvas that animates only while it is on screen and the tab is visible, and picks up again after either */
  function animate(el, draw, minDt) {
    var inView = false, raf = 0, last = 0;
    function loop(now) { raf = 0; if (!inView || document.hidden) return; if (!minDt || now - last >= minDt) { last = now; draw(now); } raf = requestAnimationFrame(loop); }
    function kick() { if (!raf && inView && !document.hidden && !reduced) raf = requestAnimationFrame(loop); }
    onVisible(el, function (v) { inView = v; kick(); });
    document.addEventListener('visibilitychange', kick);
  }
  function fitCanvas(cv) {
    var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(2, Math.round(r.width * dpr)); cv.height = Math.max(2, Math.round(r.height * dpr));
    return { w: r.width, h: r.height, dpr: dpr };
  }
  function onResize(fn) { var rt = 0; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(fn, 150); }); }
  /* canvas text is drawn with whatever font is ready: draw again once the web fonts have arrived */
  function onFonts(fn) { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fn(); }); }
  function monoLabel(ctx, txt, x, y, col, align, size) { ctx.font = '500 ' + (size || 10) + 'px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = align || 'left'; ctx.fillStyle = col; ctx.fillText(txt.toUpperCase().split('').join('\u200a'), x, y); }

  /* ---------- film grain: one small noise tile for the whole page ---------- */
  (function () {
    try {
      var c = document.createElement('canvas'); c.width = c.height = 180;
      var x = c.getContext('2d'), im = x.createImageData(180, 180), d = im.data;
      for (var i = 0; i < d.length; i += 4) { var v = (90 + Math.random() * 165) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = (Math.random() * 235) | 0; }
      x.putImageData(im, 0, 0); document.documentElement.style.setProperty('--grain', 'url(' + c.toDataURL('image/png') + ')');
    } catch (e) {}
  })();

  /* ---------- e-mail: assembled here, never in the page source ---------- */
  (function () {
    var addr = ['yuhan.wang', ['eaps', 'ethz', 'ch'].join('.')].join('@');
    [].forEach.call(document.querySelectorAll('[data-mail]'), function (a) { a.href = 'mailto:' + addr; });
    [].forEach.call(document.querySelectorAll('[data-mail-text]'), function (s) { s.textContent = addr; });
  })();

  /* ---------- reveals ---------- */
  (function () {
    var els = [].slice.call(document.querySelectorAll('.rv'));
    if (reduced || !window.IntersectionObserver) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach(function (e) { io.observe(e); });
  })();

  /* ---------- the fibre: scroll position is distance along the cable ----------
     The readout counts channel and km; the ground darkens to deep water while the cable is at sea; the fibre
     itself stops at the last station, where a lit terminal marks its end. */
  (function () {
    var stations = [].slice.call(document.querySelectorAll('[data-ch]')), anchors = [], dot = $('spineDot'), ro = $('readout'), roCh = $('roCh'), roKm = $('roKm'), roSeg = $('roSeg'), hero = $('hero');
    if (!dot || !ro) return;
    var spine = $('spine'), depthEl = $('depth'), endSt = document.querySelector('.end .station'), body = document.body;
    var names = { cabin: 'interrogator', land: 'Kefalonia road', coil: 'beach manhole', sea: 'seafloor', ithaca: 'Ithaca' };
    var shown = 0, target = 0, raf = 0, lastTxt = -1, prof = $('roProf'), here = null, PZ = window.__v3a && window.__v3a.PZ, copy = hero ? hero.querySelector('.hero-copy') : null;
    var endY = 1e9, roH = 0, lastCut = -1, lastDepth = -1, isEnd = false;
    function py(z) { return 15 - z * 17; }
    if (prof && PZ) {
      /* the cable in profile: up on Kefalonia, down across the strait, up again on Ithaca */
      var d = '', k; for (k = 0; k <= 112; k += 2) { var c = Math.min(N - 1, Math.round(k / 112 * (N - 1))); d += (k ? 'L' : 'M') + k + ' ' + py(PZ[c]).toFixed(1); }
      prof.innerHTML = '<line class="sea" x1="0" y1="15" x2="112" y2="15"/><path class="prof" d="' + d + '"/><circle class="here" r="2.6" cx="0" cy="15"/><text x="0" y="35">Kefalonia</text><text x="112" y="35" text-anchor="end">Ithaca</text>';
      here = prof.querySelector('.here');
    } else if (prof) prof.style.display = 'none';
    function docY(el) { var y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }     // ignores the reveal transforms
    function measure() {
      anchors = stations.map(function (el) { return { y: docY(el), ch: +el.getAttribute('data-ch') }; });
      anchors.sort(function (a, b) { return a.y - b.y; });
      if (endSt) endY = docY(endSt) + endSt.offsetHeight / 2;
      roH = ro.offsetHeight;
    }
    function chAt() {
      var vh = window.innerHeight, sy = window.pageYOffset, max = document.documentElement.scrollHeight - vh, y = sy + vh * 0.42, a = anchors, i, t;
      if (!a.length) return 0; if (sy >= max - 2) return N; if (y <= a[0].y) return a[0].ch;
      for (i = 0; i < a.length - 1; i++) if (y < a[i + 1].y) { t = (y - a[i].y) / Math.max(1, a[i + 1].y - a[i].y); return a[i].ch + (a[i + 1].ch - a[i].ch) * t; }
      var last = a[a.length - 1]; t = clamp((y - last.y) / Math.max(1, max + vh * 0.42 - last.y), 0, 1); return last.ch + (N - last.ch) * t;
    }
    function segOf(c) { for (var i = 0; i < C.segments.length; i++) if (c >= C.segments[i].from && c < C.segments[i].to) return names[C.segments[i].key] || ''; return names.ithaca; }
    function paint() {
      var vh = window.innerHeight, c = Math.round(shown), cc = Math.min(N - 1, c);
      var y = Math.min(vh * (0.14 + 0.72 * shown / N), vh - roH - 12);
      /* the end of the fibre: once the last station is on screen the spine stops at its terminal */
      var ey = endY - window.pageYOffset, cut = ey < vh ? Math.round(clamp(vh - ey, 0, vh)) : 0;
      if (cut !== lastCut && spine) { lastCut = cut; spine.style.bottom = cut + 'px'; spine.classList.toggle('cut', cut > 0); }
      var end = cut > 0 && ey < y + 4;
      if (end !== isEnd) { isEnd = end; body.classList.toggle('fibre-end', end); }
      if (end) y = Math.max(0, ey);
      dot.style.transform = 'translateY(' + y.toFixed(1) + 'px)'; ro.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
      if (c !== lastTxt) {
        lastTxt = c; roCh.textContent = 'CH ' + pad4(c); roKm.textContent = (c * C.spacing_m / 1000).toFixed(2) + ' km'; roSeg.textContent = segOf(c);
        if (here) { here.setAttribute('cx', (cc / (N - 1) * 112).toFixed(1)); here.setAttribute('cy', py(PZ[cc]).toFixed(1)); }
        /* the ground: land stays abyssal black, deep water turns it blue */
        if (depthEl && PZ) { var dz = Math.round(clamp(-PZ[cc] / 0.55, 0, 1) * 100) / 100; if (dz !== lastDepth) { lastDepth = dz; depthEl.style.opacity = dz; } }
      }
    }
    function tick() {
      raf = 0; var dd = target - shown;
      if (Math.abs(dd) < 0.6 || reduced) shown = target; else shown += dd * 0.16;
      paint(); if (shown !== target) raf = requestAnimationFrame(tick);
    }
    function onScroll() {
      target = chAt(); if (!raf) raf = requestAnimationFrame(tick);
      if (hero) {
        var sy = window.pageYOffset, hh = hero.offsetHeight; body.classList.toggle('past-hero', sy > hh * 0.72);
        if (copy && !reduced && sy < hh) { copy.style.transform = 'translate3d(0,' + (sy * 0.2).toFixed(1) + 'px,0)'; copy.style.opacity = clamp(1 - sy / hh * 1.5, 0, 1).toFixed(3); }
      }
    }
    function remeasure() { measure(); lastTxt = -1; onScroll(); }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', remeasure);
    /* anything that changes the page's height later (fonts, images, canvases) moves the stations: measure again */
    if (window.ResizeObserver) { var rq = 0; new ResizeObserver(function () { if (!rq) rq = requestAnimationFrame(function () { rq = 0; remeasure(); }); }).observe(document.querySelector('main') || document.body); }
    window.addEventListener('load', remeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    setTimeout(remeasure, 1500);
    remeasure(); shown = target; paint();
  })();

  /* ---------- 893 against 17,325: one dot per earthquake ---------- */
  (function () {
    var cvA = $('dotsA'), cvB = $('dotsB'), nA = $('nA'), nB = $('nB'), box = $('dots');
    if (!cvA || !cvB || !box) return;
    var TA = 893, TB = 17325, SPLIT = Math.round(TB * 0.72);
    function Field(cv, total, split, colA, colB, fixedCols) { this.cv = cv; this.ctx = cv.getContext('2d'); this.total = total; this.split = split; this.colA = colA; this.colB = colB; this.fixed = fixedCols; this.n = 0; this.drawn = 0; }
    Field.prototype.layout = function (pitch) {
      var cv = this.cv, dpr = Math.min(window.devicePixelRatio || 1, 2), w, cols;
      if (this.fixed) { cols = this.fixed; w = cols * pitch; cv.style.width = w + 'px'; }
      else { w = cv.parentNode.clientWidth; cols = Math.max(20, Math.floor(w / pitch)); pitch = w / cols; }
      var rows = Math.ceil(this.total / cols), h = rows * pitch;
      cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.cols = cols; this.pitch = pitch; this.r = pitch * 0.3; this.drawn = 0; this.draw(this.n);
    };
    Field.prototype.draw = function (n) {
      n = Math.min(this.total, Math.round(n)); var ctx = this.ctx, p = this.pitch, r = this.r, cols = this.cols, i, parts = [[this.drawn, Math.min(n, this.split), this.colA], [Math.max(this.drawn, this.split), n, this.colB]];
      for (var k = 0; k < 2; k++) {
        if (parts[k][1] <= parts[k][0]) continue;
        ctx.fillStyle = parts[k][2]; ctx.beginPath();
        for (i = parts[k][0]; i < parts[k][1]; i++) { var x = (i % cols + 0.5) * p, y = (((i / cols) | 0) + 0.5) * p; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832); }
        ctx.fill();
      }
      if (n > this.drawn) this.drawn = n; this.n = Math.max(this.n, n);
    };
    var A = new Field(cvA, TA, TA, '#a9cdfc', '#a9cdfc', 30), B = new Field(cvB, TB, SPLIT, '#ffb454', '#8c8474', 0);
    function layout() { var w = cvB.parentNode.clientWidth, pitch = w >= 700 ? 5.4 : w >= 440 ? 4.6 : 3.7; B.layout(pitch); A.layout(B.pitch); }
    function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
    var shownB = 0, raf = 0, aStart = 0;
    function goal() { var r = cvB.getBoundingClientRect(), vh = window.innerHeight; var p = clamp((vh * 0.92 - r.top) / (r.height + vh * 0.07), 0, 1); return TB * Math.pow(p, 1.15); }   // complete once the whole field is in view
    function tick(now) {
      raf = 0; var g = Math.max(shownB, goal()), again = false;
      if (shownB < g) { shownB = Math.min(g, shownB + Math.max(40, (g - shownB) * 0.09)); B.draw(shownB); nB.textContent = fmt(shownB); again = shownB < g; }
      if (aStart && A.n < TA) { var t = clamp((now - aStart) / 900, 0, 1); A.draw(TA * (1 - Math.pow(1 - t, 3))); nA.textContent = fmt(A.n); again = again || A.n < TA; }
      if (again) raf = requestAnimationFrame(tick);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(tick); }
    layout();
    if (reduced) { A.draw(TA); B.draw(TB); return; }
    nA.textContent = '0'; nB.textContent = '0';
    onVisible(cvA, function (v) { if (v && !aStart) { aStart = performance.now(); kick(); } });
    window.addEventListener('scroll', kick, { passive: true });
    onResize(function () { layout(); kick(); });
    kick();
  })();

  /* ---------- how DAS works: pulse, backscatter, a passing wave and the strain rate it leaves on each channel ---------- */
  (function () {
    var cv = $('dasDiagram'); if (!cv) return;
    var ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, t0 = performance.now(), scat = [], i;
    for (i = 0; i < 54; i++) scat.push(Math.random()); scat.sort();
    var AMB = '255,180,84', HOT = '255,230,194', COLD = '169,205,252', INK = '243,238,228';
    function size() { var f = fitCanvas(cv); W = f.w; H = f.h; dpr = f.dpr; }
    function label(txt, x, y, col, align) { monoLabel(ctx, txt, x, y, col, align); }
    function draw(now) {
      var t = reduced ? 1.25 : (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      var small = W < 600, bx = small ? 12 : 34, bw = small ? 60 : 128, bh = small ? 44 : 62, yF = H * 0.235, x0 = bx + bw, x1 = W - (small ? 12 : 34), L = x1 - x0;
      var nCh = small ? 12 : 26, g = L / nCh, yG = H * 0.5, yB = H * 0.8, k, x, y;
      /* the wave in the ground, moving right to left */
      var cyc = 11, span = 1.7 * L, xs = x1 + 0.3 * L - ((reduced ? 6.2 : t % cyc) / cyc) * span, xs2 = xs + (xs < x0 + 0.5 * L ? 0.5 : -0.5) * span;
      function pk(xx, c) { var s = (xx - c) / (L * 0.14); return Math.exp(-s * s) * Math.sin((xx - c) / (L * 0.043)); }
      function u(xx) { return pk(xx, xs) + pk(xx, xs2); }
      /* channel positions, stretched where the wave is */
      var xs_ = []; for (k = 0; k <= nCh; k++) xs_.push(x0 + k * g + u(x0 + k * g) * g * 0.32);
      /* guides from each channel down to its bar */
      ctx.setLineDash([1, 5]); ctx.strokeStyle = 'rgba(' + INK + ',.13)'; ctx.lineWidth = 1; ctx.beginPath();
      for (k = 0; k < nCh; k++) { x = x0 + (k + 0.5) * g; ctx.moveTo(x, yF + 22); ctx.lineTo(x, yB + H * 0.13); } ctx.stroke(); ctx.setLineDash([]);
      /* interrogator */
      ctx.strokeStyle = 'rgba(' + INK + ',.38)'; ctx.fillStyle = 'rgba(12,18,29,.96)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, yF - bh / 2, bw, bh, 6); else ctx.rect(bx, yF - bh / 2, bw, bh); ctx.fill(); ctx.stroke();
      label(small ? 'laser' : 'interrogator', bx + bw / 2, yF - (small ? -3.5 : 3), 'rgba(' + INK + ',.85)', 'center');
      if (!small) label('laser · detector', bx + bw / 2, yF + 13, 'rgba(' + INK + ',.62)', 'center');
      /* the fibre: glass, core, and the small irregularities that scatter light */
      ctx.fillStyle = 'rgba(' + INK + ',.035)'; ctx.fillRect(x0, yF - 7, L, 14);
      ctx.strokeStyle = 'rgba(' + INK + ',.2)'; ctx.beginPath(); ctx.moveTo(x0, yF - 7); ctx.lineTo(x1, yF - 7); ctx.moveTo(x0, yF + 7); ctx.lineTo(x1, yF + 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + AMB + ',.5)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0, yF); ctx.lineTo(x1, yF); ctx.stroke();
      var T = 4.3, ph = reduced ? 1.25 : t % T, xpv = x0 + (ph / 1.9) * L;
      for (k = 0; k < scat.length; k++) {
        var xj = x0 + scat[k] * L, yj = yF + ((k * 7) % 9 - 4) * 1.2, near = Math.exp(-Math.pow((xj - xpv) / 26, 2));
        ctx.fillStyle = 'rgba(' + INK + ',' + (0.2 + 0.8 * near).toFixed(3) + ')'; ctx.fillRect(xj - 0.6, yj - 0.6, 1.2 + near, 1.2 + near);
        if (xpv <= xj) continue; var xb = xj - (xpv - xj); if (xb < x0) continue;
        var al = 0.95 * (1 - (xpv - xj) / L); if (al <= 0) continue;
        ctx.strokeStyle = 'rgba(' + COLD + ',' + (al * 0.55).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xb, yj); ctx.lineTo(xb + 9, yj); ctx.stroke();
        ctx.fillStyle = 'rgba(' + COLD + ',' + al.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(xb, yj, 1.7, 0, 6.2832); ctx.fill();
      }
      if (xpv <= x1 + 50) {
        var gr = ctx.createRadialGradient(xpv, yF, 0, xpv, yF, 46);
        gr.addColorStop(0, 'rgba(' + HOT + ',1)'); gr.addColorStop(0.16, 'rgba(' + AMB + ',.85)'); gr.addColorStop(1, 'rgba(' + AMB + ',0)');
        ctx.save(); ctx.beginPath(); ctx.rect(x0, yF - 40, L, 80); ctx.clip(); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(xpv, yF, 46, 17, 0, 0, 6.2832); ctx.fill(); ctx.restore();
        if (xpv < x1 - 90) label('laser pulse →', xpv - 10, yF - 24, 'rgba(' + HOT + ',.95)', 'left');
        if (xpv > x0 + L * 0.36) label('← light scattered back', Math.max(x0 + 8, xpv - L * 0.36), yF - 24, 'rgba(' + COLD + ',.9)', 'left');
      } else label('← light scattered back', x0 + 8, yF - 24, 'rgba(' + COLD + ',.9)', 'left');
      /* channel ticks */
      ctx.strokeStyle = 'rgba(' + INK + ',.5)'; ctx.lineWidth = 1; ctx.beginPath();
      for (k = 0; k <= nCh; k++) { ctx.moveTo(xs_[k], yF + 11); ctx.lineTo(xs_[k], yF + 20); } ctx.stroke();
      var kb = small ? 2 : 3;
      ctx.strokeStyle = 'rgba(' + AMB + ',.85)'; ctx.beginPath(); ctx.moveTo(xs_[kb], yF + 28); ctx.lineTo(xs_[kb + 1], yF + 28); ctx.moveTo(xs_[kb], yF + 24.5); ctx.lineTo(xs_[kb], yF + 31.5); ctx.moveTo(xs_[kb + 1], yF + 24.5); ctx.lineTo(xs_[kb + 1], yF + 31.5); ctx.stroke();
      label(small ? '8.17 m' : 'one channel · 8.17 m', xs_[kb + 1] + 9, yF + 31.5, 'rgba(' + AMB + ',.95)', 'left');
      /* the ground: a few strata that the wave bends */
      for (k = 0; k < 4; k++) {
        ctx.strokeStyle = 'rgba(' + COLD + ',' + (k === 0 ? 0.7 : 0.26 - k * 0.05).toFixed(2) + ')'; ctx.lineWidth = k === 0 ? 1.4 : 1; ctx.beginPath();
        for (x = x0; x <= x1; x += 3) { y = yG + k * 9 + (15 - k * 2.5) * u(x + k * 10); if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
      }
      var xl = (xs > x0 + 0.08 * L && xs < x1 - 0.08 * L) ? xs : xs2, yW = H < 300 ? yG + 58 : yG - 26;
      label(small ? 'a wave passes' : 'a seismic wave passes in the ground', clamp(xl - (small ? 44 : 118), x0 + 4, x1 - (small ? 100 : 262)), yW, 'rgba(' + COLD + ',.9)', 'left');
      /* strain rate on each channel */
      ctx.strokeStyle = 'rgba(' + INK + ',.2)'; ctx.beginPath(); ctx.moveTo(x0, yB); ctx.lineTo(x1, yB); ctx.stroke();
      for (k = 0; k < nCh; k++) {
        var s = (xs_[k + 1] - xs_[k]) / g - 1, hgt = clamp(s * 150, -H * 0.115, H * 0.115), bwid = Math.max(3, g * 0.5), xc = x0 + (k + 0.5) * g, a2 = (0.4 + Math.min(0.6, Math.abs(s) * 6)).toFixed(3);
        ctx.fillStyle = 'rgba(' + (s > 0 ? AMB : COLD) + ',' + a2 + ')';
        if (hgt >= 0) ctx.fillRect(xc - bwid / 2, yB - Math.max(hgt, 1), bwid, Math.max(hgt, 1)); else ctx.fillRect(xc - bwid / 2, yB, bwid, -hgt);
      }
      label(small ? 'strain rate, per channel' : 'what the interrogator records: strain rate, channel by channel', x0, H - 11, 'rgba(' + INK + ',.62)', 'left');
    }
    size(); draw(performance.now());
    onResize(function () { size(); draw(performance.now()); });
    onFonts(function () { draw(performance.now()); });
    animate(cv, draw);
  })();

  /* ---------- fibre against ground: where the spare fibre sits ---------- */
  (function () {
    var el = $('coilFig'); if (!el) return;
    var FIB = 7.32, GRD = 6.44, CH = 920, coils = [{ from: 0, to: 16, m: 134 }].concat(C.coils || []);
    function build() {
      var W = Math.max(280, el.clientWidth), small = W < 520, H = small ? 215 : 250, xL = 6, xR = W - 6, fy = small ? 78 : 92, gy = H - 34, NS = 'http://www.w3.org/2000/svg';
      var stored = 0; coils.forEach(function (k) { stored += k.m; });
      var slack = Math.max(0, (FIB - GRD) * 1000 - stored);
      function fx(ch) { return xL + (xR - xL) * ch / CH; }
      function ground(ch) { var s = 0; coils.forEach(function (k) { if (ch > k.to) s += k.m; else if (ch > k.from) s += k.m * (ch - k.from) / (k.to - k.from + 1); }); return ch * C.spacing_m - s - slack * ch / CH; }
      var gEnd = ground(CH); function gx(ch) { return xL + (xR - xL) * (GRD / FIB) * ground(ch) / gEnd; }
      var h = '<svg xmlns="' + NS + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">';
      var mono = 'font-family="IBM Plex Mono, ui-monospace, monospace" font-size="10" letter-spacing="1.2"', c;
      for (c = 100; c <= 900; c += 100) h += '<line x1="' + fx(c).toFixed(1) + '" y1="' + fy + '" x2="' + gx(c).toFixed(1) + '" y2="' + gy + '" stroke="rgba(169,205,252,.34)" stroke-width="1"/>' +
        (small && c % 200 ? '' : '<text x="' + fx(c).toFixed(1) + '" y="' + (fy + 16) + '" text-anchor="middle" fill="rgba(243,238,228,.62)" ' + mono + '>' + c + '</text>');
      h += '<line x1="' + xL + '" y1="' + fy + '" x2="' + xR + '" y2="' + fy + '" stroke="#ffb454" stroke-width="2"/>';
      h += '<line x1="' + xL + '" y1="' + gy + '" x2="' + gx(CH).toFixed(1) + '" y2="' + gy + '" stroke="#a9cdfc" stroke-width="2" opacity=".85"/>';
      var lastX = -99, up = 0;
      coils.forEach(function (k) {
        var x = fx((k.from + k.to) / 2), r = 3.5 + Math.sqrt(k.m) * 0.62;
        h += '<circle cx="' + x.toFixed(1) + '" cy="' + (fy - r).toFixed(1) + '" r="' + r.toFixed(1) + '" fill="none" stroke="#ffd9a6" stroke-width="1.4"/>';
        if (small && k.m < 100) return;
        up = (x - lastX < 60) ? (up + 1) % 3 : 0; lastX = x;
        h += '<text x="' + x.toFixed(1) + '" y="' + (fy - 2 * r - 7 - up * 13).toFixed(1) + '" text-anchor="' + (x > W - 40 ? 'end' : x < 40 ? 'start' : 'middle') + '" fill="#ffd9a6" ' + mono + '>' + k.m + ' m</text>';
      });
      h += '<text x="' + xL + '" y="' + (small ? 14 : 16) + '" fill="#ffb454" ' + mono + '>FIBRE · ' + FIB.toFixed(2) + ' KM</text>';
      h += '<text x="' + xL + '" y="' + (gy + 20) + '" fill="#a9cdfc" ' + mono + '>GROUND · ' + GRD.toFixed(2) + ' KM</text>';
      h += '<text x="' + xR + '" y="' + (gy + 20) + '" text-anchor="end" fill="rgba(243,238,228,.62)" ' + mono + '>BEACH MANHOLE →</text>';
      h += '<circle cx="' + xL + '" cy="' + fy + '" r="3.5" fill="#ffe6c2"/><circle cx="' + xL + '" cy="' + gy + '" r="3" fill="#a9cdfc"/><circle cx="' + gx(CH).toFixed(1) + '" cy="' + gy + '" r="3" fill="#a9cdfc"/>';
      el.innerHTML = h + '</svg>';
    }
    build(); onResize(build);
  })();

  /* ---------- the same blue-amber colour map as the hero's waterfall ---------- */
  var LUT = (function () {
    var t = new Uint8ClampedArray(513 * 3), bg = [5, 9, 17];
    for (var i = 0; i <= 512; i++) {
      var s = i / 256 - 1, k = Math.pow(Math.abs(s), 0.82), mid = s > 0 ? [255, 174, 76] : [104, 164, 250], top = s > 0 ? [255, 241, 216] : [226, 239, 255];
      var t1 = Math.min(1, k / 0.72), t2 = Math.max(0, (k - 0.72) / 0.28);
      for (var j = 0; j < 3; j++) { var v = bg[j] + (mid[j] - bg[j]) * t1; t[i * 3 + j] = v + (top[j] - v) * t2; }
    }
    return t;
  })();

  /* ---------- paper 1: the DAS channels, and one integrated measurement over the whole fibre ----------
     Synthetic: a small waterfall (road with traffic, then seafloor with ocean waves, now and then an earthquake)
     and, beside it, the sum over all its channels as a single trace. */
  (function () {
    var cv = $('vizSrl'); if (!cv) return;
    var ctx = cv.getContext('2d'), NC = 160, NR = 112, ROAD = 58, buf = document.createElement('canvas'), bx, row, f = { w: 0, h: 0, dpr: 1 };
    buf.width = NC; buf.height = NR; bx = buf.getContext('2d'); row = bx.createImageData(NC, 1); bx.fillStyle = 'rgb(5,9,17)'; bx.fillRect(0, 0, NC, NR);
    var trace = new Float32Array(NR), t = 0, cars = [], quake = null, nextQ = 1.2, nextCar = 0, apexAge = -1;
    function stepRow() {
      t += 1 / 24; var c, v, sum = 0, d = row.data;
      if (t >= nextCar) { var fwd = Math.random() < 0.5; cars.push({ p: fwd ? -4 : ROAD + 4, v: (fwd ? 1 : -1) * (0.7 + Math.random() * 0.6), w: 1.8 + Math.random() }); nextCar = t + 1.6 + Math.random() * 2.4; }
      if (t >= nextQ) { quake = { c: 78 + Math.random() * 66, t0: t, a: 0.6 + Math.random() * 0.3 }; nextQ = t + 6 + Math.random() * 3; apexAge = 0; }
      for (var i = cars.length - 1; i >= 0; i--) { cars[i].p += cars[i].v; if (cars[i].p < -8 || cars[i].p > ROAD + 8) cars.splice(i, 1); }
      for (c = 0; c < NC; c++) {
        v = (Math.random() * 2 - 1) * 0.05;
        if (c >= ROAD) { var e = Math.min(1, (c - ROAD) / 10); v += e * 0.1 * (Math.sin(c * 0.16 - t * 1.7) + 0.4 * Math.sin(c * 0.07 + t * 1.1 + 1.3)); }
        else for (var k = 0; k < cars.length; k++) { var uu = (c - cars[k].p) / cars[k].w; if (uu > -3 && uu < 3) { var g = Math.exp(-uu * uu); v += 0.75 * (-1.4 * uu * g * (cars[k].v > 0 ? 1 : -1) + 0.35 * g); } }
        if (quake) {
          var dist = Math.sqrt((c - quake.c) * (c - quake.c) + 1600) / 61, tau = t - quake.t0, x = tau - dist * 0.9, y = tau - dist * 1.55;
          if (x > 0 && x < 1.2) v += quake.a * 0.6 * Math.sin(15 * x) * Math.exp(-x / 0.28);
          if (y > 0 && y < 2.4) v += quake.a * 1.1 * Math.sin(9 * y) * Math.exp(-y / 0.45);
        }
        sum += v; var s = Math.tanh(v * 1.45), q = ((s + 1) * 256) | 0, o = c * 4;
        d[o] = LUT[q * 3]; d[o + 1] = LUT[q * 3 + 1]; d[o + 2] = LUT[q * 3 + 2]; d[o + 3] = 255;
      }
      if (quake && t - quake.t0 > 6) quake = null;
      bx.drawImage(buf, 0, 1, NC, NR - 1, 0, 0, NC, NR - 1); bx.putImageData(row, 0, NR - 1);
      trace.copyWithin(0, 1); trace[NR - 1] = sum / NC * 4.2;
      if (apexAge >= 0) apexAge++;
    }
    function draw() {
      var W = f.w, H = f.h, small = W < 380; ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      var x0 = 16, y0 = 34, y1 = H - 44, xw = Math.round(W * (small ? 0.62 : 0.64)), tx0 = xw + (small ? 30 : 46), tx1 = W - 16, h = y1 - y0, i;
      ctx.imageSmoothingEnabled = true; ctx.drawImage(buf, 0, 0, NC, NR, x0, y0, xw - x0, h);
      ctx.strokeStyle = 'rgba(226,214,190,.22)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, xw - x0 - 1, h - 1); ctx.strokeRect(tx0 + 0.5, y0 + 0.5, tx1 - tx0 - 1, h - 1);
      /* the integrated trace, time running down like the waterfall */
      var mid = (tx0 + tx1) / 2, amp = (tx1 - tx0) * 0.42;
      ctx.strokeStyle = 'rgba(226,214,190,.14)'; ctx.beginPath(); ctx.moveTo(mid, y0 + 4); ctx.lineTo(mid, y1 - 4); ctx.stroke();
      ctx.strokeStyle = '#ffc77e'; ctx.lineWidth = 1.4; ctx.beginPath();
      for (i = 0; i < NR; i++) { var yy = y0 + (i + 0.5) / NR * h, xx = mid + clamp(trace[i], -1, 1) * amp; if (!i) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
      ctx.stroke();
      /* the sum: one arrow from all the channels to the single trace */
      var ay = y0 + h * 0.5;
      ctx.strokeStyle = 'rgba(255,180,84,.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(xw + 6, ay); ctx.lineTo(tx0 - 8, ay); ctx.moveTo(tx0 - 13, ay - 4); ctx.lineTo(tx0 - 8, ay); ctx.lineTo(tx0 - 13, ay + 4); ctx.stroke();
      ctx.font = 'italic 300 ' + (small ? 17 : 21) + 'px Fraunces, Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd9a6'; ctx.fillText('Σ', (xw + tx0) / 2 - 2, ay - 8);
      /* labels and the two segments under the waterfall */
      monoLabel(ctx, small ? 'DAS channels' : 'DAS · channel by channel', x0, 21, 'rgba(243,238,228,.78)', 'left', 9.5);
      monoLabel(ctx, small ? 'sum' : 'one measurement', tx1, 21, '#ffd9a6', 'right', 9.5);
      var xr = x0 + (xw - x0) * ROAD / NC, by = y1 + 9;
      ctx.strokeStyle = 'rgba(226,214,190,.32)'; ctx.beginPath(); ctx.moveTo(x0, by); ctx.lineTo(x0, by + 5); ctx.lineTo(xr - 2, by + 5); ctx.lineTo(xr - 2, by); ctx.moveTo(xr + 2, by); ctx.lineTo(xr + 2, by + 5); ctx.lineTo(xw, by + 5); ctx.lineTo(xw, by); ctx.stroke();
      monoLabel(ctx, small ? 'traffic' : 'road · traffic', (x0 + xr) / 2, by + 20, 'rgba(243,238,228,.7)', 'center', 9);
      monoLabel(ctx, small ? 'ocean waves' : 'seafloor · ocean waves', (xr + xw) / 2, by + 20, 'rgba(243,238,228,.7)', 'center', 9);
      monoLabel(ctx, 'whole fibre', mid, by + 20, 'rgba(255,217,166,.8)', 'center', 9);
      if (apexAge > 18 && apexAge < NR + 6 && quake) {
        var ay2 = y1 - (apexAge - 15) / NR * h, ax = x0 + (xw - x0) * quake.c / NC;
        monoLabel(ctx, 'earthquake', clamp(ax, x0 + 50, xw - 50), Math.max(y0 + 14, ay2 - 6), 'rgba(255,236,206,.92)', 'center', 9);
      }
    }
    function size() { f = fitCanvas(cv); draw(); }
    for (var i = 0; i < NR; i++) stepRow();
    size(); onResize(size); onFonts(size);
    animate(cv, function () { stepRow(); draw(); }, 1000 / 24 - 2);
  })();

  /* ---------- paper 2: a straight wavefront crossing a curved fibre; each part of the arc feels it differently ---------- */
  (function () {
    var cv = $('vizArc'); if (!cv) return;
    var ctx = cv.getContext('2d'), f = { w: 0, h: 0, dpr: 1 }, t0 = performance.now();
    function draw(now) {
      var W = f.w, H = f.h, t = reduced ? 1.6 : (now - t0) / 1000, small = W < 380;
      ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      var cx = W * 0.5, cy = H * 0.86, R = Math.min(W * 0.36, H * 0.62), a0 = Math.PI + 0.22, a1 = 2 * Math.PI - 0.22, n = 90, i;
      /* a train of plane wavefronts; their direction drifts slowly, so the response along the arc keeps changing */
      var dir = -0.55 + 0.42 * Math.sin(t * 0.21), kx = Math.cos(dir), ky = Math.sin(dir), lam = Math.max(70, W * 0.16), D = Math.hypot(W, H), ox = W * 0.5, oy = H * 0.5;
      var ph = (t * lam * 0.62) % lam, fronts = [];
      for (var s0 = -D * 0.5 - lam + ph; s0 < D * 0.5 + lam; s0 += lam) fronts.push(s0);
      for (var w = 0; w < fronts.length; w++) {
        var px = ox + kx * fronts[w], py = oy + ky * fronts[w];
        ctx.strokeStyle = 'rgba(169,205,252,.30)'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(px - ky * D, py + kx * D); ctx.lineTo(px + ky * D, py - kx * D); ctx.stroke();
      }
      /* arrow for the direction of travel, at the left edge of the box */
      var ax = 30 + kx * 20, ay = H - 34 + ky * 20;
      ctx.strokeStyle = 'rgba(169,205,252,.8)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(30, H - 34); ctx.lineTo(ax, ay);
      ctx.moveTo(ax - kx * 7 - ky * 4.5, ay - ky * 7 + kx * 4.5); ctx.lineTo(ax, ay); ctx.lineTo(ax - kx * 7 + ky * 4.5, ay - ky * 7 - kx * 4.5); ctx.stroke();
      /* the response of each part of the arc: strain along the fibre goes as cos² of the angle to the wave */
      for (i = 0; i <= n; i++) {
        var a = a0 + (a1 - a0) * i / n, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, tgx = -Math.sin(a), tgy = Math.cos(a), cs = tgx * kx + tgy * ky, resp = cs * cs;
        if (i % 3 === 0) { ctx.strokeStyle = 'rgba(255,180,84,' + (0.16 + 0.5 * resp).toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); ctx.lineTo(x + Math.cos(a) * (6 + 24 * resp), y + Math.sin(a) * (6 + 24 * resp)); ctx.stroke(); }
      }
      /* the fibre, lit where the front crosses it, and lit more where it lies along the wave */
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,180,84,.18)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
      for (i = 0; i < n; i++) {
        var b0 = a0 + (a1 - a0) * i / n, b1 = a0 + (a1 - a0) * (i + 1) / n, bm = (b0 + b1) / 2, mx = cx + Math.cos(bm) * R, my = cy + Math.sin(bm) * R;
        var proj = (mx - ox) * kx + (my - oy) * ky, hit = 0;
        for (w = 0; w < fronts.length; w++) { var df = proj - fronts[w]; hit += Math.exp(-df * df / 160); }
        var cs2 = -Math.sin(bm) * kx + Math.cos(bm) * ky, r2 = cs2 * cs2, e = Math.min(1, hit) * r2;
        ctx.strokeStyle = 'rgb(255,' + Math.round(166 + 64 * e) + ',' + Math.round(70 + 124 * e) + ')'; ctx.lineWidth = 2 + 2.4 * e;
        ctx.beginPath(); ctx.arc(cx, cy, R, b0, b1 + 0.004); ctx.stroke();
        if (e > 0.25) { ctx.fillStyle = 'rgba(255,230,194,' + (0.5 * e).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(mx, my, 3 + 5 * e, 0, 6.2832); ctx.fill(); }
      }
      monoLabel(ctx, 'plane wave', 14, 22, 'rgba(169,205,252,.85)', 'left', 9.5);
      monoLabel(ctx, small ? 'curved fibre' : 'curved fibre · what each part records', W - 14, 22, 'rgba(255,217,166,.85)', 'right', 9.5);
    }
    function size() { f = fitCanvas(cv); draw(performance.now()); }
    size(); onResize(size); onFonts(size);
    animate(cv, draw);
  })();

  /* ---------- paper 3: the fibre under the streets of Athens; traffic sends out noise, the fibre picks it up ---------- */
  (function () {
    var cv = $('vizAthens'); if (!cv) return;
    var ctx = cv.getContext('2d'), f = { w: 0, h: 0, dpr: 1 }, t0 = performance.now(), last = 0;
    var HS = [0.12, 0.31, 0.5, 0.69, 0.88], VS = [0.06, 0.2, 0.35, 0.52, 0.67, 0.82, 0.95];
    var ROUTE = [[-0.2, 0.69], [0.35, 0.69], [0.35, 0.5], [0.67, 0.5], [0.67, 0.31], [1.2, 0.31]];
    var BLOCKS = [[0.06, 0.12], [0.2, 0.31], [0.52, 0.69], [0.82, 0.5], [0.35, 0.88], [0.67, 0.12], [0.06, 0.69]];
    var cars = [], rings = [], ca = Math.cos(-0.09), sa = Math.sin(-0.09);
    function M(u, v) { var x = (u - 0.5) * f.w * 1.16, y = (v - 0.5) * f.h * 1.16; return [f.w / 2 + x * ca - y * sa, f.h / 2 + x * sa + y * ca]; }
    function car(t, spread) {
      var hz = Math.random() < 0.6, dir = Math.random() < 0.5 ? 1 : -1;
      return { hz: hz, line: hz ? HS[(Math.random() * HS.length) | 0] : VS[(Math.random() * VS.length) | 0], p: spread ? Math.random() : (dir > 0 ? -0.15 : 1.15), v: dir * (0.05 + Math.random() * 0.05), next: t + Math.random() * 1.5 };
    }
    for (var i = 0; i < 5; i++) cars.push(car(0, true));
    var fib = [];
    function sampleRoute() {
      fib = []; for (var k = 0; k < ROUTE.length - 1; k++) for (var j = 0; j < 40; j++) { var a = ROUTE[k], b = ROUTE[k + 1], q = j / 40; fib.push(M(a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q)); }
      fib.push(M(ROUTE[ROUTE.length - 1][0], ROUTE[ROUTE.length - 1][1]));
    }
    function draw(now) {
      var t = reduced ? 4.0 : (now - t0) / 1000, dt = Math.min(0.1, Math.max(0, t - last)), W = f.w, H = f.h, k, j, p, q; last = t;
      if (reduced && !rings.length) { rings.push({ x: M(0.52, 0.31)[0], y: M(0.52, 0.31)[1], t0: 3.0 }, { x: M(0.2, 0.69)[0], y: M(0.2, 0.69)[1], t0: 2.4 }); }
      ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      /* blocks and streets */
      ctx.fillStyle = 'rgba(169,205,252,.035)';
      BLOCKS.forEach(function (bk) { var a = M(bk[0] + 0.012, bk[1] + 0.02), b = M(bk[0] + 0.13, bk[1] + 0.02), c = M(bk[0] + 0.13, bk[1] + 0.17), d = M(bk[0] + 0.012, bk[1] + 0.17); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.fill(); });
      ctx.strokeStyle = 'rgba(169,205,252,.17)'; ctx.lineWidth = 1; ctx.beginPath();
      HS.forEach(function (v) { p = M(-0.2, v); q = M(1.2, v); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); });
      VS.forEach(function (u) { p = M(u, -0.2); q = M(u, 1.2); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); });
      p = M(-0.1, 1.05); q = M(0.62, -0.1); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      /* traffic: each car sends out a ring of noise now and then */
      for (k = cars.length - 1; k >= 0; k--) {
        var c = cars[k]; if (!reduced) c.p += c.v * dt;
        if (c.p < -0.2 || c.p > 1.2) { cars[k] = car(t, false); continue; }
        p = c.hz ? M(c.p, c.line) : M(c.line, c.p);
        if (!reduced && t >= c.next) { rings.push({ x: p[0], y: p[1], t0: t }); c.next = t + 1.3 + Math.random() * 1.2; }
        q = c.hz ? M(c.p - c.v * 0.9, c.line) : M(c.line, c.p - c.v * 0.9);
        ctx.strokeStyle = 'rgba(255,214,160,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
        ctx.fillStyle = 'rgba(255,236,206,.95)'; ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, 6.2832); ctx.fill();
      }
      var spd = Math.max(W, H) * 0.2, life = 2.6;
      for (k = rings.length - 1; k >= 0; k--) {
        var r = rings[k], age = t - r.t0; if (age > life) { rings.splice(k, 1); continue; }
        ctx.strokeStyle = 'rgba(169,205,252,' + (0.5 * (1 - age / life)).toFixed(3) + ')'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(0.5, age * spd), 0, 6.2832); ctx.stroke();
      }
      /* the fibre: lit where a ring crosses it, and the interrogator's pulse running along it */
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,180,84,.16)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(fib[0][0], fib[0][1]); for (j = 1; j < fib.length; j++) ctx.lineTo(fib[j][0], fib[j][1]); ctx.stroke();
      var pulse = ((t % 3.6) / 1.8) * fib.length;
      for (j = 0; j < fib.length - 1; j++) {
        var mx = (fib[j][0] + fib[j + 1][0]) / 2, my = (fib[j][1] + fib[j + 1][1]) / 2, e = 0;
        for (k = 0; k < rings.length; k++) { var rg = rings[k], ag = t - rg.t0, dd = Math.hypot(mx - rg.x, my - rg.y) - ag * spd; e += Math.exp(-dd * dd / 30) * (1 - ag / life); }
        var dp = j - pulse; e = Math.min(1, e + (reduced ? 0 : 1.2 * Math.exp(-dp * dp / 6)));
        ctx.strokeStyle = 'rgb(255,' + Math.round(166 + 66 * e) + ',' + Math.round(70 + 126 * e) + ')'; ctx.lineWidth = 2 + 2.2 * e;
        ctx.beginPath(); ctx.moveTo(fib[j][0], fib[j][1]); ctx.lineTo(fib[j + 1][0], fib[j + 1][1]); ctx.stroke();
      }
      monoLabel(ctx, 'traffic noise', W - 14, 22, 'rgba(169,205,252,.85)', 'right', 9.5);
    }
    function size() { f = fitCanvas(cv); sampleRoute(); draw(performance.now()); }
    size(); onResize(size); onFonts(size);
    animate(cv, draw);
  })();

  /* ---------- Wave Lab tile: two sources interfering ---------- */
  (function () {
    var cv = $('labCanvas'); if (!cv) return;
    var w = 240, h = 135, off = document.createElement('canvas'); off.width = w; off.height = h;
    var ox = off.getContext('2d'), img = ox.createImageData(w, h), d = img.data, ctx = cv.getContext('2d'), n = w * h, i;
    /* the sources never move, so their distances are worked out once */
    var R1 = new Float32Array(n), R2 = new Float32Array(n), FD = new Float32Array(n), ax = w * 0.3, ay = h * 0.42, bx = w * 0.72, by = h * 0.64, k2 = 0.7;
    for (i = 0; i < n; i++) {
      var x = i % w, y = (i / w) | 0, r1 = Math.sqrt((x - ax) * (x - ax) + (y - ay) * (y - ay)) * k2, r2 = Math.sqrt((x - bx) * (x - bx) + (y - by) * (y - by)) * k2;
      R1[i] = r1; R2[i] = r2; FD[i] = 1 / (1 + Math.min(r1, r2) * 0.014);
    }
    function size() { var f = fitCanvas(cv); return f; }
    function draw(t) {
      var o = 0;
      for (i = 0; i < n; i++) {
        var r1 = R1[i], r2 = R2[i], v = Math.sin(r1 * 0.3 - t * 2.2) / (1 + r1 * 0.022) + 0.85 * Math.sin(r2 * 0.42 - t * 2.9) / (1 + r2 * 0.022);
        var q = v * v * 46, ln = 1 / (1 + q + q * q * 0.5 + q * q * q * 0.1667), sh = 0.5 + 0.5 * v / (1 + Math.abs(v)), fd = FD[i];   // ≈ exp(-q), cheaper
        d[o++] = 5 + (255 * ln * 0.86 + 8 * sh) * fd; d[o++] = 9 + (186 * ln * 0.86 + 17 * sh) * fd; d[o++] = 17 + (104 * ln * 0.84 + 40 * sh) * fd; d[o++] = 255;
      }
      ox.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(off, 0, 0, w, h, 0, 0, cv.width, cv.height);
    }
    size(); draw(1.7);
    onResize(function () { size(); draw(1.7); });
    animate(cv, function (now) { draw(now / 1000); }, 62);
  })();

  /* ---------- SeismoHub screenshots ---------- */
  (function () {
    var shot = $('hubShot'); if (!shot) return;
    [].forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.addEventListener('click', function () {
        [].forEach.call(b.parentNode.children, function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        shot.src = b.getAttribute('data-src'); shot.alt = b.getAttribute('data-alt');
      });
    });
  })();
})();
