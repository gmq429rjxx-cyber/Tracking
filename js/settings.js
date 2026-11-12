// Kassabuch – Einstellungen, Backup, CSV, Aufräumen
'use strict';
/* ---------- settings, import, export ---------- */
const ACCENTS = [['graphit','Graphit','#1A1A1E'],['blau','Blau','#2F5FD0'],['petrol','Petrol','#0D6B5B'],['pflaume','Pflaume','#7A3E78']];
function getLook(){ try { return JSON.parse(localStorage.getItem('kb-look') || '{}'); } catch (_) { return {}; } }
function applyLook(l){
  const r = document.documentElement;
  if (l.accent && l.accent !== 'graphit') r.setAttribute('data-accent', l.accent); else r.removeAttribute('data-accent');
  if (l.theme === 'light' || l.theme === 'dark') r.setAttribute('data-theme', l.theme); else r.removeAttribute('data-theme');
  try { localStorage.setItem('kb-look', JSON.stringify(l)); } catch (_) {}
}
function lookPanel(){
  const l = getLook(), acc = l.accent || 'graphit', th = l.theme || 'system';
  return '<section class="panel"><h3>Erscheinungsbild</h3>' +
    '<div class="field"><span>Akzentfarbe</span><div class="seg" role="group" aria-label="Akzentfarbe" style="display:grid;grid-template-columns:repeat(4,1fr)">' + ACCENTS.map(([k, n, c]) => '<button type="button" data-look-accent="' + k + '" aria-pressed="' + (acc === k) + '"><span class="lookopt"><i class="looksw" style="--sw:' + c + '"></i>' + n + '</span></button>').join('') + '</div></div>' +
    '<div class="field"><span>Modus</span><div class="seg" role="group" aria-label="Modus" style="display:grid;grid-template-columns:repeat(3,1fr)">' + [['system','Automatisch'],['light','Hell'],['dark','Dunkel']].map(([k, n]) => '<button type="button" data-look-theme="' + k + '" aria-pressed="' + (th === k) + '">' + n + '</button>').join('') + '</div></div></section>';
}
document.addEventListener('click', ev => {
  const a = ev.target.closest('[data-look-accent]'), t = ev.target.closest('[data-look-theme]');
  if (!a && !t) return;
  const l = getLook();
  if (a) l.accent = a.dataset.lookAccent;
  if (t) l.theme = t.dataset.lookTheme;
  applyLook(l);
  const sec = (a || t).closest('.panel'); if (sec) sec.outerHTML = lookPanel();
});
function openSettings(){
  const used = {}; for (const e of allEntries()) used[e.catId] = (used[e.catId] || 0) + 1;
  const hasEx = allEntries().some(e => e.example) || S.profile.cards.some(c => c.example) || S.profile.exampleBudgetKeys.length;
  const catRows = type => cats().filter(c => c.kind === type).map(c => '<div class="catedit"><span class="dot" style="--c:var(--c' + (c.color % 20) + ')"></span><label class="visually-hidden" for="cn-' + esc(c.id) + '">Name</label><input class="input" id="cn-' + esc(c.id) + '" data-cat="' + esc(c.id) + '" value="' + esc(c.name) + '"><button class="iconbtn" type="button" data-catdel="' + esc(c.id) + '" aria-label="' + esc(c.name) + ' löschen"' + (used[c.id] ? ' disabled title="Wird in ' + used[c.id] + ' Einträgen verwendet"' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div>').join('');
  const keyMasked = SET.apiKey ? SET.apiKey.slice(0, 10) + '…' + SET.apiKey.slice(-4) : '';
  openSheet('Einstellungen',
    '<section class="panel"><h3>KI-Belegscan</h3>' +
    (SET.apiKey ? '<p class="note" style="margin:0">Aktiv mit Key <span class="num">' + esc(keyMasked) + '</span>. Der Key liegt nur auf diesem iPhone. Beim Scan geht nur das Belegfoto an Anthropic.</p>' : '<p class="note" style="margin:0">Optional. Lege in der Claude Console (platform.claude.com) einen API-Key an, setze dort ein monatliches Ausgabenlimit und füge den Key hier ein. Er wird nur auf diesem iPhone gespeichert.</p>') +
    '<form id="s-key" style="display:flex;flex-direction:column;gap:10px" novalidate autocomplete="off"><label class="field"><span>' + (SET.apiKey ? 'Neuen Key einfügen' : 'API-Key') + '</span><input class="input" id="s-key-in" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-ant-…"></label>' +
    '<label class="field"><span>Modell</span><select class="input" id="s-model">' + Object.entries(MODELS).map(([k, v]) => '<option value="' + k + '"' + (SET.model === k ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select></label>' +
    '<p class="note" id="s-key-err" role="alert" hidden></p><div class="btnrow"><button class="btn small primary" type="submit">Speichern</button>' + (SET.apiKey ? '<button class="btn small danger" type="button" id="s-key-del">Key entfernen</button>' : '') + '</div></form></section>' +
    lookPanel() +
    '<section class="panel"><h3>Apple Pay</h3><p class="note" style="margin:0">Zahlungen mit Apple Pay landen per Kurzbefehl in einer Datei in iCloud Drive. Hier importierst du sie gesammelt.</p><div class="btnrow"><button class="btn small primary" data-act="inbox-pick">Inbox importieren</button><button class="btn small" data-act="inbox-guide">Einrichtung</button></div></section>' +
    '<section class="panel"><h3>Personen</h3><p class="note" style="margin:0">Für wen eine Buchung ist – mehrere möglich, der Betrag wird aufgeteilt. Die erste Person ist vorausgewählt. Namen bleiben nur auf diesem Gerät.</p><div class="list" id="s-pers">' + persons().map((p, i) => '<div class="irow two"><div class="row-main"><span class="row-title"><i class="dot" style="--c:var(--c' + (p.color % 20) + ');display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--c);margin-right:8px"></i>' + esc(p.name) + (i === 0 ? ' <span class="muted">· Standard</span>' : '') + '</span></div><span style="display:flex;gap:10px">' + (i ? '<button class="linkbtn" data-pup="' + esc(p.id) + '" aria-label="Nach oben">↑</button>' : '') + '<button class="linkbtn" style="color:var(--bad)" data-pdel="' + esc(p.id) + '">Entfernen</button></span></div>').join('') + '</div><form id="s-pers-add" class="btnrow" novalidate><input class="input" id="s-pers-name" placeholder="Name, z. B. Familie" maxlength="24" autocomplete="off" style="flex:1"><button class="btn small" type="submit">Hinzufügen</button></form></section>' +
    '<section class="panel"><h3>Daten</h3><p class="note" style="margin:0">Alles liegt nur auf diesem iPhone, ohne Konto und ohne Server. ' + (SET.lastBackup ? 'Letztes Backup: ' + esc(DAYL.format(parseISO(SET.lastBackup.slice(0, 10)))) + '.' : 'Noch kein Backup.') + '</p>' +
    '<label class="note" style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" switch id="s-photos"' + (SET.backupPhotos === false ? '' : ' checked') + '> Belegfotos mitsichern <span id="s-photos-size"></span></label>' +
    '<label class="note" style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" switch id="s-enc"' + (SET.backupEncrypt === false ? '' : ' checked') + '> Backup mit Passwort verschlüsseln</label>' +
    '<div class="btnrow"><button class="btn small primary" data-act="backup">Backup sichern</button><button class="btn small" id="s-restore">Backup oder Plan laden</button></div>' +
    '<div class="btnrow"><button class="btn small" id="s-import">CSV importieren</button><button class="btn small" id="s-csv">Export CSV</button><button class="btn small" data-act="report">Bericht PDF</button><button class="btn small" id="s-clean">Aufräumen</button></div><div id="s-snap"></div></section>' +
    '<section class="panel"><h3>Ausgaben-Kategorien</h3>' + catRows('expense') + '<h3 style="margin-top:6px">Einnahmen-Kategorien</h3>' + catRows('income') +
    '<form id="s-newcat" class="catedit" novalidate><label class="visually-hidden" for="s-newcat-name">Neue Kategorie</label><input class="input" id="s-newcat-name" placeholder="Neue Kategorie"><select class="input" id="s-newcat-kind" style="width:auto" aria-label="Art"><option value="expense">Ausgabe</option><option value="income">Einnahme</option></select><button class="btn small" type="submit">Hinzufügen</button></form>' +
    '<p class="note" style="margin:0">Kategorien mit Einträgen lassen sich umbenennen, aber nicht löschen.</p></section>' +
    '<section class="panel"><h3>Beispieldaten</h3><p class="note" style="margin:0">Drei Monate Beispiel-Buchungen, drei Karten und sechs Budgets. Alles ist als Beispiel markiert.</p><div class="btnrow">' + (hasEx ? '<button class="btn small danger" data-act="examples-remove">Beispieldaten entfernen</button>' : '<button class="btn small" data-act="examples-load">Beispieldaten laden</button>') + '</div></section>' +
    '<p class="note" style="text-align:center;margin:0">Kassabuch Version ' + APP_VERSION + '</p><div class="btnrow" style="justify-content:center"><button class="btn small" id="s-upd">Nach Update suchen</button></div>' +
    '<section class="panel"><h3>Alles löschen</h3><p class="note" style="margin:0">Entfernt alle Einträge, Karten, Budgets, Belegfotos und den API-Key von diesem iPhone.</p><div class="btnrow"><button class="btn small danger" id="s-wipe">Alle Daten löschen</button></div><div id="s-wipe-c"></div></section>',
    root => {
      root.querySelectorAll('input[data-cat]').forEach(inp => inp.addEventListener('change', () => {
        const v = inp.value.trim(); if (!v) { inp.value = catById(inp.dataset.cat).name; return; }
        const p = clean(S.profile); const c = p.categories.find(x => x.id === inp.dataset.cat); if (c) { c.name = v; saveProfile(p); toast('Kategorie umbenannt'); }
      }));
      root.querySelectorAll('[data-catdel]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.catdel; if (used[id]) return;
        const p = clean(S.profile); p.categories = p.categories.filter(c => c.id !== id); delete p.budgets[id]; saveProfile(p); openSettings(); toast('Kategorie gelöscht');
      }));
      $('#s-newcat', root).addEventListener('submit', ev => {
        ev.preventDefault(); const name = $('#s-newcat-name', root).value.trim(); if (!name) return;
        const p = clean(S.profile); p.categories.push({id:'k-' + newId(), name, color:p.categories.length % 20, kind:$('#s-newcat-kind', root).value}); saveProfile(p); openSettings(); toast('Kategorie angelegt');
      });
      $('#s-key', root).addEventListener('submit', async ev => {
        ev.preventDefault();
        const k = $('#s-key-in', root).value.trim(), err = $('#s-key-err', root);
        if (k && !/^sk-ant-[\w-]{20,}$/.test(k)) { err.hidden = false; err.textContent = 'Das sieht nicht wie ein Claude-API-Key aus (beginnt mit sk-ant-).'; return; }
        if (k) SET.apiKey = k;
        SET.model = $('#s-model', root).value;
        await saveSettings(); render(); openSettings(); toast(k ? 'Key gespeichert' : 'Modell gespeichert');
      });
      const kd = $('#s-key-del', root);
      if (kd) kd.onclick = async () => { SET.apiKey = ''; await saveSettings(); render(); openSettings(); toast('Key entfernt'); };
      $('#s-import', root).onclick = () => { const i = $('#csvInput'); i.value = ''; i.click(); };
      $('#s-restore', root).onclick = () => { const i = $('#jsonInput'); i.value = ''; i.click(); };
      $('#s-csv', root).onclick = () => exportData('csv');
      $('#s-clean', root).onclick = () => openCleanup();
      $('#s-pers-add', root).onsubmit = async ev => { ev.preventDefault(); const n = $('#s-pers-name', root).value.trim(); if (!n) return; const p = clean(S.profile); p.persons = p.persons || []; if (p.persons.some(x => x.name.toLowerCase() === n.toLowerCase())) return toast('Gibt es schon'); const used = new Set(p.persons.map(x => x.color)); const col = [2, 1, 6, 0, 4, 3, 8, 9, 13, 17].find(c => !used.has(c)) ?? p.persons.length; p.persons.push({id:'p-' + newId(), name:n, color:col}); await saveProfile(p); openSettings(); };
      root.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => { const id = b.dataset.pdel, n = allEntries().filter(e => (e.persons || []).includes(id)).length; if (n && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = n + ' Buchungen – trotzdem?'; return; } const p = clean(S.profile); p.persons = p.persons.filter(x => x.id !== id); await saveProfile(p); openSettings(); });
      root.querySelectorAll('[data-pup]').forEach(b => b.onclick = async () => { const p = clean(S.profile), i = p.persons.findIndex(x => x.id === b.dataset.pup); if (i > 0) { [p.persons[i - 1], p.persons[i]] = [p.persons[i], p.persons[i - 1]]; await saveProfile(p); openSettings(); } });
      const en = $('#s-enc', root); if (en) en.onchange = () => { SET.backupEncrypt = en.checked; saveSettings(); };
      kvGet('snapshots').then(sn => { const box = $('#s-snap', root), s0 = (sn || [])[0]; if (!box || !s0) return;
        box.innerHTML = '<p class="note" style="margin:6px 0 0">Automatische Sicherung vor dem letzten Update: ' + esc(DAYL.format(new Date(s0.at))) + ', ' + s0.entries.length + ' Einträge. <button class="linkbtn" id="s-snap-go">Diesen Stand zurückholen</button></p>';
        $('#s-snap-go', root).onclick = () => openSnapshotRestore(s0); }).catch(() => {});
      const ph = $('#s-photos', root); if (ph) { ph.onchange = () => { SET.backupPhotos = ph.checked; saveSettings(); }; blobStats().then(b => { const z = $('#s-photos-size', root); if (z && b.n) { const mb = b.bytes / 1048576 * 1.37; z.textContent = '(' + b.n + (b.n === 1 ? ' Foto' : ' Fotos') + ', ca. ' + (mb < 0.1 ? '< 0,1' : mb.toFixed(1).replace('.', ',')) + ' MB)'; } }); }
      $('#s-upd', root).onclick = async () => { lastCheck = 0; await checkUpdate(); if (S.updateReady) { closeSheet(); toast('Update ' + S.updateReady + ' bereit'); } else toast('Du hast die neueste Version.'); };
      $('#s-wipe', root).onclick = () => {
        $('#s-wipe-c', root).innerHTML = '<div class="confirm"><strong>Wirklich alles löschen?</strong><span class="note">Das lässt sich nicht rückgängig machen. Mach vorher ein Backup.</span><div class="btnrow"><button type="button" class="btn danger small" id="s-wipe-yes">Ja, alles löschen</button><button type="button" class="btn small" id="s-wipe-no">Abbrechen</button></div></div>';
        $('#s-wipe-no', root).onclick = () => { $('#s-wipe-c', root).innerHTML = ''; };
        $('#s-wipe-yes', root).onclick = async () => {
          await tx(['kv', 'entries', 'blobs'], 'readwrite', ([kv, es, bs]) => { kv.clear(); es.clear(); bs.clear(); });
          SET.apiKey = ''; SET.lastBackup = null; S.entries = new Map(); S.profile = defaultProfile(); S.canScan = false;
          await kvSet('profile', clean(S.profile)); closeSheet(); render(); toast('Alle Daten gelöscht');
        };
      };
    });
}
async function deliverFile(filename, data, mime){
  const file = new File([data], filename, {type:mime});
  if (navigator.canShare && navigator.canShare({files:[file]})) {
    try { await navigator.share({files:[file]}); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return true;
}
/* Belegfotos fürs Backup: Blob <-> data-URL (ohne fetch, wegen CSP) */
async function blobStats(){
  const ids = [...new Set(allEntries().flatMap(e => (e.receipts || []).map(r => r.blobId)).filter(Boolean))];
  let bytes = 0, n = 0;
  for (const id of ids) { const b = await tx('blobs', 'readonly', st => st.get(id)); if (b) { n++; bytes += b.size || 0; } }
  return {n, bytes, ids};
}
const blobToData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
/* CSV-Zelle: Trennzeichen und Anführungszeichen maskieren; Text, der mit = + - @ beginnt, bekommt ein Hochkomma,
   damit Excel ihn nicht als Formel ausführt (Zahlen wie -12,30 bleiben unverändert) */
function csvCell(v){
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(?:[.,]\d+)?$/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/* Belege aus einem Backup: nur Bilder und PDFs behalten ihren Typ, alles andere wird als reine Datei abgelegt (kann dann nicht als Seite geöffnet werden) */
const BLOB_OK = /^(?:image\/(?:jpeg|png|webp|gif|heic|heif)|application\/pdf)$/i;
function dataToBlob(u){ const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(u || ''); if (!m) return null; if (!BLOB_OK.test(m[1])) m[1] = 'application/octet-stream'; const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]); const a = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i); return new Blob([a], {type:m[1] || 'application/octet-stream'}); }
async function exportData(kind, opt){
  const list = allEntries().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const stamp = today();
  if (kind === 'json') {
    const out = {app:'Kassabuch', version:2, exportedAt:new Date().toISOString(), profile:S.profile, entries:list};
    if (opt && opt.photos) { const st = await blobStats(); out.blobs = {}; for (const id of st.ids) { const b = await tx('blobs', 'readonly', x => x.get(id)); if (b) out.blobs[id] = await blobToData(b); } }
    const json = JSON.stringify(out), done = async ok => { if (ok) { SET.lastBackup = new Date().toISOString(); await saveSettings(); render(); toast('Backup erstellt. In „Dateien“ oder iCloud Drive sichern.'); } };
    if (SET.backupEncrypt !== false) openBackupLock(json, 'kassabuch-backup-' + stamp + '-verschluesselt.json', done);
    else done(await deliverFile('kassabuch-backup-' + stamp + '.json', json, 'application/json'));
    return;
  }
  const q = csvCell;
  const rows = [['ID','Datum','Typ','Betrag','Kategorie','Karte','Händler','Notiz','Personen']].concat(list.map(e => [txId(e), e.date, isWithdrawal(e) ? 'Entnahme' : e.type === 'income' ? 'Einnahme' : e.type === 'transfer' ? 'Umbuchung' : 'Ausgabe', (e.amount / 100).toFixed(2).replace('.', ','), e.type === 'transfer' ? '' : catById(e.catId).name, ((cardById(e.cardId) || {}).name || '') + (e.type === 'transfer' ? ' → ' + ((cardById(e.toCardId) || {}).name || '') : ''), e.merchant || '', e.note || '', personNames(e).join(', ')]));
  await deliverFile('kassabuch-' + stamp + '.csv', '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv');
}
function openPlan(d, fname){
  const exp = d.categories.filter(c => c.kind === 'expense'), groups = d.groups || [...new Set(exp.map(c => c.group))];
  const remap = d.remap || {}, moved = allEntries().filter(e => remap[e.catId]).length;
  const rowsHTML = groups.map(g => { const cs = exp.filter(c => c.group === g); const sum = cs.reduce((a, c) => a + (c.budget || 0), 0); return '<tr><td><b>' + esc(g) + '</b></td><td class="r"><b>' + money0(Math.round(sum * 100)) + '</b></td></tr>' + cs.map(c => '<tr><td style="padding-left:18px">' + esc(c.name) + '</td><td class="r">' + (c.budget ? money0(Math.round(c.budget * 100)) : '–') + '</td></tr>').join(''); }).join('');
  openSheet('Budgetplan übernehmen',
    '<p class="note" style="margin:0">' + esc(d.title || fname) + '</p><div class="tablewrap"><table><tbody>' + rowsHTML + '</tbody></table></div>' +
    (d.plannedIncome ? '<p class="note" style="margin:0">Einnahmen geplant: ' + money0(Math.round(d.plannedIncome * 100)) + '. ' + esc(d.note || '') + '</p>' : '') +
    '<div class="panel"><h3>Was passiert</h3><ul class="checks"><li>Kategorien, Gruppen und Monatsbudgets werden wie oben gesetzt.</li><li>Investment und Rücklage zählen als gespart, nicht als Ausgabe.</li><li>' + (moved ? moved + ' bestehende Einträge werden in die neuen Kategorien verschoben.' : 'Bestehende Einträge bleiben unverändert.') + '</li><li>Benutzte eigene Kategorien bleiben erhalten.</li></ul></div>' +
    '<button class="btn primary" id="pl-go">Plan übernehmen</button>',
    root => { $('#pl-go', root).onclick = async () => {
      const p = clean(S.profile), used = new Set(allEntries().map(e => e.catId)), planIds = new Set(d.categories.map(c => c.id));
      const keep = p.categories.filter(c => !planIds.has(c.id) && !remap[c.id] && used.has(c.id)).map(c => Object.assign(c, {group:c.group || 'Sonstige'}));
      p.categories = d.categories.map(c => ({id:String(c.id), name:String(c.name), kind:c.kind === 'income' ? 'income' : 'expense', color:c.id in PLAN_COLORS ? PLAN_COLORS[c.id] : /^lohn-/.test(c.id) ? 14 : Number(c.color) % 20 || 0, group:c.group || '', saving:!!c.saving})).concat(keep);
      p.budgets = {}; p.yearBudgets = {}; for (const c of d.categories) { if (c.budget) p.budgets[c.id] = Math.round(c.budget * 100); else if (c.yearBudget) p.yearBudgets[c.id] = Math.round(c.yearBudget * 100); }
      p.totalBudget = null; p.exampleBudgetKeys = []; p.groups = groups;
      p.plannedIncome = d.plannedIncome ? Math.round(d.plannedIncome * 100) : null; p.planNote = d.note || '';
      for (const r of p.recurring) if (remap[r.catId]) r.catId = remap[r.catId];
      for (const k of Object.keys(p.merchantAlias)) if (remap[p.merchantAlias[k].catId]) p.merchantAlias[k].catId = remap[p.merchantAlias[k].catId];
      await saveProfile(p);
      const ch = allEntries().filter(e => remap[e.catId]).map(e => Object.assign(clean(e), {catId:remap[e.catId]}));
      if (ch.length) await putEntries(ch);
      closeSheet(); S.tab = 'budgets'; history.replaceState(null, '', '#budgets'); render(); toast('Budgetplan übernommen');
    }; });
}
/* ---------- Backup-Verschlüsselung: AES-256-GCM, Schlüssel per PBKDF2 aus dem Passwort. Das Passwort wird nie gespeichert. ---------- */
const B64 = {
  enc(u8){ let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  dec(str){ const r = atob(str), a = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
};
const KDF_ITER = 600000;
async function backupKey(pw, salt, iter){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations:iter}, base, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
}
async function encryptBackup(json, pw){
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, await backupKey(pw, salt, KDF_ITER), new TextEncoder().encode(json)));
  return JSON.stringify({app:'Kassabuch', kind:'encrypted', v:1, kdf:{name:'PBKDF2', hash:'SHA-256', iterations:KDF_ITER, salt:B64.enc(salt)}, cipher:'AES-256-GCM', iv:B64.enc(iv), data:B64.enc(ct)});
}
async function decryptBackup(d, pw){
  const it = Number(d.kdf && d.kdf.iterations); if (!(it >= 10000 && it <= 5000000)) throw new Error('kdf');
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:B64.dec(d.iv)}, await backupKey(pw, B64.dec(d.kdf.salt), it), B64.dec(d.data));
  return JSON.parse(new TextDecoder().decode(pt));
}
const pwField = (id, label, ac) => '<label class="field"><span>' + label + '</span><input class="input" type="password" id="' + id + '" autocomplete="' + ac + '" autocapitalize="off" autocorrect="off" spellcheck="false"></label>';
function openBackupLock(json, name, done){
  openSheet('Backup verschlüsseln',
    '<form id="bkForm" style="display:flex;flex-direction:column;gap:14px" novalidate>' + pwField('bk-pw', 'Passwort (mindestens 8 Zeichen)', 'new-password') + pwField('bk-pw2', 'Passwort wiederholen', 'new-password') +
    '<p class="note" style="margin:0">Ohne dieses Passwort lässt sich das Backup nicht mehr öffnen, auch nicht von mir. Die App speichert es nicht. Am besten im iPhone-Passwortspeicher ablegen.</p>' +
    '<p class="note" id="bk-err" role="alert" hidden></p><button class="btn primary" type="submit">Verschlüsseln</button></form>',
    root => {
      const f = $('#bkForm', root), err = $('#bk-err', root), say = t => { err.hidden = false; err.textContent = t; };
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const a = $('#bk-pw', root).value, b = $('#bk-pw2', root).value;
        if (a.length < 8) return say('Bitte mindestens 8 Zeichen.');
        if (a !== b) return say('Die beiden Passwörter sind nicht gleich.');
        say('Verschlüssele …'); f.querySelector('button[type=submit]').disabled = true;
        let enc; try { enc = await encryptBackup(json, a); } catch (_) { f.querySelector('button[type=submit]').disabled = false; return say('Verschlüsseln ist auf diesem Gerät nicht möglich.'); }
        /* eigener Tipp zum Sichern: das Teilen-Menü braucht eine frische Eingabe */
        f.innerHTML = '<p class="note" style="margin:0">Backup ist verschlüsselt (' + Math.max(1, Math.round(enc.length / 1024)) + ' KB).</p><button class="btn primary" type="button" id="bk-save">Verschlüsseltes Backup sichern</button>';
        $('#bk-save', root).onclick = async () => { const ok = await deliverFile(name, enc, 'application/json'); if (ok) closeSheet(); done(ok); };
      });
    });
}
function openBackupUnlock(d, name){
  openSheet('Backup entsperren',
    '<form id="buForm" style="display:flex;flex-direction:column;gap:14px" novalidate><p class="note" style="margin:0">' + esc(name) + ' ist verschlüsselt.</p>' + pwField('bu-pw', 'Passwort', 'current-password') +
    '<p class="note" id="bu-err" role="alert" hidden></p><button class="btn primary" type="submit">Entsperren</button></form>',
    root => {
      $('#buForm', root).addEventListener('submit', async ev => {
        ev.preventDefault(); const err = $('#bu-err', root); err.hidden = false; err.textContent = 'Entschlüssele …';
        let plain; try { plain = await decryptBackup(d, $('#bu-pw', root).value); } catch (_) { err.textContent = 'Passwort falsch oder Datei beschädigt.'; return; }
        loadJson(plain, name);
      });
    });
}
/* ---------- Backup prüfen: nur bekannte Formen übernehmen. Kaputtes wird repariert oder übersprungen, Unbekanntes bleibt unverändert. ---------- */
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isStr = v => typeof v === 'string';
const colorNo = v => { const n = Number(v); return Number.isFinite(n) ? Math.abs(Math.round(n)) % 20 : 0; };
const strList = v => Array.isArray(v) ? v.filter(isStr) : [];
function cleanBackupEntry(e){
  if (!e || typeof e !== 'object' || !isStr(e.id) || !e.id || e.id.length > 200 || !validISO(e.date) || typeof e.amount !== 'number' || !Number.isFinite(e.amount) || !['expense', 'income', 'transfer'].includes(e.type)) return null;
  const o = clean(e); o.amount = Math.round(o.amount);
  for (const k of ['merchant', 'merchantRaw', 'note', 'catId', 'cardId', 'toCardId', 'recurringId', 'receiptNo', 'receiptHash', 'importKey', 'source', 'currency']) if (o[k] != null && !isStr(o[k])) delete o[k];
  if (o.tax != null && !(isStr(o.tax) && hasOwn(TAX, o.tax))) delete o.tax;
  for (const k of ['warrantyUntil', 'dueDate']) if (o[k] != null && o[k] !== '' && !validISO(o[k])) delete o[k];
  for (const k of ['persons', 'bankKeys']) if (o[k] != null) o[k] = strList(o[k]);
  if (o.items != null) o.items = (Array.isArray(o.items) ? o.items : []).filter(i => i && typeof i === 'object' && isStr(i.n) && Number.isFinite(i.t)).map(i => { if (i.raw != null && !isStr(i.raw)) delete i.raw; if (i.g != null && !isStr(i.g)) delete i.g; if (i.q != null && !(Number.isFinite(i.q) && i.q > 0)) i.q = 1; if (i.k != null && !['item', 'discount', 'deposit'].includes(i.k)) delete i.k; return i; });
  if (o.receipts != null) o.receipts = (Array.isArray(o.receipts) ? o.receipts : []).filter(r => r && typeof r === 'object' && isStr(r.blobId) && r.blobId);
  if (o.ai != null) {
    if (typeof o.ai !== 'object' || Array.isArray(o.ai)) delete o.ai;
    else { if (!(isStr(o.ai.status) && hasOwn(VERDICT, o.ai.status))) delete o.ai.status; if (o.ai.findings != null) o.ai.findings = strList(o.ai.findings).slice(0, 30).map(f => f.slice(0, 400)); }
  }
  return o;
}
function cleanBackupProfile(raw){
  const p = normalizeProfile(raw);
  const named = l => (Array.isArray(l) ? l : []).filter(x => x && typeof x === 'object' && isStr(x.id) && x.id && isStr(x.name));
  const map = (m, ok) => Object.fromEntries(Object.entries(m && typeof m === 'object' && !Array.isArray(m) ? m : {}).filter(([k, v]) => k !== '__proto__' && ok(v)));
  p.categories = named(p.categories).map(c => Object.assign(c, {kind:c.kind === 'income' ? 'income' : 'expense', color:colorNo(c.color)}, c.group != null && !isStr(c.group) ? {group:''} : {}));
  if (!p.categories.length) p.categories = clean(DEFAULT_CATS);
  p.cards = named(p.cards).map(c => Object.assign(c, {kind:hasOwn(KIND, c.kind) ? c.kind : 'debit', color:colorNo(c.color)}, c.last4 == null ? {} : {last4:isStr(c.last4) || typeof c.last4 === 'number' ? String(c.last4).slice(0, 8) : ''}));
  if (p.persons != null) p.persons = named(p.persons).map(x => Object.assign(x, {color:colorNo(x.color)}));
  if (p.goals != null) p.goals = named(p.goals).filter(g => Number.isFinite(g.target));
  p.recurring = p.recurring.filter(r => r && typeof r === 'object' && isStr(r.id) && r.id && Number.isFinite(r.amount) && validISO(r.startDate) && (r.type == null || ['expense', 'income', 'transfer'].includes(r.type))).map(r => Object.assign(r, {freq:hasOwn(FREQ, r.freq) ? r.freq : 'monthly'}));
  for (const k of ['budgets', 'yearBudgets']) if (p[k] != null) p[k] = map(p[k], Number.isFinite);
  for (const k of ['bankMap', 'ibanMap', 'walletMap', 'merchantAlias']) if (p[k] != null) p[k] = map(p[k], isStr);
  if (p.personAlias != null) p.personAlias = map(p.personAlias, Array.isArray);
  for (const k of ['groups', 'ignoredImports', 'exampleBudgetKeys']) if (p[k] != null) p[k] = strList(p[k]);
  for (const k of ['totalBudget', 'plannedIncome']) if (p[k] != null && !Number.isFinite(p[k])) p[k] = null;
  if (p.planNote != null && !isStr(p.planNote)) p.planNote = '';
  return p;
}
async function onJsonFile(file){
  let d;
  try { d = JSON.parse(await readText(file)); } catch (_) { toast('Datei ist kein gültiges Backup.'); return; }
  loadJson(d, file.name);
}
function loadJson(d, fileName){
  const file = {name:fileName};
  if (d && d.app === 'Kassabuch' && d.kind === 'encrypted' && d.kdf && d.iv && d.data) { openBackupUnlock(d, fileName); return; }
  if (d && d.app === 'Kassabuch' && d.kind === 'plan' && Array.isArray(d.categories)) { openPlan(d, file.name); return; }
  if (!d || d.app !== 'Kassabuch' || !Array.isArray(d.entries) || !d.profile || typeof d.profile !== 'object') { toast('Datei ist kein Kassabuch-Backup.'); return; }
  const incoming = d.entries.map(cleanBackupEntry).filter(Boolean), bad = d.entries.length - incoming.length;
  const fresh = incoming.filter(e => !S.entries.has(e.id)), blobs = d.blobs && typeof d.blobs === 'object' ? d.blobs : null;
  const emptyHere = !allEntries().some(e => !e.example) && !S.profile.cards.some(c => !c.example);
  openSheet('Backup laden', '<p class="note" style="margin:0">' + esc(file.name) + '<br>' + incoming.length + ' Einträge, davon ' + fresh.length + ' neu' + (blobs ? ', ' + Object.keys(blobs).length + ' Belegfotos' : ', ohne Belegfotos') + '. ' + (bad ? bad + (bad === 1 ? ' fehlerhafter Eintrag wird' : ' fehlerhafte Einträge werden') + ' übersprungen. ' : '') + (emptyHere ? 'Dieses Gerät ist leer: alle Einstellungen werden übernommen.' : 'Karten, Kategorien, Budgets, Daueraufträge und Ziele werden ergänzt, Vorhandenes bleibt.') + '</p>' + (blobs ? '' : '<p class="note" style="margin:0">Dieses Backup enthält keine Belegfotos. Buchungen und Artikel bleiben vollständig.</p>') + '<button class="btn primary" id="r-go"' + (fresh.length || !S.entries.size ? '' : ' disabled') + '>Zusammenführen</button>', root => {
    $('#r-go', root).onclick = async () => {
      const q = cleanBackupProfile(d.profile); let p;
      if (emptyHere) p = q;
      else {
        p = clean(S.profile);
        const addById = (k) => { p[k] = p[k] || []; for (const x of (q[k] || [])) if (!p[k].some(y => y.id === x.id)) p[k].push(x); };
        addById('categories'); addById('cards'); addById('recurring'); addById('goals'); addById('persons');
        for (const k of ['budgets', 'yearBudgets', 'bankMap', 'ibanMap', 'walletMap', 'merchantAlias', 'personAlias']) { p[k] = p[k] || {}; for (const [a, v] of Object.entries(q[k] || {})) if (p[k][a] == null) p[k][a] = v; }
        p.ignoredImports = [...new Set((p.ignoredImports || []).concat(q.ignoredImports || []))];
        for (const k of ['totalBudget', 'plannedIncome', 'planNote']) if (!p[k] && q[k]) p[k] = q[k];
        if (!(p.groups || []).length && (q.groups || []).length) p.groups = q.groups;
      }
      await saveProfile(p);
      if (blobs) { const need = new Set(incoming.flatMap(e => (e.receipts || []).map(r => r.blobId))); await tx('blobs', 'readwrite', st => { for (const [id, u] of Object.entries(blobs)) if (need.has(id)) { const b = dataToBlob(u); if (b) st.put(b, id); } }); }
      await putEntries(fresh.map(e => { const c = clean(e); if (c.receipts) c.receipts = c.receipts.filter(r => r.blobId); return c; }));
      closeSheet(); toast(fresh.length + ' Einträge' + (blobs ? ' und Belegfotos' : '') + ' übernommen');
    };
  });
}
/* ---------- Aufräumen nach Import: Konten/Kategorien zusammenführen, Duplikate, Umbuchungen, Import rückgängig ---------- */
const CAT_HINTS = [[/drogerie|haushalt|friseur|putz/i, 'haushalt'], [/miete|^haus\b|wohn|strom|heiz|energie|betriebskost/i, 'wohnen'], [/lebensmittel|supermarkt|einkauf|nahrung/i, 'lebensmittel'], [/tank|treibstoff|benzin|diesel|sprit/i, 'mobilitaet'], [/auto|kfz|motorrad|werkstatt|vignette|park/i, 'auto'],  [/versicher/i, 'versicherung'], [/schule/i, 'schule'], [/kind/i, 'kinder'], [/abo|handy|internet|streaming|mitglied|gym|fitness|vertr/i, 'abos'],  [/gesund|apothek|arzt|medizin/i, 'gesundheit'], [/restaurant|essen gehen|gastro|caf[eé]|freizeit|ausgehen|kino|hobby|sport/i, 'freizeit'], [/kleid|mode|schuh|bekleid|shopping/i, 'shopping'], [/geschenk/i, 'geschenke'], [/urlaub|reise/i, 'reisen'], [/spar|invest|depot|aktie|etf|bitcoin|krypto|crypto/i, 'investment'], [/r[uü]cklage|notgroschen|tagesgeld/i, 'ruecklage'], [/beihilfe/i, 'beihilfe'], [/gehalt|lohn/i, 'gehalt'], [/sonder/i, 'sonderzahlung']];
const cardKey = n => String(n || '').toLowerCase().replace(/raiffeisen\s*bank|raiffeisen|\brb\b|rlb/g, 'raiffeisen').replace(/trade\s*republic|\btr\b/g, 'traderepublic').replace(/crypto\.?com/g, 'cryptocom').replace(/bargeld|\bbar\b|cash|geldbörse|brieftasche/g, 'bar').split(/[^a-z0-9äöüß]+/).filter(Boolean)[0] || '';
function guessCatTarget(c, list){
  for (const [rx, id] of CAT_HINTS) if (rx.test(c.name)) { const t = list.find(x => x.id === id && x.kind === c.kind && x.id !== c.id); if (t) return t.id; }
  const same = list.find(x => x.id !== c.id && x.kind === c.kind && x.name.toLowerCase() === c.name.toLowerCase()); return same ? same.id : '';
}
function remapCards(p, from, to, list){
  for (const e of list) { if (e.cardId === from) e.cardId = to; if (e.toCardId === from) e.toCardId = to; }
  for (const r of p.recurring) { if (r.cardId === from) r.cardId = to; if (r.toCardId === from) r.toCardId = to; }
  for (const m of [p.bankMap, p.ibanMap, p.walletMap]) for (const k of Object.keys(m)) if (m[k] === from) m[k] = to;
  p.cards = p.cards.filter(c => c.id !== from);
}
function remapCats(p, from, to, list){
  for (const e of list) if (e.catId === from) e.catId = to;
  for (const r of p.recurring) if (r.catId === from) r.catId = to;
  for (const k of Object.keys(p.merchantAlias)) if (p.merchantAlias[k].catId === from) p.merchantAlias[k].catId = to;
  p.categories = p.categories.filter(c => c.id !== from); delete p.budgets[from];
}
function cleanupData(){
  const all = allEntries(), imp = all.filter(e => e.imported), own = all.filter(e => !e.imported && !e.example);
  const byKey = new Map(); for (const e of own) { const k = e.type + '|' + e.amount; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e); }
  const used = new Set(), dups = [];
  for (const e of imp) { if (e.type === 'transfer') continue; const m = (byKey.get(e.type + '|' + e.amount) || []).find(o => !used.has(o.id) && Math.abs(dayDiff(o.date, e.date)) <= 2); if (m) { used.add(m.id); dups.push([e, m]); } }
  const dupIds = new Set(dups.map(d => d[0].id)), pool = new Map(), pairs = [];
  for (const e of imp) if (!dupIds.has(e.id) && e.type === 'income' && e.cardId) { const k = e.date + '|' + e.amount; if (!pool.has(k)) pool.set(k, []); pool.get(k).push(e); }
  for (const e of imp) { if (dupIds.has(e.id) || e.type !== 'expense' || !e.cardId) continue; const l = pool.get(e.date + '|' + e.amount); const i = l ? l.findIndex(x => x.cardId !== e.cardId) : -1; if (i >= 0) pairs.push([e, l.splice(i, 1)[0]]); }
  const batches = new Map(); for (const e of imp) { const k = e.importBatch || ('t' + String(e.createdAt || '').slice(0, 16)); if (!batches.has(k)) batches.set(k, []); batches.get(k).push(e); }
  return {imp, dups, pairs, batches};
}
function openCleanup(){
  const p = S.profile, all = allEntries(), d = cleanupData();
  const cnt = id => all.filter(e => e.cardId === id || e.toCardId === id).length;
  const catCnt = {}; for (const e of all) catCnt[e.catId] = (catCnt[e.catId] || 0) + 1;
  const rich = c => !!(c.last4 || c.ibanLast4 || Object.values(p.bankMap).includes(c.id));
  const cardRows = p.cards.map((c, i) => {
    const k = cardKey(c.name), guess = rich(c) ? null : p.cards.find((o, j) => o.id !== c.id && cardKey(o.name) === k && k && (rich(o) || j < i));
    return '<div class="irow stack"><div class="row-main"><span class="row-title">' + esc(c.name) + (c.last4 ? ' <span class="muted">••' + esc(c.last4) + '</span>' : '') + '</span><span class="row-sub">' + cnt(c.id) + ' Einträge</span></div><select class="input" data-cm="' + esc(c.id) + '" style="max-width:48%"><option value="">behalten</option>' + p.cards.filter(o => o.id !== c.id).map(o => '<option value="' + esc(o.id) + '"' + (guess && guess.id === o.id ? ' selected' : '') + '>→ ' + esc(o.name) + '</option>').join('') + '</select></div>';
  }).join('');
  const plan = cats().filter(c => c.group || (['gehalt', 'beihilfe', 'sonderzahlung', 'einnahmen'].includes(c.id) || /^lohn-/.test(c.id)));
  const hasPlan = cats().some(c => c.group);
  const extra = cats().filter(c => !hasPlan ? c.id.startsWith('k-') : !plan.includes(c));
  const catRowsH = extra.map(c => { const g = guessCatTarget(c, cats()); return '<div class="irow stack"><div class="row-main"><span class="row-title">' + esc(c.name) + '</span><span class="row-sub">' + (c.kind === 'income' ? 'Einnahme' : 'Ausgabe') + ' · ' + (catCnt[c.id] || 0) + ' Einträge</span></div><select class="input" data-km="' + esc(c.id) + '" style="max-width:48%"><option value="">behalten</option>' + cats().filter(o => o.id !== c.id && o.kind === c.kind && !extra.includes(o)).map(o => '<option value="' + esc(o.id) + '"' + (g === o.id ? ' selected' : '') + '>→ ' + esc(o.name) + '</option>').join('') + '</select></div>'; }).join('');
  const line = e => esc(DAY.format(parseISO(e.date))) + ' · ' + money(e.amount) + ' · ' + esc(e.merchant || e.note || catById(e.catId).name);
  const dupRows = d.dups.slice(0, 400).map(([a, b], i) => '<label class="irow"><input type="checkbox" data-dup="' + i + '" checked><div class="row-main"><span class="row-title">' + line(a) + '</span><span class="row-sub">schon in der App: ' + esc(b.merchant || catById(b.catId).name) + ' · ' + esc(originTxt(b)) + '</span></div></label>').join('');
  const pairRows = d.pairs.slice(0, 400).map(([a, b], i) => '<label class="irow"><input type="checkbox" data-pair="' + i + '" checked><div class="row-main"><span class="row-title">' + esc(DAY.format(parseISO(a.date))) + ' · ' + money(a.amount) + '</span><span class="row-sub">' + esc((cardById(a.cardId) || {}).name || '?') + ' → ' + esc((cardById(b.cardId) || {}).name || '?') + '</span></div></label>').join('');
  const batchRows = [...d.batches.entries()].map(([k, l]) => { const ds = l.map(e => e.date).sort(); return '<div class="irow two"><div class="row-main"><span class="row-title">CSV-Import · ' + l.length + ' Buchungen</span><span class="row-sub">' + esc(DAY.format(parseISO(ds[0]))) + ' – ' + esc(DAY.format(parseISO(ds[ds.length - 1]))) + (l[0].createdAt ? ' · importiert ' + esc(new Date(l[0].createdAt).toLocaleString('de-AT', {day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit'})) : '') + '</span></div><button class="btn small danger" data-undo="' + esc(k) + '">Löschen</button></div>'; }).join('');
  openSheet('Aufräumen',
    '<p class="note" style="margin:0">Vorher <b>Backup sichern</b>. Jeder Schritt wird einzeln übernommen.</p>' +
    '<section class="panel"><h3>1 · Konten zusammenführen</h3><p class="note" style="margin:0">Doppelte Konten in das richtige überführen. Buchungen, Daueraufträge und Bank-Zuordnungen ziehen mit.</p><div class="list">' + cardRows + '</div><button class="btn primary" id="cl-cards">Konten übernehmen</button></section>' +
    (extra.length ? '<section class="panel"><h3>2 · Kategorien zusammenführen</h3><p class="note" style="margin:0">Importierte Kategorien in deinen Plan überführen. Vorschläge sind vorausgewählt.</p><div class="list">' + catRowsH + '</div><button class="btn primary" id="cl-cats">Kategorien übernehmen</button></section>' : '') +
    '<section class="panel"><h3>3 · Doppelte Buchungen</h3>' + (d.dups.length ? '<p class="note" style="margin:0">' + d.dups.length + ' CSV-Buchungen gibt es schon in der App (gleicher Betrag, ±2 Tage). Angehakte CSV-Einträge werden gelöscht, deine bleiben.</p><div class="list" style="max-height:340px;overflow:auto">' + dupRows + '</div><button class="btn primary" id="cl-dups">Angehakte löschen</button>' : '<p class="note" style="margin:0">Keine gefunden.</p>') + '</section>' +
    '<section class="panel"><h3>4 · Umbuchungen erkennen</h3>' + (d.pairs.length ? '<p class="note" style="margin:0">' + d.pairs.length + ' Paare aus Ausgabe und Einnahme am selben Tag mit gleichem Betrag auf zwei Konten. Das sind meist Überträge zwischen deinen Konten und verfälschen sonst Ausgaben und Einnahmen.</p><div class="list" style="max-height:340px;overflow:auto">' + pairRows + '</div><button class="btn primary" id="cl-pairs">In Umbuchungen umwandeln</button>' : '<p class="note" style="margin:0">Keine gefunden.</p>') + '</section>' +
    '<section class="panel"><h3>CSV-Import rückgängig</h3>' + (batchRows ? '<label class="field"><span>Behalten, wenn Text enthält</span><input class="input" id="cl-keep" placeholder="z. B. Wort1, Wort2" autocomplete="off" autocapitalize="off"></label><div id="cl-keep-prev"></div><div class="list">' + batchRows + '</div><p class="note" id="cl-undo-note" style="margin:0">Löscht nur Buchungen aus diesem Import. Behalten werden: Treffer im Suchfeld (Händler, Notiz, Kategorie, Konto) sowie alles mit Bank-PDF oder Bon. Danach leere Import-Konten und -Kategorien werden mit entfernt.</p>' : '<p class="note" style="margin:0">Keine importierten Buchungen.</p>') + '</section>',
    root => {
      const fin = async (p2, upd, del, msg) => { if (p2) await saveProfile(p2); if (upd && upd.length) await putEntries(upd); if (del && del.length) await deleteEntries(del); toast(msg); openCleanup(); };
      const bc = $('#cl-cards', root); if (bc) bc.onclick = async () => {
        const p2 = clean(S.profile), list = allEntries().map(clean), moves = [...root.querySelectorAll('[data-cm]')].filter(x => x.value).map(x => [x.dataset.cm, x.value]);
        if (!moves.length) return toast('Nichts ausgewählt.');
        const res = id => { const seen = new Set(); let t = id; while (true) { const m = moves.find(x => x[0] === t); if (!m || seen.has(t)) return t; seen.add(t); t = m[1]; } };
        for (const [from] of moves) { const to = res(from); if (to !== from) remapCards(p2, from, to, list); }
        const before = new Map(allEntries().map(e => [e.id, e.cardId + '|' + e.toCardId]));
        const upd = list.filter(e => before.get(e.id) !== e.cardId + '|' + e.toCardId);
        const self = upd.filter(e => e.type === 'transfer' && e.cardId && e.cardId === e.toCardId).map(e => e.id);
        await fin(p2, upd.filter(e => !self.includes(e.id)), self, moves.length + ' Konten zusammengeführt');
      };
      const bk = $('#cl-cats', root); if (bk) bk.onclick = async () => {
        const p2 = clean(S.profile), list = allEntries().map(clean), moves = [...root.querySelectorAll('[data-km]')].filter(x => x.value).map(x => [x.dataset.km, x.value]);
        if (!moves.length) return toast('Nichts ausgewählt.');
        const before = new Map(allEntries().map(e => [e.id, e.catId]));
        for (const [from, to] of moves) remapCats(p2, from, to, list);
        await fin(p2, list.filter(e => before.get(e.id) !== e.catId), null, moves.length + ' Kategorien zusammengeführt');
      };
      const bd = $('#cl-dups', root); if (bd) bd.onclick = async () => {
        const del = [...root.querySelectorAll('[data-dup]:checked')].map(x => d.dups[+x.dataset.dup][0].id);
        if (!del.length) return toast('Nichts angehakt.');
        await fin(null, null, del, del.length + ' doppelte Buchungen gelöscht');
      };
      const bp = $('#cl-pairs', root); if (bp) bp.onclick = async () => {
        const sel = [...root.querySelectorAll('[data-pair]:checked')].map(x => d.pairs[+x.dataset.pair]);
        if (!sel.length) return toast('Nichts angehakt.');
        const now = new Date().toISOString();
        const add = sel.map(([a, b]) => ({id:newId() + Math.random().toString(36).slice(2, 5), type:'transfer', amount:a.amount, date:a.date, catId:'', cardId:a.cardId, toCardId:b.cardId, merchant:'', note:a.note || b.note || 'Umbuchung', imported:true, importBatch:a.importBatch, createdAt:a.createdAt || now, updatedAt:now}));
        const gone = new Set(sel.flatMap(x => [x[0].id, x[1].id])), left = new Set(allEntries().filter(e => !gone.has(e.id)).map(e => e.catId));
        const p2 = clean(S.profile), drop = p2.categories.filter(c => c.id.startsWith('k-') && /umbuch|transfer|übertrag|uebertrag/i.test(c.name) && !left.has(c.id)).map(c => c.id);
        p2.categories = p2.categories.filter(c => !drop.includes(c.id));
        await fin(drop.length ? p2 : null, add, [...gone], sel.length + ' Umbuchungen erstellt');
      };
      const terms = () => { const i = $('#cl-keep', root); return i ? i.value.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length >= 2) : []; };
      const hay = e => [e.merchant, e.note, (catById(e.catId) || {}).name, (cardById(e.cardId) || {}).name, (cardById(e.toCardId) || {}).name].filter(Boolean).join(' ').toLowerCase();
      const keeps = e => { const t = terms(); return t.length && t.some(x => hay(e).includes(x)); };
      const prev = () => {
        const box = $('#cl-keep-prev', root); if (!box) return;
        const k = d.imp.filter(keeps).sort(byDateDesc); if (!terms().length) { box.innerHTML = ''; return; }
        box.innerHTML = '<div class="panel" style="padding:10px 12px"><strong>' + k.length + ' Buchungen werden behalten' + (k.length ? ' · ' + money(k.reduce((a, e) => a + (e.type === 'income' ? -e.amount : e.type === 'expense' ? e.amount : 0), 0)) + ' netto Ausgaben' : '') + '</strong>' + (k.length ? '<div class="list" style="max-height:260px;overflow:auto">' + k.slice(0, 200).map(e => '<div class="irow two"><div class="row-main"><span class="row-title">' + esc(e.merchant || e.note || catById(e.catId).name) + '</span><span class="row-sub">' + esc(DAYL.format(parseISO(e.date))) + ' · ' + esc(catById(e.catId).name) + (e.note && e.merchant ? ' · ' + esc(e.note) : '') + '</span></div><span class="row-amt">' + (e.type === 'income' ? '+ ' : e.type === 'transfer' ? '' : '− ') + money(e.amount) + '</span></div>').join('') + '</div>' : '') + '</div>';
        root.querySelectorAll('[data-undo]').forEach(b => { delete b.dataset.sure; b.textContent = terms().length ? 'Rest löschen' : 'Löschen'; });
      };
      const ki = $('#cl-keep', root); if (ki) ki.addEventListener('input', prev);
      root.querySelectorAll('[data-undo]').forEach(b => b.onclick = async () => {
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Wirklich?'; return; }
        const batch = d.batches.get(b.dataset.undo) || [];
        const l = batch.filter(e => !(e.bankKeys && e.bankKeys.length) && !hasBon(e) && !keeps(e)), gone = new Set(l.map(e => e.id));
        const left = allEntries().filter(e => !gone.has(e.id));
        const usedCat = new Set(left.map(e => e.catId)), usedCard = new Set(left.flatMap(e => [e.cardId, e.toCardId]));
        const p2 = clean(S.profile);
        for (const r of p2.recurring) { usedCat.add(r.catId); usedCard.add(r.cardId); usedCard.add(r.toCardId); }
        const bCats = new Set(batch.map(e => e.catId)), bCards = new Set(batch.flatMap(e => [e.cardId, e.toCardId]).filter(Boolean));
        const rich = c => !!(c.last4 || c.ibanLast4 || Object.values(p2.bankMap).includes(c.id) || Object.values(p2.ibanMap).includes(c.id));
        const nc = p2.categories.length, nk = p2.cards.length;
        p2.categories = p2.categories.filter(c => !(c.id.startsWith('k-') && bCats.has(c.id) && !usedCat.has(c.id) && !p2.budgets[c.id] && !c.group));
        p2.cards = p2.cards.filter(c => !(bCards.has(c.id) && !usedCard.has(c.id) && !rich(c) && c.startBalance == null));
        const rm = (nc - p2.categories.length) + (nk - p2.cards.length);
        await fin(rm ? p2 : null, null, [...gone], l.length + ' gelöscht, ' + (batch.length - l.length) + ' behalten');
      });
    });
}
function parseCSV(text){
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  let delim = ';', best = -1;
  for (const c of [';', ',', '\t']) { const n = first.split(c).length; if (n > best) { best = n; delim = c; } }
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
    else field += ch;
  }
  row.push(field); if (row.some(x => x.trim() !== '')) rows.push(row);
  return {delim, rows};
}
function parseDateAny(s){
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + pad(m[2]) + '-' + pad(m[1]); }
  return null;
}
async function readText(file){
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', {fatal:true}).decode(buf); } catch (_) { return new TextDecoder('windows-1252').decode(buf); }
}
async function onCsvFile(file){
  let parsed;
  try { parsed = parseCSV(await readText(file)); } catch (_) { toast('Datei konnte nicht gelesen werden.'); return; }
  const rows = parsed.rows;
  if (rows.length < 2) { toast('Keine Datenzeilen gefunden.'); return; }
  const head = rows[0].map(h => h.trim());
  const guess = re => head.findIndex(h => re.test(h));
  const map = {date:guess(/datum|date|tag/i), amount:guess(/betrag|amount|summe|wert|preis/i), cat:guess(/kategorie|category|gruppe/i), note:guess(/notiz|beschreibung|text|note|titel|bemerk|verwendung/i), card:guess(/konto|account|karte|zahlungs|wallet/i), type:guess(/^typ|^art$|type|einnahme.?\/?.?ausgabe/i), merchant:guess(/händler|haendler|empfänger|payee|merchant|partner/i)};
  const opts = h => '<option value="-1">— nicht verwenden —</option>' + head.map((x, i) => '<option value="' + i + '">' + esc(x || ('Spalte ' + (i + 1))) + '</option>').join('');
  const sel = (id, label, key) => '<label class="field"><span>' + label + '</span><select class="input" id="' + id + '">' + opts() + '</select></label>';
  openSheet('CSV importieren',
    '<p class="note" style="margin:0">' + esc(file.name) + ' · ' + (rows.length - 1) + ' Zeilen. Ordne die Spalten zu, prüfe die Vorschau und importiere.</p>' +
    '<div class="formgrid">' + sel('m-date', 'Datum *') + sel('m-amount', 'Betrag *') + sel('m-cat', 'Kategorie') + sel('m-card', 'Karte / Konto') + sel('m-merchant', 'Händler') + sel('m-note', 'Notiz') + sel('m-type', 'Typ (Einnahme/Ausgabe)') +
    '<label class="field"><span>Positive Beträge sind</span><select class="input" id="m-pos"><option value="expense">Ausgaben</option><option value="income">Einnahmen</option></select></label></div>' +
    '<div id="m-preview"></div><p class="note" id="m-err" role="alert" hidden></p><div class="progress" id="m-prog" hidden><i></i></div><button class="btn primary" id="m-go">Importieren</button>',
    root => {
      const ids = {date:'m-date', amount:'m-amount', cat:'m-cat', card:'m-card', merchant:'m-merchant', note:'m-note', type:'m-type'};
      for (const [k, id] of Object.entries(ids)) $('#' + id, root).value = String(map[k]);
      if (map.type < 0) $('#m-pos', root).value = 'income';
      const read = () => { const o = {}; for (const [k, id] of Object.entries(ids)) o[k] = Number($('#' + id, root).value); o.pos = $('#m-pos', root).value; return o; };
      const build = (mp, row) => {
        const g = i => i >= 0 ? String(row[i] || '').trim() : '';
        const date = parseDateAny(g(mp.date)); const n = num(g(mp.amount));
        if (!date || n == null || n === 0) return null;
        let type;
        const tv = g(mp.type).toLowerCase();
        if (tv && /ein|income|gutschrift|haben/.test(tv)) type = 'income';
        else if (tv && /aus|expense|soll|belast/.test(tv)) type = 'expense';
        else type = n < 0 ? (mp.pos === 'income' ? 'expense' : 'income') : mp.pos;
        return {date, amount:Math.round(Math.abs(n) * 100), type, catName:g(mp.cat), cardName:g(mp.card), merchant:g(mp.merchant), note:g(mp.note)};
      };
      const preview = () => {
        const mp = read(); const sample5 = rows.slice(1, 6).map(r => build(mp, r));
        const ok = rows.slice(1).map(r => build(mp, r)).filter(Boolean).length;
        $('#m-preview', root).innerHTML = '<div class="tablewrap"><table><thead><tr><th>Datum</th><th>Typ</th><th class="r">Betrag</th><th>Kategorie</th><th>Karte</th></tr></thead><tbody>' + sample5.map(x => x ? '<tr><td>' + esc(x.date) + '</td><td>' + (x.type === 'income' ? 'Einnahme' : 'Ausgabe') + '</td><td class="r">' + money(x.amount) + '</td><td>' + esc(x.catName || 'Sonstiges') + '</td><td>' + esc(x.cardName || '–') + '</td></tr>' : '<tr><td colspan="5" class="muted">Zeile nicht lesbar</td></tr>').join('') + '</tbody></table></div><p class="note" style="margin:6px 0 0">' + ok + ' von ' + (rows.length - 1) + ' Zeilen lesbar.</p>';
      };
      root.querySelectorAll('select').forEach(s => s.addEventListener('change', preview)); preview();
      $('#m-go', root).onclick = async () => {
        const mp = read(), err = $('#m-err', root);
        if (mp.date < 0 || mp.amount < 0) { err.hidden = false; err.textContent = 'Datum und Betrag müssen zugeordnet sein.'; return; }
        const parsedRows = rows.slice(1).map(r => build(mp, r)).filter(Boolean);
        if (!parsedRows.length) { err.hidden = false; err.textContent = 'Keine Zeile lesbar. Spaltenzuordnung prüfen.'; return; }
        const p = clean(S.profile);
        const catFor = (name, type) => {
          const nm = name || (type === 'income' ? 'Sonstige Einnahmen' : 'Sonstiges');
          let c = p.categories.find(x => x.kind === type && x.name.toLowerCase() === nm.toLowerCase());
          if (!c) { c = {id:'k-' + newId(), name:nm, color:p.categories.length % 20, kind:type}; p.categories.push(c); }
          return c.id;
        };
        const cardFor = name => {
          if (!name) return '';
          let c = p.cards.find(x => x.name.toLowerCase() === name.toLowerCase());
          if (!c) { c = {id:newId(), name, kind:/bar|cash/i.test(name) ? 'cash' : 'debit', color:p.cards.length % 20, last4:'', closingDay:null, startBalance:null}; p.cards.push(c); }
          return c.id;
        };
        const seen = new Set(allEntries().map(e => [e.date, e.amount, e.type, (e.note || '') + (e.merchant || '')].join('|')));
        const todo = [], batch = 'csv-' + newId();
        for (const x of parsedRows) {
          const key = [x.date, x.amount, x.type, x.note + x.merchant].join('|');
          if (seen.has(key)) continue; seen.add(key);
          todo.push({id:newId() + todo.length, type:x.type, amount:x.amount, date:x.date, catId:catFor(x.catName, x.type), cardId:cardFor(x.cardName), merchant:x.merchant, note:x.note, imported:true, importBatch:batch, createdAt:new Date().toISOString()});
        }
        const skipped = parsedRows.length - todo.length;
        if (!todo.length) { err.hidden = false; err.textContent = 'Alle Zeilen sind schon vorhanden.'; return; }
        $('#m-go', root).disabled = true; err.hidden = true;
        await saveProfile(p);
        const prog = $('#m-prog', root), bar = prog.querySelector('i'); prog.hidden = false;
        let done = 0, failed = 0;
        try { await putEntries(todo); done = todo.length; bar.style.width = '100%'; } catch (x) { failed = todo.length; }
        render(); closeSheet();
        toast(done + ' importiert' + (skipped ? ', ' + skipped + ' doppelt übersprungen' : '') + (failed ? ', ' + failed + ' fehlgeschlagen' : '') + '.');
      };
    });
}

async function loadExamples(){
  const r = loadExamplesInto(S.profile);
  await saveProfile(r.p);
  try { await putEntries(r.entries); closeSheet(); toast('Beispieldaten geladen'); } catch (x) { toast(writeErr(x)); }
}
async function removeExamples(){
  const p = clean(S.profile);
  p.cards = p.cards.filter(c => !c.example);
  p.recurring = (p.recurring || []).filter(r => !r.example);
  for (const k of p.exampleBudgetKeys) delete p.budgets[k];
  p.exampleBudgetKeys = [];
  await saveProfile(p);
  closeSheet();
  try { await deleteEntries(allEntries().filter(e => e.example).map(e => e.id)); toast('Beispieldaten entfernt'); } catch (x) { toast(writeErr(x)); }
}

/* ---------- Automatische Sicherung vor Updates zurückholen ---------- */
function openSnapshotRestore(sn){
  const newer = allEntries().filter(e => !sn.entries.some(x => x.id === e.id)).length;
  openSheet('Stand vor dem Update zurückholen',
    '<p class="note" style="margin:0">Sicherung vom ' + esc(DAYL.format(new Date(sn.at))) + ' mit ' + sn.entries.length + ' Einträgen (vor dem Update auf ' + esc(sn.to) + ').</p>' +
    '<p class="note" style="margin:0"><b>Achtung:</b> Alles, was du danach geändert hast, geht verloren' + (newer ? ', darunter ' + newer + (newer === 1 ? ' neuer Eintrag' : ' neue Einträge') : '') + '. Mach vorher ein Backup. Belegfotos bleiben erhalten.</p>' +
    '<div class="btnrow"><button class="btn danger" id="sn-go" style="flex:1">Zurückholen</button><button class="btn" data-act="close-sheet">Abbrechen</button></div>',
    root => { $('#sn-go', root).onclick = async () => {
      await tx('entries', 'readwrite', st => { st.clear(); for (const e of sn.entries) st.put(e); });
      S.entries = new Map(sn.entries.map(e => [e.id, e]));
      await kvSet('skipMigrations', APP_VERSION);   // der Umbau dieser Version soll den Stand nicht gleich wieder ändern
      await saveProfile(normalizeProfile(sn.profile));
      closeSheet(); render(); toast('Stand vom ' + DAYL.format(new Date(sn.at)) + ' zurückgeholt');
    }; });
}
