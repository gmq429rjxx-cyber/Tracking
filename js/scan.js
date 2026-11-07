// Kassabuch – Beleg-Scan mit Claude, Apple-Pay-Inbox
'use strict';
/* ---------- receipt scan ---------- */
async function toJpeg(file){
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const max = 1800, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
    const cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
    return blob || file;
  } catch (_) { return file; } finally { URL.revokeObjectURL(url); }
}
const ITEM_GROUPS = ['Getränke','Obst & Gemüse','Brot & Gebäck','Milch & Käse','Fleisch & Wurst','Fisch','Tiefkühl','Vorrat & Konserven','Süßes & Snacks','Alkohol','Drogerie & Hygiene','Haushalt & Reinigung','Baby & Kind','Tier','Pfand','Sonstiges'];
function normItems(list){
  return (Array.isArray(list) ? list : []).filter(i => i && (i.clean || i.name) && num(i.total) != null).slice(0, 80).map(i => ({
    n:String(i.clean || i.name).trim().slice(0, 60), raw:String(i.name || '').trim().slice(0, 60), g:ITEM_GROUPS.includes(i.group) ? i.group : 'Sonstiges',
    q:Math.max(0.001, num(i.qty) || 1), t:Math.round(num(i.total) * 100), k:i.kind === 'discount' || i.kind === 'deposit' ? i.kind : (i.group === 'Pfand' ? 'deposit' : (num(i.total) < 0 ? 'discount' : 'item'))}));
}
/* Gleiche Zahlung schon vorhanden (z. B. aus Bank-PDF)? Dann hängt der Bon dort an */
function findMergeTarget(amount, date, type){
  if (!amount || !validISO(date)) return null;
  return allEntries().filter(e => e.type === (type || 'expense') && e.amount === amount && validISO(e.date) && Math.abs(dayDiff(e.date, date)) <= 3 && !(e.items && e.items.length) && !(e.receipts && e.receipts.length))
    .sort((a, b) => Math.abs(dayDiff(a.date, date)) - Math.abs(dayDiff(b.date, date)))[0] || null;
}
function scanPrompt(){
  const list = cats().map(c => c.id + ' = ' + c.name + ' (' + (c.kind === 'income' ? 'Einnahme' : 'Ausgabe') + ')').join('\n');
  return 'You are reading ONE receipt or invoice, given as photos or a PDF (usually Austrian or German; several photos are consecutive pages). Today is ' + today() + '.\n' +
    'Read only what is printed. Do not invent values; use null when something is unreadable.\n' +
    'Reply with only one JSON object of exactly this shape:\n' +
    '{"merchant": string|null, "date": "YYYY-MM-DD"|null, "total": number|null, "currency": string, "docType": "kassenbon"|"rechnung"|"sonstiges", "isRefund": boolean, ' +
    '"items": [{"name": string, "clean": string, "group": string, "qty": number|null, "total": number, "kind": "item"|"discount"|"deposit"}], "savingsPrinted": number|null, "vat": [{"rate": number, "net": number|null, "tax": number|null, "gross": number|null}], ' +
    '"paymentHint": string|null, "cardLast4": string|null, "dueDate": "YYYY-MM-DD"|null, "categoryId": string, "note": string, "issues": [string], "confidence": number}\n' +
    'Field rules:\n- merchant: the short brand or shop name people use, without legal form, country or branch ("Lidl", not "Lidl Österreich GmbH, Filiale Musterort").\n- total: the amount actually paid or owed, in currency units (23.45), positive.\n- items: line items with their line totals; discounts and Pfand returns as negative totals; at most 60 lines. kind = "discount" for every price reduction line (Rabatt, Aktion, Coupon, Lidl Plus, Mengenrabatt, Mitarbeiterrabatt, "-20%"), "deposit" for Pfand, otherwise "item". Never list summary lines such as "Sie haben gespart", "Ersparnis gesamt" or "Preisvorteil" as items; put that printed total savings amount (positive) into savingsPrinted, else null. name = exactly as printed; clean = readable German product name without codes (e.g. "MIN.WASS.PRICK 6X1,5L" -> "Mineralwasser prickelnd 6×1,5 l"); qty = number of units if printed, else 1; group = one of: ' + ITEM_GROUPS.join(', ') + '.\n' +
    '- vat: one entry per tax rate in percent (20, 10, 13, 19, 7, 0) as printed in the tax summary.\n- paymentHint: how it was paid as printed, e.g. "Visa", "Maestro", "Bar", "Apple Pay Mastercard".\n' +
    '- cardLast4: last four card digits if printed (masked numbers like ****1234), else null.\n- dueDate: payment due date on invoices only.\n' +
    '- categoryId: the best matching id from this list:\n' + list + '\n' +
    '- note: a short German description, max 60 characters (e.g. "Wocheneinkauf", "Tanken Diesel 42 l").\n' +
    '- issues: short German sentences for anything that looks wrong or doubtful: totals that do not add up, VAT inconsistent, missing or odd date, illegible parts, duplicate lines, unusual prices, signs that this is only a quote or delivery note. Empty array if none.\n' +
    '- confidence: 0 to 1, how sure you are about total and date.';
}
function verdictOf(checks){ if (checks.some(c => c[0] === 'bad')) return 'bad'; if (checks.some(c => c[0] === 'warn')) return 'warn'; return 'ok'; }
const VERDICT = {ok:'i.O.', warn:'Prüfen', bad:'n.i.O.'};
const verdictChip = st => '<span class="chip ' + st + '">' + VERDICT[st] + '</span>';
function matchCard(r){
  const l4 = String(r.cardLast4 || '').replace(/\D/g, '').slice(-4);
  if (l4.length === 4) { const c = S.profile.cards.find(x => x.last4 === l4); if (c) return {id:c.id, how:'last4'}; return {id:'', how:'unknown', l4}; }
  const hint = String(r.paymentHint || '').toLowerCase();
  if (/\bbar\b|bargeld|cash/.test(hint)) { const c = S.profile.cards.find(x => x.kind === 'cash'); if (c) return {id:c.id, how:'cash'}; }
  const lc = lastCard.get();
  return {id:lc && cardById(lc) ? lc : ((S.profile.cards[0] || {}).id || ''), how:'default'};
}
function runChecks(r, d, cardMatch, mergeTarget){
  const out = [];
  const t = num(r.total);
  if (t == null) out.push(['bad', 'Gesamtbetrag nicht lesbar. Bitte selbst eintragen.']);
  else out.push(['ok', 'Gesamtbetrag erkannt: ' + money(Math.round(Math.abs(t) * 100)) + '.']);
  if (!validISO(r.date)) out.push(['warn', 'Datum nicht lesbar. Heutiges Datum eingesetzt.']);
  else { const dd = dayDiff(today(), r.date); if (dd < 0) out.push(['warn', 'Datum liegt in der Zukunft.']); else if (dd > 90) out.push(['info', 'Beleg ist älter als 90 Tage.']); }
  if (r.currency && String(r.currency).toUpperCase() !== 'EUR' && r.currency !== '€') out.push(['warn', 'Währung ' + r.currency + '. Betrag bitte in Euro umrechnen.']);
  const items = Array.isArray(r.items) ? r.items.filter(i => num(i && i.total) != null) : [];
  if (items.length && items.length < 40 && t != null) {
    const s = items.reduce((a, i) => a + num(i.total), 0);
    if (Math.abs(s - Math.abs(t)) > 0.05) out.push(['bad', 'Positionen ergeben ' + money(Math.round(s * 100)) + ', Summe laut Beleg ' + money(Math.round(Math.abs(t) * 100)) + '.']);
    else out.push(['ok', 'Summe der ' + items.length + ' Positionen stimmt.']);
  }
  const vat = Array.isArray(r.vat) ? r.vat : [];
  let vatOk = 0, vatBad = 0, grossSum = 0, grossAll = vat.length > 0;
  for (const v of vat) {
    const rate = num(v && v.rate), net = num(v && v.net), tax = num(v && v.tax), gross = num(v && v.gross);
    if (gross == null) grossAll = false; else grossSum += gross;
    if (rate != null && ![0, 10, 13, 20].includes(rate)) out.push([[7, 19].includes(rate) ? 'info' : 'warn', 'Steuersatz ' + rate + ' %' + ([7, 19].includes(rate) ? ' ist ein deutscher Satz (Beleg aus Deutschland?).' : ' ist ungewöhnlich.')]);
    if (rate != null && net != null && tax != null) { if (Math.abs(net * rate / 100 - tax) > 0.05) { vatBad++; out.push(['bad', 'USt ' + rate + ' %: ' + money(Math.round(tax * 100)) + ' passt nicht zu Netto ' + money(Math.round(net * 100)) + '.']); } else vatOk++; }
    if (net != null && tax != null && gross != null && Math.abs(net + tax - gross) > 0.05) { vatBad++; out.push(['bad', 'USt ' + (rate != null ? rate + ' %' : '') + ': Netto + Steuer ergibt nicht Brutto.']); }
  }
  if (vatOk && !vatBad) out.push(['ok', 'Umsatzsteuer rechnerisch korrekt.']);
  if (grossAll && t != null && Math.abs(grossSum - Math.abs(t)) > 0.05) out.push(['warn', 'Steuerzusammenfassung (' + money(Math.round(grossSum * 100)) + ') weicht vom Gesamtbetrag ab.']);
  if (mergeTarget) out.push(['ok', 'Passt zur Buchung ' + (mergeTarget.merchant || catById(mergeTarget.catId).name) + ' vom ' + DAY.format(parseISO(mergeTarget.date)) + '. Bon und Artikel werden dort angehängt.']);
  else if (d.amount) {
    const dup = allEntries().find(e => e.amount === d.amount && validISO(e.date) && Math.abs(dayDiff(e.date, d.date)) <= 3);
    if (dup) out.push(['warn', 'Mögliches Duplikat: ' + (dup.merchant || catById(dup.catId).name) + ' am ' + DAY.format(parseISO(dup.date)) + ' über ' + money(dup.amount) + '.']);
    else out.push(['ok', 'Kein Duplikat in deinen Einträgen gefunden.']);
  }
  if (cardMatch.how === 'last4') out.push(['ok', 'Karte erkannt: ' + cardById(cardMatch.id).name + '.']);
  else if (cardMatch.how === 'unknown') out.push(['warn', 'Karte •••• ' + cardMatch.l4 + ' ist nicht angelegt. Bitte Karte wählen.']);
  else if (cardMatch.how === 'cash') out.push(['ok', 'Barzahlung erkannt.']);
  if (d.type === 'expense' && d.amount) {
    const b = S.profile.budgets[d.catId];
    if (b) {
      const after = (spentByCat(entriesIn(mkey(d.date)))[d.catId] || 0) + d.amount;
      if (after > b) out.push(['warn', 'Budget ' + catById(d.catId).name + ' wird damit um ' + money(after - b) + ' überschritten.']);
      else if (after / b >= 0.8) out.push(['info', 'Budget ' + catById(d.catId).name + ' danach zu ' + Math.round(after / b * 100) + ' % verbraucht.']);
    }
  }
  if (validISO(r.dueDate)) { const dd = dayDiff(r.dueDate, today()); out.push([dd < 0 ? 'warn' : 'info', dd < 0 ? 'Zahlungsfrist ' + DAYL.format(parseISO(r.dueDate)) + ' ist abgelaufen.' : 'Zahlbar bis ' + DAYL.format(parseISO(r.dueDate)) + '.']); }
  if (r.docType === 'sonstiges') out.push(['info', 'Kein klassischer Kassenbon oder Rechnung erkannt.']);
  for (const s of (Array.isArray(r.issues) ? r.issues : []).slice(0, 6)) if (s) out.push(['warn', String(s)]);
  const conf = num(r.confidence);
  if (conf != null && conf < 0.6) out.push(['warn', 'Beleg schlecht lesbar. Werte bitte genau prüfen.']);
  return out;
}
const CHECK_TXT = {ok:'i.O.', warn:'Prüfen', bad:'n.i.O.', info:'Hinweis'};

