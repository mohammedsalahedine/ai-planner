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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '3.0', db: dbReady ? 'connected' : 'initializing' });
});

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/stats', statsRoutes);

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

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function startDB(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await initDB();
      dbReady = true;
      console.log('Database connected');
      return;
    } catch (err) {
      console.error('DB attempt ' + (i + 1) + '/' + retries + ' failed:', err.message);
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.error('DB init failed after all retries');
}

startDB();

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('AI Planner on port ' + PORT);
  });
}

module.exports = app;
