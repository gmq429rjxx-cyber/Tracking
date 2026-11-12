// Kassabuch – Hilfsfunktionen, Datenmodell, Speicher (IndexedDB), Beispieldaten
'use strict';
const APP_VERSION = '2026.11.12-1';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MF = new Intl.NumberFormat('de-AT', {style:'currency', currency:'EUR'});
const MF0 = new Intl.NumberFormat('de-AT', {style:'currency', currency:'EUR', maximumFractionDigits:0, minimumFractionDigits:0});
const money = c => { const v = (c || 0) / 100; return (v < 0 ? '− ' : '') + MF.format(Math.abs(v)); };
const money0 = c => { const v = Math.round((c || 0) / 100); return (v < 0 ? '− ' : '') + MF0.format(Math.abs(v)); };
const pad = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => isoOf(new Date());
const parseISO = s => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2] || 1); };
const validISO = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseISO(s));
const mkey = s => String(s).slice(0, 7);
const addMonths = (k, n) => { const p = k.split('-').map(Number); const d = new Date(p[0], p[1] - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const dim = k => { const p = k.split('-').map(Number); return new Date(p[0], p[1], 0).getDate(); };
const MONTH = new Intl.DateTimeFormat('de-AT', {month:'long', year:'numeric'});
const MON_S = new Intl.DateTimeFormat('de-AT', {month:'short'});
const DAY = new Intl.DateTimeFormat('de-AT', {weekday:'short', day:'numeric', month:'short'});
const DAYL = new Intl.DateTimeFormat('de-AT', {day:'numeric', month:'short', year:'numeric'});
const monthLabel = k => MONTH.format(parseISO(k + '-01'));
/* Kurze, stabile Buchungs-ID (7 Zeichen, ohne I, L, O, U) aus der internen ID: gleich in App, CSV und PDF */
function txId(e){
  const s = String((e && e.id) || ''), mix = h => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 0x5bd1e995); }
  a = mix(a ^ s.length); b = mix(b ^ a);
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let o = '';
  for (let k = 0; k < 7; k++) { o += A[(k < 6 ? a >>> (k * 5) : b) & 31]; }
  return o;
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = v => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseNum(String(v)); return isFinite(n) ? n : null; };
function parseNum(s){
  s = String(s).trim().replace(/€|EUR|\s| /gi, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-') || s.startsWith('−')) { neg = true; s = s.slice(1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('+')) s = s.slice(1);
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > ld) s = s.replace(/\./g, '').replace(',', '.');
  else if (ld > lc) s = s.replace(/,/g, '');
  const n = Number(s);
  return isNaN(n) || s === '' ? NaN : (neg ? -n : n);
}
const toCents = v => { const n = num(v); return n == null ? null : Math.round(n * 100); };
const addDays = (iso, n) => { const d = parseISO(iso); return isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
const dayDiff = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 864e5);

const ICON = {
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  card:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  left:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  right:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  bank:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2-2h11v4"/><path d="M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2" fill="currentColor"/></svg>',
  clip:'<svg class="clip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7-7l8.5-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.3-2.4l7.9-7.9"/></svg>'
};
const CAT_ICON = {
  lebensmittel:'<path d="M4 9h16l-1.5 10a1 1 0 0 1-1 .9h-11a1 1 0 0 1-1-.9zM8 9l3-5M16 9l-3-5"/>',
  wohnen:'<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM10 20v-5h4v5"/>',
  mobilitaet:'<path d="M5 16v-4l2-5h10l2 5v4zM5 16v2.5M19 16v2.5M8 13h.01M16 13h.01"/>',
  restaurant:'<path d="M5 9h11v4a5 5 0 0 1-10 0zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M9 4v2.5M12 4v2.5"/>',
  freizeit:'<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  kinder:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4z"/>',
  gesundheit:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  abos:'<path d="M17 3l3 3-3 3M4 12v-2a4 4 0 0 1 4-4h12M7 21l-3-3 3-3M20 12v2a4 4 0 0 1-4 4H4"/>',
  versicherung:'<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>',
  shopping:'<path d="M6 8h12l-1 12H7zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
  sonstiges:'<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  gehalt:'<path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16"/>',
  beihilfe:'<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.6 14.2A5 5 0 0 1 21 19"/>',
  einnahmen:'<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  auto:'<path d="M5 16v-4l2-5h10l2 5v4zM5 16v2.5M19 16v2.5M8 13h.01M16 13h.01"/>',
  haushalt:'<path d="M9 3h6l-1 4h-4zM8 7h8l1 14H7z"/>',
  schule:'<path d="M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5"/>',
  geschenke:'<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-4 0M12 7c2-4 6-3 4 0"/>',
  reisen:'<path d="M3 15l18-7-6 12-3-5zM12 15l9-7"/>',
  investment:'<path d="M4 18l5-6 4 3 7-8M15 7h5v5"/>',
  ruecklage:'<path d="M5 9h14v11H5zM8 9V6a4 4 0 0 1 8 0v3M12 13v3"/>',
  lohn:'<path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16"/>',
  sonderzahlung:'<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>'
};
const TABS = [['uebersicht','Übersicht','home'],['eintraege','Einträge','list'],['__add','',''],['budgets','Budgets','target'],['statistik','Statistik','chart']];
const ROUTES = ['uebersicht','eintraege','budgets','karten','statistik','fixkosten'];
const KIND = {debit:'Debitkarte', credit:'Kreditkarte', account:'Konto', cash:'Bargeld'};