let scanCtl = null;
const MODELS = {'claude-haiku-5-5':'Haiku 5.5 – schnell, unter 0,1 Cent pro Beleg', 'claude-sonnet-5-5':'Sonnet 5.5 – genauer, ca. 1 Cent pro Beleg'};
const toB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
async function askClaude(blobs, prompt, signal, model){
  const content = [];
  for (const b of blobs) content.push(b.type === 'application/pdf' ? {type:'document', source:{type:'base64', media_type:'application/pdf', data:await toB64(b)}} : {type:'image', source:{type:'base64', media_type:b.type && b.type.startsWith('image/') ? b.type : 'image/jpeg', data:await toB64(b)}});
  content.push({type:'text', text:prompt});
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {method:'POST', signal, referrerPolicy:'no-referrer', headers:{'content-type':'application/json', 'x-api-key':SET.apiKey, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:model || SET.model || 'claude-haiku-5-5', max_tokens:3000, messages:[{role:'user', content}]})});
  } catch (e) { if (e && e.name === 'AbortError') throw {code:'cancelled'}; throw {code:'network'}; }
  let body = null; try { body = await res.json(); } catch (_) {}
  if (!res.ok) {
    const t = body && body.error && body.error.type, m = (body && body.error && body.error.message) || '';
    if (res.status === 401 || res.status === 403 || t === 'authentication_error' || t === 'permission_error') throw {code:'auth'};
    if (/credit|billing|spend|limit/i.test(m) && res.status === 400) throw {code:'billing'};
    if (res.status === 429) throw {code:'rate_limited'};
    if (res.status === 529 || t === 'overloaded_error') throw {code:'overloaded'};
    if (res.status === 400) throw {code:'bad_request', message:m.slice(0, 120)};
    throw {code:'http', message:'HTTP ' + res.status};
  }
  const text = ((body && body.content) || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const o1 = text.indexOf('{'), a1 = text.indexOf('[');
  const arr = a1 >= 0 && (o1 < 0 || a1 < o1);
  const cand = fence ? fence[1] : arr ? text.slice(a1, text.lastIndexOf(']') + 1) : text.slice(o1, text.lastIndexOf('}') + 1);
  try { const v = JSON.parse(cand); if (v && typeof v === 'object') return v; } catch (_) {}
  throw {code:'invalid_json'};
}
function startScanPick(){
  if (!S.canScan) { scanInfo(); return; }
  const inp = $('#receiptInput');
  inp.value = '';
  inp.click();
}
function scanInfo(){
  openSheet('Beleg scannen', '<div class="panel"><h3>KI-Belegscan einrichten</h3><p class="note" style="margin:0">Für den Scan brauchst du einen eigenen Claude-API-Key aus der Claude Console. Er wird nur auf diesem iPhone gespeichert. Ohne Key funktioniert alles andere ganz normal.</p></div><div class="btnrow"><button class="btn primary" data-act="settings" style="flex:1">Zu den Einstellungen</button><button class="btn" data-act="add">Von Hand erfassen</button></div>');
}
async function onReceiptFiles(files){
  if (!files.length) return;
  if (files.some(f => f.type === 'application/pdf' && f.size > 20e6)) { toast('PDF ist größer als 20 MB.'); return; }
  files = files.slice(0, S.maxImgs);
  openSheet('Beleg prüfen', '<div class="status"><span class="spinner" aria-hidden="true"></span><div><strong>Bilder werden vorbereitet …</strong></div></div>');
  const blobs = [];
  for (const f of files) blobs.push(f.type === 'application/pdf' ? f : await toJpeg(f));
  const urls = blobs.map(b => URL.createObjectURL(b));
  const thumbs = '<div class="thumbs">' + urls.map((u, i) => blobs[i].type === 'application/pdf' ? '<span class="pdftile">PDF</span>' : '<img alt="Beleg" src="' + u + '">').join('') + '</div>';
  scanCtl = new AbortController();
  openSheet('Beleg prüfen', thumbs + '<div class="status" id="scanStatus"><span class="spinner" aria-hidden="true"></span><div><strong>Claude liest den Beleg …</strong><div class="note">Das dauert meist 10 bis 40 Sekunden.</div></div></div><button class="btn" id="scanStop">Abbrechen</button>', root => {
    $('#scanStop', root).onclick = () => scanCtl && scanCtl.abort();
    return () => { if (scanCtl) scanCtl.abort(); };
  });
  let r;
  try {
    r = await askClaude(blobs, scanPrompt(), scanCtl.signal);
  } catch (e) {
    scanCtl = null;
    if (e && e.code === 'cancelled') { if (!$('#sheet').hidden) closeSheet(); urls.forEach(u => URL.revokeObjectURL(u)); return; }
    const msg = ({auth:'Der API-Key wird nicht akzeptiert. Bitte in den Einstellungen prüfen.',
      billing:'Kein Guthaben mehr oder Ausgabenlimit erreicht. In der Claude Console aufladen oder Limit anpassen.',
      rate_limited:'Zu viele Anfragen in kurzer Zeit. Eine Minute warten und erneut versuchen.',
      overloaded:'Claude ist gerade ausgelastet. Gleich noch einmal versuchen.',
      network:'Keine Verbindung zu Claude. Internet prüfen und erneut versuchen.',
      bad_request:'Das Bild wurde abgelehnt. Bitte ein anderes Foto verwenden.',
      invalid_json:'Die Antwort war unvollständig. Bitte noch einmal versuchen.'})[e && e.code] || ('Der Beleg konnte nicht gelesen werden' + (e && e.message ? ' (' + e.message + ')' : '') + '. Erneut versuchen oder von Hand erfassen.');
    openSheet('Beleg prüfen', thumbs + '<div class="panel"><h3>Nicht gelesen</h3><p class="note" style="margin:0">' + esc(msg) + '</p></div><div class="btnrow"><button class="btn primary" data-act="scan" style="flex:1">Neues Foto</button><button class="btn" data-act="add">Von Hand erfassen</button></div>');
    return;
  }
  scanCtl = null;
  if (!r || typeof r !== 'object' || Array.isArray(r)) r = {};
  const total = num(r.total);
  const type = r.isRefund ? 'income' : 'expense';
  const okCat = cats().some(c => c.id === r.categoryId && c.kind === type);
  const cm = matchCard(r);
  const draft = {type, amount:total != null ? Math.round(Math.abs(total) * 100) : '', date:validISO(r.date) ? r.date : today(), catId:okCat ? r.categoryId : (type === 'income' ? 'einnahmen' : 'sonstiges'), cardId:cm.id, merchant:r.merchant ? shortMerchant(r.merchant) : '', merchantRaw:r.merchant ? String(r.merchant).slice(0, 80) : '', note:r.note ? String(r.note).slice(0, 80) : ''};
  draft.items = normItems(r.items);
  { const sp = num(r.savingsPrinted); if (sp != null && sp > 0) draft.savings = Math.round(sp * 100); }
  const target = draft.type === 'expense' ? findMergeTarget(draft.amount, draft.date) : null;
  showReview(!!target);
  function showReview(useMerge){
  const d0 = useMerge ? Object.assign(clean(target), {items:draft.items, savings:draft.savings, merchant:(target.source === 'bank' && draft.merchant) ? draft.merchant : (target.merchant || draft.merchant), note:target.note || draft.note}) : Object.assign({}, draft);
  const checks = runChecks(r, d0, cm, useMerge ? target : null), verdict = verdictOf(checks);
  let detail = '';
  const vat = (Array.isArray(r.vat) ? r.vat : []).filter(v => v && num(v.rate) != null);
  if (vat.length) detail += '<div class="tablewrap"><table><thead><tr><th>USt</th><th class="r">Netto</th><th class="r">Steuer</th><th class="r">Brutto</th></tr></thead><tbody>' + vat.map(v => '<tr><td>' + esc(num(v.rate)) + ' %</td><td class="r">' + (num(v.net) != null ? money(Math.round(num(v.net) * 100)) : '–') + '</td><td class="r">' + (num(v.tax) != null ? money(Math.round(num(v.tax) * 100)) : '–') + '</td><td class="r">' + (num(v.gross) != null ? money(Math.round(num(v.gross) * 100)) : '–') + '</td></tr>').join('') + '</tbody></table></div>';
  const items = (Array.isArray(r.items) ? r.items : []).filter(i => i && i.name);
  if (items.length) detail += '<details><summary>Positionen (' + items.length + ')</summary><div class="tablewrap"><table><tbody>' + items.map(i => '<tr><td style="white-space:normal">' + esc(i.name) + '</td><td class="r">' + (num(i.total) != null ? money(Math.round(num(i.total) * 100)) : '–') + '</td></tr>').join('') + '</tbody></table></div></details>';
  const panel = '<section class="panel"><div class="verdict"><div><div class="eyebrow">Prüfergebnis</div><strong>' + (verdict === 'ok' ? 'Beleg ist plausibel' : verdict === 'warn' ? 'Bitte kurz prüfen' : 'Abweichung gefunden') + '</strong></div>' + verdictChip(verdict) + '</div>' +
    '<ul class="checks">' + checks.map(c => '<li><span class="chip ' + c[0] + '">' + CHECK_TXT[c[0]] + '</span><span>' + esc(c[1]) + '</span></li>').join('') + '</ul>' + detail + '</section>';
  d0.ai = {status:verdict, checkedAt:new Date().toISOString(), docType:r.docType || null, findings:checks.filter(c => c[0] === 'bad' || c[0] === 'warn').map(c => c[1]).slice(0, 10)};
  const mergeBox = target ? '<div class="exbar"><span>' + (useMerge ? 'Wird an <b>' + esc(target.merchant || catById(target.catId).name) + '</b> vom ' + esc(DAY.format(parseISO(target.date))) + ' angehängt.' : 'Wird als neue Buchung angelegt.') + '</span><button class="btn small" type="button" id="mg-toggle">' + (useMerge ? 'Neu anlegen' : 'Anhängen') + '</button></div>' : '';
  openSheet('Beleg prüfen', thumbs + panel + mergeBox + entryFormHTML(d0), root => {
    const mg = $('#mg-toggle', root); if (mg) mg.onclick = () => showReview(!useMerge);
    mountEntryForm(root, d0, {
      savedMsg:useMerge ? 'Bon angehängt' : 'Beleg gespeichert',
      beforeSave: async (e) => {
        const rec = blobs.map(b => ({blobId:'b-' + newId() + Math.random().toString(36).slice(2, 5), pdf:b.type === 'application/pdf'}));
        try { await tx('blobs', 'readwrite', st => { rec.forEach((r, i) => st.put(blobs[i], r.blobId)); }); e.receipts = rec; }
        catch (_) { toast('Beleg-Foto nicht gespeichert, Eintrag schon.'); }
      }
    });
  });
  }
}

