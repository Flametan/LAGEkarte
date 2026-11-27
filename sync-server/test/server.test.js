'use strict';
const test = require('node:test'), assert = require('node:assert'), os = require('os'), fs = require('fs'), path = require('path');
const { createServer, config } = require('../server.js');
const ID = 'a'.repeat(32), TOKEN = 'T'.repeat(40);
async function start(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lage-')), cfg = config(Object.assign({ DATA_DIR: dir }, env || {})), srv = createServer(cfg);
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const call = (m, p, body, tok, extra) => fetch(base + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Sync-Token': tok === undefined ? TOKEN : tok }, extra || {}), body: body ? JSON.stringify(body) : undefined });
  return { srv, base, call, dir, close: () => new Promise(r => srv.close(r)) };
}
test('Einsatz anlegen, Blöcke anhängen und lesen', async () => {
  const s = await start(); const g0 = await s.call('GET', `/v1/room/${ID}/ops?since=0`); assert.strictEqual(g0.status, 404);
  const p = await s.call('POST', `/v1/room/${ID}/ops`, { ops: ['eins', 'zwei'] }); assert.deepStrictEqual(await p.json(), { seq: 2 });
  const g = await (await s.call('GET', `/v1/room/${ID}/ops?since=0`)).json(); assert.strictEqual(g.seq, 2); assert.deepStrictEqual(g.ops.map(o => o.d), ['eins', 'zwei']);
  const g2 = await (await s.call('GET', `/v1/room/${ID}/ops?since=1`)).json(); assert.deepStrictEqual(g2.ops.map(o => o.d), ['zwei']); await s.close();
});
test('falsches Token wird abgewiesen, ohne Token 401', async () => {
  const s = await start(); await s.call('POST', `/v1/room/${ID}/ops`, { ops: ['x'] });
  assert.strictEqual((await s.call('GET', `/v1/room/${ID}/ops?since=0`, null, 'X'.repeat(40))).status, 403);
  assert.strictEqual((await s.call('GET', `/v1/room/${ID}/ops?since=0`, null, '')).status, 401); await s.close();
});
test('Gesamtstand ersetzt ältere Blöcke, neue Geräte bekommen ihn', async () => {
  const s = await start(); await s.call('POST', `/v1/room/${ID}/ops`, { ops: ['a', 'b', 'c'] });
  const r = await s.call('PUT', `/v1/room/${ID}/snapshot`, { seq: 2, data: 'STAND' }); assert.strictEqual((await r.json()).snapSeq, 2);
  const g = await (await s.call('GET', `/v1/room/${ID}/ops?since=0`)).json(); assert.strictEqual(g.snapshot, 'STAND'); assert.deepStrictEqual(g.ops.map(o => o.d), ['c']);
  const g2 = await (await s.call('GET', `/v1/room/${ID}/ops?since=3`)).json(); assert.strictEqual(g2.snapshot, undefined); assert.strictEqual(g2.ops.length, 0);
  assert.strictEqual((await s.call('PUT', `/v1/room/${ID}/snapshot`, { seq: 99, data: 'x' })).status, 409); await s.close();
});
test('Langes Abfragen wird durch neue Blöcke geweckt', async () => {
  const s = await start(); await s.call('POST', `/v1/room/${ID}/ops`, { ops: ['a'] });
  const t0 = Date.now(), pending = s.call('GET', `/v1/room/${ID}/ops?since=1&wait=10&c=t1`);
  setTimeout(() => s.call('POST', `/v1/room/${ID}/ops`, { ops: ['b'] }), 300);
  const g = await (await pending).json(); assert.ok(Date.now() - t0 < 3000); assert.deepStrictEqual(g.ops.map(o => o.d), ['b']); assert.strictEqual(g.online, 1); await s.close();
});
test('Zugriff von fremden Seiten ist gesperrt, die erlaubte Seite darf', async () => {
  const s = await start({ ALLOW_ORIGINS: 'https://erlaubt.example' });
  const a = await s.call('GET', '/health', null, '', { Origin: 'https://erlaubt.example' }); assert.strictEqual(a.headers.get('access-control-allow-origin'), 'https://erlaubt.example');
  const b = await s.call('GET', '/health', null, '', { Origin: 'https://fremd.example' }); assert.strictEqual(b.headers.get('access-control-allow-origin'), null); await s.close();
});
test('Daten überleben einen Neustart, Löschen funktioniert', async () => {
  const s = await start(); await s.call('POST', `/v1/room/${ID}/ops`, { ops: ['bleibt'] }); await s.srv.flush(); const dir = s.dir; await s.close();
  const srv2 = createServer(config({ DATA_DIR: dir })); await new Promise(r => srv2.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv2.address().port;
  const g = await (await fetch(`${base}/v1/room/${ID}/ops?since=0`, { headers: { 'X-Sync-Token': TOKEN } })).json(); assert.deepStrictEqual(g.ops.map(o => o.d), ['bleibt']);
  assert.strictEqual((await fetch(`${base}/v1/room/${ID}`, { method: 'DELETE', headers: { 'X-Sync-Token': TOKEN } })).status, 204);
  assert.strictEqual((await fetch(`${base}/v1/room/${ID}/ops?since=0`, { headers: { 'X-Sync-Token': TOKEN } })).status, 404); await new Promise(r => srv2.close(r));
});
