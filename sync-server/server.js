'use strict';
/*
 * LAGEkarte Sync-Dienst: gemeinsamer Einsatz über einen Code.
 * Der Server speichert pro Einsatz nur verschlüsselte Änderungsblöcke und einen verschlüsselten Gesamtstand.
 * Kennung und Zugriffsschlüssel werden in der App aus dem Code abgeleitet, der Server sieht nie Klartext.
 *
 *   GET    /health                          -> "ok"
 *   GET    /v1/room/<id>/ops?since=N&wait=S -> { seq, snapSeq, snapshot?, ops:[{s,d}], online }   (X-Sync-Token)
 *   POST   /v1/room/<id>/ops                -> { seq }       Body { ops:[verschlüsselter Block] } (legt den Einsatz an, wenn neu)
 *   PUT    /v1/room/<id>/snapshot           -> { snapSeq }   Body { seq, data }  ersetzt alle Blöcke bis seq
 *   DELETE /v1/room/<id>                    -> 204
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

function config(env) {
  const num = (k, d) => { const v = Number(env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  return {
    port: num('PORT', 8788), dataDir: env.DATA_DIR || path.join(__dirname, 'data'),
    maxBody: num('MAX_BODY', 12 * 1024 * 1024), maxRooms: num('MAX_ROOMS', 500), maxOps: num('MAX_OPS', 4000),
    ratePerMin: num('RATE_PER_MIN', 600), failPerMin: num('FAIL_PER_MIN', 10), expireDays: num('EXPIRE_DAYS', 60),
    maxWait: num('MAX_WAIT', 25), allowOrigins: (env.ALLOW_ORIGINS || 'https://flametan.github.io').split(',').map(s => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY === '1'
  };
}
const ID_RE = /^[a-f0-9]{32}$/, TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const eqHex = (a, b) => { try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); } catch (e) { return false; } };

function createServer(cfg) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const rooms = new Map();            // id -> Room
  const hits = new Map();             // ip -> { start, n, fails }
  const file = id => path.join(cfg.dataDir, id + '.json');
  const known = new Set(fs.readdirSync(cfg.dataDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)));

  async function load(id) {
    if (rooms.has(id)) return rooms.get(id);
    if (!known.has(id)) return null;
    try { const r = JSON.parse(await fsp.readFile(file(id), 'utf8')); r.waiters = []; r.tags = new Map(); r.timer = null; rooms.set(id, r); return r; } catch (e) { return null; }
  }
  function save(r) {
    if (r.timer) return;
    r.timer = setTimeout(async () => {
      r.timer = null;
      const { waiters, tags, timer, ...plain } = r;
      try { const tmp = file(r.id) + '.tmp'; await fsp.writeFile(tmp, JSON.stringify(plain)); await fsp.rename(tmp, file(r.id)); } catch (e) { console.error('Speichern fehlgeschlagen:', e.message); }
    }, 400);
  }
  function create(id, token) {
    const r = { id, tokenHash: sha(token), seq: 0, snapSeq: 0, snapshot: null, ops: [], updatedAt: Date.now(), waiters: [], tags: new Map(), timer: null };
    rooms.set(id, r); known.add(id); save(r); return r;
  }
  const online = r => { const now = Date.now(); let n = 0; r.tags.forEach((t, k) => { if (now - t < 20000) n++; else r.tags.delete(k); }); return n; };
  const wake = r => { const w = r.waiters.splice(0); w.forEach(f => f()); };

  const ip = req => (cfg.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
  function limited(req, fail) {
    const k = ip(req), now = Date.now(); let h = hits.get(k);
    if (!h || now - h.start > 60000) { h = { start: now, n: 0, fails: 0 }; hits.set(k, h); }
    if (fail) h.fails++; else h.n++;
    return h.n > cfg.ratePerMin || h.fails > cfg.failPerMin;
  }
  const cors = (req, res) => {
    const o = req.headers.origin;
    if (o && (cfg.allowOrigins.includes('*') || cfg.allowOrigins.includes(o))) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'X-Sync-Token, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); res.setHeader('Access-Control-Max-Age', '600');
  };
  const send = (req, res, code, body) => { cors(req, res); const t = typeof body === 'string'; res.writeHead(code, { 'Content-Type': t ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(t ? body : (body === undefined ? '' : JSON.stringify(body))); };
  const readBody = (req, limit) => new Promise((ok, no) => { let size = 0; const parts = []; req.on('data', c => { size += c.length; if (size > limit) { no(new Error('zu groß')); req.destroy(); } else parts.push(c); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { no(new Error('kein JSON')); } }); req.on('error', no); });

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return send(req, res, 204);
    if (url.pathname === '/health') return send(req, res, 200, 'ok');
    const m = /^\/v1\/room\/([a-f0-9]{32})(\/ops|\/snapshot)?$/.exec(url.pathname);
    if (!m) return send(req, res, 404, { error: 'nicht gefunden' });
    if (limited(req, false)) return send(req, res, 429, { error: 'zu viele Anfragen' });
    const id = m[1], sub = m[2] || '', token = String(req.headers['x-sync-token'] || '');
    if (!TOKEN_RE.test(token)) return send(req, res, 401, { error: 'Token fehlt' });
    let r = await load(id);
    const auth = () => { if (!eqHex(r.tokenHash, sha(token))) { limited(req, true); send(req, res, 403, { error: 'Zugriff verweigert' }); return false; } return true; };
    try {
      if (req.method === 'GET' && sub === '/ops') {
        if (!r) { limited(req, true); return send(req, res, 404, { error: 'Einsatz unbekannt' }); }
        if (!auth()) return;
        const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0), tag = (url.searchParams.get('c') || '').slice(0, 16);
        const wait = Math.min(cfg.maxWait, Math.max(0, parseInt(url.searchParams.get('wait') || '0', 10) || 0));
        if (tag) r.tags.set(tag, Date.now());
        const answer = () => {
          const out = { seq: r.seq, snapSeq: r.snapSeq, online: online(r), ops: r.ops.filter(o => o.s > Math.max(since, r.snapSeq)) };
          if (since < r.snapSeq || (since === 0 && r.snapshot)) out.snapshot = r.snapshot;
          send(req, res, 200, out);
        };
        if (r.seq > since || !wait) return answer();
        let done = false; const fin = () => { if (!done) { done = true; clearTimeout(tm); answer(); } };
        const tm = setTimeout(fin, wait * 1000); r.waiters.push(fin); req.on('close', () => { done = true; clearTimeout(tm); });
        return;
      }
      if (req.method === 'POST' && sub === '/ops') {
        const b = await readBody(req, cfg.maxBody);
        if (!Array.isArray(b.ops) || !b.ops.length || b.ops.some(o => typeof o !== 'string' || o.length > 4 * 1024 * 1024)) return send(req, res, 400, { error: 'ungültige Daten' });
        if (!r) { if (known.size >= cfg.maxRooms) return send(req, res, 507, { error: 'Server voll' }); r = create(id, token); }
        else if (!auth()) return;
        if (r.ops.length + b.ops.length > cfg.maxOps) return send(req, res, 413, { error: 'Gesamtstand nötig' });
        b.ops.forEach(d => { r.seq++; r.ops.push({ s: r.seq, d }); });
        r.updatedAt = Date.now(); save(r); wake(r); return send(req, res, 200, { seq: r.seq });
      }
      if (req.method === 'PUT' && sub === '/snapshot') {
        const b = await readBody(req, cfg.maxBody);
        if (typeof b.data !== 'string' || !Number.isInteger(b.seq) || b.seq < 0) return send(req, res, 400, { error: 'ungültige Daten' });
        if (!r) { if (known.size >= cfg.maxRooms) return send(req, res, 507, { error: 'Server voll' }); r = create(id, token); }
        else if (!auth()) return;
        if (b.seq > r.seq) return send(req, res, 409, { error: 'Stand zu neu', seq: r.seq });
        if (b.seq >= r.snapSeq) { r.snapshot = b.data; r.snapSeq = b.seq; r.ops = r.ops.filter(o => o.s > b.seq); }
        r.updatedAt = Date.now(); save(r); wake(r); return send(req, res, 200, { snapSeq: r.snapSeq, seq: r.seq });
      }
      if (req.method === 'DELETE' && sub === '') {
        if (!r) return send(req, res, 204);
        if (!auth()) return;
        rooms.delete(id); known.delete(id); wake(r); fsp.unlink(file(id)).catch(() => {}); return send(req, res, 204);
      }
      return send(req, res, 405, { error: 'nicht erlaubt' });
    } catch (e) { return send(req, res, e.message === 'zu groß' ? 413 : 400, { error: e.message }); }
  };
  const server = http.createServer((req, res) => { handler(req, res).catch(e => { try { send(req, res, 500, { error: 'Fehler' }); } catch (x) { /* weg */ } console.error(e); }); });
  // alte Einsätze aufräumen
  const sweep = setInterval(async () => {
    const lim = Date.now() - cfg.expireDays * 86400000;
    for (const id of [...known]) { try { const st = await fsp.stat(file(id)); if (st.mtimeMs < lim && !(rooms.get(id) && rooms.get(id).updatedAt > lim)) { known.delete(id); rooms.delete(id); fsp.unlink(file(id)).catch(() => {}); } } catch (e) { /* weg */ } }
  }, 6 * 3600 * 1000); sweep.unref();
  server.flush = () => Promise.all([...rooms.values()].map(r => { clearTimeout(r.timer); r.timer = null; const { waiters, tags, timer, ...plain } = r; return fsp.writeFile(file(r.id), JSON.stringify(plain)); }));
  return server;
}

if (require.main === module) {
  const cfg = config(process.env), server = createServer(cfg);
  server.listen(cfg.port, '0.0.0.0', () => console.log('LAGEkarte Sync-Dienst auf Port ' + cfg.port + ', Daten in ' + cfg.dataDir + ', Zugriff von: ' + cfg.allowOrigins.join(', ')));
  const stop = () => server.flush().finally(() => process.exit(0)); process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
module.exports = { createServer, config };
