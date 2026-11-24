/* v3c · 地听 — the handscroll.
   Wide screens: lays the sections out along one long strip, moves it sideways (wheel, drag, keys, the marks at
   the bottom) and keeps the painting (js/painting.js) in step. Small screens: paints one band per section.
   window.__scrollToFraction(f) moves to f = 0…1 of the scroll (used by the screenshot tool). */
(function () {
'use strict';
var doc = document, root = doc.documentElement, Ink = window.YWInk;
function $(s, p) { return (p || doc).querySelector(s); }
function $$(s, p) { return Array.prototype.slice.call((p || doc).querySelectorAll(s)); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* e-mail: assembled here, never in the page source */
(function () {
  var a = 'yuhan.wang' + '@' + 'eaps.ethz.ch';
  $$('[data-mail]').forEach(function (el) { el.href = 'mailto:' + a; });
  $$('[data-mail-text]').forEach(function (el) { el.textContent = a; });
})();

var stage = $('#stage'), track = $('#track'), cv = $('#paint'), paper = $('.paper'), nav = $('.silk-bottom'), roller = $('#roller');
var hero = $('.hero'), hin = $('.hero-in'), note = $('#pnote'), viewer = $('#viewer');
var secs = $$('#track > section'), marks = $$('#marks a');
if (!Ink || !stage || !cv.getContext) return;

var RM = matchMedia('(prefers-reduced-motion: reduce)');
/* the scroll unrolls sideways in windows at least 800 × 560 and a tenth wider than they are tall: the opening (the
   title, the note in the sky, the moon) needs that much room. Upright tablets, half screens and square windows get
   the vertical page. The two sizes= attributes in index.html follow this query */
var MQ = matchMedia('(min-width: 800px) and (min-height: 560px) and (min-aspect-ratio: 11/10)');
var params = new URLSearchParams(location.search);
var seed = parseInt(params.get('seed'), 10);
if (!seed) { var dt = new Date(); seed = dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate(); }
var mode = null, P = null, bands = [], io = null;
var x = 0, target = 0, maxX = 0, W = 0, H = 0, L = 0, secX = [], cur = -1;
var raf = 0, last = 0, frameNo = 0, lastDir = 1, lastInput = 0, dirty = true, moving = false;
var seen = performance.now(), IDLE = 45000;          /* no input for this long: the painting holds still until the reader returns */
var MOUNT = 112, AMP = [1, .72, 1.14, .46, .84, .34, .56, .26];

function seedLabel() { var el = $('#seedno'); if (el) el.textContent = 'No. ' + seed; }

/* ================================================================== handscroll */
function layoutH() {
  W = window.innerWidth; H = stage.clientHeight;
  var mo = $('.mount.start'); MOUNT = mo && mo.offsetWidth || 112;   /* the silk mounting narrows a little on narrow screens */
  root.style.setProperty('--W', W + 'px'); root.style.setProperty('--H', H + 'px');
  fitHero();
  fitTitles();
  var flows = $$('.flow'), lastF = $('.flow.last');
  flows.forEach(function (f) { f.style.width = ''; });
  secs[secs.length - 1].style.fontSize = ''; lastF.classList.remove('low', 'wide');
  ['low', 'wide'].forEach(function (c) {                          /* 落款: two columns, each above the water */
    if ($$('.grp', lastF).some(function (g) { return g.offsetHeight > lastF.clientHeight + 1; })) lastF.classList.add(c);
  });
  fitFlows(flows);
  flows.forEach(function (f) { f.style.width = Math.ceil(f.scrollWidth) + 'px'; });   /* columns that wrapped sideways */
  note.style.left = Math.round(hin.offsetLeft + hin.offsetWidth + 44) + 'px';
  /* at the end the whole 落款 block should stand beside the roller: the empty paper after it gives way first, then
     its type gets a little smaller, never under 17 px */
  var ls = secs[secs.length - 1], room = W - MOUNT - 24 - 8 - 48;
  var lw = ls.offsetWidth, fs = parseFloat(getComputedStyle(track).fontSize), k = Math.max(17 / fs, room / lw);
  if (lw > room && k < .995) {
    ls.style.fontSize = k.toFixed(3) + 'em';
    lastF.style.width = ''; lastF.style.width = Math.ceil(lastF.scrollWidth) + 'px'; lw = ls.offsetWidth;
  }
  /* on the narrowest screens it is still wider than the window: then the scroll ends where one of its columns
     starts, so that End shows the last columns whole (the sign-off, the links, the signature) and no column cut
     mid-word; blank paper follows them */
  var pad = clamp(W - MOUNT - 24 - lw - 56, 8, .16 * W);
  if (lw > room) {
    var cols = [$('.ctitle', ls)].concat($$('.grp', lastF), [$('.lastcol', ls)]);
    for (var j = 0; j < cols.length; j++) {
      var p = W - MOUNT - 24 - 20 - (lw - cols[j].offsetLeft);   /* the view starts 20 px before this column */
      if (p >= 8) { pad = p; break; }
    }
  }
  track.style.paddingRight = Math.round(MOUNT + 24 + pad) + 'px';
  L = track.offsetWidth; maxX = Math.max(0, L - W);
}

/* a block taller than its column (a short window with a wide fallback font) widens that column a step or two, so that
   it runs to fewer lines and still ends above the water. 落款 has its own fit (layoutH) */
function fitFlows(flows) {
  flows.forEach(function (f) {
    f.style.removeProperty('--col');
    if (f.classList.contains('last')) return;
    var kids = Array.prototype.slice.call(f.children), w = kids.length ? kids[0].offsetWidth : 0;
    function over() { var fb = f.getBoundingClientRect().bottom + 1; return kids.some(function (c) { return c.getBoundingClientRect().bottom > fb; }); }
    for (var k = 1; k <= 4 && w && over(); k++) f.style.setProperty('--col', Math.round(w * (1 + .1 * k)) + 'px');
  });
}

/* on short screens the title, the name column and the seal shrink (--hk, down to .7) until the hero ends 14 px above
   the seismogram (.657 H). The hero's width shrinks with them, so the gloss keeps its lines: the largest hk that fits
   is found by halving. The subtitle stays on one line across the hero; a wider fallback font is set smaller (--lk).
   If the hero is still too tall at .7 (a short window and a wide fallback font), its type gets smaller too (--hf) */
function fitHero() {
  var top = stage.getBoundingClientRect().top, ln = $('.line', hin);
  function room(hk, hf) {
    root.style.setProperty('--hk', hk.toFixed(3)); root.style.setProperty('--hf', hf.toFixed(3)); root.style.setProperty('--lk', '1');
    var k = ln.clientWidth / ln.scrollWidth;
    if (k < 1) root.style.setProperty('--lk', Math.max(.8, k - .004).toFixed(3));
    return .657 * H - 14 - (hin.getBoundingClientRect().bottom - top);
  }
  function largest(lo, f) {                                      /* the largest value in [lo, 1] that fits */
    if (f(1) > -1) return 1;
    if (f(lo) < -1) return lo;
    for (var k = 0, hi = 1; k < 6; k++) { var mid = (lo + hi) / 2; if (f(mid) > -1) lo = mid; else hi = mid; }
    return lo;
  }
  var hk = largest(.7, function (v) { return room(v, 1); });
  room(hk, hk > .7 ? 1 : largest(.8, function (v) { return room(.7, v); }));
}

/* the section titles end above the water (.62 H; the seismogram swings up to about .64 H under a title). When an
   English label would run below that line, the labels of the two-character titles all move beside their titles
   (.side), so that the parts of one screen size match; the four-character 海底听震 decides for itself. A title
   still too long is set smaller (--tk), and on the very shortest screens a label that cannot fit goes (.noen). */
function fitTitles() {
  var top0 = stage.getBoundingClientRect().top, lim = .62 * H, ts = $$('.ctitle');
  function bot(el) { return el.getBoundingClientRect().bottom - top0; }
  ts.forEach(function (t) { t.classList.remove('side', 'noen'); t.style.removeProperty('--tk'); });
  var two = ts.filter(function (t) { return $('.zh', t).textContent.length < 3; });
  var side2 = two.some(function (t) { return bot($('.en', t)) > lim || bot($('.zh', t)) > lim; });
  ts.forEach(function (t) {
    var zh = $('.zh', t), en = $('.en', t);
    if (two.indexOf(t) >= 0 ? side2 : bot(en) > lim || bot(zh) > lim) t.classList.add('side'); else return;
    var tt = t.getBoundingClientRect().top - top0, tk = 1;
    for (var k = 0; k < 3 && bot(zh) > lim && tk > .5; k++) {
      tk = Math.max(.5, tk * (lim - 2 - tt) / (bot(zh) - tt));
      t.style.setProperty('--tk', tk.toFixed(3));
    }
    if (bot(en) > lim) t.classList.add('noen');
  });
}

/* the note on the fibre sits in the water, clear of the ticks and channel numbers below it (P.fy: the fibre) */
function placeCableNote() {
  var cn = $('.cable-note'); if (!cn || !P) return;
  cn.style.top = '';
  var sec = cn.offsetParent, x0 = sec.offsetLeft + cn.offsetLeft, top = sec.offsetTop + cn.offsetTop, h = cn.offsetHeight, fmin = Infinity;
  for (var xx = x0 - 10; xx <= x0 + cn.offsetWidth + 10; xx += 6) fmin = Math.min(fmin, P.fy(xx));
  var room = fmin - Math.max(17 * P.uf + 2, 15 * P.uf + 10) - 8;
  if (top + h <= room) return;
  cn.style.top = Math.round(Math.max(P.traceY() + .03 * H, room - h) - sec.offsetTop) + 'px';
}

function measure() {
  var u = H / 840, ranges = [[0, MOUNT, 0, 50]], blocks = [];
  var hl = hero.offsetLeft + hin.offsetLeft;
  blocks.push([hl, hl + hin.offsetWidth]);
  $$('.colophon').forEach(function (c) { blocks.push([c.offsetLeft, c.offsetLeft + c.offsetWidth]); });
  blocks.forEach(function (b) { ranges.push([b[0] - 30, b[1] + 30, 0, 150]); });
  ranges.push([L - MOUNT, L, 0, 50]);
  var nl = hero.offsetLeft + note.offsetLeft, nr = nl + note.offsetWidth + 6;
  ranges.push([nl - 14, nr, .3, 100, .55]);               /* low hills under the note; the moon and the birds keep a little clear of it */
  var gaps = [];
  for (var i = 0; i < blocks.length; i++) {
    var a = blocks[i][1] + 30, b = i + 1 < blocks.length ? blocks[i + 1][0] - 30 : L - MOUNT - 10;
    gaps.push({ a: a, b: b, amp: AMP[i] == null ? .4 : AMP[i] });
  }
  /* the opening mountains are composed, not left to chance */
  var g0 = gaps[0], m1 = Math.max(g0.a + .25 * W, .665 * W);
  g0.peaks = [
    { x: m1, h: .5, wl: 150, wr: 186 },
    { x: m1 + .22 * W, h: .4, wl: 138, wr: 150 },
    { x: m1 + .43 * W, h: .47, wl: 150, wr: 130 },
    { x: m1 - .17 * W, h: .2, wl: 120, wr: 120, p1: 1.6, p2: 1.5 }
  ].filter(function (p) { return p.x < g0.b - 40; });
  /* seconds after the earthquake at points along the scroll: P under the note, S where 自述 ends, and the surface
     waves (iasp91 arrival 2253 s, largest long-period motion 2709 s) in the widest gap, between 海底听震 and 著述 */
  var xP = nl + 16, g = gaps;
  var anchors = [[0, 430], [xP, 710.2], [g[0].b, 1215], [g[1].a + 46, 1297.6], [g[1].b, 1700], [g[2].a, 1900], [g[2].b, 3200],
    [g[3].a, 3690], [g[3].b, 4400], [g[4].a, 4650], [g[4].b, 5400], [g[5].a, 5700], [g[5].b, 6600], [g[6].a, 7400], [g[6].b, 8300], [L, 8990]];
  var w5 = g[5].b - g[5].a, wires = null;
  if (w5 > 380 * u) { var span = Math.min(w5 * .6, 640 * u), c5 = g[5].a + w5 * .5; wires = [c5 - span / 2, c5 + span / 2]; }
  function xOfT(t) { for (var k = 1; k < anchors.length; k++) if (t <= anchors[k][1]) { var p = anchors[k - 1], q = anchors[k]; return p[0] + (q[0] - p[0]) * (t - p[1]) / (q[1] - p[1]); } return L; }
  /* the tallest mountains of the scroll rise from the surface-wave arrival and peak over the largest motion */
  var xa = xOfT(2253), xs = xOfT(2709);
  g[2].peaks = [
    { x: xs, h: .54, wl: 170, wr: 190 },
    { x: (xa + xs) / 2 + .02 * W, h: .3, wl: 120, wr: 130, p1: 1.6, p2: 1.5 },
    { x: xs + .15 * W, h: .38, wl: 140, wr: 120 }
  ].filter(function (p) { return p.x > g[2].a + 60 && p.x < g[2].b - 60; });
  var phases = [{ x: xP, label: 'P', up: 24, amp: .1 }, { x: xOfT(1297.6), label: 'S', up: 24, amp: .45 }, { x: xa, label: 'surface waves', up: 30, amp: .7 }];
  secX = secs.map(function (s, i) { return i === 0 ? 0 : clamp(s.offsetLeft - .1 * W, 0, maxX); });
  /* the moon keeps 2.6 radii clear of the note and of the window's edge (its halo is 4.2 radii wide); where a narrow
     window leaves less room than that, the moon is a little smaller */
  var mr = Math.max(.032 * H, Math.min(.043 * H, (W - nr) / 5.2)), moonX = clamp(Math.max(.815 * W, nr + 6 * mr), nr + 2.6 * mr, W - 2.6 * mr);
  /* the birds set out between the note (they fade near it) and the moon, where there is room for them */
  var fx = Math.max(moonX - .2 * W, Math.min(nr + 90 * u, moonX - 2.4 * mr - 71 * u));
  return { ranges: ranges, gaps: gaps, anchors: anchors, wires: wires, phases: phases, emph: [blocks[2][0] - 60, blocks[2][1] + 60],
    moon: [moonX, .165 * H, mr], flock: [fx, .21 * H] };
}

/* lays the scroll out and paints it at `at`: a fraction of its length, or [part, px past that part's place]; without
   `at`, where it was */
function buildH(at) {
  layoutH();
  var m = measure();
  if (P) P.destroy();
  P = new Ink.Painting(cv, {
    seed: seed, W: W, H: H, L: L, anchors: m.anchors, ranges: m.ranges, gaps: m.gaps, wires: m.wires, phases: m.phases,
    moon: m.moon, boat: .36 * W, flock: m.flock, emph: m.emph, parallax: !RM.matches, still: RM.matches, ch0: 0, ch1: 1872,
    coilLabelFrom: W                                            /* the first screen stays quiet; the coils are explained at 海底听震 */
  });
  placeCableNote();
  placeMarks();
  x = target = clamp(at == null ? x : typeof at === 'number' ? at * maxX : secX[at[0]] + at[1], 0, maxX);
  apply(); P.render(performance.now(), x, true); dirty = false;
}

function placeMarks() {
  var nw = nav.clientWidth - 148;
  marks.forEach(function (a, i) { a.parentNode.style.left = (64 + (maxX ? secX[i] / maxX : 0) * nw) + 'px'; });
  nav.classList.remove('tight');                                /* the English names go when any two marks would touch */
  for (var k = 1; k < marks.length; k++) {
    if (marks[k].getBoundingClientRect().left < marks[k - 1].getBoundingClientRect().right + 6) { nav.classList.add('tight'); break; }
  }
}

/* a place on the scroll as [part, px past that part's place], which outlasts a new layout. The part is the one its
   mark shows: a part is current once its title has passed the middle */
function anchor(v) { var k = 0; for (var j = 1; j < secX.length; j++) if (v >= secX[j] - .4 * W) k = j; return [k, v - (secX[k] || 0)]; }

function apply() {
  track.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
  if (paper) paper.style.transform = 'translate3d(' + (-(x % 600)) + 'px,0,0)';
  roller.style.transform = 'translate3d(' + ((maxX ? x / maxX : 0) * (nav.clientWidth - 148)) + 'px,0,0)';
  var c = anchor(x)[0];
  if (c !== cur) {
    cur = c;
    marks.forEach(function (a, i) { if (i === c) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  }
}

function go(to, instant) {
  target = clamp(to, 0, maxX); lastInput = performance.now();
  if (instant || RM.matches) { x = target; apply(); dirty = true; }
  wake();
}
function goSection(id, instant) {
  var i = secs.findIndex(function (s) { return s.id === id; });
  if (i < 0) return false;
  go(secX[i], instant); return true;
}

function frame(now) {
  raf = 0;
  if (mode !== 'h' || doc.hidden) return;
  var dtm = Math.min(64, now - (last || now)); last = now; frameNo++;
  var d = target - x;
  if (Math.abs(d) > .08) { lastDir = d > 0 ? 1 : -1; x += Math.abs(d) < .6 ? d : d * (1 - Math.exp(-dtm / 150)); moving = true; apply(); }
  else { if (d) { x = target; apply(); dirty = true; } moving = false; }
  var busy = moving || P.active() || dirty;
  if (busy || (!RM.matches && (frameNo & 1) === 0)) { P.render(now, x, false); dirty = false; }
  if (busy || (!RM.matches && performance.now() - seen < IDLE)) raf = requestAnimationFrame(frame);
}
function wake() { if (!raf && mode === 'h' && !doc.hidden) { last = 0; raf = requestAnimationFrame(frame); } }

/* paint the next tiles while the reader is still */
setInterval(function () {
  if (mode === 'h' && P && !moving && !doc.hidden && performance.now() - lastInput > 300) P.ahead(x, lastDir);
}, 380);

/* ---- input */
function blank(t) { return !(t.closest && t.closest('.hero-in, .colophon, .note, .silk, a, button, dialog')); }
function inWater(e) { return e.clientY - stage.getBoundingClientRect().top > P.wl + 6; }

stage.addEventListener('wheel', function (e) {
  if (mode !== 'h' || e.ctrlKey || viewer.open) return;
  e.preventDefault();
  var dlt = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (e.deltaMode === 1) dlt *= 32; else if (e.deltaMode === 2) dlt *= W * .8;
  go(target + dlt * 1.3);
}, { passive: false });
[nav, $('.silk-top')].forEach(function (el) {
  el.addEventListener('wheel', function (e) { if (mode !== 'h' || e.ctrlKey) return; e.preventDefault(); go(target + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY)); }, { passive: false });
});

var drag = null, swallow = 0;
stage.addEventListener('pointerdown', function (e) {
  if (mode !== 'h' || e.button !== 0 || viewer.open) return;
  var bl = blank(e.target);
  if (e.pointerType === 'mouse' && !bl) return;                 /* leave text selectable */
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, sx: target, moved: false, bl: bl, lx: e.clientX, lt: e.timeStamp, v: 0, axis: null, touch: e.pointerType !== 'mouse' };
});
window.addEventListener('pointermove', function (e) {
  if (mode !== 'h') return;
  if (!drag) { if (e.pointerType === 'mouse') root.classList.toggle('ink', e.target === stage || stage.contains(e.target) ? blank(e.target) && inWater(e) : false); return; }
  if (e.pointerId !== drag.id) return;
  var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.moved) {
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    drag.moved = true; drag.axis = drag.touch && Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    try { stage.setPointerCapture(drag.id); } catch (err) {}
    root.classList.add('dragging');                              /* the text sliding under the pointer is not selected */
    try { var sel = window.getSelection(); if (sel && !sel.isCollapsed) sel.removeAllRanges(); } catch (err) {}
  }
  var dl = drag.axis === 'x' ? dx : dy, now = e.timeStamp, pos = drag.axis === 'x' ? e.clientX : e.clientY;
  if (now > drag.lt) { drag.v = .7 * drag.v + .3 * (pos - drag.lx) / (now - drag.lt); drag.lx = pos; drag.lt = now; }
  x = target = clamp(drag.sx - dl, 0, maxX); lastDir = dl < 0 ? 1 : -1; lastInput = performance.now();
  apply(); dirty = true; wake();
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  var dg = drag; drag = null; root.classList.remove('dragging');
  if (dg.moved) {
    swallow = performance.now();
    if (e.timeStamp - dg.lt < 80 && Math.abs(dg.v) > .05) go(target - clamp(dg.v, -2.6, 2.6) * 240);
    return;
  }
  if (dg.bl && e.type === 'pointerup' && inWater(e)) { P.ripple(x + e.clientX, e.clientY - stage.getBoundingClientRect().top); demo = true; wake(); }
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
doc.addEventListener('click', function (e) { if (performance.now() - swallow < 350) { e.preventDefault(); e.stopPropagation(); } }, true);

window.addEventListener('keydown', function (e) {
  if (mode !== 'h' || viewer.open || e.altKey || e.ctrlKey || e.metaKey) return;
  var t = e.target, tag = t && t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  var k = e.key, step = 150;
  if (k === 'ArrowRight' || k === 'ArrowDown') go(target + step);
  else if (k === 'ArrowLeft' || k === 'ArrowUp') go(target - step);
  else if (k === 'PageDown' || (k === ' ' && !e.shiftKey && tag !== 'BUTTON' && tag !== 'A')) go(target + W * .82);
  else if (k === 'PageUp' || (k === ' ' && e.shiftKey && tag !== 'BUTTON' && tag !== 'A')) go(target - W * .82);
  else if (k === 'Home') go(0);
  else if (k === 'End') go(maxX);
  else return;
  e.preventDefault();
});

/* the browser may scroll the stage by itself (focus, find in page): fold that into the scroll. While a link to a
   part (#papers) is being honoured at load, the browser's own jump to it is undone instead. */
var holdFold = !!location.hash, navFocus = false;
function fold() {
  if (mode !== 'h') return;
  var sl = stage.scrollLeft, st = stage.scrollTop;
  if (sl || st) {
    stage.scrollLeft = 0; stage.scrollTop = 0;
    if (sl && !holdFold) { x = target = clamp(x + sl, 0, maxX); apply(); dirty = true; wake(); }
  }
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
}
stage.addEventListener('scroll', fold);
window.addEventListener('scroll', fold);
track.addEventListener('focusin', function (e) {
  if (mode !== 'h') return;
  holdFold = false; fold();
  if (navFocus) return;                                          /* a mark moved focus to its heading and is scrolling there */
  var r = e.target.getBoundingClientRect();
  if (r.left < 70 || r.right > W - 70) { var to = x + r.left - Math.min(.3 * W, Math.max(80, (W - r.width) / 2)); go(to, Math.abs(to - x) > .9 * W); }   /* far away: jump, so focus is never out of sight */
});

doc.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a || mode !== 'h') return;
  var id = a.getAttribute('href').slice(1);
  if (goSection(id)) {
    e.preventDefault();
    try { history.replaceState(null, '', id === 'title' ? location.pathname + location.search : '#' + id); } catch (err) {}
    var s = doc.getElementById(id), h = s.querySelector('h1, h2') || s;       /* keyboard focus follows into that part */
    h.setAttribute('tabindex', '-1');
    navFocus = true; h.focus({ preventScroll: true }); navFocus = false;
  }
});

/* ================================================================== small screens: one painted band per section */
var TWIN = [[560, 960], [1220, 1640], [2240, 2660], [2660, 3080], [3600, 4020], [4800, 5220], [6200, 6620], [8000, 8420]];
/* the vertical hero is composed round its type: the hills stay below the name and the subtitle, and the moon hangs
   between the gloss and the name, right of the title */
function heroFrame(c) {
  var cr = c.getBoundingClientRect(), h = c.clientHeight, w = c.clientWidth, mr = .043 * h;
  function r(s) {                                                /* the box of the text itself (a block runs the full width) */
    var g = doc.createRange(); g.selectNodeContents($(s));
    var b = g.getBoundingClientRect(); return { l: b.left - cr.left, r: b.right - cr.left, t: b.top - cr.top, b: b.bottom - cr.top };
  }
  var nm = r('.hero-in .name'), ln = r('.hero-in .line'), tz = r('.hero-in .tzh');
  var gl = r('.hero-in .gloss .hint');                           /* the gloss box fills the title's row: it ends with the hint */
  var my = clamp(.33 * h, gl.b + 1.3 * mr, Math.max(gl.b + 1.3 * mr, nm.t - 1.3 * mr));
  return { keep: [-80, Math.round(Math.max(nm.r, ln.r) + 26), Math.round(ln.b + 12)], moon: [Math.max(w * .64, tz.r + 1.6 * mr), Math.round(my)] };
}
function band(c, k, n) {
  var w = c.clientWidth, h = c.clientHeight; if (!w || !h) return null;
  var isHero = c.classList.contains('hero-band'), span = Math.round(w / 5.4), c0 = Math.round(k / Math.max(1, n - 1) * (1872 - span));
  var opt = { seed: seed + k * 101, W: w, H: h, L: w, parallax: false, still: RM.matches, ch0: c0, ch1: c0 + span, labelEvery: 50,
    anchors: isHero ? [[0, 560], [w * .44, 710.2], [w, 830]] : [[0, TWIN[k % 8][0]], [w, TWIN[k % 8][1]]],
    ranges: [], gaps: [{ a: -60, b: w + 60, amp: [1, .8, 1.15, .6, .85, .5, .7, .45][k % 8] }], openLeft: false }, fr = null;
  if (isHero) {
    fr = heroFrame(c);
    opt.openLeft = true; opt.coilLabelFrom = w;
    opt.ranges = [[-80, w * .64, .42, 50]]; opt.keep = [fr.keep];
    opt.gaps = [{ a: -60, b: w * 1.3, amp: 1, peaks: [{ x: w * .9, h: .4, wl: 104, wr: 96, p1: 1.7, p2: 1.55 }, { x: w * .58, h: .2, wl: 92, wr: 80, p1: 1.5, p2: 1.6 }, { x: w * .2, h: .14, wl: 96, wr: 90, p1: 1.6, p2: 1.5 }, { x: w * 1.14, h: .27, wl: 64, wr: 60 }] }];
    opt.moon = fr.moon; opt.boat = w * .3; opt.phases = [{ x: w * .44, label: 'P', up: 20, amp: .1 }];
    /* the birds fly below the subtitle; where that brings them down to the label P, they set out right of it */
    var u = h / 840, fy = Math.max(.56 * h, fr.keep[2] + 18 * u), pTop = Math.round(.66 * h) - 32 * u - Math.max(13, 16 * u);
    opt.flock = [fy + 14 * u > pTop ? Math.max(.5 * w, .44 * w + 56 * u) : .5 * w, fy];
  }
  if (k === 6 && w > 300) opt.wires = [w * .16, w * .84];
  if (k === 3) opt.boat = w * .62;
  if (k === 2) opt.emph = [w * .05, w * .95];                     /* the band before 海底听震: the cable hears small earthquakes */
  var p = new Ink.Painting(c, opt);
  p.render(performance.now(), 0, true);
  return { c: c, k: k, n: n, P: p, on: true, frame: fr };
}
function buildV() {
  bands.forEach(function (b) { b.P.destroy(); });
  bands = [];
  if (io) io.disconnect();
  io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (en) { var b = bands.find(function (q) { return q.c === en.target; }); if (b) { b.on = en.isIntersecting; if (b.on) wakeV(); } });
  }, { rootMargin: '80px' }) : null;
  var cs = $$('canvas.band');
  cs.forEach(function (c, k) { var b = band(c, k, cs.length); if (!b) return; bands.push(b); if (io) io.observe(c); });
  wakeV();
}
var rafV = 0, fV = 0;
function frameV(now) {
  rafV = 0;
  if (mode !== 'v' || doc.hidden) return;
  fV++;
  var any = false;
  bands.forEach(function (b) {
    if (!b.on) return;
    var act = b.P.active();
    if (act || (!RM.matches && fV % 2 === 0)) b.P.render(now, 0, false);
    if (act || (!RM.matches && performance.now() - seen < IDLE)) any = true;
  });
  if (any) rafV = requestAnimationFrame(frameV);
}
function wakeV() { if (!rafV && mode === 'v' && !doc.hidden) rafV = requestAnimationFrame(frameV); }
doc.addEventListener('click', function (e) {
  if (mode !== 'v' || !e.target.closest) return;
  var c = e.target.closest('canvas.band') || (e.target.closest('.hero-view') && !e.target.closest('a, button') ? $('.hero-band') : null);
  if (!c) return;
  var b = bands.find(function (q) { return q.c === c; }); if (!b) return;
  var r = c.getBoundingClientRect(), yy = e.clientY - r.top;
  if (yy > b.P.wl + 2) { b.P.ripple(e.clientX - r.left, yy); wakeV(); }
});

