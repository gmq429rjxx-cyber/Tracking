const PDF_W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,500,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,0];
const PDF_WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,556,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,0];
/* PDF-Bericht: eigener kleiner PDF-Schreiber (A4, Helvetica, WinAnsi).
   Läuft komplett auf dem Gerät, ohne Bibliothek und ohne Netz. Breitentabellen oben: Adobe-Standardmetriken. */
const PDF_MAP = {0x20AC:0x80, 0x201A:0x82, 0x0192:0x83, 0x201E:0x84, 0x2026:0x85, 0x2020:0x86, 0x2021:0x87, 0x02C6:0x88, 0x2030:0x89, 0x0160:0x8A, 0x2039:0x8B, 0x0152:0x8C, 0x017D:0x8E, 0x2018:0x91, 0x2019:0x92, 0x201C:0x93, 0x201D:0x94, 0x2022:0x95, 0x2013:0x96, 0x2014:0x97, 0x02DC:0x98, 0x2122:0x99, 0x0161:0x9A, 0x203A:0x9B, 0x0153:0x9C, 0x017E:0x9E, 0x0178:0x9F, 0x2212:0x96, 0x202F:0xA0, 0x2009:0x20, 0x2192:0xBB};
function pdfEnc(str){
  let o = '';
  for (const ch of String(str == null ? '' : str)) {
    const c = ch.codePointAt(0);
    const b = c < 32 ? 0x20 : c < 0x7F ? c : c >= 0xA0 && c <= 0xFF ? c : PDF_MAP[c];
    o += String.fromCharCode(b == null ? 0x3F : b);
  }
  return o;
}
function pdfWidth(t, size, bold){ const W = bold ? PDF_WB : PDF_W; let w = 0; for (let i = 0; i < t.length; i++) w += W[t.charCodeAt(i) - 32] || 556; return w * size / 1000; }
function pdfFit(t, maxW, size, bold){
  if (!maxW || pdfWidth(t, size, bold) <= maxW) return t;
  const ell = '\x85'; while (t.length > 1 && pdfWidth(t + ell, size, bold) > maxW) t = t.slice(0, -1);
  return t.replace(/\s+$/, '') + ell;
}
const pdfNum = n => String(Math.round(n * 100) / 100);
const pdfRGB = hex => { const h = hex.replace('#', ''); return [0, 2, 4].map(i => pdfNum(parseInt(h.slice(i, i + 2), 16) / 255)).join(' '); };
const pdfStr = t => '(' + t.replace(/[\\()]/g, m => '\\' + m) + ')';

function PdfDoc(){ this.W = 595.28; this.H = 841.89; this.pages = []; this.cur = null; }
PdfDoc.prototype.addPage = function(){ this.cur = []; this.pages.push(this.cur); return this.pages.length; };
PdfDoc.prototype.text = function(x, y, s, o){
  o = o || {}; const size = o.size || 10, bold = !!o.bold;
  let t = pdfFit(pdfEnc(s), o.maxW, size, bold);
  const w = pdfWidth(t, size, bold);
  if (o.align === 'right') x -= w; else if (o.align === 'center') x -= w / 2;
  (o.page || this.cur).push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + pdfRGB(o.color || '#1A1A1E') + ' rg ' + pdfNum(x) + ' ' + pdfNum(this.H - y) + ' Td ' + pdfStr(t) + ' Tj ET');
  return w;
};
PdfDoc.prototype.rect = function(x, y, w, h, color){ this.cur.push(pdfRGB(color) + ' rg ' + pdfNum(x) + ' ' + pdfNum(this.H - y - h) + ' ' + pdfNum(w) + ' ' + pdfNum(h) + ' re f'); };
PdfDoc.prototype.line = function(x1, y1, x2, y2, color, lw, page){ (page || this.cur).push(pdfRGB(color || '#D9D9DE') + ' RG ' + pdfNum(lw || 0.5) + ' w ' + pdfNum(x1) + ' ' + pdfNum(this.H - y1) + ' m ' + pdfNum(x2) + ' ' + pdfNum(this.H - y2) + ' l S'); };
PdfDoc.prototype.build = function(title){
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
  const obj = (n, body) => { offs[n] = out.length; out += n + ' 0 obj\n' + body + '\nendobj\n'; };
  const n = this.pages.length, kids = this.pages.map((_, i) => (6 + 2 * i) + ' 0 R').join(' ');
  const d = new Date(), p2 = v => String(v).padStart(2, '0');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [' + kids + '] /Count ' + n + ' >>');
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  obj(5, '<< /Title ' + pdfStr(pdfEnc(title)) + ' /Producer (Kassabuch) /CreationDate (D:' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + ') >>');
  this.pages.forEach((ops, i) => {
    const data = ops.join('\n');
    obj(6 + 2 * i, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + this.W + ' ' + this.H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (7 + 2 * i) + ' 0 R >>');
    obj(7 + 2 * i, '<< /Length ' + data.length + ' >>\nstream\n' + data + '\nendstream');
  });
  const xref = out.length, size = 6 + 2 * n;
  out += 'xref\n0 ' + size + '\n0000000000 65535 f \n';
  for (let i = 1; i < size; i++) out += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + size + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
};

