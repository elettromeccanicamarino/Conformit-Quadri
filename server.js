'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const { Client } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'marino2026';
const SECRET = process.env.SESSION_SECRET || 'em-marino-secret-2026';

function hashPwd(p) { return crypto.createHash('sha256').update(p + SECRET).digest('hex'); }

// — PostgreSQL —
const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
db.connect().then(() => {
  return db.query(`
    CREATE TABLE IF NOT EXISTS store (
      collection TEXT NOT NULL,
      key TEXT NOT NULL,
      data JSONB NOT NULL,
      saved_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (collection, key)
    )
  `);
}).then(() => console.log('DB connesso')).catch(err => console.error('DB error:', err));

async function readDB(collection) {
  const res = await db.query('SELECT key, data FROM store WHERE collection=$1', [collection]);
  const result = {};
  res.rows.forEach(r => { result[r.key] = r.data; });
  return result;
}
async function writeOne(collection, key, data) {
  await db.query('INSERT INTO store (collection,key,data,saved_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (collection,key) DO UPDATE SET data=$3, saved_at=NOW()', [collection, key, data]);
}
async function deleteOne(collection, key) {
  await db.query('DELETE FROM store WHERE collection=$1 AND key=$2', [collection, key]);
}

// — middleware —
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser(SECRET));

// Cookie format: "type|prefix"
// Backward compat: 'ok' = main, 'demo' = demo
function requireAuth(req, res, next) {
  const auth = req.signedCookies && req.signedCookies.auth;
  if (!auth) return res.status(401).json({ error: 'Non autenticato' });
  if (auth === 'ok')   { req.accountType = 'main';   req.prefix = '';       return next(); }
  if (auth === 'demo') { req.accountType = 'demo';   req.prefix = 'demo_';  return next(); }
  const parts = auth.split('|');
  if (parts.length === 2) { req.accountType = parts[0]; req.prefix = parts[1]; return next(); }
  res.status(401).json({ error: 'Non autenticato' });
}
function requireAdmin(req, res, next) {
  if (req.accountType === 'main') return next();
  res.status(403).json({ error: 'Solo admin' });
}