/* ---------- Apple-Pay-Inbox ---------- */
const INBOX_NAME = 'Kassabuch-Inbox.txt';
function inboxGuide(){
  openSheet('Apple Pay einrichten',
    '<p class="note" style="margin:0">Einmalig, ca. 5 Minuten. Danach schreibt dein iPhone jede Apple-Pay-Zahlung automatisch als Zeile in eine Datei. Die Daten bleiben in deinem iCloud Drive.</p>' +
    '<section class="panel"><h3>1. Inbox-Datei anlegen</h3><p class="note" style="margin:0">Tippe auf den Knopf, dann „In Dateien sichern“ → iCloud Drive → Ordner <b>Shortcuts</b> → Sichern.</p><div class="btnrow"><button class="btn small primary" data-act="inbox-file">Datei ' + INBOX_NAME + ' anlegen</button></div></section>' +
    '<section class="panel"><h3>2. Automation in Kurzbefehle</h3><ol class="steps">' +
    '<li>App <b>Kurzbefehle</b> → <b>Automation</b> → <b>+</b> → <b>Transaktion</b>.</li>' +
    '<li>Alle Karten und Kategorien wählen, <b>Sofort ausführen</b> → Weiter → <b>Neue leere Automation</b>.</li>' +
    '<li>Aktion <b>Text</b> hinzufügen und genau so befüllen (Variablen über die Leiste über der Tastatur einfügen):<br><code>KB|Aktuelles Datum|Betrag|Händler|Karte oder Pass</code><br>Bei <i>Aktuelles Datum</i> auf die Variable tippen → Datumsformat <b>ISO 8601</b>. <i>Betrag</i>, <i>Händler</i>, <i>Karte oder Pass</i> kommen aus der <b>Kurzbefehleingabe</b>.</li>' +
    '<li>Aktion <b>An Textdatei anhängen</b> hinzufügen: Text = Ergebnis der Text-Aktion, Dateipfad <code>' + INBOX_NAME + '</code>, <b>Neue Zeile</b> an.</li>' +
    '<li>Fertig. Einmal mit Apple Pay zahlen und prüfen, ob in der Datei eine Zeile steht.</li></ol></section>' +
    '<section class="panel"><h3>3. Importieren</h3><p class="note" style="margin:0">Hier auf <b>Apple Pay</b> tippen → Datei <b>' + INBOX_NAME + '</b> wählen. Bereits importierte Zahlungen werden erkannt und übersprungen, die Datei musst du nie leeren.</p></section>' +
    '<button class="btn primary" id="g-done">Eingerichtet, jetzt importieren</button>',
    root => { $('#g-done', root).onclick = async () => { SET.inboxSetup = true; await saveSettings(); pickInbox(); }; });
}
async function makeInboxFile(){
  const ok = await deliverFile(INBOX_NAME, '# Kassabuch Apple-Pay-Inbox. Eine Zahlung pro Zeile: KB|Datum|Betrag|Händler|Karte\n', 'text/plain');
  if (ok) toast('Datei erstellt. Im Ordner „Shortcuts“ sichern.');
}
function pickInbox(){ const i = $('#inboxInput'); i.value = ''; i.click(); }
const normMerchant = s => String(s || '').toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').replace(/\b(dankt|gmbh|ag|kg|co|filiale|fil|nr|sagt danke|austria|at)\b/g, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
function guessFromHistory(merchant){
  const n = normMerchant(merchant); if (!n) return null;
  const hist = allEntries().filter(e => e.type === 'expense' && e.merchant).sort(byDateDesc);
  for (const e of hist) { const m = normMerchant(e.merchant); if (m && (m === n || n.startsWith(m + ' ') || m.startsWith(n + ' ') || n.split(' ')[0] === m.split(' ')[0] && n.split(' ')[0].length > 3)) return {catId:e.catId, merchant:e.merchant}; }
  return null;
}
function walletCard(name){
  if (!name) return '';
  if (S.profile.walletMap[name] && cardById(S.profile.walletMap[name])) return S.profile.walletMap[name];
  const n = name.toLowerCase();
  const hit = S.profile.cards.find(c => c.kind !== 'cash' && (n.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(n) || (c.last4 && n.includes(c.last4))));
  return hit ? hit.id : '';
}
function parseInbox(text){
  const rows = []; let bad = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|').map(x => x.trim());
    if (parts[0].toUpperCase() === 'KB') parts.shift();
    const date = parseDateAny(parts[0]); const amt = num(parts[1]);
    if (!date || amt == null || amt === 0) { bad++; continue; }
    rows.push({key:line, date, amount:Math.round(Math.abs(amt) * 100), refund:amt < 0, merchant:(parts[2] || '').slice(0, 80), wallet:(parts[3] || '').slice(0, 60)});
  }
  return {rows, bad};
}
async function onInboxFile(file){
  let text;
  try { text = await readText(file); } catch (_) { toast('Datei konnte nicht gelesen werden.'); return; }
  const {rows, bad} = parseInbox(text);
  const known = new Set(allEntries().map(e => e.importKey).filter(Boolean).concat(S.profile.ignoredImports || []));
  const fresh = rows.filter(r => !known.has(r.key));
  if (!fresh.length) { toast(rows.length ? 'Keine neuen Zahlungen. ' + rows.length + ' schon importiert.' : 'Keine Zahlungen in der Datei gefunden.' + (bad ? ' ' + bad + ' Zeilen unlesbar.' : '')); return; }
  const items = fresh.map(r => {
    const g = r.refund ? null : guessFromHistory(r.merchant);
    const dup = allEntries().find(e => !e.importKey && e.amount === r.amount && e.type !== 'transfer' && validISO(e.date) && Math.abs(dayDiff(e.date, r.date)) <= 3);
    return Object.assign(r, {use:!dup, dup, catId:r.refund ? 'einnahmen' : (g ? g.catId : ''), merchantClean:g ? g.merchant : r.merchant, cardId:walletCard(r.wallet)});
  });
  renderInbox(items, rows.length - fresh.length, bad);
}
function renderInbox(items, skipped, bad){
  const wallets = [...new Set(items.map(i => i.wallet).filter(Boolean))];
  const unmapped = wallets.filter(w => !S.profile.walletMap[w]);
  const open = items.filter(i => i.use && !i.catId && !i.refund).length;
  const rowsHTML = items.map((it, i) => '<div class="irow' + (it.use ? '' : ' off') + '" data-i="' + i + '"><input type="checkbox" id="ib-use-' + i + '"' + (it.use ? ' checked' : '') + ' aria-label="Übernehmen"><label for="ib-use-' + i + '" class="row-main" style="cursor:pointer"><span class="row-title">' + esc(it.merchantClean || 'Unbekannt') + (it.dup ? ' <span class="chip warn">Duplikat?</span>' : '') + '</span><span class="row-sub">' + esc(DAY.format(parseISO(it.date))) + (it.wallet ? ' · ' + esc(it.wallet) : '') + (it.dup ? ' · gleicher Betrag wie ' + esc(it.dup.merchant || catById(it.dup.catId).name) : '') + '</span></label><span class="row-amt ' + (it.refund ? 'pos' : '') + '">' + (it.refund ? '+ ' : '− ') + money(it.amount) + '</span>' +
    '<select class="input" id="ib-cat-' + i + '" aria-label="Kategorie"><option value="">Kategorie wählen …</option>' + catOptions(it.refund ? 'income' : 'expense', it.catId) + '</select></div>').join('');
  openSheet('Apple Pay importieren',
    '<p class="note" style="margin:0">' + items.length + ' neue Zahlung' + (items.length === 1 ? '' : 'en') + (skipped ? ', ' + skipped + ' schon importiert' : '') + (bad ? ', ' + bad + ' Zeile' + (bad === 1 ? '' : 'n') + ' unlesbar' : '') + '.</p>' +
    (unmapped.length ? '<section class="panel"><h3>Wallet-Karten zuordnen</h3><p class="note" style="margin:0">Einmalig. Danach erkennt die App die Karte automatisch.</p>' + unmapped.map((w, j) => '<label class="field"><span>' + esc(w) + '</span><select class="input" id="ib-w-' + j + '">' + cardOptions(walletCard(w)) + '</select></label>').join('') + '</section>' : '') +
    (open && SET.apiKey ? '<button class="btn" id="ib-ai">Kategorien für ' + open + ' Händler mit KI vorschlagen</button><p class="note" id="ib-ai-st" style="margin:0" hidden></p>' : '') +
    '<div class="list" id="ib-list">' + rowsHTML + '</div>' +
    '<p class="note" id="ib-err" role="alert" hidden></p><button class="btn primary" id="ib-go">Übernehmen</button>',
    root => {
      const sync = () => { let n = 0; items.forEach((it, i) => { it.use = $('#ib-use-' + i, root).checked; it.catId = $('#ib-cat-' + i, root).value; root.querySelector('.irow[data-i="' + i + '"]').classList.toggle('off', !it.use); if (it.use) n++; }); $('#ib-go', root).textContent = n + ' übernehmen'; $('#ib-go', root).disabled = !n; };
      root.querySelectorAll('input[type=checkbox], #ib-list select').forEach(el => el.addEventListener('change', sync)); sync();
      const ai = $('#ib-ai', root);
      if (ai) ai.onclick = async () => {
        sync();
        const todo = items.map((it, i) => ({i, m:it.merchant})).filter(x => items[x.i].use && !items[x.i].catId && !items[x.i].refund);
        const st = $('#ib-ai-st', root); ai.disabled = true; st.hidden = false; st.textContent = 'Claude ordnet zu …';
        const list = cats().filter(c => c.kind === 'expense').map(c => c.id + ' = ' + c.name).join('\n');
        const prompt = 'Assign each Austrian card payment merchant string to one expense category and give a short clean merchant name (e.g. "BILLA DANKT 1234 MUSTERORT" -> "Billa").\nCategories (id = name):\n' + list + '\nMerchants:\n' + todo.map(x => x.i + ': ' + x.m).join('\n') + '\nReply with only a JSON array: [{"i": number, "categoryId": string, "merchant": string}]';
        try {
          const res = await askClaude([], prompt, undefined, 'claude-haiku-5-5');
          for (const r of Array.isArray(res) ? res : []) {
            const it = items[Number(r.i)]; if (!it) continue;
            if (cats().some(c => c.id === r.categoryId && c.kind === 'expense')) { it.catId = r.categoryId; $('#ib-cat-' + r.i, root).value = r.categoryId; }
            if (r.merchant) { it.merchantClean = String(r.merchant).slice(0, 80); const t = root.querySelector('.irow[data-i="' + r.i + '"] .row-title'); if (t) t.firstChild.textContent = it.merchantClean; }
          }
          st.textContent = 'Vorschläge eingetragen. Bitte kurz prüfen.'; sync();
        } catch (e) { st.textContent = e && e.code === 'auth' ? 'API-Key ungültig.' : 'Vorschläge nicht möglich. Bitte selbst zuordnen.'; ai.disabled = false; }
      };
      $('#ib-go', root).onclick = async () => {
        sync();
        const err = $('#ib-err', root);
        const missing = items.filter(it => it.use && !it.catId).length;
        if (missing) { err.hidden = false; err.textContent = 'Bitte für ' + missing + ' Zahlung' + (missing === 1 ? '' : 'en') + ' eine Kategorie wählen oder abwählen.'; return; }
        const p = clean(S.profile);
        unmapped.forEach((w, j) => { const v = $('#ib-w-' + j, root).value; if (v) p.walletMap[w] = v; });
        await saveProfile(p);
        const now = new Date().toISOString();
        const list = items.filter(it => it.use).map(it => ({id:newId() + Math.random().toString(36).slice(2, 5), type:it.refund ? 'income' : 'expense', amount:it.amount, date:it.date, catId:it.catId, cardId:p.walletMap[it.wallet] || it.cardId || '', merchant:shortMerchant(it.merchantClean || it.merchant), note:'', source:'applepay', importKey:it.key, createdAt:now}));
        // abgewählte Zahlungen trotzdem als erledigt merken, damit sie nicht wiederkommen
        const skippedKeys = items.filter(it => !it.use).map(it => it.key);
        if (skippedKeys.length) { const q = clean(S.profile); q.ignoredImports = (q.ignoredImports || []).concat(skippedKeys).slice(-500); await saveProfile(q); }
        try { await putEntries(list); closeSheet(); toast(list.length + ' Zahlung' + (list.length === 1 ? '' : 'en') + ' übernommen'); } catch (x) { err.hidden = false; err.textContent = writeErr(x); }
      };
    });
}
