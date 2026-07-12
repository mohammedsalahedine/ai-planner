const express = require('express');
const { getDB } = require('../db/schema');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/dashboard', async (req, res) => {
  const db = getDB();
  const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = $1').all(req.userId);
  const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = $1').get(req.userId);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalUnits = tasks.reduce((s, t) => s + (t.total_units || 0), 0);
  const completedUnits = tasks.reduce((s, t) => s + (t.completed_units || 0), 0);
  const progress = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  const today = new Date().toISOString().split('T')[0];
  const todaySchedule = await db.prepare(`
    SELECT s.*, t.name as task_name FROM schedule s
    JOIN tasks t ON s.task_id = t.id
    WHERE s.user_id = $1 AND s.date = $2
    ORDER BY s.start_time
  `).all(req.userId, today);

  const totalScheduledMinutes = todaySchedule.reduce((s, item) => {
    const [sh, sm] = item.start_time.split(':').map(Number);
    const [eh, em] = item.end_time.split(':').map(Number);
    return s + ((eh * 60 + em) - (sh * 60 + sm));
  }, 0);

  const dailyHours = settings ? settings.daily_hours : 8;
  const remainingHours = Math.max(0, dailyHours - totalScheduledMinutes / 60);

  const byCategory = {};
  tasks.forEach(t => {
    if (!byCategory[t.category]) byCategory[t.category] = { count: 0, completed: 0, units: 0, completedUnits: 0 };
    byCategory[t.category].count++;
    if (t.status === 'completed') byCategory[t.category].completed++;
    byCategory[t.category].units += t.total_units || 0;
    byCategory[t.category].completedUnits += t.completed_units || 0;
  });

  const byPriority = { high: 0, medium: 0, low: 0 };
  tasks.forEach(t => { if (byPriority[t.priority] !== undefined) byPriority[t.priority]++; });

  res.json({
    totalTasks, completedTasks, progress, totalUnits, completedUnits,
    remainingHours: Math.round(remainingHours * 10) / 10,
    todaySchedule, byCategory, byPriority,
    totalScheduledHours: Math.round(totalScheduledMinutes / 60 * 10) / 10
  });
});

router.get('/charts', async (req, res) => {
  const db = getDB();
  const days = parseInt(req.query.days) || 7;
  const data = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const daySchedule = await db.prepare(`
      SELECT s.*, t.name as task_name, t.category FROM schedule s
      JOIN tasks t ON s.task_id = t.id
      WHERE s.user_id = $1 AND s.date = $2
    `).all(req.userId, dateStr);

    const totalMinutes = daySchedule.reduce((s, item) => {
      const [sh, sm] = item.start_time.split(':').map(Number);
      const [eh, em] = item.end_time.split(':').map(Number);
      return s + ((eh * 60 + em) - (sh * 60 + sm));
    }, 0);

    const completedCount = daySchedule.filter(s => s.completed).length;
    data.push({
      date: dateStr,
      label: d.toLocaleDateString('ar-SA', { weekday: 'short', day: 'numeric' }),
      hours: Math.round(totalMinutes / 60 * 10) / 10,
      tasks: daySchedule.length,
      completed: completedCount,
      categories: daySchedule.reduce((acc, s) => { acc[s.category] = (acc[s.category] || 0) + 1; return acc; }, {})
    });
  }

  res.json(data);
});

module.exports = router;
