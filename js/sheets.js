// Kassabuch – Dialoge: Eintrag, Karte, Budget, Abgleich, Rückblick
'use strict';
/* ---------- sheets ---------- */
let sheetCleanup = null;
function openSheet(title, html, mount){
  if (sheetCleanup) { try { sheetCleanup(); } catch (_) {} sheetCleanup = null; }
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  document.body.style.overflow = 'hidden';
  const sh = document.querySelector('.sheet'); if (sh) sh.scrollTop = 0;
  sheetEnter();
  if (mount) sheetCleanup = mount($('#sheetBody')) || null;
  enhanceDates($('#sheetBody'));
}
/* Datumsfelder: eigene, saubere Anzeige („Sa., 7. Nov. 2026“), darunter das echte iOS-Feld unsichtbar fürs Auswählen */
const DPF = new Intl.DateTimeFormat('de-AT', {weekday:'short', day:'numeric', month:'short', year:'numeric'});
const DPM = new Intl.DateTimeFormat('de-AT', {month:'long', year:'numeric'});
function syncDate(inp){
  const w = inp && inp.closest('.datepick'); if (!w) return;
  const v = inp.value, l = w.querySelector('.dp-label');
  l.textContent = !v ? (inp.dataset.ph || 'Datum wählen') : inp.type === 'month' ? DPM.format(parseISO(v + '-01')) : (w.classList.contains('dp-pill') ? DPF : DAYL).format(parseISO(v));
  w.classList.toggle('dp-empty', !v);
}
function enhanceDates(root){
  root.querySelectorAll('input[type=date], input[type=month]').forEach(inp => {
    if (inp.closest('.datepick')) return;
    const pill = !!inp.closest('.datebar'), w = document.createElement('span');
    w.className = 'datepick ' + (pill ? 'qchip dp-pill' : 'input');
    w.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg><span class="dp-label"></span>';
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp); inp.classList.remove('input');
    if (!inp.dataset.ph && inp.closest('.field') && /optional|bis/i.test((inp.closest('.field').querySelector('span') || {}).textContent || '')) inp.dataset.ph = 'Kein Datum';
    inp.addEventListener('input', () => syncDate(inp)); inp.addEventListener('change', () => syncDate(inp));
    syncDate(inp);
  });
}
function closeSheet(opt){
  if (sheetCleanup) { try { sheetCleanup(); } catch (_) {} sheetCleanup = null; }
  if ($('#sheet').hidden) return;
  sheetLeave(opt && opt.velocity, () => {
    const w = $('#sheet'); w.hidden = true; w.classList.remove('closing'); $('#sheetBody').innerHTML = ''; document.body.style.overflow = '';
    if (S.scanQ && !S.scanQ.busy) setTimeout(() => { if (S.scanQ && !sheetOpen()) nextScan(); }, 120);
  });
}
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3800); }

const lastCard = { get(){ try { return localStorage.getItem('kb-last-card') || ''; } catch (_) { return ''; } }, set(v){ try { localStorage.setItem('kb-last-card', v); } catch (_) {} } };