/* ================================================================== modes, resize, repaint */
/* the part the reader is in on the vertical page: the last part whose top has passed 40 % of the window, or the last
   part once the page has reached its end. It is noted as the reader scrolls, not when the window turns: by then the
   browser has already laid the page out at the new width and moved it */
var vPart = 0, lastW = window.innerWidth;
function partV() {
  var e = doc.scrollingElement || root, vh = window.innerHeight, i = 0;
  if (e.scrollTop + vh >= e.scrollHeight - 2) return secs.length - 1;
  secs.forEach(function (s, k) { if (s.getBoundingClientRect().top < .4 * vh) i = k; });
  return i;
}
window.addEventListener('scroll', function () { if (mode === 'v' && window.innerWidth === lastW) vPart = partV(); }, { passive: true });
/* a turn of the tablet (or a window resized across the threshold) changes the layout; the reader stays in the same
   part (on the handscroll, the one its mark shows). A resize that keeps the handscroll keeps the same fraction of it */
function setMode() {
  var m = MQ.matches ? 'h' : 'v';
  var frac = mode === 'h' && maxX ? x / maxX : null, part = !mode || m === mode ? null : mode === 'h' ? Math.max(0, cur) : vPart;
  if (m !== mode) {
    mode = m;
    root.classList.toggle('hs', m === 'h');
    if (m === 'v') {
      if (P) { P.destroy(); P = null; }
      track.style.transform = ''; track.style.paddingRight = ''; secs[secs.length - 1].style.fontSize = '';
      $$('.flow').forEach(function (f) { f.style.width = ''; f.style.removeProperty('--col'); }); note.style.left = '';
      root.classList.remove('ink');
    } else { bands.forEach(function (b) { b.P.destroy(); }); bands = []; if (io) io.disconnect(); window.scrollTo(0, 0); }
  }
  if (m === 'h') { buildH(part != null ? [part, 0] : frac); wake(); }
  else {
    buildV();
    if (part) { secs[part].scrollIntoView({ behavior: 'instant', block: 'start' }); vPart = part; }
  }
}
var rz = 0;
window.addEventListener('resize', function () {
  clearTimeout(rz);
  rz = setTimeout(function () {
    if (mode === 'v' && !MQ.matches && window.innerWidth === lastW && (!bands[0] || bands[0].c.clientHeight === bands[0].P.o.H)) return;   /* only the address bar came or went */
    lastW = window.innerWidth; setMode();
  }, 160);
});
doc.addEventListener('visibilitychange', function () { if (!doc.hidden) { seen = performance.now(); wake(); wakeV(); } });
var touched = false;                                            /* the reader has moved the page themselves */
['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach(function (ev) {
  window.addEventListener(ev, function () {
    var idle = performance.now() - seen > IDLE; seen = performance.now(); if (idle) { wake(); wakeV(); }
    if (ev === 'pointerdown' || ev === 'keydown' || ev === 'wheel' || ev === 'touchstart') touched = true;
  }, { passive: true, capture: true });
});
if (RM.addEventListener) RM.addEventListener('change', function () { mode = null; setMode(); });