/* ---------- Bericht ---------- */
const PDF_CAT = ['#2E7C6A','#BF522B','#3B60B5','#934AAB','#A87A08','#2C8A3D','#BE3866','#5A6977','#C9731A','#1C8A9B','#26457F','#5A7ED0','#4D6F96','#5E8E26','#1F6B4F','#2F9C80','#A8362A','#6046B5','#A84FC4','#8A7556'];
const PDF_C = {fg:'#1A1A1E', muted:'#6E6E78', line:'#E2E2E7', soft:'#F3F3F5', ok:'#1F7A4D', bad:'#B3261E', warn:'#A0620A', sav:'#5B45B0', bar:'#5F6573'};
const dmy = iso => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '';

const reportDays = (a, b) => dayDiff(b, a) + 1;   // Tage inklusive Start und Ende
/* Faktoren für den Zeitraum: m = Anzahl Monate (anteilig), y = Anteil Jahr */
function budgetShare(from, to, withYear){
  let m = 0, y = 0; const d = parseISO(from), end = parseISO(to);
  while (d <= end) { const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); m += 1 / dim(k); if (withYear) { const yy = d.getFullYear(); y += 1 / ((yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0 ? 366 : 365); } d.setDate(d.getDate() + 1); }
  return {m, y};
}
const pdfMonths = m => { const r = Math.round(m * 10) / 10; return (Number.isInteger(r) ? r : r.toFixed(1).replace('.', ',')) + (r === 1 ? ' Monat' : ' Monate'); };
/* Optionen: {kind:'month'|'year'|'range', month, year, from, to, card, cat, person, taxOnly, sec:{sum,cats,budget,pers,list,transfers}} */
function reportRange(o){
  if (o.kind === 'month') return {from:o.month + '-01', to:o.month + '-' + String(dim(o.month)).padStart(2, '0'), label:monthLabel(o.month)};
  if (o.kind === 'year') return {from:o.year + '-01-01', to:o.year + '-12-31', label:'Jahr ' + o.year};
  const f = o.from <= o.to ? o.from : o.to, t = o.from <= o.to ? o.to : o.from;
  return {from:f, to:t, label:dmy(f) + ' bis ' + dmy(t)};
}
function reportEntries(o, r){
  let l = allEntries().filter(e => typeof e.date === 'string' && e.date >= r.from && e.date <= r.to);
  if (o.card) l = l.filter(e => e.cardId === o.card || e.toCardId === o.card);
  if (o.cat) l = l.filter(e => o.cat.startsWith('g:') ? e.type !== 'transfer' && (catById(e.catId).group || '') === o.cat.slice(2) : e.catId === o.cat);
  if (o.taxOnly) l = l.filter(e => e.tax);
  if (o.person === '__none') l = l.filter(e => e.type !== 'transfer' && !(e.persons || []).some(personById));
  else if (o.person) l = l.filter(e => (e.persons || []).includes(o.person)).map(e => { const sh = personShares(e)[o.person]; return sh != null && sh !== e.amount ? Object.assign({}, e, {amount:sh, _full:e.amount}) : e; });
  return l.sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}
