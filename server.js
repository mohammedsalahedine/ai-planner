require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db/schema');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const settingsRoutes = require('./routes/settings');
const scheduleRoutes = require('./routes/schedule');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;
let dbReady = false;

app.use(cors());
app.use(express.json());

async function ensureDB() {
  if (dbReady) return;
  await initDB();
  dbReady = true;
}

app.get('/health', async (req, res) => {
  try { await ensureDB(); } catch(e) {}
  res.json({ status: 'ok', version: '3.2', db: dbReady ? 'connected' : 'initializing' });
});

app.use('/api/auth', async (req, res, next) => { try { await ensureDB(); next(); } catch(e) { res.status(503).json({error:'Database initializing'}); } }, authRoutes);
app.use('/api/tasks', async (req, res, next) => { try { await ensureDB(); next(); } catch(e) { res.status(503).json({error:'Database initializing'}); } }, taskRoutes);
app.use('/api/settings', async (req, res, next) => { try { await ensureDB(); next(); } catch(e) { res.status(503).json({error:'Database initializing'}); } }, settingsRoutes);
app.use('/api/schedule', async (req, res, next) => { try { await ensureDB(); next(); } catch(e) { res.status(503).json({error:'Database initializing'}); } }, scheduleRoutes);
app.use('/api/stats', async (req, res, next) => { try { await ensureDB(); next(); } catch(e) { res.status(503).json({error:'Database initializing'}); } }, statsRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

ensureDB().catch(() => {});

if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname)));
  const pages = ['dashboard', 'tasks', 'calendar', 'charts', 'settings'];
  pages.forEach(page => {
    app.get('/' + page, (req, res) => {
      res.sendFile(path.join(__dirname, page + '.html'));
    });
  });
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });
  app.listen(PORT, '0.0.0.0', () => {
    console.log('AI Planner on port ' + PORT);
  });
}

module.exports = app;
