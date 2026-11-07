#!/usr/bin/env node
/*
 * Kassabuch – End-to-End-Tests (nur fiktive Beispieldaten, keine echten Daten).
 * Start:  node tests/run.cjs            (braucht das npm-Paket "playwright" mit Chromium)
 * Die Claude-API wird nie aufgerufen: alle Anfragen an api.anthropic.com werden abgefangen.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), FIX = path.join(__dirname, 'fixtures');
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json'};
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'content-type':TYPES[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
});
const FAKE_SCAN = {merchant:'Testmarkt', date:'2026-01-15', total:12.4, currency:'EUR', docType:'kassenbon', isRefund:false, items:[{name:'MILCH 1L', clean:'Milch 1l', group:'Milch & Käse', qty:2, total:2.98, kind:'item'}, {name:'AKTION -20%', clean:'Aktion −20 %', group:'Milch & Käse', qty:1, total:-0.60, kind:'discount'}], savingsPrinted:0.6, taxHint:'wk', warrantyMonths:24, vat:[], paymentHint:'Bar', cardLast4:null, dueDate:null, categoryId:'lebensmittel', note:'Einkauf', issues:[], confidence:0.9};
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const DUMP = () => new Promise(res => { const r = indexedDB.open('kassabuch'); r.onsuccess = () => { const t = r.result.transaction(['kv', 'entries', 'blobs']); const a = t.objectStore('kv').get('profile'), b = t.objectStore('entries').getAll(), c = t.objectStore('blobs').count(); t.oncomplete = () => res({profile:a.result, entries:b.result, blobs:c.result}); }; });
const SWIPE = ([sel, dx, hold]) => new Promise(res => { const el = document.querySelector(sel); const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + Math.min(b.height / 2, 30);
  const mk = (t, cx) => { const tc = new Touch({identifier:1, target:el, clientX:cx, clientY:y}); el.dispatchEvent(new TouchEvent(t, {bubbles:true, cancelable:true, touches:t === 'touchend' ? [] : [tc], changedTouches:[tc]})); };
  mk('touchstart', x); setTimeout(() => { for (let i = 1; i <= 6; i++) if (dx) mk('touchmove', x + dx * i / 6); mk('touchend', x + dx); res(); }, hold || 30); });

const results = []; let page, ctx, browser, base, pageErrors = [];
const ok = (c, m) => { if (!c) throw new Error(m); };
async function test(name, fn){ const t0 = Date.now(); try { await fn(); results.push([true, name, Date.now() - t0]); console.log('  ✓ ' + name); } catch (e) { results.push([false, name, e.message]); console.log('  ✗ ' + name + '\n      ' + e.message.split('\n')[0]); } }
async function fresh(opts = {}){
  if (ctx) await ctx.close();
  ctx = await browser.newContext({viewport:{width:390, height:844}, isMobile:true, hasTouch:true, acceptDownloads:true, colorScheme:opts.dark ? 'dark' : 'light'});
  await ctx.route('https://api.anthropic.com/**', r => r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify({id:'x', type:'message', role:'assistant', model:'test', stop_reason:'end_turn', usage:{input_tokens:1, output_tokens:1}, content:[{type:'text', text:JSON.stringify(FAKE_SCAN)}]})}));
  page = await ctx.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto(base); await page.waitForTimeout(700);
}
const go = async r => { await page.goto(base + '#' + r); await page.waitForTimeout(350); };
const closeSheet = async () => { if (await page.$('#sheet:not([hidden])')) { await page.click('.sheet-head [data-act="close-sheet"]'); await page.waitForTimeout(250); } };
const loadPlan = async () => { await page.setInputFiles('#jsonInput', path.join(FIX, 'plan.json')); await page.waitForTimeout(300); await page.click('#pl-go'); await page.waitForTimeout(400); };
async function seed(fn){ await page.evaluate(`(() => new Promise(res => { const r = indexedDB.open('kassabuch'); r.onsuccess = () => { const t = r.result.transaction(['kv', 'entries'], 'readwrite'); const kv = t.objectStore('kv'), es = t.objectStore('entries'); const g = kv.get('profile'); g.onsuccess = () => { const p = g.result; (${fn})(p, es); kv.put(p, 'profile'); }; t.oncomplete = () => { r.result.close(); res(); }; }; }))()`); await page.reload(); await page.waitForTimeout(600); }
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
async function addEntry({amount, merchant, cat, card}){
  await page.click('.tabbar [data-act="add"]'); await page.waitForTimeout(250);
  await page.fill('#f-amount', amount); if (merchant) await page.fill('#f-merchant', merchant);
  if (cat) { if (!(await page.$('#f-catchips [data-cat="' + cat + '"]'))) await page.click('#f-catmore'); await page.click('[data-cat="' + cat + '"]'); }
  if (card) await page.click('#f-cardchips [data-card="' + card + '"]');
  await page.click('#f-save'); await page.waitForTimeout(450);
}

(async () => {
  await new Promise(r => server.listen(0, r)); base = 'http://localhost:' + server.address().port + '/';
  browser = await chromium.launch(process.env.CHROME ? {executablePath:process.env.CHROME} : {});
  console.log('Kassabuch-Tests gegen ' + base);

  await test('Start ohne Daten: leer, keine Fehler', async () => {
    await fresh(); const d = await page.evaluate(DUMP); ok(d.entries.length === 0, 'Einträge vorhanden'); ok(!(d.profile && d.profile.cards || []).length, 'Karten vorhanden');
  });
  await test('Alle Ansichten rendern (hell und dunkel), nichts ragt über den Rand', async () => {
    for (const dark of [false, true]) {
      await fresh({dark}); await page.click('[data-act="examples-load"]'); await page.waitForTimeout(500); await loadPlan();
      for (const r of ['uebersicht', 'eintraege', 'budgets', 'karten', 'statistik', 'fixkosten']) {
        await go(r); const w = await page.evaluate(() => document.documentElement.scrollWidth); ok(w <= 391, r + ' zu breit: ' + w);
      }
    }
  });
  await test('Budgetplan-Import: Gruppen, Monats- und Jahresbudget, Sparen zählt nicht als Ausgabe', async () => {
    await fresh(); await loadPlan(); const d = await page.evaluate(DUMP);
    ok(d.profile.groups.length === 5, 'Gruppen'); ok(d.profile.budgets.lebensmittel === 50000, 'Budget Lebensmittel'); ok(d.profile.yearBudgets.reisen === 200000, 'Jahresbudget');
    await seed(`(p, es) => { es.put({id:'s1', type:'expense', amount:50000, catId:'ruecklage', date:'${today()}', merchant:'Spar'}); es.put({id:'s2', type:'expense', amount:1000, catId:'lebensmittel', date:'${today()}', merchant:'Markt'}); }`);
    await go('uebersicht'); const kv = await page.innerText('.hero .kv'); ok(/Ausgaben\s*€\s*10,00/.test(kv), 'Ausgaben ohne Sparen: ' + kv); ok(/Gespart\s*€\s*500,00/.test(kv), 'Gespart: ' + kv);
  });
  await test('Erfassen: Kategorie über „Alle“, Karte als Chip, Budget-Wirkung, Speichern', async () => {
    await fresh(); await loadPlan();
    await seed(`(p) => { p.cards = [{id:'k1', name:'Konto Test', kind:'debit', color:1}, {id:'k2', name:'Bar', kind:'cash', color:5}]; }`);
    await page.click('.tabbar [data-act="add"]'); await page.fill('#f-amount', '50'); await page.click('#f-catchips [data-cat="lebensmittel"]');
    ok(/noch €\s450/.test(await page.innerText('#f-impact')), 'Budget-Wirkung');
    await page.click('#f-catmore'); await page.click('#f-catall [data-cat="freizeit"]'); await page.click('#f-cardchips [data-card="k2"]'); await page.click('[data-day="1"]'); await page.click('#f-save'); await page.waitForTimeout(400);
    const e = (await page.evaluate(DUMP)).entries[0]; ok(e.catId === 'freizeit' && e.cardId === 'k2' && e.amount === 5000, JSON.stringify(e));
  });
  await test('Kontostand: Buchungen am Stichtag nach dem Eintragen zählen mit', async () => {
    await fresh(); await seed(`(p) => { p.cards = [{id:'bar', name:'Bar', kind:'cash', color:5, startBalance:11000, startDate:'${today()}'}]; }`);
    await addEntry({amount:'48', merchant:'Pizza', card:'bar'}); await go('uebersicht');
    ok(/62,00/.test(await page.innerText('#view')), 'Stand nicht 62 €');
  });
  await test('Abgleich: Differenz wird der passenden Buchung zugeordnet', async () => {
    await fresh(); await seed(`(p, es) => { p.cards = [{id:'k', name:'Konto', kind:'debit', color:4, startBalance:100000, startDate:'${today()}', startAt:new Date(Date.now() - 3600e3).toISOString()}]; es.put({id:'a', type:'expense', amount:537, catId:'abos', date:'${today()}', merchant:'Dienst', cardId:'k', createdAt:new Date().toISOString()}); }`);
    await go('karten'); await page.click('[data-act="card-rec"]'); await page.fill('#rc-v', '1000'); await page.waitForTimeout(200);
    ok(/Passt genau zu/.test(await page.innerText('#rc-diff')), 'kein Hinweis');
    await page.click('#rc-ok'); await page.waitForTimeout(300); const c = (await page.evaluate(DUMP)).profile.cards[0]; ok(c.startBalance === 100000 && c.reconciled, 'Stand nicht übernommen');
  });
  await test('Einträge: nach links wischen → Löschen; Vorgemerkt → Gebucht', async () => {
    await fresh(); await seed(`(p, es) => { es.put({id:'p1', type:'expense', amount:999, catId:'freizeit', date:'${today()}', merchant:'Abo', pending:true}); es.put({id:'p2', type:'expense', amount:500, catId:'freizeit', date:'${today()}', merchant:'Kino'}); }`);
    await go('eintraege');
    await page.evaluate(SWIPE, ['#eList .swipe:has([data-id="p1"]) .row', -150]); await page.waitForTimeout(300); await page.click('[data-act="sw-settle"][data-id="p1"]'); await page.waitForTimeout(400);
    ok(!(await page.evaluate(DUMP)).entries.find(e => e.id === 'p1').pending, 'nicht gebucht');
    await page.evaluate(SWIPE, ['#eList .swipe:has([data-id="p2"]) .row', -150]); await page.waitForTimeout(300);
    await page.click('[data-act="sw-del"][data-id="p2"]'); await page.click('[data-act="sw-del"][data-id="p2"]'); await page.waitForTimeout(400);
    ok(!(await page.evaluate(DUMP)).entries.find(e => e.id === 'p2'), 'nicht gelöscht');
    const m0 = await page.innerText('.monthbar h1'); await page.evaluate(SWIPE, ['.monthbar', -200]); await page.waitForTimeout(300); ok(m0 === await page.innerText('.monthbar h1'), 'Monat per Wisch gewechselt');
  });
  await test('Langes Drücken auf + → letzte Buchung wiederholen', async () => {
    await fresh(); await addEntry({amount:'3,20', merchant:'Bäckerei Test'});
    await page.evaluate(SWIPE, ['.tab-add', 0, 650]); await page.waitForTimeout(300); ok(/Wiederholen/.test(await page.innerText('#sheetTitle')), 'Sheet fehlt');
    await page.click('[data-act="repeat"]'); await page.waitForTimeout(600); ok(await page.inputValue('#f-amount') === '3,20', 'Betrag nicht übernommen');
  });
  await test('Sparziel: Fortschritt und Prognose', async () => {
    await fresh(); await loadPlan(); await seed(`(p, es) => { es.put({id:'r', type:'expense', amount:50000, catId:'ruecklage', date:'${today()}', merchant:'Spar'}); }`);
    await go('budgets'); await page.click('[data-act="goal-add"]'); await page.fill('#g-name', 'Polster'); await page.fill('#g-target', '6000'); await page.fill('#g-start', '1000'); await page.fill('#g-sdate', '2000-01-01');
    await page.click('#gForm button[type=submit]'); await page.waitForTimeout(400);
    const t = await page.innerText('[data-act="goal-edit"]'); ok(/25 %/.test(t) && /€\s500\/Monat/.test(t), t.replace(/\n/g, ' | '));
  });
  await test('Artikelsuche über alle Bons, Preis je Händler', async () => {
    await fresh(); await seed(`(p, es) => { const mk = (id, d, m, u) => es.put({id, type:'expense', amount:u * 6, catId:'lebensmittel', date:d, merchant:m, items:[{n:'Wasser still', g:'Getränke', q:6, t:u * 6}]}); mk('a', '2026-01-03', 'Markt A', 30); mk('b', '2026-02-03', 'Markt B', 25); mk('c', '2026-03-03', 'Markt A', 35); }`);
    await go('statistik'); await page.fill('#itemSearch', 'wasser'); await page.waitForTimeout(200);
    ok(/am günstigsten Markt B/.test(await page.innerText('#itemResults')), 'Suche');
    await page.click('#itemResults [data-act="item-hist"]'); await page.waitForTimeout(300); ok(/Preis je Händler/.test(await page.innerText('#sheetBody')), 'Händlervergleich');
  });
  await test('Rabatte: Summe, Quote, Händler; Rabattzeilen nicht als Artikel', async () => {
    await fresh(); await seed(`(p, es) => { const d = '${today()}';
      es.put({id:'a', type:'expense', amount:900, catId:'lebensmittel', date:d, merchant:'Markt A', items:[{n:'Käse', g:'Milch & Käse', q:1, t:1000}, {n:'Aktion Käse', g:'Milch & Käse', q:1, t:-100}]});
      es.put({id:'b', type:'expense', amount:1800, catId:'lebensmittel', date:d, merchant:'Markt B', items:[{n:'Kaffee', g:'Vorrat & Konserven', q:1, t:2000, k:'item'}, {n:'Coupon', g:'Sonstiges', q:1, t:-200, k:'discount'}, {n:'Pfand', g:'Pfand', q:1, t:-25, k:'deposit'}]});
      es.put({id:'c', type:'expense', amount:500, catId:'lebensmittel', date:d, merchant:'Markt A', items:[{n:'Brot', g:'Brot & Gebäck', q:1, t:500}]}); }`);
    await go('statistik'); const t = await page.innerText('#view');
    ok(/Gespart durch Rabatte/.test(t) && /€\s3,00/.test(t), 'Summe fehlt'); ok(/auf 2 von 3 Bons · 9 %/.test(t), 'Quote: ' + (t.match(/auf .* Bons[^\n]*/) || [''])[0]);
    ok(!/Aktion Käse[\s\S]*Was ich kaufe/.test(t) && !/Was ich kaufe[\s\S]*Coupon[\s\S]*Rabatte/.test(t), 'Rabattzeile als Artikel gelistet');
  });
  await test('Abo-Erkennung: monatlicher Händler, Preiserhöhung, als Dauerauftrag übernehmen', async () => {
    await fresh(); await seed(`(p, es) => { const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
      [[95, 1299], [65, 1299], [35, 1299], [5, 1499]].forEach(([n, a], i) => es.put({id:'s' + i, type:'expense', amount:a, catId:'abos', date:d(n), merchant:'Streamingdienst'}));
      [[40, 5000], [33, 3000], [12, 8000], [2, 2000]].forEach(([n, a], i) => es.put({id:'m' + i, type:'expense', amount:a, catId:'lebensmittel', date:d(n), merchant:'Supermarkt'})); }`);
    await go('uebersicht'); ok(/Preiserhöhung: Streamingdienst/.test(await page.innerText('#view')), 'Hinweis Preiserhöhung fehlt');
    await go('fixkosten'); const t = await page.innerText('#view'); ok(/Erkannte Abos/.test(t) && /Streamingdienst/.test(t) && /teurer/.test(t), 'Abo nicht erkannt'); ok(!/Supermarkt/.test(t), 'Supermarkt fälschlich als Abo');
    await page.click('[data-act="sub-rule"]'); await page.waitForTimeout(400);
    const r = (await page.evaluate(DUMP)).profile.recurring; ok(r.length === 1 && r[0].amount === 1499 && r[0].freq === 'monthly', JSON.stringify(r));
    ok(!/Erkannte Abos/.test(await page.innerText('#view')), 'Vorschlag bleibt nach Übernahme');
  });
  await test('Steuerbelege und Garantie: im Eintrag setzen, Liste, CSV, Hinweis vor Ablauf', async () => {
    await fresh(); await page.click('.tabbar [data-act="add"]'); await page.fill('#f-amount', '45'); await page.fill('#f-merchant', 'Fachbuchhandlung');
    await page.click('#f-extra summary'); await page.selectOption('#f-tax', 'wk'); await page.click('#f-save'); await page.waitForTimeout(400);
    await seed(`(p, es) => { const x = new Date(); x.setDate(x.getDate() + 30); es.put({id:'w', type:'expense', amount:39900, catId:'sonstiges', date:'2024-12-01', merchant:'Elektrohandel', note:'Staubsauger', warrantyUntil:x.toISOString().slice(0, 10)}); const y = new Date(); y.setDate(y.getDate() + 200); es.put({id:'w2', type:'expense', amount:9900, catId:'sonstiges', date:'2026-01-01', merchant:'Fernsehladen', warrantyUntil:y.toISOString().slice(0, 10)}); }`);
    await go('uebersicht'); { const v = await page.innerText('#view'); ok(/Garantie endet: Elektrohandel/.test(v), 'Garantie-Hinweis fehlt'); ok(!/Garantie endet: Fernsehladen/.test(v), 'Hinweis zu früh'); }
    await go('statistik'); await page.click('[data-act="taxlist"]'); await page.waitForTimeout(300); ok(/Werbungskosten/.test(await page.innerText('#sheetBody')) && /Fachbuchhandlung/.test(await page.innerText('#sheetBody')), 'Steuerliste');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#tx-csv')]); const f = path.join(require('os').tmpdir(), 'kb-tax.csv'); await dl.saveAs(f);
    ok(/Fachbuchhandlung/.test(fs.readFileSync(f, 'utf8')), 'CSV'); await closeSheet();
    await page.click('[data-act="warranties"]'); await page.waitForTimeout(300); ok(/Staubsauger/.test(await page.innerText('#sheetBody')), 'Garantieliste');
  });
  await test('Beleg-Scan (API abgefangen) → Eintrag mit Artikeln und Foto', async () => {
    await fresh(); await page.click('[data-act="settings"]'); await page.fill('#s-key-in', 'sk-ant-api03-' + 'T'.repeat(40)); await page.click('#s-key button[type=submit]'); await page.waitForTimeout(300);
    await go('uebersicht'); await page.setInputFiles('#receiptInput', {name:'bon.png', mimeType:'image/png', buffer:TINY_PNG}); await page.waitForTimeout(2500);
    const save = await page.$('#f-save'); if (save) { await save.click(); await page.waitForTimeout(500); }
    const d = await page.evaluate(DUMP); ok(d.entries.length === 1 && d.entries[0].items.length === 2 && d.entries[0].items[1].k === 'discount' && d.entries[0].savings === 60 && d.entries[0].tax === 'wk' && /^20\d\d-\d\d-\d\d$/.test(d.entries[0].warrantyUntil || '') && d.blobs === 1, JSON.stringify({n:d.entries.length, b:d.blobs}));
  });
  await test('Backup mit Belegfotos → auf leerem Gerät vollständig wiederherstellen', async () => {
    await loadPlan(); await page.click('[data-act="settings"]'); await page.waitForTimeout(400);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup"]')]);
    const file = path.join(require('os').tmpdir(), 'kb-test-backup.json'); await dl.saveAs(file);
    const j = JSON.parse(fs.readFileSync(file, 'utf8')); ok(j.version === 2 && Object.keys(j.blobs || {}).length === 1, 'Fotos fehlen im Backup');
    await fresh(); await page.setInputFiles('#jsonInput', file); await page.waitForTimeout(300); await page.click('#r-go'); await page.waitForTimeout(500);
    const d = await page.evaluate(DUMP); ok(d.entries.length === 1 && d.blobs === 1 && d.profile.groups.length === 5, JSON.stringify({n:d.entries.length, b:d.blobs, g:(d.profile.groups || []).length}));
  });
  await test('Bank-Parser: Revolut-Aufladung per Karte wird Umbuchung', async () => {
    await fresh(); const r = await page.evaluate(async () => { const m = await import('./bank.js'); return m.parseBank(['Revolut Bank UAB', 'Karteneinzahlungsbeleg', 'Betrag | €12.34', 'Transaktionsdatum | 01.10.2026, 10:00:00', 'Kartennummer | 400000 **** 1111', 'Status | ABGESCHLOSSEN', 'ID für Nachverfolgung/System | test-1', 'Name der Empfängerbank | MUSTERBANK AG'], 'x.pdf'); });
    ok(r.ok && r.kind === 'transfer' && r.amount === 1234 && r.date === '2026-10-01' && r.counterpartyCardLast4 === '1111', JSON.stringify(r));
  });
  await test('Bank-Import über die Oberfläche: PDF-Leser lädt (auch aus js/)', async () => {
    await fresh();
    const pdf = (() => { const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
      const txt = 'BT /F1 12 Tf 20 150 Td (Testdokument ohne Bankformat) Tj ET'; objs[3] = '<< /Length ' + txt.length + ' >>\nstream\n' + txt + '\nendstream';
      let out = '%PDF-1.4\n', offs = []; objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
      const x = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
      return Buffer.from(out, 'latin1'); })();
    await page.setInputFiles('#bankInput', {name:'test.pdf', mimeType:'application/pdf', buffer:pdf}); await page.waitForTimeout(2500);
    const t = await page.innerText('#sheetBody'); ok(!/Leser nicht geladen/.test(t), 'PDF-Leser nicht geladen'); ok(/nicht erkannt|Keine|nicht lesbar|Format/i.test(t), t.slice(0, 120));
  });
  await test('Netzwerk: nur eigene Dateien und api.anthropic.com', async () => {
    await fresh(); const hosts = new Set(); page.on('request', q => hosts.add(new URL(q.url()).host));
    await page.click('[data-act="examples-load"]'); for (const r of ['uebersicht', 'statistik', 'karten']) await go(r);
    const other = [...hosts].filter(h => !h.startsWith('localhost')); ok(!other.length, 'fremde Hosts: ' + other.join(', '));
  });
  await test('Keine JavaScript-Fehler während aller Tests', async () => { ok(!pageErrors.length, pageErrors.slice(0, 3).join(' / ')); });

  await browser.close(); server.close();
  const failed = results.filter(r => !r[0]).length;
  console.log('\n' + (results.length - failed) + ' von ' + results.length + ' Tests bestanden.');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
