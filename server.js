'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// — password configurabile da variabile d'ambiente —
const APP_PASSWORD = process.env.APP_PASSWORD || 'marino2026';

// — database SQLite —
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'marino.db');
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS certs   (key TEXT PRIMARY KEY, data TEXT, saved_at TEXT);
  CREATE TABLE IF NOT EXISTS registro (key TEXT PRIMARY KEY, data TEXT);
  CREATE TABLE IF NOT EXISTS clients  (key TEXT PRIMARY KEY, data TEXT);
`);

// — middleware —
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser(process.env.SESSION_SECRET || 'em-marino-secret-2026'));

// auth middleware basato su cookie firmato
function requireAuth(req, res, next) {
  if (req.signedCookies && req.signedCookies.auth === 'ok') return next();
  res.status(401).json({ error: 'Non autenticato' });
}

// — LOGIN —
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === APP_PASSWORD) {
    res.cookie('auth', 'ok', {
      signed: true,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Password errata' });
  }
});
app.post('/api/logout', (req, res) => {
  res.clearCookie('auth');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  res.json({ auth: !!(req.signedCookies && req.signedCookies.auth === 'ok') });
});

// — CERTIFICATI —
app.get('/api/certs', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, data, saved_at FROM certs ORDER BY saved_at DESC').all();
  const result = {};
  rows.forEach(r => { result[r.key] = JSON.parse(r.data); });
  res.json(result);
});
app.put('/api/certs/:key', requireAuth, (req, res) => {
  const { key } = req.params;
  const data = req.body;
  const saved_at = new Date().toISOString();
  data.savedAt = new Date().toLocaleString('it-IT');
  db.prepare('INSERT OR REPLACE INTO certs (key, data, saved_at) VALUES (?,?,?)').run(key, JSON.stringify(data), saved_at);
  res.json({ ok: true });
});
app.delete('/api/certs/:key', requireAuth, (req, res) => {
  db.prepare('DELETE FROM certs WHERE key=?').run(req.params.key);
  res.json({ ok: true });
});

// — REGISTRO —
app.get('/api/registro', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, data FROM registro').all();
  const result = {};
  rows.forEach(r => { result[r.key] = JSON.parse(r.data); });
  res.json(result);
});
app.put('/api/registro/:key', requireAuth, (req, res) => {
  db.prepare('INSERT OR REPLACE INTO registro (key, data) VALUES (?,?)').run(req.params.key, JSON.stringify(req.body));
  res.json({ ok: true });
});
app.delete('/api/registro/:key', requireAuth, (req, res) => {
  db.prepare('DELETE FROM registro WHERE key=?').run(req.params.key);
  res.json({ ok: true });
});

// — CLIENTI —
app.get('/api/clients', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, data FROM clients').all();
  const result = {};
  rows.forEach(r => { result[r.key] = JSON.parse(r.data); });
  res.json(result);
});
app.put('/api/clients/:key', requireAuth, (req, res) => {
  db.prepare('INSERT OR REPLACE INTO clients (key, data) VALUES (?,?)').run(req.params.key, JSON.stringify(req.body));
  res.json({ ok: true });
});
app.delete('/api/clients/:key', requireAuth, (req, res) => {
  db.prepare('DELETE FROM clients WHERE key=?').run(req.params.key);
  res.json({ ok: true });
});

// — BACKUP COMPLETO —
app.get('/api/backup', requireAuth, (req, res) => {
  const certs = {}, registro = {}, clients = {};
  db.prepare('SELECT key,data FROM certs').all().forEach(r => { certs[r.key] = JSON.parse(r.data); });
  db.prepare('SELECT key,data FROM registro').all().forEach(r => { registro[r.key] = JSON.parse(r.data); });
  db.prepare('SELECT key,data FROM clients').all().forEach(r => { clients[r.key] = JSON.parse(r.data); });
  res.setHeader('Content-Disposition', `attachment; filename="backup_marino_${new Date().toISOString().slice(0,10)}.json"`);
  res.json({ em_certs: certs, em_registro: registro, em_clients: clients, exportedAt: new Date().toLocaleString('it-IT') });
});

// — IMPORT BULK —
app.post('/api/import', requireAuth, (req, res) => {
  const { em_certs, em_registro, em_clients } = req.body;
  const ins_cert = db.prepare('INSERT OR REPLACE INTO certs (key,data,saved_at) VALUES (?,?,?)');
  const ins_reg  = db.prepare('INSERT OR REPLACE INTO registro (key,data) VALUES (?,?)');
  const ins_cli  = db.prepare('INSERT OR REPLACE INTO clients (key,data) VALUES (?,?)');
  const now = new Date().toISOString();
  const doImport = db.transaction(() => {
    if (em_certs)   Object.entries(em_certs).forEach(([k,v]) => ins_cert.run(k, JSON.stringify(v), now));
    if (em_registro) Object.entries(em_registro).forEach(([k,v]) => ins_reg.run(k, JSON.stringify(v)));
    if (em_clients) Object.entries(em_clients).forEach(([k,v]) => ins_cli.run(k, JSON.stringify(v)));
  });
  doImport();
  res.json({ ok: true });
});

// — fallback SPA —
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Marino App avviata su http://localhost:${PORT}`));
