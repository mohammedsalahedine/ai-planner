const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db/schema');
const { JWT_SECRET, auth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  const db = getDB();
  const existing = await db.prepare('SELECT id FROM users WHERE email = $1').get(email);
  if (existing) {
    return res.status(400).json({ error: 'Email already exists' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = await db.prepare('INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id').get(name, email, hash);
  await db.prepare('INSERT INTO user_settings (user_id) VALUES ($1)').run(result.id);
  const token = jwt.sign({ userId: result.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: result.id, name, email } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = getDB();
  const user = await db.prepare('SELECT * FROM users WHERE email = $1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

router.get('/me', auth, async (req, res) => {
  const db = getDB();
  const user = await db.prepare('SELECT id, name, email FROM users WHERE id = $1').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
