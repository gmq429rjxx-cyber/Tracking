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
  let sx = 0, sy = 0, mode = null, row = null, wrap = null, open = null, lpTimer = 0, lpFired = false;
  const closeOpen = () => { if (open) { open.querySelector('.row').style.transform = ''; open.querySelectorAll('[data-sure]').forEach(b => { delete b.dataset.sure; b.textContent = 'Löschen'; }); open = null; } };
  document.addEventListener('touchstart', ev => {
    const t0 = ev.touches[0]; sx = t0.clientX; sy = t0.clientY; mode = null; lpFired = false;
    const add = ev.target.closest('.tab-add');
    if (add) { lpTimer = setTimeout(() => { lpFired = true; if (navigator.vibrate) try { navigator.vibrate(10); } catch (_) {} openRepeat(); }, 480); return; }
    wrap = ev.target.closest('#eList .swipe'); row = wrap ? wrap.querySelector('.row') : null;
    if (open && (!wrap || wrap !== open) && !ev.target.closest('.swipe-act')) closeOpen();
  }, {passive:true});
  document.addEventListener('touchmove', ev => {
    clearTimeout(lpTimer);
    const t0 = ev.touches[0], dx = t0.clientX - sx, dy = t0.clientY - sy;
    if (!mode) { if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; mode = row && Math.abs(dx) > Math.abs(dy) * 1.2 ? 'row' : 'scroll'; if (mode === 'row') wrap.classList.add('drag'); }
    if (mode === 'row') { const w = wrap.querySelector('.swipe-act').offsetWidth, base = open === wrap ? -w : 0; row.style.transform = 'translateX(' + Math.max(-w - 30, Math.min(0, base + dx)) + 'px)'; }
  }, {passive:true});
  document.addEventListener('touchend', ev => {
    clearTimeout(lpTimer);
    const t0 = ev.changedTouches[0], dx = t0.clientX - sx;
    if (mode === 'row' && wrap) {
      wrap.classList.remove('drag'); const w = wrap.querySelector('.swipe-act').offsetWidth, base = open === wrap ? -w : 0;
      if (base + dx < -w / 2) { if (open && open !== wrap) closeOpen(); row.style.transform = 'translateX(' + (-w) + 'px)'; open = wrap; } else { row.style.transform = ''; if (open === wrap) open = null; }
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
/* ---------- events ---------- */
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'tab') { S.tab = t.dataset.tab; history.replaceState(null, '', '#' + S.tab); render(); window.scrollTo(0, 0); }
  else if (a === 'sw-del') { if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Sicher?'; return; } deleteEntries([t.dataset.id]).then(() => toast('Gelöscht')); }
  else if (a === 'sw-settle') { const e = S.entries.get(t.dataset.id); if (e) saveEntry(Object.assign(clean(e), {pending:false, settledManually:today()})).then(() => toast('Als gebucht markiert')); }
  else if (a === 'goal-add') openGoal(null);
  else if (a === 'sub-rule') subToRule(t.dataset.key);
  else if (a === 'sub-ign') subIgnore(t.dataset.key);
  else if (a === 'taxlist') openTaxList(t.dataset.y);
  else if (a === 'warranties') openWarranties();
  else if (a === 'goal-edit') openGoal(t.dataset.id);
  else if (a === 'toggle-sec') { toggleCollapsed(t.dataset.sec); render(); }
  else if (a === 'repeat') { closeSheet(); const e = S.entries.get(t.dataset.id); if (e) setTimeout(() => openEntry(null, {type:e.type, merchant:e.merchant, catId:e.catId, cardId:e.cardId, toCardId:e.toCardId, amount:e.amount}), 260); }
  else if (a === 'month') { S.month = addMonths(S.month, Number(t.dataset.d)); render(); }
  else if (a === 'stats-nav') { if (S.statsMode === 'year') S.statsYear += Number(t.dataset.d); else S.month = addMonths(S.month, Number(t.dataset.d)); render(); }
  else if (a === 'stats-mode') { S.statsMode = t.dataset.mode; if (S.statsMode === 'year') S.statsYear = Number(S.month.slice(0, 4)); render(); }
  else if (a === 'add') openEntry(null);
  else if (a === 'scan') startScanPick();
  else if (a === 'scan-info') scanInfo();
  else if (a === 'edit') openEntry(t.dataset.id);
  else if (a === 'settings') openSettings();
  else if (a === 'card-add') openCard(null);
  else if (a === 'card-edit') openCard(t.dataset.id);
  else if (a === 'card-rec') openReconcile(t.dataset.id);
  else if (a === 'review') openReview(t.dataset.k);
  else if (a === 'card-entries') { S.fCard = t.dataset.id; S.fCat = ''; S.q = ''; S.tab = 'eintraege'; $('#view').dataset.shell = ''; history.replaceState(null, '', '#eintraege'); render(); window.scrollTo(0, 0); }
  else if (a === 'budget-edit') openBudget(t.dataset.cat);
  else if (a === 'close-sheet') closeSheet();
  else if (a === 'examples-load') loadExamples();
  else if (a === 'examples-remove') removeExamples();
  else if (a === 'backup') exportData('json', {photos:SET.backupPhotos !== false});
  else if (a === 'reload') location.reload();
  else if (a === 'rec-edit') openRecurring(t.dataset.id);
  else if (a === 'item-hist') openItemHistory(t.dataset.key);
  else if (a === 'bank') pickBank();
  else if (a === 'rec-add') openEntry(null, {rep:'monthly'});
  else if (a === 'inbox') { if (!SET.inboxSetup) inboxGuide(); else pickInbox(); }
  else if (a === 'inbox-pick') pickInbox();
  else if (a === 'inbox-guide') inboxGuide();
  else if (a === 'inbox-file') makeInboxFile();
});
document.addEventListener('click', ev => { const b = ev.target.closest('[data-itemm]'); if (!b) return; S.itemMerchant = b.dataset.itemm; render(); });
document.addEventListener('keydown', ev => { if (ev.key !== 'Escape') return; if (!$('#viewer').hidden) $('#viewer').hidden = true; else if (!$('#sheet').hidden) closeSheet(); });
document.addEventListener('click', ev => {
  const img = ev.target.closest('.thumbs img');
  if (img && img.src) { const v = $('#viewer'); v.querySelector('img').src = img.src; v.hidden = false; return; }
  if (ev.target.closest('#viewer')) $('#viewer').hidden = true;
});
$('#receiptInput').addEventListener('change', ev => { const f = [...(ev.target.files || [])]; if (f.length) onReceiptFiles(f); });
$('#bankInput').addEventListener('change', ev => { const f = [...(ev.target.files || [])]; if (f.length) onBankFiles(f); });
$('#bankDirInput').addEventListener('change', ev => { const f = [...(ev.target.files || [])]; if (f.length) onBankFiles(f); });
$('#inboxInput').addEventListener('change', ev => { const f = (ev.target.files || [])[0]; if (f) onInboxFile(f); });
$('#jsonInput').addEventListener('change', ev => { const f = (ev.target.files || [])[0]; if (f) onJsonFile(f); });
$('#csvInput').addEventListener('change', ev => { const f = (ev.target.files || [])[0]; if (f) onCsvFile(f); });
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
