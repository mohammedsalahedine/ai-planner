const express = require('express');
const OpenAI = require('openai');
const { getDB } = require('../db/schema');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

function calculateTimeNeeded(task, settings) {
  const remaining = (task.total_units || 0) - (task.completed_units || 0);
  if (remaining <= 0) return 0;
  switch (task.category) {
    case 'book': return remaining / (settings.reading_speed || 30);
    case 'course': return remaining / (settings.course_speed || 1);
    case 'movie': return remaining;
    case 'training': return remaining;
    default: return remaining;
  }
}

function getClient(settings) {
  const key = settings.openai_key || process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function generateAISchedule(db, userId) {
  const tasks = await db.prepare(
    "SELECT * FROM tasks WHERE user_id = $1 AND status != 'completed'"
  ).all(userId);
  const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = $1').get(userId);
  if (!settings) return { schedule: [], insights: '' };

  await db.prepare('DELETE FROM schedule WHERE user_id = $1').run(userId);

  const openai = getClient(settings);

  if (!openai) {
    const schedule = generateAlgorithmicSchedule(tasks, settings, db, userId);
    return { schedule, insights: 'تم الإنشاء بخوارزمية الأولوية (أضف مفتاح OpenAI للجدولة الذكي)' };
  }

  const taskList = tasks.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    priority: t.priority,
    start_date: t.start_date,
    end_date: t.end_date,
    total_units: t.total_units,
    unit_type: t.unit_type,
    completed_units: t.completed_units,
    remaining: (t.total_units || 0) - (t.completed_units || 0)
  }));

  const today = new Date().toISOString().split('T')[0];

  const systemPrompt = `أنت مساعد ذكاء اصطناعي متخصص في جدولة المهام وتنظيم الوقت.
مهمتك إنشاء جدول زمني ذكي ومحسن للمهام المرسلة إليك.

قواعد مهمة:
1. مرر المهام حسب الأولوية (عالية أولاً) مع مراعاة المواعيد النهائية
2. وزّع المهام على الأيام المتاحة بشكل متوازن
3. مراعاة أوقات الراحة بين المهام
4. مراعاة أيام الراحة (لا تضع مهام فيها)
5. مراعاة ساعات العمل اليومية وساعات عطلة نهاية الأسبوع
6. تقسيم المهام الكبيرة على عدة أيام
7. اقتراح أفضل ترتيب للمهام في كل يوم
8. حساب الوقت المتبقي لكل مهمة بعد الجدولة

أرجع النتيجة بصيغة JSON فقط (بدلاً markdown):
{
  "schedule": [
    {
      "task_id": <number>,
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM"
    }
  ],
  "insights": "نصيحة ذكية بالعربي عن الجدول والتحسينات المقترحة"
}

لا تكتب أي نص خارج JSON.`;

  const userPrompt = `تاريخ اليوم: ${today}

الإعدادات:
- ساعات العمل اليومية: ${settings.daily_hours} ساعة
- ساعات عمل نهاية الأسبوع: ${settings.weekend_hours} ساعة
- بداية اليوم: ${settings.day_start}
- نهاية اليوم: ${settings.day_end}
- مدة الاستراحة: ${settings.break_duration} دقيقة
- أيام الراحة: ${settings.rest_days || 'لا توجد'}
- سرعة القراءة: ${settings.reading_speed} صفحة/ساعة
- سرعة الدورات: ${settings.course_speed} درس/ساعة

المهام:
${JSON.stringify(taskList, null, 2)}

أنشئ جدولًا ذكيًا يوزّع المهام على الأيام القادمة بشكل مثالي.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4096,
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0]?.message?.content;
    const parsed = JSON.parse(content);

    const scheduleEntries = [];
    for (const entry of (parsed.schedule || [])) {
      await db.prepare(`
        INSERT INTO schedule (user_id, task_id, date, start_time, end_time)
        VALUES ($1, $2, $3, $4, $5)
      `).run(userId, entry.task_id, entry.date, entry.start_time, entry.end_time);

      const task = tasks.find(t => t.id === entry.task_id);
      scheduleEntries.push({
        task_id: entry.task_id,
        task_name: task ? task.name : 'مهمة',
        date: entry.date,
        start_time: entry.start_time,
        end_time: entry.end_time
      });
    }

    return {
      schedule: scheduleEntries,
      insights: parsed.insights || 'تم إنشاء الجدول بنجاح بالذكاء الاصطناعي'
    };
  } catch (err) {
    console.error('OpenAI scheduling error:', err.message);
    const schedule = generateAlgorithmicSchedule(tasks, settings, db, userId);
    return {
      schedule,
      insights: `تعذر الاتصال بالذكاء الاصطناعي (${err.message}). تم الإنشاء بالخوارزمية.`
    };
  }
}

function generateAlgorithmicSchedule(tasks, settings, db, userId) {
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

      db.prepare(`
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
  try {
    const db = getDB();
    const result = await generateAISchedule(db, req.userId);
    res.json({ schedule: result.schedule, count: result.schedule.length, insights: result.insights });
  } catch (err) {
    console.error('Schedule generation error:', err);
    res.status(500).json({ error: 'خطأ في إنشاء الجدول' });
  }
});

router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const schedule = await db.prepare(`
      SELECT s.*, t.name as task_name, t.category, t.priority
      FROM schedule s JOIN tasks t ON s.task_id = t.id
      WHERE s.user_id = $1 ORDER BY s.date, s.start_time
    `).all(req.userId);
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/week', async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/month', async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/complete', async (req, res) => {
  try {
    const db = getDB();
    await db.prepare('UPDATE schedule SET completed = 1 WHERE id = $1 AND user_id = $2').run(req.params.id, req.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
