// Kassabuch – Gesten, Klick-Steuerung, Start der App
'use strict';
/* ---------- Gesten: Eintrag wischen, langes Drücken auf + (Monat nur über die Pfeile) ---------- */
function openRepeat(){
  const seen = new Set(), list = [];
  for (const e of allEntries().filter(e => e.type !== 'transfer' && !e.recurringId && !e.example).sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date))) {
    const k = (e.merchant || '') + '|' + e.catId + '|' + e.amount; if (seen.has(k)) continue; seen.add(k); list.push(e); if (list.length >= 5) break;
  }
  if (!list.length) return openEntry(null);
  openSheet('Wiederholen', '<p class="note" style="margin:0">Tippen übernimmt Händler, Kategorie, Karte und Betrag mit heutigem Datum.</p><div class="list">' + list.map(e => '<button class="row" data-act="repeat" data-id="' + esc(e.id) + '">' + badge(catById(e.catId)) + '<span class="row-main"><span class="row-title">' + esc(e.merchant || catById(e.catId).name) + '</span><span class="row-sub">' + esc(catById(e.catId).name) + (cardById(e.cardId) ? ' · ' + esc(cardById(e.cardId).name) : '') + '</span></span><span class="row-amt">' + (e.type === 'income' ? '+ ' : '− ') + money(e.amount) + '</span></button>').join('') + '</div><button class="btn" data-act="add" style="width:100%">Neuer leerer Eintrag</button>');
}
(function gestures(){
  let sx = 0, sy = 0, mode = null, row = null, wrap = null, open = null, lpTimer = 0, lpFired = false, hist = [], crossed = false;
  const rowApply = r => x => { r.style.transform = Math.abs(x) < 0.5 ? '' : 'translateX(' + x + 'px)'; };
  const rowX = r => (MOTION.get(r) || {}).x || 0;
  /* Aktionen nur beim Wischen sichtbar – sonst scheint das Rot an Pixelkanten als dünne Linie durch */
  const settle = (r, w) => () => { if (rowX(r) === 0) w.classList.remove('live'); };
  const closeOpen = () => { if (open) { const r = open.querySelector('.row'); springTo(r, 0, {damping:1, response:0.3, apply:rowApply(r), done:settle(r, open)}); open.querySelectorAll('[data-sure]').forEach(b => { delete b.dataset.sure; b.textContent = 'Löschen'; }); open = null; } };
  document.addEventListener('touchstart', ev => {
    const t0 = ev.touches[0]; sx = t0.clientX; sy = t0.clientY; mode = null; lpFired = false; hist = []; crossed = false;
    const add = ev.target.closest('.tab-add');
    if (add) { lpTimer = setTimeout(() => { lpFired = true; haptic(); openRepeat(); }, 480); return; }
    wrap = ev.target.closest('#eList .swipe'); row = wrap ? wrap.querySelector('.row') : null;
    if (open && (!wrap || wrap !== open) && !ev.target.closest('.swipe-act')) closeOpen();
  }, {passive:true});
  document.addEventListener('touchmove', ev => {
    clearTimeout(lpTimer);
    const t0 = ev.touches[0], dx = t0.clientX - sx, dy = t0.clientY - sy;
    if (!mode) { if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; mode = row && Math.abs(dx) > Math.abs(dy) * 1.2 ? 'row' : 'scroll'; if (mode === 'row') { wrap.classList.add('live'); sx = t0.clientX; setMotionValue(row, rowX(row)); row._base = rowX(row); } }
    if (mode === 'row') {
      const w = wrap.querySelector('.swipe-act').offsetWidth, raw = row._base + (t0.clientX - sx);
      const x = raw < -w ? -w - rubberband(-w - raw, w) : raw > 0 ? rubberband(raw, w) : raw;   // weicher Rand an beiden Enden
      setMotionValue(row, x); row.style.transform = 'translateX(' + x + 'px)';
      const now = performance.now(); hist.push([x, now]); while (hist.length > 2 && now - hist[0][1] > 90) hist.shift();
      const past = x < -w / 2; if (past !== crossed) { crossed = past; if (past) haptic(); }
    }
  }, {passive:true});
  document.addEventListener('touchend', () => {
    clearTimeout(lpTimer);
    if (mode === 'row' && wrap) {
      const w = wrap.querySelector('.swipe-act').offsetWidth, v = velocityOf(hist), x = rowX(row);
      const target = x + project(v) < -w / 2 ? -w : 0;     // Ziel aus dem Schwung, nicht nur aus der Position
      if (target && open && open !== wrap) closeOpen();
      springTo(row, target, {velocity:v, damping:target ? 0.85 : 1, response:0.32, apply:rowApply(row), done:settle(row, wrap)});
      open = target ? wrap : (open === wrap ? null : open);
    }
    mode = null;
  }, {passive:true});
  // Klick nach Wischen oder langem Drücken unterdrücken
  document.addEventListener('click', ev => {
    if (lpFired && ev.target.closest('.tab-add')) { ev.stopPropagation(); ev.preventDefault(); lpFired = false; return; }
    if (open && ev.target.closest('.swipe > .row')) { ev.stopPropagation(); ev.preventDefault(); closeOpen(); }
  }, true);
  document.addEventListener('contextmenu', ev => { if (ev.target.closest('.tab-add')) ev.preventDefault(); });
})();
/* Einträge-Tab mit gesetzten Filtern öffnen */
function showEntries(f){ Object.assign(S, f); S.tab = 'eintraege'; $('#view').dataset.shell = ''; history.replaceState(null, '', '#eintraege'); render(); window.scrollTo(0, 0); }
/* ---------- Aktionen: data-act am angetippten Element → Funktion ---------- */
const ACTIONS = {
  'tab': t => { S.tab = t.dataset.tab; history.replaceState(null, '', '#' + S.tab); render(); window.scrollTo(0, 0); },
  'sw-del': t => { if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Sicher?'; return; } haptic(); deleteEntries([t.dataset.id]).then(() => toast('Gelöscht')); },
  'sw-settle': t => { const e = S.entries.get(t.dataset.id); haptic(); if (e) saveEntry(Object.assign(clean(e), {pending:false, settledManually:today()})).then(() => toast('Als gebucht markiert')); },
  'goal-add': t => openGoal(null),
  'pers-filter': t => showEntries({fPers:t.dataset.id}),
  'scan-q-stop': t => stopScanQueue(),
  'sub-rule': t => subToRule(t.dataset.key),
  'sub-ign': t => subIgnore(t.dataset.key),
  'taxlist': t => openTaxList(t.dataset.y),
  'warranties': t => openWarranties(),
  'report': t => openReport(),
  'goal-edit': t => openGoal(t.dataset.id),
  'toggle-sec': t => { toggleCollapsed(t.dataset.sec); render(); },
  'repeat': t => { closeSheet(); const e = S.entries.get(t.dataset.id); if (e) setTimeout(() => openEntry(null, {type:e.type, merchant:e.merchant, catId:e.catId, cardId:e.cardId, toCardId:e.toCardId, amount:e.amount, persons:e.persons}), 260); },
  'month': t => { S.month = addMonths(S.month, Number(t.dataset.d)); render(); },
  'stats-nav': t => { if (S.statsMode === 'year') S.statsYear += Number(t.dataset.d); else S.month = addMonths(S.month, Number(t.dataset.d)); render(); },
  'stats-mode': t => { S.statsMode = t.dataset.mode; if (S.statsMode === 'year') S.statsYear = Number(S.month.slice(0, 4)); render(); },
  'add': t => openEntry(null),
  'scan': t => startScanPick(),
  'scan-info': t => scanInfo(),
  'edit': t => openEntry(t.dataset.id),
  'settings': t => openSettings(),
  'card-add': t => openCard(null),
  'card-edit': t => openCard(t.dataset.id),
  'card-rec': t => openReconcile(t.dataset.id),
  'review': t => { try { localStorage.setItem('kb-review-seen', t.dataset.k); } catch (_) {} openReview(t.dataset.k); },
  'filters-reset': t => showEntries({fCat:'', fCard:'', fPers:'', q:'', eDay:''}),
  'cat-entries': t => showEntries({fCat:t.dataset.cat, fCard:'', fPers:'', q:'', eDay:''}),
  'card-entries': t => showEntries({fCard:t.dataset.id, fCat:'', q:''}),
  'budget-edit': t => openBudget(t.dataset.cat),
  'plan-edit': t => openPlanIncome(),
  'close-sheet': t => closeSheet(),
  'examples-load': t => loadExamples(),
  'examples-remove': t => removeExamples(),
  'backup': t => exportData('json', {photos:SET.backupPhotos !== false}),
  'reload': t => location.reload(),
  'rec-edit': t => openRecurring(t.dataset.id),
  'item-hist': t => openItemHistory(t.dataset.key),
  'bank': t => pickBank(),
  'rec-add': t => openEntry(null, {rep:'monthly'}),
  'inbox': t => { if (!SET.inboxSetup) inboxGuide(); else pickInbox(); },
  'inbox-pick': t => pickInbox(),
  'inbox-guide': t => inboxGuide(),
  'inbox-file': t => makeInboxFile(),
};
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const fn = ACTIONS[t.dataset.act]; if (fn) fn(t);
});
document.addEventListener('click', ev => { const b = ev.target.closest('[data-itemm]'); if (!b) return; S.itemMerchant = b.dataset.itemm; render(); });
document.addEventListener('keydown', ev => { if (ev.key !== 'Escape') return; if (!$('#viewer').hidden) $('#viewer').hidden = true; else if (!$('#sheet').hidden) closeSheet(); });
document.addEventListener('click', ev => {
  const img = ev.target.closest('.thumbs img');
  if (img && img.src) { const v = $('#viewer'); v.querySelector('img').src = img.src; v.hidden = false; return; }
  if (ev.target.closest('#viewer')) $('#viewer').hidden = true;
});
/* Dateiauswahl: mehrere Dateien bei Belegen und Bank-PDFs, sonst eine */
for (const [id, many, fn] of [['receiptInput', true, pickScanMode], ['bankInput', true, onBankFiles], ['bankDirInput', true, onBankFiles], ['inboxInput', false, onInboxFile], ['jsonInput', false, onJsonFile], ['csvInput', false, onCsvFile]])
  $('#' + id).addEventListener('change', ev => { const f = [...(ev.target.files || [])]; if (f.length) fn(many ? f : f[0]); });
const fromHash = () => { const h = location.hash.replace('#', ''); if (ROUTES.includes(h)) S.tab = h; };
window.addEventListener('hashchange', () => { fromHash(); render(); });
fromHash();
init();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
/* Update-Hinweis: version.json wird nie gecacht. Weicht sie ab, erscheint ein Banner mit „Neu laden“. */
let lastCheck = 0;
async function checkUpdate(){
  if (Date.now() - lastCheck < 10 * 60 * 1000 || location.protocol !== 'https:') return;
  lastCheck = Date.now();
  try {
    const r = await fetch('version.json?t=' + Date.now(), {cache:'no-store'});
    const v = (await r.json()).version;
    if (v && v !== APP_VERSION && !S.updateReady) { S.updateReady = v; render(); }
  } catch (_) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; checkUpdate(); if (S.ready && S.bookedOn !== today()) bookDue(); });
setTimeout(checkUpdate, 4000);
(() => { try { const seen = localStorage.getItem('kb-version'); if (seen && seen !== APP_VERSION) setTimeout(() => toast('Aktualisiert auf Version ' + APP_VERSION), 800); localStorage.setItem('kb-version', APP_VERSION); } catch (_) {} })();
