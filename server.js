require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db/schema');
const authRoutes = require('./api/auth');
const taskRoutes = require('./api/tasks');
const settingsRoutes = require('./api/settings');
const scheduleRoutes = require('./api/schedule');
const statsRoutes = require('./api/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), db: dbReady ? 'connected' : 'initializing' });
});

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/stats', statsRoutes);

app.use(express.static(path.join(__dirname)));

const pages = ['dashboard', 'tasks', 'calendar', 'charts', 'settings'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, `${page}.html`));
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let dbReady = false;

async function startDB(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await initDB();
      dbReady = true;
      console.log('Database connected successfully');
      return;
    } catch (err) {
      console.error(`DB init attempt ${i + 1}/${retries} failed:`, err.message);
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.error('Database init failed after all retries — API routes will fail until DB is available');
}

startDB();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Planner running on http://localhost:${PORT}`);
});
