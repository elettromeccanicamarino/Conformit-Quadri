'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { Client } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD  = process.env.APP_PASSWORD  || 'marino2026';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo2026';
const SECRET = process.env.SESSION_SECRET || 'em-marino-secret-2026';

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
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser(SECRET));

// requireAuth: accetta sia account principale ('ok') che demo ('demo')
// imposta req.prefix = '' per account principale, 'demo_' per demo
function requireAuth(req, res, next) {
  const auth = req.signedCookies && req.signedCookies.auth;
  if (auth === 'ok')   { req.prefix = '';      return next(); }
  if (auth === 'demo') { req.prefix = 'demo_'; return next(); }
  res.status(401).json({ error: 'Non autenticato' });
}

// — LOGIN —
app.post('/api/login', (req, res) => {
  if (req.body.password === APP_PASSWORD) {
    res.cookie('auth', 'ok',   { signed: true, httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
    res.json({ ok: true });
  } else if (DEMO_PASSWORD && req.body.password === DEMO_PASSWORD) {
    res.cookie('auth', 'demo', { signed: true, httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Password errata' });
  }
});
app.post('/api/logout', (req, res) => { res.clearCookie('auth'); res.json({ ok: true }); });
app.get('/api/me', (req, res) => {
  const auth = req.signedCookies && req.signedCookies.auth;
  res.json({ auth: auth === 'ok' || auth === 'demo' });
});

// — CERTIFICATI —
app.get('/api/certs',       requireAuth, async (req, res) => { try { res.json(await readDB(req.prefix+'certs')); } catch(e) { res.status(500).json({error:e.message}); } });
app.put('/api/certs/:key',  requireAuth, async (req, res) => { try { await writeOne(req.prefix+'certs', req.params.key, {...req.body, savedAt: new Date().toLocaleString('it-IT')}); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });
app.delete('/api/certs/:key', requireAuth, async (req, res) => { try { await deleteOne(req.prefix+'certs', req.params.key); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });

// — REGISTRO —
app.get('/api/registro',       requireAuth, async (req, res) => { try { res.json(await readDB(req.prefix+'registro')); } catch(e) { res.status(500).json({error:e.message}); } });
app.put('/api/registro/:key',  requireAuth, async (req, res) => { try { await writeOne(req.prefix+'registro', req.params.key, req.body); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });
app.delete('/api/registro/:key', requireAuth, async (req, res) => { try { await deleteOne(req.prefix+'registro', req.params.key); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });

// — CLIENTI —
app.get('/api/clients',       requireAuth, async (req, res) => { try { res.json(await readDB(req.prefix+'clients')); } catch(e) { res.status(500).json({error:e.message}); } });
app.put('/api/clients/:key',  requireAuth, async (req, res) => { try { await writeOne(req.prefix+'clients', req.params.key, req.body); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });
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
