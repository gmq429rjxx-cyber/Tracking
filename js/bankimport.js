// Kassabuch – Bank-PDF-Import (lokal)
'use strict';
/* ---------- Bank-PDF-Import (lokal) ---------- */
const CAN_DIR = 'webkitdirectory' in HTMLInputElement.prototype;
function pickBankFiles(dir){ const i = $(dir ? '#bankDirInput' : '#bankInput'); i.value = ''; i.click(); }
function pickBank(){
  if (!CAN_DIR) return pickBankFiles(false);
  openSheet('Bank-PDFs importieren',
    '<button class="btn primary" id="bk-dir">' + ICON.bank + 'Ganzen Ordner wählen</button><button class="btn" id="bk-files">Einzelne PDFs wählen</button>' +
    '<p class="note" style="margin:0">Tipp: Bank-PDFs immer in denselben Ordner sichern, z. B. Dateien → Auf meinem iPhone → Kassabuch-Bank. Bereits importierte PDFs werden übersprungen, du kannst den Ordner also jedes Mal komplett wählen.</p>',
    root => { $('#bk-dir', root).onclick = () => { closeSheet(); pickBankFiles(true); }; $('#bk-files', root).onclick = () => { closeSheet(); pickBankFiles(false); }; });
}
const aliasKey = s => normMerchant(s) || String(s || '').toLowerCase().trim();
/* Karte, die für eine Bank schon zugeordnet ist (eindeutig) */
function bankCard(bank){
  const n = {}, add = (id, w) => { if (id && cardById(id) && !isInactive(cardById(id))) n[id] = (n[id] || 0) + w; };
  for (const [k, v] of Object.entries(S.profile.bankMap)) if (k.startsWith(bank + ':')) add(v, 100);
  for (const e of allEntries()) if (e.type !== 'transfer' && (e.bankKeys || []).some(k => k.startsWith('bank:' + bank + ':'))) add(e.cardId, 1);
  const top = Object.entries(n).sort((x, y) => y[1] - x[1]);
  return top.length && (top.length === 1 || top[0][1] > top[1][1] * 3) ? top[0][0] : '';
}
const OWN_BANKS = [['revolut', /revolut/i], ['tr', /trade\s*republic/i]];
/* Kartenzahlung an eine eigene Bank (Aufladung) -> Karte dieser Bank */
function topupTarget(p){ if (p.kind !== 'card' || p.type !== 'expense') return ''; const t = (p.merchantRaw || '') + ' ' + (p.merchant || ''); for (const [b, rx] of OWN_BANKS) if (b !== p.bank && rx.test(t)) return bankCard(b); return ''; }
function sourceCard(p){
  const mk = p.bank + ':' + (p.cardLast4 || p.cardCode || '-') + ':' + (p.ibanLast4 || '-');
  const ok = id => id && cardById(id);
  if (ok(S.profile.bankMap[mk])) return {id:S.profile.bankMap[mk], mk};
  if (p.cardLast4) { const c = S.profile.cards.find(c => c.last4 === p.cardLast4); if (c) return {id:c.id, mk}; }
  if (p.ibanLast4) {
    const c = S.profile.cards.find(c => c.ibanLast4 && c.ibanLast4.toUpperCase() === p.ibanLast4 && (!p.cardLast4 || !c.last4));
    if (c) return {id:c.id, mk};
    if (ok(S.profile.ibanMap[p.ibanLast4]) && !p.cardLast4 && !p.cardCode) return {id:S.profile.ibanMap[p.ibanLast4], mk};
  }
  if (!p.cardLast4 && !p.cardCode && !p.ibanLast4) { const b = bankCard(p.bank); if (b) return {id:b, mk}; }
  return {id:'', mk};
}
function counterCard(p){
  if (p.counterpartyCardLast4) { const c = S.profile.cards.find(c => c.last4 === p.counterpartyCardLast4); return c ? c.id : ''; }
  const l = p.counterpartyIbanLast4; if (!l) return '';
  const c = S.profile.cards.find(c => c.ibanLast4 && c.ibanLast4.toUpperCase() === l);
  return c ? c.id : (S.profile.ibanMap[l] && cardById(S.profile.ibanMap[l]) ? S.profile.ibanMap[l] : '');
}
function srcLabel(p){ return p.bankName + (p.cardLast4 ? ' · Karte ••' + p.cardLast4 : p.cardCode ? ' · Karte ' + p.cardCode : '') + (p.ibanLast4 ? ' · Konto …' + p.ibanLast4 : ''); }
async function onBankFiles(files){
  /* Schon verarbeitete PDFs (Name + Größe) ohne erneutes Lesen überspringen – nur wenn die Buchung fertig importiert oder bewusst ignoriert ist */
  files = files.filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  if (!files.length) { toast('Keine PDFs gefunden.'); return; }
  const sig = f => f.name + '|' + f.size;
  let seen = {}; try { seen = (await kvGet('bankFiles')) || {}; } catch (_) {}
  const done = new Set(S.profile.ignoredImports || []);
  for (const e of allEntries()) if (!e.pending) for (const k of (e.bankKeys || [])) done.add(k);
  const total = files.length; files = files.filter(f => !done.has(seen[sig(f)]));
  const pre = total - files.length;
  if (!files.length) { toast('Keine neuen PDFs. ' + pre + ' schon importiert.'); return; }
  openSheet('Bank-PDFs lesen', '<div class="status"><span class="spinner" aria-hidden="true"></span><div><strong id="bk-st">Lese 0 von ' + files.length + ' …</strong><div class="note">Passiert nur auf diesem iPhone.</div></div></div>');
  let mod;
  try { mod = await import(new URL('bank.js', document.baseURI).href); } catch (e) { openSheet('Bank-PDFs', '<div class="panel"><h3>Leser nicht geladen</h3><p class="note" style="margin:0">Beim ersten Mal braucht der PDF-Leser Internet. Verbindung prüfen und erneut versuchen.</p></div>'); return; }
  const parsed = [], failed = [];
  for (let i = 0; i < files.length; i++) {
    const st = $('#bk-st'); if (st) st.textContent = 'Lese ' + (i + 1) + ' von ' + files.length + ' …';
    try {
      const r = mod.parseBank(await mod.pdfLines(await files[i].arrayBuffer()), files[i].name);
      if (r.ok) { parsed.push(r); seen[sig(files[i])] = 'bank:' + r.bank + ':' + r.id; } else failed.push(files[i].name + ': ' + r.error);
    } catch (e) { failed.push(files[i].name + ': nicht lesbar'); }
  }
  try { const ks = Object.keys(seen); if (ks.length > 4000) for (const k of ks.slice(0, ks.length - 4000)) delete seen[k]; await kvSet('bankFiles', seen); } catch (_) {}
  const known = new Map();
  for (const e of allEntries()) for (const k of (e.bankKeys || [])) known.set(k, e);
  const ignored = new Set(S.profile.ignoredImports || []);
  const rows = []; let skipped = pre;
  for (const p of parsed.sort((a, b) => a.date.localeCompare(b.date))) {
    const key = 'bank:' + p.bank + ':' + p.id;
    if (ignored.has(key)) { skipped++; continue; }
    if (known.has(key)) {
      const ex = known.get(key);
      if ((ex.pending && (!p.pending || ex.amount !== p.amount)) || (ex.settledManually && !p.pending && ex.amount !== p.amount)) rows.push({p, key, action:'update', target:ex, use:true, name:ex.merchant || p.merchant});
      else skipped++;
      continue;
    }
    if (rows.some(r => r.key === key)) { skipped++; continue; }
    const sc = sourceCard(p), cc = p.kind === 'transfer' ? counterCard(p) : topupTarget(p);
    const al = S.profile.merchantAlias[aliasKey(p.merchantRaw || p.merchant)];
    const name = al ? al.name : p.merchant;
    const hist = al ? null : guessFromHistory(name);
    const row = {p, key, mk:sc.mk, cardId:sc.id, cc, name, catId:al ? al.catId : (hist ? hist.catId : ''), use:true, action:'new'};
    rows.push(row);
  }
  renderBankReview(rows, skipped, failed);
}
function bankResolve(r){
  const p = r.p;
  if (r.action === 'update') return r;
  const own = (p.kind === 'transfer' || topupTarget(p)) && r.cc;
  r.type = own ? 'transfer' : p.type;
  r.from = own ? (p.type === 'expense' ? r.cardId : r.cc) : '';
  r.to = own ? (p.type === 'expense' ? r.cc : r.cardId) : '';
  r.action = 'new'; r.target = null; r.pairOf = null;
  return r;
}
function bankMatch(rows){
  const usedTargets = new Set();
  rows.forEach((r, i) => {
    if (r.action === 'update') return;
    bankResolve(r);
    const p = r.p;
    if (r.type === 'transfer') {
      const prev = rows.slice(0, i).find(o => o.use && o.type === 'transfer' && o.action === 'new' && !o.pairOf && o.p.amount === p.amount && Math.abs(dayDiff(o.p.date, p.date)) <= 3 && o.from === r.from && o.to === r.to && o.p.bank !== p.bank);
      if (prev) { r.action = 'pair'; r.pairOf = prev; return; }
      const t = allEntries().find(e => e.type === 'transfer' && e.amount === p.amount && Math.abs(dayDiff(e.date, p.date)) <= 3 && e.cardId === r.from && e.toCardId === r.to && !(e.bankKeys || []).some(k => k.startsWith('bank:' + p.bank + ':')));
      if (t) { r.action = 'merge'; r.target = t; return; }
      const bx = OWN_BANKS.find(([b]) => b === p.bank), rx = bx && bx[1];
      const x = rx && p.type === 'income' && allEntries().find(e => e.type === 'expense' && e.amount === p.amount && Math.abs(dayDiff(e.date, p.date)) <= 3 && e.cardId === r.from && rx.test((e.merchant || '') + ' ' + (e.merchantRaw || '')) && !(e.bankKeys || []).some(k => k.startsWith('bank:' + p.bank + ':')) && !usedTargets.has(e.id));
      if (x) { r.action = 'merge'; r.target = x; usedTargets.add(x.id); }
      return;
    }
    const cands = allEntries().filter(e => e.type === r.type && e.amount === p.amount && validISO(e.date) && Math.abs(dayDiff(e.date, p.date)) <= 3 && !(e.bankKeys && e.bankKeys.length) && !usedTargets.has(e.id));
    cands.sort((a, b) => ((b.cardId === r.cardId) - (a.cardId === r.cardId)) || Math.abs(dayDiff(a.date, p.date)) - Math.abs(dayDiff(b.date, p.date)));
    if (cands[0]) { r.action = 'merge'; r.target = cands[0]; usedTargets.add(cands[0].id); }
  });
}
function renderBankReview(rows, skipped, failed){
  bankMatch(rows);
  if (!rows.length) { closeSheet(); toast(failed.length ? failed.length + ' PDF(s) nicht lesbar.' : 'Keine neuen Buchungen. ' + skipped + ' schon importiert.'); if (failed.length) openSheet('Bank-PDFs', '<div class="panel"><h3>Nicht gelesen</h3><ul class="checks">' + failed.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul></div>'); return; }
  const unmapped = [...new Map(rows.filter(r => r.action !== 'update' && !r.cardId).map(r => [r.mk, r.p])).entries()];
  const cpUnknown = [...new Map(rows.filter(r => r.action !== 'update' && r.p.kind === 'transfer' && (!r.cc || r.cpManual) && r.p.counterpartyIbanLast4).map(r => [r.p.counterpartyIbanLast4, r])).entries()];
  const ccUnknown = [...new Map(rows.filter(r => r.action !== 'update' && r.p.counterpartyCardLast4 && (!r.cc || r.cpManual)).map(r => [r.p.counterpartyCardLast4, r])).entries()];
  const open = rows.filter(r => r.use && r.action === 'new' && r.type !== 'transfer' && !r.catId).length;
  const label = r => r.action === 'update' ? '<span class="chip info">aktualisiert</span>' : r.action === 'merge' ? '<span class="chip ok">ergänzt ' + esc(r.target.merchant || (r.target.type === 'transfer' ? 'Umbuchung' : catById(r.target.catId).name)) + '</span>' : r.action === 'pair' ? '<span class="chip ok">Gegenbuchung</span>' : r.type === 'transfer' ? '<span class="chip info">Umbuchung</span>' : '<span class="chip info">neu</span>';
  const rowHTML = (r, i) => {
    const p = r.p, inc = r.type === 'income', tr = r.type === 'transfer';
    const cardTxt = tr ? ((cardById(r.from) || {}).name || '?') + ' → ' + ((cardById(r.to) || {}).name || '?') : srcLabel(p);
    return '<div class="irow' + (r.use ? '' : ' off') + '" data-i="' + i + '"><input type="checkbox" id="bk-use-' + i + '"' + (r.use ? ' checked' : '') + ' aria-label="Übernehmen">' +
      (r.action === 'new' && !tr ? '<input class="input name" id="bk-n-' + i + '" value="' + esc(r.name) + '" aria-label="Name">' : '<span class="row-title" style="grid-column:2/3">' + esc(tr ? (p.reference || 'Umbuchung') : r.name) + '</span>') +
      '<span class="row-amt ' + (inc ? 'pos' : tr ? 'muted' : '') + '">' + (inc ? '+ ' : tr ? '' : '− ') + money(p.amount) + '</span>' +
      '<span class="meta">' + label(r) + (p.pending ? '<span class="chip warn">vorgemerkt</span>' : '') + '<span>' + esc(DAY.format(parseISO(p.date))) + (p.time ? ' ' + esc(p.time) : '') + ' · ' + esc(cardTxt) + '</span>' + (p.fx && p.fx.original ? '<span>' + esc(p.fx.original) + (p.fx.markup ? ', Aufschlag ' + esc(String(p.fx.markup).replace('.', ',')) + ' %' : '') + '</span>' : '') + '</span>' +
      (r.action === 'new' && !tr ? '<select class="input" id="bk-cat-' + i + '" aria-label="Kategorie"><option value="">Kategorie wählen …</option>' + catOptions(r.type, r.catId) + '</select>' : '') + '</div>';
  };
  openSheet('Bank-PDFs importieren',
    '<p class="note" style="margin:0">' + rows.length + ' Buchung' + (rows.length === 1 ? '' : 'en') + (skipped ? ', ' + skipped + ' schon importiert' : '') + (failed.length ? ', ' + failed.length + ' nicht lesbar' : '') + '. Gelesen wurde nur auf diesem iPhone.</p>' +
    (unmapped.length ? '<section class="panel"><h3>Konten und Karten zuordnen</h3><p class="note" style="margin:0">Einmalig. Danach erkennt die App sie automatisch.</p>' + unmapped.map(([mk, p], j) => '<label class="field"><span>' + esc(srcLabel(p)) + '</span><select class="input" data-mk="' + esc(mk) + '" data-iban="' + esc(p.ibanLast4 || '') + '" id="bk-mk-' + j + '"><option value="">Bitte wählen …</option>' + S.profile.cards.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + (c.last4 ? ' (' + esc(c.last4) + ')' : '') + '</option>').join('') + '</select></label>').join('') + '</section>' : '') +
    (ccUnknown.length ? '<section class="panel"><h3>Aufladungen: eigene Karte?</h3><p class="note" style="margin:0">Kommt das Geld von deiner eigenen Karte, wird es eine Umbuchung statt Einnahme.</p>' + ccUnknown.map(([l4, r]) => '<label class="field"><span>' + esc(r.p.merchant || 'Aufladung') + ' · Karte ••' + esc(l4) + '</span><select class="input" data-cc="' + esc(l4) + '"><option value="">Fremde Karte</option>' + S.profile.cards.map(c => '<option value="' + esc(c.id) + '"' + (r.cc === c.id ? ' selected' : '') + '>Eigene: ' + esc(c.name) + '</option>').join('') + '</select></label>').join('') + '</section>' : '') +
    (cpUnknown.length ? '<section class="panel"><h3>Überweisungen: eigenes Konto?</h3><p class="note" style="margin:0">Geht das Geld an ein eigenes Konto, wird es eine Umbuchung statt Ausgabe.</p>' + cpUnknown.map(([l4, r], j) => '<label class="field"><span>' + esc(r.p.merchant || 'Gegenkonto') + ' · Konto …' + esc(l4) + '</span><select class="input" data-cp="' + esc(l4) + '" id="bk-cp-' + j + '"><option value="">Fremdes Konto</option>' + S.profile.cards.map(c => '<option value="' + esc(c.id) + '"' + (r.cc === c.id ? ' selected' : '') + '>Eigenes: ' + esc(c.name) + '</option>').join('') + '</select></label>').join('') + '</section>' : '') +
    (open && SET.apiKey ? '<button class="btn" id="bk-ai">Namen und Kategorien für ' + open + ' Buchung' + (open === 1 ? '' : 'en') + ' mit KI vorschlagen</button><p class="note" id="bk-ai-st" style="margin:0" hidden></p>' : '') +
    '<div class="list" id="bk-list">' + rows.map(rowHTML).join('') + '</div>' +
    (failed.length ? '<details><summary>' + failed.length + ' nicht gelesen</summary><ul class="checks">' + failed.map(f => '<li class="note">' + esc(f) + '</li>').join('') + '</ul></details>' : '') +
    '<p class="note" id="bk-err" role="alert" hidden></p><button class="btn primary" id="bk-go">Übernehmen</button>',
    root => {
      const read = () => {
        rows.forEach((r, i) => {
          const u = $('#bk-use-' + i, root); if (u) r.use = u.checked;
          const n = $('#bk-n-' + i, root); if (n) r.name = n.value.trim() || r.p.merchant;
          const c = $('#bk-cat-' + i, root); if (c) r.catId = c.value;
          const el = root.querySelector('.irow[data-i="' + i + '"]'); if (el) el.classList.toggle('off', !r.use);
        });
        root.querySelectorAll('[data-mk]').forEach(s => {
          if (!s.value) return;
          rows.forEach(r => { if (r.mk === s.dataset.mk) r.cardId = s.value; });
          /* Konto erkannt: Überweisungen auf dieses Konto werden Umbuchungen */
          if (s.dataset.iban) rows.forEach(r => { if (!r.cc && r.action !== 'update' && r.p.counterpartyIbanLast4 === s.dataset.iban) r.cc = s.value; });
        });
        root.querySelectorAll('[data-cp]').forEach(s => rows.forEach(r => { if (r.p.counterpartyIbanLast4 === s.dataset.cp && r.action !== 'update') { r.cc = s.value; r.cpManual = true; } }));
        root.querySelectorAll('[data-cc]').forEach(s => rows.forEach(r => { if (r.p.counterpartyCardLast4 === s.dataset.cc && r.action !== 'update') { r.cc = s.value; r.cpManual = true; } }));
        const n = rows.filter(r => r.use).length; $('#bk-go', root).textContent = n + ' übernehmen'; $('#bk-go', root).disabled = !n;
      };
      const onChange = ev => { read(); if (ev.target.matches('[data-mk], [data-cp], [data-cc]')) renderBankReview(rows, skipped, failed); };
      root.addEventListener('change', onChange);
      read();
      const ai = $('#bk-ai', root);
      if (ai) ai.onclick = async () => {
        read();
        const todo = rows.map((r, i) => ({i, r})).filter(x => x.r.use && x.r.action === 'new' && x.r.type !== 'transfer' && !x.r.catId);
        const list = cats().filter(c => c.kind === 'expense' || c.kind === 'income').map(c => c.id + ' = ' + c.name + ' (' + (c.kind === 'income' ? 'Einnahme' : 'Ausgabe') + ')').join('\n');
        const prompt = 'Assign each Austrian bank booking text to one category and give a short clean German merchant or payer name (e.g. "TURMOEL 158 2140" -> "Turmöl", "Lidl Dankt 480, Musterort" -> "Lidl"). Expenses must get an Ausgabe category, incomes an Einnahme category.\nCategories (id = name):\n' + list + '\nBookings:\n' + todo.map(x => x.i + ': ' + (x.r.type === 'income' ? '[Einnahme] ' : '[Ausgabe] ') + (x.r.p.merchantRaw || x.r.p.merchant)).join('\n') + '\nReply with only a JSON array: [{"i": number, "categoryId": string, "merchant": string}]';
        await aiSuggest(ai, $('#bk-ai-st', root), prompt, x => {
          const r = rows[Number(x.i)]; if (!r) return;
          if (cats().some(c => c.id === x.categoryId && c.kind === r.type)) { r.catId = x.categoryId; const sel = $('#bk-cat-' + x.i, root); if (sel) sel.value = x.categoryId; }
          if (x.merchant) { r.name = String(x.merchant).slice(0, 80); const n = $('#bk-n-' + x.i, root); if (n) n.value = r.name; }
        }, read);
      };
      $('#bk-go', root).onclick = async () => {
        read(); bankMatch(rows);
        const err = $('#bk-err', root);
        const missing = rows.filter(r => r.use && r.action === 'new' && r.type !== 'transfer' && !r.catId).length;
        if (missing) { err.hidden = false; err.textContent = 'Bitte für ' + missing + ' Buchung' + (missing === 1 ? '' : 'en') + ' eine Kategorie wählen oder abwählen.'; return; }
        const pr = clean(S.profile);
        root.querySelectorAll('[data-mk]').forEach(s => { if (s.value) { pr.bankMap[s.dataset.mk] = s.value; if (s.dataset.iban && !pr.ibanMap[s.dataset.iban]) pr.ibanMap[s.dataset.iban] = s.value; } });
        root.querySelectorAll('[data-cp]').forEach(s => { if (s.value) pr.ibanMap[s.dataset.cp] = s.value; });
        root.querySelectorAll('[data-cc]').forEach(s => { const c = s.value && pr.cards.find(x => x.id === s.value); if (c && !c.last4) c.last4 = s.dataset.cc; });
        const now = new Date().toISOString(), out = new Map();
        const put = e => out.set(e.id, e);
        for (const r of rows.filter(r => !r.use)) pr.ignoredImports = (pr.ignoredImports || []).concat(r.key).slice(-800);
        for (const r of rows.filter(r => r.use)) {
          const p = r.p;
          if (r.action === 'update') { const e = clean(out.get(r.target.id) || r.target); e.amount = p.amount; e.pending = !!p.pending; if (p.fx) e.fx = p.fx; put(e); continue; }
          if (r.action === 'merge') { const e = clean(out.get(r.target.id) || r.target); e.bankKeys = (e.bankKeys || []).concat(r.key); if (r.type === 'transfer' && e.type !== 'transfer') { e.note = e.note || e.merchant || ''; Object.assign(e, {type:'transfer', cardId:r.from, toCardId:r.to, catId:'', merchant:''}); } if (!e.cardId && r.type !== 'transfer') e.cardId = r.cardId; e.pending = !!p.pending; if (p.fx) e.fx = p.fx; if (p.time) e.time = p.time; put(e); continue; }
          if (r.action === 'pair') { const base = out.get(r.pairOf.newId); if (base) { base.bankKeys.push(r.key); if (!p.pending) base.pending = false; } continue; }
          const e = {id:newId() + Math.random().toString(36).slice(2, 5), type:r.type, amount:p.amount, date:p.date, cardId:r.type === 'transfer' ? r.from : r.cardId, merchant:r.type === 'transfer' ? '' : shortMerchant(r.name), note:r.type === 'transfer' ? (p.reference || '') : '', catId:r.type === 'transfer' ? '' : r.catId,
            source:'bank', bank:p.bank, bankKeys:[r.key], importKey:r.key, pending:!!p.pending, createdAt:now};
          if (r.type === 'transfer') e.toCardId = r.to; else e.persons = personsFor(e.merchant);
          if (p.fx) e.fx = p.fx; if (p.time) e.time = p.time;
          r.newId = e.id; put(e);
          if (r.type !== 'transfer' && (p.merchantRaw || p.merchant)) pr.merchantAlias[aliasKey(p.merchantRaw || p.merchant)] = {name:shortMerchant(r.name), catId:r.catId};
        }
        const keys = Object.keys(pr.merchantAlias); if (keys.length > 600) for (const k of keys.slice(0, keys.length - 600)) delete pr.merchantAlias[k];
        await saveProfile(pr);
        try { await putEntries([...out.values()]); closeSheet(); toast(out.size + ' Buchung' + (out.size === 1 ? '' : 'en') + ' übernommen'); } catch (x) { err.hidden = false; err.textContent = writeErr(x); }
      };
      return () => root.removeEventListener('change', onChange);
    });
}
