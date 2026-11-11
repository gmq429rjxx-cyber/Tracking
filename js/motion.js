// Kassabuch – Bewegung und Haptik: Federn statt fester Animationen, unterbrechbar, mit Fingertempo
'use strict';
const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
const MOTION = new WeakMap();
/* Feder (Apple: Dämpfung + Antwortzeit). Startet immer beim aktuellen Wert und übernimmt die Geschwindigkeit (px/s). */
function springTo(el, to, opt){
  const o = Object.assign({velocity:0, damping:1, response:0.35}, opt), st = MOTION.get(el) || {x:o.from ?? to};
  if (o.from != null) st.x = o.from;
  cancelAnimationFrame(st.raf); MOTION.set(el, st);
  if (REDUCED()) { st.x = to; o.apply(to); if (o.done) o.done(); return; }
  const k = Math.pow(2 * Math.PI / o.response, 2), c = 4 * Math.PI * o.damping / o.response;
  let v = o.velocity, last = performance.now();
  const step = now => {
    const dt = Math.min(0.034, (now - last) / 1000); last = now;
    for (let i = 0; i < 4; i++) { const h = dt / 4, a = -k * (st.x - to) - c * v; v += a * h; st.x += v * h; }
    if (Math.abs(st.x - to) < 0.4 && Math.abs(v) < 8) { st.x = to; o.apply(to); st.raf = 0; if (o.done) o.done(); return; }
    o.apply(st.x); st.raf = requestAnimationFrame(step);
  };
  st.raf = requestAnimationFrame(step);
}
function setMotionValue(el, x){ const st = MOTION.get(el) || {}; cancelAnimationFrame(st.raf); st.x = x; st.raf = 0; MOTION.set(el, st); }
/* Wohin ein Wisch führt (Apples Projektion wie beim Scroll-Ausrollen) */
const project = (v, d = 0.99) => (v / 1000) * d / (1 - d);
/* Weicher Rand: je weiter über die Grenze, desto mehr Widerstand */
const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));
function velocityOf(hist){
  if (hist.length < 2) return 0;
  const a = hist[0], b = hist[hist.length - 1], dt = (b[1] - a[1]) / 1000;
  return dt > 0 ? (b[0] - a[0]) / dt : 0;
}
/* Haptik: Android über vibrate, iPhone (Safari ab iOS 18) über einen versteckten Schalter */
function haptic(){
  try {
    if (navigator.vibrate && navigator.vibrate(8)) return;
    const l = document.createElement('label'), i = document.createElement('input');
    l.setAttribute('aria-hidden', 'true'); l.style.display = 'none'; i.type = 'checkbox'; i.setAttribute('switch', '');
    l.appendChild(i); document.head.appendChild(l); l.click(); l.remove();
  } catch (_) {}
}
/* :active auf iOS aktivieren (Rückmeldung schon beim Berühren) */
document.addEventListener('touchstart', () => {}, {passive:true});

/* ---------- Sheet: gleitet als Feder herein, folgt dem Finger, Wisch nach unten schließt ---------- */
const sheetEls = () => ({wrap:$('#sheet'), sh:document.querySelector('.sheet'), scrim:document.querySelector('#sheet .scrim')});
const sheetOpen = () => { const w = $('#sheet'); return !w.hidden && !w.classList.contains('closing'); };
function sheetApply(y){ const {sh, scrim} = sheetEls(), h = Math.max(1, sh.offsetHeight); sh.style.transform = y > 0.5 ? 'translateY(' + y + 'px)' : ''; scrim.style.opacity = String(Math.max(0, 1 - y / h)); }
function sheetEnter(){
  const {wrap, sh} = sheetEls(), was = wrap.hidden || wrap.classList.contains('closing');
  wrap.classList.remove('closing'); wrap.hidden = false;
  if (!was) return;
  const st = MOTION.get(sh), start = st && st.raf ? st.x : sh.offsetHeight;
  springTo(sh, 0, {from:start, damping:1, response:0.38, apply:sheetApply});
}
function sheetLeave(velocity, done){
  const {wrap, sh} = sheetEls(); wrap.classList.add('closing');
  const st = MOTION.get(sh), from = st && st.x != null ? st.x : 0;
  springTo(sh, sh.offsetHeight + 40, {from, velocity:velocity || 0, damping:1, response:0.32, apply:sheetApply, done:() => { if (wrap.classList.contains('closing')) done(); }});
}
(function sheetDrag(){
  const {sh} = sheetEls(); if (!sh) return;
  let d = null;
  sh.addEventListener('touchstart', ev => {
    if (!sheetOpen() || ev.touches.length > 1 || ev.target.closest('input, select, textarea, .swipe')) { d = null; return; }
    const t = ev.touches[0]; d = {x0:t.clientX, y0:t.clientY, head:!!ev.target.closest('.sheet-grip, .sheet-head'), active:false, dead:false, hist:[], crossed:false};
  }, {passive:true});
  sh.addEventListener('touchmove', ev => {
    if (!d || d.dead) return;
    const t = ev.touches[0], dx = t.clientX - d.x0, dy = t.clientY - d.y0;
    if (!d.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy) || dy < 0 || !(d.head || sh.scrollTop <= 0)) { d.dead = true; return; }
      d.active = true; d.y0 = t.clientY; setMotionValue(sh, 0);
    }
    ev.preventDefault();
    const y = Math.max(0, t.clientY - d.y0); setMotionValue(sh, y); sheetApply(y);
    const now = performance.now(); d.hist.push([y, now]); while (d.hist.length > 2 && now - d.hist[0][1] > 90) d.hist.shift();
    if (!d.crossed && y > sh.offsetHeight * 0.4) { d.crossed = true; haptic(); } else if (d.crossed && y < sh.offsetHeight * 0.4) d.crossed = false;
  }, {passive:false});
  const end = () => {
    if (!d || !d.active) { d = null; return; }
    const v = velocityOf(d.hist), y = (MOTION.get(sh) || {}).x || 0, h = sh.offsetHeight; d = null;
    if (y + project(Math.max(0, v)) > h * 0.4 || v > 1100) closeSheet({velocity:v});
    else springTo(sh, 0, {velocity:v, damping:1, response:0.3, apply:sheetApply});
  };
  sh.addEventListener('touchend', end, {passive:true}); sh.addEventListener('touchcancel', end, {passive:true});
})();
