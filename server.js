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
app.use(express.static(path.join(__dirname)));

const pages = ['index', 'dashboard', 'tasks', 'calendar', 'charts', 'settings'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, `${page}.html`));
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDB().then(() => {
  app.use('/api/auth', authRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api/stats', statsRoutes);

  app.listen(PORT, () => {
    console.log(`AI Planner running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
