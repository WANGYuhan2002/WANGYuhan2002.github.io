/* v3e · INVISIBLE — the small instruments on the page. Everything here is an extra on top of plain HTML:
   exposure read-out, the fibre drawing, the map, the two fields of lights, the cross-fading photographs,
   the film strip and its lightbox, smooth anchors. Animated parts share the loop of js/scene.js. */
(function () {
  'use strict';

  var SC = window.YWScene || null;
  var REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var root = document.documentElement;
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function docTop(el) { return el.getBoundingClientRect().top + (window.pageYOffset || 0); }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s += 0x6D2B79F5; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  var frameFns = [];
  function onFrame(fn) {
    if (SC) { SC.onFrame(fn); return; }
    frameFns.push(fn);
    if (frameFns.length === 1) {
      var last = 0;
      (function loop(now) { var dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now; for (var i = 0; i < frameFns.length; i++) frameFns[i](now, dt, window.pageYOffset || 0); requestAnimationFrame(loop); })(0);
    }
  }
  function vh() { return SC ? SC.size().H : window.innerHeight; }
  function inView(el, cb, opts) {
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    new IntersectionObserver(function (es) { for (var i = 0; i < es.length; i++) cb(es[i].isIntersecting, es[i]); }, opts || { threshold: 0.1 }).observe(el);
  }

  /* ---------- film grain ---------- */
  (function () {
    var g = $('grain'); if (!g) return;
    try {
      var c = document.createElement('canvas'); c.width = c.height = 256;
      var x = c.getContext('2d'), d = x.createImageData(256, 256), i, v;
      for (i = 0; i < d.data.length; i += 4) { v = Math.random() * 255 | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      x.putImageData(d, 0, 0); g.style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')';
    } catch (e) { g.style.display = 'none'; }
  })();

  /* ---------- e-mail: put together here, never in the page source ---------- */
  (function () {
    var user = 'yuhan.wang', host = 'eaps.ethz.ch', addr = user + '@' + host;
    Array.prototype.forEach.call(document.querySelectorAll('[data-mail]'), function (a) { a.href = 'mailto:' + addr; a.removeAttribute('target'); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-mail-text]'), function (s) { s.textContent = addr; });
  })();

  /* ---------- the sky: read-out, new exposure, hold to expose faster, tilt ---------- */
  (function () {
    var hero = $('top'), copy = $('heroCopy'), hud = $('hud'), note = $('ridgeNote'), cue = document.querySelector('.cue');
    var tEl = $('hudT'), aEl = $('hudA'), rEl = $('hudR'), cEl = $('hudC'), btn = $('newExp'), acc = 1, lastTxt = '', lastSy = -1;
    function clock(s) { s = Math.floor(s); var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
    function real(deg) { var min = Math.round(deg * 4), h = Math.floor(min / 60), m = min % 60; return !h ? m + ' min' : !m ? h + ' h' : h + ' h ' + (m < 10 ? '0' : '') + m + ' min'; }
    if (note && !window.YW_SEIS) note.style.display = 'none';      // no data, no claim
    if (!SC) { if (hud) hud.style.display = 'none'; return; }
    if (REDUCE) {                                    // a still sky has no shutter time to report: only the trails it shows
      var hv = document.querySelector('.hud-v');
      if (hv) { hv.innerHTML = 'A held exposure: trails <b id="hudA">27°</b> long, <b id="hudR">1 h 48 min</b> under a real sky.'; tEl = null; aEl = $('hudA'); rEl = $('hudR'); }
    }
    var refresh = function () { acc = 1; lastTxt = ''; };   // rewrite the read-out on the next frame
    if (btn) btn.addEventListener('click', function () { SC.sky.reset(); refresh(); });
    if (hero) {
      var lab = $('hudL'); if (lab && REDUCE) lab.textContent = 'Long exposure, held still';
      var lab0 = lab ? lab.textContent : '';
      var up = function () { SC.sky.setFast(false); if (hud) hud.classList.remove('fast'); if (lab) lab.textContent = lab0; refresh(); };
      hero.addEventListener('pointerdown', function (e) {
        if (REDUCE || e.pointerType !== 'mouse' || e.button !== 0) return;
        if (e.target.closest && e.target.closest('a,button')) return;
        SC.sky.setFast(true); if (hud) hud.classList.add('fast'); if (lab) lab.textContent = 'Exposing nine times faster';
        refresh();
      });
      window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', up);
    }
    if (!REDUCE) window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      SC.sky.tilt((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
    onFrame(function (now, dt, sy) {
      var H = vh();
      if (sy !== lastSy && sy < H * 1.2) {
        var o = 1 - sstep(0.05 * H, 0.4 * H, sy);
        if (copy) { copy.style.opacity = o.toFixed(3); copy.style.transform = 'translate3d(0,' + (sy * 0.2).toFixed(1) + 'px,0)'; }
        var o2 = (1 - sstep(0.02 * H, 0.3 * H, sy)).toFixed(3);
        if (hud) hud.style.opacity = o2; if (cue) cue.style.opacity = o2;
        if (note) note.style.opacity = (1 - sstep(0.04 * H, 0.34 * H, sy)).toFixed(3);
      }
      lastSy = sy;
      acc += dt; if (acc < 0.25) return; acc = 0;
      if (sy > H) return;
      // the time is worked out from the rounded angle, so the read-out keeps its own rule: 1° of trail = 4 min
      var i = SC.sky.info(), deg = Math.round(i.deg), txt = clock(i.t) + '|' + deg + (i.fast ? 'f' : '');
      if (txt === lastTxt) return; lastTxt = txt;
      if (tEl) tEl.textContent = clock(i.t); if (aEl) aEl.textContent = deg + '°'; if (rEl) rEl.textContent = real(deg);
      // the one-line read-out below 1180 px; it also says when the mouse is held down
      if (cEl) cEl.textContent = (REDUCE ? 'Held still' : i.fast ? '9× faster' : 'Live') + ' · trails ' + deg + '° · ' + real(deg);
    });
  })();

  /* ---------- reveal on scroll ---------- */
  (function () {
    var els = document.querySelectorAll('.rv'), i;
    if (REDUCE || !('IntersectionObserver' in window)) { for (i = 0; i < els.length; i++) els[i].classList.add('in'); return; }
    var io = new IntersectionObserver(function (es) {
      for (var k = 0; k < es.length; k++) if (es[k].isIntersecting) { es[k].target.classList.add('in'); io.unobserve(es[k].target); }
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    for (i = 0; i < els.length; i++) io.observe(els[i]);
  })();

  /* ---------- top bar: out of the way on the way down, back on the way up ---------- */
  (function () {
    var bar = $('topbar'), last = 0, away = false; if (!bar) return;
    onFrame(function (now, dt, sy) {
      var H = vh(), d = sy - last;
      if (Math.abs(d) < 6) return; last = sy;
      var want = d > 0 && sy > H * 0.8;
      if (want !== away) { away = want; bar.classList.toggle('away', away); }
    });
  })();

  /* ---------- II · the fibre: waves from below light the cable; the record builds above it ---------- */
  (function () {
    var cv = $('fibreBand'); if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), CAB = window.YW_CABLE || { channels: 1872, segments: [], coils: [] };
    var rec = document.createElement('canvas'), rc = rec.getContext('2d');
    var w = 0, h = 0, fy = 0, x0 = 0, x1 = 0, rw = 0, rh = 0, ry = 0, src = [], vis = false, auto = 0.9, acc = 0, lastUser = -1e9, t = 0;
    var VP = 175, VS = VP / 1.73, RATE = 30, r = rng(404);
    function chX(c) { return x0 + (x1 - x0) * c / CAB.channels; }
    function size() {
      var b = cv.getBoundingClientRect(); w = Math.max(200, Math.round(b.width)); h = Math.max(200, Math.round(b.height));
      cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
      x0 = Math.max(22, Math.round(w * 0.085)); x1 = w - x0; rw = x1 - x0; rh = Math.round(h * 0.29); fy = Math.round(h * 0.46); ry = fy - 15 - rh;
      rec.width = rw; rec.height = rh; src = [];
    }
    function addSource(x, y) {
      x = clamp(x, x0 + 10, x1 - 10); y = clamp(y, fy + 74, h - 14);
      src.push({ x: x, y: y, t: 0, ph: [{ v: VP, l: null, r: null, c: '205,226,255', k: 0.55 }, { v: VS, l: null, r: null, c: '255,190,120', k: 1 }] });
      if (src.length > 5) src.shift();
    }
    // with reduced motion an earthquake is shown as its finished record, at once
    function still(x, y) { src = []; acc = 0; rc.clearRect(0, 0, rw, rh); addSource(x, y); for (var k = 0; k < 150; k++) draw(1 / 30); }
    function quake(x, y) { if (REDUCE) still(x, y); else { lastUser = t; addSource(x, y); } }
    cv.addEventListener('click', function (e) { var b = cv.getBoundingClientRect(); quake(e.clientX - b.left, e.clientY - b.top); });
    var btn = $('quakeBtn');
    if (btn) btn.addEventListener('click', function () { quake(chX(925 + r() * 800), fy + 90 + r() * (h - fy - 120)); });
    inView(cv, function (on) { vis = on; }, { threshold: 0.05 });
    window.addEventListener('resize', function () {
      clearTimeout(size._t);
      size._t = setTimeout(function () { size(); if (REDUCE) still(chX(1250), fy + 130); else draw(0); }, 200);
    });

    function label(txt, x, y, al, align) { ctx.fillStyle = 'rgba(241,233,216,' + al + ')'; ctx.textAlign = align || 'left'; ctx.fillText(txt, x, y); }

    function draw(dt) {
      var i, j, s, p, rad, dy, dx, a, sh, hot = [];
      // the record scrolls up; the newest line is the one next to the cable
      acc += dt * RATE; sh = acc | 0; acc -= sh;
      if (sh > 0) {
        rc.globalCompositeOperation = 'copy'; rc.drawImage(rec, 0, -sh);
        rc.globalCompositeOperation = 'destination-out'; rc.fillStyle = 'rgba(0,0,0,' + Math.min(0.5, 0.011 * sh) + ')'; rc.fillRect(0, 0, rw, rh);
      }
      rc.globalCompositeOperation = 'lighter'; rc.lineCap = 'round';
      for (i = src.length - 1; i >= 0; i--) {
        s = src[i]; s.t += dt; dy = s.y - fy;
        var alive = false;
        for (j = 0; j < 2; j++) {
          p = s.ph[j]; rad = p.v * s.t;
          if (rad <= dy) { alive = true; continue; }
          dx = Math.sqrt(rad * rad - dy * dy);
          var cl = s.x - dx, cr = s.x + dx, cosT = dx / rad, sinT = dy / rad;
          // what a fibre feels: P as cos², S as sin·cos of the angle to the cable; both fade with distance
          var amp = (j === 0 ? cosT * cosT : 2 * sinT * cosT) * Math.sqrt(dy / rad) * p.k;
          a = clamp(0.1 + amp * 1.5, 0, 1);
          if (cl > x0 - 20 || cr < x1 + 20) alive = true;
          rc.strokeStyle = 'rgba(' + p.c + ',' + a.toFixed(3) + ')'; rc.lineWidth = j ? 1.5 : 1.1;
          rc.beginPath();
          rc.moveTo((p.l === null ? s.x : p.l) - x0, rh - 1 - sh); rc.lineTo(cl - x0, rh - 1);
          rc.moveTo((p.r === null ? s.x : p.r) - x0, rh - 1 - sh); rc.lineTo(cr - x0, rh - 1);
          rc.stroke();
          p.l = cl; p.r = cr;
          if (cl > x0 && cl < x1) hot.push([cl, a, p.c]);
          if (cr > x0 && cr < x1) hot.push([cr, a, p.c]);
        }
        if (!alive && s.t > 3) src.splice(i, 1);
      }

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = '400 9.5px "IBM Plex Mono", ui-monospace, monospace'; ctx.textBaseline = 'alphabetic';
      // the record
      ctx.fillStyle = 'rgba(5,6,16,.5)'; ctx.fillRect(x0, ry, rw, rh);
      ctx.drawImage(rec, x0, ry, rw, rh);
      ctx.strokeStyle = 'rgba(241,233,216,.16)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0 + 0.5, ry); ctx.lineTo(x0 + 0.5, ry + rh); ctx.moveTo(x1 - 0.5, ry); ctx.lineTo(x1 - 0.5, ry + rh); ctx.moveTo(x0, ry + 0.5); ctx.lineTo(x1, ry + 0.5); ctx.stroke();
      label('WHAT THE CABLE RECORDS', x0, ry - 9, 0.5);
      label('TIME ↓', x1, ry - 9, 0.5, 'right');

      // wavefronts
      for (i = 0; i < src.length; i++) {
        s = src[i];
        var fade = clamp(1 - s.t / 9, 0, 1);
        for (j = 0; j < 2; j++) {
          p = s.ph[j]; rad = p.v * s.t; if (rad < 2) continue;
          ctx.strokeStyle = 'rgba(' + p.c + ',' + (fade * (j ? 0.62 : 0.3)).toFixed(3) + ')'; ctx.lineWidth = j ? 1.3 : 0.8;
          ctx.beginPath(); ctx.arc(s.x, s.y, rad, 0, 6.2832); ctx.stroke();
          if (j) { ctx.strokeStyle = 'rgba(' + p.c + ',' + (fade * 0.2).toFixed(3) + ')'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, rad - 8), 0, 6.2832); ctx.stroke(); }
        }
        if (s.t < 2.2) {
          a = 1 - s.t / 2.2;
          var g0 = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 22); g0.addColorStop(0, 'rgba(255,224,178,' + (0.9 * a).toFixed(3) + ')'); g0.addColorStop(1, 'rgba(255,190,120,0)');
          ctx.fillStyle = g0; ctx.fillRect(s.x - 22, s.y - 22, 44, 44);
        }
      }

      // the fibre, its coils of spare glass, and where the waves are crossing it right now
      ctx.save();
      ctx.shadowColor = 'rgba(255,176,96,.85)'; ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(255,214,164,.9)'; ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(x0, fy); ctx.lineTo(x1, fy); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,214,164,.75)'; ctx.lineWidth = 0.9;
      for (i = 0; i < CAB.coils.length; i++) {
        var co = CAB.coils[i], cxp = chX((co.from + co.to) / 2), cr2 = 2.6 + co.m / 172 * 3.6;
        ctx.beginPath(); ctx.arc(cxp, fy - cr2, cr2, 0, 6.2832); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < hot.length; i++) {
        var hr = 10 + hot[i][1] * 30, g1 = ctx.createRadialGradient(hot[i][0], fy, 0, hot[i][0], fy, hr);
        g1.addColorStop(0, 'rgba(' + hot[i][2] + ',' + (0.25 + 0.7 * hot[i][1]).toFixed(3) + ')'); g1.addColorStop(1, 'rgba(' + hot[i][2] + ',0)');
        ctx.fillStyle = g1; ctx.fillRect(hot[i][0] - hr, fy - hr, hr * 2, hr * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,224,178,.95)'; ctx.beginPath(); ctx.arc(x0, fy, 2.4, 0, 6.2832); ctx.fill();

      // channels and what the cable lies on
      ctx.strokeStyle = 'rgba(241,233,216,.34)'; ctx.lineWidth = 1; ctx.beginPath();
      for (i = 0; i <= CAB.channels; i += 100) { var tx = Math.round(chX(i)) + 0.5; ctx.moveTo(tx, fy + 7); ctx.lineTo(tx, fy + (i % 400 === 0 ? 13 : 10)); }
      ctx.stroke();
      var nums = w < 620 ? [0, 800, 1600] : [0, 400, 800, 1200, 1600];
      for (i = 0; i < nums.length; i++) label((i ? '' : 'CH ') + nums[i], chX(nums[i]), fy + 26, 0.52, i ? 'center' : 'left');
      label(String(CAB.channels), x1, fy + 26, 0.52, 'center');
      var segs = CAB.segments || [], names = { land: w < 760 ? 'KEFALONIA' : 'KEFALONIA · ALONG THE COAST ROAD', sea: w < 760 ? 'SEAFLOOR' : 'SEAFLOOR · KEFALONIA–ITHACA STRAIT', ithaca: 'ITHACA' };
      for (i = 0; i < segs.length; i++) {
        var sg = segs[i]; if (!names[sg.key]) continue;
        var sa = chX(sg.from) + 2, sb = chX(sg.to) - 2, sea = sg.key === 'sea';
        ctx.strokeStyle = sea ? 'rgba(150,170,255,.6)' : 'rgba(214,160,112,.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sa, fy + 39.5); ctx.lineTo(sb, fy + 39.5); ctx.stroke();
        if (ctx.measureText(names[sg.key]).width < sb - sa - 6) label(names[sg.key], (sa + sb) / 2, fy + 54, 0.5, 'center');
        else if (sg.key === 'ithaca') label('ITHACA', sb, fy + 54, 0.5, 'right');
      }
    }

    size();
    if (REDUCE) { still(chX(1250), fy + 130); return; }   // one finished record instead of a moving one
    draw(0);
    onFrame(function (now, dt) {
      if (!vis) return;
      t += dt;
      if (t - lastUser > 5) { auto -= dt; if (auto <= 0) { auto = 3.6 + r() * 2.4; addSource(chX(760 + r() * 980), fy + 84 + r() * (h - fy - 110)); } }
      draw(dt);
    });
  })();

  /* ---------- the map: two islands and one cable ---------- */
  (function () {
    var el = $('map'), G = window.YW_GEO, C = window.YW_CABLE;
    if (!el || !G || !G.kefalonia || !C) return;
    var lon0 = 20.3, lon1 = 20.86, lat0 = 38.03, lat1 = 38.56, k = 900, cs = Math.cos(38.3 * Math.PI / 180);
    var Wd = (lon1 - lon0) * cs * k, Hd = (lat1 - lat0) * k;
    function P(lon, lat) { return ((lon - lon0) * cs * k).toFixed(1) + ' ' + ((lat1 - lat) * k).toFixed(1); }
    var land = '', i, j, ring, s = '';
    for (i = 0; i < G.kefalonia.polys.length; i++) {
      ring = G.kefalonia.polys[i].ring; land += 'M';
      for (j = 0; j < ring.length; j++) land += (j ? 'L' : '') + P(ring[j][0], ring[j][1]);
      land += 'Z';
    }
    var route = 'M';
    for (i = 0; i < C.route.length; i++) route += (i ? 'L' : '') + P(C.route[i][1], C.route[i][2]);
    var a = C.route[0], b = C.route[C.route.length - 1];
    var pa = P(a[1], a[2]).split(' '), pb = P(b[1], b[2]).split(' ');
    var grat = '';
    for (var la = 38.1; la < lat1; la += 0.1) grat += 'M0 ' + ((lat1 - la) * k).toFixed(1) + 'H' + Wd.toFixed(1);
    for (var lo = 20.4; lo < lon1; lo += 0.1) grat += 'M' + ((lo - lon0) * cs * k).toFixed(1) + ' 0V' + Hd.toFixed(1);
    var km10 = 10 / 111.19 * k;
    s += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Wd.toFixed(0) + ' ' + Hd.toFixed(0) + '" aria-hidden="true" focusable="false">';
    s += '<defs><clipPath id="mclip"><rect width="' + Wd.toFixed(0) + '" height="' + Hd.toFixed(0) + '"/></clipPath></defs>';
    s += '<rect width="' + Wd.toFixed(0) + '" height="' + Hd.toFixed(0) + '" fill="rgba(5,6,16,.62)" stroke="rgba(241,233,216,.2)"/>';
    s += '<g clip-path="url(#mclip)">';
    s += '<path d="' + grat + '" fill="none" stroke="rgba(241,233,216,.07)" stroke-width="1"/>';
    s += '<path d="' + land + '" fill="rgba(241,233,216,.075)" stroke="rgba(241,233,216,.62)" stroke-width=".9" stroke-linejoin="round"/>';
    s += '<path d="' + route + '" fill="none" stroke="rgba(255,176,96,.28)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>';
    s += '<path d="' + route + '" fill="none" stroke="#ffd09a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
    if (!REDUCE) s += '<path class="pulse" d="' + route + '" pathLength="100" fill="none" stroke="#fff6e6" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="5 95"><animate attributeName="stroke-dashoffset" from="100" to="0" dur="3.4s" repeatCount="indefinite"/></path>';
    s += '</g>';
    s += '<circle cx="' + pa[0] + '" cy="' + pa[1] + '" r="2.6" fill="#ffd09a"/><circle cx="' + pb[0] + '" cy="' + pb[1] + '" r="2.6" fill="#ffd09a"/>';
    var f = 'font-family="IBM Plex Mono, ui-monospace, monospace" font-size="9.5" letter-spacing="1.4"';
    s += '<path d="M' + (+pa[0] - 4) + ' ' + (+pa[1] - 4) + 'L' + (+pa[0] - 44) + ' ' + (+pa[1] - 44) + 'H24" fill="none" stroke="rgba(241,233,216,.45)" stroke-width=".8"/>';
    s += '<text x="24" y="' + (+pa[1] - 50) + '" fill="rgba(241,233,216,.9)" ' + f + '>THE CABLE</text>';
    s += '<text x="24" y="' + (+pa[1] - 30) + '" fill="rgba(241,233,216,.55)" ' + f + '>15.29 KM OF FIBRE · 1872 CH</text>';
    s += '<text x="' + ((20.50 - lon0) * cs * k).toFixed(0) + '" y="' + ((lat1 - 38.235) * k).toFixed(0) + '" fill="rgba(241,233,216,.62)" text-anchor="middle" ' + f + '>KEFALONIA</text>';
    s += '<text x="' + ((20.745 - lon0) * cs * k).toFixed(0) + '" y="' + ((lat1 - 38.30) * k).toFixed(0) + '" fill="rgba(241,233,216,.62)" ' + f + '>ITHACA</text>';
    s += '<path d="M16 ' + (Hd - 18).toFixed(0) + 'h' + km10.toFixed(1) + 'm0 -4v8m-' + km10.toFixed(1) + ' -8v8" fill="none" stroke="rgba(241,233,216,.6)" stroke-width="1"/>';
    s += '<text x="' + (22 + km10).toFixed(0) + '" y="' + (Hd - 14.5).toFixed(0) + '" fill="rgba(241,233,216,.55)" ' + f + '>10 KM</text>';
    s += '<text x="' + (Wd - 12).toFixed(0) + '" y="20" text-anchor="end" fill="rgba(241,233,216,.4)" ' + f + '>38.5°N · 20.6°E</text>';
    s += '</svg>';
    el.innerHTML = s;
  })();

  /* ---------- III · two fields of lights: 893 and 17,325 ---------- */
  function lights(id, count, kind, dur) {
    var cv = $(id); if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), fig = cv.parentNode, num = fig.querySelector('.num'), note = fig.querySelector('.cl');
    var sp = document.createElement('canvas'), sx = sp.getContext('2d'); sp.setAttribute('aria-hidden', 'true'); fig.insertBefore(sp, cv.nextSibling);
    var w = 0, h = 0, pts = null, inC = null, cl = null, lead = null, kC = 1, shown = 0, t = -1, done = false, vis = false, glints = [], COLS = ['255,214,160', '255,236,205', '226,234,255', '255,190,120', '255,226,184'];
    function gauss(r) { return (r() + r() + r() + r() - 2) * 0.866; }   // standard deviation 0.5
    function gen() {
      var r = rng(kind === 'cable' ? 17325 : 893), i, u, x, y, ang = -0.47, ca = Math.cos(ang), sa = Math.sin(ang);
      pts = new Float32Array(count * 4); inC = new Uint8Array(count);
      var ucl = 0.6, xc = w * (0.08 + 0.84 * ucl), yc = h * (0.63 - 0.4 * ucl + 0.06 * Math.sin(ucl * 5.2));
      var nC = kind === 'cable' ? Math.round(count * 0.724) : 0, ax = w * 0.11, ay = h * 0.09;
      for (i = 0; i < count; i++) {
        var q = r();
        if (i < nC) {                                                       // the one cluster that holds over 72 %
          var gx = gauss(r) * ax, gy = gauss(r) * ay, tail = r() < 0.12 ? 1.9 : 1;
          x = xc + (gx * ca - gy * sa) * tail; y = yc + (gx * sa + gy * ca) * tail; inC[i] = 1;
        } else if (q < 0.9) {                                               // along the fault
          u = r(); var sp2 = gauss(r) * h * (0.045 + 0.03 * r());
          x = w * (0.08 + 0.84 * u) - sa * sp2; y = h * (0.63 - 0.4 * u + 0.06 * Math.sin(u * 5.2)) + ca * sp2;
        } else { x = r() * w; y = r() * h * 0.82; }                         // and a few elsewhere
        pts[i * 4] = x; pts[i * 4 + 1] = y; pts[i * 4 + 2] = r(); pts[i * 4 + 3] = r();
      }
      if (nC) {
        // 'lighter' adds the points up: keep the core of the cluster at about 0.55 of full brightness, so it
        // shows grain instead of burning out to white, at any panel size (centre density of a 2-D Gaussian)
        var peak = nC * 0.91 / (2 * Math.PI * (0.5 * ax) * (0.5 * ay));
        kC = Math.min(0.3, 0.55 / (peak * 0.81));
        cl = { x: xc, y: yc, a: 2.2 * 0.5 * ax, b: 2.2 * 0.5 * ay, ang: ang };
      }
      // reveal in random order (each point keeps its cluster flag)
      var r2 = rng(99);
      for (i = count - 1; i > 0; i--) {
        var j = (r2() * (i + 1)) | 0, a = i * 4, b = j * 4, k, tmp;
        for (k = 0; k < 4; k++) { tmp = pts[a + k]; pts[a + k] = pts[b + k]; pts[b + k] = tmp; }
        tmp = inC[i]; inC[i] = inC[j]; inC[j] = tmp;
      }
    }
    function plot(from, to) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalCompositeOperation = 'lighter';
      for (var i = from; i < to; i++) {
        var s = pts[i * 4 + 2], c = COLS[(pts[i * 4 + 3] * COLS.length) | 0], sz, al;
        if (inC[i]) { if (s > 0.985) { sz = 1.5; al = 0.55; } else { sz = 0.9; al = kC * (0.5 + s); } }
        else if (s > 0.93) { sz = 1.7; al = 0.95; }
        else { sz = kind === 'cable' ? 0.95 : 1.25; al = 0.42 + s * 0.5; }
        ctx.fillStyle = 'rgba(' + c + ',' + al.toFixed(3) + ')';
        ctx.fillRect(pts[i * 4] - sz / 2, pts[i * 4 + 1] - sz / 2, sz, sz);
      }
    }
    function leader() {                              // a hairline from the label to the edge of the cluster
      lead = null;
      if (!cl || !note) return;
      var nb = note.getBoundingClientRect(), cb = cv.getBoundingClientRect();
      var lx = nb.left - cb.left - 6, ly = nb.bottom - cb.top + 2, th = Math.atan2(ly - cl.y, lx - cl.x), ph = th - cl.ang;
      var rr = cl.a * cl.b / Math.sqrt(Math.pow(cl.b * Math.cos(ph), 2) + Math.pow(cl.a * Math.sin(ph), 2));
      lead = { x0: lx, y0: ly, x1: cl.x + rr * Math.cos(th), y1: cl.y + rr * Math.sin(th) };
    }
    function size() {
      var b = cv.getBoundingClientRect(); w = Math.max(120, Math.round(b.width)); h = Math.max(120, Math.round(b.height));
      cv.width = sp.width = Math.round(w * DPR); cv.height = sp.height = Math.round(h * DPR);
      sp.style.width = w + 'px'; sp.style.height = h + 'px';
      gen(); if (shown) plot(0, shown);
      if (done || REDUCE) leader();
      if (REDUCE) { sx.setTransform(DPR, 0, 0, DPR, 0, 0); drawLeader(1); }   // no frame loop to draw it later
    }
    function fmt(n) { return n.toLocaleString('en-US'); }
    size();
    window.addEventListener('resize', function () { clearTimeout(size._t); size._t = setTimeout(size, 220); });
    function drawLeader(al) {
      if (!lead) return;
      sx.strokeStyle = 'rgba(241,233,216,' + (0.66 * al).toFixed(3) + ')'; sx.lineWidth = 0.9;
      sx.beginPath(); sx.moveTo(lead.x0, lead.y0); sx.lineTo(lead.x1, lead.y1); sx.stroke();
      sx.fillStyle = 'rgba(241,233,216,' + (0.9 * al).toFixed(3) + ')'; sx.beginPath(); sx.arc(lead.x1, lead.y1, 2, 0, 6.2832); sx.fill();
    }
    if (REDUCE) { plot(0, count); shown = count; if (note) note.classList.add('on'); return; }
    if (num) {                                       // the counter is for the eye; the real number stays in the text
      var keep = document.createElement('span'); keep.className = 'vh'; keep.textContent = num.textContent;
      num.parentNode.insertBefore(keep, num); num.setAttribute('aria-hidden', 'true'); num.textContent = '0';
    }
    inView(cv, function (on, e) { vis = on; if (on && t < 0 && (!e || e.intersectionRatio > 0.3)) t = 0; }, { threshold: [0, 0.35] });
    onFrame(function (now, dt) {
      if (t < 0) return;
      if (!done) {
        t += dt;
        var p = clamp(t / dur, 0, 1), e = 1 - Math.pow(1 - p, 2.4), target = Math.round(e * count);
        if (target > shown) { plot(shown, target); shown = target; if (num) num.textContent = fmt(shown); }
        if (p >= 1) { done = true; if (note) { note.classList.add('on'); leader(); } }
        return;
      }
      if (!vis) return;
      // a few of them flare, like the ones that have just happened
      var want = kind === 'cable' ? 16 : 2, i;
      while (glints.length < want) { i = (Math.random() * count) | 0; glints.push({ x: pts[i * 4], y: pts[i * 4 + 1], t: 0, d: 0.5 + Math.random() * 1.1 }); }
      sx.setTransform(DPR, 0, 0, DPR, 0, 0); sx.clearRect(0, 0, w, h);
      if (lead) { lead.f = Math.min(1, (lead.f || 0) + dt / 1.2); drawLeader(lead.f); }
      for (i = glints.length - 1; i >= 0; i--) {
        var g = glints[i]; g.t += dt; if (g.t > g.d) { glints.splice(i, 1); continue; }
        var a = Math.sin(Math.PI * g.t / g.d);
        sx.fillStyle = 'rgba(255,240,214,' + (0.9 * a).toFixed(2) + ')'; sx.fillRect(g.x - 1, g.y - 1, 2, 2);
        sx.fillStyle = 'rgba(255,214,160,' + (0.28 * a).toFixed(2) + ')'; sx.fillRect(g.x - 4.5, g.y - 0.5, 9, 1); sx.fillRect(g.x - 0.5, g.y - 4.5, 1, 9);
      }
    });
  }
  lights('lightsLand', 893, 'land', 1.5);
  lights('lightsCable', 17325, 'cable', 3.2);

  /* ---------- back at the surface: photographs cross-fade as you scroll ---------- */
  (function () {
    var surf = $('surface'), stage = $('stage'); if (!surf || !stage) return;
    var plates = stage.querySelectorAll('.plate'), copy = stage.querySelector('.surface-copy'), cap = $('plateCap'), imgs = [], caps = [], top = 0, len = 1, lastP = -1, lastPin = -1, curCap = -1, i;
    for (i = 0; i < plates.length; i++) imgs.push(plates[i].querySelector('img'));
    var tall = window.matchMedia ? matchMedia('(max-aspect-ratio: 1/1)') : null;   // the same test as the plates' <source>
    function readCaps() {                             // the caption of each plate, for the photograph shown on this screen
      caps = [];
      for (var k = 0; k < plates.length; k++) {
        var fc = plates[k].querySelector('figcaption'), el = null;
        if (fc) el = (tall && tall.matches && fc.querySelector('.pn')) || fc.querySelector('.pw') || fc;
        caps.push(el ? el.textContent : '');
      }
      curCap = -1;
    }
    readCaps(); window.addEventListener('resize', readCaps);
    function measure() { top = docTop(surf); len = Math.max(1, surf.offsetHeight - vh()); }
    measure(); window.addEventListener('resize', measure); window.addEventListener('load', measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.getElementById('main'));
    onFrame(function (now, dt, sy) {
      var H = vh();
      if (sy + H < top - 50 || sy > top + len + H + 50) return;
      var p = clamp((sy - top) / len, 0, 1), pin = clamp((sy + H - top) / H, 0, 1);
      if (Math.abs(p - lastP) < 0.0004 && Math.abs(pin - lastPin) < 0.0004) return;   // a jump (anchor, End key) updates too
      lastP = p; lastPin = pin;
      var o = [1, sstep(0.3, 0.46, p), sstep(0.63, 0.79, p)];
      for (var k = 0; k < plates.length; k++) {
        if (k) plates[k].style.opacity = o[k].toFixed(3);
        var loc = k === 0 ? p / 0.46 : k === 1 ? (p - 0.3) / 0.49 : (p - 0.63) / 0.37;
        if (imgs[k] && !REDUCE) imgs[k].style.transform = 'scale(' + (1.07 - 0.07 * clamp(loc, 0, 1)).toFixed(4) + ')';
      }
      stage.style.setProperty('--veil', (1 - sstep(0.0, 0.14, p) * 0.85).toFixed(3));
      var co = sstep(0.35, 0.95, pin) * (1 - sstep(0.2, 0.3, p));
      stage.style.setProperty('--shade', co.toFixed(3));
      if (copy) copy.style.opacity = co.toFixed(3);
      var which = o[2] > 0.5 ? 2 : o[1] > 0.5 ? 1 : 0;
      if (cap && which !== curCap) { curCap = which; cap.textContent = caps[which] || ''; cap.setAttribute('data-p', which); }   // data-p: the CSS may place a caption per photo
    });
  })();

  /* ---------- the film strip and its lightbox ---------- */
  var lenis = null;
  (function () {
    var strip = $('strip'), lb = $('lb'); if (!strip) return;
    var links = strip.querySelectorAll('a.ph'), down = false, moved = false, sx0 = 0, sl0 = 0;
    strip.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; moved = false; sx0 = e.clientX; sl0 = strip.scrollLeft; });
    window.addEventListener('pointermove', function (e) {
      if (!down) return; var dx = e.clientX - sx0;
      if (!moved && Math.abs(dx) > 5) { moved = true; strip.classList.add('drag'); }
      if (moved) strip.scrollLeft = sl0 - dx;
    });
    window.addEventListener('pointerup', function () { if (!down) return; down = false; if (moved) setTimeout(function () { strip.classList.remove('drag'); moved = false; }, 0); });
    strip.addEventListener('dragstart', function (e) { e.preventDefault(); });
    strip.addEventListener('focusin', function (e) {   // a photo reached with Tab is brought into view (not one clicked or dragged)
      var a = e.target.closest && e.target.closest('a.ph'), kb = false;
      try { kb = !!a && a.matches(':focus-visible'); } catch (x) { kb = !!a; }
      if (kb) a.scrollIntoView({ inline: 'center', block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
    });
    strip.addEventListener('wheel', function (e) { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.stopPropagation(); }, { passive: true });
    if (!lb) return;
    var img = $('lbImg'), cap = $('lbCap'), bx = $('lbX'), bp = $('lbPrev'), bn = $('lbNext'), stage = $('lbStage'), main = $('main'), bar = $('topbar'), cur = -1, from = null, tx0 = null;
    function show(i) {
      cur = (i + links.length) % links.length;
      var a = links[cur], th = a.querySelector('img');
      img.classList.remove('ok'); img.alt = th ? th.alt : '';
      cap.textContent = (cur + 1) + ' / ' + links.length + '  ·  ' + (a.getAttribute('data-cap') || '');
      var src = a.getAttribute('href');
      img.onload = function () { img.classList.add('ok'); };
      img.src = src; if (img.complete && img.naturalWidth) img.classList.add('ok');
    }
    function open(i, el) {
      from = el || null; show(i);
      lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false'); document.body.classList.add('locked');
      if (main) main.setAttribute('inert', ''); if (bar) bar.setAttribute('inert', ''); if (lenis) lenis.stop();
      setTimeout(function () { bx.focus(); }, 30);
    }
    function close() {
      lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true'); document.body.classList.remove('locked');
      if (main) main.removeAttribute('inert'); if (bar) bar.removeAttribute('inert'); if (lenis) lenis.start();
      if (from && from.focus) from.focus({ preventScroll: true });
      cur = -1;
    }
    Array.prototype.forEach.call(links, function (a, i) {
      a.addEventListener('click', function (e) { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); if (moved) return; open(i, a); });
    });
    bx.addEventListener('click', close); bp.addEventListener('click', function () { show(cur - 1); }); bn.addEventListener('click', function () { show(cur + 1); });
    stage.addEventListener('click', function (e) { if (e.target === stage) close(); });
    document.addEventListener('keydown', function (e) {
      if (cur < 0) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') show(cur - 1);
      else if (e.key === 'ArrowRight') show(cur + 1);
      else if (e.key === 'Tab') {                    // keep the focus inside the dialog
        var f = [bx, bp, bn], k = f.indexOf(document.activeElement);
        e.preventDefault(); f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
    stage.addEventListener('touchstart', function (e) { tx0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (tx0 === null) return; var dx = e.changedTouches[0].clientX - tx0; tx0 = null;
      if (Math.abs(dx) > 48) show(cur + (dx < 0 ? 1 : -1));
    }, { passive: true });
  })();

  /* ---------- anchors ---------- */
  function goTo(hash) {
    var id = hash.slice(1), el = id ? $(id) : null, y = 0;
    if (id && id !== 'top') {
      if (!el) return false;
      var m = el.querySelector('.mark, h2');
      y = Math.max(0, docTop(m || el) - (m ? 108 : 0));
    }
    if (lenis) lenis.scrollTo(y, { duration: 1.5 });
    else window.scrollTo({ top: y, behavior: REDUCE ? 'auto' : 'smooth' });
    if (el) { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); try { el.focus({ preventScroll: true }); } catch (e) {} }
    return true;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null; if (!a) return;
    var h = a.getAttribute('href'); if (h.length < 2) return;
    if (goTo(h)) { e.preventDefault(); if (history.replaceState) history.replaceState(null, '', h); }
  });

  /* ---------- smooth wheel scrolling on desktop (Lenis); native everywhere else ---------- */
  window.YWApp = {
    lenis: function () {
      if (lenis || REDUCE || !window.Lenis) return;
      if (!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches)) return;
      try {
        lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
        if (SC) window.__lenis = lenis;
        else (function raf(t) { if (lenis) { lenis.raf(t); requestAnimationFrame(raf); } })(0);
        // A trackpad already scrolls smoothly with its own inertia: leave it to the browser.
        // (A wheel reports steps of 120; a trackpad reports anything.)
        var seen = 0, odd = 0, watch = function (e) {
          if (e.ctrlKey || !e.deltaY) return;
          seen++; if (e.deltaMode === 0 && (!e.wheelDeltaY || Math.abs(e.wheelDeltaY) % 120 !== 0)) odd++;
          if (odd >= 2 && lenis) { try { lenis.destroy(); } catch (x) {} lenis = null; window.__lenis = null; }
          if (seen >= 5 || !lenis) window.removeEventListener('wheel', watch, true);
        };
        window.addEventListener('wheel', watch, { capture: true, passive: true });
      } catch (e) { lenis = null; }
    }
  };
  if (window.Lenis) window.YWApp.lenis();
})();
