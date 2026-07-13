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

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.2', db: dbReady ? 'connected' : 'initializing' });
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

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function initOnce() {
  if (dbReady) return;
  try {
    await initDB();
    dbReady = true;
    console.log('Database connected');
  } catch (err) {
    console.error('DB init failed:', err.message);
  }
}

initOnce();

module.exports = app;
