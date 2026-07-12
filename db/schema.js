const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

function convertParams(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

function getDB() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
        ? { rejectUnauthorized: false }
        : false
    });
  }
  return {
    prepare(sql) {
      const pgSql = convertParams(sql);
      return {
        async run(...params) {
          const r = await pool.query(pgSql, params);
          return {
            changes: r.rowCount,
            lastInsertRowid: r.rows[0] ? r.rows[0].id : null
          };
        },
        async get(...params) {
          const r = await pool.query(pgSql, params);
          return r.rows[0] || undefined;
        },
        async all(...params) {
          const r = await pool.query(pgSql, params);
          return r.rows;
        }
      };
    },
    async exec(sql) {
      await pool.query(sql);
    }
  };
}

async function initDB() {
  const db = getDB();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
      daily_hours REAL DEFAULT 8,
      rest_days TEXT DEFAULT '[]',
      day_start TEXT DEFAULT '09:00',
      day_end TEXT DEFAULT '17:00',
      break_duration REAL DEFAULT 30,
      reading_speed REAL DEFAULT 30,
      course_speed REAL DEFAULT 1,
      weekend_hours REAL DEFAULT 4,
      theme TEXT DEFAULT 'dark'
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'custom',
      priority TEXT DEFAULT 'medium',
      start_date TEXT,
      end_date TEXT,
      total_units REAL DEFAULT 0,
      unit_type TEXT DEFAULT 'hours',
      completed_units REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS schedule (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      completed INTEGER DEFAULT 0
    );
  `);

  const existingUser = await db.prepare('SELECT id FROM users WHERE email = $1').get('admin@aiplanner.com');
  if (!existingUser) {
    const hash = bcrypt.hashSync('admin123', 10);
    const result = await db.prepare('INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id').get('Admin', 'admin@aiplanner.com', hash);
    await db.prepare('INSERT INTO user_settings (user_id) VALUES ($1)').run(result.id);
  }
}

module.exports = { getDB, initDB };
