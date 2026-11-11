// Kassabuch – Ansichten: Übersicht, Einträge, Budgets, Karten, Statistik, Sparziele
'use strict';
/* ---------- rendering ---------- */
function render(){
  const ml = $('#modeLine');
  ml.textContent = S.mode === 'local' ? 'Nur auf diesem Gerät' : S.mode === 'error' ? 'Kein Speicher' : 'Wird geladen …';
  const b = [];
  if (S.banner) b.push('<div class="banner"><b>Hinweis</b><span>' + esc(S.banner) + '</span></div>');
  if (S.ready && S.entries.size >= 5) {
    const days = SET.lastBackup ? dayDiff(today(), SET.lastBackup.slice(0, 10)) : null;
    if ((days == null || days >= 7) && S.tab === 'uebersicht') b.push('<div class="banner"><b>Backup</b><span>' + (days == null ? 'Noch kein Backup.' : 'Letztes vor ' + days + ' Tagen.') + ' Daten liegen nur auf diesem iPhone. <button class="linkbtn" data-act="backup">Jetzt sichern</button></span></div>');
  }
  if (S.updateReady) b.unshift('<div class="banner" style="background:var(--accent-soft)"><b style="color:var(--accent)">Update</b><span>Eine neue Version ist da. <button class="linkbtn" data-act="reload">Jetzt neu laden</button></span></div>');
  $('#banners').innerHTML = b.join('');
  $('#tabs').innerHTML = TABS.map(([id, label, ic]) => id === '__add' ? '<button class="tab tab-add" data-act="add" aria-label="Eintrag erfassen"><span class="plus">' + ICON.plus + '</span></button>' : '<button class="tab" data-act="tab" data-tab="' + id + '"' + (S.tab === id ? ' aria-current="page"' : '') + '>' + ICON[ic] + '<span>' + label + '</span></button>').join('');
  const v = $('#view');
  if (S.tab === 'eintraege') renderEntries(v);
  else { v.dataset.shell = ''; v.innerHTML = ({uebersicht:viewOverview, budgets:viewBudgets, karten:viewCards, statistik:viewStats, fixkosten:viewFixed}[S.tab] || viewOverview)(); }
}
const monthBar = (label, act) => '<div class="monthbar"><h1>' + esc(label) + '</h1><div class="navpair"><button class="iconbtn" data-act="' + act + '" data-d="-1" aria-label="Zurück">' + ICON.left + '</button><button class="iconbtn" data-act="' + act + '" data-d="1" aria-label="Weiter">' + ICON.right + '</button></div></div>';
function badge(cat){
  const ic = CAT_ICON[cat.id] || (/^lohn-/.test(cat.id) ? CAT_ICON.lohn : null);
  return '<span class="badge" style="--c:var(--c' + (cat.color % 20) + ')" aria-hidden="true">' + (ic ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ic + '</svg>' : esc((cat.name || '?').trim().charAt(0).toUpperCase())) + '</span>';
}
const TRANSFER_CAT = {id:'__transfer', name:'Umbuchung', color:7, kind:'transfer'};
CAT_ICON.__transfer = '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>';
function transferRow(e, withDate){
  const a = cardById(e.cardId), b = cardById(e.toCardId);
  const sub = (a ? a.name : 'Karte gelöscht') + ' → ' + (b ? b.name : 'Karte gelöscht');
  return '<button class="row" data-act="edit" data-id="' + esc(e.id) + '">' + badge(TRANSFER_CAT) + '<span class="row-main"><span class="row-title">' + esc(e.note || e.merchant || 'Umbuchung') + '</span><span class="row-sub">' + esc(sub) + '</span></span><span class="row-end"><span class="row-amt muted">' + money(e.amount) + '</span>' + (withDate ? '<span class="row-date">' + esc(DAY.format(parseISO(e.date))) + '</span>' : '') + '</span></button>';
}
function entryRow(e, withDate){
  if (e.type === 'transfer') return transferRow(e, withDate);
  const cat = catById(e.catId), card = cardById(e.cardId);
  const title = e.merchant || cat.name;
  const pn = personNames(e);
  const sub = [isWithdrawal(e) ? 'Entnahme ' + cat.name : cat.name !== title ? cat.name : '', pn.length ? pn.join(', ') : '', card ? card.name : (e.cardId ? 'Karte gelöscht' : ''), e.note && !(e.example && e.note === 'Beispiel') ? e.note : ''].filter(Boolean).join(' · ');
  const inc = e.type === 'income';
  return '<button class="row" data-act="edit" data-id="' + esc(e.id) + '">' + badge(cat) + '<span class="row-main"><span class="row-title">' + esc(title) + (e.bankKeys && e.bankKeys.length ? ' ' + ICON.bank.replace('<svg ', '<svg class="clip" aria-label="Bank-PDF" ') : '') + (e.receipts && e.receipts.length ? ' ' + ICON.clip : '') + (e.pending ? ' <span class="chip info">vorgemerkt</span>' : '') + '</span><span class="row-sub">' + esc(sub || ' ') + '</span></span><span class="row-end"><span class="row-amt ' + (inc ? 'pos' : '') + '">' + (inc ? '+ ' : '− ') + money(e.amount) + (e._full ? '<small>von ' + money(e._full) + '</small>' : '') + '</span>' + (withDate ? '<span class="row-date">' + esc(DAY.format(parseISO(e.date))) + '</span>' : '') + '</span></button>';
}
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');