$('#repaint').addEventListener('click', function () {
  seed = (Math.random() * 89999999 | 0) + 10000000; seedLabel();
  if (mode === 'h') {
    if (RM.matches) { buildH(maxX ? x / maxX : 0); return; }
    cv.classList.add('out');
    setTimeout(function () { buildH(maxX ? x / maxX : 0); cv.classList.remove('out'); wake(); }, 420);
  } else buildV();
});

/* ================================================================== photographs */
(function () {
  var leaves = $$('#leaves .mat'), vimg = $('#vimg'), vcap = $('#vcap'), at = 0, opener = null;
  if (!viewer || !leaves.length) return;
  function show(i) {
    at = (i + leaves.length) % leaves.length;
    var b = leaves[at], im = $('img', b), cap = b.parentNode.querySelector('figcaption');
    vimg.src = b.getAttribute('data-full'); vimg.alt = im.alt; vcap.innerHTML = cap ? cap.innerHTML : '';
  }
  leaves.forEach(function (b, i) {
    b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', function () { opener = b; show(i); if (viewer.showModal) viewer.showModal(); else viewer.setAttribute('open', ''); });
  });
  function close() { if (viewer.close) viewer.close(); else viewer.removeAttribute('open'); }
  $('.vclose', viewer).addEventListener('click', close);
  $('.vprev', viewer).addEventListener('click', function () { show(at - 1); });
  $('.vnext', viewer).addEventListener('click', function () { show(at + 1); });
  viewer.addEventListener('click', function (e) { if (e.target === viewer || e.target.tagName === 'FIGURE') close(); });
  viewer.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') { show(at - 1); e.preventDefault(); } else if (e.key === 'ArrowRight') { show(at + 1); e.preventDefault(); } });
  viewer.addEventListener('close', function () { vimg.removeAttribute('src'); if (opener) opener.focus({ preventScroll: mode === 'h' }); });
})();

