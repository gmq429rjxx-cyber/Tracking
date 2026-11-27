#!/usr/bin/env node
/*
 * Kassabuch – End-to-End-Tests (nur fiktive Beispieldaten, keine echten Daten).
 * Start:  node tests/run.cjs            (braucht das npm-Paket "playwright" mit Chromium)
 * Die Claude-API wird nie aufgerufen: alle Anfragen an api.anthropic.com werden abgefangen.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const ENGINE = process.env.BROWSER || 'chromium';   // chromium oder webkit (Safari-Technik)
const engine = require('playwright')[ENGINE];
const ROOT = path.resolve(__dirname, '..'), FIX = path.join(__dirname, 'fixtures');
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json'};
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'content-type':TYPES[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
});
const FAKE_SCAN = {merchant:'Testmarkt', date:'2026-01-15', total:12.4, currency:'EUR', docType:'kassenbon', isRefund:false, items:[{name:'MILCH 1L', clean:'Milch 1l', group:'Milch & Käse', qty:2, total:2.98, kind:'item'}, {name:'AKTION -20%', clean:'Aktion −20 %', group:'Milch & Käse', qty:1, total:-0.60, kind:'discount'}], savingsPrinted:0.6, receiptNo:'4711', taxHint:'wk', warrantyMonths:24, vat:[], paymentHint:'Bar', cardLast4:null, dueDate:null, categoryId:'lebensmittel', note:'Einkauf', issues:[], confidence:0.9};
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const DUMP = () => new Promise(res => { const r = indexedDB.open('kassabuch'); r.onsuccess = () => { const t = r.result.transaction(['kv', 'entries', 'blobs']); const a = t.objectStore('kv').get('profile'), b = t.objectStore('entries').getAll(), c = t.objectStore('blobs').count(); t.oncomplete = () => res({profile:a.result, entries:b.result, blobs:c.result}); }; });
const SWIPE = ([sel, dx, hold]) => new Promise(res => { const el = document.querySelector(sel); const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + Math.min(b.height / 2, 30);
  /* WebKit am Desktop erlaubt kein „new Touch“: dort ein gleich aufgebautes Ereignis von Hand */
  const mk = (t, cx) => { let ev;
    try { const tc = new Touch({identifier:1, target:el, clientX:cx, clientY:y}); ev = new TouchEvent(t, {bubbles:true, cancelable:true, touches:t === 'touchend' ? [] : [tc], changedTouches:[tc]}); }
    catch (_) { const tc = {identifier:1, target:el, clientX:cx, clientY:y, pageX:cx, pageY:y}; ev = new Event(t, {bubbles:true, cancelable:true}); Object.defineProperty(ev, 'touches', {value:t === 'touchend' ? [] : [tc]}); Object.defineProperty(ev, 'changedTouches', {value:[tc]}); }
    el.dispatchEvent(ev); };
  mk('touchstart', x); setTimeout(() => { for (let i = 1; i <= 6; i++) if (dx) mk('touchmove', x + dx * i / 6); mk('touchend', x + dx); res(); }, hold || 30); });