// — LOGIN —
app.post('/api/login', async (req, res) => {
  const pwd = req.body.password;
  const cookieOpts = { signed: true, httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' };
  if (pwd === APP_PASSWORD) {
    res.cookie('auth', 'main|', cookieOpts);
    return res.json({ ok: true });
  }
  // Cerca negli account clienti
  try {
    const accounts = await readDB('accounts');
    const hashed = hashPwd(pwd);
    const match = Object.values(accounts).find(a => a.hash === hashed);
    if (match) {
      res.cookie('auth', 'client|' + match.prefix, cookieOpts);
      return res.json({ ok: true });
    }
  } catch(e) {}
  res.status(401).json({ error: 'Password errata' });
});
app.post('/api/logout', (req, res) => { res.clearCookie('auth'); res.json({ ok: true }); });
app.get('/api/me', (req, res) => {
  const auth = req.signedCookies && req.signedCookies.auth;
  if (!auth) return res.json({ auth: false });
  if (auth === 'ok' || auth === 'main|') return res.json({ auth: true, type: 'main' });
  if (auth === 'demo') return res.json({ auth: true, type: 'demo' });
  const parts = auth.split('|');
  if (parts.length === 2) return res.json({ auth: true, type: parts[0] });
  res.json({ auth: false });
});

// — GESTIONE ACCOUNT CLIENTI (solo admin) —
app.get('/api/accounts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const accounts = await readDB('accounts');
    const safe = {};
    Object.entries(accounts).forEach(([k, v]) => {
      safe[k] = { id: v.id, name: v.name, prefix: v.prefix, createdAt: v.createdAt };
    });
    res.json(safe);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/accounts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Nome e password obbligatori' });
    const id = 'acc_' + Date.now();
    const prefix = 'c_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20) + '_';
    const account = { id, name, prefix, hash: hashPwd(password), createdAt: new Date().toLocaleString('it-IT') };
    await writeOne('accounts', id, account);
    res.json({ ok: true, id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/accounts/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await deleteOne('accounts', req.params.id); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/change-password', requireAuth, async (req, res) => {
  if (req.accountType !== 'client') return res.status(403).json({ error: 'Solo account clienti' });
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password troppo corta' });
    const accounts = await readDB('accounts');
    const entry = Object.entries(accounts).find(([,a]) => a.prefix === req.prefix);
    if (!entry) return res.status(404).json({ error: 'Account non trovato' });
    const [id, account] = entry;
    await writeOne('accounts', id, { ...account, hash: hashPwd(password) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// — CERTIFICATI —
app.get('/api/certs',         requireAuth, async (req, res) => { try { res.json(await readDB(req.prefix+'certs')); } catch(e) { res.status(500).json({error:e.message}); } });
app.put('/api/certs/:key',    requireAuth, async (req, res) => { try { await writeOne(req.prefix+'certs', req.params.key, {...req.body, savedAt: new Date().toLocaleString('it-IT')}); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });
app.delete('/api/certs/:key', requireAuth, async (req, res) => { try { await deleteOne(req.prefix+'certs', req.params.key); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });

// — REGISTRO —
app.get('/api/registro',         requireAuth, async (req, res) => { try { res.json(await readDB(req.prefix+'registro')); } catch(e) { res.status(500).json({error:e.message}); } });
app.put('/api/registro/:key',    requireAuth, async (req, res) => { try { await writeOne(req.prefix+'registro', req.params.key, req.body); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });
app.delete('/api/registro/:key', requireAuth, async (req, res) => { try { await deleteOne(req.prefix+'registro', req.params.key); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });

// — CLIENTI —
app.get('/api/clients',         requireAuth, async (req, res) => { try { res.json(await readDB(req.prefix+'clients')); } catch(e) { res.status(500).json({error:e.message}); } });
app.put('/api/clients/:key',    requireAuth, async (req, res) => { try { await writeOne(req.prefix+'clients', req.params.key, req.body); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });
app.delete('/api/clients/:key', requireAuth, async (req, res) => { try { await deleteOne(req.prefix+'clients', req.params.key); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });

// — CONFIG AZIENDA —
app.get('/api/config',    requireAuth, async (req, res) => { try { const d=await readDB(req.prefix+'config'); res.json(d.azienda||{}); } catch(e) { res.status(500).json({error:e.message}); } });
app.put('/api/config',    requireAuth, async (req, res) => { try { await writeOne(req.prefix+'config','azienda',req.body); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });
app.delete('/api/config', requireAuth, async (req, res) => { try { await deleteOne(req.prefix+'config','azienda'); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });

// — BACKUP —
app.get('/api/backup', requireAuth, async (req, res) => {
  try {
    const p = req.prefix;
    res.setHeader('Content-Disposition', `attachment; filename="backup_${p||'marino'}_${new Date().toISOString().slice(0,10)}.json"`);
    res.json({ em_certs: await readDB(p+'certs'), em_registro: await readDB(p+'registro'), em_clients: await readDB(p+'clients'), exportedAt: new Date().toLocaleString('it-IT') });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// — IMPORT —
app.post('/api/import', requireAuth, async (req, res) => {
  try {
    const p = req.prefix;
    const { em_certs, em_registro, em_clients } = req.body;
    if (em_certs)    for (const [k,v] of Object.entries(em_certs))    await writeOne(p+'certs', k, v);
    if (em_registro) for (const [k,v] of Object.entries(em_registro)) await writeOne(p+'registro', k, v);
    if (em_clients)  for (const [k,v] of Object.entries(em_clients))  await writeOne(p+'clients', k, v);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`Marino App avviata sulla porta ${PORT}`));