function collapsed(k){ try { return (localStorage.getItem('kb-coll') || '').split(',').includes(k); } catch (_) { return false; } }
function toggleCollapsed(k){ try { const l = (localStorage.getItem('kb-coll') || '').split(',').filter(Boolean); const i = l.indexOf(k); if (i >= 0) l.splice(i, 1); else l.push(k); localStorage.setItem('kb-coll', l.join(',')); } catch (_) {} }
function viewOverview(){
  const k = S.month, list = entriesIn(k), s = sums(list), pace = paceOf(k);
  const isCur = k === mkey(today());
  const daysGone = isCur ? parseISO(today()).getDate() : dim(k);
  const tb = totalBudget();
  let h = monthBar(monthLabel(k), 'month');
  h += '<div class="app-col" style="display:flex;flex-direction:column;gap:18px">';
  const hasSav = cats().some(c => c.saving);
  let dayH = '';
  if (tb && isCur) {
    const t = today(), remDays = dim(k) - daysGone + 1;
    const db = dailyBase(k), before = db.spent(list.filter(e => e.date < t)), spentToday = db.spent(list.filter(e => e.date === t));
    const perDay = Math.floor((db.budget - before - db.due) / remDays), todayLeft = perDay - spentToday;
    dayH = perDay <= 0
      ? '<div><div class="eyebrow">Heute verfügbar</div><div class="big badtxt">aufgebraucht</div><div class="note">Keine Reserve mehr bis Monatsende' + esc(db.hint) + '</div></div>'
      : '<div><div class="eyebrow">' + (todayLeft >= 0 ? 'Heute noch verfügbar' : 'Heute über Tagesbudget') + '</div><div class="big' + (todayLeft < 0 ? ' badtxt' : '') + '">' + money(Math.abs(todayLeft)) + '</div><div class="note">Tagesbudget ' + money0(perDay) + ' bis Monatsende' + esc(db.hint) + '</div></div>';
  }
  const bsAll = tb ? budgetSpent(list) : 0;
  h += '<section class="hero flat"><div class="hero-top">' + (dayH || '<div><div class="eyebrow">Ausgaben</div><div class="big">' + money(s.exp) + '</div></div>') + (tb ? budgetRing(bsAll, tb, isCur ? pace : null, budgetState(bsAll, tb, pace)) : '') + '</div>';
  h += '<div class="kv">' + (dayH ? '<div><span>Ausgaben</span><strong>' + money(s.exp) + '</strong></div>' : '') + '<div><span>Einnahmen</span><strong class="pos">' + money(s.inc) + '</strong></div>' + (hasSav ? '<div><span>Gespart</span><strong class="' + (s.sav ? 'savtxt' : '') + '">' + money(s.sav) + '</strong></div>' : '') + (!dayH || !hasSav ? '<div><span>Saldo</span><strong class="' + (s.bal < 0 ? 'badtxt' : '') + '">' + money(s.bal) + '</strong></div>' : '') + (!dayH && !hasSav ? '<div><span>Ø pro Tag</span><strong>' + money(Math.round(s.exp / Math.max(1, daysGone))) + '</strong></div>' : '') + '</div>';
  if (tb) { const left = tb - bsAll; h += '<p class="note hero-foot">Budget ' + money0(tb) + ' · ' + (left >= 0 ? 'noch ' + money(left) : '<b class="badtxt">' + money(-left) + ' drüber</b>') + (isCur ? ' · ' + (dim(k) - daysGone) + ' Tage übrig' : '') + '</p>'; }
  h += '</section>';
  if (allEntries().some(e => e.example)) h += '<div class="exbar"><span>Beispieldaten sind aktiv.</span><button class="btn small" data-act="examples-remove">Entfernen</button></div>';
  h += '<div class="actions">' + (S.canScan ? '<button class="btn primary" data-act="scan">' + ICON.camera + 'Beleg</button>' : '<button class="btn" data-act="scan-info">' + ICON.camera + 'Beleg</button>') + '<button class="btn" data-act="bank">' + ICON.bank + 'Bank</button><button class="btn" data-act="inbox">' + ICON.wallet + 'Apple Pay</button></div>';

  if (isCur && daysGone <= 7 && entriesIn(addMonths(k, -1)).length && reviewSeen() !== addMonths(k, -1)) h += '<div class="list"><button class="row" data-act="review" data-k="' + esc(addMonths(k, -1)) + '"><span class="row-main"><span class="row-title">Rückblick ' + esc(monthLabel(addMonths(k, -1)).split(' ')[0]) + '</span><span class="row-sub">Plan und Ist, über Budget, wo das Geld hinging</span></span><span class="chev">' + ICON.right + '</span></button></div>';
  // Konten: aktueller Stand zuerst sichtbar
  h += '<section class="block"><div class="block-head"><h2>Konten</h2><button class="linkbtn" data-act="tab" data-tab="karten">Verwalten</button></div>';
  if (!S.profile.cards.length) h += '<div class="list"><div class="empty"><strong>Keine Karten angelegt</strong><span>Lege deine Konten, Karten und Bargeld an, um den Stand zu sehen.</span><button class="btn small" data-act="card-add">Karte hinzufügen</button></div></div>';
  else {
    const stats = activeCards().map(cd => ({cd, st:cardStatus(cd)})), known = stats.filter(x => x.st.known);
    if (known.length) {
      const tot = known.reduce((a, x) => a + x.st.raw, 0), open = known.filter(x => x.cd.kind === 'credit').reduce((a, x) => a - Math.min(0, x.st.raw), 0);
      h += '<div class="sumline"><div><div class="note">Gesamt' + (known.length < stats.length ? ' · ' + known.length + ' von ' + stats.length + ' Konten' : '') + '</div>' + (open ? '<div class="note">inkl. Kreditkarten offen − ' + money(open) + '</div>' : '') + '</div><strong class="num' + (tot < 0 ? ' badtxt' : '') + '">' + money(tot) + '</strong></div>';
    }
    h += '<div class="list">' + stats.map(({cd, st}) => { const sp = sums(list.filter(e => e.cardId === cd.id)).exp;
      return '<button class="row" data-act="' + (st.known ? 'card-entries' : 'card-edit') + '" data-id="' + esc(cd.id) + '"><i class="cardglyph" style="--c:var(--c' + (cd.color % 20) + ')"></i><span class="row-main"><span class="row-title">' + esc(cd.name) + '</span><span class="row-sub">' + (cd.last4 ? '••' + esc(cd.last4) : esc(KIND[cd.kind] || '')) + (sp ? ' · ' + esc(monthLabel(k).split(' ')[0].slice(0, 3)) + ' ' + money0(-sp) : '') + '</span></span>' +
        (st.known ? '<span class="row-amt' + (st.bad ? ' badtxt' : '') + '">' + money(cd.kind === 'credit' && st.label === 'offen' ? -st.v : st.v) + '<small>' + st.label + '</small></span>' : '<span class="chip info">Stand eintragen</span>') + '</button>'; }).join('') + '</div>';
  }
  h += '</section>';

  { const soon = warrantyList().filter(e => dayDiff(e.warrantyUntil, today()) <= 60), rises = detectSubs().filter(x => x.rise && dayDiff(today(), x.last.date) <= 45), notes = [];
    for (const e of soon.slice(0, 2)) notes.push('<button class="row" data-act="warranties"><span class="row-main"><span class="row-title">Garantie endet: ' + esc(e.merchant || catById(e.catId).name) + (e.note ? ' · ' + esc(e.note) : '') + '</span><span class="row-sub">am ' + esc(DAYL.format(parseISO(e.warrantyUntil))) + ' – Mängel jetzt noch melden</span></span><span class="chev">' + ICON.right + '</span></button>');
    for (const x of rises.slice(0, 2)) notes.push('<button class="row" data-act="tab" data-tab="fixkosten"><span class="row-main"><span class="row-title">Preiserhöhung: ' + esc(x.merchant) + '</span><span class="row-sub">+ ' + money(x.rise) + ' auf ' + money(x.amount) + ' · ≈ + ' + money0(x.rise * (x.freq === 'monthly' ? 12 : 1)) + ' pro Jahr</span></span><span class="chev">' + ICON.right + '</span></button>');
    if (notes.length) h += '<div class="list">' + notes.join('') + '</div>'; }
  if ((S.profile.goals || []).length) h += '<section class="block"><div class="block-head"><h2>Sparziele</h2><button class="linkbtn" data-act="tab" data-tab="budgets">Alle</button></div><div class="list">' + S.profile.goals.slice(0, 2).map(goalRow).join('') + '</div></section>';
  // budgets needing attention
  const spent = spentByCat(list);
  const rows = cats().filter(c => c.kind === 'expense' && !c.saving && S.profile.budgets[c.id]).map(c => ({c, spent:spent[c.id] || 0, budget:S.profile.budgets[c.id]})).map(r => Object.assign(r, {st:catState(r.c, r.spent, r.budget, pace), ratio:r.spent / r.budget})).sort((a, b) => b.ratio - a.ratio);
  h += '<section class="block"><div class="block-head"><h2>Budgets</h2><button class="linkbtn" data-act="tab" data-tab="budgets">Alle</button></div>';
  if (!rows.length) h += '<div class="list"><div class="empty"><strong>Noch keine Budgets</strong><span>Lege pro Kategorie ein Monatslimit fest. Dann siehst du hier, wo du drüber bist.</span><button class="btn small" data-act="tab" data-tab="budgets">Budgets festlegen</button></div></div>';
  else {
    const attn = rows.filter(r => r.st === 'warn' || r.st === 'bad');
    const show = (attn.length ? attn : rows.filter(r => !isFixedCat(r.c)).sort((a, b) => b.ratio - a.ratio)).slice(0, 4);
    h += '<div class="list">' + show.map(r => budgetRow(r, 'cat-entries')).join('') + '</div>';
    if (!attn.length) h += '<p class="note" style="margin:0">Alle ' + rows.length + ' Budgets sind im Rahmen.</p>';
  }
  h += '</section>';

  // fixed costs
  {
    const active = S.profile.recurring.filter(isActive);
    const fcoll = collapsed('fix');
    h += '<section class="block"><div class="block-head"><button class="secttl" data-act="toggle-sec" data-sec="fix" aria-expanded="' + !fcoll + '"><h2>Fixkosten</h2>' + ICON.down + '</button><button class="linkbtn" data-act="tab" data-tab="fixkosten">' + (active.length ? 'Alle' : 'Einrichten') + '</button></div>';
    if (fcoll) {}
    else if (!active.length) h += '<div class="list"><button class="row" data-act="tab" data-tab="fixkosten">' + badge({id:'abos', name:'Abos', color:6}) + '<span class="row-main"><span class="row-title">Daueraufträge anlegen</span><span class="row-sub">Kredit, Abos, Gehalt automatisch buchen</span></span></button></div>';
    else {
      const fs = fixedSums();
      const nx = active.map(r => ({r, d:nextDue(r)})).filter(x => x.d).sort((a, b) => a.d.localeCompare(b.d))[0];
      h += '<div class="list"><button class="row" data-act="tab" data-tab="fixkosten">' + badge({id:'abos', name:'Abos', color:6}) + '<span class="row-main"><span class="row-title">' + money(fs.exp) + ' pro Monat</span><span class="row-sub">' + (nx ? 'Nächste: ' + esc(ruleTitle(nx.r)) + ' ' + esc(relDays(nx.d)) + ' · ' + money(nx.r.amount) : active.length + ' aktiv') + '</span></span><span class="row-end">' + ICON.right.replace('<svg ', '<svg style="width:18px;height:18px;color:var(--muted)" ') + '</span></button></div>';
    }
    h += '</section>';
  }

  // recent
  const recent = list.slice().sort(byDateDesc).slice(0, 3), coll = collapsed('recent');
  h += '<section class="block"><div class="block-head"><button class="secttl" data-act="toggle-sec" data-sec="recent" aria-expanded="' + !coll + '"><h2>Letzte Einträge</h2>' + ICON.down + '</button><button class="linkbtn" data-act="tab" data-tab="eintraege">Alle</button></div>';
  if (!coll) h += recent.length ? '<div class="list">' + recent.map(e => entryRow(e, true)).join('') + '</div>' : emptyEntries();
  h += '</section>';
  if (S.ready && !S.entries.size) h += '<section class="panel"><h3>Erst einmal ausprobieren?</h3><p class="note" style="margin:0">Lade Beispieldaten aus drei Monaten. Sie sind markiert und lassen sich in den Einstellungen mit einem Tipp wieder entfernen.</p><div class="btnrow"><button class="btn small" data-act="examples-load">Beispieldaten laden</button></div></section>';
  h += '</div>';
  return h;
}
/* Status nur zeigen, wenn er etwas sagt: „im Rahmen“ ist der Normalfall und bleibt still */
function stChip(st){ return st && st !== 'ok' ? '<span class="chip ' + (st === 'done' ? 'ok' : st === 'open' ? 'info' : st) + '">' + STATE_TXT[st] + '</span>' : ''; }
/* Ring: verbrauchter Anteil des Budgets, Strich = wo der Monat gerade steht */
function budgetRing(spent, budget, pace, st){
  const R = 30, C = 2 * Math.PI * R, p = Math.min(1, Math.max(0, spent / budget)), pct = Math.round(spent / budget * 100);
  let svg = '<svg class="ring ' + (st || 'ok') + '" viewBox="0 0 76 76" role="img" aria-label="' + pct + ' Prozent des Budgets verbraucht"><circle cx="38" cy="38" r="' + R + '" class="ring-track"/>' + (p > 0 ? '<circle cx="38" cy="38" r="' + R + '" class="ring-fill" stroke-dasharray="' + (C * p).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 38 38)"/>' : '');
  if (pace != null && pace > 0 && pace < 1) { const a = (pace * 360 - 90) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a); svg += '<line class="ring-pace" x1="' + (38 + 23 * c).toFixed(1) + '" y1="' + (38 + 23 * sn).toFixed(1) + '" x2="' + (38 + 37 * c).toFixed(1) + '" y2="' + (38 + 37 * sn).toFixed(1) + '"/>'; }
  return svg + '<text x="38" y="43" text-anchor="middle" class="ring-txt">' + pct + ' %</text></svg>';
}
function reviewSeen(){ try { return localStorage.getItem('kb-review-seen') || ''; } catch (_) { return ''; } }
function emptyEntries(){ return '<div class="list"><div class="empty"><strong>Noch keine Einträge in diesem Monat</strong><span>Erfasse eine Ausgabe mit dem Plus oder fotografiere einen Beleg.</span></div></div>'; }
function budgetRow(r, act){
  act = act || 'budget-edit';   // Übersicht: Tipp zeigt die Buchungen, Budgets-Tab: Tipp stellt das Budget ein
  if (r.c.saving) {
    const done = r.spent >= r.budget, rest = r.budget - r.spent;
    return '<button class="brow" data-act="' + act + '" data-cat="' + esc(r.c.id) + '"><span class="brow-top">' + badge(r.c) + '<span class="row-main"><span class="row-title">' + esc(r.c.name) + '</span></span><span class="chip ' + (done ? 'sav' : 'info') + '">' + (done ? 'erledigt' : 'offen') + '</span></span>' +
      '<span class="bar sav"><i style="width:' + Math.min(100, r.spent / r.budget * 100) + '%"></i></span>' +
      '<span class="brow-nums"><span><b>' + money(r.spent) + '</b> von ' + money0(r.budget) + '</span><span>' + (rest > 0 ? 'noch ' + money(rest) + ' offen' : 'Ziel erreicht') + '</span></span></button>';
  }
  const pace = paceOf(S.month);
  const showPace = mkey(today()) === S.month && !isFixedCat(r.c), cls = r.st === 'done' ? 'ok' : r.st === 'open' ? 'info' : r.st;
  const left = r.budget - r.spent;
  return '<button class="brow" data-act="' + act + '" data-cat="' + esc(r.c.id) + '"><span class="brow-top">' + badge(r.c) + '<span class="row-main"><span class="row-title">' + esc(r.c.name) + '</span></span>' + stChip(r.st) + '</span>' +
    '<span class="bar ' + cls + '"><i style="width:' + Math.min(100, r.ratio * 100) + '%"></i>' + (showPace ? '<em style="left:calc(' + (pace * 100) + '% - 1px)"></em>' : '') + '</span>' +
    '<span class="brow-nums"><span><b>' + money(r.spent) + '</b> von ' + money0(r.budget) + '</span><span>' + (left >= 0 ? 'noch ' + money(left) : '<b class="badtxt">' + money(-left) + ' drüber</b>') + '</span></span></button>';
}