function reportFilterText(o){
  const g = [];
  if (o.card) g.push('Karte: ' + ((cardById(o.card) || {}).name || '–'));
  if (o.cat) g.push((o.cat.startsWith('g:') ? 'Gruppe: ' + o.cat.slice(2) : 'Kategorie: ' + catById(o.cat).name));
  if (o.person) g.push(o.person === '__none' ? 'Ohne Person' : 'Person: ' + ((personById(o.person) || {}).name || '–') + ' (Anteil)');
  if (o.taxOnly) g.push('Nur Steuerbelege');
  return g.length ? g.join(' · ') : 'Alle Karten, Kategorien und Personen';
}
function buildReport(o){
  const r = reportRange(o), list = reportEntries(o, r);
  const doc = new PdfDoc(), M = 42, R = doc.W - M, FW = R - M, BOTTOM = doc.H - 54;
  let y = 0; const now = new Date(), made = 'Erstellt am ' + DAYL.format(now) + ', ' + now.toLocaleTimeString('de-AT', {hour:'2-digit', minute:'2-digit'});
  const header = () => { doc.addPage(); doc.text(M, 34, 'Kassabuch', {size:9, bold:true}); doc.text(R, 34, made, {size:9, color:PDF_C.muted, align:'right'}); doc.line(M, 42, R, 42, PDF_C.line); y = 66; };
  const need = (h, again) => { if (y + h > BOTTOM) { header(); if (again) again(); } };
  const h2 = t => { need(44); y += 10; doc.text(M, y, t, {size:13, bold:true}); y += 16; };
  header();
  doc.text(M, y + 6, 'Bericht ' + r.label, {size:22, bold:true}); y += 26;
  doc.text(M, y, reportFilterText(o), {size:9, color:PDF_C.muted, maxW:FW}); y += 22;

  const s = sums(list), trans = list.filter(e => e.type === 'transfer');
  if (o.sec.sum) {
    const bw = (FW - 3 * 8) / 4, box = [['Ausgaben', s.exp, PDF_C.fg], ['Einnahmen', s.inc, PDF_C.ok], ['Gespart', s.sav, s.sav ? PDF_C.sav : PDF_C.fg], ['Saldo', s.bal, s.bal < 0 ? PDF_C.bad : PDF_C.fg]];
    box.forEach(([l, v, c], i) => { const x = M + i * (bw + 8); doc.rect(x, y, bw, 50, PDF_C.soft); doc.text(x + 10, y + 17, l, {size:8.5, color:PDF_C.muted}); doc.text(x + 10, y + 38, money(v), {size:14, bold:true, color:c, maxW:bw - 16}); });
    y += 64;
    const end = r.to < today() ? r.to : today(), days = Math.max(1, reportDays(r.from, end));
    const n = list.filter(e => e.type !== 'transfer').length;
    doc.text(M, y, 'Ø ' + money(Math.round(s.exp / days)) + ' pro Tag' + (s.inc ? ' · Sparquote ' + Math.round((s.inc - s.exp) / s.inc * 100) + ' %' : '') + ' · ' + n + (n === 1 ? ' Eintrag' : ' Einträge') + (trans.length ? ' · ' + trans.length + ' Umbuchungen' : ''), {size:9, color:PDF_C.muted, maxW:FW});
    y += 10;
  }
  if (o.sec.cats) {
    const by = spentByCat(list), rows = Object.entries(by).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]), tot = rows.reduce((a, [, v]) => a + v, 0), max = rows.length ? rows[0][1] : 1;
    h2('Ausgaben nach Kategorie');
    if (!rows.length) { doc.text(M, y, 'Keine Ausgaben im Zeitraum.', {size:9, color:PDF_C.muted}); y += 14; }
    for (const [id, v] of rows) {
      need(17); const c = catById(id);
      doc.rect(M, y - 7, 7, 7, PDF_CAT[(Number(c.color) || 0) % 20] || PDF_C.bar);
      doc.text(M + 13, y, c.name + (c.saving ? ' (Sparen)' : ''), {size:9.5, maxW:170});
      doc.rect(M + 200, y - 7, 190, 7, PDF_C.soft); doc.rect(M + 200, y - 7, Math.max(1, 190 * v / max), 7, c.saving ? PDF_C.sav : PDF_C.bar);
      doc.text(R - 42, y, money(v), {size:9.5, bold:true, align:'right'});
      doc.text(R, y, Math.round(v / tot * 100) + ' %', {size:9, color:PDF_C.muted, align:'right'});
      y += 17;
    }
  }
  if (o.sec.budget && !o.person && !o.taxOnly) {
    const by = spentByCat(list), now = today(), span = reportDays(r.from, r.to);
    /* Budget über den Zeitraum: Monatsbudgets tageweise anteilig (volle Monate = volles Budget), Jahresbudgets anteilig nach Tagen; im Einzelmonat nur Monatsbudgets wie in der App */
    const fr = budgetShare(r.from, r.to, o.kind !== 'month');
    const pace = now >= r.to ? 1 : now < r.from ? 0 : reportDays(r.from, now) / span;
    const rows = cats().filter(c => c.kind === 'expense' && (!o.cat || (o.cat.startsWith('g:') ? (c.group || '') === o.cat.slice(2) : c.id === o.cat))).map(c => {
      const mb = S.profile.budgets[c.id] || 0, yb = (S.profile.yearBudgets || {})[c.id] || 0;
      return {c, b:Math.round(mb * fr.m + yb * fr.y), v:by[c.id] || 0};
    }).filter(x => x.b);
    if (rows.length) {
      h2('Budget gegen Ist');
      if (o.kind !== 'month') { doc.text(M, y - 2, o.kind === 'year' ? 'Monatsbudgets × 12 plus Jahresbudgets' : 'Monatsbudgets für ' + pdfMonths(fr.m) + ' (angebrochene Monate anteilig nach Tagen), Jahresbudgets anteilig', {size:8.5, color:PDF_C.muted, maxW:FW}); y += 14; }
      const cols = [[M + 210, 'Budget'], [M + 300, 'Ist'], [M + 400, 'Differenz']];
      const head = () => { doc.text(M, y, 'Kategorie', {size:8, bold:true, color:PDF_C.muted}); cols.forEach(([x, t]) => doc.text(x, y, t, {size:8, bold:true, color:PDF_C.muted, align:'right'})); doc.text(R, y, 'Status', {size:8, bold:true, color:PDF_C.muted, align:'right'}); y += 5; doc.line(M, y, R, y); y += 12; };
      head(); let tb = 0, tv = 0;
      for (const x of rows) {
        need(16, head); tb += x.b; tv += x.v;
        const st = x.c.saving ? null : catState(x.c, x.v, x.b, pace), d = x.b - x.v;
        doc.text(M, y, x.c.name, {size:9.5, maxW:140});
        doc.text(M + 210, y, money(x.b), {size:9.5, align:'right'}); doc.text(M + 300, y, money(x.v), {size:9.5, align:'right'});
        doc.text(M + 400, y, (d < 0 ? '– ' : '') + money(Math.abs(d)), {size:9.5, align:'right', color:d < 0 && !x.c.saving ? PDF_C.bad : PDF_C.fg});
        if (st && st !== 'ok') doc.text(R, y, STATE_TXT[st], {size:9, bold:true, align:'right', color:st === 'bad' ? PDF_C.bad : PDF_C.warn});
        y += 16;
      }
      need(18); doc.line(M, y - 10, R, y - 10); y += 2;
      doc.text(M, y, 'Summe', {size:9.5, bold:true}); doc.text(M + 210, y, money(tb), {size:9.5, bold:true, align:'right'}); doc.text(M + 300, y, money(tv), {size:9.5, bold:true, align:'right'});
      doc.text(M + 400, y, (tb - tv < 0 ? '– ' : '') + money(Math.abs(tb - tv)), {size:9.5, bold:true, align:'right', color:tb - tv < 0 ? PDF_C.bad : PDF_C.fg}); y += 16;
    }
  }
  if (o.sec.pers && !o.person && persons().length) {
    const ex = {}, inc = {};
    for (const e of list) { if (e.type === 'transfer') continue; const sh = personShares(e), t = e.type === 'income' ? inc : ex; for (const [id, v] of Object.entries(sh)) t[id] = (t[id] || 0) + v; }
    const ids = persons().map(p => p.id).concat(ex[''] || inc[''] ? [''] : []);
    h2('Personen (gleichmäßig aufgeteilt)');
    doc.text(M, y, 'Person', {size:8, bold:true, color:PDF_C.muted}); doc.text(M + 300, y, 'Ausgaben', {size:8, bold:true, color:PDF_C.muted, align:'right'}); doc.text(R, y, 'Einnahmen', {size:8, bold:true, color:PDF_C.muted, align:'right'}); y += 5; doc.line(M, y, R, y); y += 12;
    for (const id of ids) { need(16); doc.text(M, y, id ? personById(id).name : 'Ohne Person', {size:9.5}); doc.text(M + 300, y, money(ex[id] || 0), {size:9.5, align:'right'}); doc.text(R, y, money(inc[id] || 0), {size:9.5, align:'right', color:inc[id] ? PDF_C.ok : PDF_C.fg}); y += 16; }
  }
  if (o.sec.list) {
    const rows = list.filter(e => o.sec.transfers || e.type !== 'transfer');
    h2('Einträge (' + rows.length + ')');
    const X = {date:M, id:M + 52, who:M + 100, cat:M + 272, card:M + 372};
    const head = () => { [['date', 'Datum'], ['id', 'ID'], ['who', 'Händler'], ['cat', 'Kategorie'], ['card', 'Karte']].forEach(([k, t]) => doc.text(X[k], y, t, {size:8, bold:true, color:PDF_C.muted})); doc.text(R, y, 'Betrag', {size:8, bold:true, color:PDF_C.muted, align:'right'}); y += 5; doc.line(M, y, R, y); y += 12; };
    if (!rows.length) { doc.text(M, y, 'Keine Einträge im Zeitraum.', {size:9, color:PDF_C.muted}); y += 14; }
    else head();
    for (const e of rows) {
      const tr = e.type === 'transfer', sub = [e.note, (e.persons || []).length ? personNames(e).join(', ') : '', e.tax ? 'Steuer: ' + (TAX[e.tax] || e.tax) : ''].filter(Boolean).join(' · ');
      const h = sub || e._full ? 25 : 16;
      need(h, head);
      doc.text(X.date, y, dmy(e.date), {size:8.5});
      doc.text(X.id, y, txId(e), {size:8.5, color:PDF_C.muted});
      doc.text(X.who, y, tr ? 'Umbuchung' : (e.merchant || catById(e.catId).name), {size:8.5, bold:true, maxW:166});
      doc.text(X.cat, y, tr ? '–' : (isWithdrawal(e) ? 'Entnahme ' : '') + catById(e.catId).name, {size:8.5, maxW:94});
      doc.text(X.card, y, tr ? ((cardById(e.cardId) || {}).name || '?') + ' → ' + ((cardById(e.toCardId) || {}).name || '?') : ((cardById(e.cardId) || {}).name || '–'), {size:8.5, maxW:R - 62 - X.card});
      doc.text(R, y, (tr ? '' : e.type === 'income' ? '+ ' : '– ') + money(e.amount), {size:8.5, bold:true, align:'right', color:e.type === 'income' ? PDF_C.ok : PDF_C.fg});
      if (sub) doc.text(X.who, y + 9.5, sub, {size:7.5, color:PDF_C.muted, maxW:R - 62 - X.who});
      if (e._full) doc.text(R, y + 9.5, 'Anteil von ' + money(e._full), {size:7.5, color:PDF_C.muted, align:'right'});
      y += h - 9; doc.line(M, y, R, y, '#EDEDF0'); y += 9;
    }
  }
  const total = doc.pages.length;
  doc.pages.forEach((pg, i) => { doc.line(M, doc.H - 38, R, doc.H - 38, PDF_C.line, 0.5, pg); doc.text(M, doc.H - 26, 'Bericht ' + r.label, {size:8, color:PDF_C.muted, page:pg}); doc.text(R, doc.H - 26, 'Seite ' + (i + 1) + ' von ' + total, {size:8, color:PDF_C.muted, align:'right', page:pg}); });
  const slug = o.kind === 'month' ? o.month : o.kind === 'year' ? String(o.year) : r.from + '_' + r.to;
  return {bytes:doc.build('Kassabuch Bericht ' + r.label), pages:total, name:'kassabuch-bericht-' + slug + '.pdf', count:list.length};
}