const results = []; let page, ctx, browser, base, pageErrors = [], scanReply = null, lastAsk = null, chatReplies = [], askLog = [];   // chatReplies: vorgegebene Antworten für den Assistenten   // lastAsk: zuletzt an die KI geschickte Anfrage   // scanReply: abweichende KI-Antwort für einen Test
const ok = (c, m) => { if (!c) throw new Error(m); };
async function test(name, fn){ if (process.env.ONLY && !name.includes(process.env.ONLY)) return;   // ONLY=Teil des Namens: nur diese Tests
  const t0 = Date.now(); try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung nach 90 s')), 90000))]); results.push([true, name, Date.now() - t0]); console.log('  ✓ ' + name); } catch (e) { results.push([false, name, e.message]); console.log('  ✗ ' + name + '\n      ' + e.message.split('\n')[0]); } }
async function fresh(opts = {}){
  const copt = {viewport:{width:390, height:844}, isMobile:true, hasTouch:true, acceptDownloads:true, colorScheme:opts.dark ? 'dark' : 'light'};
  const wk = ENGINE === 'webkit';
  /* WebKit speichert Fotos (Blobs) nur in einem dauerhaften Profil: dort ein Profil für alle Tests, vor jedem Test geleert */
  if (wk && ctx) { await page.close().catch(() => {}); }
  else {
    if (ctx) await ctx.close();
    ctx = wk ? await engine.launchPersistentContext(fs.mkdtempSync(path.join(require('os').tmpdir(), 'kb-wk-')), copt) : await browser.newContext(copt);
    await ctx.route('https://api.anthropic.com/**', r => { try { lastAsk = JSON.parse(r.request().postData() || 'null'); } catch (_) { lastAsk = null; } if (lastAsk && lastAsk.tools) { askLog.push(lastAsk); const c = chatReplies.shift() || {stop_reason:'end_turn', content:[{type:'text', text:'ok'}]}; return r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(Object.assign({id:'x', type:'message', role:'assistant', model:'test', usage:{input_tokens:1, output_tokens:1}}, c))}); }
      return r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify({id:'x', type:'message', role:'assistant', model:'test', stop_reason:'end_turn', usage:{input_tokens:1, output_tokens:1}, content:[{type:'text', text:JSON.stringify(scanReply || FAKE_SCAN)}]})}); });
  }
  page = await ctx.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', e => pageErrors.push(String(e)));
  if (wk) {
    await page.emulateMedia({colorScheme:copt.colorScheme});
    await page.goto(base + 'version.json');
    await page.evaluate(() => new Promise(res => { try { localStorage.clear(); } catch (_) {} const r = indexedDB.deleteDatabase('kassabuch'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  }
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
  browser = await engine.launch(ENGINE === 'chromium' && process.env.CHROME ? {executablePath:process.env.CHROME} : {});
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
  await test('Ampel: Fixkosten knapp ab 90 %, genau getroffen im Rahmen, darüber überschritten', async () => {
    await fresh(); await loadPlan();
    const r = await page.evaluate(() => { const c = catById('wohnen'); return [catState(c, 80000, 90000, .5), catState(c, 81000, 90000, .5), catState(c, 90000, 90000, .5), catState(c, 90100, 90000, .5)]; });
    ok(r.join() === 'ok,warn,ok,bad', r.join());
  });
  await test('Personenfilter: Summe und Betrag zeigen nur den Anteil', async () => {
    await fresh();
    await seed(`(p, es) => { p.persons = [{id:'pa', name:'Person A', color:1}, {id:'pb', name:'Person B', color:2}, {id:'pc', name:'Person C', color:3}]; es.put({id:'g1', type:'expense', amount:9000, catId:'lebensmittel', date:'${today()}', merchant:'Markt', persons:['pa','pb','pc']}); es.put({id:'g2', type:'expense', amount:1000, catId:'lebensmittel', date:'${today()}', merchant:'Bäcker', persons:['pa']}); }`);
    await go('eintraege'); await page.selectOption('#ePers', 'pa'); await page.waitForTimeout(250);
    const sum = await page.innerText('#eSum'); ok(/Anteil\s*€\s*40,00/.test(sum), 'Summe: ' + sum);
    const row = await page.innerText('#eList .swipe:has([data-id="g1"]) .row-amt'); ok(/€\s*30,00/.test(row) && /von\s*€\s*90,00/.test(row), 'Zeile: ' + row);
  });
  await test('PDF-Bericht: gültiges PDF mit Personenanteil und gleicher ID wie im CSV', async () => {
    await fresh();
    await seed(`(p, es) => { p.persons = [{id:'pa', name:'Person A', color:1}, {id:'pb', name:'Person B', color:2}]; es.put({id:'r1', type:'expense', amount:9000, catId:'lebensmittel', date:'${today()}', merchant:'Markt Süd', persons:['pa','pb']}); es.put({id:'r2', type:'income', amount:5000, catId:'gehalt', date:'${today()}', merchant:'Arbeit', persons:['pa']}); }`);
    const id = await page.evaluate(() => txId(S.entries.get('r1')));
    ok(/^[0-9A-Z]{7}$/.test(id), 'ID-Format: ' + id);
    const bs = await page.evaluate(() => [budgetShare('2026-01-01', '2026-03-31', true), budgetShare('2026-01-16', '2026-01-31', false), budgetShare('2026-01-01', '2026-12-31', true)]);
    ok(Math.abs(bs[0].m - 3) < 1e-9 && Math.abs(bs[1].m - 16 / 31) < 1e-9 && Math.abs(bs[2].m - 12) < 1e-9 && Math.abs(bs[2].y - 1) < 1e-9, 'Budget-Zeitraum: ' + JSON.stringify(bs));
    await go('statistik'); await page.click('[data-act="report"]'); await page.waitForTimeout(300);
    await page.selectOption('#rp-pers', 'pa');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rpForm button[type=submit]')]);
    const f = path.join(require('os').tmpdir(), 'kb-report.pdf'); await dl.saveAs(f); const b = fs.readFileSync(f), txt = b.toString('latin1');
    ok(txt.startsWith('%PDF-1.4') && /startxref\n\d+\n%%EOF\n$/.test(txt), 'kein gültiges PDF');
    const xo = Number(/startxref\n(\d+)/.exec(txt)[1]); ok(txt.slice(xo, xo + 4) === 'xref', 'xref-Offset falsch');
    ok(txt.includes('(' + id + ')'), 'ID fehlt im PDF'); ok(txt.includes('Markt S\xfcd'), 'Umlaut nicht WinAnsi'); ok(/Anteil von \x80\xa090,00/.test(txt), 'Anteil fehlt');
    await page.click('[data-act="close-sheet"]').catch(() => {});
    await page.evaluate(() => { const s = document.getElementById('sheet'); if (s) s.hidden = true; });
    await page.click('[data-act="settings"]'); await page.waitForTimeout(300);
    const [dc] = await Promise.all([page.waitForEvent('download'), page.click('#s-csv')]); const fc = path.join(require('os').tmpdir(), 'kb-ids.csv'); await dc.saveAs(fc);
    ok(fs.readFileSync(fc, 'utf8').includes(id + ';'), 'ID fehlt im CSV');
  });
  await test('Übersicht: Tipp auf Budget zeigt die Buchungen der Kategorie im Monat, Budgets-Tab öffnet weiter die Einstellung', async () => {
    await fresh();
    await seed(`(p, es) => { p.budgets = {lebensmittel:20000}; es.put({id:'b1', type:'expense', amount:19000, catId:'lebensmittel', date:'${today()}', merchant:'Markt'}); es.put({id:'b2', type:'expense', amount:5000, catId:'freizeit', date:'${today()}', merchant:'Kino'}); }`);
    await go('uebersicht'); await page.click('#view .brow[data-cat="lebensmittel"]'); await page.waitForTimeout(400);
    ok((await page.evaluate(() => location.hash)) === '#eintraege', 'kein Wechsel zu Einträgen');
    ok((await page.$eval('#eCat', el => el.value)) === 'lebensmittel', 'Kategoriefilter fehlt');
    ok(await page.$$eval('#eList .swipe', l => l.length) === 1, 'falsche Einträge');
    ok(/Gefiltert: Lebensmittel/.test(await page.innerText('#eReset')), 'Filterhinweis fehlt');
    await page.click('[data-act="filters-reset"]'); await page.waitForTimeout(300);
    ok(await page.$$eval('#eList .swipe', l => l.length) === 2 && (await page.$eval('#eCat', el => el.value)) === '' && await page.isHidden('#eReset'), 'Filter nicht zurückgesetzt');
    await go('budgets'); await page.click('#view .brow[data-cat="lebensmittel"]'); await page.waitForTimeout(400);
    ok(await page.isVisible('#sheet:not([hidden])'), 'Budget-Einstellung öffnet nicht');
  });
  await test('Entnahme aus dem Ersparten: senkt Gespart und Sparziel, zählt nicht als Einnahme', async () => {
    await fresh();
    await seed(`(p, es) => { const sc = p.categories.find(c => c.saving) || (p.categories.push({id:'sparen', name:'Sparen', kind:'expense', saving:true, color:17}), p.categories[p.categories.length - 1]); p.goals = [{id:'g1', name:'Rücklage', target:1000000, catId:sc.id, start:0}];
      es.put({id:'s1', type:'expense', amount:50000, catId:sc.id, date:'${today()}', merchant:'Rücklage'}); es.put({id:'s2', type:'income', amount:20000, catId:sc.id, date:'${today()}', merchant:'Rücklage'}); es.put({id:'s3', type:'income', amount:300000, catId:'gehalt', date:'${today()}', merchant:'Arbeit'}); }`);
    const r = await page.evaluate(() => { const l = entriesIn(mkey(today())), s = sums(l), sc = cats().find(c => c.saving); return {s, cat:spentByCat(l)[sc.id], goal:goalStatus(S.profile.goals[0]).cur, opt:catOptions('income').includes('Entnahme ' + esc(sc.name))}; });
    ok(r.s.inc === 300000 && r.s.sav === 30000 && r.s.bal === 270000, 'Summen: ' + JSON.stringify(r.s));
    ok(r.cat === 30000 && r.goal === 30000, 'Kategorie/Ziel: ' + r.cat + '/' + r.goal); ok(r.opt, 'Entnahme fehlt in der Auswahl');
    await go('eintraege'); ok(/Entnahme/.test(await page.innerText('#eList .swipe:has([data-id="s2"])')), 'Zeile ohne „Entnahme“');
  });
  await test('Belegprüfung: Gründe für n.i.O. stehen auch beim späteren Bearbeiten', async () => {
    await fresh();
    await seed(`(p, es) => { es.put({id:'v1', type:'expense', amount:1299, catId:'lebensmittel', date:'${today()}', merchant:'Markt', source:'scan', ai:{status:'bad', findings:['Summe der Artikel 13,99 € passt nicht zum Gesamtbetrag 12,99 €']}}); }`);
    await go('eintraege'); await page.click('#eList .row[data-act="edit"][data-id="v1"]'); await page.waitForTimeout(400);
    const t = await page.innerText('#sheetBody'); ok(/n\.i\.O\./.test(t) && /passt nicht zum Gesamtbetrag/.test(t), 'Gründe fehlen');
  });
  await test('Belegprüfung: Nettopreise plus USt sind kein Fehler, alte Fehlalarme werden neu bewertet', async () => {
    await fresh();
    await seed(`(p, es) => { es.put({id:'n1', type:'expense', amount:10920, catId:'lebensmittel', date:'${today()}', merchant:'Werkstatt', source:'scan', ai:{status:'bad', findings:['Positionen ergeben € 91,00, Summe laut Beleg € 109,20.', 'Karte •••• 0000 ist nicht angelegt. Bitte Karte wählen.']}}); es.put({id:'n2', type:'expense', amount:5000, catId:'lebensmittel', date:'${today()}', merchant:'Markt', source:'scan', ai:{status:'bad', findings:['Positionen ergeben € 40,00, Summe laut Beleg € 50,00.']}}); }`);
    const r = await page.evaluate(() => ({a:netRate(91, 109.2, null, 3), b:netRate(100, 110, null, 2), c:netRate(40, 50, null, 1), d:netRate(50, 60, [{rate:20, net:50, tax:10, gross:60}], 2), n1:S.entries.get('n1').ai, n2:S.entries.get('n2').ai.status}));
    ok(r.a === '20 % USt' && r.b === '10 % USt' && r.c === null && r.d === 'USt', 'netRate: ' + JSON.stringify(r));
    ok(r.n1.status === 'ok' && r.n1.findings.length === 0, 'Neubewertung: ' + JSON.stringify(r.n1)); ok(r.n2 === 'bad', 'echter Fehler bleibt');
  });
  await test('Einträge: Pillen filtern nach Ausgaben, Einnahmen, Umbuchungen', async () => {
    await fresh();
    await seed(`(p, es) => { p.cards = [{id:'ca', name:'Konto', kind:'account', color:1}, {id:'cb', name:'Bar', kind:'cash', color:2}]; es.put({id:'t1', type:'expense', amount:1000, catId:'lebensmittel', cardId:'ca', date:'${today()}', merchant:'Markt'}); es.put({id:'t2', type:'income', amount:5000, catId:'gehalt', cardId:'ca', date:'${today()}', merchant:'Arbeit'}); es.put({id:'t3', type:'transfer', amount:2000, cardId:'ca', toCardId:'cb', date:'${today()}'}); }`);
    await go('eintraege'); const rows = () => page.$$eval('#eList .swipe', l => l.length), on = () => page.$eval('#eType [aria-pressed="true"]', b => b.textContent);
    ok(await rows() === 3 && await on() === 'Alle', 'Start: ' + await rows());
    await page.click('#eType [data-type="income"]'); ok(await rows() === 1 && await on() === 'Einnahmen' && await page.$('#eList [data-id="t2"]'), 'Einnahmen');
    await page.click('#eType [data-type="transfer"]'); ok(await rows() === 1 && await page.$('#eList [data-id="t3"]'), 'Umbuchungen');
    await page.click('#eType [data-type="expense"]'); ok(await rows() === 1 && await page.$('#eList [data-id="t1"]'), 'Ausgaben');
    await page.fill('#eSearch', 'Markt'); await page.waitForTimeout(300); await page.click('[data-act="filters-reset"]'); await page.waitForTimeout(300);
    ok(await rows() === 3 && await on() === 'Alle', 'Zurücksetzen lässt Art-Filter stehen');
    ok(await page.evaluate(() => { const p = document.getElementById('eType'); return p.scrollWidth <= p.clientWidth + 1; }), 'Pillen passen nicht in die Breite');
  });
  await test('Fixkosten: nächste Abbuchungen mit Datumsblock', async () => {
    await fresh();
    await seed(`(p, es) => { const d = addDays(today(), 3); p.recurring = [{id:'r1', type:'expense', amount:1999, catId:'abos', cardId:'', toCardId:null, merchant:'Musikdienst', note:'', freq:'monthly', day:parseISO(d).getDate(), startDate:d, lastBooked:null, endDate:null, active:true}]; }`);
    await go('fixkosten'); const b = await page.innerText('#view .row .dblock'), due = await page.evaluate(() => parseISO(addDays(today(), 3)).getDate());
    ok(b.replace(/\s+/g, ' ').startsWith(String(due) + ' '), 'Datumsblock: ' + b); ok(/Musikdienst/.test(await page.innerText('#view .row:has(.dblock)')), 'Zeile');
  });
  await test('Plan gegen Ist: Einnahmen-Fortschritt, Bleibt aktuell, Einkommen änderbar', async () => {
    await fresh(); await loadPlan();
    await seed(`(p, es) => { es.put({id:'i1', type:'income', amount:100000, catId:'gehalt', date:'${today()}', merchant:'Arbeit'}); es.put({id:'x1', type:'expense', amount:30000, catId:'lebensmittel', date:'${today()}', merchant:'Markt'}); }`);
    await go('budgets'); const t = await page.innerText('.panel:has(.plan-head)');
    ok(/Einnahmen\s*€\s*1\.000\s*von\s*€\s*3\.000/.test(t), 'Fortschritt: ' + t); ok(/Bleibt aktuell\s*€\s*700/.test(t), 'Bleibt: ' + t);
    await page.click('.plan-head'); await page.fill('#pi-amount', '3500'); await page.click('#piForm button[type=submit]'); await page.waitForTimeout(400);
    ok((await page.evaluate(DUMP)).profile.plannedIncome === 350000, 'Einkommen nicht gespeichert');
  });
  await test('Erfassen: Kategorie über „Alle“, Karte als Chip, Budget-Wirkung, Speichern', async () => {
    await fresh(); await loadPlan();
    await seed(`(p) => { p.cards = [{id:'k1', name:'Konto Test', kind:'debit', color:1}, {id:'k2', name:'Bar', kind:'cash', color:5}]; }`);
    await page.click('.tabbar [data-act="add"]'); await page.fill('#f-amount', '50'); await page.click('#f-catchips [data-cat="lebensmittel"]');
    ok(/noch €\s450/.test(await page.innerText('#f-impact')), 'Budget-Wirkung');
    await page.click('#f-catmore'); await page.click('#f-catall [data-cat="freizeit"]'); await page.click('#f-cardchips [data-card="k2"]'); await page.click('[data-day="1"]'); await page.click('#f-save'); await page.waitForTimeout(400);
    const e = (await page.evaluate(DUMP)).entries[0]; ok(e.catId === 'freizeit' && e.cardId === 'k2' && e.amount === 5000, JSON.stringify(e));
  });
  await test('Personen: anlegen, Mehrfachauswahl, Aufteilung, Einnahmen, Filter, Händler merken', async () => {
    await fresh(); await page.click('[data-act="settings"]');
    for (const n of ['Gemeinsam', 'Person A', 'Person B', 'Kind C']) { await page.fill('#s-pers-name', n); await page.click('#s-pers-add button[type=submit]'); await page.waitForTimeout(250); }
    const ps = (await page.evaluate(DUMP)).profile.persons; ok(ps.length === 4, 'Personen nicht angelegt'); await closeSheet();
    await page.click('.tabbar [data-act="add"]'); ok(await page.getAttribute('#f-perschips [data-pers="' + ps[0].id + '"]', 'aria-pressed') === 'true', 'Standard nicht vorgewählt');
    await page.fill('#f-amount', '40'); await page.fill('#f-merchant', 'Spielwaren');
    await page.click('[data-pers="' + ps[0].id + '"]'); await page.click('[data-pers="' + ps[2].id + '"]'); await page.click('[data-pers="' + ps[3].id + '"]'); await page.click('#f-save'); await page.waitForTimeout(400);
    await page.click('.tabbar [data-act="add"]'); await page.click('label[for="ft-inc"]'); await page.fill('#f-amount', '1000'); await page.click('[data-pers="' + ps[0].id + '"]'); await page.click('[data-pers="' + ps[1].id + '"]'); await page.click('#f-save'); await page.waitForTimeout(400);
    const es = (await page.evaluate(DUMP)).entries; ok(es.some(e => e.type === 'expense' && e.persons.join() === [ps[2].id, ps[3].id].join()), 'Personen der Ausgabe');
    await go('statistik'); const t = await page.innerText('#view'); ok(/Nach Person/.test(t) && /Person B\s*\n[\s\S]*?€\s20,00/.test(t) && /\+\s€\s1\.000,00/.test(t), 'Aufteilung/Einnahme: ' + (t.match(/Nach Person[\s\S]{0,300}/) || [''])[0].replace(/\n/g, ' | '));
    await go('eintraege'); await page.selectOption('#ePers', ps[1].id); await page.waitForTimeout(200); ok((await page.$$('#eList .swipe')).length === 1, 'Filter');
    await page.click('.tabbar [data-act="add"]'); await page.fill('#f-merchant', 'Spielwaren'); await page.dispatchEvent('#f-merchant', 'change'); await page.waitForTimeout(150);
    ok(await page.getAttribute('[data-pers="' + ps[2].id + '"]', 'aria-pressed') === 'true' && await page.getAttribute('[data-pers="' + ps[0].id + '"]', 'aria-pressed') === 'false', 'Händler nicht gemerkt');
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
  await test('Sheet: kleiner Zug federt zurück, Wisch nach unten schließt', async () => {
    await fresh(); await page.click('[data-act="settings"]'); await page.waitForTimeout(500);
    const drag = (dy, ms) => page.evaluate(([dy, ms]) => new Promise(res => { const el = document.querySelector('.sheet-head'); const b = el.getBoundingClientRect(), x = b.left + 40, y = b.top + 10;
      const mk = (t, cy) => { let ev;
        try { const tc = new Touch({identifier:2, target:el, clientX:x, clientY:cy}); ev = new TouchEvent(t, {bubbles:true, cancelable:true, touches:t === 'touchend' ? [] : [tc], changedTouches:[tc]}); }
        catch (_) { const tc = {identifier:2, target:el, clientX:x, clientY:cy, pageX:x, pageY:cy}; ev = new Event(t, {bubbles:true, cancelable:true}); Object.defineProperty(ev, 'touches', {value:t === 'touchend' ? [] : [tc]}); Object.defineProperty(ev, 'changedTouches', {value:[tc]}); }
        el.dispatchEvent(ev); };
      mk('touchstart', y); let i = 0; const n = 8; const iv = setInterval(() => { i++; mk('touchmove', y + dy * i / n); if (i === n) { clearInterval(iv); mk('touchend', y + dy); res(); } }, ms / n); }), [dy, ms]);
    await drag(60, 400); await page.waitForTimeout(700);
    ok(await page.$('#sheet:not([hidden])') && !(await page.getAttribute('.sheet', 'style') || '').includes('translateY'), 'kleiner Zug: nicht zurückgefedert');
    await drag(320, 120); await page.waitForTimeout(900); ok(!(await page.$('#sheet:not([hidden])')), 'Wisch hat nicht geschlossen');
    await page.click('[data-act="settings"]'); await page.waitForTimeout(600); ok(await page.$('#sheet:not([hidden])'), 'Sheet öffnet nicht erneut');
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
    await go('statistik'); await page.click('[data-act="taxlist"]'); for (let i = 0; i < 20 && !/Fachbuchhandlung/.test(await page.innerText('#sheetBody')); i++) await page.waitForTimeout(150); ok(/Werbungskosten/.test(await page.innerText('#sheetBody')) && /Fachbuchhandlung/.test(await page.innerText('#sheetBody')), 'Steuerliste');
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
    await loadPlan(); await page.click('[data-act="settings"]'); await page.waitForTimeout(400); await page.uncheck('#s-enc'); await page.check('#s-photos');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup"]')]);
    const file = path.join(require('os').tmpdir(), 'kb-test-backup.json'); await dl.saveAs(file);
    const j = JSON.parse(fs.readFileSync(file, 'utf8')); ok(j.version === 2 && Object.keys(j.blobs || {}).length === 1, 'Fotos fehlen im Backup');
    await fresh(); await page.setInputFiles('#jsonInput', file); await page.waitForTimeout(300); await page.click('#r-go'); await page.waitForTimeout(500);
    const d = await page.evaluate(DUMP); ok(d.entries.length === 1 && d.blobs === 1 && d.profile.groups.length === 5, JSON.stringify({n:d.entries.length, b:d.blobs, g:(d.profile.groups || []).length}));
  });
  await test('Backup verschlüsselt: Datei ohne Klartext, falsches Passwort scheitert, richtiges stellt wieder her', async () => {
    await fresh();
    await seed(`(p, es) => { es.put({id:'c1', type:'expense', amount:4321, catId:'lebensmittel', date:'${today()}', merchant:'Geheimladen'}); }`);
    await page.click('[data-act="settings"]'); await page.waitForTimeout(400); ok(await page.isChecked('#s-enc'), 'Verschlüsselung ist nicht Standard');
    await page.click('[data-act="backup"]'); await page.waitForTimeout(300);
    await page.fill('#bk-pw', 'kurz'); await page.fill('#bk-pw2', 'kurz'); await page.click('#bkForm button[type=submit]'); ok(/mindestens 8/.test(await page.innerText('#bk-err')), 'kurzes Passwort akzeptiert');
    await page.fill('#bk-pw', 'Test-Passwort-1'); await page.fill('#bk-pw2', 'Test-Passwort-1'); await page.click('#bkForm button[type=submit]'); await page.waitForSelector('#bk-save', {timeout:20000});
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bk-save')]);
    const file = path.join(require('os').tmpdir(), 'kb-test-enc.json'); await dl.saveAs(file); const raw = fs.readFileSync(file, 'utf8'), j = JSON.parse(raw);
    ok(j.kind === 'encrypted' && j.cipher === 'AES-256-GCM' && j.kdf.iterations >= 600000 && !raw.includes('Geheimladen') && !raw.includes('entries'), 'Backup nicht verschlüsselt');
    await fresh(); await page.setInputFiles('#jsonInput', file); await page.waitForSelector('#bu-pw');
    await page.fill('#bu-pw', 'falsches-passwort'); await page.click('#buForm button[type=submit]'); for (let i = 0; i < 80 && !/falsch/.test(await page.innerText('#bu-err')); i++) await page.waitForTimeout(250); ok(/falsch/.test(await page.innerText('#bu-err')), 'falsches Passwort nicht abgelehnt');
    await page.fill('#bu-pw', 'Test-Passwort-1'); await page.click('#buForm button[type=submit]'); await page.waitForSelector('#r-go', {timeout:20000}); await page.click('#r-go'); await page.waitForTimeout(500);
    const d = await page.evaluate(DUMP); ok(d.entries.length === 1 && d.entries[0].merchant === 'Geheimladen', 'Wiederherstellung: ' + d.entries.length);
  });
  await test('Update: Stand wird vor Datenumbauten gesichert und lässt sich zurückholen', async () => {
    await fresh();
    await seed(`(p, es) => { es.put({id:'u1', type:'expense', amount:1000, catId:'lebensmittel', date:'${today()}', merchant:'Vorher'}); }`);
    ok(!(await page.evaluate(() => kvGet('snapshots'))), 'Sicherung ohne Versionswechsel');
    await page.evaluate(() => kvSet('appVersion', 'alt')); await page.reload(); await page.waitForTimeout(700);
    const sn = await page.evaluate(() => kvGet('snapshots')); ok(sn && sn.length === 1 && sn[0].entries.length === 1 && sn[0].from === 'alt', 'keine Sicherung: ' + JSON.stringify(sn && sn.length));
    await page.evaluate(async () => { await deleteEntries(['u1']); await putEntries([{id:'u2', type:'expense', amount:500, catId:'lebensmittel', date:today(), merchant:'Nachher'}]); });
    await page.click('[data-act="settings"]'); await page.waitForSelector('#s-snap-go'); await page.click('#s-snap-go'); await page.waitForSelector('#sn-go'); await page.click('#sn-go'); await page.waitForTimeout(500);
    const d = await page.evaluate(DUMP); ok(d.entries.length === 1 && d.entries[0].id === 'u1', 'Zurückholen: ' + JSON.stringify(d.entries.map(e => e.id)));
    await page.reload(); await page.waitForTimeout(700); ok((await page.evaluate(() => kvGet('snapshots'))).length === 1, 'zweite Sicherung ohne Versionswechsel');
  });
  await test('Backup-Prüfung lässt saubere Daten unverändert', async () => {
    await fresh(); await page.click('[data-act="examples-load"]'); await page.waitForTimeout(500); await loadPlan();
    await seed(`(p, es) => { p.persons = [{id:'pa', name:'Person A', color:1}]; p.personAlias = {markt:['pa']}; p.goals = [{id:'g1', name:'Rücklage', target:100000, due:'2027-06', catId:'', cardId:'', start:0, startDate:'${today()}'}]; es.put({id:'k1', type:'expense', amount:1299, catId:'lebensmittel', date:'${today()}', merchant:'Markt', note:'', persons:['pa'], tax:'wk', warrantyUntil:'2027-01-01', bankKeys:['x'], receipts:[{blobId:'b1'}], items:[{n:'Brot', raw:'BROT', g:'Brot & Gebäck', q:1, t:299, k:'item'}, {n:'Alt', t:-50}], ai:{status:'warn', findings:['Datum fehlt']}}); es.put({id:'k2', type:'expense', amount:5000, catId:'lebensmittel', date:'${today()}', merchant:'Markt', splits:[{catId:'lebensmittel', amount:3500}, {catId:'sonstiges', amount:1500}], items:[{n:'Brot', raw:'BROT', g:'Brot & Gebäck', q:1, t:3500, k:'item', c:'lebensmittel'}, {n:'Topf', raw:'TOPF', g:'Sonstiges', q:1, t:1500, k:'item', c:'sonstiges'}]}); }`);
    const r = await page.evaluate(() => { const canon = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
      const diff = allEntries().filter(e => canon(cleanBackupEntry(e)) !== canon(e)).map(e => e.id);
      return {n:allEntries().length, diff, prof:canon(cleanBackupProfile(S.profile)) === canon(normalizeProfile(S.profile))}; });
    ok(r.n > 20 && !r.diff.length, 'Einträge verändert: ' + r.diff.slice(0, 5).join()); ok(r.prof, 'Einstellungen verändert');
  });
  await test('Backup-Prüfung: präparierte Datei richtet nichts an', async () => {
    await fresh();
    const P = '"><img src=x onerror="window.__xss=1"><i class="inj"></i>';
    const bad = {app:'Kassabuch', version:2, profile:{categories:[{id:'lebensmittel', name:'Essen', kind:'expense', color:'rot'}, {id:5, name:'kaputt'}, 'x'], cards:[{id:'c1', name:'Karte', kind:P, color:{}, last4:1234}], persons:[{id:'p1', name:'P', color:'x'}, null], recurring:[{id:'r1', amount:'viel'}], budgets:{lebensmittel:'abc', __proto__:{x:1}}, personAlias:{a:'kein Array'}, groups:'nein', totalBudget:'x'},
      entries:[{id:'h1', type:'expense', amount:1000.4, catId:'lebensmittel', cardId:'c1', date:'${today()}', merchant:{a:1}, persons:'p1', tax:P, items:'x', receipts:[{blobId:'hb', pdf:true}], ai:{status:P, findings:[P, 5]}}, {id:'h2', type:P, amount:5, date:'${today()}'}, {id:'h3', type:'expense', amount:'5', date:'${today()}'}, null],
      blobs:{hb:'data:text/html;base64,' + Buffer.from('<script>window.x=1</scr' + 'ipt>').toString('base64')}};
    const f = path.join(require('os').tmpdir(), 'kb-bad.json'); fs.writeFileSync(f, JSON.stringify(bad).replace(/\$\{today\(\)\}/g, today()));
    await page.setInputFiles('#jsonInput', f); await page.waitForSelector('#r-go'); ok(/3 fehlerhafte Einträge werden übersprungen/.test(await page.innerText('#sheetBody')), 'kein Hinweis: ' + (await page.innerText('#sheetBody')).slice(0, 200));
    await page.click('#r-go'); await page.waitForTimeout(500);
    const d = await page.evaluate(async () => { const e = S.entries.get('h1'), b = await tx('blobs', 'readonly', s => s.get('hb')); return {n:allEntries().length, amount:e.amount, merchant:e.merchant, persons:e.persons, tax:e.tax, items:e.items, st:e.ai.status, f:e.ai.findings.length, blob:b && b.type, cat:S.profile.categories.length, color:S.profile.categories[0].color, kind:S.profile.cards[0].kind, l4:S.profile.cards[0].last4, pers:S.profile.persons.length, rec:S.profile.recurring.length, bud:Object.keys(S.profile.budgets).length, tb:S.profile.totalBudget}; });
    ok(d.n === 1 && d.amount === 1000 && d.merchant === undefined && d.persons.length === 0 && d.tax === undefined && d.items.length === 0 && d.st === undefined && d.f === 1, 'Eintrag: ' + JSON.stringify(d));
    ok(d.blob === 'application/octet-stream', 'Dateityp: ' + d.blob); ok(d.cat === 1 && d.color === 0 && d.kind === 'debit' && d.l4 === '1234' && d.pers === 1 && d.rec === 0 && d.bud === 0 && d.tb === null, 'Einstellungen: ' + JSON.stringify(d));
    for (const r of ['uebersicht', 'eintraege', 'budgets', 'karten', 'statistik', 'fixkosten']) await go(r);
    await go('eintraege'); await page.click('#eList .row[data-act="edit"][data-id="h1"]'); await page.waitForTimeout(400);
    ok(!(await page.$('.inj')) && !(await page.evaluate(() => window.__xss)), 'Einschleusung im Eintrag');
    ok((await page.evaluate(() => buildReport({kind:'month', month:S.month, sec:{sum:1, cats:1, budget:1, pers:1, list:1}}).pages)) >= 1, 'PDF-Bericht');
  });
  await test('Prüfstatus aus gespeicherten Daten wird nur in bekannter Form angezeigt', async () => {
    await fresh();
    await seed(`(p, es) => { es.put({id:'s9', type:'expense', amount:100, catId:'lebensmittel', date:'${today()}', merchant:'M', source:'scan', ai:{status:'"><i class="inj"></i>', findings:[]}}); }`);
    await go('eintraege'); await page.click('#eList .row[data-act="edit"][data-id="s9"]'); await page.waitForTimeout(400);
    ok(!(await page.$('.inj')), 'Status ungefiltert angezeigt'); ok(await page.evaluate(() => verdictChip('bad').includes('n.i.O.') && verdictChip('constructor') === ''), 'verdictChip');
  });
  await test('CSV: Text mit Formelzeichen wird entschärft, Zahlen bleiben Zahlen', async () => {
    await fresh();
    const r = await page.evaluate(() => [csvCell('=1+1'), csvCell('+43 660'), csvCell('@x'), csvCell('-12,30'), csvCell('12.5'), csvCell('Markt; Süd'), csvCell('Lidl'), csvCell(null), csvCell('-Rabatt')]);
    ok(JSON.stringify(r) === JSON.stringify(["'=1+1", "'+43 660", "'@x", '-12,30', '12.5', '"Markt; Süd"', 'Lidl', '', "'-Rabatt"]), JSON.stringify(r));
  });
  await test('Beleg-Scan sendet keine Einnahme-Kategorien mit', async () => {
    await fresh(); const t = await page.evaluate(() => scanPrompt());
    ok(/lebensmittel = /.test(t) && !/gehalt = /i.test(t) && !/Einnahme\)/.test(t), 'Kategorienliste im Prompt');
  });
  await test('Aufteilung: Budgets und Summen zählen die Teilbeträge, Kategoriefilter zeigt den Anteil', async () => {
    await fresh();
    await seed(`(p, es) => { p.budgets = {lebensmittel:20000, kinder:10000}; es.put({id:'s1', type:'expense', amount:10000, catId:'lebensmittel', date:'${today()}', merchant:'Markt', splits:[{catId:'lebensmittel', amount:7000}, {catId:'kinder', amount:3000}]}); es.put({id:'s2', type:'expense', amount:500, catId:'kinder', date:'${today()}', merchant:'Spielwaren'}); es.put({id:'s3', type:'income', amount:90000, catId:'gehalt', date:'${today()}', merchant:'Arbeit'}); }`);
    const r = await page.evaluate(() => { const l = entriesIn(S.month), e = S.entries.get('s1'); const odd = catShares(Object.assign({}, e, {amount:5001}));
      return {by:spentByCat(l), s:sums(l), odd, bs:budgetSpent(l), label:catLabel(e), plain:catShares(S.entries.get('s2')), inc:catShares(S.entries.get('s3'))}; });
    ok(r.by.lebensmittel === 7000 && r.by.kinder === 3500 && r.s.exp === 10500 && r.s.inc === 90000 && r.bs === 10500, 'Summen: ' + JSON.stringify(r));
    ok(r.odd.length === 2 && r.odd[0][1] + r.odd[1][1] === 5001 && Math.abs(r.odd[0][1] - 3501) <= 1, 'geänderter Betrag behält das Verhältnis: ' + JSON.stringify(r.odd));
    ok(r.label === 'Lebensmittel + 1' && r.plain.length === 1 && r.plain[0][1] === 500 && r.inc.length === 1, 'Einzelbuchungen unverändert');
    await go('eintraege'); ok(/Lebensmittel \+ 1/.test(await page.innerText('#eList [data-id="s1"].row')), 'Liste zeigt die Aufteilung nicht');
    await page.selectOption('#eCat', 'kinder'); await page.waitForTimeout(300);
    ok(await page.$$eval('#eList .swipe', l => l.length) === 2, 'Filter: Anzahl');
    const row = (await page.innerText('#eList [data-id="s1"].row')).replace(/\s+/g, ' ');
    ok(/30,00/.test(row) && /von € ?100,00/.test(row), 'Anteil in der Zeile: ' + row);
    ok(/35,00/.test(await page.innerText('#eSum')), 'Summe mit Anteil: ' + await page.innerText('#eSum'));
    await go('uebersicht'); const ov = (await page.innerText('#view .brow[data-cat="kinder"]')).replace(/\s+/g, ' '); ok(/35/.test(ov), 'Budget Kinder in der Übersicht: ' + ov);
  });
  await test('Aufteilung im Eintrag: Teil anlegen, Rest bleibt, zu viel wird abgelehnt, aufheben', async () => {
    await fresh();
    await page.click('.tabbar [data-act="add"]'); await page.waitForTimeout(250);
    await page.fill('#f-amount', '100'); await page.fill('#f-merchant', 'Markt');
    if (!(await page.$('#f-catchips [data-cat="lebensmittel"]'))) await page.click('#f-catmore'); await page.click('[data-cat="lebensmittel"]');
    await page.click('#f-split-add'); await page.selectOption('[data-sp-cat="0"]', 'kinder'); await page.fill('[data-sp-amt="0"]', '30');
    ok(/Lebensmittel behält € ?70,00/.test((await page.innerText('#f-split-rest')).replace(/\s+/g, ' ')), 'Rest: ' + await page.innerText('#f-split-rest'));
    await page.click('#f-save'); await page.waitForTimeout(450);
    let e = (await page.evaluate(DUMP)).entries[0];
    ok(e.catId === 'lebensmittel' && JSON.stringify(e.splits) === JSON.stringify([{catId:'lebensmittel', amount:7000}, {catId:'kinder', amount:3000}]), 'gespeichert: ' + JSON.stringify(e.splits));
    await go('eintraege'); await page.click('#eList [data-act="edit"]'); await page.waitForTimeout(350);
    ok((await page.inputValue('[data-sp-amt="0"]')) === '30,00' && (await page.inputValue('[data-sp-cat="0"]')) === 'kinder', 'Teil nicht wieder angezeigt');
    await page.fill('[data-sp-amt="0"]', '120'); await page.click('#f-save'); await page.waitForTimeout(300);
    ok(await page.isVisible('#f-err') && /mehr als den Betrag/.test(await page.innerText('#f-err')), 'zu große Teile nicht abgelehnt');
    await page.fill('[data-sp-amt="0"]', '80'); await page.click('#f-save'); await page.waitForTimeout(450);
    e = (await page.evaluate(DUMP)).entries[0]; ok(e.catId === 'kinder' && e.splits[0].amount === 8000 && e.splits[1].amount === 2000, 'größter Teil wird Hauptkategorie: ' + JSON.stringify(e));
    await page.click('#eList [data-act="edit"]'); await page.waitForTimeout(350); await page.click('#f-split-off'); await page.click('#f-save'); await page.waitForTimeout(450);
    e = (await page.evaluate(DUMP)).entries[0]; ok(!e.splits && e.catId === 'kinder' && e.amount === 10000, 'Aufheben: ' + JSON.stringify(e));
  });
  await test('Beleg-Scan: Artikel-Kategorien ergeben einen Aufteilungs-Vorschlag, Rabatt wird anteilig verteilt', async () => {
    await fresh(); await page.click('[data-act="settings"]'); await page.fill('#s-key-in', 'sk-ant-api03-' + 'T'.repeat(40)); await page.click('#s-key button[type=submit]'); await page.waitForTimeout(300);
    scanReply = Object.assign({}, FAKE_SCAN, {total:20, receiptNo:'4712', savingsPrinted:1, items:[{name:'MILCH', clean:'Milch 1l', group:'Milch & Käse', cat:'lebensmittel', qty:1, total:6, kind:'item'}, {name:'BROT', clean:'Brot', group:'Brot & Gebäck', cat:null, qty:1, total:3, kind:'item'}, {name:'WINDELN', clean:'Windeln', group:'Baby & Kind', cat:'kinder', qty:1, total:9, kind:'item'}, {name:'SOCKEN', clean:'Socken', group:'Sonstiges', cat:'gehalt', qty:1, total:3, kind:'item'}, {name:'RABATT', clean:'Rabatt', group:'Sonstiges', cat:null, qty:1, total:-1, kind:'discount'}]});
    try {
      ok(/"cat": string\|null/.test(await page.evaluate(() => scanPrompt())), 'Prompt fragt keine Artikel-Kategorie ab');
      await go('uebersicht'); await page.setInputFiles('#receiptInput', {name:'bon2.png', mimeType:'image/png', buffer:TINY_PNG}); await page.waitForTimeout(2500);
      ok(/Aufgeteilt nach Artikeln/.test(await page.innerText('#sheet')), 'Hinweis auf die Aufteilung fehlt');
      ok((await page.inputValue('[data-sp-cat="0"]')) === 'kinder' && (await page.inputValue('[data-sp-amt="0"]')) === '8,57', 'Vorschlag: ' + await page.inputValue('[data-sp-amt="0"]'));
      await page.click('#f-save'); await page.waitForTimeout(500);
      const e = (await page.evaluate(DUMP)).entries[0];
      ok(e.amount === 2000 && e.catId === 'lebensmittel' && JSON.stringify(e.splits) === JSON.stringify([{catId:'lebensmittel', amount:1143}, {catId:'kinder', amount:857}]), 'gespeichert: ' + JSON.stringify(e.splits));
      ok(e.items.map(i => i.c || '-').join() === 'lebensmittel,lebensmittel,kinder,lebensmittel,-', 'Artikel-Kategorien: ' + e.items.map(i => i.c || '-').join());
      /* einen Artikel umhängen: die Teile werden neu berechnet */
      await page.evaluate(id => openEntry(id), e.id); await page.waitForTimeout(450);
      await page.evaluate(() => { [...document.querySelectorAll('#entryForm details')].forEach(d => { d.open = true; }); });
      await page.selectOption('[data-item="3"]', 'shopping'); await page.waitForTimeout(200);
      await page.click('#f-save'); await page.waitForTimeout(450);
      const e2 = (await page.evaluate(DUMP)).entries[0];
      ok(e2.splits.length === 3 && e2.splits.reduce((a, s) => a + s.amount, 0) === 2000 && e2.splits.some(s => s.catId === 'shopping' && s.amount === 286), 'nach Umhängen: ' + JSON.stringify(e2.splits));
    } finally { scanReply = null; }
  });
  await test('Alte Belege: einmalige Aufteilung nach Warengruppen, andere Buchungen bleiben unverändert', async () => {
    await fresh();
    const food = `{n:'Brot', raw:'BROT', g:'Brot & Gebäck', q:1, t:600, k:'item'}`, baby = `{n:'Windeln', raw:'WINDELN', g:'Baby & Kind', q:1, t:400, k:'item'}`;
    await seed(`(p, es) => { kv.delete('mig-split1');
      es.put({id:'m1', type:'expense', amount:1000, catId:'lebensmittel', date:'${today()}', merchant:'Markt', items:[${food}, ${baby}]});
      es.put({id:'m2', type:'expense', amount:600, catId:'lebensmittel', date:'${today()}', merchant:'Markt', items:[${food}]});
      es.put({id:'m3', type:'expense', amount:1000, catId:'restaurant', date:'${today()}', merchant:'Gasthaus', items:[${food}, ${baby}]});
      es.put({id:'m4', type:'expense', amount:1000, catId:'lebensmittel', date:'${today()}', merchant:'Markt'});
      es.put({id:'m5', type:'income', amount:1000, catId:'gehalt', date:'${today()}', merchant:'Arbeit', items:[${food}, ${baby}]}); }`);
    await page.waitForTimeout(400);
    const d = Object.fromEntries((await page.evaluate(DUMP)).entries.map(e => [e.id, e]));
    ok(JSON.stringify(d.m1.splits) === JSON.stringify([{catId:'lebensmittel', amount:600}, {catId:'kinder', amount:400}]) && d.m1.catId === 'lebensmittel' && d.m1.amount === 1000, 'm1: ' + JSON.stringify(d.m1.splits));
    for (const id of ['m2', 'm3', 'm4', 'm5']) ok(!d[id].splits && !(d[id].items || []).some(i => i.c), id + ' wurde verändert');
    /* zweiter Start: nichts passiert mehr, auch nicht nach dem Aufheben */
    await page.evaluate(async () => { const e = clean(S.entries.get('m1')); delete e.splits; await saveEntry(e); });
    await page.reload(); await page.waitForTimeout(700);
    ok(!(await page.evaluate(() => S.entries.get('m1').splits)), 'Aufteilung kam von selbst wieder');
  });
  await test('Beleg-Button: PDF aus Dateien wird angenommen und als Dokument an die KI geschickt', async () => {
    await fresh(); await page.click('[data-act="settings"]'); await page.fill('#s-key-in', 'sk-ant-api03-' + 'T'.repeat(40)); await page.click('#s-key button[type=submit]'); await page.waitForTimeout(300);
    ok(/application\/pdf/.test(await page.getAttribute('#receiptInput', 'accept')), 'Auswahl lässt keine PDFs zu');
    const txt = 'BT /F1 12 Tf 20 100 Td (Rechnung 12,50 EUR) Tj ET';
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', '<< /Length ' + txt.length + ' >>\nstream\n' + txt + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let out = '%PDF-1.4\n', offs = []; objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const x = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
    lastAsk = null; await go('uebersicht');
    await page.setInputFiles('#receiptInput', {name:'rechnung.pdf', mimeType:'application/pdf', buffer:Buffer.from(out, 'latin1')});
    for (let i = 0; i < 16 && !(await page.$('#f-save')); i++) await page.waitForTimeout(250);
    const parts = lastAsk && lastAsk.messages[0].content.map(c => c.type + ':' + (c.source ? c.source.media_type : '')).join();
    ok(/document:application\/pdf/.test(parts || ''), 'KI bekam kein PDF: ' + parts);
    await page.click('#f-save'); await page.waitForTimeout(500);
    const d = await page.evaluate(DUMP); ok(d.entries.length === 1 && (d.entries[0].receipts || []).length === 1 && d.entries[0].receipts[0].pdf === true, 'Eintrag mit PDF-Beleg fehlt: ' + JSON.stringify(d.entries[0] || null).slice(0, 200));
  });
  await test('Langer Bild-Beleg (PDF mit hohem Bild): KI bekommt lesbare Abschnitte statt einer Mini-Seite', async () => {
    await fresh(); await page.click('[data-act="settings"]'); await page.fill('#s-key-in', 'sk-ant-api03-' + 'T'.repeat(40)); await page.click('#s-key button[type=submit]'); await page.waitForTimeout(300);
    /* 200 × 5000 px, weiß mit dunklen „Zeilen“: 20 px Text, 20 px Abstand – wie ein Kassenbon */
    const w = 200, h = 5000, px = Buffer.alloc(w * h * 3, 255);
    for (let y = 0; y < h; y++) if (y % 40 < 20) for (let x = 10; x < 190; x++) { const o = (y * w + x) * 3; px[o] = px[o + 1] = px[o + 2] = 30; }
    const cont = 'q 30 0 0 750 100 40 cm /Im1 Do Q', parts = [];
    const objs = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>'),
      Buffer.from('<< /Length ' + cont.length + ' >>\nstream\n' + cont + '\nendstream'),
      Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ' + px.length + ' >>\nstream\n'), px, Buffer.from('\nendstream')])];
    let len = 0; const offs = []; const push = b => { parts.push(b); len += b.length; };
    push(Buffer.from('%PDF-1.4\n')); objs.forEach((o, i) => { offs.push(len); push(Buffer.from((i + 1) + ' 0 obj\n')); push(o); push(Buffer.from('\nendobj\n')); });
    const x = len; push(Buffer.from('xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF'));
    lastAsk = null; await go('uebersicht');
    await page.setInputFiles('#receiptInput', {name:'lang.pdf', mimeType:'application/pdf', buffer:Buffer.concat(parts)});
    for (let i = 0; i < 30 && !(await page.$('#f-save')); i++) await page.waitForTimeout(300);
    const c = lastAsk ? lastAsk.messages[0].content : [];
    const imgs = c.filter(p => p.type === 'image'), docs = c.filter(p => p.type === 'document');
    ok(docs.length === 0 && imgs.length >= 3 && imgs.length <= 5, 'Abschnitte: ' + imgs.length + ' Bilder, ' + docs.length + ' PDF');
    ok(/consecutive slices of ONE long receipt/.test(c[0] && c[0].text || ''), 'Hinweis auf die Abschnitte fehlt');
    ok(lastAsk.max_tokens >= 32000, 'zu wenig Platz für lange Belege: ' + lastAsk.max_tokens);
    await page.click('#f-save'); await page.waitForTimeout(500);
    const d = await page.evaluate(DUMP); ok((d.entries[0].receipts || []).length === 1 && d.entries[0].receipts[0].pdf === false, 'Bild-PDF nicht als JPEG gespeichert');
  });
  await test('Großer Einkauf: alle 130 Positionen bleiben, 4,9 % USt gilt als normaler Satz', async () => {
    await fresh(); await page.click('[data-act="settings"]'); await page.fill('#s-key-in', 'sk-ant-api03-' + 'T'.repeat(40)); await page.click('#s-key button[type=submit]'); await page.waitForTimeout(300);
    const items = []; for (let i = 0; i < 65; i++) items.push({name:'ARTIKEL ' + i, clean:'Artikel ' + i, group:'Vorrat & Konserven', cat:'lebensmittel', qty:1, total:2, kind:'item'}, {name:'Lidl Plus Rabatt', clean:'Rabatt', group:'Sonstiges', cat:'lebensmittel', qty:1, total:-0.1, kind:'discount'});
    scanReply = Object.assign({}, FAKE_SCAN, {total:123.5, receiptNo:'7777', savingsPrinted:null, items, vat:[{rate:4.9, net:117.73, tax:5.77, gross:123.5}]});
    try {
      const pr = await page.evaluate(() => scanPrompt());
      ok(!/at most 60/.test(pr) && /List EVERY line/.test(pr) && /4\.9/.test(pr), 'Prompt begrenzt noch die Positionen');
      await go('uebersicht'); await page.setInputFiles('#receiptInput', {name:'gross.png', mimeType:'image/png', buffer:TINY_PNG});
      for (let i = 0; i < 20 && !(await page.$('#f-save')); i++) await page.waitForTimeout(250);
      const t = await page.innerText('#sheet');
      ok(!/Steuersatz 4\.9 % ist ungewöhnlich/.test(t), '4,9 % wird noch als ungewöhnlich gemeldet');
      ok(/Positionen \(130\)/.test(t), 'Positionen gekürzt: ' + (t.match(/Positionen \(\d+\)/) || ['?'])[0]);
      await page.click('#f-save'); await page.waitForTimeout(500);
      const e = (await page.evaluate(DUMP)).entries[0]; ok(e.items.length === 130, 'gespeichert: ' + e.items.length);
    } finally { scanReply = null; }
  });
  await test('Mehrere Belege: Warteschlange, Überspringen, Zähler', async () => {
    await fresh(); await page.click('[data-act="settings"]'); await page.fill('#s-key-in', 'sk-ant-api03-' + 'T'.repeat(40)); await page.click('#s-key button[type=submit]'); await page.waitForTimeout(300);
    await go('uebersicht'); const f = n => ({name:'bon' + n + '.png', mimeType:'image/png', buffer:TINY_PNG});
    await page.setInputFiles('#receiptInput', [f(1), f(2), f(3)]); await page.waitForTimeout(400);
    await page.click('#sm-each'); await page.waitForSelector('#f-save'); ok(/Beleg 1 von 3/.test(await page.innerText('#sheetTitle')), 'Titel 1');
    await page.click('#f-save'); await page.waitForTimeout(900); await page.waitForSelector('#f-save'); ok(/Beleg 2 von 3/.test(await page.innerText('#sheetTitle')), 'Titel 2');
    await closeSheet(); await page.waitForTimeout(900); await page.waitForSelector('#f-save'); ok(/Beleg 3 von 3/.test(await page.innerText('#sheetTitle')), 'Titel 3');
    await page.click('#f-save'); await page.waitForTimeout(900);
    const d = await page.evaluate(DUMP); ok(d.entries.length === 2 && d.blobs === 2, JSON.stringify({n:d.entries.length, b:d.blobs}));
    ok(/2 von 3 Belegen gespeichert/.test(await page.innerText('#toast')), 'Abschluss-Hinweis');
  });
  await test('Doppelter Beleg: Warnung vor dem Speichern, Verwerfen', async () => {
    await fresh(); await page.click('[data-act="settings"]'); await page.fill('#s-key-in', 'sk-ant-api03-' + 'T'.repeat(40)); await page.click('#s-key button[type=submit]'); await page.waitForTimeout(300); await go('uebersicht');
    await page.setInputFiles('#receiptInput', {name:'a.png', mimeType:'image/png', buffer:TINY_PNG}); await page.waitForSelector('#f-save'); ok(!(await page.$('#dup-drop')), 'Warnung beim ersten Mal');
    await page.click('#f-save'); await page.waitForTimeout(500);
    ok((await page.evaluate(DUMP)).entries[0].receiptHash, 'Hash nicht gespeichert');
    await page.evaluate(() => { document.getElementById('receiptInput').value = ''; });   // wie die App vor jeder Auswahl: sonst meldet WebKit dieselbe Datei nicht erneut
    await page.setInputFiles('#receiptInput', {name:'a.png', mimeType:'image/png', buffer:TINY_PNG}); await page.waitForSelector('#dup-drop', {timeout:10000}).catch(() => {});
    ok(/Das hast du schon/.test(await page.innerText('#sheetBody')) && /Foto/.test(await page.innerText('#sheetBody')), 'keine Warnung beim zweiten Mal: ' + (await page.innerText('#sheetBody')).replace(/\s+/g, ' ').slice(0, 300));
    ok(/Trotzdem speichern/.test(await page.innerText('#f-save')), 'Speichern-Knopf');
    await page.click('#dup-drop'); await page.waitForTimeout(300); ok((await page.evaluate(DUMP)).entries.length === 1, 'Duplikat gespeichert');
    const other = Buffer.concat([TINY_PNG, Buffer.from([0])]);
    await page.setInputFiles('#receiptInput', {name:'b.png', mimeType:'image/png', buffer:other}); await page.waitForSelector('#f-save');
    ok(/Belegnummer 4711/.test(await page.innerText('#sheetBody')), 'Belegnummer nicht erkannt');
  });
  await test('Trade Republic: eingehende Überweisung mit zusammengeklebten Spalten', async () => {
    await fresh(); const r = await page.evaluate(async () => { const m = await import('./bank.js'); const L = ['TRADE REPUBLIC BANK GMBH, BRANCH AUSTRIA', 'MAX MUSTER | DATUM | 02.11.2026', 'ÜBERWEISUNGSBESTÄTIGUNG', 'BETRAG | STATUS | ÜBERWEISUNGSDATUM TYP | REFERENZ', '€ 1.234,50 Ausgeführt 02.11.2026 | Überweisung REF-TEST 42', 'ANGABEN ZUM SENDER', 'NAME | IBAN | BIC', 'MUSTER GMBH | AT00 0000 0000 0000 1234| TESTATWWXXX'];
      const old = ['TRADE REPUBLIC BANK GMBH', 'ÜBERWEISUNGSBESTÄTIGUNG', 'BETRAG | STATUS | ÜBERWEISUNGSDATUM | TYP | REFERENZ', '€ 5,00 | Ausgeführt | 03.11.2026 | Überweisung | Miete', 'ANGABEN ZUM EMPFÄNGER', 'NAME | IBAN | BIC', 'VERMIETER | AT00 0000 0000 0000 9999 | TESTATWWXXX'];
      return [m.parseBank(L, 'incoming-transfer-00000000-0000-0000-0000-000000000001.pdf'), m.parseBank(old, 'x.pdf')]; });
    ok(r[0].ok && r[0].date === '2026-11-02' && r[0].amount === 123450 && r[0].type === 'income' && r[0].merchant === 'MUSTER GMBH' && r[0].reference === 'REF-TEST 42' && !r[0].pending && r[0].counterpartyIbanLast4 === '1234', JSON.stringify(r[0]));
    ok(r[1].ok && r[1].date === '2026-11-03' && r[1].amount === 500 && r[1].type === 'expense' && r[1].reference === 'Miete', JSON.stringify(r[1]));
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
  await test('Bank-Parser: Revolut-Erstattung (gebucht, mit Kontostand) wird Einnahme mit Erstattungs-Kennung', async () => {
    await fresh(); const r = await page.evaluate(async () => { const m = await import('./bank.js');
      const ref = m.parseBank(['EUR-Kontoauszug', 'Datum | Beschreibung | Geldausgang | Geldeingang | Kontostand', '17.11.2026 | Testshop | 27,22€ | 93,78€', 'Von: Testshop* AB12, Musterstadt', 'Karte: 400000******1111', 'Revolut Bank UAB'], 'a.pdf');
      const ref2 = m.parseBank(['EUR-Kontoauszug', 'Datum | Beschreibung | Geldausgang | Geldeingang | Kontostand', '17.11.2026 | Testshop | 27,22€ | 66,56€', 'Von: Testshop* AB12, Musterstadt', 'Karte: 400000******1111', 'Revolut Bank UAB'], 'b.pdf');
      const pay = m.parseBank(['Startdatum | Beschreibung | Geldausgang', '05.11.2026 | Markt | 25,25€', 'An: Markt 1, Musterort', 'Karte: 400000******1111', 'Autorisierungscode: ABC123', 'Revolut Bank UAB'], 'c.pdf');
      return {ref, ref2, pay}; });
    ok(r.ref.ok && r.ref.type === 'income' && r.ref.refund && r.ref.amount === 2722 && r.ref.date === '2026-11-17' && r.ref.merchant === 'Testshop' && r.ref.cardLast4 === '1111', JSON.stringify(r.ref));
    ok(r.ref.id !== r.ref2.id, 'gleiche Beträge am selben Tag dürfen nicht dieselbe ID haben');
    ok(r.pay.ok && r.pay.type === 'expense' && !r.pay.refund && r.pay.amount === 2525 && r.pay.id === 'ABC123-2026-11-05', 'vorgemerkte Zahlung: ' + JSON.stringify(r.pay));
  });
  await test('Erstattung: mindert Ausgaben und Budget der Kategorie, zählt nicht als Einnahme', async () => {
    await fresh();
    await seed(`(p, es) => { p.budgets = {shopping:10000}; es.put({id:'r1', type:'expense', amount:6000, catId:'shopping', date:'${today()}', merchant:'Testshop'}); es.put({id:'r2', type:'income', amount:2500, catId:'shopping', date:'${today()}', merchant:'Testshop'}); es.put({id:'r3', type:'income', amount:90000, catId:'gehalt', date:'${today()}', merchant:'Arbeit'}); }`);
    const r = await page.evaluate(() => { const l = entriesIn(S.month); return {by:spentByCat(l), s:sums(l), ref:isRefund(S.entries.get('r2')), sal:isRefund(S.entries.get('r3')), opt:catOptions('income', 'shopping')}; });
    ok(r.by.shopping === 3500 && r.s.exp === 3500 && r.s.inc === 90000 && r.ref && !r.sal, JSON.stringify(r.by) + ' ' + JSON.stringify(r.s));
    ok(/>Erstattung Shopping</.test(r.opt), 'Auswahl ohne „Erstattung …“');
    await go('eintraege'); ok(/Erstattung Shopping/.test(await page.innerText('#eList [data-id="r2"].row')), 'Liste zeigt die Erstattung nicht');
    await go('uebersicht'); const ov = (await page.innerText('#view .brow[data-cat="shopping"]')).replace(/\s+/g, ' '); ok(/35/.test(ov), 'Budget Shopping: ' + ov);
  });
  await test('Bank-Import: Revolut-Erstattung übernimmt die Kategorie der früheren Käufe', async () => {
    await fresh();
    await seed(`(p, es) => { p.cards.push({id:'rv', name:'Revolut', last4:'1111'}); es.put({id:'k1', type:'expense', amount:5000, catId:'shopping', date:'2026-11-01', merchant:'Testshop', cardId:'rv'}); }`);
    const pdf = (() => { const t = [[20, 190, 'EUR-Kontoauszug'], [20, 170, 'Datum'], [110, 170, 'Beschreibung'], [250, 170, 'Geldausgang'], [340, 170, 'Geldeingang'], [430, 170, 'Kontostand'],
        [20, 155, '17.11.2026'], [110, 155, 'Testshop'], [340, 155, '27,22'], [430, 155, '93,78'], [110, 140, 'Von: Testshop* AB12, Musterstadt'], [110, 128, 'Karte: 400000******1111'], [20, 60, 'Revolut Bank UAB']];
      const txt = t.map(([x, y, s]) => 'BT /F1 10 Tf ' + x + ' ' + y + ' Td (' + s + ') Tj ET').join('\n');
      const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 520 220] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', '<< /Length ' + txt.length + ' >>\nstream\n' + txt + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
      let out = '%PDF-1.4\n', offs = []; objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
      const x = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
      return Buffer.from(out, 'latin1'); })();
    await page.setInputFiles('#bankInput', {name:'erstattung.pdf', mimeType:'application/pdf', buffer:pdf}); await page.waitForTimeout(2500);
    const t = (await page.innerText('#sheetBody')).replace(/\s+/g, ' ');
    ok(/Erstattung/.test(t) && /\+ € ?27,22/.test(t), 'Vorschau: ' + t.slice(0, 200));
    ok((await page.inputValue('#bk-cat-0')) === 'shopping', 'Kategorie nicht übernommen: ' + await page.inputValue('#bk-cat-0'));
    await page.click('#bk-go'); await page.waitForTimeout(500);
    const e = (await page.evaluate(DUMP)).entries.find(x => x.id !== 'k1');
    ok(e && e.type === 'income' && e.catId === 'shopping' && e.amount === 2722 && e.cardId === 'rv', JSON.stringify(e));
    ok((await page.evaluate(() => spentByCat(allEntries()).shopping)) === 2278, 'Ausgaben Shopping nicht gemindert');
  });
  await test('Bank-Parser: Raiffeisen-Lastschrift von Trade Republic wird als Raiffeisen gelesen', async () => {
    await fresh(); const r = await page.evaluate(async () => { const m = await import('./bank.js');
      return m.parseBank(['Buchung', 'Bank | Raiffeisenbank Musterregion eGen', 'Kontobezeichnung | Max Muster', 'IBAN | AT61 1904 3002 3457 3201', 'Geldausgang', 'Buchungsdatum | Buchungstext | Valutadatum | Betrag',
        '12.10.2026 | Trade Republic Trade Republic aaaaaaaa- | 12.10.2026 | -500,00 EUR', 'bbbb-4ccc-8ddd-eeeeeeeeeeee', 'DE89 3704 0044 0532 0130 00', 'TESTREF12345XY', 'DE02 1203 0000 0000 2020 51', 'ADYBDEB2XXX', '17.11.2026, | angemeldet als: Max Muster'], '2026-10-12_Buchung_123456.pdf'); });
    ok(r.ok && r.bank === 'rb' && r.type === 'expense' && r.amount === 50000 && r.date === '2026-10-12' && r.kind === 'transfer' && r.id === '123456', JSON.stringify(r));
    ok(r.merchant === 'Trade Republic' && r.counterpartyIbanLast4 === '3000' && r.ibanLast4 === '3201', 'Name/Konten: ' + r.merchant + ' ' + r.counterpartyIbanLast4 + ' ' + r.ibanLast4);
  });
  await test('Bank-Import: Lastschrift an eigene Bank wird Umbuchung (änderbar, Konto wird gemerkt)', async () => {
    await fresh();
    await seed(`(p, es) => { p.cards.push({id:'rbk', name:'Girokonto', ibanLast4:'3201'}, {id:'trk', name:'Broker', last4:'1111'}); p.bankMap['tr:1111:-'] = 'trk'; }`);
    const pdf = (() => { const t = [[20, 200, 'Buchung'], [20, 185, 'Bank'], [200, 185, 'Raiffeisenbank Musterregion eGen'], [20, 172, 'IBAN'], [200, 172, 'AT61 1904 3002 3457 3201'], [20, 158, 'Geldausgang'],
        [20, 145, 'Buchungsdatum'], [110, 145, 'Buchungstext'], [300, 145, 'Valutadatum'], [420, 145, 'Betrag'], [20, 130, '12.10.2026'], [110, 130, 'Trade Republic Trade Republic aaaaaaaa-'], [300, 130, '12.10.2026'], [420, 130, '-500,00 EUR'],
        [110, 118, 'bbbb-4ccc-8ddd-eeeeeeeeeeee'], [110, 106, 'DE89 3704 0044 0532 0130 00'], [110, 94, 'TESTREF12345XY'], [20, 40, '17.11.2026,'], [110, 40, 'angemeldet als: Max Muster']];
      const txt = t.map(([x, y, s]) => 'BT /F1 9 Tf ' + x + ' ' + y + ' Td (' + s + ') Tj ET').join('\n');
      const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 520 220] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', '<< /Length ' + txt.length + ' >>\nstream\n' + txt + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
      let out = '%PDF-1.4\n', offs = []; objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
      const x = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
      return Buffer.from(out, 'latin1'); })();
    await page.setInputFiles('#bankInput', {name:'2026-10-12_Buchung_987.pdf', mimeType:'application/pdf', buffer:pdf});
    for (let i = 0; i < 30 && !(await page.$('#bk-go')); i++) await page.waitForTimeout(400);   // warten, bis die Vorschau steht (CI ist langsamer)
    const t = (await page.innerText('#sheetBody')).replace(/\s+/g, ' ');
    ok(/Umbuchung/.test(t) && /Trade Republic/.test(t), 'Vorschau: ' + t.slice(0, 240));
    ok((await page.inputValue('#bk-cp-0')) === 'trk', 'Gegenkonto nicht vorgeschlagen');
    await page.click('#bk-go'); await page.waitForTimeout(500);
    const d = await page.evaluate(DUMP), e = d.entries[0];
    ok(e && e.type === 'transfer' && e.amount === 50000 && e.cardId === 'rbk' && e.toCardId === 'trk' && e.date === '2026-10-12', JSON.stringify(e));
    ok(d.profile.ibanMap['3000'] === 'trk', 'Gegenkonto nicht gemerkt');
  });
  await test('Geldfluss: Einnahmen links, Gruppen/Kategorien und Überschuss rechts, Erstattung abgezogen, Umbuchung ignoriert', async () => {
    await fresh();
    await seed(`(p, es) => { p.cards.push({id:'k1', name:'Giro'}, {id:'k2', name:'Spar'}); const d = '${today()}'; p.categories = p.categories.filter(c => !['ruecklage', 'investment'].includes(c.id)).concat([{id:'ruecklage', name:'Rücklage', kind:'expense', saving:true, group:'Sparen & Investieren', color:17}, {id:'investment', name:'Investment', kind:'expense', saving:true, group:'Sparen & Investieren', color:16}]);
      es.put({id:'a', type:'income', amount:300000, catId:'gehalt', date:d, merchant:'Arbeit'});
      es.put({id:'b', type:'expense', amount:50000, catId:'lebensmittel', date:d, merchant:'Markt', splits:[{catId:'lebensmittel', amount:40000}, {catId:'kinder', amount:10000}]});
      es.put({id:'c', type:'expense', amount:20000, catId:'shopping', date:d, merchant:'Shop'}); es.put({id:'r', type:'income', amount:5000, catId:'shopping', date:d, merchant:'Shop'});
      es.put({id:'t', type:'transfer', amount:99900, cardId:'k1', toCardId:'k2', date:d});
      es.put({id:'s1', type:'expense', amount:60000, catId:'ruecklage', date:d, merchant:'Sparen'}); es.put({id:'s2', type:'income', amount:10000, catId:'ruecklage', date:d, merchant:'Entnahme'});
      es.put({id:'s3', type:'income', amount:7000, catId:'investment', date:d, merchant:'Verkauf'}); }`);
    const r = await page.evaluate(() => { const f = flowData(entriesIn(S.month)); return {left:f.left.map(n => n.name + ':' + n.v), cats:f.cats.map(x => x.id + ':' + x.v).sort()}; });
    ok(r.left.join() === 'Gehalt:300000,Aus Erspartem:7000', 'links: ' + r.left);
    ok(r.cats.join() === 'kinder:10000,lebensmittel:40000,ruecklage:50000,shopping:15000', 'rechts (Sparen netto): ' + r.cats);
    const s = await page.evaluate(() => sums(entriesIn(S.month))); ok(s.sav === 43000, 'Übersicht gespart: ' + s.sav);
    await go('statistik'); const t = (await page.innerText('#view')).replace(/\s+/g, ' ');
    ok(/Geldfluss/.test(t) && /Überschuss € ?1\.920/.test(t), 'Abschnitt: ' + (t.match(/Geldfluss.{0,200}/) || [''])[0]);
    await page.click('[data-act="flow-mode"][data-mode="cat"]'); await page.waitForTimeout(200);
    ok(/Kinder € ?100/.test((await page.innerText('#view')).replace(/\s+/g, ' ')), 'Kategorien-Ansicht fehlt');
  });
  await test('KI-Assistent: fragt Daten über Werkzeuge ab, schickt keine Notizen/Personen/Karten, zeigt was abgerufen wurde', async () => {
    await fresh();
    ok(await page.isVisible('#aiBtn'), 'Knopf ohne API-Key nicht sichtbar');
    await page.click('#aiBtn'); await page.waitForTimeout(300);
    ok(/API-Key/.test(await page.innerText('#sheetBody')) && !(await page.$('#chatIn')), 'ohne Key kein Hinweis');
    await page.click('#sheetBody [data-act="settings"]'); await page.waitForTimeout(400);
    ok(await page.isVisible('#s-key-in'), 'Einstellungen nicht geöffnet');
    await page.fill('#s-key-in', 'sk-ant-api03-' + 'T'.repeat(40)); await page.click('#s-key button[type=submit]'); await page.waitForTimeout(300);
    await seed(`(p, es) => { p.cards.push({id:'kk', name:'Testkarte', last4:'4321'}); p.persons = [{id:'px', name:'Testperson'}];
      es.put({id:'q1', type:'expense', amount:5000, catId:'lebensmittel', date:'${today()}', merchant:'Markt', note:'GEHEIM-NOTIZ', cardId:'kk', persons:['px']});
      es.put({id:'q2', type:'expense', amount:1200, catId:'freizeit', date:'${today()}', merchant:'Kino', note:'GEHEIM-NOTIZ'}); }`);
    const m = today().slice(0, 7); askLog = [];
    chatReplies = [{stop_reason:'tool_use', content:[{type:'text', text:'Ich schaue nach.'}, {type:'tool_use', id:'t1', name:'bookings', input:{from:m, to:m, merchant:'markt'}}]},
      {stop_reason:'end_turn', content:[{type:'text', text:'Bei Markt waren es **50,00 €**.\n- eine Buchung\n<img src=x onerror=alert(1)>'}]}];
    await page.click('#aiBtn'); await page.waitForTimeout(300);
    await page.fill('#chatIn', 'Was habe ich bei Markt ausgegeben?'); await page.click('#chatGo');
    for (let i = 0; i < 20 && !(await page.$('.msg-src')); i++) await page.waitForTimeout(200);
    const ans = await page.innerHTML('.msg.ai:last-child');
    ok(/<b>50,00 €<\/b>/.test(ans) && /<li>eine Buchung<\/li>/.test(ans) && !/<img/.test(ans), 'Antwort-Darstellung: ' + ans.slice(0, 200));
    ok(/Abgerufen: Buchungen/.test(await page.innerText('.msg-src')), 'Herkunft fehlt');
    ok(askLog.length === 2, 'Anfragen: ' + askLog.length);
    const tools = askLog[0].tools.map(t => t.name).join();
    ok(tools === 'summary,bookings,items,recurring,marked', 'Werkzeuge: ' + tools);
    const res = JSON.parse(askLog[1].messages[2].content[0].content);
    ok(res.count === 1 && res.rows[0].merchant === 'Markt' && res.rows[0].amount === 50 && res.rows[0].category === 'Lebensmittel' && Object.keys(res.rows[0]).join() === 'date,amount,type,merchant,category', 'Werkzeug-Ergebnis: ' + JSON.stringify(res));
    const all = JSON.stringify(askLog);
    ok(!/GEHEIM|Testperson|4321|Testkarte/.test(all), 'private Daten wurden mitgeschickt');
    /* zweite Frage im selben Gespräch: Verlauf geht mit, ohne Anzeige-Felder */
    chatReplies = [{stop_reason:'end_turn', content:[{type:'text', text:'Passt.'}]}]; askLog = [];
    await page.fill('#chatIn', 'Danke'); await page.click('#chatGo'); await page.waitForTimeout(600);
    ok(askLog.length === 1 && askLog[0].messages.length === 5 && askLog[0].messages.every(x => Object.keys(x).join() === 'role,content'), 'Verlauf: ' + JSON.stringify(askLog[0] && askLog[0].messages.map(x => Object.keys(x))));
  });
  await test('Bank-Texte: Dauerauftrag ohne Auftraggeber-Name und BIC, alte Einträge einmalig bereinigt', async () => {
    await fresh();
    const r = await page.evaluate(async () => { const m = await import('./bank.js');
      return {a:m.tidyBankName('Max Muster Dauerauftrag vom Hausrate Musterort , RZOOAT2L4'), b:m.tidyBankName('Musterfirma GmbH , BKAUATWW'), c:m.tidyBankName('Trade Republic'), d:m.tidyBankName('Max Muster Dauerauftrag vom'),
        p:m.parseBank(['Buchung', 'Bank | Raiffeisenbank Musterregion eGen', 'IBAN | AT61 1904 3002 3457 3201', 'Geldausgang', 'Buchungsdatum | Buchungstext | Valutadatum | Betrag', '01.11.2026 | Max Muster | 01.11.2026 | -800,00 EUR', 'Dauerauftrag vom 01.11.2026 Hausrate Musterort', 'AT48 3400 0000 0123 4567', 'RZOOAT2L455'], '2026-11-01_Buchung_55.pdf')}; });
    ok(r.a === 'Dauerauftrag Hausrate Musterort' && r.b === 'Musterfirma GmbH' && r.c === 'Trade Republic' && r.d === 'Dauerauftrag Max Muster', JSON.stringify(r).slice(0, 300));
    ok(r.p.ok && r.p.merchant === 'Dauerauftrag Hausrate Musterort' && !/Max Muster/.test(r.p.reference), 'Import: ' + r.p.merchant + ' / ' + r.p.reference);
    await seed(`(p, es) => { kv.delete('mig-bankname1'); es.put({id:'o1', type:'expense', amount:80000, catId:'wohnen', date:'${today()}', merchant:'Max Muster Dauerauftrag vom Hausrate Musterort , RZOOAT2L4'}); es.put({id:'o2', type:'expense', amount:500, catId:'lebensmittel', date:'${today()}', merchant:'Hofer'}); }`);
    await page.waitForTimeout(500);
    const d = Object.fromEntries((await page.evaluate(DUMP)).entries.map(e => [e.id, e.merchant]));
    ok(d.o1 === 'Dauerauftrag Hausrate Musterort' && d.o2 === 'Hofer', JSON.stringify(d));
  });
  await test('Speicher: Fotos kleiner, Backup ohne Fotos, Belegarchiv je Quartal sichern und zurückholen, Verkleinern', async () => {
    await fresh();
    const z = await page.evaluate(async () => {
      const cv = document.createElement('canvas'); cv.width = 2400; cv.height = 1800; const cx = cv.getContext('2d'), id = cx.createImageData(2400, 1800);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 256 | 0; id.data[i] = v; id.data[i + 1] = 255 - v; id.data[i + 2] = Math.random() * 256 | 0; id.data[i + 3] = 255; }
      cx.putImageData(id, 0, 0); const png = await new Promise(r => cv.toBlob(r, 'image/png'));
      const j = await toJpeg(png), bm = await createImageBitmap(j);
      await tx('blobs', 'readwrite', st => { st.put(png, 'bx-big'); st.put(new Blob([new Uint8Array(500)], {type:'image/jpeg'}), 'bx-small'); });
      await saveEntry({id:'z1', type:'expense', amount:1000, catId:'lebensmittel', date:today(), merchant:'Markt', receipts:[{blobId:'bx-big', pdf:false}, {blobId:'bx-small', pdf:false}]});
      return {w:bm.width, h:bm.height, type:j.type, png:png.size, jpg:j.size};
    });
    ok(z.w === 1600 && z.h === 1200 && z.jpg < z.png, 'Foto: ' + JSON.stringify(z));   // Typ nicht prüfen: WebKit unter Linux schreibt kein JPEG
    await page.click('[data-act="settings"]'); await page.waitForTimeout(400); await page.uncheck('#s-enc');
    ok(!(await page.isChecked('#s-photos')), 'Fotos sind im Backup noch voreingestellt');
    const [b1] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup"]')]);
    const fb = path.join(require('os').tmpdir(), 'kb-nophotos.json'); await b1.saveAs(fb);
    ok(!JSON.parse(fs.readFileSync(fb, 'utf8')).blobs, 'Backup enthält Fotos');
    await page.click('[data-act="archive"]'); for (let i = 0; i < 20 && !(await page.$('[data-arch]')); i++) await page.waitForTimeout(150);
    const q = await page.getAttribute('[data-arch]', 'data-arch'), t0 = (await page.innerText('#sheetBody')).replace(/\s+/g, ' ');
    ok(/^\d{4}-Q[1-4]$/.test(q) && /2 Fotos/.test(t0) && /noch nicht gesichert/.test(t0), 'Archiv-Liste: ' + t0.slice(0, 200));
    const [a1] = await Promise.all([page.waitForEvent('download'), page.click('[data-arch]')]);
    const fa = path.join(require('os').tmpdir(), 'kb-archive.json'); await a1.saveAs(fa);
    const aj = JSON.parse(fs.readFileSync(fa, 'utf8'));
    ok(aj.kind === 'archive' && aj.period === q && Object.keys(aj.blobs).sort().join() === 'bx-big,bx-small', 'Archiv-Datei: ' + Object.keys(aj.blobs || {}));
    for (let i = 0; i < 20 && !/vollständig/.test(await page.innerText('#sheetBody')); i++) await page.waitForTimeout(150);
    ok(/vollständig/.test(await page.innerText('#sheetBody')), 'Archiv nicht als gesichert vermerkt');
    /* Verkleinern: nur das große Foto wird ersetzt, der Eintrag bleibt gleich */
    await page.click('#ar-shrink'); await page.click('#ar-shrink');
    for (let i = 0; i < 40 && !/gespart|Nichts/.test(await page.innerText('#ar-st')); i++) await page.waitForTimeout(200);
    ok(/1 Beleg verkleinert/.test(await page.innerText('#ar-st')), 'Verkleinern: ' + await page.innerText('#ar-st'));
    const s = await page.evaluate(async () => { const b = await tx('blobs', 'readonly', st => st.get('bx-big')); return {type:b.type, size:b.size, rec:S.entries.get('z1').receipts.map(r => r.blobId).join()}; });
    ok(s.size < z.png && s.rec === 'bx-big,bx-small', 'nach Verkleinern: ' + JSON.stringify(s));
    /* leeres Gerät: erst Backup (ohne Fotos), dann Archiv – Fotos sind wieder da */
    await fresh(); await page.setInputFiles('#jsonInput', fb); await page.waitForTimeout(300); await page.click('#r-go'); await page.waitForTimeout(500);
    let d = await page.evaluate(DUMP); ok(d.entries.length === 1 && d.blobs === 0, 'nach Backup: ' + d.blobs);
    await page.evaluate(() => { document.querySelector('#jsonInput').value = ''; });
    await page.setInputFiles('#jsonInput', fa); await page.waitForTimeout(300);
    const t1 = await page.innerText('#sheetBody'); ok(/2 Belegfotos/.test(t1) && /davon 2 zu Einträgen/.test(t1), 'Archiv-Dialog: ' + t1);
    await page.click('#al-go'); await page.waitForTimeout(500);
    d = await page.evaluate(DUMP); ok(d.blobs === 2, 'nach Archiv: ' + d.blobs);
  });
  await test('Übersicht: Budget-Zeile erklärt, was gegen das Monatsbudget zählt und was nicht', async () => {
    await fresh();
    await seed(`(p, es) => { p.budgets = {lebensmittel:20000}; p.yearBudgets = {freizeit:100000}; p.totalBudget = null; const d = '${today()}';
      es.put({id:'h1', type:'expense', amount:25000, catId:'lebensmittel', date:d, merchant:'Markt'}); es.put({id:'h2', type:'expense', amount:4000, catId:'freizeit', date:d, merchant:'Kino'});
      es.put({id:'h3', type:'expense', amount:1500, catId:'sonstiges', date:d, merchant:'Allerlei'}); }`);
    await go('uebersicht'); const t = (await page.innerText('.hero-foot')).replace(/\s+/g, ' ');
    ok(/^€ ?250 von € ?200 Budget \(ohne Freizeit, Sonstiges\) · € ?50 drüber/.test(t), t);
  });
  await test('Kategorien alphabetisch: Auswahl, Filter und Einstellungen; Gruppen-Reihenfolge bleibt', async () => {
    await fresh();
    await seed(`(p, es) => { p.categories = p.categories.filter(c => c.kind !== 'expense').concat([{id:'z1', name:'Zahnarzt', kind:'expense', group:'B-Gruppe', color:1}, {id:'a1', name:'Äpfel', kind:'expense', group:'B-Gruppe', color:2}, {id:'m1', name:'mode', kind:'expense', group:'A-Gruppe', color:3}, {id:'b1', name:'Bücher', kind:'expense', group:'A-Gruppe', color:4}]); p.groups = ['B-Gruppe', 'A-Gruppe']; p.budgets = {z1:1000, a1:1000, m1:1000, b1:1000}; }`);
    const r = await page.evaluate(() => ({cats:cats().filter(c => c.kind === 'expense').map(c => c.name).join(), opt:[...new DOMParser().parseFromString('<select>' + catOptions('expense', 'z1') + '</select>', 'text/html').querySelectorAll('option')].map(o => o.textContent).filter(Boolean).join()}));
    ok(r.cats === 'Äpfel,Bücher,mode,Zahnarzt', 'cats(): ' + r.cats);
    ok(/Äpfel.*Bücher.*mode.*Zahnarzt/.test(r.opt), 'Auswahl: ' + r.opt);
    await go('budgets'); const t = (await page.innerText('#view')).replace(/\s+/g, ' ');
    ok(t.indexOf('B-Gruppe') < t.indexOf('A-Gruppe') && t.indexOf('Äpfel') < t.indexOf('Zahnarzt') && t.indexOf('Bücher') < t.indexOf('mode'), 'Budgets: ' + t.slice(0, 300));
  });
  await test('Netzwerk: nur eigene Dateien und api.anthropic.com', async () => {
    await fresh(); const hosts = new Set(); page.on('request', q => hosts.add(new URL(q.url()).host));
    await page.click('[data-act="examples-load"]'); for (const r of ['uebersicht', 'statistik', 'karten']) await go(r);
    const other = [...hosts].filter(h => !h.startsWith('localhost')); ok(!other.length, 'fremde Hosts: ' + other.join(', '));
  });
  await test('Keine JavaScript-Fehler während aller Tests', async () => { ok(!pageErrors.length, pageErrors.slice(0, 3).join(' / ')); });

  if (ctx) await ctx.close().catch(() => {});
  await browser.close(); server.close();
  const failed = results.filter(r => !r[0]).length;
  console.log('\n' + (results.length - failed) + ' von ' + results.length + ' Tests bestanden.');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