/* ---------- data model ---------- */
const DEFAULT_CATS = [
  ['lebensmittel','Lebensmittel',0,'expense'], ['wohnen','Wohnen & Energie',2,'expense'], ['mobilitaet','Mobilität & Tanken',7,'expense'],
  ['restaurant','Restaurant & Café',1,'expense'], ['freizeit','Freizeit',3,'expense'], ['kinder','Kinder',8,'expense'],
  ['gesundheit','Gesundheit & Drogerie',9,'expense'], ['abos','Abos & Verträge',6,'expense'], ['versicherung','Versicherungen',4,'expense'],
  ['shopping','Shopping',5,'expense'], ['sonstiges','Sonstiges',7,'expense'],
  ['gehalt','Gehalt',5,'income'], ['beihilfe','Familienbeihilfe',0,'income'], ['einnahmen','Sonstige Einnahmen',2,'income']
].map(([id, name, color, kind]) => ({id, name, color, kind}));
const defaultProfile = () => ({v:1, cards:[], categories:JSON.parse(JSON.stringify(DEFAULT_CATS)), budgets:{}, totalBudget:null, exampleBudgetKeys:[], walletMap:{}, recurring:[], bankMap:{}, ibanMap:{}, merchantAlias:{}, createdAt:new Date().toISOString()});
function normalizeProfile(p){
  const o = JSON.parse(JSON.stringify(p || {}));
  if (!Array.isArray(o.categories) || !o.categories.length) o.categories = JSON.parse(JSON.stringify(DEFAULT_CATS));
  if (!Array.isArray(o.cards)) o.cards = [];
  if (!o.budgets || typeof o.budgets !== 'object') o.budgets = {};
  if (!Array.isArray(o.exampleBudgetKeys)) o.exampleBudgetKeys = [];
  if (!o.walletMap || typeof o.walletMap !== 'object') o.walletMap = {};
  if (!Array.isArray(o.recurring)) o.recurring = [];
  for (const k of ['bankMap', 'ibanMap', 'merchantAlias']) if (!o[k] || typeof o[k] !== 'object') o[k] = {};
  if (o.totalBudget === undefined) o.totalBudget = null;
  return o;
}

const S = {
  mode:'loading', uid:null, profile:defaultProfile(), entries:new Map(), month:mkey(today()), tab:'uebersicht',
  q:'', fCard:'', fCat:'', fPers:'', statsMode:'month', statsYear:new Date().getFullYear(),
  canScan:false, imgTypes:['image/jpeg','image/png','image/webp','image/gif'], maxImgs:4, banner:'', ready:false, persisted:false
};
let idb = null;
const SET = {apiKey:'', model:'claude-haiku-5-5', lastBackup:null};

