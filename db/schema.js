const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

let data = { users: [], user_settings: [], tasks: [], schedule: [] };
let autoId = { users: 1, user_settings: 1, tasks: 1, schedule: 1 };

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      data = JSON.parse(raw);
      for (const table of ['users', 'user_settings', 'tasks', 'schedule']) {
        if (data[table] && data[table].length > 0) {
          const maxId = Math.max(...data[table].map(r => r.id || 0));
          autoId[table] = maxId + 1;
        }
      }
    }
  } catch (e) {
    console.error('Failed to load DB:', e.message);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save DB:', e.message);
  }
}

function initSync() {
  if (!fs.existsSync(DB_FILE)) {
    saveDB();
  } else {
    loadDB();
  }
  const existing = data.users.find(u => u.email === 'admin@aiplanner.com');
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    data.users.push({
      id: autoId.users++,
      name: 'Admin',
      email: 'admin@aiplanner.com',
      password: hash,
      created_at: new Date().toISOString()
    });
    data.user_settings.push({
      id: autoId.user_settings++,
      user_id: 1,
      daily_hours: 8,
      rest_days: '[]',
      day_start: '09:00',
      day_end: '17:00',
      break_duration: 30,
      reading_speed: 30,
      course_speed: 1,
      weekend_hours: 4,
      theme: 'dark',
      ai_key: '',
      ai_provider: 'gemini'
    });
    saveDB();
  }
}

function resolveParam(sql, params) {
  let i = 0;
  return sql.replace(/\$\d+/g, () => params[i++] ?? null);
}

function matchRow(row, params, paramStart) {
  const pairs = [];
  const re = /\$(\d+)/g;
  let m;
  const sql = params._sql || '';
  while ((m = re.exec(sql)) !== null) {
    pairs.push({ idx: parseInt(m[1]), val: params._values[parseInt(m[1]) - 1] });
  }
  return pairs.every(p => {
    const key = p.idx;
    return true;
  });
}

function getDB() {
  return {
    prepare(sql) {
      return {
        async run(...params) {
          loadDB();
          const tableName = extractTable(sql);
          if (!tableName) return { changes: 0, lastInsertRowid: null };

          if (sql.trim().toUpperCase().startsWith('INSERT')) {
            return insertRow(tableName, sql, params);
          } else if (sql.trim().toUpperCase().startsWith('UPDATE')) {
            return updateRows(tableName, sql, params);
          } else if (sql.trim().toUpperCase().startsWith('DELETE')) {
            return deleteRows(tableName, sql, params);
          }
          return { changes: 0, lastInsertRowid: null };
        },
        async get(...params) {
          loadDB();
          const tableName = extractTable(sql);
          if (!tableName) return undefined;

          if (sql.trim().toUpperCase().startsWith('INSERT') && sql.toUpperCase().includes('RETURNING')) {
            const result = insertRow(tableName, sql, params);
            const inserted = data[tableName].find(r => r.id === result.lastInsertRowid);
            return inserted;
          }

          const rows = selectRows(sql, params);
          return rows[0] || undefined;
        },
        async all(...params) {
          loadDB();
          return selectRows(sql, params);
        }
      };
    },
    async exec(sql) {
      loadDB();
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        if (stmt.toUpperCase().startsWith('CREATE TABLE')) {
          // no-op for JSON store
        } else if (stmt.toUpperCase().includes('DO $$') || stmt.toUpperCase().includes('ALTER TABLE')) {
          // no-op for JSON store
        }
      }
    }
  };
}

function extractTable(sql) {
  const upper = sql.toUpperCase();
  if (upper.includes('FROM USERS') || upper.includes('INTO USERS')) return 'users';
  if (upper.includes('FROM USER_SETTINGS') || upper.includes('INTO USER_SETTINGS')) return 'user_settings';
  if (upper.includes('FROM TASKS') || upper.includes('INTO TASKS')) return 'tasks';
  if (upper.includes('FROM SCHEDULE') || upper.includes('INTO SCHEDULE')) return 'schedule';
  return null;
}

