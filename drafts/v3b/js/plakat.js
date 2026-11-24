/* PLAKAT · v3b. Vanilla JS, no dependencies.
   Real data: window.YW_SEIS (M 8.8 Kamchatka at CH.SULZ), window.YW_CABLE, window.YW_GEO.
   Everything here is progressive enhancement: the page reads without it. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* thousands are grouped from 10 000 up, with a no-break space, so a number never splits across lines */
  function grp(n) { n = Math.round(n); return n < 10000 ? String(n) : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function mm(q) { return window.matchMedia ? window.matchMedia(q).matches : false; }

  var RM = mm('(prefers-reduced-motion: reduce)');
  var FINE = mm('(hover: hover) and (pointer: fine)');
  var params = new URLSearchParams(location.search);
  var SHOW_ALL = params.has('reveal');          /* ?reveal: no scroll reveals, for full-page captures */
  var PAPER = '#f2efe8', INK = '#0d0d0d', RED = '#e4002b', RED_TEXT = '#d10027', GREY = '#5f5b53';
  var MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var api = window.__plakat = {};

  /* ---------- e-mail: assembled here, never in the page source ---------- */
  (function () {
    var a = ['yuhan.wang', 'eaps.ethz.ch'].join('@');
    $$('[data-mail]').forEach(function (el) {
      el.href = 'mailto:' + a;
      var t = $('[data-mail-text]', el);
      if (t) t.textContent = a;
    });
  })();

  /* ---------- Zürich time in the top bar ---------- */
  (function () {
    var el = $('#clock'), f;
    if (!el) return;
    try { f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch (e) { return; }
    function tick() { el.textContent = f.format(new Date()); }
    tick(); setInterval(tick, 1000);
  })();

  /* ---------- reading progress: one red rule under the top bar ---------- */
  (function () {
    var bar = $('#prog'), queued = 0;
    if (!bar) return;
    function set() {
      queued = 0;
      var e = d.scrollingElement || root, max = e.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? clamp(e.scrollTop / max, 0, 1) : 0).toFixed(4) + ')';
    }
    window.addEventListener('scroll', function () { if (!queued) queued = requestAnimationFrame(set); }, { passive: true });
    set();
  })();

  /* ---------- reveals (wipes) and the current poster in the top bar ---------- */
  (function () {
    var els = $$('.rv, .statement, .lead-xl');
    if (RM || SHOW_ALL) {
      els.forEach(function (e) { e.classList.add('in'); });
    } else {
      /* measured by hand: an element clipped to nothing never "intersects" for an IntersectionObserver */
      var pending = els.slice(), queued = 0;
      var check = function () {
        queued = 0;
        var vh = window.innerHeight;
        pending = pending.filter(function (e) {
          var r = e.getBoundingClientRect();
          if (r.top < vh * 0.93 && r.bottom > -40) { e.classList.add('in'); return false; }
          return true;
        });
      };
      var ask = function () { if (pending.length && !queued) queued = requestAnimationFrame(check); };
      window.addEventListener('scroll', ask, { passive: true });
      window.addEventListener('resize', ask);
      check();
    }
    if (!('IntersectionObserver' in window)) return;
    var links = $$('.top nav a'), map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io2 = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute('aria-current'); });
        if (map[e.target.id]) map[e.target.id].setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section').forEach(function (s) { io2.observe(s); });
  })();

  /* ---------- type that fills the measure (17 325, Grüezi.) ---------- */
  function fitAll() {
    $$('.fit').forEach(function (box) {
      var inner = $('.fit-in', box);
      if (!inner) return;
      var cs = getComputedStyle(box);
      var avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      /* a box can be fitted to its final text (the count): measured on a hidden copy, so the live one is untouched */
      var want = box.getAttribute('data-fit-text'), probe = inner;
      if (want) {
        probe = inner.cloneNode(false); probe.removeAttribute('id'); probe.textContent = want;
        probe.style.position = 'absolute'; probe.style.visibility = 'hidden';
        box.appendChild(probe);
      }
      box.style.fontSize = '200px';
      var w = probe.getBoundingClientRect().width;
      if (want) box.removeChild(probe);
      if (w > 0 && avail > 0) box.style.fontSize = (200 * avail / w * 0.992).toFixed(2) + 'px';
    });
  }

  /* =====================================================================
     HERO — a helicorder of real ground motion; the playhead moves the name
     ===================================================================== */
  function initHero() {
    var hero = $('#top'), S = window.YW_SEIS;
    if (!hero) return;
    var cvT = $('#heli'), cvI = $('#heliInk'), cvM = $('#marks'), cvP = $('#pen'), nameEl = $('.name', hero), ruler = $('.ruler', hero);
    var letters = $$('.l', nameEl);
    if (!S || !S.bb || !S.meta || !cvT.getContext || !cvI) return;

    var meta = S.meta, fs = meta.fs, tStart = meta.t_start_rel, raw = S.bb, N = raw.length, ph = meta.phases;
    var UM = meta.peak_bb * 1e6 / 32000;          /* stored integer -> µm/s */
    var PEAK = meta.peak_bb * 1e6;                /* µm/s */
    var ORIGIN = Date.parse(meta.origin);
    /* 15 lines of 10 minutes. As on a real helicorder drum, every line starts on a round time of UTC
       (23:15, 23:25 …): line 0 is the quiet before the origin, which falls in its last five minutes.
       Line 0 begins T0 seconds after the origin (−592 s here); the surface waves then cross the name. */
    var ROWS = 15, ROW_S = 600, T0 = -((ORIGIN / 1000) % 300) - 300, T_END = T0 + ROWS * ROW_S;
    var RAY = meta.dist_km / 3.8;                 /* Rayleigh flag: group velocity 3.8 km/s */
    var RAY_END = 3900;                           /* measured on this record: the surface-wave train stays above 160 µm/s until 65 min */
    var LAG = 4, TAIL = 80;
    var LOOP_A = Math.floor(ph.P) - 6, LOOP_B = 3960;
    var FF_A = ph.P + 250, FF_B = RAY - 30;       /* the quiet S coda in between plays four times faster */
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var MARKS = [['Origin', 0], ['P', ph.P], ['PP', ph.PP], ['S', ph.S], ['SS', ph.SS], ['Rayleigh', RAY]];

    function vel(t) {                              /* µm/s at t seconds after origin */
      var x = (t - tStart) * fs;
      if (x <= 0 || x >= N - 1) return 0;
      var i = x | 0, f = x - i;
      return (raw[i] + (raw[i + 1] - raw[i]) * f) * UM;
    }
    function at(t) { return new Date(ORIGIN + t * 1000); }
    function utc(t) { var x = at(t); return pad(x.getUTCHours()) + ':' + pad(x.getUTCMinutes()) + ':' + pad(x.getUTCSeconds()); }
    function hm(t) { var x = at(t); return pad(x.getUTCHours()) + ':' + pad(x.getUTCMinutes()); }
    function day(t) { var x = at(t); return x.getUTCDate() + ' ' + MON[x.getUTCMonth()]; }
    function phase(t) {                            /* short enough for the narrowest Phase cell (124 px) */
      if (t < 0) return 'ambient noise';
      if (t < ph.P) return 'waves en route';
      if (t < ph.PP) return 'P wave';
      if (t < ph.S) return 'PP';
      if (t < ph.SS) return 'S wave';
      if (t < RAY) return 'SS';
      if (t < RAY_END) return 'Rayleigh waves';
      return 'coda';
    }
    function speedAt(t) {                          /* ×60, and ×240 through the quiet S coda, with short smooth ramps */
      var k = clamp((t - FF_A) / 40, 0, 1) * clamp((FF_B - t) / 40, 0, 1);
      return 60 + 180 * k * k * (3 - 2 * k);
    }

    /* peak displacement: integrate the velocity record, remove the linear trend; and the time of the peak velocity */
    var dispPeak = 0, tPeak = 0;
    (function () {
      var s = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, dsp = new Float64Array(N), i, vm = 0;
      for (i = 0; i < N; i++) {
        s += raw[i] * UM / fs; dsp[i] = s; sx += i; sy += s; sxx += i * i; sxy += i * s;
        if (Math.abs(raw[i]) > vm) { vm = Math.abs(raw[i]); tPeak = tStart + i / fs; }
      }
      var b = (N * sxy - sx * sy) / (N * sxx - sx * sx), a = (sy - b * sx) / N;
      for (i = 0; i < N; i++) { var v = Math.abs(dsp[i] - a - b * i); if (v > dispPeak) dispPeak = v; }   /* µm */
    })();
    var capPeak = $('#capPeak'), capDist = $('#capDist');
    if (capPeak) capPeak.textContent = 'Peak velocity ' + (PEAK / 1000).toFixed(2) + ' mm/s. Integrating the record gives a peak displacement of about ' + (dispPeak / 1000).toFixed(1) + ' mm. ';
    if (capDist) capDist.textContent = meta.dist_km + ' km';

    var L = { W: 0, H: 0 }, G = 0;
    var t = RM ? Math.round(tPeak) : LOOP_A, mode = 'play', paused = false, held = !RM;
    var env = 1, envTo = 1, rw = 0, rwFrom = 0, raf = 0, last = 0, visible = true;
    var cache = d.createElement('canvas'), cacheRows = -1, inkT = null, speedShown = 0;
    var ro = { utc: $('#roUtc'), t: $('#roT'), v: $('#roV'), p: $('#roP'), speed: $('#speedNote'), scale: $('#letterNote') }, roLast = {};

    /* geometry of the record */
    function rowOf(tt) { return clamp(Math.floor((tt - T0) / ROW_S), 0, ROWS - 1); }
    function xAt(tt, r) { return L.x0 + (tt - T0 - r * ROW_S) * L.dx; }
    function yAt(tt, r) { return L.yTop + r * L.gap - clamp(vel(tt) * L.amp, -L.clip, L.clip); }
    /* where a line ends: at the right edge, or, for the lines that run beneath the info panel, short of its left edge */
    function rowEnd(r) { return T0 + r * ROW_S + (r >= L.cutRow ? L.cutS : ROW_S); }
    function span(c, a, b) {                       /* the record from a to b, line by line, one point per second */
      for (var r = rowOf(a), r1 = rowOf(b); r <= r1; r++) {
        var ra = Math.max(a, T0 + r * ROW_S), rb = Math.min(b, rowEnd(r));
        if (rb <= ra) continue;
        c.moveTo(xAt(ra, r), yAt(ra, r));
        for (var s = Math.floor(ra) + 1; s < rb; s++) c.lineTo(xAt(s, r), yAt(s, r));
        c.lineTo(xAt(rb, r), yAt(rb, r));
      }
    }
    function pen(c, color, w) { c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = color; c.lineWidth = w; }

    function layout() {
      var W = hero.clientWidth, H = hero.clientHeight;
      if (!W || !H) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2), m = ruler.offsetWidth || 16, small = W < 900;
      [cvT, cvI, cvM, cvP, cache].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
      L.W = W; L.H = H; L.dpr = dpr; L.m = m; L.small = small;
      L.x0 = m + (small ? 36 : 62); L.x1 = W - m;
      L.yTop = small ? 46 : 62;
      L.ya = small ? 20 : 24;                       /* the minute axis */
      L.lw = small ? 0.85 : 1.15;
      if (small) {
        /* small screens: a compact record on top; the name overlaps only its last quiet lines */
        L.gap = W < 520 ? 24 : 30;
        L.yBot = L.yTop + L.gap * (ROWS - 1);
        var hh = Math.round(L.yBot + 16) + 'px';
        if (hero.style.getPropertyValue('--heli-h') !== hh) hero.style.setProperty('--heli-h', hh);
      } else {
        L.yBot = H - 26;
        L.gap = (L.yBot - L.yTop) / (ROWS - 1);
      }
      /* the strongest swing spans 2.2 line gaps; less on short windows, where the lines would bury the name,
         and 1.6 on phones, where 2.2 gaps of 24 px turned the surface waves into a grey tangle.
         Like a real helicorder pen, the trace stops at 1.8 gaps. */
      L.amp = L.gap * (small ? 1.6 : clamp(1.35 + (L.gap - 42) * 0.07, 1.35, 2.2)) / PEAK;
      L.clip = L.gap * 1.8;
      L.dx = (L.x1 - L.x0) / ROW_S;
      /* the info panel lies on the lower right of the record: the lines beneath it end 16 px short of its left edge,
         and the swings of the lines above stop on its top rule */
      L.cutRow = ROWS; L.cutS = ROW_S;
      var side = small ? null : $('.hero-side', hero);
      if (side) {
        var hb = hero.getBoundingClientRect(), sb = side.getBoundingClientRect(), pt = sb.top - hb.top;
        for (var r = 0; r < ROWS; r++) if (L.yTop + r * L.gap > pt - L.gap * 0.35) { L.cutRow = r; break; }
        L.cutS = clamp((sb.left - hb.left - 16 - L.x0) / L.dx, 0, ROW_S);
      }
      var fpx = parseFloat(getComputedStyle(nameEl).fontSize) || 200;
      G = RM ? 0 : fpx * 0.15 / PEAK;               /* px per µm/s on the letters */
      if (ro.scale) ro.scale.textContent = RM ? '' : 'Letters: 10 px = ' + Math.round(10 / G) + ' µm/s, each ' + LAG + ' s after its neighbour. ';
      cacheRows = -1; inkT = null; speedShown = 0;
      drawTraces(); drawMarks(); draw();
    }

    function ctxOf(cv) { var c = cv.getContext('2d'); c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); return c; }

    /* the ink of the name at rest, left of x1: the first letter of each word, drawn offscreen where the page sets it.
       Returns a test: is there ink in this box? */
    function nameInk(x1) {
      var cv = d.createElement('canvas'), c = cv.getContext('2d'), cs = getComputedStyle(nameEl);
      var fpx = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || fpx * 0.79;
      var hb = hero.getBoundingClientRect(), nb = nameEl.getBoundingClientRect();
      cv.width = Math.ceil(x1); cv.height = Math.ceil(L.H);
      c.font = cs.fontWeight + ' ' + fpx + 'px ' + cs.fontFamily;
      $$('.w', nameEl).forEach(function (w, i) {   /* the baseline sits where CSS puts it: half-leading, then the ascent */
        var ch = w.textContent.charAt(0), fm = c.measureText(ch);
        var asc = fm.fontBoundingBoxAscent || fpx * 0.97, dsc = fm.fontBoundingBoxDescent || fpx * 0.24;
        c.fillText(ch, nb.left - hb.left, nb.top - hb.top + i * lh + (lh - asc - dsc) / 2 + asc);
      });
      var px = c.getImageData(0, 0, cv.width, cv.height).data, cw = cv.width;
      return function (xa, xb, ya, yb) {
        xa = Math.max(0, Math.floor(xa)); xb = Math.min(cw - 1, Math.ceil(xb));
        ya = Math.max(0, Math.floor(ya)); yb = Math.min(cv.height - 1, Math.ceil(yb));
        for (var y = ya; y <= yb; y++) for (var x = xa; x <= xb; x++) if (px[(y * cw + x) * 4 + 3] > 40) return true;
        return false;
      };
    }

    /* layer 1, under the name: the axis, and the whole record, faint, as what is still to come.
       The name is blended with "difference": ink under a letter turns to paper, so it stays readable. */
    function drawTraces() {
      var c = ctxOf(cvT), i, x, fz = L.small ? 9.5 : 10.5, ya = L.ya;
      c.clearRect(0, 0, L.W, L.H);
      pen(c, L.small ? 'rgba(13,13,13,.17)' : 'rgba(13,13,13,.22)', L.lw);
      c.beginPath(); span(c, T0, T_END); c.stroke();
      /* minute axis */
      c.textBaseline = 'middle'; c.lineCap = 'butt'; c.fillStyle = INK; c.strokeStyle = INK; c.lineWidth = 1; c.font = '500 ' + fz + 'px ' + MONO;
      c.beginPath(); c.moveTo(L.x0, ya + .5); c.lineTo(L.x1, ya + .5);
      for (i = 0; i <= 10; i++) { x = Math.round(L.x0 + i * 60 * L.dx) + (i === 10 ? -.5 : .5); c.moveTo(x, ya); c.lineTo(x, ya + (i % 5 === 0 ? 7 : 4)); }
      c.stroke();
      /* the header names the record, the event in ink and the details in grey, as much of it as fits: before the
         origin flag at the right end of the first line, or on small screens after the minute labels of the axis
         (on narrow phones it takes the place of the '5') */
      var date0 = day(0) + ' ' + at(0).getUTCFullYear(), ev = 'M 8.8 Kamchatka earthquake, ' + date0, ev2 = 'M 8.8 Kamchatka, ' + date0;
      var heads = L.small ? [[ev2, ' · CH.SULZ'], ['M 8.8 Kamchatka', ' · CH.SULZ']] : [
        [ev, ' · recorded ' + meta.dist_km + ' km away at CH.SULZ, Sulz AG · HHZ, vertical ground velocity · one line = 10 minutes · data: SED'],
        [ev, ' · CH.SULZ, Sulz AG · vertical ground velocity · one line = 10 minutes · data: SED'],
        [ev, ' · CH.SULZ · one line = 10 minutes · data: SED'],
        [ev2, ' · CH.SULZ · data: SED']];
      var headW = function (h) { return c.measureText(h[0] + h[1]).width; };
      var room = L.small ? L.x1 - (L.x0 + 300 * L.dx - 3 + c.measureText('5').width + 10)
                         : L.x1 - L.x0 - c.measureText('Origin').width - c.measureText(utc(0)).width - 36;
      var head = heads.filter(function (h) { return headW(h) <= room; })[0], five = !!head || !L.small;
      head = head || heads[heads.length - 1];
      c.textAlign = 'left';
      for (i = 0; i < 10; i += (L.small ? 5 : 1)) {
        if (i === 5 && !five) continue;
        c.fillText(i + (i === 0 ? ' min' : ''), L.x0 + i * 60 * L.dx + (i ? -3 : 0), ya - 10);
      }
      c.fillText('UTC', L.m, ya - 10);
      var hx = L.small ? L.x1 - headW(head) : L.x0, hy = L.small ? ya - 10 : L.yTop - 16;
      c.fillText(head[0], hx, hy);
      c.fillStyle = GREY; c.fillText(head[1], hx + c.measureText(head[0]).width, hy);
      /* the start time of every line, and the date where it changes. The labels lie under the name, which is blended
         with "difference": inside a letter they would print in paper, like a misregistered plate. So a label is set
         only where it keeps clear of the letters at rest and however far they move (G × PEAK, at the record's peak).
         No label stands alone between two lines without one; the date goes to the first label of the new day.
         On small screens the lines the name covers go unlabelled. */
      var hit = L.small ? null : nameInk(L.x0), mg = G * PEAK, y;
      var nameTop = L.small ? nameEl.getBoundingClientRect().top - hero.getBoundingClientRect().top - 8 : 1e9;
      var lw = c.measureText('00:00').width, dw = c.measureText('30 JUL').width, set = [], due = false;
      for (i = 0; i < ROWS; i++) {
        y = L.yTop + i * L.gap;
        set.push(L.small ? y <= nameTop : !hit(L.m - 3, L.m + lw + 4, y - 5 - mg, y + 5 + mg));
      }
      set = set.map(function (s, j) { return s && (j === 0 || j === ROWS - 1 || set[j - 1] || set[j + 1]); });
      for (i = 0; i < ROWS; i++) {
        var tl = T0 + i * ROW_S;
        y = L.yTop + i * L.gap;
        if (!L.small && (i === 0 || day(tl) !== day(tl - ROW_S))) due = true;
        if (!set[i]) continue;
        c.fillStyle = INK; c.fillText(hm(tl), L.m, y + .5);
        if (due && !hit(L.m - 3, L.m + dw + 4, y + 8.5 - mg, y + 18.5 + mg)) { c.fillStyle = GREY; c.fillText(day(tl).toUpperCase(), L.m, y + 13.5); due = false; }
      }
      c.fillStyle = INK;
      /* amplitude scale, in the quiet start of the first line */
      if (!L.small) {
        var sv = 100, sh = sv * L.amp, sx = L.x0 + 4, sy = L.yTop + L.gap * 0.5;
        c.beginPath();
        c.moveTo(sx + .5, sy - sh / 2); c.lineTo(sx + .5, sy + sh / 2);
        c.moveTo(sx, sy - sh / 2 + .5); c.lineTo(sx + 5, sy - sh / 2 + .5);
        c.moveTo(sx, sy + sh / 2 - .5); c.lineTo(sx + 5, sy + sh / 2 - .5); c.stroke();
        c.textAlign = 'left'; c.fillText(sv + ' µm/s', sx + 10, sy + .5);
      }
    }

    /* layer 2, over the name: the arrivals, as a red tick, a red flag with the name and the UTC time on paper */
    function drawMarks() {
      var c = ctxOf(cvM), fz = L.small ? 9.5 : 10.5, fh = L.small ? 13 : 15;
      c.clearRect(0, 0, L.W, L.H);
      c.textBaseline = 'middle'; c.textAlign = 'left'; c.font = '500 ' + fz + 'px ' + MONO;
      var flags = MARKS.map(function (mk) {
        var tt = mk[1], rr = rowOf(tt), mx = Math.round(xAt(tt, rr)), my = L.yTop + rr * L.gap;
        var up = rr === 0 ? Math.min(L.gap * 0.3, L.yTop - L.ya - 9 - fh) : L.gap * 0.46;
        var nm = mk[0], wN = c.measureText(nm).width + 10, tm = L.small ? '' : utc(Math.round(tt)), wT = tm ? c.measureText(tm).width + 10 : 0;
        return { mx: mx, top: my - up, bot: my + (rr === 0 ? L.gap * 0.3 : L.gap * 0.46), nm: nm, tm: tm, wN: wN, wT: wT,
                 fx: Math.min(mx - 1, L.x1 - wN - wT), fy: my - up - fh };
      });
      /* on short desktop windows the info panel covers the lower right of the record: a flag that would hide
         under it stands on the panel's top edge instead, above its arrival */
      var side = L.small ? null : $('.hero-side', hero);
      if (side) {
        var hb = hero.getBoundingClientRect(), sb = side.getBoundingClientRect(), pl = sb.left - hb.left - 14, pt = sb.top - hb.top - 14;
        flags.forEach(function (f) {
          if (f.fx + f.wN + f.wT > pl && f.fy + fh > pt) { f.fy = Math.min(f.fy, pt - fh - 4); f.top = f.fy + fh; }
        });
      }
      flags.forEach(function (f) {                 /* a tick stops short of a flag hanging below it (P above S) */
        flags.forEach(function (g) {
          if (g !== f && g.fy > f.top && g.fy < f.bot + 3 && f.mx >= g.fx - 3 && f.mx <= g.fx + g.wN + g.wT + 3) f.bot = g.fy - 4;
        });
      });
      flags.forEach(function (f) {
        c.fillStyle = RED_TEXT;
        c.fillRect(f.mx - 1, f.top, 2, f.bot - f.top);
        c.fillRect(f.fx, f.fy, f.wN, fh);
        c.fillStyle = PAPER; c.fillText(f.nm, f.fx + 5, f.fy + fh / 2 + .5);
        if (f.tm) { c.fillStyle = PAPER; c.fillRect(f.fx + f.wN, f.fy, f.wT, fh); c.fillStyle = INK; c.fillText(f.tm, f.fx + f.wN + 5, f.fy + fh / 2 + .5); }
      });
    }

    /* layer 1b, still under the name: the part of the record already played, in full ink.
       Finished lines come from an offscreen cache; only the current line is stroked again each frame. */
    function inkTo(tt) {
      if (tt === inkT) return;
      inkT = tt;
      var r = rowOf(tt), cc = cache.getContext('2d'), c = cvI.getContext('2d');
      if (cacheRows < 0 || r < cacheRows) { cc.setTransform(1, 0, 0, 1, 0, 0); cc.clearRect(0, 0, cache.width, cache.height); cacheRows = 0; }
      if (r > cacheRows) {
        cc.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); pen(cc, INK, L.lw);
        cc.beginPath(); span(cc, T0 + cacheRows * ROW_S, T0 + r * ROW_S); cc.stroke();
        cacheRows = r;
      }
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cvI.width, cvI.height);
      c.drawImage(cache, 0, 0);
      c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); pen(c, INK, L.lw);
      c.beginPath(); span(c, T0 + r * ROW_S, tt); c.stroke();
    }

    function setText(key, s) { if (roLast[key] !== s && ro[key]) { roLast[key] = s; ro[key].textContent = s; } }

    function draw() {
      if (!L.W) return;
      inkTo(t);
      var c = ctxOf(cvP), r = rowOf(t), i, playing = mode === 'play' && !paused && !held;
      c.clearRect(0, 0, L.W, L.H);
      /* the last TAIL seconds in red */
      pen(c, RED, L.small ? 1.7 : 2.3);
      c.beginPath(); span(c, Math.max(T0, t - TAIL), t); c.stroke();
      /* the pen (not where its line has ended short of the panel: there it passes beneath the panel) */
      var px = xAt(t, r), yb = L.yTop + r * L.gap, v = vel(t), py = yAt(t, r);
      if (t <= rowEnd(r)) {
        c.lineWidth = 1; c.beginPath(); c.moveTo(px, yb - L.gap * .5); c.lineTo(px, yb + L.gap * .5); c.stroke();
        c.fillStyle = RED; c.beginPath(); c.arc(px, py, L.small ? 3.6 : 5.2, 0, 6.2832); c.fill();
      }
      /* the letters: real vertical ground velocity, each LAG seconds after its neighbour; muted while fast-forwarding */
      var sp = playing ? speedAt(t) : 60;
      if (G) {
        var k = G * env * 60 / sp;
        for (i = 0; i < letters.length; i++) letters[i].style.transform = 'translate3d(0,' + (-vel(t - i * LAG) * k).toFixed(2) + 'px,0)';
      }
      /* the readout */
      var sec = Math.floor(t), neg = sec < 0, as = Math.abs(sec);
      setText('utc', day(t) + ' ' + utc(t));
      setText('t', (neg ? '−' : '') + Math.floor(as / 60) + ' min ' + pad(as % 60) + ' s');
      setText('v', (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + ' µm/s');
      setText('p', phase(t));
      var shown = RM ? -1 : sp > 150 ? 240 : 60;
      if (shown !== speedShown && ro.speed) {
        speedShown = shown;
        ro.speed.textContent = RM ? 'Animation off (reduced motion)' : 'Playback ×' + shown + (shown > 60 ? ' · fast-forward' : '');
      }
    }

    function rewind() { mode = 'rewind'; rw = 0; rwFrom = t; envTo = 0; }
    function resume() {                            /* after a scrub: carry on from here, or go to just before P if outside the loop */
      held = false;
      if ((t >= LOOP_B || t < LOOP_A) && !paused) rewind(); else mode = 'play';
    }
    function frame(now) {
      raf = 0;
      if (!visible || d.hidden) return;
      var dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (mode === 'play' && !paused && !held) {
        t += dt * speedAt(t);
        if (t >= LOOP_B) rewind();
      } else if (mode === 'scrub' && !touching && now - lastScrub > 1100) {
        resume();                                  /* the pointer rests */
      } else if (mode === 'rewind') {
        rw += dt / 0.9;
        var e = rw >= 1 ? 1 : 1 - Math.pow(1 - rw, 3);
        t = rwFrom + (LOOP_A - rwFrom) * e;
        if (rw >= 1) { t = LOOP_A; mode = 'play'; envTo = 1; }
      }
      env += (envTo - env) * Math.min(1, dt * 10);
      draw();
      if (paused && mode === 'play' && Math.abs(env - envTo) < 0.01) return;   /* nothing changes: stop drawing */
      raf = requestAnimationFrame(frame);
    }
    function kick() {
      if (RM) { draw(); return; }
      if (!raf && visible && !d.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }

    /* scrubbing: hover with a mouse, drag with a finger. A finger scrubs only once it has moved 8 px sideways:
       a swipe up or down that starts on the record is left to the browser, which scrolls the page */
    var touching = false, lastScrub = 0, down = null;
    function timeAt(ev) {
      var b = hero.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top;
      var row = clamp(Math.round((y - L.yTop) / L.gap), 0, ROWS - 1);
      return clamp(T0 + row * ROW_S + clamp((x - L.x0) / (L.x1 - L.x0), 0, 1) * ROW_S, T0, T_END - 1);
    }
    function onRecord(ev) {                        /* small screens: only the record itself scrubs, not the name below it */
      return !L.small || ev.clientY - hero.getBoundingClientRect().top < L.yBot + L.gap;
    }
    function scrub(ev) { mode = 'scrub'; envTo = 1; env = 1; t = timeAt(ev); lastScrub = performance.now(); kick(); if (paused) draw(); }
    function endScrub() {
      touching = false;
      if (mode !== 'scrub') return;
      resume(); kick();
    }
    hero.addEventListener('pointermove', function (ev) {
      if (ev.target.closest && ev.target.closest('.hero-side')) { endScrub(); return; }
      if (ev.pointerType === 'touch' && !touching) {
        if (!down) return;
        var dx = Math.abs(ev.clientX - down[0]), dy = Math.abs(ev.clientY - down[1]);
        if (dx < 8 && dy < 8) return;
        down = null;
        if (dx <= dy) return;
        touching = true;
      }
      if (!onRecord(ev)) { if (!touching) endScrub(); return; }
      scrub(ev);
    });
    hero.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest && ev.target.closest('.hero-side')) return;
      if (ev.pointerType === 'touch' && onRecord(ev)) down = [ev.clientX, ev.clientY];
    });
    ['pointerleave', 'pointerup', 'pointercancel'].forEach(function (n) { hero.addEventListener(n, function (ev) { down = null; if (n !== 'pointerup' || ev.pointerType === 'touch') endScrub(); }); });

    var bP = $('#btnP'), bPlay = $('#btnPlay');
    function setPaused(p) {
      paused = p;
      if (bPlay) bPlay.textContent = p ? 'Play' : 'Pause';
      kick();
    }
    if (bP) bP.addEventListener('click', function () { t = ph.P - 4; mode = 'play'; held = false; env = envTo = 1; setPaused(false); });
    if (bPlay) bPlay.addEventListener('click', function () { setPaused(!paused); });
    if (RM) { if (bP) bP.hidden = true; if (bPlay) bPlay.hidden = true; }

    /* the clock starts once the name has risen, so the first jolt of the P wave is not lost in the intro */
    if (held) {
      var release = function () { held = false; kick(); };
      var w2 = $$('.w', nameEl).pop(), an = w2 && w2.getAnimations ? w2.getAnimations() : [];
      if (an.length && an[0].finished) an[0].finished.then(release, release); else release();
      setTimeout(release, 2400);
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }, { threshold: 0.02 }).observe(hero);
    }
    d.addEventListener('visibilitychange', kick);
    var rz = 0;
    function relayout() { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); }
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(hero); else window.addEventListener('resize', relayout);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(relayout);
    layout(); kick();

    api.seek = function (tt, hold) { t = clamp(tt, T0, T_END - 1); mode = 'play'; held = false; env = envTo = 1; if (hold) { setPaused(true); } draw(); kick(); return t; };
    api.phases = ph;
  }

  /* =====================================================================
     02 — the count: 893 → 17 325, and one dot for every earthquake
     ===================================================================== */
  function initCount() {
    var el = $('#bigN');
    if (!el) return;
    var box = el.parentNode, FROM = 893, TO = 17325, FINAL = grp(TO);
    box.setAttribute('data-fit-text', FINAL);
    if (RM || SHOW_ALL || !('IntersectionObserver' in window)) return;
    /* An odometer. The digits are proportional (that keeps the '1' on the margin), and Inter's proportional
       figures differ by up to .28 em, so a plain count would jitter, and tabular figures would shift when they
       give way. Instead every character of the final number gets a slot exactly as wide as its own glyph; the
       count runs right-aligned through those slots and lands on the final setting without moving anything. */
    var slots = [];
    el.textContent = '';
    FINAL.split('').forEach(function (ch) {
      var s = d.createElement('span');
      if (ch >= '0' && ch <= '9') {
        var w = d.createElement('span'), g = d.createElement('span');
        s.className = 'slot'; w.className = 'slot-w'; g.className = 'slot-d'; w.textContent = ch;
        s.appendChild(w); s.appendChild(g); slots.push(g);
      } else s.textContent = ch;
      el.appendChild(s);
    });
    function show(n) {
      var str = String(Math.round(n)), k = str.length - slots.length;
      for (var i = 0; i < slots.length; i++) { var c = str.charAt(i + k); if (slots[i].textContent !== c) slots[i].textContent = c; }
    }
    show(FROM);
    box.style.color = INK;
    box.style.transition = 'color .5s';
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      var t0 = performance.now(), D = 1900;
      (function step(now) {
        var p = clamp((now - t0) / D, 0, 1), e = p < .5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2;
        show(FROM + (TO - FROM) * e);
        if (p > .28) box.style.color = '';
        if (p < 1) { requestAnimationFrame(step); return; }
        el.textContent = FINAL;                    /* the plain text sets identically: Inter has no kerning between figures */
      })(t0);
    }, { threshold: 0.55 });
    io.observe(box);
  }

  function initDots() {
    var A = $('#dotsA'), B = $('#dotsB');
    if (!A || !B || !A.getContext) return;
    var NA = 893, NB = 17325, gA, gB, prog = (RM || SHOW_ALL) ? 1 : 0, started = false, shownA = 0, shownB = 0;
    function size(cv, cols, rows) {
      var w = cv.parentNode.clientWidth || 300, dpr = Math.min(window.devicePixelRatio || 1, 2), p = w / cols;
      cv.width = Math.round(w * dpr); cv.height = Math.round(rows * p * dpr);
      return { cv: cv, p: p, dpr: dpr, cols: cols };
    }
    function put(g, n0, n1, color) {
      if (n1 <= n0) return;
      var c = g.cv.getContext('2d'), r = g.p * 0.31, k;
      c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); c.fillStyle = color; c.beginPath();
      for (k = n0; k < n1; k++) {
        var x = (k % g.cols + .5) * g.p, y = (Math.floor(k / g.cols) + .5) * g.p;
        c.moveTo(x + r, y); c.arc(x, y, r, 0, 6.2832);
      }
      c.fill();
    }
    function resize() {
      var narrow = mm('(max-width: 640px)');
      gA = size(A, 47, 19);
      gB = narrow ? size(B, 105, 165) : size(B, 231, 75);
      shownA = shownB = 0; paint();
    }
    function paint() {
      var a = Math.round(NA * clamp(prog * 4, 0, 1)), e = 1 - Math.pow(1 - prog, 2.2), b = Math.round(NB * e);
      put(gA, shownA, a, INK); shownA = Math.max(shownA, a);
      put(gB, shownB, b, RED); shownB = Math.max(shownB, b);
    }
    resize();
    var rz = 0, lastW = window.innerWidth;
    window.addEventListener('resize', function () { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(rz); rz = setTimeout(resize, 120); });
    if (prog === 1 || !('IntersectionObserver' in window)) { prog = 1; paint(); return; }
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting || started) return;
      started = true; io.disconnect();
      var t0 = performance.now(), D = 2200;
      (function step(now) { prog = clamp((now - t0) / D, 0, 1); paint(); if (prog < 1) requestAnimationFrame(step); })(t0);
    }, { threshold: 0.05 });
    io.observe(A.parentNode.parentNode);
  }

  /* =====================================================================
     03 — research index: a figure follows the cursor; titles expand
     ===================================================================== */
  function arcSVG() {
    var s = '<svg viewBox="0 0 440 280" xmlns="http://www.w3.org/2000/svg"><rect width="440" height="280" fill="' + PAPER + '"/>', i;
    for (i = -8; i < 18; i++) s += '<line x1="' + (i * 30) + '" y1="280" x2="' + (i * 30 + 162) + '" y2="0" stroke="' + INK + '" stroke-width="' + (i % 3 === 0 ? 1.8 : .6) + '"/>';
    var path = 'M24 232 H150 A118 118 0 0 0 268 114 V22';
    s += '<path d="' + path + '" fill="none" stroke="' + PAPER + '" stroke-width="14"/><path d="' + path + '" fill="none" stroke="' + RED + '" stroke-width="4.5"/>';
    for (i = 0; i <= 5; i++) s += '<circle cx="' + (24 + i * 25.2) + '" cy="232" r="4" fill="' + PAPER + '" stroke="' + RED + '" stroke-width="2"/>';
    for (i = 1; i <= 7; i++) { var a = i / 8 * Math.PI / 2; s += '<circle cx="' + (150 + 118 * Math.sin(a)).toFixed(1) + '" cy="' + (114 + 118 * Math.cos(a)).toFixed(1) + '" r="4" fill="' + PAPER + '" stroke="' + RED + '" stroke-width="2"/>'; }
    for (i = 0; i <= 3; i++) s += '<circle cx="268" cy="' + (114 - i * 25.2 - 12) + '" r="4" fill="' + PAPER + '" stroke="' + RED + '" stroke-width="2"/>';
    return s + '</svg>';
  }
  function initIndex() {
    var peek = $('#peek'), rows = $$('.row');
    if (!rows.length) return;
    var box = peek && $('.peek-in', peek), cap = peek && $('figcaption', peek);
    var cur = null, tx = 0, ty = 0, px = 0, py = 0, raf = 0;
    function place() {
      raf = 0;
      px += (tx - px) * 0.22; py += (ty - py) * 0.22;
      peek.style.transform = 'translate3d(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px,0)';
      if (cur && (Math.abs(tx - px) > .3 || Math.abs(ty - py) > .3)) raf = requestAnimationFrame(place);
    }
    /* The figure sits to the right of the title it illustrates, so it never covers the title or the top bar, and
       below this row's venue and DOI, following the cursor down; above the row when there is no room below.
       It belongs to the title: once the pointer moves on to the venue or the DOI, it gets out of the way. */
    var rg = d.createRange();
    function textBottom(e) { rg.selectNodeContents(e); return rg.getBoundingClientRect().bottom; }   /* the cells stretch; their text does not */
    function aim(ev, jump) {
      var w = peek.offsetWidth, h = peek.offsetHeight, vh = window.innerHeight;
      var tr = $('.row-t', cur).getBoundingClientRect(), rb = cur.getBoundingClientRect();
      var mb = Math.max(textBottom($('.row-v', cur)), textBottom($('.row-d', cur)));
      var x = tr.right + 24, y = Math.max(ev.clientY + 24, mb + 14), lo = vh - h - 12;
      if (x + w > window.innerWidth - 12) x = Math.max(12, ev.clientX - w - 26);
      if (y > lo) y = rb.top - h - 12 >= 60 ? rb.top - h - 12 : Math.max(60, lo);
      tx = x; ty = y;
      if (jump) { px = tx; py = ty; }
      if (!raf) raf = requestAnimationFrame(place);
      return ev.clientX < tr.right + 12;
    }
    function hide() { cur = null; if (peek) peek.classList.remove('on'); }
    function setCap(s) {                           /* a hyphenated name (das-channel-mapping-skill) stays on one line */
      cap.textContent = '';
      s.split(/(\S+-\S+)/).forEach(function (part, i) {
        if (!part) return;
        var e = i % 2 ? d.createElement('span') : d.createTextNode(part);
        if (i % 2) { e.className = 'nb'; e.textContent = part; }
        cap.appendChild(e);
      });
    }
    rows.forEach(function (row) {
      var btn = $('.row-t button', row), x = $('.row-x', row);
      if (btn && x) {
        btn.addEventListener('click', function () {
          var open = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!open));
          x.hidden = open;
          if (!open) { $$('img[data-src]', x).forEach(function (im) { im.src = im.getAttribute('data-src'); im.removeAttribute('data-src'); }); hide(); }
        });
        /* the whole row is the target, not only the title (links, the button itself and the open summary excepted) */
        row.addEventListener('click', function (e) {
          if (e.target.closest('a, button, .row-x') || String(window.getSelection ? window.getSelection() : '')) return;
          btn.click();
        });
      }
      var fig = row.getAttribute('data-fig');
      if (!FINE || !peek || !fig) return;
      row.addEventListener('pointerenter', function (ev) {
        if (btn && btn.getAttribute('aria-expanded') === 'true') return;
        cur = row;
        if (fig === 'arc') box.innerHTML = arcSVG();
        else { box.innerHTML = ''; var im = new Image(); im.alt = ''; im.src = '../v3-shared/figs/' + fig + '.webp'; im.onload = function () { if (cur === row) aim(ev, false); }; box.appendChild(im); }
        setCap(row.getAttribute('data-cap') || '');
        peek.classList.toggle('on', aim(ev, true));
      });
      row.addEventListener('pointermove', function (ev) {
        if (cur !== row) return;
        peek.classList.toggle('on', aim(ev, false));
      });
      row.addEventListener('pointerleave', hide);
    });
    window.addEventListener('scroll', hide, { passive: true });
    /* warm the cache when the index comes near */
    if (FINE && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        rows.forEach(function (r) { var f = r.getAttribute('data-fig'); if (f && f !== 'arc') { new Image().src = '../v3-shared/figs/' + f + '.webp'; } });
      }, { rootMargin: '400px' });
      io.observe($('#research'));
    }
  }

  /* =====================================================================
     04 — the cable: a line drawing from YW_CABLE.route
     ===================================================================== */
  function el(name, attrs, parent) {
    var e = d.createElementNS(SVGNS, name), k;
    for (k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function initCable() {
    var C = window.YW_CABLE, host = $('#cableMap');
    if (!C || !host || !C.route) return;
    var R = C.route, n = R.length, k = Math.cos(38.445 * Math.PI / 180), total = C.channels;
    var tip = $('#cableTip'), fig = host.parentNode, drawn = RM || SHOW_ALL, lastW = 0, segEls = [];
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    R.concat([[0, C.telecom_node[0], C.telecom_node[1]]]).forEach(function (p) {
      minx = Math.min(minx, p[1] * k); maxx = Math.max(maxx, p[1] * k); miny = Math.min(miny, p[2]); maxy = Math.max(maxy, p[2]);
    });
    function f(v) { return v.toFixed(1); }
    function idxOf(ch) { for (var j = 0; j < n; j++) if (R[j][0] === ch) return j; return -1; }
    function segName(c) { for (var j = 0; j < C.segments.length; j++) if (c >= C.segments[j].from && c <= C.segments[j].to) return C.segments[j].name; return ''; }

    function build() {
      var W = Math.round(host.clientWidth), i;
      if (!W || W === lastW) return;
      lastW = W; host.innerHTML = ''; segEls = [];
      var small = W < 720, H = Math.round(small ? W * 0.9 : Math.min(W * 0.5, 720));
      var padL = small ? 24 : W * 0.2, padR = small ? 46 : W * 0.2, padT = small ? 40 : 56, padB = small ? 112 : 50;
      var sc = Math.min((W - padL - padR) / (maxx - minx), (H - padT - padB) / (maxy - miny));
      var ox = padL + ((W - padL - padR) - (maxx - minx) * sc) / 2, oy = padT + ((H - padT - padB) - (maxy - miny) * sc) / 2;
      function P(lon, lat) { return [ox + (lon * k - minx) * sc, oy + (maxy - lat) * sc]; }
      var pts = R.map(function (p) { return P(p[1], p[2]); }), KM = sc / 111.195;

      /* Catmull-Rom → cubic Bézier */
      var c1 = [], c2 = [];
      for (i = 0; i < n - 1; i++) {
        var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
        c1.push([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]);
        c2.push([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]);
      }
      function bez(j, u) {
        var a = pts[j], b = c1[j], c = c2[j], e = pts[j + 1], m = 1 - u;
        return [m * m * m * a[0] + 3 * m * m * u * b[0] + 3 * m * u * u * c[0] + u * u * u * e[0],
                m * m * m * a[1] + 3 * m * m * u * b[1] + 3 * m * u * u * c[1] + u * u * u * e[1]];
      }
      function at(ch) {                                      /* point and unit tangent at a channel */
        ch = clamp(ch, 0, total);
        var j = 0;
        while (j < n - 2 && R[j + 1][0] < ch) j++;
        var u = (ch - R[j][0]) / (R[j + 1][0] - R[j][0]), a = bez(j, clamp(u - .03, 0, 1)), b = bez(j, clamp(u + .03, 0, 1)), p = bez(j, u);
        var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        return { x: p[0], y: p[1], tx: dx / l, ty: dy / l };
      }
      function txt(str, x, y, cls, anchor, parent) {
        var t = el('text', { x: f(x), y: f(y), 'class': cls || '', 'text-anchor': anchor || 'start' }, parent || svg);
        t.textContent = str; return t;
      }

      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true' });
      var CORAL = '#ff3d57', DRAW = 2.6;

      /* locator: the two islands (Natural Earth outlines) with this drawing's frame in red */
      var Gd = window.YW_GEO && window.YW_GEO.kefalonia;
      if (Gd && Gd.polys && Gd.polys.length > 1) {
        var ih = small ? 74 : 132, ix = small ? 0 : 2, iy = H - ih - (small ? 22 : 30), la0 = 38.04, la1 = 38.52, lo0 = 20.32, isc = ih / (la1 - la0);
        var gi = el('g', { fill: 'none', stroke: PAPER, 'stroke-width': 1, 'stroke-linejoin': 'round', opacity: .85 }, svg);
        Gd.polys.slice(0, 2).forEach(function (pl) {
          el('path', { d: 'M' + pl.ring.map(function (p) { return f(ix + (p[0] - lo0) * k * isc) + ' ' + f(iy + (la1 - p[1]) * isc); }).join('L') + 'Z' }, gi);
        });
        var bx0 = ix + (R[0][1] - lo0) * k * isc, bx1 = ix + (C.telecom_node[0] - lo0) * k * isc, by0 = iy + (la1 - maxy) * isc, by1 = iy + (la1 - miny) * isc;
        el('rect', { x: f(bx0 - 2), y: f(by0 - 2), width: f(bx1 - bx0 + 4), height: f(by1 - by0 + 4), fill: 'none', stroke: CORAL, 'stroke-width': 1.5 }, svg);
        txt('Kefalonia & Ithaca, Ionian Sea', ix, iy + ih + 16, 't-dim');
      }

      /* the route, one path per segment so that it can draw itself in channel order */
      var gSeg = el('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      C.segments.forEach(function (s) {
        var a = idxOf(s.from), b = idxOf(s.to);
        if (a < 0 || b < 0) return;
        var dd = 'M' + f(pts[a][0]) + ' ' + f(pts[a][1]);
        for (var j = a; j < b; j++) dd += 'C' + f(c1[j][0]) + ' ' + f(c1[j][1]) + ' ' + f(c2[j][0]) + ' ' + f(c2[j][1]) + ' ' + f(pts[j + 1][0]) + ' ' + f(pts[j + 1][1]);
        var sea = s.key === 'sea';
        var pth = el('path', { d: dd, stroke: sea ? RED : PAPER, 'stroke-width': small ? (sea ? 3 : 2.2) : (sea ? 4.5 : 3), pathLength: 1 }, gSeg);
        pth.style.strokeDasharray = 1; pth.style.strokeDashoffset = drawn ? 0 : 1;
        pth.style.transition = 'stroke-dashoffset ' + ((s.to - s.from) / total * DRAW).toFixed(2) + 's linear ' + (s.from / total * DRAW).toFixed(2) + 's';
        segEls.push(pth);
      });

      /* beyond the last channel, to the telecom node */
      var end = pts[n - 1], node = P(C.telecom_node[0], C.telecom_node[1]);
      el('line', { x1: f(end[0]), y1: f(end[1]), x2: f(node[0]), y2: f(node[1]), stroke: PAPER, 'stroke-width': 1.3, 'stroke-dasharray': '3 5' }, svg);
      el('rect', { x: f(node[0] - 4.5), y: f(node[1] - 4.5), width: 9, height: 9, fill: INK, stroke: PAPER, 'stroke-width': 1.5 }, svg);
      if (!small) txt('telecom node', node[0] + 12, node[1] - 8, 't-dim');
      txt(String(total), end[0] + 13, end[1] + 6);

      /* channel ticks */
      var gT = el('g', {}, svg), step = small ? 400 : 200;
      for (var ch = step; ch <= 1800; ch += step) {
        var q = at(ch), nx = q.ty, ny = -q.tx;               /* to the left of the direction of travel */
        el('line', { x1: f(q.x - nx * 6), y1: f(q.y - ny * 6), x2: f(q.x + nx * 6), y2: f(q.y + ny * 6), stroke: PAPER, 'stroke-width': 1.2 }, gT);
        txt(String(ch), q.x + nx * 19, q.y + ny * 19 + 4, 't-dim', nx > .35 ? 'start' : nx < -.35 ? 'end' : 'middle', gT);
      }

      /* coils: red rings, radius by the square root of the stored length; callouts in a column to the west */
      var gC = el('g', { fill: 'none' }, svg), rs = small ? 0.62 : 1;
      function ring(chMid, metres) {
        var q = at(chMid), rr = (4 + Math.sqrt(metres) * 1.3) * rs;
        el('circle', { cx: f(q.x), cy: f(q.y), r: f(rr), stroke: CORAL, 'stroke-width': small ? 1.5 : 2 }, gC);
        return { x: q.x, y: q.y, r: rr, tx: q.tx, ty: q.ty };
      }
      var reel = ring(20, C.facts.reel_m), first = null, col = [];
      C.coils.forEach(function (c, j) {
        var g = ring((c.from + c.to) / 2, c.m);
        g.label = c.m + ' m' + (c.note ? ' · ' + c.note : ''); g.chs = c.from + '–' + c.to;
        if (j === 0) first = g; else col.push(g);
      });
      if (!small) {
        txt('reel ' + C.facts.reel_m + ' m', reel.x - 4, reel.y - reel.r - 9, 't-red', 'middle', gC);
        if (first) txt(first.label, first.x + first.r + 9, first.y - first.r + 2, 't-red', 'start', gC);
        var lx = Math.min.apply(null, col.map(function (g) { return g.x - g.r; })) - 30, ly = -1e9;
        col.sort(function (a, b) { return a.y - b.y; }).forEach(function (g) {
          ly = Math.max(g.y, ly + 19);
          var ex = g.x - g.r * 0.94, ey = g.y + clamp(ly - g.y, -g.r * .3, g.r * .3);
          el('path', { d: 'M' + f(lx + 6) + ' ' + f(ly) + 'L' + f(ex) + ' ' + f(ey), stroke: CORAL, 'stroke-width': 1 }, gC);
          txt(g.label, lx, ly + 4, 't-red', 'end', gC);
        });
        txt('0 · interrogator', pts[0][0] - 12, pts[0][1] + 5, '', 'end');
      } else {
        txt('0', pts[0][0] - 9, pts[0][1] + 4, '', 'end');
      }
      el('rect', { x: f(pts[0][0] - 4.5), y: f(pts[0][1] - 4.5), width: 9, height: 9, fill: PAPER }, svg);

      /* names, north, scale */
      var beach = at(912);
      if (small) {
        txt('Kefalonia', pts[0][0] + 2, pts[0][1] - 16);
        txt('Ithaca', end[0] + 13, end[1] + 22);
      } else {
        txt('KEFALONIA', 2, oy + (maxy - miny) * sc * 0.36, 't-big');
        txt('ITHACA', Math.min(W - 2, end[0] + padR * 0.9), end[1] + 58, 't-big', 'end');
      }
      var sbx = W - (small ? 4 : 2) - KM, sby = H - (small ? 30 : 34);
      el('path', { d: 'M' + f(sbx) + ' ' + (sby - 5) + 'V' + sby + 'H' + f(sbx + KM) + 'V' + (sby - 5), fill: 'none', stroke: PAPER, 'stroke-width': 1.2 }, svg);
      txt('1 km', sbx + KM / 2, sby - 9, 't-dim', 'middle');
      var nx0 = W - 12;
      el('path', { d: 'M' + nx0 + ' 46V12M' + (nx0 - 6) + ' 21l6-10 6 10', fill: 'none', stroke: PAPER, 'stroke-width': 1.2 }, svg);
      txt('N', nx0 - 14, 24, 't-dim', 'end');

      /* which channel is this? */
      var samples = [];
      for (i = 0; i < n - 1; i++) for (var u = 0; u < 1; u += 1 / 14) { var bb = bez(i, u); samples.push([bb[0], bb[1], R[i][0] + (R[i + 1][0] - R[i][0]) * u]); }
      samples.push([end[0], end[1], total]);
      var probe = el('circle', { r: small ? 5 : 6.5, fill: PAPER, stroke: INK, 'stroke-width': 2, visibility: 'hidden' }, svg);
      host.appendChild(svg);
      function leave() { probe.setAttribute('visibility', 'hidden'); if (tip) tip.classList.remove('on'); }
      function hover(ev) {
        var sb = svg.getBoundingClientRect(), mx = (ev.clientX - sb.left) / sb.width * W, my = (ev.clientY - sb.top) / sb.height * H;
        var best = 0, bd = 1e12;
        for (var j = 0; j < samples.length; j++) { var dx = samples[j][0] - mx, dy = samples[j][1] - my, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = j; } }
        if (bd > 110 * 110) { leave(); return; }
        var s = samples[best], c = Math.round(s[2]);
        probe.setAttribute('cx', f(s[0])); probe.setAttribute('cy', f(s[1])); probe.setAttribute('visibility', 'visible');
        if (!tip) return;
        tip.textContent = 'ch ' + c + ' · ' + (c * C.spacing_m / 1000).toFixed(2) + ' km of fibre · ' + segName(c);
        var fb = fig.getBoundingClientRect(), sx = sb.left - fb.left + s[0] / W * sb.width, sy = sb.top - fb.top + s[1] / H * sb.height;
        tip.style.transform = 'translate(' + clamp(sx + 14, 0, Math.max(0, fb.width - tip.offsetWidth)).toFixed(0) + 'px,' + (sy - 36).toFixed(0) + 'px)';
        tip.classList.add('on');
      }
      svg.addEventListener('pointermove', hover); svg.addEventListener('pointerdown', hover); svg.addEventListener('pointerleave', leave);
      api.cableAt = function (ch) { var q = at(ch), sb = svg.getBoundingClientRect(); return [sb.left + q.x / W * sb.width, sb.top + q.y / H * sb.height]; };
    }

    build();
    function go() { drawn = true; segEls.forEach(function (p) { p.getBoundingClientRect(); p.style.strokeDashoffset = 0; }); }
    if (!drawn && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); go(); } }, { threshold: 0.3 });
      io.observe(host);
    } else go();
    var rz = 0;
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(build, 150); });
    /* geo.js (the island outlines for the locator) loads after this script, so that it never delays the hero.
       All deferred scripts have run by DOMContentLoaded: draw again then, with the locator. */
    if (!window.YW_GEO) d.addEventListener('DOMContentLoaded', function () { if (window.YW_GEO) { lastW = 0; build(); if (drawn) go(); } });

    /* the same cable, straightened: as the interrogator counts it */
    var strip = $('#strip');
    if (strip) {
      var short = { cabin: 'reel', land: 'Kefalonia<em>, along the coast road</em>', coil: 'beach manhole', sea: 'seafloor', ithaca: 'Ithaca' };
      C.segments.forEach(function (s) {
        var e = d.createElement('div');
        e.className = 'seg seg--' + s.key;
        e.style.left = (s.from / total * 100) + '%'; e.style.width = ((s.to - s.from) / total * 100) + '%';
        e.innerHTML = '<i></i><span>' + short[s.key] + '<b>' + s.from + '–' + s.to + '</b></span>';
        strip.appendChild(e);
      });
      C.coils.forEach(function (c) {
        var e = d.createElement('div');
        e.className = 'coil'; e.title = c.m + ' m of spare fibre';
        e.style.left = (c.from / total * 100) + '%'; e.style.width = ((c.to - c.from) / total * 100) + '%';
        strip.appendChild(e);
      });
    }
  }

  /* =====================================================================
     05 — two small drawings: rings for the Wave Lab, crossing wavefronts for the workshop
     ===================================================================== */
  function initArt() {
    var lab = $('#labArt'), tsc = $('#tscArt'), s, i;
    if (lab) {
      s = '<svg viewBox="0 0 800 600" preserveAspectRatio="xMaxYMid slice" xmlns="' + SVGNS + '"><g fill="none" stroke="' + PAPER + '">';
      for (i = 1; i <= 26; i++) s += '<circle cx="610" cy="250" r="' + (i * 26) + '" stroke-width="' + (i % 4 === 0 ? 1.3 : .5) + '" opacity="' + (i % 4 === 0 ? .5 : .28) + '"/>';
      s += '</g><g fill="none" stroke="' + PAPER + '" stroke-width="2">';
      for (i = 0; i < 3; i++) s += '<circle class="lab-ring" cx="610" cy="250" r="340" style="animation-delay:' + (-i * 1.5) + 's"/>';
      s += '</g><circle cx="610" cy="250" r="7" fill="' + RED + '"/></svg>';
      lab.innerHTML = s;
    }
    if (tsc) {
      s = '<svg viewBox="0 0 600 720" preserveAspectRatio="xMaxYMax slice" xmlns="' + SVGNS + '"><g fill="none" stroke="' + INK + '" stroke-width="1.5">';
      for (i = 1; i <= 19; i++) s += '<circle cx="600" cy="720" r="' + (i * 17) + '"/>';
      for (i = 1; i <= 16; i++) s += '<circle cx="640" cy="452" r="' + (i * 17) + '"/>';
      s += '</g></svg>';
      tsc.innerHTML = s;
    }
    if (!$('#plakat-kf')) {
      var st = d.createElement('style'); st.id = 'plakat-kf';
      st.textContent = '.lab-ring{transform-box:fill-box;transform-origin:center;animation:labring 4.5s linear infinite;opacity:0}' +
        '@keyframes labring{0%{transform:scale(.02);opacity:.95}80%{opacity:.25}100%{transform:scale(1.5);opacity:0}}' +
        '@media (prefers-reduced-motion:reduce){.lab-ring{animation:none}}';
      d.head.appendChild(st);
    }
  }

  /* =====================================================================
     06 — photographs: ink on paper until you look closer
     ===================================================================== */
  function initPhotos() {
    $$('.ph').forEach(function (li) {
      var im = $('img.c', li);
      if (!im) return;
      /* the duotone copy is built attribute by attribute, src last, so that it stays lazy
         (a clone receives its src before its loading attribute and downloads at once) */
      var dd = d.createElement('img');
      dd.loading = 'lazy'; dd.decoding = 'async';
      dd.setAttribute('width', im.getAttribute('width')); dd.setAttribute('height', im.getAttribute('height'));
      dd.className = 'd'; dd.alt = ''; dd.setAttribute('aria-hidden', 'true');
      if (im.getAttribute('srcset')) { dd.setAttribute('sizes', im.getAttribute('sizes') || '100vw'); dd.setAttribute('srcset', im.getAttribute('srcset')); }
      dd.src = im.getAttribute('src');
      li.insertBefore(dd, im.nextSibling);
      li.addEventListener('click', function () { li.classList.toggle('on'); });
    });
  }

  /* =====================================================================
     Easter egg — click anywhere: a small earthquake. P first (radial, small), then S (transverse, larger).
     ===================================================================== */
  function initQuake() {
    var cv = $('#quake');
    if (!cv || !cv.getContext || RM || !Element.prototype.animate) return;
    var ctx = cv.getContext('2d'), quakes = [], raf = 0, W = 0, H = 0, dpr = 1, VP = 2600, VS = 1500, LIFE = 1.3;
    function size() { dpr = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke(); }
    function tick(now) {
      raf = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      quakes = quakes.filter(function (q) { return (now - q.t0) / 1000 < LIFE; });
      quakes.forEach(function (q) {
        var age = Math.max(0, (now - q.t0) / 1000), a = 1 - age / LIFE;
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(' + q.p + ',' + (0.5 * a).toFixed(3) + ')'; circle(q.x, q.y, age * VP);
        ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(' + q.s + ',' + (0.95 * a).toFixed(3) + ')'; circle(q.x, q.y, age * VS);
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(' + q.s + ',' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(q.x - 7, q.y); ctx.lineTo(q.x + 7, q.y); ctx.moveTo(q.x, q.y - 7); ctx.lineTo(q.x, q.y + 7); ctx.stroke();
      });
      if (quakes.length) raf = requestAnimationFrame(tick);
    }
    function shake(x, y) {
      var vh = window.innerHeight;
      $$('[data-q], .name').forEach(function (e) {
        var r = e.getBoundingClientRect();
        if (!r.width || r.bottom < -80 || r.top > vh + 80) return;
        var nx = clamp(x, r.left, r.right), ny = clamp(y, r.top, r.bottom), dist = Math.hypot(nx - x, ny - y);
        var dx = r.left + r.width / 2 - x, dy = r.top + r.height / 2 - y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        var att = 1 / (1 + dist / 480), aP = 1 + 2.4 * att, aS = 2 + 7.5 * att, sx = -uy, sy = ux;
        function tr(ax, ay, k2) { return (ax * k2).toFixed(2) + 'px ' + (ay * k2).toFixed(2) + 'px'; }
        e.animate([{ translate: '0 0' }, { translate: tr(ux, uy, aP) }, { translate: tr(ux, uy, -aP * .5) }, { translate: '0 0' }],
          { duration: 150, delay: dist / VP * 1000, easing: 'ease-out' });
        e.animate([{ translate: '0 0' }, { translate: tr(sx, sy, aS), offset: .13 }, { translate: tr(sx, sy, -aS * .72), offset: .34 }, { translate: tr(sx, sy, aS * .4), offset: .56 }, { translate: tr(sx, sy, -aS * .18), offset: .78 }, { translate: '0 0' }],
          { duration: 540, delay: dist / VS * 1000, easing: 'linear' });
      });
    }
    /* the rings take the colours of the ground they start on: P thin, S strong. Ink and red on paper; paper and red
       on the ink poster and the Wave Lab; both in ink on the red poster and the workshop, where red would vanish */
    var RINGS = { '': ['13,13,13', '228,0,43'], red: ['242,239,232', '228,0,43'], ink: ['13,13,13', '13,13,13'] };
    function fire(x, y) {
      if (!W || W !== window.innerWidth || H !== window.innerHeight) size();
      var under = d.elementFromPoint(x, y), zone = under && under.closest('[data-dot]'), c = RINGS[zone ? zone.getAttribute('data-dot') : ''] || RINGS[''];
      quakes.push({ x: x, y: y, t0: performance.now(), p: c[0], s: c[1] });
      if (!raf) raf = requestAnimationFrame(tick);
      shake(x, y);
    }
    d.addEventListener('click', function (ev) {
      if (ev.defaultPrevented || ev.button) return;
      var tg = ev.target;
      /* not where a click already means something: links and buttons, a photo (colour), the cable (channel), a row (summary) */
      if (tg.closest && tg.closest('a, button, input, select, textarea, label, .hero-ctl, .ph, #cableMap, .row')) return;
      fire(ev.clientX, ev.clientY);
    });
    api.quake = fire;
  }

  /* =====================================================================
     The red dot (mouse only) and the grid overlay (button, or the G key)
     ===================================================================== */
  /* the native cursor stays as the reader has set it; over something that answers a click, a red ring opens around it
     (ink on the red posters). The record in the hero has a crosshair instead (css). */
  function initDot() {
    var dot = $('#dot');
    if (!FINE || !dot) return;
    d.addEventListener('pointermove', function (ev) {
      if (ev.pointerType !== 'mouse') return;
      dot.style.transform = 'translate3d(' + ev.clientX + 'px,' + ev.clientY + 'px,0)';
      var c = ev.target && ev.target.closest ? ev.target : null;
      dot.classList.toggle('big', !!(c && c.closest('a, button, .row, .ph')));
      var zone = c && c.closest('[data-dot]');
      dot.classList.toggle('ink', !!zone && zone.getAttribute('data-dot') === 'ink');
    }, { passive: true });
    root.addEventListener('mouseleave', function () { dot.classList.remove('big'); });
  }
  function initGrid() {
    var btns = $$('[data-grid]'), main = $('#gridBtn');
    function toggle() {
      var onNow = root.classList.toggle('show-grid');
      btns.forEach(function (b) { b.setAttribute('aria-pressed', String(onNow)); });
      if (main) main.textContent = onNow ? 'Hide the grid' : 'Show the grid';
    }
    btns.forEach(function (b) { b.addEventListener('click', toggle); });
    d.addEventListener('keydown', function (ev) {
      if ((ev.key === 'g' || ev.key === 'G') && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) toggle();
    });
    /* red lines vanish on the red poster: once it reaches the middle of the screen, the grid is drawn in ink */
    var red = $('.poster--red');
    if (red && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { root.classList.toggle('on-red', es[0].isIntersecting); }, { rootMargin: '-45% 0px -45% 0px' }).observe(red);
    }
  }

  /* ---------- start ---------- */
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.error(e); } }
  function start() {
    [initHero, initCount, fitAll, initDots, initIndex, initCable, initArt, initPhotos, initQuake, initDot, initGrid].forEach(safe);
    var rz = 0;
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(fitAll, 80); });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(fitAll);
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();
