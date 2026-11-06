// Kassabuch: Bank-PDFs lokal lesen (Revolut, Trade Republic, Raiffeisen).
// Läuft komplett im Browser. Es wird nichts hochgeladen.
import * as pdfjs from './vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

/** Textzeilen einer PDF, Spalten durch " | " getrennt. */
export async function pdfLines(buffer){
  const doc = await pdfjs.getDocument({data:new Uint8Array(buffer), isEvalSupported:false, disableFontFace:true}).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({x:it.transform[4], y:it.transform[5], w:it.width, s:it.str}));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of items) { const r = rows.find(r => Math.abs(r.y - it.y) < 3); if (r) r.items.push(it); else rows.push({y:it.y, items:[it]}); }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let s = '', end = null;
      for (const it of r.items) { if (end != null) s += it.x - end > 8 ? ' | ' : (it.x - end > 0.8 ? ' ' : ''); s += it.s; end = it.x + it.w; }
      out.push(s.replace(/\s+/g, ' ').trim());
    }
  }
  await doc.destroy();
  return out;
}

const amountOf = s => {
  let t = String(s || '').replace(/€|EUR|\s/gi, '');
  let neg = false;
  if (/^[-−]/.test(t)) { neg = true; t = t.slice(1); }
  if (/^\+/.test(t)) t = t.slice(1);
  const m = /^[\d.]*\d,\d{1,2}$/.test(t) || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = Number(m);
  return isFinite(n) && m !== '' ? Math.round((neg ? -n : n) * 100) : null;
};
const dmy = s => { const t = String(s || ''); const m = t.match(/(\d{2})\.(\d{2})\.(\d{4})/); if (m) return m[3] + '-' + m[2] + '-' + m[1]; const i = t.match(/(\d{4})-(\d{2})-(\d{2})/); return i ? i[0] : null; };
const last4 = s => { const d = String(s || '').replace(/[^0-9A-Za-z]/g, ''); return d.length >= 4 ? d.slice(-4).toUpperCase() : ''; };
const hash = s => { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h.toString(36); };
const val = (lines, label) => { const l = lines.find(x => x.startsWith(label + ' |')); return l ? l.slice(label.length + 2).trim() : null; };
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[0-9A-Z]{10,30}\b| [0-9A-Z]{4})/;
const ibanLast4 = lines => { for (const l of lines) { const m = l.match(/(?:^|\| )IBAN \| ([A-Z]{2}\d{2}[0-9A-Z ]{8,34})/); if (m) return last4(m[1]); } return ''; };
const ibanIn = s => {
  const t = String(s || '');
  const c = t.match(/\b[A-Z]{2}\d{2}[0-9A-Z]{10,30}\b/);
  if (c) return last4(c[0]);
  const m = t.match(/\b[A-Z]{2}\d{2}(?: [0-9A-Z]{4}){2,7}(?: [0-9A-Z]{1,4})?/);
  if (!m) return '';
  const g = m[0].split(' '); while (g.length > 1 && !/\d/.test(g[g.length - 1])) g.pop();
  return last4(g.join(''));
};
const after = (lines, re) => lines.findIndex(l => re.test(l));
const titleCase = s => s.toLowerCase().replace(/(^|[\s\-/.&])([a-zäöüß])/g, (m, a, b) => a + b.toUpperCase());

/** Erkennt die Bank und liest eine Transaktion. */
export function parseBank(lines, fileName){
  const text = lines.join('\n');
  try {
    if (/Revolut Bank UAB/i.test(text)) return /Karteneinzahlungsbeleg/.test(text) ? revolutTopup(lines) : /Überweisungsbestätigung/.test(text) ? revolutTransfer(lines, text, fileName) : revolut(lines, fileName);
    if (/TRADE REPUBLIC/i.test(text)) return /ÜBERWEISUNGSBESTÄTIGUNG/.test(text) ? trTransfer(lines, text, fileName) : tradeRepublic(lines, text, fileName);
    if (/Raiffeisen/i.test(text) && /Buchungstext/.test(text)) return raiffeisen(lines, fileName);
  } catch (e) { return {ok:false, error:'Lesefehler: ' + (e && e.message || e)}; }
  return {ok:false, error:'Bank oder Format nicht erkannt'};
}