/* ================================================================== start */
var demo = false;
seedLabel();
setMode();
function afterOpen() {
  if (RM.matches || params.has('still')) return;
  setTimeout(function () {                                       /* a nudge: the scroll moves sideways */
    if (mode !== 'h' || lastInput || x > 1) return;
    target = Math.min(maxX, 54); wake();
    setTimeout(function () { if (!lastInput) { target = 0; wake(); } }, 760);   /* back, unless the reader took over */
  }, 1500);
  setTimeout(function () {                                       /* one drop of ink, to show that the water answers */
    if (demo) return;
    if (mode === 'h' && P && x < 60) { P.ripple(x + .7 * W, P.wl + .09 * H); wake(); }
    else if (mode === 'v' && bands[0] && window.scrollY < 40) { bands[0].P.ripple(bands[0].P.o.W * .62, bands[0].P.wl + bands[0].P.o.H * .07); wakeV(); }
  }, 2300);
}
/* the webfonts come late (their stylesheet never blocks the page): call back once it is in and its fonts have loaded */
var gf = doc.getElementById('gf');
function fontsIn(cb) {
  if (!doc.fonts || !doc.fonts.ready) return;
  function check() { if (!gf || (gf.rel === 'stylesheet' && gf.sheet)) requestAnimationFrame(function () { doc.fonts.ready.then(cb); }); }
  if (gf) gf.addEventListener('load', check);
  check();
}
/* new type metrics: lay out again, and keep the reader in the same part of the scroll */
var reflowT = 0;
function relayout() {
  clearTimeout(reflowT);
  reflowT = setTimeout(function () {
    if (mode === 'h') {
      var ax = anchor(x), at = anchor(target), w0 = track.offsetWidth, h0 = hin.offsetHeight, x0 = x, rip = P ? P.ripples : [];
      layoutH();
      if (Math.abs(track.offsetWidth - w0) > 6 || Math.abs(hin.offsetHeight - h0) > 6) {
        buildH(ax);                                              /* not the reader's input: the opening nudge still runs, */
        target = clamp(secX[at[0]] + at[1], 0, maxX);           /* and a glide under way goes on */
        P.ripples = rip.map(function (r) { r.x += x - x0; return r; });          /* ink already in the water stays where it fell */
      } else { placeCableNote(); dirty = true; }
      wake();
    } else {
      bands.forEach(function (b, i) {
        var f = b.frame && heroFrame(b.c);                       /* the hero is painted round its type: again, if the type moved */
        if (f && Math.max(Math.abs(f.keep[1] - b.frame.keep[1]), Math.abs(f.keep[2] - b.frame.keep[2]), Math.abs(f.moon[1] - b.frame.moon[1])) > 4) {
          var nb = band(b.c, b.k, b.n); nb.P.ripples = b.P.ripples; nb.on = b.on; b.P.destroy(); bands[i] = nb;
        } else b.P.render(performance.now(), 0, true);
      });
      var t = location.hash && doc.getElementById(location.hash.slice(1));
      if (t && !touched) t.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }, 60);
}
fontsIn(relayout);
if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', relayout);
/* the page scrolls smoothly (the skip link) only once it has settled, so that the browser's own jump to a #part
   is instant and the correction for late fonts (relayout) is the last word */
var smoothT = 0;
function settled() { clearTimeout(smoothT); smoothT = setTimeout(function () { root.classList.add('smooth'); }, 400); }
fontsIn(settled);

if (mode === 'h' && location.hash) goSection(location.hash.slice(1), true);
window.addEventListener('load', function () {
  if (mode === 'h' && location.hash && !lastInput) goSection(location.hash.slice(1), true);
  setTimeout(function () { holdFold = false; }, 700);           /* the browser's own jump to the #part comes around load */
  settled();
});
if (mode === 'h' && !RM.matches && !params.has('still') && doc.body.animate) {
  /* unroll: the scroll stays rolled up until the fonts are in (or 0.9 s have passed) */
  var cover = doc.createElement('div'); cover.id = 'cover'; cover.setAttribute('aria-hidden', 'true'); cover.innerHTML = '<i></i>';
  var from = 'translate3d(' + (MOUNT + 4) + 'px,0,0)';
  cover.style.transform = from; doc.body.appendChild(cover);
  var opened = false, unroll = function () {
    if (opened) return; opened = true;
    var an = cover.animate([{ transform: from }, { transform: 'translate3d(' + (window.innerWidth + 70) + 'px,0,0)' }], { duration: 1250, delay: 40, easing: 'cubic-bezier(.5,.03,.2,1)', fill: 'forwards' });
    an.onfinish = function () { cover.remove(); };
    afterOpen();
  };
  fontsIn(function () { setTimeout(function () { requestAnimationFrame(unroll); }, 70); });   /* after the relayout */
  setTimeout(unroll, 900);
} else afterOpen();

window.__scrollToFraction = function (f) {
  if (mode === 'h') { lastInput = performance.now(); x = target = clamp(f, 0, 1) * maxX; apply(); P.render(performance.now(), x, true); dirty = true; wake(); }
  else { var e = doc.scrollingElement; e.scrollTo(0, clamp(f, 0, 1) * (e.scrollHeight - window.innerHeight)); }
};
window.__ink = function () { return mode === 'h' ? P : bands.map(function (b) { return b.P; }); };
})();
