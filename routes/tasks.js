const express = require('express');
const { getDB } = require('../db/schema');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC').all(req.userId);
    res.json(tasks);
  } catch (err) {
    console.error('Tasks list error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, category, priority, start_date, end_date, total_units, unit_type } = req.body;
    if (!name) return res.status(400).json({ error: 'Task name required' });
    const db = getDB();
    const r = await db.prepare(`
      INSERT INTO tasks (user_id, name, description, category, priority, start_date, end_date, total_units, unit_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `).get(req.userId, name, description || '', category || 'custom', priority || 'medium', start_date || null, end_date || null, total_units || 0, unit_type || 'hours');
    res.json(r);
  } catch (err) {
    console.error('Task create error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, description, category, priority, start_date, end_date, total_units, unit_type, completed_units, status } = req.body;
    const db = getDB();
    const task = await db.prepare('SELECT * FROM tasks WHERE id = $1 AND user_id = $2').get(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    await db.prepare(`
      UPDATE tasks SET name=$1, description=$2, category=$3, priority=$4, start_date=$5, end_date=$6,
      total_units=$7, unit_type=$8, completed_units=$9, status=$10 WHERE id=$11 AND user_id=$12
    `).run(
      name ?? task.name, description ?? task.description, category ?? task.category,
      priority ?? task.priority, start_date ?? task.start_date, end_date ?? task.end_date,
      total_units ?? task.total_units, unit_type ?? task.unit_type,
      completed_units ?? task.completed_units, status ?? task.status,
      req.params.id, req.userId
    );
    const updated = await db.prepare('SELECT * FROM tasks WHERE id = $1').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Task update error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();
    await db.prepare('DELETE FROM schedule WHERE task_id = $1 AND user_id = $2').run(req.params.id, req.userId);
    const result = await db.prepare('DELETE FROM tasks WHERE id = $1 AND user_id = $2').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Task delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