function revolut(lines, fileName){
  const hi = lines.findIndex(l => /^Startdatum \|/.test(l));
  if (hi < 0) return {ok:false, error:'Revolut: Tabelle nicht gefunden'};
  const header = lines[hi], row = lines[hi + 1] || '';
  const parts = row.split(' | ');
  const date = dmy(parts[0]), amt = amountOf(parts[parts.length - 1]);
  if (!date || amt == null) return {ok:false, error:'Revolut: Datum oder Betrag fehlt'};
  const rest = lines.slice(hi + 2, hi + 8);
  const to = rest.find(l => /^An:/.test(l)), from = rest.find(l => /^Von:/.test(l));
  const card = rest.find(l => /^Karte:/.test(l)), auth = rest.find(l => /^Autorisierungscode:/.test(l));
  const income = /Geldeingang/.test(header) && !/Geldausgang/.test(header) || (!!from && !to) || amt < 0 && /Geldeingang/.test(header);
  const id = auth ? auth.split(':')[1].trim() : hash(date + amt + parts[1]);
  return {ok:true, bank:'revolut', bankName:'Revolut', id:id + '-' + date, date, amount:Math.abs(amt), type:income ? 'income' : 'expense',
    merchant:(parts.slice(1, -1).join(' ') || '').trim(), merchantRaw:(to || from || '').replace(/^(An|Von):\s*/, '').trim(),
    cardLast4:card ? last4(card.split(':')[1]) : '', cardCode:'', ibanLast4:ibanLast4(lines), pending:false, kind:'card'};
}

function tradeRepublic(lines, text, fileName){
  const date = dmy(val(lines, 'Transaktion eingeleitet')), amt = amountOf(val(lines, 'Betrag'));
  if (!date || amt == null) return {ok:false, error:'Trade Republic: Datum oder Betrag fehlt'};
  const merchant = (val(lines, 'Name des Händlers') || '').trim();
  const orig = val(lines, 'Ursprünglicher Betrag');
  const mk = text.match(/Aufschlag auf den EZB-Satz:\s*([+\-]?[\d,]+)\s*%/);
  const fx = orig && !/EUR\s*$/.test(orig) ? {original:orig, markup:mk ? mk[1].replace(',', '.') : null} : null;
  const um = String(fileName || '').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  const income = /Erstattung|Gutschrift|Rückerstattung/i.test(text) || amt < 0 && false;
  return {ok:true, bank:'tr', bankName:'Trade Republic', id:um ? um[1] : hash(date + amt + merchant + val(lines, 'Kartennummer')), date, amount:Math.abs(amt), type:income ? 'income' : 'expense',
    merchant, merchantRaw:merchant, cardLast4:last4(val(lines, 'Kartennummer')), cardCode:'', ibanLast4:ibanLast4(lines),
    pending:/noch nicht abgeschlossen/i.test(text), fx, kind:'card'};
}

function raiffeisen(lines, fileName){
  const hi = lines.findIndex(l => /^Buchungsdatum \|/.test(l));
  if (hi < 0) return {ok:false, error:'Raiffeisen: Tabelle nicht gefunden'};
  const row = lines[hi + 1] || '', parts = row.split(' | ');
  const date = dmy(parts[0]), amt = amountOf(parts[parts.length - 1]);
  if (!date || amt == null) return {ok:false, error:'Raiffeisen: Datum oder Betrag fehlt'};
  const cont = [];
  for (let i = hi + 2; i < lines.length && !/angemeldet als/.test(lines[i]) && cont.length < 4; i++) cont.push(lines[i]);
  const cpIban = cont.map(ibanIn).find(Boolean) || '';
  const raw = [(parts[1] || '').trim()].concat(cont.filter(l => !IBAN_RE.test(l))).join(' ').trim();
  const timePart = parts.find(p => /^\d{2}\.\d{2}\.\s+\d{2}:\d{2}$/.test(p));
  const code = (raw.match(/\b([DKB]\d)\b/) || [])[1] || '';
  const income = lines.some(l => l === 'Geldeingang') || (amt > 0 && !lines.some(l => l === 'Geldausgang'));
  const isTransfer = !!cpIban || /Online Banking|Überweisung|Dauerauftrag|SEPA|Gutschrift/i.test(raw);
  const cleaned = raw.replace(/Online Banking vom [\d.]+ um/gi, ' ').replace(/\b[DKB]\d\b/g, ' ').replace(/\b(POS|AT|ATM|BANKOMAT|KARTE|K\d)\b/g, ' ').replace(/\b\d[\d./:-]*\b/g, ' ').replace(/\s+/g, ' ').trim();
  const bm = String(fileName || '').match(/Buchung_(\d+)/);
  return {ok:true, bank:'rb', bankName:'Raiffeisen', id:bm ? bm[1] : hash(date + amt + raw), date, amount:Math.abs(amt), type:income ? 'income' : 'expense',
    merchant:cleaned ? (cleaned === cleaned.toUpperCase() ? titleCase(cleaned) : cleaned) : raw, merchantRaw:raw, cardLast4:'', cardCode:isTransfer ? '' : code, ibanLast4:ibanLast4(lines), pending:false,
    time:timePart ? timePart.split(/\s+/)[1] : null, kind:isTransfer ? 'transfer' : 'card', counterpartyIbanLast4:cpIban};
}