function catOptions(type, sel){ return cats().filter(c => catFits(c, type)).map(c => '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + (type === 'income' && c.saving ? 'Entnahme ' : '') + esc(c.name) + '</option>').join(''); }
/* Inaktiv = "aktiv bis" liegt vor heute; Buchungen bleiben erhalten */
const isInactive = c => !!(c && c.activeUntil && c.activeUntil < today());
const activeCards = keep => S.profile.cards.filter(c => !isInactive(c) || c.id === keep);
function cardOptions(sel){ return activeCards(sel).map(c => '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + (c.last4 ? ' (' + esc(c.last4) + ')' : '') + '</option>').join('') + '<option value=""' + (!sel ? ' selected' : '') + '>Ohne Karte</option>'; }

function merchantIndex(){
  const m = new Map();
  for (const e of allEntries()) {
    if ((e.type !== 'expense' && e.type !== 'income') || !e.merchant) continue;
    const k = e.type + ':' + (normMerchant(e.merchant) || e.merchant.toLowerCase());
    const o = m.get(k) || {n:0, last:''}; o.n++;
    if ((e.date || '') >= o.last) Object.assign(o, {last:e.date || '', merchant:e.merchant, catId:e.catId, cardId:e.cardId, amount:e.amount, type:e.type});
    m.set(k, o);
  }
  return [...m.values()];
}
function topCats(type, n){
  const from = isoOf(new Date(Date.now() - 120 * 864e5)), cnt = {};
  for (const e of allEntries()) if (e.type === type && e.date >= from) cnt[e.catId] = (cnt[e.catId] || 0) + 1;
  const ranked = Object.keys(cnt).filter(id => cats().some(c => c.id === id && catFits(c, type))).sort((a, b) => cnt[b] - cnt[a]);
  for (const c of cats()) if (catFits(c, type) && !ranked.includes(c.id)) ranked.push(c.id);
  return ranked.slice(0, n);
}
function entryFormHTML(d){
  const amt = d.amount != null && d.amount !== '' ? (d.amount / 100).toFixed(2).replace('.', ',') : '';
  return '<form id="entryForm" style="display:flex;flex-direction:column;gap:14px" novalidate>' +
    '<div class="seg" role="radiogroup" aria-label="Art"><input type="radio" name="ftype" id="ft-exp" value="expense"' + (d.type !== 'income' && d.type !== 'transfer' ? ' checked' : '') + '><label for="ft-exp">Ausgabe</label><input type="radio" name="ftype" id="ft-inc" value="income"' + (d.type === 'income' ? ' checked' : '') + '><label for="ft-inc">Einnahme</label><input type="radio" name="ftype" id="ft-trf" value="transfer"' + (d.type === 'transfer' ? ' checked' : '') + '><label for="ft-trf">Umbuchung</label></div>' +
    '<label class="field"><span>Betrag</span><span class="amount-wrap"><b>€</b><input class="input amount" id="f-amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + esc(amt) + '"></span></label>' +
    '<div class="field" id="f-merchant-f"' + (d.type === 'transfer' ? ' hidden' : '') + '><label for="f-merchant"><span>Händler oder Zahler</span></label><input class="input" id="f-merchant" autocomplete="off" autocorrect="off" value="' + esc(d.merchant || '') + '" placeholder="z. B. Billa"><div class="chips" id="f-sugg" aria-label="Vorschläge"></div></div>' +
    '<div class="field" id="f-cat-f"' + (d.type === 'transfer' ? ' hidden' : '') + '><label for="f-cat"><span>Kategorie</span></label><div class="chips wrap" id="f-catchips"></div><div class="catall" id="f-catall" hidden></div><div class="impact" id="f-impact" hidden></div><select class="visually-hidden" id="f-cat" tabindex="-1" aria-hidden="true">' + catOptions(d.type === 'income' ? 'income' : 'expense', d.catId) + '</select></div>' +
    (persons().length ? '<div class="field" id="f-pers-f"><span>Für wen</span><div class="chips wrap" id="f-perschips">' + persons().map(p => '<button type="button" class="qchip" data-pers="' + esc(p.id) + '" aria-pressed="' + (d.persons || []).includes(p.id) + '"><i class="dot" style="--c:var(--c' + (p.color % 20) + ')"></i>' + esc(p.name) + '</button>').join('') + '</div></div>' : '') +
    '<div class="formgrid"><div class="field full"><span>Datum</span><div class="datebar"><button type="button" class="qchip" data-day="0">Heute</button><button type="button" class="qchip" data-day="1">Gestern</button><input class="input" type="date" id="f-date" value="' + esc(d.date || today()) + '" aria-label="Datum"></div></div>' +
    '<div class="field full"><span id="f-card-l">' + (d.type === 'transfer' ? 'Von' : 'Karte') + '</span><div class="chips wrap" id="f-cardchips"></div><select class="visually-hidden" id="f-card" tabindex="-1" aria-hidden="true">' + cardOptions(d.cardId) + '</select></div>' +
    '<label class="field full" id="f-to-f"' + (d.type === 'transfer' ? '' : ' hidden') + '><span>Nach</span><select class="input" id="f-to">' + cardOptions(d.toCardId || '') + '</select></label>' +
    '<p class="note full" id="f-trf-note" style="margin:0"' + (d.type === 'transfer' ? '' : ' hidden') + '>Umbuchungen zählen weder als Ausgabe noch als Einnahme, z. B. Kreditkarten-Abrechnung vom Girokonto oder Bankomat-Abhebung.</p>' +
    '<label class="field full"><span>Notiz</span><input class="input" id="f-note" autocomplete="off" value="' + esc(d.note === 'Beispiel' && d.example ? 'Beispiel' : (d.note || '')) + '"></label>' +
    (d.recurringId && S.profile.recurring.some(r => r.id === d.recurringId)
      ? '<p class="note full" style="margin:0">Gebucht aus einem Dauerauftrag. <button type="button" class="linkbtn" data-act="rec-edit" data-id="' + esc(d.recurringId) + '">Dauerauftrag bearbeiten</button></p>'
      : '<details class="more full"' + (d.rep ? ' open' : '') + '><summary>Wiederholen</summary><label class="field" style="margin-top:8px"><span class="visually-hidden">Wiederholen</span><select class="input" id="f-rep"><option value="">Nein, einmalig</option>' + Object.entries(FREQ).map(([k, v]) => '<option value="' + k + '"' + (d.rep === k ? ' selected' : '') + '>' + v.charAt(0).toUpperCase() + v.slice(1) + ' als Dauerauftrag</option>').join('') + '</select></label><p class="note full" id="f-rep-note" style="margin:0" hidden>Wird ab diesem Datum automatisch gebucht. Verpasste Termine bis heute werden nachgebucht.</p>') +
    '</div>' +
    (d.type !== 'transfer' ? '<details class="more"' + (d.tax || d.warrantyUntil ? ' open' : '') + ' id="f-extra"><summary>Steuer und Garantie' + (d.tax ? ' · ' + esc(TAX[d.tax]) : '') + (d.warrantyUntil ? ' · Garantie' : '') + '</summary><div class="formgrid" style="margin-top:8px">' +
      '<label class="field"><span>Für die Steuer</span><select class="input" id="f-tax"><option value="">–</option>' + Object.entries(TAX).map(([k, v]) => '<option value="' + k + '"' + (d.tax === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Garantie bis</span><input class="input" type="date" id="f-warr" value="' + esc(d.warrantyUntil || '') + '"></label></div>' +
      '<div class="chips" style="margin-top:8px"><button type="button" class="qchip" data-warr="24">+ 2 Jahre</button><button type="button" class="qchip" data-warr="36">+ 3 Jahre</button><button type="button" class="qchip" data-warr="0">keine</button></div></details>' : '') +
    (d.receipts && d.receipts.some(r => r.blobId) ? '<div class="field"><span>Beleg</span><div class="thumbs">' + d.receipts.filter(r => r.blobId).map(r => r.pdf ? '<a class="pdftile" data-blob-link="' + esc(r.blobId) + '" target="_blank" rel="noopener">PDF</a>' : '<img alt="Beleg" data-blob="' + esc(r.blobId) + '">').join('') + '</div></div>' : '') +
    (d.items && d.items.length ? '<details class="field"><summary>Artikel (' + d.items.length + ')</summary><div class="tablewrap"><table><tbody>' + d.items.map(i => '<tr><td style="white-space:normal">' + esc(i.n) + (i.q > 1 ? ' <span class="muted">×' + esc(String(i.q).replace('.', ',')) + '</span>' : '') + '</td><td class="muted">' + esc(i.g) + '</td><td class="r">' + money(i.t) + '</td></tr>').join('') + '</tbody></table></div></details>' : '') +
    (d.fx && d.fx.original ? '<p class="note" style="margin:0">Fremdwährung: ' + esc(d.fx.original) + (d.fx.markup ? ' · Kursaufschlag ' + esc(String(d.fx.markup).replace('.', ',')) + ' %' : '') + '</p>' : '') +
    '<p class="note" id="f-err" role="alert" hidden></p>' +
    (d.id && S.entries.has(d.id) ? '<p class="note" style="margin:0;text-align:center">ID ' + txId(d) + '</p>' : '') + '<div id="f-confirm"></div><div class="formfoot"><div class="btnrow"><button type="submit" class="btn primary" id="f-save" style="flex:1">Speichern</button>' + (d.id && S.entries.has(d.id) ? '<button type="button" class="btn danger" id="f-del">Löschen</button>' : '') + '</div></div></form>';
}
function mountEntryForm(root, draft, opts){
  opts = opts || {};
  hydrateBlobs(root);
  const form = $('#entryForm', root);
  const typeVal = () => (form.querySelector('input[name="ftype"]:checked') || {}).value || 'expense';
  const syncType = () => {
    const t = typeVal(), tr = t === 'transfer';
    $('#f-to-f', root).hidden = !tr; $('#f-trf-note', root).hidden = !tr; $('#f-cat-f', root).hidden = tr; $('#f-merchant-f', root).hidden = tr;
    $('#f-card-l', root).textContent = tr ? 'Von' : 'Karte'; renderCardChips();
    if (!tr) { $('#f-cat', root).innerHTML = catOptions(t, t === 'income' ? 'einnahmen' : 'sonstiges'); renderCatChips(); renderSugg(); }
  };
  /* Schnelleingabe: häufige Kategorien als Chips, Händler-Vorschläge aus der eigenen Historie */
  const idx = merchantIndex();
  const amountEl = $('#f-amount', root), merchEl = $('#f-merchant', root), catEl = $('#f-cat', root), cardEl = $('#f-card', root);
  function renderCatChips(){
    const t = typeVal(); if (t === 'transfer') return;
    const top = topCats(t, 6), cur = catEl.value;
    if (cur && !top.includes(cur)) top.unshift(cur);
    const chip = id => { const c = catById(id); return '<button type="button" class="qchip" data-cat="' + esc(id) + '" aria-pressed="' + (id === cur) + '"><i class="dot" style="--c:var(--c' + (c.color % 20) + ')"></i>' + (t === 'income' && c.saving ? 'Entnahme ' : '') + esc(c.name) + '</button>'; };
    const all = $('#f-catall', root), open = !all.hidden;
    $('#f-catchips', root).innerHTML = top.slice(0, 6).map(chip).join('') + '<button type="button" class="qchip" id="f-catmore" aria-expanded="' + open + '">' + (open ? 'Weniger' : 'Alle …') + '</button>';
    renderImpact();
    if (open) {
      const gOf = c => t === 'income' && c.saving ? 'Entnahme aus dem Ersparten' : (c.group || '');
      const list = cats().filter(c => catFits(c, t)), order = (S.profile.groups || []).concat([...new Set(list.map(gOf))]).filter((g, i, a) => a.indexOf(g) === i && list.some(c => gOf(c) === g));
      all.innerHTML = order.map(g => { const cs = list.filter(c => gOf(c) === g); return cs.length ? '<div><h4>' + esc(g || (t === 'income' ? 'Einnahmen' : 'Weitere')) + '</h4><div class="chips wrap" style="margin-top:6px">' + cs.map(c => chip(c.id)).join('') + '</div></div>' : ''; }).join('');
    }
  }
  function renderImpact(){
    const box = $('#f-impact', root); if (!box) return;
    const cid = catEl.value, c = catById(cid), b = S.profile.budgets[cid];
    if (typeVal() !== 'expense' || !b || !c || c.saving) { box.hidden = true; return; }
    const k = mkey($('#f-date', root).value || today()), amt = Math.abs(toCents(amountEl.value) || 0);
    const sp = entriesIn(k).filter(e => e.type === 'expense' && e.catId === cid && e.id !== draft.id).reduce((a, e) => a + e.amount, 0);
    const after = sp + amt, st = catState(c, after, b, paceOf(k)), left = b - after;
    box.hidden = false; box.className = 'impact ' + (st === 'done' ? 'ok' : st === 'open' ? '' : st);
    box.innerHTML = '<span>' + esc(c.name) + (amt ? ' danach' : '') + ': ' + money0(after) + ' / ' + money0(b) + '</span><b>' + (left >= 0 ? 'noch ' + money0(left) : money0(-left) + ' drüber') + '</b>';
  }
  function renderCardChips(){
    const cur = cardEl.value;
    $('#f-cardchips', root).innerHTML = activeCards(cur).map(c => '<button type="button" class="qchip" data-card="' + esc(c.id) + '" aria-pressed="' + (c.id === cur) + '"><i class="cardglyph" style="--c:var(--c' + (c.color % 20) + ');width:18px;height:12px;border-radius:3px"></i>' + esc(c.name) + '</button>').join('') +
      (typeVal() === 'transfer' ? '' : '<button type="button" class="qchip" data-card="" aria-pressed="' + (!cur) + '">Ohne</button>');
  }
  function renderDay(){ renderImpact(); syncDate($('#f-date', root)); const v = $('#f-date', root).value; root.querySelectorAll('[data-day]').forEach(b => { const d = new Date(); d.setDate(d.getDate() - Number(b.dataset.day)); b.setAttribute('aria-pressed', String(isoOf(d) === v)); }); }
  function renderSugg(){
    const t = typeVal(), q = merchEl.value.trim().toLowerCase();
    let list = idx.filter(m => m.type === t);
    if (q) list = list.filter(m => m.merchant.toLowerCase().includes(q) && m.merchant.toLowerCase() !== q);
    list = list.sort((a, b) => b.n - a.n || (b.last || '').localeCompare(a.last || '')).slice(0, 6);
    $('#f-sugg', root).innerHTML = (q || !draft.id) ? list.map((m, i) => '<button type="button" class="qchip" data-sugg="' + i + '">' + esc(m.merchant) + ' <small>' + money(m.amount) + '</small></button>').join('') : '';
    $('#f-sugg', root).onclick = ev => {
      const b = ev.target.closest('[data-sugg]'); if (!b) return;
      const m = list[Number(b.dataset.sugg)];
      merchEl.value = m.merchant;
      if (cats().some(c => c.id === m.catId && catFits(c, t))) catEl.value = m.catId;
      if (m.cardId && cardById(m.cardId)) cardEl.value = m.cardId;
      renderCatChips(); renderCardChips(); $('#f-sugg', root).innerHTML = '';
      if (!amountEl.value.trim()) { amountEl.value = (m.amount / 100).toFixed(2).replace('.', ','); amountEl.focus(); amountEl.select(); }
    };
  }
  const pickCat = ev => { if (ev.target.closest('#f-catmore')) { $('#f-catall', root).hidden = !$('#f-catall', root).hidden; renderCatChips(); return; } const b = ev.target.closest('[data-cat]'); if (!b) return; catEl.value = b.dataset.cat; $('#f-catall', root).hidden = true; renderCatChips(); };
  $('#f-catchips', root).addEventListener('click', pickCat); $('#f-catall', root).addEventListener('click', pickCat);
  $('#f-cardchips', root).addEventListener('click', ev => { const b = ev.target.closest('[data-card]'); if (!b) return; cardEl.value = b.dataset.card; renderCardChips(); });
  root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { const d = new Date(); d.setDate(d.getDate() - Number(b.dataset.day)); $('#f-date', root).value = isoOf(d); renderDay(); }));
  $('#f-date', root).addEventListener('change', renderDay);
  catEl.addEventListener('change', renderCatChips);
  merchEl.addEventListener('input', renderSugg);
  merchEl.addEventListener('change', () => {
    const v = merchEl.value.trim().toLowerCase(), m = idx.find(x => x.type === typeVal() && x.merchant.toLowerCase() === v);
    if (m && !draft.id) { if (cats().some(c => c.id === m.catId)) catEl.value = m.catId; if (m.cardId && cardById(m.cardId)) cardEl.value = m.cardId; renderCatChips(); renderCardChips(); }
  });
  renderCatChips(); renderSugg(); renderCardChips(); renderDay();
  amountEl.addEventListener('input', renderImpact);
  const pc = $('#f-perschips', root);
  if (pc) {
    pc.addEventListener('click', ev => { const b = ev.target.closest('[data-pers]'); if (!b) return; b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); pc.dataset.touched = '1'; });
    const mi = $('#f-merchant', root); if (mi && !draft.id) mi.addEventListener('change', () => { if (pc.dataset.touched) return; const ids = personsFor(mi.value); pc.querySelectorAll('[data-pers]').forEach(b => b.setAttribute('aria-pressed', String(ids.includes(b.dataset.pers)))); });
  }
  root.querySelectorAll('[data-warr]').forEach(b => b.addEventListener('click', () => { const m = Number(b.dataset.warr), w = $('#f-warr', root); if (!m) { w.value = ''; syncDate(w); return; } const d0 = parseISO($('#f-date', root).value || today()); d0.setMonth(d0.getMonth() + m); w.value = isoOf(d0); syncDate(w); }));
  const repEl = $('#f-rep', root);
  if (repEl) { const sr = () => { $('#f-rep-note', root).hidden = !repEl.value; }; repEl.addEventListener('change', sr); sr(); }
  form.querySelectorAll('input[name="ftype"]').forEach(r => r.addEventListener('change', syncType));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#f-err', root);
    const cents = toCents($('#f-amount', root).value);
    if (cents == null || cents === 0) { err.hidden = false; err.textContent = 'Bitte einen Betrag eingeben, z. B. 12,50.'; $('#f-amount', root).focus(); return; }
    const date = $('#f-date', root).value;
    if (!validISO(date)) { err.hidden = false; err.textContent = 'Bitte ein gültiges Datum wählen.'; return; }
    const type = typeVal();
    if (type === 'transfer') {
      const a = $('#f-card', root).value, b = $('#f-to', root).value;
      if (!a || !b) { err.hidden = false; err.textContent = 'Für eine Umbuchung bitte beide Karten wählen.'; return; }
      if (a === b) { err.hidden = false; err.textContent = 'Von- und Nach-Karte müssen verschieden sein.'; return; }
    }
    err.hidden = true;
    const btn = $('#f-save', root); btn.disabled = true; btn.textContent = 'Speichert …';
    const e = Object.assign({}, draft, {
      id:draft.id || newId(), type, amount:Math.abs(cents), date, cardId:$('#f-card', root).value || '', note:$('#f-note', root).value.trim()
    });
    if (type === 'transfer') { e.toCardId = $('#f-to', root).value; e.catId = ''; e.merchant = ''; delete e.tax; delete e.warrantyUntil; }
    else { delete e.toCardId; e.catId = $('#f-cat', root).value; e.merchant = $('#f-merchant', root).value.trim(); }
    if (type !== 'transfer' && persons().length) { const ps = [...root.querySelectorAll('#f-perschips [aria-pressed="true"]')].map(b => b.dataset.pers); if (ps.length) e.persons = ps; else delete e.persons; }
    if (type === 'transfer') delete e.persons;
    if (type !== 'transfer') { const tx = $('#f-tax', root), wa = $('#f-warr', root); if (tx) { if (tx.value) e.tax = tx.value; else delete e.tax; } if (wa) { if (wa.value) e.warrantyUntil = wa.value; else delete e.warrantyUntil; } }
    if (e.example && e.note !== 'Beispiel') delete e.example;
    const rep = repEl ? repEl.value : '';
    try {
      if (opts.beforeSave) await opts.beforeSave(e, btn);
      if (e.merchant && e.persons && e.persons.length && e.type !== 'transfer') { const k = pKey(e.merchant), cur = (S.profile.personAlias || {})[k]; if (!cur || cur.join() !== e.persons.join()) { const p = clean(S.profile); p.personAlias = p.personAlias || {}; p.personAlias[k] = e.persons; await saveProfile(p); } }
      if (rep) {
        const rule = {id:'r-' + newId(), type:e.type, amount:e.amount, catId:e.catId || '', cardId:e.cardId, toCardId:e.toCardId || null, merchant:e.merchant || '', note:e.note || '', freq:rep, day:rep === 'weekly' ? null : parseISO(e.date).getDate(), startDate:e.date, lastBooked:e.date, endDate:null, active:true};
        e.recurringId = rule.id; e.importKey = 'rec:' + rule.id + ':' + e.date;
        const p = clean(S.profile); p.recurring.push(rule); await saveProfile(p);
      }
      await saveEntry(e);
      if (rep) await bookDue(true);
      if (e.cardId) lastCard.set(e.cardId);
      closeSheet();
      toast(opts.savedMsg || 'Gespeichert'); haptic();
    } catch (x) {
      err.hidden = false; err.textContent = writeErr(x); btn.disabled = false; btn.textContent = 'Speichern';
    }
  });
  const del = $('#f-del', root);
  if (del) del.addEventListener('click', () => {
    $('#f-confirm', root).innerHTML = '<div class="confirm"><strong>Eintrag wirklich löschen?</strong><div class="btnrow"><button type="button" class="btn danger small" id="f-del-yes">Ja, löschen</button><button type="button" class="btn small" id="f-del-no">Abbrechen</button></div></div>';
    $('#f-del-no', root).onclick = () => { $('#f-confirm', root).innerHTML = ''; };
    $('#f-del-yes', root).onclick = async () => { try { await deleteEntry(draft.id); closeSheet(); toast('Gelöscht'); } catch (x) { toast(writeErr(x)); } };
  });
}
/* Herkunft einer Buchung: Bank-PDF, Bon, Apple Pay, manuell */
const hasBank = e => !!(e.bankKeys && e.bankKeys.length);
const hasBon = e => !!((e.receipts && e.receipts.length) || (e.items && e.items.length));
function originTxt(e){ const t = []; if (hasBank(e)) t.push('Bank-PDF'); if (hasBon(e)) t.push('Bon'); if (!t.length) t.push(e.source === 'applepay' ? 'Apple Pay' : 'manuell'); return t.join(' + '); }
const TAX = {wk:'Werbungskosten', sa:'Sonderausgaben', agb:'Außergewöhnliche Belastung', kb:'Kinderbetreuung'};
function openTaxList(year){
  const l = allEntries().filter(e => e.tax && e.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date));
  const sum = {}; for (const e of l) sum[e.tax] = (sum[e.tax] || 0) + (e.type === 'income' ? -e.amount : e.amount);
  openSheet('Steuerbelege ' + year,
    (l.length ? '<div class="facts">' + Object.keys(TAX).filter(k => sum[k]).map(k => '<div><span>' + TAX[k] + '</span><strong>' + money(sum[k]) + '</strong></div>').join('') + '</div>' +
      '<div class="list">' + l.map(e => entryRow(e, true)).join('') + '</div><button class="btn primary" id="tx-csv" style="width:100%">Als CSV exportieren</button>' : '<div class="list"><div class="empty">Noch keine Belege für ' + year + ' markiert. Im Eintrag unter „Steuer und Garantie“ auswählen.</div></div>') +
    '<p class="note" style="margin:0">Für die Arbeitnehmerveranlagung in FinanzOnline. Spenden und Kirchenbeitrag melden die Organisationen meist selbst ans Finanzamt. Belege aufbewahren – das Finanzamt kann sie anfordern; die Fotos liegen beim Eintrag und im Backup.</p>',
    root => { const b = $('#tx-csv', root); if (b) b.onclick = () => { const rows = [['ID', 'Datum', 'Art', 'Händler', 'Betrag', 'Notiz']].concat(l.map(e => [txId(e), e.date, TAX[e.tax], e.merchant || '', ((e.type === 'income' ? -e.amount : e.amount) / 100).toFixed(2).replace('.', ','), e.note || ''])); deliverFile('steuerbelege-' + year + '.csv', '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n'), 'text/csv'); }; });
}
function warrantyList(){ const t = today(); return allEntries().filter(e => e.warrantyUntil && e.warrantyUntil >= t).sort((a, b) => a.warrantyUntil.localeCompare(b.warrantyUntil)); }
function openWarranties(){
  const l = warrantyList();
  openSheet('Garantien', (l.length ? '<div class="list">' + l.map(e => '<button class="row" data-act="edit" data-id="' + esc(e.id) + '">' + badge(catById(e.catId)) + '<span class="row-main"><span class="row-title">' + esc(e.merchant || catById(e.catId).name) + (e.note ? ' · ' + esc(e.note) : '') + '</span><span class="row-sub">gekauft ' + esc(DAYL.format(parseISO(e.date))) + ' · bis ' + esc(DAYL.format(parseISO(e.warrantyUntil))) + '</span></span><span class="row-amt">' + money(e.amount) + '<small>' + Math.max(0, dayDiff(e.warrantyUntil, today())) + ' Tage</small></span></button>').join('') + '</div>' : '<div class="list"><div class="empty">Keine laufenden Garantien. Im Eintrag unter „Steuer und Garantie“ eintragen; beim Scan schlägt die KI sie für Elektronik und Geräte vor.</div></div>') +
    '<p class="note" style="margin:0">In der EU gilt beim Händler mindestens 2 Jahre Gewährleistung. Die Erinnerung erscheint 60 Tage vor Ablauf in der Übersicht.</p>');
}
function originHTML(e){
  const disc = entryDiscount(e);
  const chips = (hasBank(e) ? '<span class="chip ok">Bank-PDF</span>' : '') + (hasBon(e) ? '<span class="chip ok">Bon</span>' : '') + (!hasBank(e) && !hasBon(e) ? '<span class="chip info">' + esc(originTxt(e)) + '</span>' : '');
  return '<div class="panel" style="flex-direction:row;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="note">Quelle</span><span style="display:flex;gap:6px;flex-wrap:wrap">' + chips + (disc ? '<span class="chip ok">Rabatt ' + money(disc) + '</span>' : '') + (e.ai && e.ai.status ? verdictChip(e.ai.status) : '') + '</span>' +
    /* Gründe der Belegprüfung auch später sichtbar, nicht nur direkt nach dem Scan */
    (e.ai && e.ai.status && e.ai.status !== 'ok' && (e.ai.findings || []).length ? '<ul class="findings">' + e.ai.findings.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul>' : '') + '</div>';
}
/* Gleicher Betrag (±0,05), ±3 Tage, eine Seite Bank-PDF, die andere nicht */
function findDuplicate(e){
  if (e.type !== 'expense' && e.type !== 'income') return null;
  return allEntries().filter(x => x.id !== e.id && x.type === e.type && Math.abs(x.amount - e.amount) <= 5 && validISO(x.date) && Math.abs(dayDiff(x.date, e.date)) <= 3 && hasBank(x) !== hasBank(e) && !x.recurringId === !e.recurringId)
    .sort((a, b) => Math.abs(dayDiff(a.date, e.date)) - Math.abs(dayDiff(b.date, e.date)))[0] || null;
}
async function mergeDuplicate(a, b){
  const bank = hasBank(a) ? a : b, other = bank === a ? b : a;
  const m = Object.assign(clean(other), {
    date:bank.date, amount:bank.amount, cardId:bank.cardId || other.cardId, pending:!!bank.pending,
    bankKeys:(other.bankKeys || []).concat(bank.bankKeys), importKey:bank.importKey || other.importKey, bank:bank.bank,
    receipts:(other.receipts || []).concat(bank.receipts || []), note:other.note || bank.note
  });
  if (!m.merchant) m.merchant = bank.merchant;
  const bk = S.entries.get(bank.id); if (bk) bk.receipts = [];
  await saveEntry(m); await deleteEntries([bank.id]);
  closeSheet(); toast('Zu einer Buchung zusammengeführt');
}
function openEntry(id, preset){
  const e = id ? S.entries.get(id) : null;
  const draft = e ? clean(e) : {persons:personsFor(''), rep:preset && preset.rep, type:'expense', date:(S.month === mkey(today()) ? today() : S.month + '-01'), catId:'lebensmittel', cardId:lastCard.get() && cardById(lastCard.get()) ? lastCard.get() : ((S.profile.cards[0] || {}).id || '')};
  if (!e && preset && preset.type) { for (const f of ['type', 'merchant', 'catId', 'cardId', 'toCardId', 'amount', 'persons']) if (preset[f] != null) draft[f] = preset[f]; if (draft.cardId && isInactive(cardById(draft.cardId))) draft.cardId = ''; }
  let top = '';
  if (!e) top = '<button class="btn" data-act="scan" style="width:100%">' + ICON.camera + 'Stattdessen Beleg scannen</button>';
  if (e && (hasBank(e) || hasBon(e) || e.source === 'applepay' || (e.ai && e.ai.status))) top = originHTML(e);
  if (e && e.pending) { const d = Math.max(0, -dayDiff(e.date, today())); top += '<div class="panel" style="flex-direction:row;align-items:center;justify-content:space-between;gap:10px"><span class="note">Vorgemerkt' + (d ? ' · ' + d + (d === 1 ? ' Tag' : ' Tage') : '') + '</span><button type="button" class="btn small" style="white-space:nowrap" id="pend-ok">Als gebucht markieren</button></div>'; }
  const dup = e ? findDuplicate(e) : null;
  if (dup) top += '<div class="panel"><h3>Mögliches Duplikat</h3><p class="note" style="margin:0">' + esc(dup.merchant || catById(dup.catId).name) + ' · ' + money(dup.amount) + ' · ' + esc(DAY.format(parseISO(dup.date))) + ' · ' + esc(originTxt(dup)) + '</p><button class="btn primary" type="button" id="dup-merge">Zu einer Buchung zusammenführen</button></div>';
  openSheet(e ? 'Eintrag bearbeiten' : (preset && preset.rep ? 'Neuer Dauerauftrag' : 'Neuer Eintrag'), top + entryFormHTML(draft), root => { const po = $('#pend-ok', root); if (po) po.onclick = async () => { await saveEntry(Object.assign(clean(e), {pending:false, settledManually:today()})); closeSheet(); toast('Als gebucht markiert'); }; const dm = $('#dup-merge', root); if (dm) dm.onclick = () => mergeDuplicate(e, dup); mountEntryForm(root, draft); if (!e) setTimeout(() => { const a = $('#f-amount', root); if (a) a.focus({preventScroll:true}); }, 60); });
}

/* budgets */
/* Differenz genau einer Buchung zuordnen: doppelt erfasst oder doppelt abgezogen? */
function diffHint(id, d){
  const amt = Math.abs(d), since = addDays(today(), -21);
  const hits = allEntries().filter(e => (e.cardId === id || e.toCardId === id) && e.amount === amt && e.date >= since).sort((a, b) => b.date.localeCompare(a.date));
  if (!hits.length) return '';
  const cd = cardById(id), same = hits.filter(e => e.date === cd.startDate && cd.startAt && (e.createdAt || '') > cd.startAt);
  const line = e => '<button class="row" data-act="edit" data-id="' + esc(e.id) + '"><span class="row-main"><span class="row-title">' + esc(e.merchant || catById(e.catId).name) + '</span><span class="row-sub">' + esc(DAYL.format(parseISO(e.date))) + ' · ' + esc(originTxt(e)) + '</span></span><span class="row-amt">' + money(e.amount) + '</span></button>';
  const why = hits.length > 1 ? 'Die Differenz entspricht einer Buchung, die ' + hits.length + '× vorhanden ist – vermutlich doppelt. Eine davon löschen oder zusammenführen.'
    : same.length ? 'Die Differenz entspricht einer Buchung, die nach dem Eintragen des Stands am selben Tag erfasst wurde – sie war im Bank-Stand vermutlich schon enthalten. Dann „Stand übernehmen“.'
    : 'Die Differenz entspricht genau dieser Buchung. Prüfen, ob sie falsch oder doppelt ist.';
  return '<div class="panel" style="margin-top:10px"><h3>Passt genau zu</h3><p class="note" style="margin:0">' + why + '</p><div class="list">' + hits.slice(0, 4).map(line).join('') + '</div></div>';
}
function openReconcile(id){
  const cd = cardById(id); if (!cd) return;
  const credit = cd.kind === 'credit', st = cardStatus(cd), appRaw = cardBalance(cd) || 0;
  const recent = allEntries().filter(e => e.cardId === id || e.toCardId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  openSheet('Abgleich: ' + cd.name,
    '<div class="facts"><div><span>Laut App ' + (credit ? 'offen' : 'Stand') + '</span><strong>' + money(st.v) + '</strong></div><div><span>Zuletzt abgeglichen</span><strong>' + (cd.reconciled ? esc(DAYL.format(parseISO(cd.reconciled))) : '–') + '</strong></div></div>' +
    '<label class="field"><span>' + (credit ? 'Offen laut Bank-App' : 'Stand laut Bank-App') + '</span><span class="amount-wrap"><b>€</b><input class="input amount" id="rc-v" inputmode="decimal" placeholder="0,00"></span></label>' +
    '<div id="rc-diff"></div>' +
    (recent.length ? '<section class="block"><div class="block-head"><h2>Letzte Buchungen</h2></div><div class="list">' + recent.map(e => entryRow(e, true)).join('') + '</div></section>' : '') +
    '<div class="formfoot"><button class="btn primary" id="rc-ok" style="width:100%" disabled>Stand übernehmen</button></div>',
    root => {
      const inp = $('#rc-v', root), box = $('#rc-diff', root), ok = $('#rc-ok', root);
      const val = () => { const v = toCents(inp.value); return v == null ? null : (credit ? -Math.abs(v) : v); };
      inp.addEventListener('input', () => {
        const v = val(); ok.disabled = v == null; if (v == null) { box.innerHTML = ''; return; }
        const d = v - appRaw;
        box.innerHTML = d === 0 ? '<div class="impact ok"><span>Stimmt überein</span><b>✓ 0,00</b></div>'
          : '<div class="impact warn"><span>' + (d < 0 ? 'Bank zeigt weniger – fehlen Ausgaben?' : 'Bank zeigt mehr – fehlen Einnahmen oder doppelt gebucht?') + '</span><b>' + money(Math.abs(d)) + '</b></div><p class="note" style="margin:6px 0 0">Am besten zuerst fehlende Bank-PDFs importieren. „Stand übernehmen“ setzt den Stand ab heute neu, ohne Buchungen zu ändern.</p>' + diffHint(id, d);
        ok.textContent = d === 0 ? 'Als abgeglichen markieren' : 'Stand übernehmen';
      });
      ok.onclick = async () => {
        const v = val(); if (v == null) return;
        const p = clean(S.profile), c = p.cards.find(x => x.id === id);
        if (v !== appRaw) { c.startBalance = v; c.startDate = today(); c.startAt = new Date().toISOString(); }
        c.reconciled = today(); await saveProfile(p); closeSheet(); toast(v === appRaw ? 'Abgeglichen' : 'Stand übernommen');
      };
      setTimeout(() => inp.focus({preventScroll:true}), 250);
    });
}
/* ---------- Monatsrückblick ---------- */
function openReview(k){
  const list = entriesIn(k), s = sums(list), sp = spentByCat(list), prev = sums(entriesIn(addMonths(k, -1)));
  const exp = cats().filter(c => c.kind === 'expense'), groups = (S.profile.groups || []).concat([...new Set(exp.map(c => c.group || ''))]).filter((g, i, a) => a.indexOf(g) === i);
  const rows = groups.map(g => { const cs = exp.filter(c => (c.group || '') === g); const plan = cs.reduce((a, c) => a + (S.profile.budgets[c.id] || 0), 0), ist = cs.reduce((a, c) => a + (sp[c.id] || 0), 0); return {g:g || 'Ohne Gruppe', plan, ist, sav:cs.length && cs.every(c => c.saving)}; }).filter(r => r.plan || r.ist);
  const over = exp.filter(c => S.profile.budgets[c.id] && !c.saving && (sp[c.id] || 0) > S.profile.budgets[c.id]).map(c => ({c, d:(sp[c.id] || 0) - S.profile.budgets[c.id]})).sort((a, b) => b.d - a.d);
  const mer = {}; for (const e of list) if (e.type === 'expense' && !isSaving(e.catId) && e.merchant) mer[e.merchant] = (mer[e.merchant] || 0) + e.amount;
  const topM = Object.entries(mer).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const quote = s.inc ? Math.round((s.inc - s.exp) / s.inc * 100) : null;
  openSheet('Rückblick ' + monthLabel(k),
    '<div class="facts"><div><span>Einnahmen</span><strong class="pos">' + money0(s.inc) + '</strong></div><div><span>Ausgaben</span><strong>' + money0(s.exp) + '</strong></div><div><span>Gespart</span><strong>' + money0(s.sav) + '</strong></div><div><span>Übrig</span><strong class="' + (s.bal < 0 ? 'badtxt' : '') + '">' + money0(s.bal) + '</strong></div></div>' +
    '<p class="note" style="margin:0">' + (quote != null ? 'Sparquote ' + quote + ' %. ' : '') + (prev.exp ? (Math.abs(s.exp - prev.exp) < 100 ? 'Ausgaben wie im Vormonat.' : 'Ausgaben ' + money0(Math.abs(s.exp - prev.exp)) + (s.exp > prev.exp ? ' mehr' : ' weniger') + ' als im Vormonat.') : '') + '</p>' +
    (rows.length ? '<section class="panel"><h3>Plan und Ist</h3><div class="tablewrap"><table><thead><tr><th>Gruppe</th><th class="r">Ist von Plan</th></tr></thead><tbody>' + rows.map(r => { const d = r.plan - r.ist, good = r.sav ? d <= 0 : d >= 0; return '<tr><td>' + esc(r.g) + '</td><td class="r"><b class="' + (r.plan ? (good ? 'pos' : 'badtxt') : '') + '">' + money0(r.ist) + '</b>' + (r.plan ? ' <span class="muted">/ ' + money0(r.plan) + '</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div></section>' : '') +
    (over.length ? '<section class="panel"><h3>Über Budget</h3><div class="list">' + over.slice(0, 5).map(o => '<div class="row">' + badge(o.c) + '<span class="row-main"><span class="row-title">' + esc(o.c.name) + '</span><span class="row-sub">' + money0(sp[o.c.id]) + ' von ' + money0(S.profile.budgets[o.c.id]) + '</span></span><span class="row-amt badtxt">+ ' + money0(o.d) + '</span></div>').join('') + '</div></section>' : '<p class="note" style="margin:0">Keine Kategorie über Budget.</p>') +
    (topM.length ? '<section class="panel"><h3>Wo das Geld hinging</h3><div class="list">' + topM.map(([m, v]) => '<div class="row"><span class="row-main"><span class="row-title">' + esc(m) + '</span></span><span class="row-amt">' + money(v) + '</span></div>').join('') + '</div></section>' : ''));
}
function openBudget(catId){
  const total = catId === '__total';
  const c = total ? null : catById(catId);
  const yb = (S.profile.yearBudgets || {})[catId], perYear = !total && !S.profile.budgets[catId] && !!yb;
  const cur = total ? S.profile.totalBudget : (perYear ? yb : S.profile.budgets[catId]);
  const spent = total ? sums(entriesIn(S.month)).exp : (spentByCat(entriesIn(S.month))[catId] || 0);
  const prev3 = [1, 2, 3].map(i => { const l = entriesIn(addMonths(S.month, -i)); return total ? sums(l).exp : (spentByCat(l)[catId] || 0); });
  const avg = Math.round(prev3.reduce((a, b) => a + b, 0) / 3);
  openSheet(total ? 'Gesamtbudget' : 'Budget: ' + c.name,
    '<form id="bForm" style="display:flex;flex-direction:column;gap:14px" novalidate>' + (total ? '' : '<div class="seg" role="radiogroup"><input type="radio" name="bper" id="bp-m" value="m"' + (perYear ? '' : ' checked') + '><label for="bp-m">Pro Monat</label><input type="radio" name="bper" id="bp-y" value="y"' + (perYear ? ' checked' : '') + '><label for="bp-y">Pro Jahr</label></div>') + '<label class="field"><span id="b-lbl">' + (perYear ? 'Jahreslimit' : 'Monatslimit') + '</span><span class="amount-wrap"><b>€</b><input class="input amount" id="b-amount" inputmode="decimal" placeholder="600" value="' + (cur ? esc((cur / 100).toFixed(2).replace('.', ',')) : '') + '"></span></label>' +
    '<div class="facts"><div><span>' + esc(monthLabel(S.month)) + '</span><strong>' + money(spent) + '</strong></div><div><span>Ø letzte 3 Monate</span><strong>' + money(avg) + '</strong></div></div>' +
    (total ? '<p class="note" style="margin:0">Ohne eigenes Gesamtbudget wird die Summe der Kategorie-Budgets verwendet.</p>' : '') +
    '<p class="note" id="b-err" role="alert" hidden></p><div class="btnrow"><button class="btn primary" type="submit" style="flex:1">Speichern</button>' + (cur ? '<button class="btn" type="button" id="b-clear">Budget entfernen</button>' : '') + '</div></form>',
    root => {
      $('#bForm', root).addEventListener('submit', ev => {
        ev.preventDefault();
        const v = toCents($('#b-amount', root).value);
        if (v == null || v <= 0) { const e = $('#b-err', root); e.hidden = false; e.textContent = 'Bitte einen Betrag größer 0 eingeben.'; return; }
        const p = clean(S.profile); p.yearBudgets = p.yearBudgets || {};
        const y = !total && $('#bp-y', root) && $('#bp-y', root).checked;
        if (total) p.totalBudget = v; else if (y) { p.yearBudgets[catId] = v; delete p.budgets[catId]; } else { p.budgets[catId] = v; delete p.yearBudgets[catId]; p.exampleBudgetKeys = p.exampleBudgetKeys.filter(k => k !== catId); }
        saveProfile(p); closeSheet(); toast('Budget gespeichert');
      });
      const cl = $('#b-clear', root);
      if (cl) cl.onclick = () => { const p = clean(S.profile); if (total) p.totalBudget = null; else { delete p.budgets[catId]; if (p.yearBudgets) delete p.yearBudgets[catId]; } saveProfile(p); closeSheet(); toast('Budget entfernt'); };
      root.querySelectorAll('input[name="bper"]').forEach(r => r.addEventListener('change', () => { $('#b-lbl', root).textContent = $('#bp-y', root).checked ? 'Jahreslimit' : 'Monatslimit'; }));
    });
}

function openPlanIncome(){
  const cur = S.profile.plannedIncome;
  const avg = Math.round([1, 2, 3].reduce((a, i) => a + sums(entriesIn(addMonths(S.month, -i))).inc, 0) / 3);
  openSheet('Geplantes Einkommen',
    '<form id="piForm" style="display:flex;flex-direction:column;gap:14px" novalidate><label class="field"><span>Einnahmen pro Monat</span><span class="amount-wrap"><b>€</b><input class="input amount" id="pi-amount" inputmode="decimal" placeholder="3000" value="' + (cur ? esc((cur / 100).toFixed(2).replace('.', ',')) : '') + '"></span></label>' +
    '<div class="facts"><div><span>Ø Einnahmen letzte 3 Monate</span><strong>' + money(avg) + '</strong></div></div>' +
    '<p class="note" style="margin:0">Vergleicht in den Budgets deine echten Einnahmen und Ausgaben mit diesem Wert.</p>' +
    '<p class="note" id="pi-err" role="alert" hidden></p><div class="btnrow"><button class="btn primary" type="submit" style="flex:1">Speichern</button>' + (cur ? '<button class="btn" type="button" id="pi-clear">Entfernen</button>' : '') + '</div></form>',
    root => {
      $('#piForm', root).addEventListener('submit', ev => {
        ev.preventDefault();
        const v = toCents($('#pi-amount', root).value);
        if (v == null || v <= 0) { const e = $('#pi-err', root); e.hidden = false; e.textContent = 'Bitte einen Betrag größer 0 eingeben.'; return; }
        const p = clean(S.profile); p.plannedIncome = v; saveProfile(p); closeSheet(); toast('Einkommen gespeichert');
      });
      const cl = $('#pi-clear', root);
      if (cl) cl.onclick = () => { const p = clean(S.profile); p.plannedIncome = null; saveProfile(p); closeSheet(); toast('Plan-Vergleich entfernt'); };
    });
}

/* cards */
function openCard(id){
  const cd = id ? clean(cardById(id)) : {name:'', kind:'debit', color:S.profile.cards.length % 20, last4:'', closingDay:null, startBalance:null};
  const used = id ? allEntries().filter(e => e.cardId === id || e.toCardId === id).length : 0;
  const sw = Array.from({length:20}, (_, i) => '<input type="radio" name="ccol" id="cc-' + i + '" value="' + i + '"' + (cd.color === i ? ' checked' : '') + '><label for="cc-' + i + '" style="--c:var(--c' + i + ')" title="Farbe ' + (i + 1) + '"></label>').join('');
  openSheet(id ? 'Karte bearbeiten' : 'Neue Karte',
    '<form id="cForm" style="display:flex;flex-direction:column;gap:14px" novalidate>' +
    '<label class="field"><span>Name</span><input class="input" id="c-name" value="' + esc(cd.name) + '" placeholder="z. B. Visa privat" autocomplete="off"></label>' +
    '<div class="formgrid"><label class="field"><span>Art</span><select class="input" id="c-kind">' + Object.entries(KIND).map(([k, v]) => '<option value="' + k + '"' + (cd.kind === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label>' +
    '<label class="field"><span>Letzte 4 Ziffern</span><input class="input" id="c-last4" inputmode="numeric" maxlength="4" value="' + esc(cd.last4 || '') + '" placeholder="optional"></label>' +
    '<label class="field"><span>IBAN-Endung</span><input class="input" id="c-iban" maxlength="4" autocapitalize="characters" value="' + esc(cd.ibanLast4 || '') + '" placeholder="optional"></label>' +
    '<label class="field" id="c-closing-f"><span>Abrechnungstag</span><input class="input" id="c-closing" inputmode="numeric" maxlength="2" value="' + esc(cd.closingDay || '') + '" placeholder="1–31"></label>' +
    '<label class="field" id="c-start-f"><span id="c-start-l">Kontostand</span><input class="input" id="c-start" inputmode="decimal" value="' + (cd.startBalance != null ? esc(((cd.kind === 'credit' ? -cd.startBalance : cd.startBalance) / 100).toFixed(2).replace('.', ',')) : '') + '" placeholder="laut Bank-App"></label>' +
    '<label class="field" id="c-sdate-f"><span>Stand am Ende von</span><input class="input" type="date" id="c-sdate" value="' + esc(cd.startDate || today()) + '"></label></div>' +
    '<p class="note" style="margin:0">Mit Karten- und IBAN-Endung ordnen Beleg-Scan und Bank-Import automatisch zu. Kontostand einmal laut Bank-App eintragen, danach rechnet die App alle späteren Buchungen dazu.</p>' +
    '<div class="field"><span>Farbe</span><div class="swatches">' + sw + '</div></div>' +
    '<details class="more"' + (cd.activeUntil ? ' open' : '') + '><summary>Konto nicht mehr in Verwendung</summary><label class="field" style="margin-top:8px"><span>Aktiv bis</span><input class="input" type="date" id="c-until" value="' + esc(cd.activeUntil || '') + '"></label><p class="note" style="margin:6px 0 0">Danach verschwindet es aus Auswahl und Gesamtguthaben. Alle Buchungen bleiben in Einträgen und Statistik. Feld leeren = wieder aktiv.</p></details>' +
    '<p class="note" id="c-err" role="alert" hidden></p><div class="btnrow"><button class="btn primary" type="submit" style="flex:1">Speichern</button>' + (id ? '<button class="btn danger" type="button" id="c-del">Löschen</button>' : '') + '</div><div id="c-confirm"></div></form>',
    root => {
      const sync = () => { const k = $('#c-kind', root).value; $('#c-closing-f', root).hidden = k !== 'credit'; $('#c-start-l', root).textContent = k === 'credit' ? 'Offener Betrag' : 'Kontostand'; };
      $('#c-kind', root).addEventListener('change', sync); sync();
      $('#cForm', root).addEventListener('submit', ev => {
        ev.preventDefault();
        const err = $('#c-err', root), name = $('#c-name', root).value.trim(), kind = $('#c-kind', root).value;
        const last4 = $('#c-last4', root).value.replace(/\D/g, '');
        const ibanL4 = $('#c-iban', root).value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
        if (ibanL4 && ibanL4.length !== 4) { const e2 = $('#c-err', root); e2.hidden = false; e2.textContent = 'IBAN-Endung: genau 4 Zeichen oder leer lassen.'; return; }
        const closing = parseInt($('#c-closing', root).value, 10);
        const startRaw = $('#c-start', root).value.trim();
        const fail = m => { err.hidden = false; err.textContent = m; };
        if (!name) return fail('Bitte einen Namen eingeben.');
        if (last4 && last4.length !== 4) return fail('Bitte genau 4 Ziffern eingeben oder das Feld leer lassen.');
        if (kind === 'credit' && $('#c-closing', root).value && !(closing >= 1 && closing <= 31)) return fail('Abrechnungstag muss zwischen 1 und 31 liegen.');
        const start = startRaw ? toCents(startRaw) : null;
        if (startRaw && start == null) return fail('Kontostand bitte als Zahl eingeben, z. B. 1.250,00 oder -80,00.');
        const color = Number((root.querySelector('input[name="ccol"]:checked') || {}).value || 0);
        const p = clean(S.profile);
        const next = Object.assign({}, cd, {id:id || newId(), name, kind, last4, ibanLast4:ibanL4, color, closingDay:kind === 'credit' && closing >= 1 ? closing : null, startBalance:start == null ? null : (kind === 'credit' ? -Math.abs(start) : start), startDate:start != null ? ($('#c-sdate', root).value || today()) : null, startAt:start == null ? null : (start === (kind === 'credit' ? -(cd.startBalance || 0) : cd.startBalance) && ($('#c-sdate', root).value || today()) === cd.startDate ? (cd.startAt || null) : new Date().toISOString()), activeUntil:$('#c-until', root).value || null});
        if (next.example && name !== cd.name) delete next.example;
        const i = p.cards.findIndex(c => c.id === next.id);
        if (i >= 0) p.cards[i] = next; else p.cards.push(next);
        saveProfile(p); closeSheet(); toast(id ? 'Karte gespeichert' : 'Karte angelegt');
      });
      const del = $('#c-del', root);
      if (del) del.onclick = () => {
        $('#c-confirm', root).innerHTML = '<div class="confirm"><strong>Karte löschen?</strong><span class="note">' + (used ? used + (used === 1 ? ' Eintrag bleibt' : ' Einträge bleiben') + ' erhalten und zeigen dann „Karte gelöscht“.' : 'Es hängen keine Einträge daran.') + '</span><div class="btnrow"><button type="button" class="btn danger small" id="c-yes">Ja, löschen</button><button type="button" class="btn small" id="c-no">Abbrechen</button></div></div>';
        $('#c-no', root).onclick = () => { $('#c-confirm', root).innerHTML = ''; };
        $('#c-yes', root).onclick = () => { const p = clean(S.profile); p.cards = p.cards.filter(c => c.id !== id); saveProfile(p); closeSheet(); toast('Karte gelöscht'); };
      };
    });
}
