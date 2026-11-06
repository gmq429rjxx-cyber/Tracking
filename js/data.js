// Kassabuch – Start, Migrationen, Daueraufträge
'use strict';
/* ---------- init ---------- */
/* Händler kurz wie im Alltag: "Lidl Österreich GmbH, Filiale Musterort" -> "Lidl" */
const CHAINS = ['Lidl', 'Hofer', 'Billa Plus', 'Billa', 'Interspar', 'Eurospar', 'Spar', 'Penny', 'MPreis', 'Unimarkt', 'Nah&Frisch', 'Merkur', 'dm', 'Bipa', 'Müller', 'Rossmann', 'OMV', 'BP', 'Shell', 'Eni', 'Jet', 'Turmöl', 'Avanti', 'Ikea', 'XXXLutz', 'Möbelix', 'Hornbach', 'Obi', 'Bauhaus', 'Lagerhaus', "McDonald's", 'Burger King', 'Amazon', 'H&M', 'Zara', 'C&A', 'Deichmann', 'Thalia', 'MediaMarkt', 'Hartlauer', 'Fressnapf', 'Action', 'Tedi', 'Kik', 'Pagro', 'Libro', 'Intersport', 'Decathlon', 'Kastner & Öhler'];
const CHAIN_RX = CHAINS.map(n => [n, new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace("'", "['’]?").replace(' ', '\\s*') + '(?![\\p{L}\\d])', 'iu')]);
function shortMerchant(m){
  const raw = String(m || '').trim(); if (!raw) return '';
  for (const [n, rx] of CHAIN_RX) if (rx.test(raw)) return n;
  let t = raw.replace(/[,;\s]+(Filiale|Fil\.|Markt\s*Nr|Standort|Niederlassung|Zweigstelle)\b.*$/iu, '')
    .replace(/(?<![\p{L}])(Ges\.?\s?m\.?\s?b\.?\s?H\.?|GesmbH|GmbH(\s*&\s*Co\.?\s*KG)?|AG|KG|OG|e\.\s?U\.|Warenhandels[\p{L}-]*|Handels[\p{L}-]*|Österreich|Austria)(?![\p{L}])/giu, '')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,;–-]+|[\s,;–-]+$/g, '');
  return t.length >= 2 ? t.slice(0, 60) : raw.slice(0, 60);
}
/* Farbfamilien je Gruppe: Fixkosten blau, Lebenshaltung grün, Variable orange/rot, Sparen violett */
const PLAN_COLORS = {wohnen:2, auto:10, versicherung:12, kinder:9, abos:11, lebensmittel:0, haushalt:15, mobilitaet:14, gesundheit:5, schule:13, freizeit:1, shopping:8, geschenke:6, sonstiges:4, investment:3, ruecklage:17, reisen:19, gehalt:5, beihilfe:0, sonderzahlung:13, einnahmen:7};
async function migrateColors(){
  try {
    if (await kvGet('mig-colors1')) return;
    if (cats().some(c => c.group)) { const p = clean(S.profile); for (const c of p.categories) if (c.id in PLAN_COLORS) c.color = PLAN_COLORS[c.id]; else if (/^lohn-/.test(c.id)) c.color = 14; await saveProfile(p); }
    await kvSet('mig-colors1', 1);
  } catch (_) {}
}
async function migrateMerchants(){
  try {
    if (await kvGet('mig-merchant1')) return;
    const ch = [];
    for (const e of allEntries()) { if (!e.merchant || e.type === 'transfer') continue; const m = shortMerchant(e.merchant); if (m && m !== e.merchant) ch.push(Object.assign(clean(e), {merchant:m, merchantRaw:e.merchantRaw || e.merchant})); }
    if (ch.length) await putEntries(ch);
    const p = clean(S.profile); let pc = false;
    for (const k of Object.keys(p.merchantAlias || {})) { const a = p.merchantAlias[k]; const m = shortMerchant(a.name); if (a.name && m !== a.name) { a.name = m; pc = true; } }
    if (pc) await saveProfile(p);
    await kvSet('mig-merchant1', 1);
  } catch (_) {}
}
async function init(){
  render();
  try {
    idb = await idbOpen();
    const [p, set, list] = await Promise.all([kvGet('profile'), kvGet('settings'), tx('entries', 'readonly', s => s.getAll())]);
    S.profile = normalizeProfile(p || defaultProfile());
    if (!p) await kvSet('profile', clean(S.profile));
    Object.assign(SET, set || {});
    S.canScan = !!SET.apiKey;
    S.entries = new Map((list || []).map(e => [e.id, e]));
    S.mode = 'local'; S.ready = true;
    await bookDue();
    await migrateMerchants();
    await migrateColors();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => { S.persisted = ok; }).catch(() => {});
  } catch (e) {
    S.mode = 'error'; S.banner = 'Der Gerätespeicher ist nicht verfügbar (privates Surfen?). Die App kann so nichts speichern.';
  }
  render();
}