function selectRows(sql, params) {
  const upper = sql.toUpperCase();
  let tableName = extractTable(sql);
  if (!tableName) return [];

  let rows = [...data[tableName]];
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+GROUP|\s+LIMIT|$)/is);
  if (whereMatch) {
    const conditions = parseConditions(whereMatch[1], params);
    rows = rows.filter(row => conditions.every(c => evaluateCondition(row, c)));
  }

  const orderMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/is);
  if (orderMatch) {
    const cols = orderMatch[1].split(',').map(c => {
      const parts = c.trim().split(/\s+/);
      return { col: parts[0], dir: (parts[1] || 'ASC').toUpperCase() };
    });
    rows.sort((a, b) => {
      for (const { col, dir } of cols) {
        const av = a[col], bv = b[col];
        if (av === bv) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = av < bv ? -1 : 1;
        return dir === 'DESC' ? -cmp : cmp;
      }
      return 0;
    });
  }

  return rows;
}

function parseConditions(whereStr, params) {
  const conditions = [];
  const parts = whereStr.split(/\s+AND\s+/i);
  for (const part of parts) {
    const m = part.match(/(\w+)\s*(=|!=|>|<|>=|<=|LIKE|IN)\s*(.+)/i);
    if (!m) continue;
    const col = m[1];
    const op = m[2].toUpperCase();
    let val = m[3].trim();
    if (val.match(/^\$\d+$/)) {
      const idx = parseInt(val.slice(1)) - 1;
      val = params[idx];
    }
    if (val === 'NULL') val = null;
    conditions.push({ col, op, val });
  }
  return conditions;
}

function evaluateCondition(row, cond) {
  const rv = row[cond.col];
  const cv = cond.val;
  switch (cond.op) {
    case '=':
      if (cv === null) return rv == null;
      return rv == cv;
    case '!=':
      if (cv === null) return rv != null;
      return rv != cv;
    case '>': return rv > cv;
    case '<': return rv < cv;
    case '>=': return rv >= cv;
    case '<=': return rv <= cv;
    case 'LIKE':
      const pattern = cv.replace(/%/g, '.*');
      return new RegExp(`^${pattern}$`, 'i').test(String(rv));
    default: return true;
  }
}

function insertRow(tableName, sql, params) {
  const colMatch = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i);
  if (!colMatch) return { changes: 0, lastInsertRowid: null };
  const columns = colMatch[1].split(',').map(c => c.trim());
  const paramValues = [];
  const paramRe = /\$(\d+)/g;
  let m;
  const valuesPart = sql.split(/VALUES/i)[1] || '';
  while ((m = paramRe.exec(valuesPart)) !== null) {
    const idx = parseInt(m[1]) - 1;
    paramValues.push(params[idx]);
  }

  const row = { id: autoId[tableName]++ };
  columns.forEach((col, i) => {
    row[col] = paramValues[i] !== undefined ? paramValues[i] : null;
  });
  if (!row.created_at) row.created_at = new Date().toISOString();

  data[tableName].push(row);
  saveDB();
  return { changes: 1, lastInsertRowid: row.id };
}

function updateRows(tableName, sql, params) {
  const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/is);
  if (!setMatch) return { changes: 0, lastInsertRowid: null };

  const setParts = setMatch[1].split(',');
  const setAssignments = [];
  for (const part of setParts) {
    const m = part.trim().match(/(\w+)\s*=\s*\$(\d+)/);
    if (m) {
      setAssignments.push({ col: m[1], paramIdx: parseInt(m[2]) - 1 });
    }
  }

  const whereMatch = sql.match(/WHERE\s+(.+?)$/is);
  if (!whereMatch) return { changes: 0, lastInsertRowid: null };

  const conditions = parseConditions(whereMatch[1], params);
  let count = 0;

  for (const row of data[tableName]) {
    if (conditions.every(c => evaluateCondition(row, c))) {
      for (const { col, paramIdx } of setAssignments) {
        row[col] = params[paramIdx];
      }
      count++;
    }
  }

  if (count > 0) saveDB();
  return { changes: count, lastInsertRowid: null };
}

function deleteRows(tableName, sql, params) {
  const whereMatch = sql.match(/WHERE\s+(.+?)$/is);
  if (!whereMatch) {
    const len = data[tableName].length;
    data[tableName] = [];
    if (len > 0) saveDB();
    return { changes: len, lastInsertRowid: null };
  }

  const conditions = parseConditions(whereMatch[1], params);
  const before = data[tableName].length;
  data[tableName] = data[tableName].filter(row => !conditions.every(c => evaluateCondition(row, c)));
  const deleted = before - data[tableName].length;
  if (deleted > 0) saveDB();
  return { changes: deleted, lastInsertRowid: null };
}

module.exports = {
  getDB,
  initDB: async () => { initSync(); },
  initSync
};