const cats = () => S.profile.categories;
const catById = id => cats().find(c => c.id === id) || {id, name:'Ohne Kategorie', color:7, kind:'expense'};
const cardById = id => S.profile.cards.find(c => c.id === id);
const allEntries = () => [...S.entries.values()];
const entriesIn = prefix => allEntries().filter(e => typeof e.date === 'string' && e.date.startsWith(prefix));
/* Spar-Kategorien (Investment, Rücklage) zählen nicht als Ausgabe, sondern als gespart */
const isSaving = id => !!(cats().find(c => c.id === id) || {}).saving;
/* Entnahme = Einnahme in einer Spar-Kategorie: senkt „Gespart“ und das Sparziel, zählt nicht als Einnahme */
const isWithdrawal = e => e.type === 'income' && isSaving(e.catId);
const catFits = (c, type) => c.kind === type || (type === 'income' && !!c.saving);
function sums(list){ let inc = 0, exp = 0, sav = 0; for (const e of list) { if (isWithdrawal(e)) sav -= e.amount || 0; else if (e.type === 'income') inc += e.amount || 0; else if (e.type === 'expense') { if (isSaving(e.catId)) sav += e.amount || 0; else exp += e.amount || 0; } } return {inc, exp, sav, bal:inc - exp - sav}; }
function spentByCat(list){ const m = {}; for (const e of list) { if (e.type === 'expense') m[e.catId] = (m[e.catId] || 0) + (e.amount || 0); else if (isWithdrawal(e)) m[e.catId] = (m[e.catId] || 0) - (e.amount || 0); } return m; }
function paceOf(k){ const t = today(); if (mkey(t) === k) return parseISO(t).getDate() / dim(k); return k < mkey(t) ? 1 : 0; }
/* Ampel: über 100 % = überschritten; ab 85 % = knapp; ab dem 10. Tag zusätzlich knapp, wenn der Verbrauch 20 Punkte vor dem Kalender liegt (Fixkosten am Monatsanfang lösen so keinen Fehlalarm aus) */
function budgetState(spent, budget, pace){ if (!budget) return null; const r = spent / budget; if (r > 1) return 'bad'; if (r >= 0.85 || (pace >= 0.33 && pace < 1 && r > pace + 0.2)) return 'warn'; return 'ok'; }
const STATE_TXT = {ok:'im Rahmen', warn:'knapp', bad:'überschritten', done:'bezahlt', open:'offen'};
/* Fixe Kosten werden einmal im Monat fällig – Tempo-Vergleich wäre falsch */
function isFixedCat(c){ return /fix/i.test(c.group || '') || S.profile.recurring.some(r => r.catId === c.id && r.type === 'expense' && isActive(r)); }
function catState(c, spent, budget, pace){ if (!budget) return null; if (!isFixedCat(c)) return budgetState(spent, budget, pace); return fixState(spent, budget); }   // Fixkosten: Höchstbetrag, kein Tempo-Vergleich
function fixState(spent, budget){ if (spent > budget) return 'bad'; if (spent === budget) return 'ok'; return spent / budget >= 0.9 ? 'warn' : 'ok'; }   // 90–99 % knapp, genau getroffen = im Rahmen
/* Ohne eigenes Gesamtbudget zählen nur Ausgaben in Kategorien mit Budget, sonst wäre der Vergleich schief */
/* Basis fürs Tagesbudget: mit Fixkosten-Gruppe nur variable Kategorien, sonst Gesamtbudget minus noch fällige Daueraufträge */
function dailyBase(k){
  const exp = cats().filter(c => c.kind === 'expense' && !c.saving && S.profile.budgets[c.id]);
  if (!S.profile.totalBudget && exp.some(isFixedCat)) {
    const ids = new Set(exp.filter(c => !isFixedCat(c)).map(c => c.id));
    return {budget:exp.filter(c => ids.has(c.id)).reduce((a, c) => a + S.profile.budgets[c.id], 0), due:0, hint:' · ohne Fixkosten',
      spent:l => l.reduce((a, e) => a + (e.type === 'expense' && ids.has(e.catId) ? e.amount : 0), 0)};
  }
  const t = today(), end = k + '-' + String(dim(k)).padStart(2, '0'); let due = 0;
  for (const r of S.profile.recurring) if (isActive(r) && r.type === 'expense' && !isSaving(r.catId) && (S.profile.totalBudget || S.profile.budgets[r.catId])) due += occurrences(r, addDays(t, 1), end).length * r.amount;
  return {budget:totalBudget(), due, spent:budgetSpent, hint:due ? ' · ' + money0(due) + ' Fixkosten noch fällig' : ''};
}
function budgetSpent(list){ if (S.profile.totalBudget) return sums(list).exp; const sp = spentByCat(list); let t = 0; for (const c of cats()) if (c.kind === 'expense' && !c.saving && S.profile.budgets[c.id]) t += sp[c.id] || 0; return t; }
function totalBudget(){ if (S.profile.totalBudget) return S.profile.totalBudget; let t = 0; for (const c of cats()) if (c.kind === 'expense' && !c.saving && S.profile.budgets[c.id]) t += S.profile.budgets[c.id]; return t || 0; }
function billingPeriod(card, refISO){
  const d = parseISO(refISO || today()); const cd = card.closingDay;
  const clamp = (y, m) => Math.min(cd, new Date(y, m + 1, 0).getDate());
  let endY = d.getFullYear(), endM = d.getMonth();
  if (d.getDate() > clamp(endY, endM)) { endM += 1; if (endM > 11) { endM = 0; endY++; } }
  const end = new Date(endY, endM, clamp(endY, endM));
  let sY = endY, sM = endM - 1; if (sM < 0) { sM = 11; sY--; }
  const start = new Date(sY, sM, clamp(sY, sM) + 1);
  return {from:isoOf(start), to:isoOf(end)};
}
/* Anzeige-Stand: Konto/Bar = Guthaben, Kreditkarte = offener Betrag */
function cardStatus(cd){
  const bal = cardBalance(cd); if (bal == null) return {known:false};
  if (cd.kind === 'credit') return bal <= 0 ? {known:true, label:'offen', v:-bal, raw:bal, bad:bal < 0} : {known:true, label:'Guthaben', v:bal, raw:bal};
  return {known:true, label:'Stand', v:bal, raw:bal, bad:bal < 0};
}
function cardBalance(card){
  if (card.startBalance == null) return null;
  let b = card.startBalance;
  const from = card.startDate || '';
  for (const e of allEntries()) {
    /* Stichtag: Buchungen davor stecken im Stand; am Stichtag selbst zählen nur die nach dem Eintragen erfassten */
    if (from && (e.date < from || (e.date === from && card.startAt && (e.createdAt || '') <= card.startAt))) continue;
    if (e.type === 'transfer') { if (e.cardId === card.id) b -= e.amount; if (e.toCardId === card.id) b += e.amount; }
    else if (e.cardId === card.id) b += e.type === 'income' ? e.amount : -e.amount;
  }
  return b;
}