function trTransfer(lines, text, fileName){
  const hi = after(lines, /^BETRAG \| STATUS/);
  if (hi < 0) return {ok:false, error:'Trade Republic: Überweisung nicht lesbar'};
  const p = (lines[hi + 1] || '').split(' | ');
  const amt = amountOf(p[0]), date = dmy(p[2] || '');
  if (!date || amt == null) return {ok:false, error:'Trade Republic: Datum oder Betrag fehlt'};
  const incoming = /ANGABEN ZUM SENDER/.test(text);
  const ci = after(lines, /^NAME \| IBAN/);
  const cp = ci >= 0 ? (lines[ci + 1] || '').split(' | ') : [];
  const um = String(fileName || '').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return {ok:true, bank:'tr', bankName:'Trade Republic', id:um ? um[1] : hash(date + amt + cp.join()), date, amount:Math.abs(amt), type:incoming ? 'income' : 'expense',
    merchant:(cp[0] || '').trim(), merchantRaw:(cp[0] || '').trim(), reference:(p[4] || '').trim(), cardLast4:'', cardCode:'', ibanLast4:ibanLast4(lines),
    pending:!/Ausgeführt/i.test(p[1] || ''), kind:'transfer', counterpartyIbanLast4:ibanIn(cp[1] || '')};
}
/* Aufladung des Revolut-Kontos mit einer fremden Karte (z. B. Raiffeisen-Kreditkarte): Geld kommt bei Revolut an, Gegenseite ist die Karte */
function revolutTopup(lines){
  const amt = amountOf(val(lines, 'Betrag')), date = dmy(val(lines, 'Transaktionsdatum') || '');
  if (!date || amt == null) return {ok:false, error:'Revolut: Aufladung nicht lesbar'};
  const tm = (val(lines, 'Transaktionsdatum') || '').match(/(\d{2}:\d{2})/);
  const id = val(lines, 'ID für Nachverfolgung/System') || val(lines, 'Abfragereferenz') || hash(date + amt + val(lines, 'Kartennummer'));
  const issuer = (val(lines, 'Name der Empfängerbank') || '').replace(/\b(AG|INTERNATIONAL|BANK)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return {ok:true, bank:'revolut', bankName:'Revolut', id:'topup-' + id, date, amount:Math.abs(amt), type:'income',
    merchant:'Aufladung' + (issuer ? ' von ' + titleCase(issuer) : ''), merchantRaw:'Karteneinzahlung', cardLast4:'', cardCode:'', ibanLast4:'',
    pending:!/ABGESCHLOSSEN|COMPLETED/i.test(val(lines, 'Status') || ''), time:tm ? tm[1] : null, kind:'transfer', counterpartyCardLast4:last4(val(lines, 'Kartennummer')), topup:true};
}
function revolutTransfer(lines, text, fileName){
  const amt = amountOf(val(lines, 'Betrag')), date = dmy(val(lines, 'Veranlassungsdatum') || val(lines, 'Wertstellungsdatum') || '');
  if (!date || amt == null) return {ok:false, error:'Revolut: Überweisung nicht lesbar'};
  const si = after(lines, /^(Empfängerdaten|Absenderdaten|Senderdaten|Auftraggeber)/);
  const incoming = si >= 0 && !/^Empfängerdaten/.test(lines[si]);
  const sec = si >= 0 ? lines.slice(si + 1, si + 6) : [];
  const name = (sec.find(l => l.startsWith('Name |')) || '').slice(7).trim();
  const acct = sec.find(l => /^(Kontonummer|IBAN) \|/.test(l)) || '';
  const id = val(lines, 'Transaktions-ID') || hash(date + amt + name);
  return {ok:true, bank:'revolut', bankName:'Revolut', id, date, amount:Math.abs(amt), type:incoming ? 'income' : 'expense',
    merchant:name, merchantRaw:name, reference:val(lines, 'Verwendungszweck') || '', cardLast4:'', cardCode:'', ibanLast4:ibanLast4(lines),
    pending:!/Abgeschlossen/i.test(val(lines, 'Status') || 'Abgeschlossen'), kind:'transfer', counterpartyIbanLast4:ibanIn(acct)};
}
