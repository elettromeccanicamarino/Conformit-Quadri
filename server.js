'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'marino2026';
const SECRET = process.env.SESSION_SECRET || 'em-marino-secret-2026';

// — storage JSON su file —
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function readDB(name) {
  const f = path.join(dataDir, name + '.json');
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; }
}
function writeDB(name, data) {
  fs.writeFileSync(path.join(dataDir, name + '.json'), JSON.stringify(data), 'utf8');
}

// — middleware —
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser(SECRET));

function requireAuth(req, res, next) {
  if (req.signedCookies && req.signedCookies.auth === 'ok') return next();
  res.status(401).json({ error: 'Non autenticato' });
}

// — LOGIN —
app.post('/api/login', (req, res) => {
  if (req.body.password === APP_PASSWORD) {
    res.cookie('auth', 'ok', { signed: true, httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Password errata' });
  }
});
app.post('/api/logout', (req, res) => { res.clearCookie('auth'); res.json({ ok: true }); });
app.get('/api/me', (req, res) => {
  res.json({ auth: !!(req.signedCookies && req.signedCookies.auth === 'ok') });
});

// — CERTIFICATI —
app.get('/api/certs', requireAuth, (req, res) => res.json(readDB('certs')));
app.put('/api/certs/:key', requireAuth, (req, res) => {
  const db = readDB('certs');
  db[req.params.key] = { ...req.body, savedAt: new Date().toLocaleString('it-IT') };
  writeDB('certs', db); res.json({ ok: true });
});
app.delete('/api/certs/:key', requireAuth, (req, res) => {
  const db = readDB('certs'); delete db[req.params.key];
  writeDB('certs', db); res.json({ ok: true });
});

// — REGISTRO —
app.get('/api/registro', requireAuth, (req, res) => res.json(readDB('registro')));
app.put('/api/registro/:key', requireAuth, (req, res) => {
  const db = readDB('registro'); db[req.params.key] = req.body;
  writeDB('registro', db); res.json({ ok: true });
});
app.delete('/api/registro/:key', requireAuth, (req, res) => {
  const db = readDB('registro'); delete db[req.params.key];
  writeDB('registro', db); res.json({ ok: true });
});

// — CLIENTI —
app.get('/api/clients', requireAuth, (req, res) => res.json(readDB('clients')));
app.put('/api/clients/:key', requireAuth, (req, res) => {
  const db = readDB('clients'); db[req.params.key] = req.body;
  writeDB('clients', db); res.json({ ok: true });
});
app.delete('/api/clients/:key', requireAuth, (req, res) => {
  const db = readDB('clients'); delete db[req.params.key];
  writeDB('clients', db); res.json({ ok: true });
});

// — BACKUP —
app.get('/api/backup', requireAuth, (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="backup_marino_${new Date().toISOString().slice(0,10)}.json"`);
  res.json({ em_certs: readDB('certs'), em_registro: readDB('registro'), em_clients: readDB('clients'), exportedAt: new Date().toLocaleString('it-IT') });
});

// — IMPORT —
app.post('/api/import', requireAuth, (req, res) => {
  const { em_certs, em_registro, em_clients } = req.body;
  if (em_certs)    writeDB('certs',    { ...readDB('certs'),    ...em_certs });
  if (em_registro) writeDB('registro', { ...readDB('registro'), ...em_registro });
  if (em_clients)  writeDB('clients',  { ...readDB('clients'),  ...em_clients });
  res.json({ ok: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Marino App avviata sulla porta ${PORT}`));
