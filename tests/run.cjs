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

const results = []; let page, ctx, browser, base, pageErrors = [];
const ok = (c, m) => { if (!c) throw new Error(m); };
async function test(name, fn){ const t0 = Date.now(); try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung nach 90 s')), 90000))]); results.push([true, name, Date.now() - t0]); console.log('  ✓ ' + name); } catch (e) { results.push([false, name, e.message]); console.log('  ✗ ' + name + '\n      ' + e.message.split('\n')[0]); } }
async function fresh(opts = {}){
  const copt = {viewport:{width:390, height:844}, isMobile:true, hasTouch:true, acceptDownloads:true, colorScheme:opts.dark ? 'dark' : 'light'};
  const wk = ENGINE === 'webkit';
  /* WebKit speichert Fotos (Blobs) nur in einem dauerhaften Profil: dort ein Profil für alle Tests, vor jedem Test geleert */
  if (wk && ctx) { await page.close().catch(() => {}); }
  else {
    if (ctx) await ctx.close();
    ctx = wk ? await engine.launchPersistentContext(fs.mkdtempSync(path.join(require('os').tmpdir(), 'kb-wk-')), copt) : await browser.newContext(copt);
    await ctx.route('https://api.anthropic.com/**', r => r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify({id:'x', type:'message', role:'assistant', model:'test', stop_reason:'end_turn', usage:{input_tokens:1, output_tokens:1}, content:[{type:'text', text:JSON.stringify(FAKE_SCAN)}]})}));
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
    await loadPlan(); await page.click('[data-act="settings"]'); await page.waitForTimeout(400); await page.uncheck('#s-enc');
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
    await seed(`(p, es) => { p.persons = [{id:'pa', name:'Person A', color:1}]; p.personAlias = {markt:['pa']}; p.goals = [{id:'g1', name:'Rücklage', target:100000, due:'2027-06', catId:'', cardId:'', start:0, startDate:'${today()}'}]; es.put({id:'k1', type:'expense', amount:1299, catId:'lebensmittel', date:'${today()}', merchant:'Markt', note:'', persons:['pa'], tax:'wk', warrantyUntil:'2027-01-01', bankKeys:['x'], receipts:[{blobId:'b1'}], items:[{n:'Brot', raw:'BROT', g:'Brot & Gebäck', q:1, t:299, k:'item'}, {n:'Alt', t:-50}], ai:{status:'warn', findings:['Datum fehlt']}}); }`);
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
