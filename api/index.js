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
    res.json({ status: 'ok', version: '3.0', db: 'connected' });
  } catch (err) {
    res.json({ status: 'ok', version: '3.0', db: 'error: ' + err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/stats', statsRoutes);

const publicDir = path.join(__dirname, '..');
app.use(express.static(publicDir));

const pages = ['dashboard', 'tasks', 'calendar', 'charts', 'settings'];
pages.forEach(page => {
  app.get('/' + page, (req, res) => {
    res.sendFile(path.join(publicDir, page + '.html'));
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

ensureDB();

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log('AI Planner on port ' + PORT);
  });
}

module.exports = app;
