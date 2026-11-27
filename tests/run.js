#!/usr/bin/env node
/* Ende-zu-Ende-Tests der LAGEkarte (Playwright, headless Chromium).
   Aufruf: npm test   (nutzt src/public/kritis-lage-einzeldatei.html, ohne Netz außer den Kartenkacheln) */
const { chromium } = require('playwright');
const path = require('path'), assert = require('assert');
const FILE = 'file://' + path.resolve(__dirname, '..', 'src', 'public', 'kritis-lage-einzeldatei.html');
const SUBSTANZEN = ['benzol', 'aceton', 'ethanol', 'benzin', 'diesel', 'hcl', 'h2so4', 'propan', 'ammoniak', 'chlor', 'methanol', 'natronlauge', 'hno3', 'h2o2', 'co', 'ammoniumnitrat'];
let ok = 0, fail = 0; const errs = [];
async function t(name, fn) { try { await fn(); ok++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FEHLER ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
async function seite(b, q, w, h) {
  const p = await (await b.newContext({ viewport: { width: w || 1440, height: h || 900 } })).newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(FILE + (q || '')); await p.waitForFunction(() => window.__lage); await p.waitForTimeout(600); return p;
}
(async () => {
  const b = await chromium.launch();
  await t('Start ohne Skriptfehler, Name, keine Funktionswahl', async () => {
    const p = await seite(b, '?rolle=S2'); assert.strictEqual(await p.getAttribute('h1 .logo', 'aria-label'), 'Lagekarte'); assert.ok(await p.locator('h1 .logo svg').isVisible()); assert.strictEqual(await p.locator('link[rel=icon]').count(), 1); assert.strictEqual(await p.locator('#roleChip').count(), 0); await p.close();
  });
  await t('Burger-Menü öffnet und schließt, Lagevortrag und Dunkelmodus liegen in der Kopfzeile', async () => {
    const p = await seite(b, '?rolle=S2'); assert.ok(await p.locator('#btnVortrag').isVisible()); assert.ok(await p.locator('#btnTheme').isVisible());
    await p.click('#btnMore'); await p.waitForTimeout(500); assert.ok(await p.locator('#btnUnits').isVisible()); assert.ok(await p.locator('#btnSync').isVisible()); assert.notStrictEqual(await p.$eval('#btnSync', e => getComputedStyle(e).color), 'rgb(255, 255, 255)', 'Menüschrift ist nicht weiß auf hellem Grund');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500); assert.ok(!(await p.locator('#btnUnits').isVisible())); await p.close();
  });
  await t('Lagevortrag starten und beenden', async () => {
    const p = await seite(b, '?rolle=S2'); await p.click('#btnVortrag'); await p.waitForTimeout(700);
    assert.ok(await p.evaluate(() => document.body.classList.contains('vortrag')));
    await p.click('#vtBurger'); await p.waitForTimeout(500); await p.click('.vtm.end'); await p.waitForTimeout(700);
    assert.ok(!(await p.evaluate(() => document.body.classList.contains('vortrag')))); await p.close();
  });
  await t('Gefahrstoffe: alle ' + SUBSTANZEN.length + ' anlegen, keine Fehlertexte (NaN, undefined)', async () => {
    for (const sid of SUBSTANZEN) {
      const p = await seite(b); await p.evaluate(() => { window.__lage.state.wind = { dir: 157, speed: 3, cond: 'bedeckt', stab: '', terrain: 'stadt', time: new Date().toISOString() }; window.__lage.map.setView([50.929, 6.938], 14, { animate: false }); });
      await p.click('[data-tab="chem"]'); await p.selectOption('#chemSel', sid); await p.click('#chemPlace'); await p.mouse.click(900, 450); await p.waitForTimeout(900);
      assert.strictEqual(await p.locator('.cm-inc').count(), 1, sid + ': kein Vorfall');
      const bad = await p.evaluate(() => (document.body.innerText.match(/NaN|Infinity|undefined|\bnull\b/g) || [])); assert.deepStrictEqual(bad, [], sid + ': ' + bad.join()); await p.close();
    }
  });
  await t('ERG Tabelle 3 (Chlor, Ammoniak): Windklassen, Tag/Nacht, Behälter, Grenzen', async () => {
    const p = await seite(b);
    const r = await p.evaluate(() => { const L = window.__lage, c = L.chemSub('chlor'), n = L.chemSub('ammoniak'), w = sp => { L.state.wind = { dir: 1, speed: sp, time: '' }; };
      const co = L.chemSub('co'); const f = (s, inc, sp) => { w(sp); const e = L.chemErg(s, inc); return [e.isolate, e.spill, e.plus]; };
      return { c1: f(c, { large: true, night: false, cont: 'strasse' }, 2.7), c2: f(c, { large: true, night: false, cont: 'strasse' }, 2.78), c3: f(c, { large: true, night: false, cont: 'strasse' }, 5.56),
        c4: f(c, { large: true, night: true, cont: 'kesselwagen' }, 1), c5: f(c, { large: false, night: true }, 3), n1: f(n, { large: true, night: true, cont: 'kesselwagen' }, 1), n2: f(n, { large: true, night: false, cont: 'flaschen' }, 4), n3: f(n, { large: true, night: false, cont: 'flaschen' }, null), k1: f(co, { large: true, night: false }, 3), k2: f(co, { large: true, night: true }, 3), k3: f(co, { large: false, night: true }, 3) }; });
    assert.deepStrictEqual(r.c1, [600, 5600, false]); assert.deepStrictEqual(r.c2, [600, 3300, false]); assert.deepStrictEqual(r.c3, [600, 2500, false]);
    assert.deepStrictEqual(r.c4, [1000, 11000, true]); assert.deepStrictEqual(r.c5, [60, 1500, false]); assert.deepStrictEqual(r.n1, [300, 4100, false]); assert.deepStrictEqual(r.n2, [30, 200, false]); assert.deepStrictEqual(r.n3, [30, 300, false]); assert.deepStrictEqual(r.k1, [200, 1200, false]); assert.deepStrictEqual(r.k2, [200, 3900, false]); assert.deepStrictEqual(r.k3, [30, 200, false]); await p.close();
  });
  await t('Rechtsklick-Menü: alles vorhanden, keine Funktionswahl', async () => {
    const p = await seite(b, '?rolle=S5', 1300, 800); await p.mouse.click(700, 400, { button: 'right' }); await p.waitForTimeout(500);
    const l = await p.evaluate(() => [...document.querySelectorAll('.ctx-item')].map(x => x.textContent.trim()));
    assert.ok(['Gefahrstoff', 'Einheit hier', 'Problem', 'Behandlungsplatz'].every(k => l.some(x => x.includes(k))), l.join('|')); assert.strictEqual(await p.locator('.rolelay').count(), 0); await p.close();
  });
  await t('Tastenkürzel: G, T, Fragezeichen', async () => {
    const p = await seite(b, '?rolle=S2'); await p.keyboard.press('g'); await p.waitForTimeout(200);
    assert.strictEqual(await p.evaluate(() => document.querySelector('#tabs [aria-selected=true]').dataset.tab), 'chem');
    await p.keyboard.press('t'); await p.waitForTimeout(200); assert.strictEqual(await p.evaluate(() => document.querySelector('#tabs [aria-selected=true]').dataset.tab), 'tagebuch');
    await p.keyboard.press('Shift+?'); await p.waitForTimeout(500); assert.ok((await p.locator('.dlg kbd').count()) > 10); await p.close();
  });
  await t('Einweisung läuft durch und merkt sich das Ende', async () => {
    const p = await seite(b, '?rolle=S2&tour=1'); await p.waitForTimeout(2200); assert.strictEqual(await p.locator('.tour-card').count(), 1);
    for (let i = 0; i < 10; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100); }
    assert.strictEqual(await p.locator('.tour-card').count(), 0); assert.strictEqual(await p.evaluate(() => localStorage.getItem('kritis-tour')), '1'); await p.close();
  });
  await t('Fristen: überfälliges Problem erscheint im Kopf', async () => {
    const p = await seite(b, '?rolle=S2');
    await p.evaluate(() => { window.__lage.state.problems.unshift({ id: 'x1', title: 'Test', text: '', prio: 1, status: 'offen', owner: '', time: new Date().toISOString(), due: new Date(Date.now() - 60000).toISOString() }); });
    await p.waitForTimeout(1500); assert.ok(/überfällig/.test(await p.textContent('#fristChip'))); await p.close();
  });
  await t('Rückgängig und Wiederholen', async () => {
    const p = await seite(b, '?rolle=S2'); const n0 = await p.evaluate(() => window.__lage.state.journal.length);
    await p.evaluate(() => { const L = window.__lage; L.state.problems.push({ id: 'u1', title: 'U', text: '', prio: 2, status: 'offen', owner: '', time: new Date().toISOString() }); L.commit('Test'); });
    const a = await p.evaluate(() => { window.__lage.undo(); return window.__lage.state.problems.some(x => x.id === 'u1'); }); assert.strictEqual(a, false);
    const c = await p.evaluate(() => { window.__lage.redo(); return window.__lage.state.problems.some(x => x.id === 'u1'); }); assert.strictEqual(c, true); await p.close();
  });
  await t('Evakuierung planen: Objekt in der Zone, Stand und Kontakt werden gespeichert', async () => {
    const p = await seite(b, '?rolle=S2'); await p.evaluate(() => { const L = window.__lage; L.state.wind = { dir: 157, speed: 3, cond: 'bedeckt', stab: '', terrain: 'stadt', time: new Date().toISOString() }; L.map.setView([50.929, 6.938], 15, { animate: false }); });
    await p.click('[data-tab="chem"]'); await p.selectOption('#chemSel', 'chlor'); await p.click('#chemPlace'); await p.mouse.click(900, 450); await p.waitForTimeout(900);
    await p.evaluate(() => { const L = window.__lage, i = L.state.chem[0]; L.state.pois.m1 = { id: 'm1', lat: i.lat + 0.0006, lng: i.lng + 0.0002, layer: 'pflege', name: 'Seniorenheim Test', manual: true }; L.state.layerOn.pflege = true; L.runtime.vis.add('m1'); L.renderChem(); });
    await p.waitForTimeout(2500); await p.selectOption('.cm-evac select', 'info'); await p.fill('.cm-evac input', 'Frau Test'); await p.press('.cm-evac input', 'Tab'); await p.waitForTimeout(300);
    assert.deepStrictEqual(await p.evaluate(() => window.__lage.state.chem[0].evac.m1), { st: 'info', ct: 'Frau Test' }); await p.close();
  });
  await t('Wetterlage aus Uhrzeit und Bewölkung vorschlagen', async () => {
    const p = await seite(b, '?rolle=S2'); await p.click('[data-tab="keule"]'); await p.click('#wAuto button:has-text("Bedeckt")'); await p.waitForTimeout(300);
    assert.strictEqual(await p.evaluate(() => window.__lage.state.wind.cond), 'bedeckt'); await p.click('#wAuto button:has-text("Klar")'); await p.waitForTimeout(300);
    assert.ok(/^(tag-stark|tag-mittel|nacht-klar)$/.test(await p.evaluate(() => window.__lage.state.wind.cond))); await p.close();
  });
  await t('Meldungs-Vordruck füllt Zahlen aus der Lage vor', async () => {
    const p = await seite(b, '?rolle=S2'); await p.evaluate(() => document.querySelector('[data-tab="meldungen"]').click()); await p.selectOption('#mTpl', 'lage'); await p.waitForTimeout(300);
    const txt = await p.inputValue('#mText'); assert.ok(/LAGEMELDUNG, Stand/.test(txt) && /SK I 0/.test(txt) && /Kräfte: 0 Einheiten/.test(txt)); assert.strictEqual(await p.inputValue('#mDir'), 'aus');
    await p.selectOption('#mTpl', 'nachf'); assert.strictEqual(await p.inputValue('#mKind'), 'Anfrage'); await p.close();
  });
  await t('Touch: langes Drücken öffnet das Kartenmenü', async () => {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 700 }, hasTouch: true }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(FILE + '?rolle=S2'); await p.waitForFunction(() => window.__lage); await p.waitForTimeout(600);
    const cdp = await ctx.newCDPSession(p); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 850, y: 400 }] }); await p.waitForTimeout(900);
    assert.ok((await p.locator('.ctx-item').count()) > 3); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await ctx.close();
  });
  await t('Karten-Zwischenspeicher: Kachel wird gespeichert und ohne Netz angezeigt', async () => {
    const ctx = await b.newContext({ viewport: { width: 900, height: 600 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'); let online = true;
    await ctx.route(/arcgisonline\.com/, r => online ? r.fulfill({ status: 200, contentType: 'image/png', body: png, headers: { 'access-control-allow-origin': '*' } }) : r.abort());
    await p.goto(FILE + '?rolle=S2'); await p.waitForFunction(() => window.__lage); await p.waitForTimeout(2500);
    const n1 = await p.evaluate(() => window.__lage.TileCache.count()); assert.ok(n1 > 0, 'keine Kacheln gespeichert'); online = false;
    await p.reload(); await p.waitForFunction(() => window.__lage); await p.waitForTimeout(2500);
    const ok = await p.evaluate(() => [...document.querySelectorAll('img.leaflet-tile')].filter(i => i.naturalWidth > 0).length); assert.ok(ok > 0, 'keine Kachel ohne Netz sichtbar'); await ctx.close();
  });
  await t('Behandlungsplatz: anlegen, zählen, Transport, Journal', async () => {
    const p = await seite(b, '?rolle=S2'); await p.keyboard.press('b'); await p.waitForTimeout(300);
    assert.strictEqual(await p.evaluate(() => document.querySelector('#tabs [aria-selected=true]').dataset.tab), 'bhp');
    await p.click('#bhpAdd'); await p.mouse.click(700, 400); await p.waitForTimeout(500);
    assert.strictEqual(await p.evaluate(() => window.__lage.state.bhp.length), 1);
    await p.click('.bhp-row >> nth=0 >> button:has-text("+")'); await p.click('.bhp-row >> nth=0 >> button:has-text("+")'); await p.waitForTimeout(300);
    await p.click('.bhp-row >> nth=0 >> button:has-text("Transport")'); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const x = window.__lage.state.bhp[0]; return [x.w.sk1, x.t.sk1, window.__lage.state.journal.some(j => /abtransportiert/.test(j.text))]; });
    assert.deepStrictEqual(r, [1, 1, true]); assert.ok(/wartend SK I 1/.test(await p.textContent('#bhpSum')));
    await p.click('.bhp-card button:has-text("Klinik hinzufügen")'); await p.waitForTimeout(300); assert.strictEqual(await p.evaluate(() => window.__lage.state.bhp[0].kliniken.length), 1);
    await p.evaluate(() => window.__lage.undo()); await p.waitForTimeout(300); assert.strictEqual(await p.evaluate(() => window.__lage.state.bhp[0].kliniken.length), 0);
    await p.close();
  });
  await t('Behandlungsplatz: Export enthält die Daten', async () => {
    const p = await seite(b, '?rolle=S2'); await p.evaluate(() => { window.__lage.state.bhp.push({ id: 'b1', name: 'BHP Test', lat: 51, lng: 7, leiter: '', funk: '', w: { sk1: 2, sk2: 0, sk3: 0 }, t: { sk1: 0, sk2: 0, sk3: 0 }, kap: { sk1: 0, sk2: 0, sk3: 0 }, rtw: 0, ktw: 0, na: 0, kliniken: [] }); });
    const [d] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => document.querySelector('#btnExport').click())]);
    const j = JSON.parse(require('fs').readFileSync(await d.path(), 'utf8')); assert.strictEqual(j.role, 'S2'); assert.strictEqual(j.data.bhp[0].w.sk1, 2); await p.close();
  });
  await t('Stabswand: Kräfteübersicht, Doppelklick Anfahrt, Ziehen, Überschreiben', async () => {
    const p = await seite(b, '', 1700, 1300); await p.evaluate(() => { const s = window.__lage.state, now = new Date().toISOString();
      s.sections = [{ id: 'ea1', kind: 'poly', typ: 'ea', name: 'EA ICE', color: '#2563eb', pts: [] }, { id: 'ea2', kind: 'poly', typ: 'ea', name: 'EA Zwei', color: '#16a34a', pts: [] }];
      const U = (id, sec, st, f, u, h) => ({ id, name: 'E' + id, call: '', sym: null, f, u, h, status: st, sectionId: sec, task: '', note: '', lat: null, lng: null, time: now });
      s.units = [U('a', 'ea1', 'einsatz', 1, 3, 9), U('b', 'ea1', 'anfahrt', 1, 2, 8), U('c', 'ea2', 'einsatz', 0, 2, 4)]; });
    await p.keyboard.press('u'); await p.waitForTimeout(500); await p.evaluate(() => document.querySelector('#ovStat').dispatchEvent(new Event('change'))); await p.waitForTimeout(400);
    const sums = async () => p.evaluate(() => [...document.querySelectorAll('.kt-t tr.sig td')].map(x => +x.textContent));
    assert.deepStrictEqual(await sums(), [11, 19, 0]);
    await p.dblclick('.wt[data-uid="a"]'); await p.waitForTimeout(500);
    assert.deepStrictEqual(await sums(), [24, 6, 0]); assert.ok(await p.locator('.wt.anf[data-uid="a"]').count()); assert.ok(!(await p.locator('.dlg').count()), 'Karteikarte darf nicht aufgehen');
    await p.dblclick('.wt[data-uid="a"]'); await p.waitForTimeout(500); assert.deepStrictEqual(await sums(), [11, 19, 0]);
    const from = await p.locator('.wt[data-uid="c"]').boundingBox(), to = await p.locator('.wblock[data-drop="sec:ea1"]').boundingBox();
    await p.mouse.move(from.x + 30, from.y + 30); await p.mouse.down(); await p.mouse.move(from.x + 60, from.y + 10, { steps: 4 }); await p.mouse.move(to.x + 60, to.y + 40, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(500);
    assert.strictEqual(await p.evaluate(() => window.__lage.state.units.find(u => u.id === 'c').sectionId), 'ea1');
    await p.fill('.kt-t tbody tr:first-child td:nth-child(3) input', '99'); await p.press('.kt-t tbody tr:first-child td:nth-child(3) input', 'Tab'); await p.waitForTimeout(400);
    assert.ok((await sums())[1] >= 99); await p.close();
  });
  await t('Stabswand: Aufträge (Haken, Tagebuch, Frist), NFPA-Raute, Betroffenentabelle', async () => {
    const p = await seite(b, '', 1700, 1300); await p.evaluate(() => { const L = window.__lage; L.state.wind = { dir: 157, speed: 3, cond: 'bedeckt', stab: '', terrain: 'stadt', time: new Date().toISOString() }; L.map.setView([50.929, 6.938], 15, { animate: false }); });
    await p.click('[data-tab="chem"]'); await p.selectOption('#chemSel', 'benzol'); await p.click('#chemPlace'); await p.mouse.click(900, 450); await p.waitForTimeout(800);
    await p.evaluate(() => { const L = window.__lage; L.state.casualties.push({ id: 'c1', cat: 'sk1', n: 4, note: '', time: new Date().toISOString() }); });
    await p.keyboard.press('Escape'); await p.keyboard.press('u'); await p.waitForTimeout(500); await p.evaluate(() => document.querySelector('#ovStat').dispatchEvent(new Event('change'))); await p.waitForTimeout(400);
    const nf = await p.evaluate(() => [...document.querySelectorAll('.nfpa svg text')].map(t => [t.getAttribute('x'), t.textContent]));
    assert.deepStrictEqual(nf.slice(0, 3), [['60', '3'], ['30', '2'], ['90', '0']], JSON.stringify(nf));
    await p.click('.wcol:has(.auf-list) button:has-text("+ Auftrag")'); await p.waitForTimeout(300);
    await p.fill('.auf .auf-t', 'Benzol: Auswirkungen'); await p.press('.auf .auf-t', 'Tab'); await p.fill('.auf input[type=time]', '23:59'); await p.press('.auf input[type=time]', 'Tab'); await p.waitForTimeout(300);
    assert.ok(/Auftrag: Benzol/.test(await p.evaluate(() => document.querySelector('#fristChip').title)), 'Frist fehlt');
    await p.click('.auf input[type=checkbox]'); await p.waitForTimeout(300);
    assert.ok(await p.evaluate(() => window.__lage.state.journal.some(j => /Auftrag erledigt: Benzol/.test(j.text)))); assert.ok(await p.evaluate(() => document.querySelector('#fristChip').hidden));
    await p.click('.wcol:has(.vt) button:has-text("Stand festhalten")'); await p.waitForTimeout(300);
    assert.strictEqual(await p.evaluate(() => window.__lage.state.kraefte.rows[0].sk1), 4); await p.close();
  });
  await t('Führungsstruktur: Funkgruppe auf der Linie, Ziehen, Einheiten ausblenden; Navigation', async () => {
    const p = await seite(b, '', 1600, 950); await p.evaluate(() => { const s = window.__lage.state, now = new Date().toISOString();
      s.sections = [{ id: 'ea1', kind: 'poly', typ: 'ea', name: 'EA Nord', color: '#2563eb', pts: [] }, { id: 'ea2', kind: 'poly', typ: 'ea', name: 'EA Süd', color: '#16a34a', pts: [] }];
      s.units = [{ id: 'a', name: 'LF 1', call: '', sym: null, f: 1, u: 3, h: 9, status: 'einsatz', sectionId: 'ea1', task: '', note: '', lat: null, lng: null, time: now }]; });
    const nav = await p.$$eval('#tabs button', x => x.filter(e => e.offsetParent).map(e => e.textContent.trim()));
    assert.deepStrictEqual(nav.slice(0, 5), ['Lagekarte', 'Einsatzraum', 'Kräfte', 'Führungsstruktur', 'Einsatztagebuch']); assert.ok(nav.includes('KRITIS') && !nav.includes('Meldungen') && !nav.includes('Probleme') && !nav.includes('Lagestände') && !nav.includes('Einheiten (Liste)'));
    await p.keyboard.press('f'); await p.waitForTimeout(500);
    await p.click('.fsec[data-sid="ea1"]'.replace('.fsec[data-sid="ea1"]', '.fea:first-child .flab')); await p.fill('.dlg input', 'Kanal 12'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    assert.strictEqual(await p.evaluate(() => window.__lage.state.sections[0].radio), 'Kanal 12');
    await p.click('.fsec[data-sid="ea1"] .fold'); await p.waitForTimeout(200); assert.strictEqual(await p.locator('.fsec[data-sid="ea1"] .fu').count(), 0);
    const g = await p.locator('.ftag[data-grip="ea2"]').boundingBox(), r = await p.locator('.fsec[data-sid="ea1"]').boundingBox();
    await p.mouse.move(g.x + 8, g.y + 8); await p.mouse.down(); await p.mouse.move(g.x - 30, g.y, { steps: 3 }); await p.mouse.move(r.x + 6, r.y + 60, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(400);
    assert.deepStrictEqual(await p.evaluate(() => window.__lage.state.sections.map(s => s.name)), ['EA Süd', 'EA Nord']);
    await p.click('.ftr .flab'); await p.fill('.dlg input', 'Kanal 1'); await p.keyboard.press('Enter'); await p.waitForTimeout(300); assert.strictEqual(await p.evaluate(() => window.__lage.state.fue.lines.ls), 'Kanal 1');
    const pl = await p.evaluate(() => { window.__lage.state.sections[1].pts = [[51.5, 7.4], [51.5, 7.5], [51.45, 7.5]]; const u = window.__lage.addUnit({ name: 'Neu', sectionId: 'ea1', f: 0, u: 1, h: 1 }); return [u.lat, u.lng]; });
    assert.ok(pl[0] > 51.4 && pl[0] < 51.6 && pl[1] > 7.3 && pl[1] < 7.6, 'Einheit liegt im Abschnitt'); await p.close();
  });
  await t('Adresssuche unter Gebiete: Vorschläge, Anfliegen, Markierung', async () => {
    const p = await seite(b, ''); await p.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ lat: '51.5136', lon: '7.4653', display_name: 'Hansastraße 5, Dortmund, Nordrhein-Westfalen, Deutschland', boundingbox: ['51.5130', '51.5140', '7.4648', '7.4658'] }]) }));
    await p.fill('#addrQ', 'Hansastraße 5 Dortmund'); await p.waitForSelector('.addr-opt'); await p.click('.addr-opt'); await p.waitForTimeout(2200);
    const c = await p.evaluate(() => { const m = window.__lage.map.getCenter(); return [m.lat, m.lng, window.__lage.map.getZoom()]; });
    assert.ok(Math.abs(c[0] - 51.5135) < 0.01 && Math.abs(c[1] - 7.4653) < 0.01 && c[2] >= 16, 'Karte zeigt die Adresse: ' + c); assert.ok(await p.locator('.leaflet-marker-icon').count() >= 1); await p.close();
  });
  await t('Navigation: erneuter Klick klappt zu, mehrere Punkte zugleich aktiv', async () => {
    const p = await seite(b, '', 1600, 950); const on = k => p.evaluate(k2 => { const n = document.querySelector('#tabs [data-act="' + k2 + '"],#tabs [data-tab="' + k2 + '"]'); return n.classList.contains('on') || (n.getAttribute('aria-selected') === 'true' && !n.classList.contains('dim')); }, k);
    await p.waitForTimeout(300); assert.ok(await on('gebiet') && await on('map'), 'Gebiete und Lagekarte aktiv');
    await p.click('#tabs [data-tab="gebiet"]'); await p.waitForTimeout(500); assert.ok(await p.evaluate(() => document.querySelector('#app').classList.contains('collapsed')), 'Panel zugeklappt'); assert.ok(!(await on('gebiet')));
    await p.click('#tabs [data-tab="gebiet"]'); await p.waitForTimeout(400); assert.ok(!(await p.evaluate(() => document.querySelector('#app').classList.contains('collapsed'))));
    await p.click('#tabs [data-act="wand"]'); await p.click('#tabs [data-act="fue"]'); await p.waitForTimeout(500);
    assert.ok(await on('wand') && await on('fue') && !(await on('map')), 'Kräfte und Führungsstruktur zugleich');
    assert.ok(await p.evaluate(() => document.body.classList.contains('dual') && !document.querySelector('#unitOv').hidden && !document.querySelector('#fueOv').hidden));
    await p.click('#tabs [data-act="map"]'); await p.waitForTimeout(400); assert.ok(await on('map') && !(await on('wand'))); await p.close();
  });
  await t('Stabswand: + Einheit im Abschnitt, Aufforderung zum Einzeichnen auf der Karte', async () => {
    const p = await seite(b, '', 1700, 1300); await p.evaluate(() => { const s = window.__lage.state; s.areas = []; s.sections = [{ id: 'ea1', kind: 'poly', typ: 'ea', name: 'EA Süd', color: '#2563eb', pts: [] }]; s.units = []; });
    await p.keyboard.press('u'); await p.waitForTimeout(500); await p.evaluate(() => document.querySelector('#ovStat').dispatchEvent(new Event('change'))); await p.waitForTimeout(300);
    await p.locator('.wcard button', { hasText: '+ Einheit' }).click(); await p.waitForTimeout(300);
    await p.locator('.dlg input').first().fill('LF Test'); await p.locator('.dlg button.primary').first().click(); await p.waitForTimeout(400);
    const u = await p.evaluate(() => window.__lage.state.units[0]); assert.ok(u && u.sectionId === 'ea1' && u.lat != null, 'Einheit im Abschnitt und mit Ort');
    await p.click('#tabs [data-act="map"]'); await p.waitForSelector('.drawask', { timeout: 4000 }); assert.ok((await p.textContent('.drawask')).includes('EA Süd')); await p.close();
  });
  await t('Einheit: Ziehen auf der Karte ordnet zu, Verschieben in Kräfte setzt die Einheit in die Fläche', async () => {
    const p = await seite(b, '', 1700, 1300); const r = await p.evaluate(() => { const L = window.__lage, s = L.state, now = new Date().toISOString();
      s.areas = []; s.sections = [{ id: 'A', kind: 'poly', typ: 'ea', name: 'EA A', color: '#2563eb', pts: [[51.50, 7.40], [51.50, 7.42], [51.52, 7.42], [51.52, 7.40]] }, { id: 'B', kind: 'poly', typ: 'br', name: 'BR B', color: '#16a34a', pts: [[51.50, 7.45], [51.50, 7.47], [51.52, 7.47], [51.52, 7.45]] }];
      s.units = [{ id: 'u1', name: 'LF 1', call: '', sym: null, f: 1, u: 1, h: 4, status: 'einsatz', sectionId: null, task: '', note: '', lat: 51.51, lng: 7.41, time: now }];
      L.unitMovedOnMap(s.units[0], 51.51, 7.41); const a = s.units[0].sectionId; L.unitMovedOnMap(s.units[0], 51.51, 7.46); const b2 = s.units[0].sectionId;
      L.assignUnit(s.units[0], 'A'); const u = s.units[0]; return { a, b2, c: u.sectionId, lat: u.lat, lng: u.lng }; });
    assert.strictEqual(r.a, 'A'); assert.strictEqual(r.b2, 'B'); assert.strictEqual(r.c, 'A');
    assert.ok(r.lat > 51.50 && r.lat < 51.52 && r.lng > 7.40 && r.lng < 7.42, 'Einheit liegt wieder in EA A: ' + r.lat + ' ' + r.lng); await p.close();
  });
  await t('Beamer-Fenster: folgen dem Hauptfenster, Festhalten friert Ausschnitt und Inhalte ein', async () => {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 800 } }); const url = 'file://' + require('path').resolve(__dirname, '../src/public/kritis-lage-einzeldatei.html');
    const main = await ctx.newPage(); await main.goto(url); await main.waitForTimeout(1200);
    await main.evaluate(() => { const L = window.__lage, s = L.state; s.sections = [{ id: 'A', kind: 'poly', typ: 'ea', name: 'EA A', color: '#2563eb', pts: [] }]; s.units = [{ id: 'u1', name: 'LF Eins', call: '', sym: null, f: 1, u: 1, h: 4, status: 'einsatz', sectionId: 'A', task: '', note: '', lat: 51.51, lng: 7.41, time: new Date().toISOString() }]; L.map.setView([51.51, 7.41], 14); });
    const mk = async v => { const p = await ctx.newPage(); await p.goto(url + '?beamer=' + v); await p.waitForTimeout(1500); return p; };
    const karte = await mk('karte'), wand = await mk('wand'), fue = await mk('fue');
    assert.ok(await wand.evaluate(() => document.body.innerText.includes('LF Eins')), 'Wand zeigt die Einheit'); assert.ok(await fue.evaluate(() => !document.querySelector('#fueOv').hidden));
    assert.ok(await wand.evaluate(() => !document.querySelector('#unitOv .ovtools').offsetParent), 'keine Bedienelemente im Beamer');
    await main.evaluate(() => { const L = window.__lage; L.state.units[0].name = 'LF Zwei'; L.assignUnit(L.state.units[0], 'A'); L.state.units[0].name = 'LF Zwei'; L.map.setView([52.0, 8.0], 12); window.__lage.state.units[0].time = new Date().toISOString(); }); await main.evaluate(() => document.querySelector('#btnBeamer').click()); await main.waitForTimeout(2800);
    const cen = await karte.evaluate(() => { const c = window.__lage.map.getCenter(); return [c.lat, c.lng]; }); assert.ok(Math.abs(cen[0] - 52.0) < 0.3, 'Karten-Beamer folgt dem Ausschnitt: ' + cen);
    await main.evaluate(() => document.querySelectorAll('#bmRows .bmrow')[2].querySelectorAll('button')[1].click()); await main.waitForTimeout(400);
    await main.evaluate(() => { const L = window.__lage; L.map.setView([48.0, 11.0], 12); L.state.units[0].name = 'LF Drei'; L.assignUnit(L.state.units[0], null); }); await main.waitForTimeout(1000);
    const cen2 = await karte.evaluate(() => { const c = window.__lage.map.getCenter(); return c.lat; }); assert.ok(Math.abs(cen2 - 52.0) < 0.3, 'Karte festgehalten: ' + cen2);
    await main.evaluate(() => document.querySelectorAll('#bmRows .bmrow')[2].querySelectorAll('button')[1].click()); await main.waitForTimeout(1000);
    const cen3 = await karte.evaluate(() => window.__lage.map.getCenter().lat); assert.ok(Math.abs(cen3 - 48.0) < 0.3, 'nach Freigabe wieder live: ' + cen3);
    await ctx.close();
  });
  await t('Gemeinsamer Einsatz: Server, zwei Geräte, gleichzeitige Änderungen, Löschen, Zeichnen bleibt', async () => {
    const { spawn } = require('child_process'), os = require('os'), fs = require('fs'), path = require('path'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-'));
    const srv = spawn('node', ['sync-server/server.js'], { env: Object.assign({}, process.env, { PORT: '18788', DATA_DIR: dir, ALLOW_ORIGINS: '*' }), cwd: path.resolve(__dirname, '..') });
    try {
      await new Promise(r => setTimeout(r, 700)); const url = 'file://' + path.resolve(__dirname, '../src/public/kritis-lage-einzeldatei.html'), SRV = 'http://127.0.0.1:18788';
      const mk = async () => { const c = await b.newContext({ viewport: { width: 1500, height: 800 }, acceptDownloads: true }); const p = await c.newPage(); await p.goto(url); await p.waitForTimeout(1200); return p; };
      const A = await mk(), B = await mk(), unit = (id, name) => ({ id, name, call: '', sym: null, f: 0, u: 1, h: 1, status: 'einsatz', sectionId: null, task: '', note: '', lat: null, lng: null, time: new Date().toISOString() });
      await A.evaluate(u => { window.__lage.state.units = [u]; }, unit('u1', 'LF Eins'));
      const code = await A.evaluate(async s => window.__lage.SYNC.create(s), SRV); assert.ok(/^([A-Z0-9]{4}-){4}[A-Z0-9]{4}$/.test(code), 'Code: ' + code);
      await B.evaluate(async ([c, s]) => { await window.__lage.SYNC.join(c, s); }, [code, SRV]);
      assert.deepStrictEqual(await B.evaluate(() => window.__lage.state.units.map(u => u.name)), ['LF Eins']);
      await Promise.all([A.evaluate(u => { const L = window.__lage; L.state.units.push(u); L.state.units[0].note = 'von A'; L.SYNC.schedulePush(); }, unit('u2', 'RTW Zwei')), B.evaluate(u => { const L = window.__lage; L.state.units.push(u); L.state.units[0].call = 'von B'; L.SYNC.schedulePush(); }, unit('u3', 'GW Drei'))]);
      await A.waitForTimeout(2500); const view = p => p.evaluate(() => window.__lage.state.units.map(u => [u.id, u.note, u.call].join(':')).sort());
      const va = await view(A), vb = await view(B); assert.deepStrictEqual(va, vb); assert.deepStrictEqual(va, ['u1:von A:von B', 'u2::', 'u3::']);
      await A.evaluate(() => { const L = window.__lage; L.state.units = L.state.units.filter(u => u.id !== 'u2'); L.SYNC.schedulePush(); }); await A.waitForTimeout(2000);
      assert.deepStrictEqual(await B.evaluate(() => window.__lage.state.units.map(u => u.id).sort()), ['u1', 'u3'], 'Löschen kommt an');
      await B.evaluate(() => { window.__lage.runtime.drawHandler = { disable() { window.__x = 1; } }; }); await A.evaluate(() => { window.__lage.state.units[0].name = 'LF A-neu'; window.__lage.SYNC.schedulePush(); }); await B.waitForTimeout(1800);
      assert.ok(await B.evaluate(() => !!window.__lage.runtime.drawHandler && !window.__x), 'Zeichnen wurde nicht abgebrochen'); assert.strictEqual(await B.evaluate(() => window.__lage.state.units.find(u => u.id === 'u1').name), 'LF A-neu');
      assert.ok((await A.textContent('#syncChip')).includes('online'));
      await B.evaluate(() => { window.__lage.runtime.drawHandler = null; });
    } finally { srv.kill(); }
  });
  await t('Wandoptik schaltbar und gemerkt', async () => {
    const p = await seite(b, ''); assert.ok(!(await p.evaluate(() => document.body.classList.contains('wandlook'))));
    await p.click('#btnMore'); await p.waitForTimeout(450); await p.click('#btnLook'); await p.waitForTimeout(200); assert.ok(await p.evaluate(() => document.body.classList.contains('wandlook')));
    await p.reload(); await p.waitForFunction(() => window.__lage); await p.waitForTimeout(500); assert.ok(await p.evaluate(() => document.body.classList.contains('wandlook'))); await p.close();
  });
  await b.close();
  console.log('\n' + ok + ' bestanden, ' + fail + ' fehlgeschlagen'); if (errs.length) { console.log('Skriptfehler im Browser:', [...new Set(errs)]); fail++; }
  process.exit(fail ? 1 : 0);
})();
