const express = require('express');
const { getDB } = require('../db/schema');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

function calculateTimeNeeded(task, settings) {
  const remaining = task.total_units - task.completed_units;
  if (remaining <= 0) return 0;
  switch (task.category) {
    case 'book': return remaining / (settings.reading_speed || 30);
    case 'course': return remaining / (settings.course_speed || 1);
    case 'movie': return remaining;
    case 'training': return remaining;
    default: return remaining;
  }
}

async function generateSchedule(db, userId) {
  const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = $1 AND status != $2').all(userId, 'completed');
  const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = $1').get(userId);
  if (!settings) return [];

  await db.prepare('DELETE FROM schedule WHERE user_id = $1').run(userId);

  const dailyHours = settings.daily_hours || 8;
  const dayStart = settings.day_start || '09:00';
  const breakDuration = settings.break_duration || 30;
  const restDays = JSON.parse(settings.rest_days || '[]');
  const weekendHours = settings.weekend_hours || 4;

  const prioritized = [...tasks].sort((a, b) => {
    const p = { high: 0, medium: 1, low: 2 };
    return (p[a.priority] || 1) - (p[b.priority] || 1);
  });

  const schedule = [];
  let currentDate = new Date();
  let currentDayStart = parseInt(dayStart.split(':')[0]);
  let currentMinute = currentDayStart * 60;
  let dayMinutesUsed = 0;
  let maxDayMinutes = dailyHours * 60;

  for (const task of prioritized) {
    const timeNeeded = calculateTimeNeeded(task, settings) * 60;
    let remaining = timeNeeded;

    while (remaining > 0) {
      const dayOfWeek = currentDate.getDay();
      const isRestDay = restDays.includes(dayOfWeek);

      if (isRestDay) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentMinute = currentDayStart * 60;
        dayMinutesUsed = 0;
        continue;
      }

      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      maxDayMinutes = isWeekend ? weekendHours * 60 : dailyHours * 60;

      if (dayMinutesUsed >= maxDayMinutes) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentMinute = currentDayStart * 60;
        dayMinutesUsed = 0;
        continue;
      }

      const available = maxDayMinutes - dayMinutesUsed;
      const chunk = Math.min(remaining, available, 120);

      const startH = Math.floor(currentMinute / 60);
      const startM = currentMinute % 60;
      const endMinute = currentMinute + chunk;
      const endH = Math.floor(endMinute / 60);
      const endM = endMinute % 60;

      const dateStr = currentDate.toISOString().split('T')[0];
      const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
      const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      await db.prepare(`
        INSERT INTO schedule (user_id, task_id, date, start_time, end_time)
        VALUES ($1, $2, $3, $4, $5)
      `).run(userId, task.id, dateStr, startStr, endStr);

      schedule.push({ task_id: task.id, task_name: task.name, date: dateStr, start_time: startStr, end_time: endStr });

      remaining -= chunk;
      currentMinute = endMinute + breakDuration;
      dayMinutesUsed += chunk + breakDuration;

      if (currentMinute >= (currentDayStart + dailyHours) * 60) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentMinute = currentDayStart * 60;
        dayMinutesUsed = 0;
      }
    }
  }

  return schedule;
}

router.post('/generate', async (req, res) => {
  const db = getDB();
  const schedule = await generateSchedule(db, req.userId);
  res.json({ schedule, count: schedule.length });
});

router.get('/', async (req, res) => {
  const db = getDB();
  const schedule = await db.prepare(`
    SELECT s.*, t.name as task_name, t.category, t.priority
    FROM schedule s JOIN tasks t ON s.task_id = t.id
    WHERE s.user_id = $1 ORDER BY s.date, s.start_time
  `).all(req.userId);
  res.json(schedule);
});

router.get('/week', async (req, res) => {
  const db = getDB();
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const schedule = await db.prepare(`
    SELECT s.*, t.name as task_name, t.category, t.priority
    FROM schedule s JOIN tasks t ON s.task_id = t.id
    WHERE s.user_id = $1 AND s.date BETWEEN $2 AND $3
    ORDER BY s.date, s.start_time
  `).all(req.userId, startOfWeek.toISOString().split('T')[0], endOfWeek.toISOString().split('T')[0]);
  res.json(schedule);
});

router.get('/month', async (req, res) => {
  const db = getDB();
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  const schedule = await db.prepare(`
    SELECT s.*, t.name as task_name, t.category, t.priority
    FROM schedule s JOIN tasks t ON s.task_id = t.id
    WHERE s.user_id = $1 AND s.date >= $2 AND s.date < $3
    ORDER BY s.date, s.start_time
  `).all(req.userId, start, end);
  res.json(schedule);
});

router.put('/:id/complete', async (req, res) => {
  const db = getDB();
  await db.prepare('UPDATE schedule SET completed = 1 WHERE id = $1 AND user_id = $2').run(req.params.id, req.userId);
  res.json({ success: true });
});

module.exports = router;
