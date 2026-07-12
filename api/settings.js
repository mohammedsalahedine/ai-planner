const express = require('express');
const { getDB } = require('../db/schema');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  const db = getDB();
  let settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = $1').get(req.userId);
  if (!settings) {
    await db.prepare('INSERT INTO user_settings (user_id) VALUES ($1)').run(req.userId);
    settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = $1').get(req.userId);
  }
  res.json(settings);
});

router.put('/', async (req, res) => {
  const db = getDB();
  let settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = $1').get(req.userId);
  if (!settings) {
    await db.prepare('INSERT INTO user_settings (user_id) VALUES ($1)').run(req.userId);
    settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = $1').get(req.userId);
  }
  const { daily_hours, rest_days, day_start, day_end, break_duration, reading_speed, course_speed, weekend_hours, theme } = req.body;
  await db.prepare(`
    UPDATE user_settings SET daily_hours=$1, rest_days=$2, day_start=$3, day_end=$4,
    break_duration=$5, reading_speed=$6, course_speed=$7, weekend_hours=$8, theme=$9
    WHERE user_id=$10
  `).run(
    daily_hours ?? settings.daily_hours,
    JSON.stringify(rest_days) ?? settings.rest_days,
    day_start ?? settings.day_start,
    day_end ?? settings.day_end,
    break_duration ?? settings.break_duration,
    reading_speed ?? settings.reading_speed,
    course_speed ?? settings.course_speed,
    weekend_hours ?? settings.weekend_hours,
    theme ?? settings.theme,
    req.userId
  );
  const updated = await db.prepare('SELECT * FROM user_settings WHERE user_id = $1').get(req.userId);
  res.json(updated);
});

module.exports = router;