/* ---------- Auswahl ---------- */
function openReport(){
  const years = [...new Set(allEntries().map(e => (e.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  if (!years.includes(S.month.slice(0, 4))) years.unshift(S.month.slice(0, 4));
  const groups = [...new Set(cats().filter(c => c.kind === 'expense').map(c => c.group).filter(Boolean))];
  const opt = (v, t) => '<option value="' + esc(v) + '">' + esc(t) + '</option>';
  const ps = persons(), first = S.month + '-01';
  const chk = (id, label, on) => '<label class="note" style="display:flex;gap:10px;align-items:center;margin:0;color:var(--fg);font-size:15px"><input type="checkbox" switch id="' + id + '"' + (on ? ' checked' : '') + '> ' + label + '</label>';
  openSheet('Bericht als PDF',
    '<form id="rpForm" style="display:flex;flex-direction:column;gap:14px" novalidate>' +
    '<div class="seg" role="radiogroup" aria-label="Zeitraum" style="display:grid;grid-template-columns:repeat(3,1fr)">' + [['month', 'Monat'], ['year', 'Jahr'], ['range', 'Von–bis']].map(([k, t], i) => '<input type="radio" name="rp-kind" id="rp-k-' + k + '" value="' + k + '"' + (i ? '' : ' checked') + '><label for="rp-k-' + k + '">' + t + '</label>').join('') + '</div>' +
    '<label class="field" data-k="month"><span>Monat</span><input class="input" type="month" id="rp-month" value="' + esc(S.month) + '"></label>' +
    '<label class="field" data-k="year" hidden><span>Jahr</span><select class="input" id="rp-year">' + years.map(y => opt(y, y)).join('') + '</select></label>' +
    '<div class="formgrid" data-k="range" hidden><label class="field"><span>Von</span><input class="input" type="date" id="rp-from" value="' + first + '"></label><label class="field"><span>Bis</span><input class="input" type="date" id="rp-to" value="' + today() + '"></label></div>' +
    '<label class="field"><span>Karte</span><select class="input" id="rp-card">' + opt('', 'Alle Karten') + S.profile.cards.map(c => opt(c.id, c.name)).join('') + '</select></label>' +
    '<label class="field"><span>Kategorie</span><select class="input" id="rp-cat">' + opt('', 'Alle Kategorien') + (groups.length ? '<optgroup label="Gruppen">' + groups.map(g => opt('g:' + g, g)).join('') + '</optgroup>' : '') + '<optgroup label="Kategorien">' + cats().map(c => opt(c.id, c.name)).join('') + '</optgroup></select></label>' +
    (ps.length ? '<label class="field"><span>Person</span><select class="input" id="rp-pers">' + opt('', 'Alle Personen') + ps.map(p => opt(p.id, p.name + ' (Anteil)')).join('') + opt('__none', 'Ohne Person') + '</select></label>' : '') +
    chk('rp-tax', 'Nur Steuerbelege', false) +
    '<div class="field"><span>Inhalt</span><div style="display:flex;flex-direction:column;gap:12px;padding-top:4px">' + chk('rp-sum', 'Zusammenfassung', true) + chk('rp-cats', 'Ausgaben nach Kategorie', true) + chk('rp-budget', 'Budget gegen Ist', true) + (ps.length ? chk('rp-ps', 'Personen', true) : '') + chk('rp-list', 'Liste aller Einträge mit ID', true) + chk('rp-tr', 'Umbuchungen in der Liste', false) + '</div></div>' +
    '<p class="note" style="margin:0">Das PDF entsteht auf diesem iPhone, ohne Internet. Die ID jeder Buchung steht gleich auch im CSV-Export und in der App.</p>' +
    '<p class="note" id="rp-err" role="alert" hidden></p>' +
    '<button class="btn primary" type="submit">PDF erstellen</button></form>',
    root => {
      const kind = () => (root.querySelector('input[name="rp-kind"]:checked') || {}).value || 'month';
      const sync = () => { root.querySelectorAll('[data-k]').forEach(el => { el.hidden = el.dataset.k !== kind(); }); };
      root.querySelectorAll('input[name="rp-kind"]').forEach(r => r.addEventListener('change', sync));
      const v = id => { const el = $('#' + id, root); return el ? el.value : ''; }, on = id => { const el = $('#' + id, root); return !!(el && el.checked); };
      $('#rpForm', root).addEventListener('submit', ev => {
        ev.preventDefault();
        const o = {kind:kind(), month:v('rp-month') || S.month, year:v('rp-year'), from:v('rp-from'), to:v('rp-to'), card:v('rp-card'), cat:v('rp-cat'), person:v('rp-pers'), taxOnly:on('rp-tax'),
          sec:{sum:on('rp-sum'), cats:on('rp-cats'), budget:on('rp-budget'), pers:on('rp-ps'), list:on('rp-list'), transfers:on('rp-tr')}};
        const err = $('#rp-err', root);
        if (o.kind === 'range' && (!validISO(o.from) || !validISO(o.to))) { err.hidden = false; err.textContent = 'Bitte beide Daten wählen.'; return; }
        if (!Object.values(o.sec).some(Boolean)) { err.hidden = false; err.textContent = 'Bitte mindestens einen Inhalt wählen.'; return; }
        err.hidden = true;
        /* synchron bauen, damit das Teilen-Menü noch als Reaktion auf den Tipp gilt */
        const rep = buildReport(o);
        deliverFile(rep.name, rep.bytes, 'application/pdf').then(ok => { if (ok) toast('PDF erstellt · ' + rep.pages + (rep.pages === 1 ? ' Seite' : ' Seiten')); });
      });
    });
}
