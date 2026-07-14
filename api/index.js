require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('../db/schema');
const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');
const settingsRoutes = require('../routes/settings');
const scheduleRoutes = require('../routes/schedule');
const statsRoutes = require('../routes/stats');

const app = express();
let dbReady = false;
let dbInitPromise = null;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

async function ensureDB() {
  if (dbReady) return;
  if (!dbInitPromise) {
    dbInitPromise = initDB().then(() => {
      dbReady = true;
      console.log('Database connected');
    }).catch(err => {
      console.error('DB init failed:', err.message);
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

app.get('/health', async (req, res) => {
  try {
    await ensureDB();
    res.json({ status: 'ok', version: '3.1', db: 'connected' });
  } catch (err) {
    res.json({ status: 'ok', version: '3.1', db: 'error: ' + err.message });
  }
});

app.use('/api/auth', async (req, res, next) => { try { await ensureDB(); next(); } catch(e) { res.status(503).json({error:'Database initializing'}); } }, authRoutes);
app.use('/api/tasks', async (req, res, next) => { try { await ensureDB(); next(); } catch(e) { res.status(503).json({error:'Database initializing'}); } }, taskRoutes);
app.use('/api/settings', async (req, res, next) => { try { await ensureDB(); next(); } catch(e) { res.status(503).json({error:'Database initializing'}); } }, settingsRoutes);
app.use('/api/schedule', async (req, res, next) => { try { await ensureDB(); next(); } catch(e) { res.status(503).json({error:'Database initializing'}); } }, scheduleRoutes);
app.use('/api/stats', async (req, res, next) => { try { await ensureDB(); next(); } catch(e) { res.status(503).json({error:'Database initializing'}); } }, statsRoutes);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
['dashboard', 'tasks', 'calendar', 'charts', 'settings'].forEach(p => {
  app.get('/' + p, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', p + '.html')));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

ensureDB();

module.exports = app;