/* ---------- Daueraufträge ---------- */
const FREQ = {monthly:'monatlich', quarterly:'vierteljährlich', yearly:'jährlich', weekly:'wöchentlich'};
const FREQ_PER_MONTH = {monthly:1, quarterly:1 / 3, yearly:1 / 12, weekly:52 / 12};
function occurrences(r, fromISO, toISO){
  const out = [];
  if (!validISO(r.startDate)) return out;
  const from = fromISO > r.startDate ? fromISO : r.startDate;
  const end = r.endDate && r.endDate < toISO ? r.endDate : toISO;
  if (from > end) return out;
  if (r.freq === 'weekly') {
    let d = r.startDate;
    const skip = Math.max(0, Math.floor(dayDiff(from, d) / 7));
    d = addDays(d, skip * 7);
    for (let i = 0; i < 600 && d <= end; i++, d = addDays(d, 7)) if (d >= from) out.push(d);
    return out;
  }
  const step = r.freq === 'yearly' ? 12 : r.freq === 'quarterly' ? 3 : 1;
  const day = r.day || parseISO(r.startDate).getDate();
  for (let i = 0; i < 1200; i++) {
    const k = addMonths(mkey(r.startDate), i * step), d = k + '-' + pad(Math.min(day, dim(k)));
    if (d > end) break;
    if (d >= from) out.push(d);
  }
  return out;
}
const isActive = r => r.active !== false && !(r.endDate && r.endDate < today());
const nextDue = r => isActive(r) ? (occurrences(r, addDays(today(), 1), addDays(today(), 400))[0] || null) : null;
function relDays(iso){ const n = dayDiff(iso, today()); return n === 0 ? 'heute' : n === 1 ? 'morgen' : n < 0 ? 'vor ' + (-n) + ' Tagen' : 'in ' + n + ' Tagen'; }
function entryFromRule(r, d){
  const e = {id:newId() + Math.random().toString(36).slice(2, 5), type:r.type, amount:r.amount, date:d, catId:r.type === 'transfer' ? '' : r.catId, cardId:r.cardId || '', merchant:r.type === 'transfer' ? '' : (r.merchant || ''), note:r.note || '', recurringId:r.id, importKey:'rec:' + r.id + ':' + d, createdAt:new Date().toISOString()};
  if (r.type === 'transfer') e.toCardId = r.toCardId;
  if (r.example) { e.example = true; if (!e.note) e.note = 'Beispiel'; }
  return e;
}
let booking = false;
async function bookDue(silent){
  if (booking || !S.ready) return 0;
  booking = true;
  try {
    const t = today(), p = clean(S.profile), add = [];
    const keys = new Set(allEntries().map(e => e.importKey).filter(Boolean));
    let changed = false;
    for (const r of p.recurring) {
      if (r.active === false) continue;
      const from = r.lastBooked ? addDays(r.lastBooked, 1) : r.startDate;
      const occ = occurrences(r, from, t).slice(-36);
      for (const d of occ) { const k = 'rec:' + r.id + ':' + d; if (!keys.has(k)) { keys.add(k); add.push(entryFromRule(r, d)); } }
      if (occ.length) { r.lastBooked = occ[occ.length - 1]; changed = true; }
    }
    if (changed) await saveProfile(p);
    if (add.length) { await putEntries(add); if (!silent) toast(add.length + (add.length === 1 ? ' Dauerauftrag' : ' Daueraufträge') + ' gebucht'); }
    S.bookedOn = t;
    return add.length;
  } catch (e) { toast(writeErr(e)); return 0; }
  finally { booking = false; }
}
function ruleTitle(r){ return r.merchant || r.note || (r.type === 'transfer' ? 'Umbuchung' : catById(r.catId).name); }
function ruleSub(r){
  const when = r.freq === 'weekly' ? 'wöchentlich' : FREQ[r.freq] + ' am ' + (r.day || parseISO(r.startDate).getDate()) + '.';
  const card = r.type === 'transfer' ? ((cardById(r.cardId) || {}).name || '?') + ' → ' + ((cardById(r.toCardId) || {}).name || '?') : (cardById(r.cardId) || {}).name;
  return [when, card].filter(Boolean).join(' · ');
}
function ruleRow(r){
  const cat = r.type === 'transfer' ? TRANSFER_CAT : catById(r.catId), nd = nextDue(r), act = isActive(r);
  return '<button class="row" data-act="rec-edit" data-id="' + esc(r.id) + '">' + badge(cat) + '<span class="row-main"><span class="row-title">' + esc(ruleTitle(r)) + (act ? '' : ' <span class="chip info">gekündigt</span>') + '</span><span class="row-sub">' + esc(ruleSub(r)) + '</span></span><span class="row-end"><span class="row-amt ' + (r.type === 'income' ? 'pos' : r.type === 'transfer' ? 'muted' : '') + '">' + (r.type === 'income' ? '+ ' : r.type === 'transfer' ? '' : '− ') + money(r.amount) + '</span>' + (nd ? '<span class="row-date">' + esc(relDays(nd)) + '</span>' : '') + '</span></button>';
}
function fixedSums(){
  let exp = 0, inc = 0;
  for (const r of S.profile.recurring) if (isActive(r)) { const m = r.amount * (FREQ_PER_MONTH[r.freq] || 1); if (r.type === 'expense') exp += m; else if (r.type === 'income') inc += m; }
  return {exp:Math.round(exp), inc:Math.round(inc)};
}
function viewFixed(){
  const rules = S.profile.recurring.slice();
  let h = '<div class="monthbar"><h1>Fixkosten</h1><button class="btn small" data-act="rec-add">' + ICON.plus + 'Dauerauftrag</button></div><div style="display:flex;flex-direction:column;gap:18px">';
  if (!rules.length) return h + '<div class="list"><div class="empty"><strong>Noch keine Daueraufträge</strong><span>Kredit, Miete, Abos oder Gehalt einmal anlegen. Sie werden dann am Fälligkeitstag automatisch gebucht.</span><button class="btn small primary" data-act="rec-add">Ersten Dauerauftrag anlegen</button></div></div></div>';
  const fs = fixedSums();
  h += '<section class="hero"><div><div class="eyebrow">Fixkosten pro Monat</div><div class="big">' + money(fs.exp) + '</div></div><div class="kv"><div><span>Pro Jahr</span><strong>' + money0(fs.exp * 12) + '</strong></div><div><span>Fixe Einnahmen</span><strong class="pos">' + money0(fs.inc) + '</strong></div><div><span>Bleibt frei</span><strong class="' + (fs.inc - fs.exp < 0 ? 'badtxt' : '') + '">' + money0(fs.inc - fs.exp) + '</strong></div></div><p class="note" style="margin:0">Vierteljährliche und jährliche Beträge sind auf den Monat umgerechnet.</p></section>';
  const up = [];
  for (const r of rules) if (isActive(r)) for (const d of occurrences(r, addDays(today(), 1), addDays(today(), 30))) up.push({r, d});
  up.sort((a, b) => a.d.localeCompare(b.d));
  h += '<section class="block"><div class="block-head"><h2>Nächste 30 Tage</h2><span class="note">' + money(up.filter(x => x.r.type === 'expense').reduce((a, x) => a + x.r.amount, 0)) + ' ab</span></div>';
  h += up.length ? '<div class="list">' + up.slice(0, 12).map(({r, d}) => '<button class="row" data-act="rec-edit" data-id="' + esc(r.id) + '">' + badge(r.type === 'transfer' ? TRANSFER_CAT : catById(r.catId)) + '<span class="row-main"><span class="row-title">' + esc(ruleTitle(r)) + '</span><span class="row-sub">' + esc(DAY.format(parseISO(d))) + '</span></span><span class="row-end"><span class="row-amt ' + (r.type === 'income' ? 'pos' : '') + '">' + (r.type === 'income' ? '+ ' : r.type === 'transfer' ? '' : '− ') + money(r.amount) + '</span><span class="reldays">' + esc(relDays(d)) + '</span></span></button>').join('') + '</div>' : '<div class="list"><div class="empty">Keine Abbuchungen in den nächsten 30 Tagen.</div></div>';
  h += '</section>';
  const order = {expense:0, transfer:1, income:2};
  rules.sort((a, b) => (isActive(b) - isActive(a)) || order[a.type] - order[b.type] || b.amount * (FREQ_PER_MONTH[b.freq] || 1) - a.amount * (FREQ_PER_MONTH[a.freq] || 1));
  h += '<section class="block"><div class="block-head"><h2>Alle Daueraufträge</h2><span class="note">' + rules.filter(isActive).length + ' aktiv</span></div><div class="list">' + rules.map(ruleRow).join('') + '</div></section>';
  return h + '</div>';
}
function openRecurring(id){
  const r0 = S.profile.recurring.find(x => x.id === id); if (!r0) return;
  const r = clean(r0), act = isActive(r), tr = r.type === 'transfer';
  const count = allEntries().filter(e => e.recurringId === id).length;
  openSheet('Dauerauftrag',
    '<form id="rForm" style="display:flex;flex-direction:column;gap:14px" novalidate>' +
    '<label class="field"><span>Betrag</span><span class="amount-wrap"><b>€</b><input class="input amount" id="r-amount" inputmode="decimal" value="' + esc((r.amount / 100).toFixed(2).replace('.', ',')) + '"></span></label>' +
    (tr ? '' : '<label class="field"><span>' + (r.type === 'income' ? 'Zahler' : 'Händler') + '</span><input class="input" id="r-merchant" value="' + esc(r.merchant || '') + '"></label>') +
    '<div class="formgrid"><label class="field"><span>Turnus</span><select class="input" id="r-freq">' + Object.entries(FREQ).map(([k, v]) => '<option value="' + k + '"' + (r.freq === k ? ' selected' : '') + '>' + v.charAt(0).toUpperCase() + v.slice(1) + '</option>').join('') + '</select></label>' +
    '<label class="field" id="r-day-f"><span>Am Tag</span><input class="input" id="r-day" inputmode="numeric" maxlength="2" value="' + esc(r.day || parseISO(r.startDate).getDate()) + '"></label>' +
    '<label class="field"><span>' + (tr ? 'Von' : 'Karte') + '</span><select class="input" id="r-card">' + cardOptions(r.cardId) + '</select></label>' +
    (tr ? '<label class="field"><span>Nach</span><select class="input" id="r-to">' + cardOptions(r.toCardId) + '</select></label>' : '<label class="field"><span>Kategorie</span><select class="input" id="r-cat">' + catOptions(r.type, r.catId) + '</select></label>') +
    '<label class="field full"><span>Endet am (optional)</span><input class="input" type="date" id="r-end" value="' + esc(r.endDate || '') + '"></label></div>' +
    '<p class="note" style="margin:0">Seit ' + esc(DAYL.format(parseISO(r.startDate))) + ' · ' + count + (count === 1 ? ' Buchung' : ' Buchungen') + (nextDue(r) ? ' · nächste ' + esc(DAYL.format(parseISO(nextDue(r)))) : '') + '. Änderungen gelten ab der nächsten Buchung.</p>' +
    '<p class="note" id="r-err" role="alert" hidden></p>' +
    '<div class="btnrow"><button class="btn primary" type="submit" style="flex:1">Speichern</button>' + (act ? '<button class="btn" type="button" id="r-stop">Kündigen</button>' : '<button class="btn" type="button" id="r-resume">Fortsetzen</button>') + '<button class="btn danger" type="button" id="r-del">Löschen</button></div><div id="r-confirm"></div></form>',
    root => {
      const sync = () => { $('#r-day-f', root).hidden = $('#r-freq', root).value === 'weekly'; };
      $('#r-freq', root).addEventListener('change', sync); sync();
      const write = async next => { const p = clean(S.profile); const i = p.recurring.findIndex(x => x.id === id); if (i < 0) return; p.recurring[i] = next; await saveProfile(p); };
      $('#rForm', root).addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = $('#r-err', root), fail = m => { err.hidden = false; err.textContent = m; };
        const amt = toCents($('#r-amount', root).value), day = parseInt($('#r-day', root).value, 10), end = $('#r-end', root).value;
        if (amt == null || amt === 0) return fail('Bitte einen Betrag eingeben.');
        if ($('#r-freq', root).value !== 'weekly' && !(day >= 1 && day <= 31)) return fail('Tag muss zwischen 1 und 31 liegen.');
        const next = Object.assign({}, r, {amount:Math.abs(amt), freq:$('#r-freq', root).value, day:$('#r-freq', root).value === 'weekly' ? null : day, cardId:$('#r-card', root).value, endDate:end || null});
        if (tr) { next.toCardId = $('#r-to', root).value; if (!next.cardId || !next.toCardId || next.cardId === next.toCardId) return fail('Bitte zwei verschiedene Karten wählen.'); }
        else { next.catId = $('#r-cat', root).value; next.merchant = $('#r-merchant', root).value.trim(); }
        if (next.example && next.merchant !== r.merchant) delete next.example;
        await write(next); closeSheet(); toast('Dauerauftrag gespeichert');
      });
      const stop = $('#r-stop', root);
      if (stop) stop.onclick = async () => { await write(Object.assign({}, r, {endDate:today()})); closeSheet(); toast('Gekündigt. Ab morgen wird nicht mehr gebucht.'); };
      const resume = $('#r-resume', root);
      if (resume) resume.onclick = async () => { await write(Object.assign({}, r, {endDate:null, active:true, lastBooked:today()})); closeSheet(); toast('Läuft wieder ab der nächsten Fälligkeit'); };
      $('#r-del', root).onclick = () => {
        $('#r-confirm', root).innerHTML = '<div class="confirm"><strong>Dauerauftrag löschen?</strong><span class="note">Die ' + count + ' bisherigen Buchungen bleiben erhalten.</span><div class="btnrow"><button type="button" class="btn danger small" id="r-yes">Ja, löschen</button><button type="button" class="btn small" id="r-no">Abbrechen</button></div></div>';
        $('#r-no', root).onclick = () => { $('#r-confirm', root).innerHTML = ''; };
        $('#r-yes', root).onclick = async () => { const p = clean(S.profile); p.recurring = p.recurring.filter(x => x.id !== id); await saveProfile(p); closeSheet(); toast('Dauerauftrag gelöscht'); };
      };
    });
}