/* ---------- persistence: IndexedDB, nur auf diesem Gerät ---------- */
const clean = o => JSON.parse(JSON.stringify(o));
function idbOpen(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('kassabuch', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('entries', {keyPath:'id'}); d.createObjectStore('blobs'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn){
  return new Promise((res, rej) => {
    const t = idb.transaction(store, mode); let out;
    const st = Array.isArray(store) ? store.map(n => t.objectStore(n)) : t.objectStore(store);
    out = fn(st);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const kvGet = k => tx('kv', 'readonly', s => s.get(k));
const kvSet = (k, v) => tx('kv', 'readwrite', s => { s.put(v, k); });
function writeErr(e){
  if (e && e.name === 'QuotaExceededError') return 'Speicher am Gerät voll. Alte Belegfotos löschen oder Backup machen.';
  return 'Speichern fehlgeschlagen. App neu öffnen und erneut versuchen.';
}
function saveProfile(next){
  S.profile = normalizeProfile(next); render();
  return kvSet('profile', clean(S.profile)).catch(e => toast(writeErr(e)));
}
async function saveEntry(e){
  e.updatedAt = new Date().toISOString();
  if (!e.createdAt) e.createdAt = e.updatedAt;
  S.entries.set(e.id, e); render();
  await tx('entries', 'readwrite', s => { s.put(clean(e)); });
}
async function putEntries(list){ for (const e of list) S.entries.set(e.id, e); await tx('entries', 'readwrite', s => { for (const e of list) s.put(clean(e)); }); render(); }
async function deleteEntries(ids){
  const blobIds = [];
  for (const id of ids) { const e = S.entries.get(id); if (e && e.receipts) for (const r of e.receipts) if (r.blobId) blobIds.push(r.blobId); S.entries.delete(id); }
  render();
  await tx(['entries', 'blobs'], 'readwrite', ([es, bs]) => { for (const id of ids) es.delete(id); for (const b of blobIds) bs.delete(b); });
}
const deleteEntry = id => deleteEntries([id]);
async function saveSettings(){ await kvSet('settings', clean(SET)); S.canScan = !!SET.apiKey; }
const blobUrls = new Map();
async function blobUrl(id){
  if (blobUrls.has(id)) return blobUrls.get(id);
  const b = await tx('blobs', 'readonly', s => s.get(id));
  if (!b) return '';
  const u = URL.createObjectURL(b); blobUrls.set(id, u); return u;
}
function hydrateBlobs(root){ root.querySelectorAll('a[data-blob-link]').forEach(async a => { const u = await blobUrl(a.dataset.blobLink); if (u) a.href = u; }); root.querySelectorAll('img[data-blob]').forEach(async img => { const u = await blobUrl(img.dataset.blob); if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('span'), {className:'note', textContent:'Foto nicht mehr vorhanden'})); }); }

/* ---------- examples ---------- */
function makeExamples(){
  const exStart = addMonths(mkey(today()), -2) + '-01';
  const cards = [
    {id:'bsp-debit', name:'Girokonto', kind:'debit', color:2, last4:'4821', startBalance:185000, startDate:exStart, example:true},
    {id:'bsp-visa', name:'Visa', kind:'credit', color:1, last4:'9034', closingDay:20, example:true},
    {id:'bsp-bar', name:'Geldbörse', kind:'cash', color:5, startBalance:25000, startDate:exStart, example:true}
  ];
  const budgets = {lebensmittel:60000, restaurant:15000, freizeit:12000, mobilitaet:25000, shopping:20000, abos:8000};
  const T = [
    [1,'income',318000,'gehalt','bsp-debit','Arbeitgeber'], [2,'expense',8900,'wohnen','bsp-debit','Energie AG'],
    [3,'expense',98000,'wohnen','bsp-debit','Wohnbaukredit'], [21,'transfer',60000,'','bsp-debit','Visa-Abrechnung','bsp-visa'], [13,'transfer',10000,'','bsp-debit','Bankomat','bsp-bar'],    [4,'expense',6230,'lebensmittel','bsp-visa','Billa'], [5,'expense',1399,'abos','bsp-visa','Netflix'],
    [6,'expense',5480,'mobilitaet','bsp-visa','OMV Tankstelle'], [7,'expense',5600,'restaurant','bsp-visa','Pizzeria Da Mario'],
    [8,'expense',3415,'lebensmittel','bsp-debit','Hofer'], [9,'expense',2290,'restaurant','bsp-bar','Gasthaus Post'],
    [10,'income',30120,'beihilfe','bsp-debit','Finanzamt'], [11,'expense',1890,'gesundheit','bsp-visa','dm'],
    [12,'expense',4599,'abos','bsp-debit','A1 Telekom'], [14,'expense',8714,'lebensmittel','bsp-visa','Spar'],
    [15,'expense',4250,'versicherung','bsp-debit','Wiener Städtische'], [16,'expense',3600,'freizeit','bsp-visa','Cineplexx'],
    [18,'expense',5810,'mobilitaet','bsp-visa','OMV Tankstelle'], [19,'expense',2450,'kinder','bsp-bar','Fußballverein'],
    [21,'expense',7120,'lebensmittel','bsp-visa','Billa'], [23,'expense',6490,'shopping','bsp-visa','Intersport'],
    [24,'expense',3890,'restaurant','bsp-visa','Gasthaus Post'], [26,'expense',5270,'lebensmittel','bsp-debit','Hofer'],
    [28,'expense',1799,'abos','bsp-visa','Spotify Family']
  ];
  const cur = mkey(today()), tDay = parseISO(today()).getDate();
  const entries = [];
  [-2, -1, 0].forEach((off, mi) => {
    const k = addMonths(cur, off);
    T.forEach(([day, type, cents, catId, cardId, merchant, toCardId], i) => {
      const d = day;
      if (off === 0 && day > tDay) return;
      const f = type !== 'expense' || ['wohnen','abos','versicherung'].includes(catId) ? 1 : 1 + ((((i + 3) * (mi + 5)) % 13) - 6) / 100;
      const ex = {id:'bsp-' + k + '-' + i, type, amount:Math.round(cents * (type === 'transfer' ? 1 : f)), date:k + '-' + pad(Math.min(d, dim(k))), catId, cardId, merchant, note:'Beispiel', example:true, createdAt:new Date().toISOString()};
      if (type === 'transfer') { ex.toCardId = toCardId; ex.note = merchant; ex.merchant = ''; }
      entries.push(ex);
    });
  });
  const recurring = [];
  const R = [['Arbeitgeber','income',318000,'gehalt','bsp-debit',1], ['Energie AG','expense',8900,'wohnen','bsp-debit',2], ['Wohnbaukredit','expense',98000,'wohnen','bsp-debit',3], ['Netflix','expense',1399,'abos','bsp-visa',5], ['Finanzamt','income',30120,'beihilfe','bsp-debit',10], ['A1 Telekom','expense',4599,'abos','bsp-debit',12], ['Wiener Städtische','expense',4250,'versicherung','bsp-debit',15], ['Spotify Family','expense',1799,'abos','bsp-visa',28]];
  for (const [merchant, type, amount, catId, cardId, day] of R) {
    const id = 'bsp-r-' + day + '-' + catId;
    const mine = entries.filter(e => e.merchant === merchant);
    mine.forEach(e => { e.recurringId = id; e.importKey = 'rec:' + id + ':' + e.date; });
    const last = mine.map(e => e.date).sort().pop() || null;
    recurring.push({id, type, amount, catId, cardId, toCardId:null, merchant, note:'', freq:'monthly', day, startDate:addMonths(cur, -2) + '-' + pad(day), lastBooked:last, endDate:null, active:true, example:true});
  }
  recurring.push({id:'bsp-r-visa', type:'transfer', amount:60000, catId:'', cardId:'bsp-debit', toCardId:'bsp-visa', merchant:'', note:'Visa-Abrechnung', freq:'monthly', day:21, startDate:addMonths(cur, -2) + '-21', lastBooked:(entries.filter(e => e.note === 'Visa-Abrechnung').map(e => e.date).sort().pop() || null), endDate:null, active:true, example:true});
  entries.filter(e => e.note === 'Visa-Abrechnung').forEach(e => { e.recurringId = 'bsp-r-visa'; e.importKey = 'rec:bsp-r-visa:' + e.date; });
  return {cards, budgets, entries, recurring};
}
function loadExamplesInto(profile){
  const ex = makeExamples();
  const p = clean(profile);
  for (const c of ex.cards) if (!p.cards.some(x => x.id === c.id)) p.cards.push(c);
  for (const [k, v] of Object.entries(ex.budgets)) if (!p.budgets[k]) { p.budgets[k] = v; if (!p.exampleBudgetKeys.includes(k)) p.exampleBudgetKeys.push(k); }
  if (!Array.isArray(p.recurring)) p.recurring = [];
  for (const r of ex.recurring) if (!p.recurring.some(x => x.id === r.id)) p.recurring.push(r);
  return {p, entries:ex.entries};
}

/* ---------- Personen: frei anlegbar (nur auf dem Gerät), mehrere je Buchung, Betrag wird gleichmäßig aufgeteilt ---------- */
const persons = () => S.profile.persons || [];
const personById = id => persons().find(p => p.id === id);
const pKey = m => String(m || '').toLowerCase().trim();
function personsFor(merchant){
  const al = (S.profile.personAlias || {})[pKey(merchant)];
  const ok = (al || []).filter(personById);
  if (ok.length) return ok;
  return persons().length ? [persons()[0].id] : [];
}
/* Anteil je Person in Cent; Rest-Cents gehen an die ersten */
function personShares(e){
  const ids = (e.persons || []).filter(personById); if (!ids.length) return {'':e.amount};
  const base = Math.floor(e.amount / ids.length), rest = e.amount - base * ids.length, out = {};
  ids.forEach((id, i) => { out[id] = base + (i < rest ? 1 : 0); }); return out;
}
const personNames = e => (e.persons || []).map(personById).filter(Boolean).map(p => p.name);