/* entries view keeps its toolbar so typing in search is not interrupted */
function renderEntries(v){
  if (v.dataset.shell !== 'entries') {
    v.dataset.shell = 'entries';
    v.innerHTML = '<div style="display:flex;flex-direction:column;gap:14px"><div id="eMonth"></div><div class="seg" role="group" aria-label="Ansicht" id="eMode"><button type="button" data-mode="list">Liste</button><button type="button" data-mode="cal">Kalender</button></div><div class="toolbar"><input class="input" id="eSearch" type="search" placeholder="Suchen: Händler, Notiz, Betrag" autocomplete="off"><div class="filters"><select class="input" id="eCard" aria-label="Karte"></select><select class="input" id="eCat" aria-label="Kategorie"></select><select class="input" id="ePers" aria-label="Person"></select></div></div><div id="eReset" hidden></div><div id="eSum" class="statgrid"></div><div id="eCal"></div><div id="eList"></div></div>';
    const se = $('#eSearch'); se.value = S.q;
    se.addEventListener('input', () => { S.q = se.value; fillEntries(); });
    $('#eCard').addEventListener('change', ev => { S.fCard = ev.target.value; fillEntries(); });
    $('#eCat').addEventListener('change', ev => { S.fCat = ev.target.value; fillEntries(); });
    $('#ePers').addEventListener('change', ev => { S.fPers = ev.target.value; fillEntries(); });
    $('#eMode').addEventListener('click', ev => { const b = ev.target.closest('[data-mode]'); if (!b) return; S.eMode = b.dataset.mode; S.eDay = ''; try { localStorage.setItem('kb-emode', S.eMode); } catch (_) {} fillEntries(); });
    $('#eCal').addEventListener('click', ev => { const b = ev.target.closest('[data-day]'); if (!b) return; S.eDay = S.eDay === b.dataset.day ? '' : b.dataset.day; fillEntries(); });
  }
  $('#eMonth').innerHTML = monthBar(monthLabel(S.month), 'month');
  const cs = $('#eCard');
  cs.innerHTML = '<option value="">Alle Karten</option>' + S.profile.cards.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('') + '<option value="__none">Ohne Karte</option>';
  cs.value = S.fCard; if (cs.value !== S.fCard) { S.fCard = ''; cs.value = ''; }
  const ks = $('#eCat');
  ks.innerHTML = '<option value="">Alle Kategorien</option>' + cats().map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
  ks.value = S.fCat; if (ks.value !== S.fCat) { S.fCat = ''; ks.value = ''; }
  const ps = $('#ePers'); ps.hidden = !persons().length;
  ps.innerHTML = '<option value="">Alle Personen</option>' + persons().map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('') + '<option value="__none">Ohne Person</option>';
  ps.value = S.fPers; if (ps.value !== S.fPers) { S.fPers = ''; ps.value = ''; }
  fillEntries();
}
function calendarHTML(list){
  const k = S.month, n = dim(k), first = (parseISO(k + '-01').getDay() + 6) % 7, t = today();
  /* Farbe = variable Ausgaben des Tages im Vergleich zum Tagesbudget; Daueraufträge zählen nicht, sonst wäre jeder Kredit-Tag rot */
  const spent = {}, vari = {};
  for (const e of list) if (e.type === 'expense') { spent[e.date] = (spent[e.date] || 0) + e.amount; if (!e.recurringId && !isSaving(e.catId)) vari[e.date] = (vari[e.date] || 0) + e.amount; }
  const tb = totalBudget(), daily = tb ? tb / n : null;
  const level = d => { const v = vari[d] || 0; if (!spent[d]) return ''; if (!v) return 'lv-fix'; if (!daily) return 'lv-ok'; return v <= daily ? 'lv-ok' : v <= daily * 2 ? 'lv-warn' : 'lv-bad'; };
  const sched = new Set();
  for (const r of S.profile.recurring) if (isActive(r)) for (const d of occurrences(r, addDays(t, 1), k + '-' + pad(n))) if (d.startsWith(k)) sched.add(d);
  let h = '<div class="cal"><div class="cal-head">' + ['Mo','Di','Mi','Do','Fr','Sa','So'].map(x => '<span>' + x + '</span>').join('') + '</div><div class="cal-grid">';
  for (let i = 0; i < first; i++) h += '<span class="cday blank"></span>';
  for (let d = 1; d <= n; d++) {
    const iso = k + '-' + pad(d), v = spent[iso] || 0, lv = level(iso);
    h += '<button type="button" class="cday' + (lv ? ' ' + lv : '') + (iso === t ? ' today' : '') + '" data-day="' + iso + '" aria-pressed="' + (S.eDay === iso) + '" aria-label="' + esc(DAYL.format(parseISO(iso))) + (v ? ', ' + esc(money(v)) : '') + '"><b>' + d + '</b>' + (v ? '<small>' + Math.round(v / 100).toLocaleString('de-AT') + '</small>' : sched.has(iso) ? '<i class="sched" title="Dauerauftrag fällig"></i>' : '<small>&nbsp;</small>') + '</button>';
  }
  const lg = daily
    ? '<span><i style="--c:var(--ok)"></i>bis ' + money0(daily) + ' (Tagesbudget)</span><span><i style="--c:var(--warn)"></i>bis ' + money0(daily * 2) + '</span><span><i style="--c:var(--bad)"></i>darüber</span>'
    : '<span>Für Ampelfarben ein Budget festlegen</span>';
  return h + '</div><div class="callegend">' + lg + '<span><i style="--c:var(--warn);border-radius:50%"></i>Dauerauftrag fällig</span></div><p class="note" style="margin:2px 2px 0">Daueraufträge färben nicht. Tag antippen zum Filtern.</p></div>';
}
function fillEntries(){
  /* Aktive Filter benennen und mit einem Tipp zurücksetzen */
  { const act = [S.fCat ? catById(S.fCat).name : '', S.fCard ? ((cardById(S.fCard) || {}).name || '') : '', S.fPers ? (S.fPers === '__none' ? 'Ohne Person' : (personById(S.fPers) || {}).name || '') : '', S.q ? '„' + S.q + '“' : ''].filter(Boolean), box = $('#eReset');
    if (box) { box.hidden = !act.length; box.innerHTML = act.length ? '<p class="note" style="margin:0;display:flex;justify-content:space-between;gap:12px;align-items:baseline"><span>Gefiltert: ' + esc(act.join(' · ')) + '</span><button class="linkbtn" data-act="filters-reset" style="flex:none">Filter zurücksetzen</button></p>' : ''; } }
  const q = S.q.trim().toLowerCase();
  let list = entriesIn(S.month);
  if (S.fCard) list = list.filter(e => S.fCard === '__none' ? !e.cardId : (e.cardId === S.fCard || e.toCardId === S.fCard));
  if (S.fCat) list = list.filter(e => e.catId === S.fCat);
  if (S.fPers) list = list.filter(e => S.fPers === '__none' ? e.type !== 'transfer' && !(e.persons || []).some(personById) : (e.persons || []).includes(S.fPers));
  if (q) list = list.filter(e => [e.merchant, e.note, e.type === 'transfer' ? 'Umbuchung' : catById(e.catId).name, (cardById(e.cardId) || {}).name, (cardById(e.toCardId) || {}).name, money(e.amount), txId(e)].join(' ').toLowerCase().includes(q));
  /* Personenfilter: Summen und Beträge nur mit dem Anteil dieser Person (gleichmäßig aufgeteilt) */
  const share = S.fPers && S.fPers !== '__none';
  if (share) list = list.map(e => { const sh = personShares(e)[S.fPers]; return sh != null && sh !== e.amount ? Object.assign({}, e, {amount:sh, _full:e.amount}) : e; });
  list.sort(byDateDesc);
  if (!S.eMode) { try { S.eMode = localStorage.getItem('kb-emode') || 'list'; } catch (_) { S.eMode = 'list'; } }
  $('#eMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === S.eMode)));
  if (S.eMode === 'cal') {
    $('#eCal').innerHTML = calendarHTML(list);
    if (S.eDay && !S.eDay.startsWith(S.month)) S.eDay = '';
    list = S.eDay ? list.filter(e => e.date === S.eDay) : list;
  } else $('#eCal').innerHTML = '';
  const s = sums(list);
  $('#eSum').innerHTML = '<div class="stat"><span>Ausgaben' + (share ? ', Anteil' : '') + '</span><strong>' + money(s.exp) + '</strong></div><div class="stat"><span>Einnahmen' + (share ? ', Anteil' : '') + '</span><strong class="pos">' + money(s.inc) + '</strong></div>';
  if (!list.length) { $('#eList').innerHTML = S.eDay ? '<div class="list"><div class="empty">Keine Einträge am ' + esc(DAYL.format(parseISO(S.eDay))) + '.</div></div>' : (q || S.fCard || S.fCat || S.fPers) ? '<div class="list"><div class="empty"><strong>Keine Treffer</strong><span>Filter zurücksetzen oder anderen Monat wählen.</span></div></div>' : emptyEntries(); return; }
  const groups = new Map();
  for (const e of list) { if (!groups.has(e.date)) groups.set(e.date, []); groups.get(e.date).push(e); }
  let h = '<div class="list">';
  for (const [d, arr] of groups) {
    const ds = sums(arr);
    h += '<div class="dayhead"><span>' + esc(DAY.format(parseISO(d))) + '</span><span class="num">' + (ds.exp ? '− ' + money(ds.exp) : '') + (ds.inc ? (ds.exp ? ' · ' : '') + '+ ' + money(ds.inc) : '') + '</span></div>';
    h += arr.map(e => '<div class="swipe"><div class="swipe-act">' + (e.pending ? '<button class="settle" data-act="sw-settle" data-id="' + esc(e.id) + '">Gebucht</button>' : '') + '<button class="del" data-act="sw-del" data-id="' + esc(e.id) + '">Löschen</button></div>' + entryRow(e, false) + '</div>').join('');
  }
  const pend = allEntries().filter(e => e.pending);
  $('#eList').innerHTML = h + '</div><p class="note" style="text-align:center">' + list.length + (list.length === 1 ? ' Eintrag' : ' Einträge') + (pend.length ? ' · ' + pend.length + ' vorgemerkt · <button class="linkbtn" style="font-size:inherit;padding:0" id="pend-all">alle als gebucht markieren</button>' : '') + '</p>';
  const pa = $('#pend-all'); if (pa) pa.onclick = async () => {
    if (!pa.dataset.sure) { pa.dataset.sure = '1'; pa.textContent = 'wirklich alle ' + pend.length + '?'; return; }
    await putEntries(pend.map(e => Object.assign(clean(e), {pending:false, settledManually:today()}))); toast(pend.length + ' als gebucht markiert');
  };
}

function yearRow(c, yb){
  const y = S.month.slice(0, 4), cy = String(new Date().getFullYear()) === y;
  const sp = entriesIn(y).filter(e => e.type === 'expense' && e.catId === c.id).reduce((a, e) => a + e.amount, 0);
  const t = new Date(), pace = cy ? (t - new Date(t.getFullYear(), 0, 1)) / 864e5 / 365 : 1;
  const st = budgetState(sp, yb, pace), left = yb - sp;
  return '<button class="brow" data-act="budget-edit" data-cat="' + esc(c.id) + '"><span class="brow-top">' + badge(c) + '<span class="row-main"><span class="row-title">' + esc(c.name) + '</span><span class="row-sub">Jahresbudget ' + esc(y) + '</span></span>' + stChip(st) + '</span>' +
    '<span class="bar ' + st + '"><i style="width:' + Math.min(100, sp / yb * 100) + '%"></i>' + (cy ? '<em class="pace" style="left:' + (pace * 100) + '%"></em>' : '') + '</span>' +
    '<span class="brow-nums"><span><b>' + money(sp) + '</b> von ' + money0(yb) + '</span><span>' + (left >= 0 ? 'noch ' + money(left) : money(-left) + ' drüber') + '</span></span></button>';
}
function groupedBudgets(list, spent, pace){
  const exp = cats().filter(c => c.kind === 'expense');
  const order = (S.profile.groups || []).concat([...new Set(exp.map(c => c.group || 'Sonstige'))]).filter((g, i, a) => a.indexOf(g) === i);
  let h = '', planSum = 0;
  for (const g of order) {
    const cs = exp.filter(c => (c.group || 'Sonstige') === g); if (!cs.length) continue;
    const b = cs.reduce((a, c) => a + (S.profile.budgets[c.id] || 0), 0), sp = cs.reduce((a, c) => a + (spent[c.id] || 0), 0);
    planSum += b;
    const sav = cs.every(c => c.saving), fix = cs.every(isFixedCat), st = b ? (sav ? (sp >= b ? 'ok' : 'info') : fix ? fixState(sp, b) : budgetState(sp, b, pace)) : null;
    h += '<section class="block"><div class="block-head"><h2>' + esc(g) + '</h2><span class="note num">' + money0(sp) + (b ? ' von ' + money0(b) : '') + '</span></div>';
    if (b) h += '<div class="bar ' + (sav ? 'sav' : st) + '" style="margin:-4px 0 2px"><i style="width:' + Math.min(100, sp / b * 100) + '%"></i></div>';
    const zero = cs.filter(c => !S.profile.budgets[c.id] && !(S.profile.yearBudgets || {})[c.id] && !spent[c.id]), zk = 'z-' + g.replace(/,/g, ''), zOpen = collapsed(zk);
    const zRow = zero.length > 1 ? '<button class="row zrow" data-act="toggle-sec" data-sec="' + esc(zk) + '" aria-expanded="' + zOpen + '"><span class="row-main"><span class="row-sub">' + (zOpen ? 'Weniger anzeigen' : zero.length + ' Kategorien ohne Budget und ohne Ausgaben') + '</span></span>' + ICON.down + '</button>' : '';
    const shown = zRow && !zOpen ? cs.filter(c => !zero.includes(c)) : cs;
    h += '<div class="list">' + shown.map(c => {
      const bud = S.profile.budgets[c.id], v = spent[c.id] || 0;
      if (bud) return budgetRow({c, spent:v, budget:bud, st:catState(c, v, bud, pace), ratio:v / bud});
      const yb = (S.profile.yearBudgets || {})[c.id];
      if (yb) return yearRow(c, yb);
      return '<button class="row" data-act="budget-edit" data-cat="' + esc(c.id) + '">' + badge(c) + '<span class="row-main"><span class="row-title">' + esc(c.name) + '</span><span class="row-sub">ohne Monatsbudget</span></span><span class="row-amt">' + money(v) + '</span></button>';
    }).join('') + zRow + '</div></section>';
  }
  /* Plan gegen Ist: Einnahmen-Fortschritt und was nach allen Ausgaben tatsächlich übrig bleibt */
  const pi = S.profile.plannedIncome;
  if (pi) {
    const s = sums(list), out = s.exp + s.sav, left = s.inc - out, r = Math.min(100, s.inc / pi * 100);
    h += '<section class="panel flat"><button class="plan-head" data-act="plan-edit"><h3>Plan gegen Ist</h3><span class="plan-edit">Einkommen ändern</span></button>' +
      '<div class="meter-head" style="margin-top:6px"><span class="nowrap">Einnahmen <b>' + money0(s.inc) + '</b> von ' + money0(pi) + '</span><span class="nowrap">' + (s.inc >= pi ? 'erreicht' : 'noch ' + money0(pi - s.inc)) + '</span></div>' +
      '<div class="bar inc" role="img" aria-label="' + Math.round(r) + ' Prozent der geplanten Einnahmen"><i style="width:' + r + '%"></i></div>' +
      '<div class="kv kv2" style="margin-top:10px"><div><span>Ausgaben inkl. Sparen</span><strong>' + money0(out) + '</strong></div><div><span>Bleibt aktuell</span><strong class="' + (left < 0 ? 'badtxt' : 'pos') + '">' + money0(left) + '</strong></div></div>' +
      '<p class="note" style="margin:8px 0 0">Laut Plan verplant: ' + money0(planSum) + ' · Puffer ' + money0(pi - planSum) + '</p></section>';
  } else if (planSum) h += '<p class="note" style="text-align:center"><button class="linkbtn" data-act="plan-edit">Geplantes Einkommen festlegen</button></p>';
  return h;
}
/* ---------- Sparziele ---------- */
const MON = new Intl.DateTimeFormat('de-AT', {month:'short', year:'numeric'});
function goalStatus(g){
  const cd = g.cardId && cardById(g.cardId), bal = cd ? cardBalance(cd) : null;
  const contrib = allEntries().filter(e => (e.type === 'expense' || isWithdrawal(e)) && g.catId && e.catId === g.catId && (!g.startDate || e.date > g.startDate));
  const cur = bal != null ? bal : (g.start || 0) + contrib.reduce((a, e) => a + (e.type === 'income' ? -e.amount : e.amount), 0);
  const curK = mkey(today()); let avg = 0;
  if (g.catId) { let t = 0; for (let i = 1; i <= 3; i++) { const k = addMonths(curK, -i); t += allEntries().filter(e => (e.type === 'expense' || isWithdrawal(e)) && e.catId === g.catId && e.date.startsWith(k)).reduce((a, e) => a + (e.type === 'income' ? -e.amount : e.amount), 0); } avg = Math.round(t / 3); }
  const rate = (g.catId && S.profile.budgets[g.catId]) || avg, left = Math.max(0, g.target - cur);
  const months = left === 0 ? 0 : rate > 0 ? Math.ceil(left / rate) : null;
  const eta = months == null ? null : addMonths(curK, months);
  let need = null; if (g.due && left > 0) { const [y, m] = g.due.split('-').map(Number), [cy, cm] = curK.split('-').map(Number); const n = (y - cy) * 12 + (m - cm); need = n > 0 ? Math.ceil(left / n) : left; }
  return {cur, left, rate, months, eta, need, pct:g.target ? Math.min(100, cur / g.target * 100) : 0, src:bal != null ? 'Kontostand ' + cd.name : 'Einzahlungen'};
}
function goalRow(g){
  const st = goalStatus(g), late = g.due && st.eta && st.eta > g.due;
  const sub = st.left === 0 ? 'Ziel erreicht' : st.eta ? 'bei ' + money0(st.rate) + '/Monat ca. ' + MON.format(parseISO(st.eta + '-01')) : 'noch keine monatliche Rate';
  return '<button class="brow" data-act="goal-edit" data-id="' + esc(g.id) + '"><span class="brow-top"><span class="badge" style="--c:var(--c17)">' + ICON.target + '</span><span class="row-main"><span class="row-title">' + esc(g.name) + '</span><span class="row-sub">' + esc(sub) + '</span></span><span class="chip ' + (st.left === 0 ? 'ok' : late ? 'warn' : 'info') + '">' + Math.round(st.pct) + ' %</span></span>' +
    '<span class="bar ' + (late ? 'warn' : 'sav') + '"><i style="width:' + st.pct + '%"></i></span>' +
    '<span class="brow-nums"><span><b>' + money0(st.cur) + '</b> von ' + money0(g.target) + '</span><span>' + (g.due && st.need ? 'für ' + MON.format(parseISO(g.due + '-01')) + ': ' + money0(st.need) + '/Monat' : 'noch ' + money0(st.left)) + '</span></span></button>';
}
function goalsSection(){
  const gs = S.profile.goals || [];
  return '<section class="block"><div class="block-head"><h2>Sparziele</h2><button class="linkbtn" data-act="goal-add">+ Ziel</button></div>' + (gs.length ? '<div class="list">' + gs.map(goalRow).join('') + '</div>' : '<p class="note" style="margin:0">Lege ein Ziel an, z. B. Rücklage 15.000 €. Die App zeigt Fortschritt und wann du es erreichst.</p>') + '</section>';
}
function openGoal(id){
  const g = (S.profile.goals || []).find(x => x.id === id) || {id:'', name:'', target:0, catId:(cats().find(c => c.id === 'ruecklage') || cats().find(c => c.saving && /r[uü]cklage|spar/i.test(c.name)) || cats().find(c => c.saving) || {}).id || '', cardId:'', start:0, startDate:today(), due:''};
  const savCats = cats().filter(c => c.kind === 'expense'), sv = c => c.saving ? 0 : 1;
  openSheet(id ? 'Sparziel bearbeiten' : 'Neues Sparziel',
    '<form id="gForm" style="display:flex;flex-direction:column;gap:14px" novalidate>' +
    '<label class="field"><span>Name</span><input class="input" id="g-name" value="' + esc(g.name) + '" placeholder="z. B. Rücklage" maxlength="40"></label>' +
    '<label class="field"><span>Zielbetrag</span><span class="amount-wrap"><b>€</b><input class="input amount" id="g-target" inputmode="decimal" value="' + (g.target ? esc((g.target / 100).toFixed(2).replace('.', ',')) : '') + '" placeholder="15.000"></span></label>' +
    '<label class="field"><span>Ziel erreichen bis (optional)</span><input class="input" type="month" id="g-due" value="' + esc(g.due || '') + '"></label>' +
    '<label class="field"><span>Einzahlungen kommen aus Kategorie</span><select class="input" id="g-cat"><option value="">–</option>' + savCats.slice().sort((a, b) => sv(a) - sv(b)).map(c => '<option value="' + esc(c.id) + '"' + (c.id === g.catId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span>Oder Stand eines Kontos verwenden (optional)</span><select class="input" id="g-card"><option value="">– kein Konto –</option>' + S.profile.cards.map(c => '<option value="' + esc(c.id) + '"' + (c.id === g.cardId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>' +
    '<div class="formgrid"><label class="field"><span>Bereits angespart</span><input class="input" id="g-start" inputmode="decimal" value="' + (g.start ? esc((g.start / 100).toFixed(2).replace('.', ',')) : '') + '" placeholder="0,00"></label><label class="field"><span>Stand vom</span><input class="input" type="date" id="g-sdate" value="' + esc(g.startDate || today()) + '"></label></div>' +
    '<p class="note" style="margin:0">Mit Konto zählt dessen aktueller Stand, z. B. dein Tagesgeld. Ohne Konto: bereits angespart plus alle Buchungen der Kategorie danach. Die Monatsrate ist das Budget der Kategorie oder der Schnitt der letzten 3 Monate.</p>' +
    '<p class="err" id="g-err" hidden></p><div class="btnrow"><button class="btn primary" type="submit" style="flex:1">Speichern</button>' + (id ? '<button class="btn danger" type="button" id="g-del">Löschen</button>' : '') + '</div></form>',
    root => {
      $('#gForm', root).onsubmit = async ev => {
        ev.preventDefault();
        const name = $('#g-name', root).value.trim(), target = toCents($('#g-target', root).value), start = toCents($('#g-start', root).value || '0');
        const err = m => { const e = $('#g-err', root); e.textContent = m; e.hidden = false; };
        if (!name) return err('Bitte einen Namen eingeben.'); if (!target || target <= 0) return err('Bitte einen Zielbetrag eingeben.');
        const p = clean(S.profile); p.goals = p.goals || [];
        const n = {id:id || newId(), name, target, due:$('#g-due', root).value || '', catId:$('#g-cat', root).value, cardId:$('#g-card', root).value, start:start || 0, startDate:$('#g-sdate', root).value || today()};
        const i = p.goals.findIndex(x => x.id === n.id); if (i >= 0) p.goals[i] = n; else p.goals.push(n);
        await saveProfile(p); closeSheet(); toast('Sparziel gespeichert');
      };
      const d = $('#g-del', root); if (d) d.onclick = async () => { if (!d.dataset.sure) { d.dataset.sure = 1; d.textContent = 'Sicher?'; return; } const p = clean(S.profile); p.goals = (p.goals || []).filter(x => x.id !== id); await saveProfile(p); closeSheet(); toast('Sparziel gelöscht'); };
    });
}
function viewBudgets(){
  const k = S.month, list = entriesIn(k), spent = spentByCat(list), pace = paceOf(k), tb = totalBudget();
  let h = monthBar(monthLabel(k), 'month') + '<div style="display:flex;flex-direction:column;gap:18px">';
  const bs = budgetSpent(list), st = tb ? budgetState(bs, tb, pace) : null, left = tb - bs, hasSav = cats().some(c => c.saving);
  h += '<section class="hero flat"><div class="hero-top"><div><div class="eyebrow">' + (!tb ? 'Ausgaben' : left >= 0 ? 'Noch verfügbar' : 'Über dem Budget') + '</div><div class="big' + (tb && left < 0 ? ' badtxt' : '') + '">' + (tb ? money0(Math.abs(left)) : money0(bs)) + '</div><div class="note">' + (tb ? money(bs) + ' von ' + money0(tb) + ' ausgegeben' + (hasSav ? ', ohne Sparen' : '') : 'Noch kein Gesamtbudget') + '</div></div>' + (tb ? budgetRing(bs, tb, k === mkey(today()) ? pace : null, st) : '') + '</div>';
  h += '<div><button class="linkbtn" data-act="budget-edit" data-cat="__total">' + (S.profile.totalBudget ? 'Gesamtbudget ändern' : 'Eigenes Gesamtbudget festlegen') + '</button></div>';
  h += '</section>';
  if (cats().some(c => c.kind === 'expense' && c.group)) return h + goalsSection() + groupedBudgets(list, spent, pace) + '</div>';
  h += goalsSection();
  const withB = [], without = [];
  for (const c of cats().filter(c => c.kind === 'expense')) {
    const b = S.profile.budgets[c.id];
    if (b) withB.push({c, spent:spent[c.id] || 0, budget:b, st:catState(c, spent[c.id] || 0, b, pace), ratio:(spent[c.id] || 0) / b});
    else without.push({c, spent:spent[c.id] || 0});
  }
  withB.sort((a, b) => b.ratio - a.ratio);
  const over = withB.filter(r => r.st === 'bad').length;
  h += '<section class="block"><div class="block-head"><h2>Kategorien mit Budget</h2><span class="note">' + (over ? over + ' überschritten' : withB.length ? 'keine überschritten' : '') + '</span></div>';
  h += withB.length ? '<div class="list">' + withB.map(budgetRow).join('') + '</div>' : '<div class="list"><div class="empty"><strong>Noch kein Budget</strong><span>Tippe unten auf eine Kategorie und gib ein Monatslimit ein.</span></div></div>';
  h += '</section>';
  if (without.length) {
    h += '<section class="block"><div class="block-head"><h2>Ohne Budget</h2></div><div class="list">' + without.sort((a, b) => b.spent - a.spent).map(r => '<button class="row" data-act="budget-edit" data-cat="' + esc(r.c.id) + '">' + badge(r.c) + '<span class="row-main"><span class="row-title">' + esc(r.c.name) + '</span><span class="row-sub">Budget festlegen</span></span><span class="row-amt">' + money(r.spent) + '</span></button>').join('') + '</div></section>';
  }
  return h + '</div>';
}

function viewCards(){
  const k = S.month, list = entriesIn(k);
  let h = '<div class="monthbar"><h1>Karten</h1><button class="btn small" data-act="card-add">' + ICON.plus + 'Karte</button></div><div style="display:flex;flex-direction:column;gap:12px">';
  if (!S.profile.cards.length) return h + '<div class="list"><div class="empty"><strong>Noch keine Karten</strong><span>Lege Debitkarte, Kreditkarten, Konto oder Bargeld an. Die letzten vier Ziffern helfen beim Zuordnen gescannter Belege.</span><button class="btn small primary" data-act="card-add">Erste Karte anlegen</button></div></div></div>';
  for (const cd of activeCards()) {
    const mine = list.filter(e => e.cardId === cd.id || e.toCardId === cd.id), s = sums(mine.filter(e => e.cardId === cd.id));
    const paidIn = cd.kind === 'credit' ? mine.filter(e => e.type === 'transfer' && e.toCardId === cd.id).reduce((a, e) => a + e.amount, 0) : 0;
    const facts = ['<div><span>Ausgaben ' + esc(monthLabel(k).split(' ')[0]) + '</span><strong>' + money(s.exp) + '</strong></div>', '<div><span>Buchungen</span><strong>' + mine.length + '</strong></div>'];
    if (cd.kind === 'credit' && cd.closingDay) {
      const p = billingPeriod(cd), sp = sums(allEntries().filter(e => e.cardId === cd.id && e.date >= p.from && e.date <= p.to)).exp;
      facts.push('<div><span>Abrechnung ' + esc(DAY.format(parseISO(p.from)).replace(/^\S+\s/, '')) + ' – ' + esc(DAY.format(parseISO(p.to)).replace(/^\S+\s/, '')) + '</span><strong>' + money(sp) + '</strong></div>');
      if (paidIn) facts.push('<div><span>Beglichen ' + esc(monthLabel(k)) + '</span><strong class="pos">' + money(paidIn) + '</strong></div>');
      facts.push('<div><span>Nächste Abrechnung</span><strong>' + esc(DAYL.format(parseISO(p.to))) + '</strong></div>');
    }
    const st = cardStatus(cd);
    h += '<article class="cardtile"><div class="cardtile-head"><i class="cardglyph" style="--c:var(--c' + (cd.color % 20) + ')"></i><div class="row-main"><span class="row-title">' + esc(cd.name) + (cd.example ? ' <span class="chip info">Beispiel</span>' : '') + '</span><span class="row-sub">' + esc(KIND[cd.kind] || '') + (cd.last4 ? ' · •••• ' + esc(cd.last4) : '') + '</span></div>' + (st.known ? '<div style="text-align:right;margin-left:auto"><div class="note">' + st.label + '</div><strong class="num' + (st.bad ? ' badtxt' : '') + '" style="font-size:22px;font-family:var(--f-display)">' + money(st.v) + '</strong></div>' : '<button class="linkbtn" style="margin-left:auto;white-space:nowrap;font-size:13.5px" data-act="card-edit" data-id="' + esc(cd.id) + '">Stand eintragen</button>') + '</div><div class="facts">' + facts.join('') + '</div><div class="btnrow"><button class="btn small" data-act="card-entries" data-id="' + esc(cd.id) + '">Einträge</button>' + (st.known ? '<button class="btn small" data-act="card-rec" data-id="' + esc(cd.id) + '">Abgleichen</button>' : '') + '<button class="btn small" data-act="card-edit" data-id="' + esc(cd.id) + '">Bearbeiten</button></div>' + (cd.reconciled ? '<p class="note" style="margin:-4px 0 0">Abgeglichen am ' + esc(DAYL.format(parseISO(cd.reconciled))) + '</p>' : '') + '</article>';
  }
  h += inactiveLine();
  return h + '</div>';
}

function inactiveLine(){
  const ina = S.profile.cards.filter(isInactive); if (!ina.length) return '';
  return '<p class="note" style="margin:8px 2px 0">Inaktiv: ' + ina.map(c => '<button class="linkbtn" style="font-size:inherit;color:inherit;text-decoration:underline;padding:0" data-act="card-edit" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button> (bis ' + esc(DAYL.format(parseISO(c.activeUntil))) + ')').join(', ') + '</p>';
}
function niceMax(v){ if (v <= 0) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }
function curveSection(){
  const k = S.month, prev = addMonths(k, -1), n = dim(k), isCur = k === mkey(today());
  const upto = isCur ? parseISO(today()).getDate() : (k < mkey(today()) ? n : 0);
  const cum = key => { const len = dim(key), d = new Array(len + 1).fill(0); for (const e of entriesIn(key)) if (e.type === 'expense' && !isSaving(e.catId)) d[parseISO(e.date).getDate()] += e.amount; for (let i = 1; i <= len; i++) d[i] += d[i - 1]; return d; };
  const a = cum(k), b = cum(prev), tb = totalBudget();
  if (!a[n] && !b[b.length - 1]) return '';
  const max = niceMax(Math.max(a[upto] || 0, b[b.length - 1] || 0, tb || 0) / 100) * 100;
  const W = 340, H = 190, L = 46, R = 12, T = 12, B = 24;
  const x = d => L + (W - L - R) * (d / n), y = v => T + (H - T - B) * (1 - v / max);
  const path = (arr, last) => { let p = ''; for (let d = 0; d <= last; d++) p += (d ? 'L' : 'M') + x(Math.min(d, n)).toFixed(1) + ' ' + y(arr[d]).toFixed(1); return p; };
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Kumulierte Ausgaben im Monatsverlauf">';
  for (let i = 0; i <= 4; i++) { const v = max * i / 4, yy = y(v); svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--line)"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + esc(money0(v).replace('€', '').trim()) + '</text>'; }
  for (const d of [1, 10, 20, n]) svg += '<text x="' + x(d) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + d + '.</text>';
  if (tb) svg += '<line x1="' + x(0) + '" y1="' + y(0) + '" x2="' + x(n) + '" y2="' + y(tb) + '" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="2 4"/>';
  svg += '<path d="' + path(b, b.length - 1) + '" fill="none" stroke="var(--muted)" stroke-width="1.8" stroke-dasharray="5 4"/>';
  if (upto) {
    svg += '<path d="' + path(a, upto) + 'L' + x(upto).toFixed(1) + ' ' + y(0) + 'L' + x(0) + ' ' + y(0) + 'Z" fill="var(--accent-soft)" opacity=".7"/>';
    svg += '<path d="' + path(a, upto) + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>';
    svg += '<circle cx="' + x(upto) + '" cy="' + y(a[upto]) + '" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>';
  }
  svg += '</svg>';
  const pd = Math.min(upto, b.length - 1), diff = (a[upto] || 0) - (b[pd] || 0);
  const txt = upto && b[b.length - 1] ? 'Am ' + upto + '. ' + (diff > 0 ? '<b class="badtxt">' + money(diff) + ' mehr</b>' : '<b class="pos">' + money(-diff) + ' weniger</b>') + ' als im Vormonat zum selben Tag.' : '';
  return '<section class="block"><div class="block-head"><h2>Verlauf im Monat</h2></div><div class="chartbox">' + svg + '<div class="legend"><span><i class="dot" style="--c:var(--accent)"></i>' + esc(MONTH.format(parseISO(k + '-01')).split(' ')[0]) + '</span><span><i class="dot" style="--c:var(--muted)"></i>Vormonat</span>' + (tb ? '<span><i class="dot" style="--c:var(--warn)"></i>Budget-Soll</span>' : '') + '</div>' + (txt ? '<p class="note" style="margin:8px 0 0">' + txt + '</p>' : '') + '</div></section>';
}
/* Rabatte: Rabattzeilen der Bons (neu: kind=discount, ältere Bons: negative Zeile ohne Pfand) */
const isDiscount = it => it.k ? it.k === 'discount' : (it.t < 0 && it.g !== 'Pfand');
const isGoods = it => !isDiscount(it) && it.k !== 'deposit' && it.g !== 'Pfand';
const entryDiscount = e => (e.items || []).filter(isDiscount).reduce((a, it) => a - it.t, 0) || e.savings || 0;
function personsSection(list){
  if (!persons().length) return '';
  const ex = {}, inc = {}, cat = {};
  for (const e of list) { if (e.type === 'transfer') continue; const sh = personShares(e);
    for (const [id, v] of Object.entries(sh)) { if (isWithdrawal(e)) continue; if (e.type === 'income') inc[id] = (inc[id] || 0) + v; else if (!isSaving(e.catId)) { ex[id] = (ex[id] || 0) + v; const c = cat[id] = cat[id] || {}; c[e.catId] = (c[e.catId] || 0) + v; } } }
  const ids = persons().map(p => p.id).concat(ex[''] || inc[''] ? [''] : []).filter(id => ex[id] || inc[id]);
  if (!ids.length) return '';
  const max = Math.max(1, ...ids.map(id => ex[id] || 0));
  return '<section class="block"><div class="block-head"><h2>Nach Person</h2></div><div class="list">' + ids.map(id => { const p = personById(id), top = Object.entries(cat[id] || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => catById(c).name).join(', ');
    return '<button class="brow" data-act="pers-filter" data-id="' + esc(id || '__none') + '"><span class="brow-top"><span class="badge" style="--c:var(--c' + (p ? p.color % 20 : 7) + ')"><b style="font-size:13px">' + esc((p ? p.name : '?').slice(0, 1).toUpperCase()) + '</b></span><span class="row-main"><span class="row-title">' + esc(p ? p.name : 'Ohne Person') + '</span><span class="row-sub">' + esc(top || '–') + '</span></span><span class="row-amt">' + money(ex[id] || 0) + (inc[id] ? '<small class="pos">+ ' + money(inc[id]) + '</small>' : '') + '</span></span>' +
      '<span class="bar ok"><i style="width:' + ((ex[id] || 0) / max * 100) + '%;background:var(--c' + (p ? p.color % 20 : 7) + ')"></i></span></button>'; }).join('') + '</div><p class="note" style="margin:6px 2px 0">Bei mehreren Personen wird der Betrag gleichmäßig aufgeteilt. Antippen zeigt die Einträge.</p></section>';
}
function discountsSection(list){
  const bons = list.filter(e => e.type === 'expense' && e.items && e.items.length);
  if (!bons.length) return '';
  let tot = 0, nB = 0, paid = 0; const byM = {}, lines = {};
  for (const e of bons) {
    const d = entryDiscount(e); paid += e.amount; if (!d) continue;
    tot += d; nB++; const m = e.merchant || 'Unbekannt'; byM[m] = (byM[m] || 0) + d;
    for (const it of e.items) if (isDiscount(it)) { const k = it.n; const a = lines[k] = lines[k] || {n:0, t:0, m}; a.n++; a.t -= it.t; }
  }
  let h = '<section class="block"><div class="block-head"><h2>Rabatte</h2></div>';
  if (!tot) return h + '<div class="list"><div class="empty">Auf ' + bons.length + (bons.length === 1 ? ' Bon' : ' Bons') + ' in diesem Zeitraum kein Rabatt.</div></div></section>';
  const quote = Math.round(tot / (paid + tot) * 100);
  h += '<div class="panel" style="flex-direction:row;align-items:center;justify-content:space-between;gap:12px"><div><div class="note">Gespart durch Rabatte</div><div class="note">auf ' + nB + ' von ' + bons.length + ' Bons · ' + quote + ' % vom Normalpreis</div></div><strong class="num pos" style="font-size:24px;font-family:var(--f-display)">' + money(tot) + '</strong></div>';
  const ms = Object.entries(byM).sort((a, b) => b[1] - a[1]);
  if (ms.length > 1) h += '<div class="list">' + ms.slice(0, 6).map(([m, v]) => '<div class="row"><span class="row-main"><span class="row-title">' + esc(m) + '</span></span><span class="row-amt pos">' + money(v) + '</span></div>').join('') + '</div>';
  const top = Object.entries(lines).sort((a, b) => b[1].t - a[1].t).slice(0, 5);
  h += '<p class="note" style="margin:8px 2px 4px">Größte Rabatte</p><div class="list">' + top.map(([k, a]) => '<div class="row"><span class="row-main"><span class="row-title">' + esc(k) + '</span><span class="row-sub">' + esc(a.m) + (a.n > 1 ? ' · ' + a.n + '×' : '') + '</span></span><span class="row-amt pos">' + money(a.t) + '</span></div>').join('') + '</div>';
  return h + '</section>';
}
function itemsSection(list){
  const rows = [];
  for (const e of list) if (e.items) for (const it of e.items) if (isGoods(it)) rows.push(Object.assign({date:e.date, merchant:e.merchant || ''}, it));
  let h = '<section class="block"><div class="block-head"><h2>Was ich kaufe</h2></div>';
  if (allEntries().some(e => e.items && e.items.length)) h += '<input class="input" id="itemSearch" type="search" placeholder="Artikel suchen, z. B. Wasser" autocomplete="off" autocapitalize="off" value="' + esc(S.itemQ || '') + '"><div id="itemResults">' + itemSearchHTML(S.itemQ || '') + '</div>';
  if (!rows.length) return h + '<p class="note" style="margin:0">Scanne Kassenbons, dann siehst du hier deine meistgekauften Artikel und wie sich ihre Preise entwickeln.</p></section>';
  const ms = {}; for (const r of rows) if (r.merchant) ms[r.merchant] = (ms[r.merchant] || 0) + r.t;
  const topM = Object.keys(ms).sort((a, b) => ms[b] - ms[a]).slice(0, 6);
  if (S.itemMerchant && !topM.includes(S.itemMerchant)) S.itemMerchant = '';
  h += '<div class="chips">' + ['', ...topM].map(m => '<button type="button" class="qchip" data-itemm="' + esc(m) + '" aria-pressed="' + ((S.itemMerchant || '') === m) + '">' + esc(m || 'Alle Händler') + '</button>').join('') + '</div>';
  const f = rows.filter(r => !S.itemMerchant || r.merchant === S.itemMerchant);
  const agg = {}; for (const r of f) { if (r.g === 'Pfand') continue; const k = r.n.toLowerCase(); const a = agg[k] = agg[k] || {name:r.n, g:r.g, n:0, q:0, t:0}; a.n++; a.q += r.q; a.t += r.t; }
  const top = Object.entries(agg).sort((a, b) => b[1].t - a[1].t).slice(0, 8);
  h += '<div class="list">' + top.map(([k, a]) => '<button class="row itemrow" data-act="item-hist" data-key="' + esc(k) + '"><span class="row-main"><span class="row-title">' + esc(a.name) + '</span><span class="row-sub"><b>' + a.n + '×</b> gekauft · ' + esc(a.g) + '</span></span><span class="row-amt">' + money(a.t) + '</span></button>').join('') + '</div>';
  const gs = {}; for (const r of f) if (r.g !== 'Pfand') gs[r.g] = (gs[r.g] || 0) + r.t;
  const gr = Object.entries(gs).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (gr.length > 1) h += '<div class="hbars">' + gr.map(([g, v], i) => '<div class="hbar" style="--c:var(--c' + (ITEM_GROUPS.indexOf(g) % 20) + ')"><span class="lab"><i class="dot"></i><span>' + esc(g) + '</span></span><span class="num"><b>' + money(v) + '</b></span><span class="track"><i style="width:' + (v / gr[0][1] * 100) + '%"></i></span></div>').join('') + '</div>';
  return h + '</section>';
}
/* Suche über alle Bons aller Monate */
function itemSearchHTML(q){
  q = q.trim().toLowerCase(); if (q.length < 2) return '';
  const agg = {};
  for (const e of allEntries()) if (e.items) for (const it of e.items) {
    if (!it.n || !isGoods(it)) continue; const k = it.n.toLowerCase(); if (!k.includes(q) && !(it.g || '').toLowerCase().includes(q)) continue;
    const a = agg[k] = agg[k] || {name:it.n, n:0, t:0, last:null, m:{}};
    const unit = Math.round(it.t / (it.q || 1)); a.n++; a.t += it.t;
    if (!a.last || e.date >= a.last.date) a.last = {date:e.date, unit};
    const mm = e.merchant || 'Unbekannt'; if (!a.m[mm] || e.date >= a.m[mm].date) a.m[mm] = {date:e.date, unit};
  }
  const res = Object.entries(agg).sort((x, y) => y[1].n - x[1].n).slice(0, 12);
  if (!res.length) return '<p class="note" style="margin:6px 2px 0">Nichts gefunden.</p>';
  return '<div class="list" style="margin-top:8px">' + res.map(([k, a]) => { const ms = Object.entries(a.m).sort((x, y) => x[1].unit - y[1].unit), cheap = ms.length > 1 ? ms[0] : null;
    return '<button class="row" data-act="item-hist" data-key="' + esc(k) + '"><span class="row-main"><span class="row-title">' + esc(a.name) + '</span><span class="row-sub">' + a.n + '× · ' + money(a.t) + (cheap ? ' · am günstigsten ' + esc(cheap[0]) + ' ' + money(cheap[1].unit) : '') + '</span></span><span class="row-amt">' + money(a.last.unit) + '<small>zuletzt</small></span></button>'; }).join('') + '</div>';
}
document.addEventListener('input', ev => { if (ev.target.id !== 'itemSearch') return; S.itemQ = ev.target.value; const r = $('#itemResults'); if (r) r.innerHTML = itemSearchHTML(S.itemQ); });
function priceSpark(hist){
  if (hist.length < 2) return '';
  const W = 320, H = 70, xs = hist.map(h => parseISO(h.date).getTime()), x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1;
  const vs = hist.map(h => h.unit), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
  const pts = hist.map((h, i) => [(xs[i] - x0) / ((x1 - x0) || 1) * (W - 12) + 6, H - 8 - (h.unit - lo) / sp * (H - 22)]);
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="Preisverlauf"><polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" points="' + pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ') + '"/>' + pts.map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="var(--accent)"/>').join('') + '<text x="6" y="11" font-size="10" fill="var(--muted)">' + esc(money(hi)) + '</text><text x="6" y="' + (H - 0) + '" font-size="10" fill="var(--muted)">' + esc(money(lo)) + '</text></svg>';
}
function priceByMerchant(hist){
  const m = {}; for (const h of hist) { const k = h.merchant || 'Unbekannt'; const a = m[k] = m[k] || {n:0, sum:0, last:h}; a.n++; a.sum += h.unit; if (h.date >= a.last.date) a.last = h; }
  const r = Object.entries(m); if (r.length < 2) return '';
  r.sort((a, b) => a[1].last.unit - b[1].last.unit);
  return '<section class="panel"><h3>Preis je Händler</h3><div class="tablewrap"><table><thead><tr><th>Händler</th><th class="r">zuletzt</th><th class="r">Ø</th></tr></thead><tbody>' + r.map(([k, a], i) => '<tr><td>' + esc(k) + (i === 0 ? ' <span class="chip ok" style="font-size:11px">günstigster</span>' : '') + '</td><td class="r">' + money(a.last.unit) + '</td><td class="r">' + money(Math.round(a.sum / a.n)) + '</td></tr>').join('') + '</tbody></table></div></section>';
}
function openItemHistory(key){
  const hist = [];
  for (const e of allEntries()) if (e.items) for (const it of e.items) if (isGoods(it) && it.n.toLowerCase() === key) hist.push({date:e.date, merchant:e.merchant || '', unit:Math.round(it.t / (it.q || 1)), q:it.q, t:it.t, name:it.n, g:it.g});
  if (!hist.length) return;
  hist.sort((a, b) => a.date.localeCompare(b.date));
  const first = hist[0], last = hist[hist.length - 1], ch = first.unit ? (last.unit - first.unit) / first.unit * 100 : 0;
  const min = Math.min(...hist.map(h => h.unit)), max = Math.max(...hist.map(h => h.unit)), tot = hist.reduce((a, h) => a + h.t, 0);
  openSheet(last.name,
    '<div class="facts"><div><span>Gekauft</span><strong>' + hist.length + '×</strong></div><div><span>Ausgegeben</span><strong>' + money(tot) + '</strong></div><div><span>Stückpreis zuletzt</span><strong>' + money(last.unit) + '</strong></div><div><span>Seit erstem Kauf</span><strong class="' + (ch > 0.5 ? 'badtxt' : ch < -0.5 ? 'pos' : '') + '">' + (hist.length > 1 ? (ch > 0 ? '+' : '') + ch.toFixed(1).replace('.', ',') + ' %' : '–') + '</strong></div></div>' +
    '<p class="note" style="margin:0">Günstigster Stückpreis ' + money(min) + ', teuerster ' + money(max) + '. Warengruppe: ' + esc(last.g) + '.</p>' + priceSpark(hist) + priceByMerchant(hist) +
    '<div class="list">' + hist.slice().reverse().map(h => '<div class="row"><span class="row-main"><span class="row-title">' + esc(h.merchant || 'Unbekannt') + '</span><span class="row-sub">' + esc(DAYL.format(parseISO(h.date))) + (h.q !== 1 ? ' · ' + esc(String(h.q).replace('.', ',')) + ' Stk.' : '') + '</span></span><span class="row-end"><span class="row-amt">' + money(h.unit) + '</span><span class="row-date">pro Stück</span></span></div>').join('') + '</div>');
}
function viewStats(){
  const year = S.statsMode === 'year';
  const label = year ? String(S.statsYear) : monthLabel(S.month);
  const prefix = year ? String(S.statsYear) : S.month;
  const list = entriesIn(prefix), s = sums(list);
  let h = monthBar(label, 'stats-nav');
  h += '<div style="display:flex;flex-direction:column;gap:18px"><div class="seg" role="group" aria-label="Zeitraum"><button data-act="stats-mode" data-mode="month" aria-pressed="' + !year + '">Monat</button><button data-act="stats-mode" data-mode="year" aria-pressed="' + year + '">Jahr</button></div>';
  // comparison
  let cmp = '';
  if (!year) {
    const prev = addMonths(S.month, -1), isCur = S.month === mkey(today());
    const cut = isCur ? parseISO(today()).getDate() : 31;
    const pe = sums(entriesIn(prev).filter(e => parseISO(e.date).getDate() <= cut)).exp;
    if (pe) { const ch = (s.exp - pe) / pe * 100; cmp = '<em class="' + (ch > 2 ? 'badtxt' : ch < -2 ? 'pos' : 'muted') + '">' + (ch > 0 ? '+' : '') + Math.round(ch) + ' % zum Vormonat' + (isCur ? ' (bis zum ' + cut + '.)' : '') + '</em>'; }
  } else {
    const pe = sums(entriesIn(String(S.statsYear - 1))).exp;
    if (pe) { const ch = (s.exp - pe) / pe * 100; cmp = '<em class="' + (ch > 2 ? 'badtxt' : ch < -2 ? 'pos' : 'muted') + '">' + (ch > 0 ? '+' : '') + Math.round(ch) + ' % zu ' + (S.statsYear - 1) + '</em>'; }
  }
  const days = year ? (S.statsYear === new Date().getFullYear() ? Math.ceil((new Date() - new Date(S.statsYear, 0, 1)) / 864e5) : 365) : (S.month === mkey(today()) ? parseISO(today()).getDate() : dim(S.month));
  const biggest = list.filter(e => e.type === 'expense' && !isSaving(e.catId)).sort((a, b) => b.amount - a.amount)[0];
  h += '<section class="hero flat"><div><div class="eyebrow">Ausgaben</div><div class="big">' + money(s.exp) + '</div>' + (cmp ? '<div class="note">' + cmp + '</div>' : '') + '</div>' +
    '<div class="kv"><div><span>Einnahmen</span><strong class="pos">' + money(s.inc) + '</strong></div><div><span>Gespart</span><strong class="' + (s.sav ? 'savtxt' : '') + '">' + money(s.sav) + '</strong></div><div><span>Saldo</span><strong class="' + (s.bal < 0 ? 'badtxt' : '') + '">' + money(s.bal) + '</strong></div></div>' +
    '<p class="note hero-foot">Ø ' + money(Math.round(s.exp / Math.max(1, days))) + ' pro Tag' + (s.inc ? ' · Sparquote ' + Math.round((s.inc - s.exp) / s.inc * 100) + ' %' : '') + (biggest ? ' · größte Ausgabe ' + esc(biggest.merchant || catById(biggest.catId).name) + ' ' + money(biggest.amount) : '') + '</p></section>';
  if (!year) h += curveSection();
  // trend chart
  const keys = [];
  if (year) for (let m = 1; m <= 12; m++) keys.push(S.statsYear + '-' + pad(m));
  else for (let i = 5; i >= 0; i--) keys.push(addMonths(S.month, -i));
  const series = keys.map(kk => sums(entriesIn(kk)));
  const max = niceMax(Math.max(1, ...series.map(x => Math.max(x.inc, x.exp))) / 100) * 100;
  const W = 340, H = 180, L = 46, R = 6, T = 10, B = 24, cw = (W - L - R) / keys.length, bw = Math.min(16, cw * 0.32);
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Einnahmen und Ausgaben je Monat">';
  for (let i = 0; i <= 4; i++) { const v = max * i / 4, y = T + (H - T - B) * (1 - i / 4); svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + esc(money0(v).replace('€', '').trim()) + '</text>'; }
  keys.forEach((kk, i) => {
    const x = L + cw * i + cw / 2, sx = series[i], hy = v => (H - T - B) * (v / max);
    const he = hy(sx.exp), hi = hy(sx.inc), base = H - B;
    const sel = !year && kk === S.month;
    svg += '<rect x="' + (x - bw - 1) + '" y="' + (base - hi) + '" width="' + bw + '" height="' + Math.max(0, hi) + '" rx="3" fill="var(--ok)" opacity="' + (sel || year ? 1 : 0.55) + '"><title>' + esc(monthLabel(kk)) + ' Einnahmen ' + esc(money(sx.inc)) + '</title></rect>';
    svg += '<rect x="' + (x + 1) + '" y="' + (base - he) + '" width="' + bw + '" height="' + Math.max(0, he) + '" rx="3" fill="var(--bad)" opacity="' + (sel || year ? 1 : 0.55) + '"><title>' + esc(monthLabel(kk)) + ' Ausgaben ' + esc(money(sx.exp)) + '</title></rect>';
    svg += '<text x="' + x + '" y="' + (H - 7) + '" text-anchor="middle" font-size="10.5" fill="' + (sel ? 'var(--fg)' : 'var(--muted)') + '" font-weight="' + (sel ? 700 : 500) + '">' + esc(MON_S.format(parseISO(kk + '-01')).replace('.', '')) + '</text>';
  });
  svg += '</svg>';
  h += '<section class="block"><div class="block-head"><h2>' + (year ? 'Monate' : 'Letzte 6 Monate') + '</h2></div><div class="chartbox">' + svg + '<div class="legend"><span><i class="dot" style="--c:var(--ok)"></i>Einnahmen</span><span><i class="dot" style="--c:var(--bad)"></i>Ausgaben</span></div></div></section>';

  h += personsSection(list);
  h += itemsSection(list);
  h += discountsSection(list);
  // categories
  const sc = spentByCat(list);
  const cr = Object.entries(sc).filter(([id]) => !isSaving(id)).sort((a, b) => b[1] - a[1]);
  h += '<section class="block"><div class="block-head"><h2>Kategorien</h2></div>';
  h += cr.length ? '<div class="hbars">' + cr.map(([id, v]) => { const c = catById(id); return '<div class="hbar" style="--c:var(--c' + (c.color % 20) + ')"><span class="lab"><i class="dot"></i><span>' + esc(c.name) + '</span></span><span class="num"><b>' + money(v) + '</b> <span class="muted">' + Math.round(v / s.exp * 100) + ' %</span></span><span class="track"><i style="width:' + (v / cr[0][1] * 100) + '%"></i></span></div>'; }).join('') + '</div>' : '<div class="list"><div class="empty">Keine Ausgaben in diesem Zeitraum.</div></div>';
  h += '</section>';

  // cards
  if (S.profile.cards.length) {
    const rows = S.profile.cards.map(cd => ({cd, v:sums(list.filter(e => e.cardId === cd.id)).exp})).filter(r => r.v).sort((a, b) => b.v - a.v);
    const none = sums(list.filter(e => !e.cardId)).exp;
    if (rows.length || none) {
      const mx = Math.max(none, ...rows.map(r => r.v));
      h += '<section class="block"><div class="block-head"><h2>Nach Karte</h2></div><div class="hbars">' + rows.map(r => '<div class="hbar" style="--c:var(--c' + (r.cd.color % 20) + ')"><span class="lab"><i class="dot"></i><span>' + esc(r.cd.name) + '</span></span><span class="num"><b>' + money(r.v) + '</b></span><span class="track"><i style="width:' + (r.v / mx * 100) + '%"></i></span></div>').join('') + (none ? '<div class="hbar" style="--c:var(--c7)"><span class="lab"><i class="dot"></i><span>Ohne Karte</span></span><span class="num"><b>' + money(none) + '</b></span><span class="track"><i style="width:' + (none / mx * 100) + '%"></i></span></div>' : '') + '</div></section>';
    }
  }
  // merchants
  const mm = {};
  for (const e of list) if (e.type === 'expense' && e.merchant) { const key = e.merchant.trim(); mm[key] = mm[key] || {n:0, v:0}; mm[key].n++; mm[key].v += e.amount; }
  const top = Object.entries(mm).sort((a, b) => b[1].v - a[1].v).slice(0, 6);
  { const y = (year ? String(S.statsYear) : S.month.slice(0, 4)), nt = allEntries().filter(e => e.tax && e.date.startsWith(y)).length, nw = warrantyList().length, chev = '<span class="chev">' + ICON.right + '</span>';
    var tools = '<section class="block"><div class="block-head"><h2>Auswertungen</h2></div><div class="list">' +
      (!year && list.length ? '<button class="row" data-act="review" data-k="' + esc(S.month) + '"><span class="row-main"><span class="row-title">Monatsrückblick ' + esc(monthLabel(S.month).split(' ')[0]) + '</span><span class="row-sub">Plan und Ist, über Budget, wo das Geld hinging</span></span>' + chev + '</button>' : '') +
      '<button class="row" data-act="report"><span class="row-main"><span class="row-title">Bericht als PDF</span><span class="row-sub">Zeitraum, Karten, Kategorien, Personen wählbar</span></span>' + chev + '</button>' +
      '<button class="row" data-act="taxlist" data-y="' + esc(y) + '"><span class="row-main"><span class="row-title">Steuerbelege ' + esc(y) + '</span><span class="row-sub">' + (nt ? nt + (nt === 1 ? ' Beleg' : ' Belege') + ' markiert' : 'Noch keine markiert') + '</span></span>' + chev + '</button>' +
      '<button class="row" data-act="warranties"><span class="row-main"><span class="row-title">Garantien</span><span class="row-sub">' + (nw ? nw + ' laufend' : 'Keine laufenden') + '</span></span>' + chev + '</button></div></section>'; }
  if (top.length) h += '<section class="block"><div class="block-head"><h2>Wo das Geld hingeht</h2></div><div class="list">' + top.map(([m, o]) => '<div class="row"><span class="row-main"><span class="row-title">' + esc(m) + '</span><span class="row-sub">' + o.n + (o.n === 1 ? ' Buchung' : ' Buchungen') + '</span></span><span class="row-amt">' + money(o.v) + '</span></div>').join('') + '</div></section>';
  return h + tools + '</div>';
}
