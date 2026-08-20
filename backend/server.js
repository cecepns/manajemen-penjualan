require('dotenv/config');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');


const UPLOAD_DIR = path.join(__dirname, 'uploads-manajemen-penjualan');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-ganti-di-production';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const pool = mysql.createPool({
  host: "localhost",
  user: "kinq6231_manajemen_penjualan",
  password: "kinq6231_manajemen_penjualan",
  database: "kinq6231_manajemen_penjualan",
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  dateStrings: true,
});

const app = express.Router();


app.use(
  '/uploads',
  express.static(UPLOAD_DIR, { fallthrough: true, maxAge: '1d' })
);


const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname) || ''}`;
    cb(null, safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

function orderUploadMaybe(req, res, next) {
  if (req.is('multipart/form-data')) {
    return upload.single('file')(req, res, next);
  }
  next();
}

function removeUploadedFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // best effort cleanup
  }
}

function productPhotoUploadMaybe(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  return upload.single('photo')(req, res, (err) => {
    if (err) return next(err);
    if (req.file && !String(req.file.mimetype || '').startsWith('image/')) {
      removeUploadedFile(req.file.path);
      return res.status(400).json({ message: 'File foto harus berupa gambar' });
    }
    next();
  });
}

function paginate(page, limit = 10) {
  const p = Math.max(1, parseInt(String(page), 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 10));
  return { page: p, limit: l, offset: (p - 1) * l };
}

function payoutLabel(row) {
  if (row.nominal_cair == null) return 'belum_cair';
  return 'sudah_cair';
}

function labaForRow(row, totalOrderModal = null) {
  const modal = totalOrderModal != null ? Number(totalOrderModal) : Number(row.qty) * Number(row.hpp_snapshot);
  const nc = row.nominal_cair != null ? Number(row.nominal_cair) : null;
  if (row.status === 'retur') return Math.min(0, (nc ?? 0) - modal);
  if (nc == null) return null;
  return nc - modal;
}

/** HPP snapshot baris order — karyawan tidak boleh mengubah HPP manual. */
function orderLineHppSnapshot(role, it, { productHpp, prevRow } = {}) {
  if (productHpp != null) return Number(productHpp) || 0;
  if (role === 'karyawan')
    return prevRow != null ? Number(prevRow.hpp_snapshot) || 0 : 0;
  return Number(it.hpp_snapshot) || 0;
}

/** Kunci grup pesanan (satu tampilan list) — samakan dengan GROUP BY list. */
function orderDateKeyDb(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10);
}

async function ensureTablesAndSchema() {
  try {
    // 1. Tabel activity_logs: WHO -> WHAT -> WHEN -> BEFORE -> AFTER -> REFERENCE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED DEFAULT NULL,
        user_name VARCHAR(191) NOT NULL,
        user_role VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(100) DEFAULT NULL,
        reference VARCHAR(255) DEFAULT NULL,
        description TEXT NOT NULL,
        before_data LONGTEXT DEFAULT NULL,
        after_data LONGTEXT DEFAULT NULL,
        ip_address VARCHAR(100) DEFAULT NULL,
        user_agent VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
        KEY idx_activity_logs_user (user_id),
        KEY idx_activity_logs_entity (entity_type),
        KEY idx_activity_logs_action (action),
        KEY idx_activity_logs_created_at (created_at),
        KEY idx_activity_logs_ref (reference)
      ) ENGINE=InnoDB;
    `);

    // 2. Kolom status online pada tabel users jika belum ada
    const [existingCols] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
    `);
    const colSet = new Set(existingCols.map((c) => c.COLUMN_NAME));

    if (!colSet.has('last_active_at')) {
      await pool.query('ALTER TABLE users ADD COLUMN last_active_at DATETIME DEFAULT NULL');
    }
    if (!colSet.has('last_login_at')) {
      await pool.query('ALTER TABLE users ADD COLUMN last_login_at DATETIME DEFAULT NULL');
    }
    if (!colSet.has('last_logout_at')) {
      await pool.query('ALTER TABLE users ADD COLUMN last_logout_at DATETIME DEFAULT NULL');
    }
    if (!colSet.has('is_online')) {
      await pool.query('ALTER TABLE users ADD COLUMN is_online TINYINT(1) NOT NULL DEFAULT 0');
    }
    if (!colSet.has('session_start_at')) {
      await pool.query('ALTER TABLE users ADD COLUMN session_start_at DATETIME DEFAULT NULL');
    }
  } catch (err) {
    console.error('Error ensuring tables/schema:', err.message);
  }
}

async function ensureDefaultAdmin() {
  const [rows] = await pool.query('SELECT id FROM users LIMIT 1');
  if (rows.length) return;
  const hash = await bcrypt.hash('admin123', 10);
  await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
    ['Administrator', 'admin@local.test', hash, 'owner']
  );
  console.log('Default owner dibuat: admin@local.test / admin123');
}

ensureTablesAndSchema().catch(console.error);
ensureDefaultAdmin().catch(console.error);

/** Helper pencatat aktivitas WHO -> WHAT -> WHEN -> BEFORE -> AFTER -> REFERENCE */
async function logActivity({
  req = null,
  userId = null,
  userName = null,
  userRole = null,
  action,
  entityType,
  entityId = null,
  reference = null,
  description,
  beforeData = null,
  afterData = null,
}) {
  try {
    const uid = userId ?? req?.user?.id ?? null;
    const uname = userName ?? req?.user?.name ?? 'Sistem';
    const urole = userRole ?? req?.user?.role ?? 'system';

    const beforeStr =
      beforeData != null
        ? typeof beforeData === 'string'
          ? beforeData
          : JSON.stringify(beforeData)
        : null;
    const afterStr =
      afterData != null
        ? typeof afterData === 'string'
          ? afterData
          : JSON.stringify(afterData)
        : null;
    const ip = req
      ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').slice(0, 100)
      : null;
    const ua = req ? (req.headers['user-agent'] || '').slice(0, 255) : null;

    await pool.query(
      `INSERT INTO activity_logs 
       (user_id, user_name, user_role, action, entity_type, entity_id, reference, description, before_data, after_data, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid,
        uname,
        urole,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        reference != null ? String(reference) : null,
        description,
        beforeStr,
        afterStr,
        ip,
        ua,
      ]
    );

    if (uid) {
      await pool.query(
        'UPDATE users SET last_active_at = NOW(), is_online = 1 WHERE id = ?',
        [uid]
      ).catch(() => {});
    }
  } catch (e) {
    console.error('Gagal mencatat log aktivitas:', e);
  }
}

function authRequired(req, res, next) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (req.user?.id) {
      pool
        .query('UPDATE users SET last_active_at = NOW(), is_online = 1 WHERE id = ?', [
          req.user.id,
        ])
        .catch(() => {});
    }
    next();
  } catch {
    return res.status(401).json({ message: 'Token tidak valid' });
  }
}

function staffExceptChecker(req, res, next) {
  if (req.user?.role === 'checker_pengiriman')
    return res.status(403).json({
      message: 'Akses tidak tersedia untuk role checker pengiriman',
    });
  next();
}

function ownerOrAdmin(req, res, next) {
  const r = req.user?.role;
  if (r !== 'owner' && r !== 'admin')
    return res.status(403).json({ message: 'Hanya owner atau admin' });
  next();
}

function ownerOnly(req, res, next) {
  if (req.user?.role !== 'owner')
    return res.status(403).json({ message: 'Hanya owner' });
  next();
}

/* ——— Auth Routes ——— */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ message: 'Email dan password wajib' });
    const [users] = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
      [String(email).trim().toLowerCase()]
    );
    const u = users[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash)))
      return res.status(401).json({ message: 'Email atau password salah' });
    
    const token = jwt.sign(
      { id: u.id, email: u.email, role: u.role, name: u.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await pool.query(
      `UPDATE users 
       SET is_online = 1, 
           last_login_at = NOW(), 
           last_active_at = NOW(), 
           session_start_at = NOW() 
       WHERE id = ?`,
      [u.id]
    ).catch(() => {});

    await logActivity({
      req,
      userId: u.id,
      userName: u.name,
      userRole: u.role,
      action: 'LOGIN',
      entityType: 'auth',
      entityId: u.id,
      reference: u.email,
      description: `User ${u.name} berhasil login ke dalam sistem`,
      beforeData: null,
      afterData: { status: 'Online', role: u.role },
    });

    res.json({
      token,
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal login' });
  }
});

app.post('/api/auth/logout', authRequired, async (req, res) => {
  try {
    const uid = req.user?.id;
    if (uid) {
      await pool.query(
        `UPDATE users 
         SET is_online = 0, 
             last_logout_at = NOW(), 
             last_active_at = NOW() 
         WHERE id = ?`,
        [uid]
      ).catch(() => {});

      await logActivity({
        req,
        userId: uid,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'LOGOUT',
        entityType: 'auth',
        entityId: uid,
        reference: req.user.email,
        description: `User ${req.user.name} logout dari sistem`,
        beforeData: { status: 'Online' },
        afterData: { status: 'Offline' },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('Logout error:', e);
    res.status(500).json({ message: 'Gagal logout' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, role, last_active_at, last_login_at, is_online FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json(rows[0] || null);
});

/* ——— User Online Status & Heartbeat ——— */
app.post('/api/user-status/heartbeat', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    await pool.query(
      `UPDATE users 
       SET is_online = 1, 
           last_active_at = NOW(),
           session_start_at = COALESCE(session_start_at, NOW())
       WHERE id = ?`,
      [uid]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('Heartbeat error:', e);
    res.status(500).json({ message: 'Gagal update heartbeat' });
  }
});

app.get('/api/user-status/online-users', authRequired, async (req, res) => {
  try {
    const { search = '', role = '', status = '', page = 1, limit = 10 } = req.query;
    const { page: p, limit: l, offset } = paginate(page, limit);

    const [allUsers] = await pool.query(`
      SELECT 
        id, name, email, role,
        last_active_at, last_login_at, last_logout_at, is_online, session_start_at,
        TIMESTAMPDIFF(SECOND, last_active_at, NOW()) AS seconds_since_active,
        TIMESTAMPDIFF(SECOND, session_start_at, NOW()) AS current_session_seconds,
        TIMESTAMPDIFF(SECOND, session_start_at, last_logout_at) AS last_session_seconds,
        (DATE(last_active_at) = CURDATE() OR DATE(last_login_at) = CURDATE()) AS is_active_today
      FROM users
      ORDER BY 
        CASE 
          WHEN is_online = 1 AND TIMESTAMPDIFF(SECOND, last_active_at, NOW()) <= 300 THEN 1
          WHEN is_online = 1 AND TIMESTAMPDIFF(SECOND, last_active_at, NOW()) <= 900 THEN 2
          ELSE 3
        END ASC,
        last_active_at DESC
    `);

    function formatDuration(totalSeconds) {
      if (!totalSeconds || totalSeconds < 0) return '00:00:00';
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return [
        String(hours).padStart(2, '0'),
        String(minutes).padStart(2, '0'),
        String(seconds).padStart(2, '0'),
      ].join(':');
    }

    let onlineCount = 0;
    let idleCount = 0;
    let offlineCount = 0;
    let activeTodayCount = 0;

    const mapped = allUsers.map((u) => {
      const sec = u.seconds_since_active;
      let userStatus = 'offline';
      if (u.is_online && sec !== null && sec <= 300) {
        userStatus = 'online';
      } else if (u.is_online && sec !== null && sec <= 900) {
        userStatus = 'idle';
      } else {
        userStatus = 'offline';
      }

      if (userStatus === 'online') onlineCount++;
      else if (userStatus === 'idle') idleCount++;
      else offlineCount++;

      if (u.is_active_today) activeTodayCount++;

      let sessionDurationSeconds = 0;
      if (userStatus === 'online' || userStatus === 'idle') {
        sessionDurationSeconds = u.current_session_seconds || 0;
      } else {
        if (u.last_session_seconds && u.last_session_seconds > 0) {
          sessionDurationSeconds = u.last_session_seconds;
        } else if (u.session_start_at && u.last_active_at) {
          const diff = Math.floor(
            (new Date(u.last_active_at) - new Date(u.session_start_at)) / 1000
          );
          sessionDurationSeconds = diff > 0 ? diff : 0;
        }
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: userStatus,
        last_active_at: u.last_active_at,
        last_login_at: u.last_login_at,
        last_logout_at: u.last_logout_at,
        session_duration: formatDuration(sessionDurationSeconds),
        session_seconds: sessionDurationSeconds,
      };
    });

    let filtered = mapped;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    if (role.trim()) {
      filtered = filtered.filter((u) => u.role === role);
    }
    if (status.trim()) {
      filtered = filtered.filter((u) => u.status === status);
    }

    const total = filtered.length;
    const data = filtered.slice(offset, offset + l);

    res.json({
      summary: {
        online: onlineCount,
        idle: idleCount,
        offline: offlineCount,
        total_user: allUsers.length,
        active_today: activeTodayCount,
      },
      data,
      page: p,
      limit: l,
      total,
    });
  } catch (e) {
    console.error('Error getting online users:', e);
    res.status(500).json({ message: 'Gagal memuat status user' });
  }
});

/* ——— Activity Logs (Owner Only) ——— */
app.get('/api/activity-logs', authRequired, staffExceptChecker, ownerOnly, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 15,
      search = '',
      user_id = '',
      entity_type = '',
      action = '',
      start_date = '',
      end_date = '',
    } = req.query;

    const { page: p, limit: l, offset } = paginate(page, limit);

    const conditions = ['1=1'];
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push('(al.description LIKE ? OR al.reference LIKE ? OR al.user_name LIKE ?)');
      params.push(q, q, q);
    }

    if (user_id) {
      conditions.push('al.user_id = ?');
      params.push(user_id);
    }

    if (entity_type) {
      conditions.push('al.entity_type = ?');
      params.push(entity_type);
    }

    if (action) {
      conditions.push('al.action = ?');
      params.push(action);
    }

    if (start_date) {
      conditions.push('DATE(al.created_at) >= ?');
      params.push(start_date);
    }

    if (end_date) {
      conditions.push('DATE(al.created_at) <= ?');
      params.push(end_date);
    }

    const whereClause = conditions.join(' AND ');

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM activity_logs al WHERE ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT 
        al.id, al.user_id, al.user_name, al.user_role, al.action, al.entity_type, 
        al.entity_id, al.reference, al.description, al.before_data, al.after_data, 
        al.ip_address, al.user_agent, al.created_at
       FROM activity_logs al
       WHERE ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, l, offset]
    );

    const parsedRows = rows.map((r) => {
      let before = r.before_data;
      let after = r.after_data;
      try {
        if (before && (before.startsWith('{') || before.startsWith('['))) {
          before = JSON.parse(before);
        }
      } catch {}
      try {
        if (after && (after.startsWith('{') || after.startsWith('['))) {
          after = JSON.parse(after);
        }
      } catch {}
      return {
        ...r,
        before_parsed: before,
        after_parsed: after,
      };
    });

    res.json({
      data: parsedRows,
      page: p,
      limit: l,
      total,
    });
  } catch (e) {
    console.error('Error fetching activity logs:', e);
    res.status(500).json({ message: 'Gagal memuat activity log' });
  }
});

app.get('/api/activity-logs/:id', authRequired, staffExceptChecker, ownerOnly, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM activity_logs WHERE id = ?', [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ message: 'Log tidak ditemukan' });
    const log = rows[0];
    try {
      if (log.before_data && (log.before_data.startsWith('{') || log.before_data.startsWith('['))) {
        log.before_parsed = JSON.parse(log.before_data);
      }
    } catch {}
    try {
      if (log.after_data && (log.after_data.startsWith('{') || log.after_data.startsWith('['))) {
        log.after_parsed = JSON.parse(log.after_data);
      }
    } catch {}
    res.json(log);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat detail log' });
  }
});

/* ——— Stores ——— */
app.get('/api/stores', authRequired, staffExceptChecker, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const { page: p, limit: l, offset } = paginate(page, limit);
    const q = `%${String(search).trim()}%`;
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS c FROM stores WHERE name LIKE ?',
      [q]
    );
    const total = countRows[0].c;
    const [rows] = await pool.query(
      'SELECT id, name, created_at FROM stores WHERE name LIKE ? ORDER BY name ASC LIMIT ? OFFSET ?',
      [q, l, offset]
    );
    res.json({ data: rows, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat toko' });
  }
});

app.post('/api/stores', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ message: 'Nama toko wajib' });
    const [r] = await pool.query('INSERT INTO stores (name) VALUES (?)', [
      name.trim(),
    ]);

    await logActivity({
      req,
      action: 'CREATE_STORE',
      entityType: 'stores',
      entityId: r.insertId,
      reference: name.trim(),
      description: `Menambahkan toko baru: ${name.trim()}`,
      beforeData: null,
      afterData: { id: r.insertId, name: name.trim() },
    });

    res.status(201).json({ id: r.insertId, name: name.trim() });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ message: 'Nama toko sudah ada' });
    console.error(e);
    res.status(500).json({ message: 'Gagal menyimpan toko' });
  }
});

app.put('/api/stores/:id', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ message: 'Nama toko wajib' });

    const [oldRows] = await pool.query('SELECT * FROM stores WHERE id = ?', [req.params.id]);
    const oldStore = oldRows[0];

    await pool.query('UPDATE stores SET name = ? WHERE id = ?', [
      name.trim(),
      req.params.id,
    ]);

    await logActivity({
      req,
      action: 'UPDATE_STORE',
      entityType: 'stores',
      entityId: req.params.id,
      reference: name.trim(),
      description: `Mengubah nama toko dari "${oldStore?.name || ''}" menjadi "${name.trim()}"`,
      beforeData: { name: oldStore?.name },
      afterData: { name: name.trim() },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal update toko' });
  }
});

app.delete('/api/stores/:id', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const [oldRows] = await pool.query('SELECT * FROM stores WHERE id = ?', [req.params.id]);
    const oldStore = oldRows[0];

    await pool.query('DELETE FROM stores WHERE id = ?', [req.params.id]);

    await logActivity({
      req,
      action: 'DELETE_STORE',
      entityType: 'stores',
      entityId: req.params.id,
      reference: oldStore?.name || `ID #${req.params.id}`,
      description: `Menghapus toko "${oldStore?.name || ''}"`,
      beforeData: oldStore,
      afterData: null,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal hapus toko (mungkin masih dipakai)' });
  }
});

app.get('/api/stores/all', authRequired, staffExceptChecker, async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name FROM stores ORDER BY name ASC'
  );
  res.json(rows);
});

/* ——— Products ——— */
app.get('/api/products', authRequired, staffExceptChecker, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', sort_stock } = req.query;
    const { page: p, limit: l, offset } = paginate(page, limit);
    const q = `%${String(search).trim()}%`;
    const where = '(p.name LIKE ? OR IFNULL(p.barcode,"") LIKE ?)';
    const params = [q, q];
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM products p WHERE ${where}`,
      params
    );
    const total = countRows[0].c;
    let orderSql = 'ORDER BY p.updated_at DESC';
    if (sort_stock === 'asc') orderSql = 'ORDER BY p.stock ASC, p.updated_at DESC';
    else if (sort_stock === 'desc') orderSql = 'ORDER BY p.stock DESC, p.updated_at DESC';
    const [rows] = await pool.query(
      `SELECT p.* FROM products p
       WHERE ${where}
       ${orderSql} LIMIT ? OFFSET ?`,
      [...params, l, offset]
    );
    res.json({ data: rows, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat produk' });
  }
});

app.get('/api/products/by-barcode', authRequired, staffExceptChecker, async (req, res) => {
  const { barcode } = req.query;
  if (!barcode?.trim())
    return res.status(400).json({ message: 'Barcode wajib' });
  const [rows] = await pool.query(
    'SELECT p.* FROM products p WHERE p.barcode = ? LIMIT 1',
    [String(barcode).trim()]
  );
  res.json(rows[0] || null);
});

app.get('/api/products/:id', authRequired, staffExceptChecker, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ? LIMIT 1', [
    req.params.id,
  ]);
  if (!rows[0]) return res.status(404).json({ message: 'Tidak ada' });
  res.json(rows[0]);
});

app.post('/api/products/:id/stock-in', authRequired, staffExceptChecker, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { qty, notes } = req.body || {};
    const added = Number(qty) || 0;
    if (!Number.isFinite(added) || added <= 0)
      return res.status(400).json({ message: 'Jumlah stok masuk harus lebih dari 0' });

    await conn.beginTransaction();
    const [prows] = await conn.query(
      'SELECT id, stock FROM products WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    const current = prows[0];
    if (!current) {
      await conn.rollback();
      return res.status(404).json({ message: 'Produk tidak ada' });
    }
    const before = Number(current.stock) || 0;
    const after = before + added;

    await conn.query('UPDATE products SET stock = ? WHERE id = ?', [after, req.params.id]);
    await conn.query(
      `INSERT INTO stock_in_history
        (product_id, qty_before, qty_added, qty_after, notes, created_by)
       VALUES (?,?,?,?,?,?)`,
      [
        req.params.id,
        before,
        added,
        after,
        notes?.trim() || null,
        req.user?.id || null,
      ]
    );

    await conn.commit();

    await logActivity({
      req,
      action: 'STOCK_IN',
      entityType: 'products',
      entityId: req.params.id,
      reference: current.name || `ID #${req.params.id}`,
      description: `Menambahkan stok masuk sebanyak +${added} pcs (Stok: ${before} → ${after})`,
      beforeData: { stock: before },
      afterData: { stock: after, added, notes: notes?.trim() || null },
    });

    res.status(201).json({ ok: true, qty_before: before, qty_after: after });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Gagal menyimpan stok masuk' });
  } finally {
    conn.release();
  }
});

app.post('/api/stock-audit', authRequired, staffExceptChecker, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { items, notes, audit_date } = req.body || {};
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ message: 'Minimal satu baris produk' });

    let auditDate = typeof audit_date === 'string' ? audit_date.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(auditDate)) {
      auditDate = new Date().toISOString().slice(0, 10);
    }

    const sessionNotes = notes?.trim() ? String(notes).trim().slice(0, 500) : null;

    await conn.beginTransaction();

    let changed = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const productId = Number(it.product_id);
      const newQty = Number(it.new_qty);
      if (!productId || !Number.isFinite(newQty) || newQty < 0) {
        await conn.rollback();
        return res.status(400).json({
          message: `Baris ${i + 1}: produk atau stok baru tidak valid`,
        });
      }
      const [prows] = await conn.query(
        'SELECT id, stock FROM products WHERE id = ? FOR UPDATE',
        [productId]
      );
      const pr = prows[0];
      if (!pr) {
        await conn.rollback();
        return res.status(400).json({ message: `Baris ${i + 1}: produk tidak ditemukan` });
      }
      const before = Number(pr.stock) || 0;
      const after = Math.floor(newQty);
      if (before === after) continue;

      await conn.query('UPDATE products SET stock = ? WHERE id = ?', [after, productId]);
      await conn.query(
        `INSERT INTO stock_audit_history
          (product_id, qty_before, qty_after, qty_delta, session_notes, audit_date, created_by)
         VALUES (?,?,?,?,?,?,?)`,
        [
          productId,
          before,
          after,
          after - before,
          sessionNotes,
          auditDate,
          req.user?.id || null,
        ]
      );
      changed += 1;
    }

    if (!changed) {
      await conn.rollback();
      return res.status(400).json({ message: 'Tidak ada perubahan stok (nilai sama dengan sekarang)' });
    }

    await conn.commit();

    await logActivity({
      req,
      action: 'STOCK_AUDIT',
      entityType: 'products',
      reference: `Audit ${auditDate}`,
      description: `Melakukan audit stok fisik untuk ${changed} item produk (Tgl: ${auditDate})`,
      beforeData: null,
      afterData: { total_items: changed, notes: sessionNotes, audit_date: auditDate },
    });

    res.status(201).json({ ok: true, rows: changed });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Gagal menyimpan audit stok' });
  } finally {
    conn.release();
  }
});

app.get('/api/stock-audit-history', authRequired, staffExceptChecker, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const { page: p, limit: l, offset } = paginate(page, limit);
    const q = `%${String(search).trim()}%`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM stock_audit_history h
       JOIN products p ON p.id = h.product_id
       LEFT JOIN users u ON u.id = h.created_by
       WHERE p.name LIKE ? OR IFNULL(p.barcode,'') LIKE ? OR IFNULL(h.session_notes,'') LIKE ? OR IFNULL(u.name,'') LIKE ?`,
      [q, q, q, q]
    );
    const total = countRows[0].c;

    const [rows] = await pool.query(
      `SELECT h.id, h.product_id, h.qty_before, h.qty_after, h.qty_delta, h.session_notes, h.audit_date, h.created_at,
              p.name AS product_name, p.barcode AS product_barcode, u.name AS created_by_name
       FROM stock_audit_history h
       JOIN products p ON p.id = h.product_id
       LEFT JOIN users u ON u.id = h.created_by
       WHERE p.name LIKE ? OR IFNULL(p.barcode,'') LIKE ? OR IFNULL(h.session_notes,'') LIKE ? OR IFNULL(u.name,'') LIKE ?
       ORDER BY h.id DESC
       LIMIT ? OFFSET ?`,
      [q, q, q, q, l, offset]
    );

    res.json({ data: rows, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat histori audit stok' });
  }
});

app.get('/api/products/:id/stock-in-history', authRequired, staffExceptChecker, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT h.id, h.product_id, h.qty_before, h.qty_added, h.qty_after, h.notes, h.created_at,
              u.name AS created_by_name
       FROM stock_in_history h
       LEFT JOIN users u ON u.id = h.created_by
       WHERE h.product_id = ?
       ORDER BY h.id DESC
       LIMIT 50`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat histori stok masuk' });
  }
});

app.get('/api/products/:id/stock-history', authRequired, staffExceptChecker, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!productId)
      return res.status(400).json({ message: 'Produk tidak valid' });

    const { page = 1, limit = 10 } = req.query;
    const { page: p, limit: l, offset } = paginate(page, limit);

    const [products] = await pool.query(
      'SELECT id, name, barcode, photo_url, stock, updated_at FROM products WHERE id = ? LIMIT 1',
      [productId]
    );
    const product = products[0];
    if (!product) return res.status(404).json({ message: 'Produk tidak ada' });

    const historyUnion = `(
        SELECT
          'stock_out' AS type,
          o.id AS ref_id,
          o.order_date AS happened_at,
          o.qty AS qty_delta,
          o.order_no,
          o.status AS order_status,
          s.name AS store_name,
          o.notes AS notes,
          NULL AS created_by_name
        FROM orders o
        JOIN stores s ON s.id = o.store_id
        WHERE o.product_id = ?
      )
      UNION ALL
      (
        SELECT
          'stock_in' AS type,
          h.id AS ref_id,
          h.created_at AS happened_at,
          h.qty_added AS qty_delta,
          NULL AS order_no,
          NULL AS order_status,
          NULL AS store_name,
          h.notes AS notes,
          u.name AS created_by_name
        FROM stock_in_history h
        LEFT JOIN users u ON u.id = h.created_by
        WHERE h.product_id = ?
      )
      UNION ALL
      (
        SELECT
          'audit' AS type,
          a.id AS ref_id,
          a.created_at AS happened_at,
          a.qty_delta AS qty_delta,
          NULL AS order_no,
          NULL AS order_status,
          NULL AS store_name,
          a.session_notes AS notes,
          u.name AS created_by_name
        FROM stock_audit_history a
        LEFT JOIN users u ON u.id = a.created_by
        WHERE a.product_id = ?
      )`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM (${historyUnion}) hist`,
      [productId, productId, productId]
    );
    const total = countRows[0].c;

    const [rows] = await pool.query(
      `SELECT * FROM (${historyUnion}) hist
       ORDER BY happened_at DESC, ref_id DESC
       LIMIT ? OFFSET ?`,
      [productId, productId, productId, l, offset]
    );

    res.json({
      product,
      data: rows.map((r) => ({
        ...r,
        happened_at:
          r.type === 'stock_out'
            ? orderDateKeyDb(r.happened_at)
            : r.happened_at,
        qty_delta: Number(r.qty_delta) || 0,
      })),
      page: p,
      limit: l,
      total,
      totalPages: Math.max(1, Math.ceil(total / l)),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat histori produk' });
  }
});

app.get('/api/stock-in-history', authRequired, staffExceptChecker, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const { page: p, limit: l, offset } = paginate(page, limit);
    const q = `%${String(search).trim()}%`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM stock_in_history h
       JOIN products p ON p.id = h.product_id
       LEFT JOIN users u ON u.id = h.created_by
       WHERE p.name LIKE ? OR IFNULL(p.barcode,'') LIKE ? OR IFNULL(h.notes,'') LIKE ? OR IFNULL(u.name,'') LIKE ?`,
      [q, q, q, q]
    );
    const total = countRows[0].c;

    const [rows] = await pool.query(
      `SELECT h.id, h.product_id, h.qty_before, h.qty_added, h.qty_after, h.notes, h.created_at,
              p.name AS product_name, p.barcode AS product_barcode, u.name AS created_by_name
       FROM stock_in_history h
       JOIN products p ON p.id = h.product_id
       LEFT JOIN users u ON u.id = h.created_by
       WHERE p.name LIKE ? OR IFNULL(p.barcode,'') LIKE ? OR IFNULL(h.notes,'') LIKE ? OR IFNULL(u.name,'') LIKE ?
       ORDER BY h.id DESC
       LIMIT ? OFFSET ?`,
      [q, q, q, q, l, offset]
    );

    res.json({ data: rows, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat histori stok masuk' });
  }
});

app.post('/api/products', authRequired, staffExceptChecker, productPhotoUploadMaybe, async (req, res) => {
  try {
    const { name, barcode, hpp, stock } = req.body || {};
    const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
    if (!name?.trim()) {
      if (req.file) removeUploadedFile(req.file.path);
      return res.status(400).json({ message: 'Nama produk wajib' });
    }
    const [r] = await pool.query(
      'INSERT INTO products (name, barcode, hpp, stock, photo_url) VALUES (?,?,?,?,?)',
      [
        name.trim(),
        barcode?.trim() || null,
        Number(hpp) || 0,
        Number(stock) || 0,
        photoPath,
      ]
    );

    await logActivity({
      req,
      action: 'CREATE_PRODUCT',
      entityType: 'products',
      entityId: r.insertId,
      reference: barcode?.trim() || name.trim(),
      description: `Menambahkan produk baru "${name.trim()}" (Stok awal: ${Number(stock) || 0})`,
      beforeData: null,
      afterData: {
        id: r.insertId,
        name: name.trim(),
        barcode: barcode?.trim() || null,
        hpp: Number(hpp) || 0,
        stock: Number(stock) || 0,
      },
    });

    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (req.file) removeUploadedFile(req.file.path);
    console.error(e);
    res.status(500).json({ message: 'Gagal simpan produk' });
  }
});

app.put('/api/products/:id', authRequired, staffExceptChecker, productPhotoUploadMaybe, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, barcode, hpp, stock, stock_in, stock_in_notes, remove_photo } = req.body || {};
    if (!name?.trim()) {
      if (req.file) removeUploadedFile(req.file.path);
      return res.status(400).json({ message: 'Nama produk wajib' });
    }

    await conn.beginTransaction();
    const [prows] = await conn.query(
      'SELECT id, name, barcode, stock, photo_url, hpp FROM products WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    const current = prows[0];
    if (!current) {
      await conn.rollback();
      return res.status(404).json({ message: 'Produk tidak ada' });
    }

    const added = Number(stock_in) || 0;
    let nextStock = Number(current.stock) || 0;
    if (added > 0) nextStock += added;
    else if (stock !== undefined && stock !== null) nextStock = Number(stock) || 0;

    const shouldRemovePhoto = String(remove_photo || '') === '1';
    let nextPhotoUrl = current.photo_url || null;
    if (req.file) nextPhotoUrl = `/uploads/${req.file.filename}`;
    else if (shouldRemovePhoto) nextPhotoUrl = null;

    const role = req.user?.role;
    const nextHpp =
      role === 'karyawan' ? Number(current.hpp) || 0 : Number(hpp) || 0;

    await conn.query(
      'UPDATE products SET name=?, barcode=?, hpp=?, stock=?, photo_url=? WHERE id=?',
      [name.trim(), barcode?.trim() || null, nextHpp, nextStock, nextPhotoUrl, req.params.id]
    );

    if (added > 0) {
      await conn.query(
        `INSERT INTO stock_in_history
          (product_id, qty_before, qty_added, qty_after, notes, created_by)
         VALUES (?,?,?,?,?,?)`,
        [
          req.params.id,
          Number(current.stock) || 0,
          added,
          nextStock,
          stock_in_notes?.trim() || null,
          req.user?.id || null,
        ]
      );
    }

    await conn.commit();

    await logActivity({
      req,
      action: 'UPDATE_PRODUCT',
      entityType: 'products',
      entityId: req.params.id,
      reference: barcode?.trim() || name.trim(),
      description: `Mengubah data produk "${name.trim()}" (Stok: ${current.stock} → ${nextStock})`,
      beforeData: {
        name: current.name,
        barcode: current.barcode,
        hpp: current.hpp,
        stock: current.stock,
      },
      afterData: {
        name: name.trim(),
        barcode: barcode?.trim() || null,
        hpp: nextHpp,
        stock: nextStock,
      },
    });

    if (
      (req.file || shouldRemovePhoto) &&
      current.photo_url &&
      current.photo_url.startsWith('/uploads/')
    ) {
      removeUploadedFile(path.join(UPLOAD_DIR, path.basename(current.photo_url)));
    }
    res.json({ ok: true });
  } catch (e) {
    if (req.file) removeUploadedFile(req.file.path);
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Gagal update produk' });
  } finally {
    conn.release();
  }
});

app.delete('/api/products/:id', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT name, barcode, photo_url, stock, hpp FROM products WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    const product = rows[0];
    if (!product) return res.status(404).json({ message: 'Produk tidak ada' });

    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);

    await logActivity({
      req,
      action: 'DELETE_PRODUCT',
      entityType: 'products',
      entityId: req.params.id,
      reference: product.barcode || product.name,
      description: `Menghapus produk "${product.name}"`,
      beforeData: product,
      afterData: null,
    });

    if (product.photo_url && product.photo_url.startsWith('/uploads/')) {
      removeUploadedFile(path.join(UPLOAD_DIR, path.basename(product.photo_url)));
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal hapus produk (mungkin masih dipakai)' });
  }
});

/* ——— Stock helpers ——— */
async function getOrderById(conn, id) {
  const [rows] = await conn.query('SELECT * FROM orders WHERE id = ?', [id]);
  return rows[0] || null;
}

/** Order mengurangi stok jika punya product_id dan status bukan retur */
function shouldConsumeStock(status) {
  return status !== 'retur';
}

function isShippedPhaseStatus(s) {
  return s === 'dikirim' || s === 'selesai' || s === 'retur';
}

function normalizeVariasi(v) {
  return String(v ?? '').trim();
}

function lineItemsMatchExisting(sortedExisting, items) {
  if (!Array.isArray(items) || sortedExisting.length !== items.length)
    return false;
  for (let i = 0; i < items.length; i++) {
    const r = sortedExisting[i];
    const it = items[i];
    if (String(it.product_name || '').trim() !== String(r.product_name).trim())
      return false;
    if (normalizeVariasi(it.variasi) !== normalizeVariasi(r.variasi)) return false;
    if (Number(it.qty) !== Number(r.qty)) return false;
    if (Number(it.selling_price || 0) !== Number(r.selling_price)) return false;
    const pid = it.product_id ? Number(it.product_id) : null;
    const rid = r.product_id ? Number(r.product_id) : null;
    if (pid !== rid) return false;
  }
  return true;
}

function headerMatchesLockedFields(firstRow, body) {
  const str = (v) => (v == null || v === '' ? '' : String(v).trim());
  const on = String(body.order_no ?? '').trim() === String(firstRow.order_no).trim();
  const sid = Number(body.store_id) === Number(firstRow.store_id);
  const od =
    orderDateKeyDb(body.order_date) === orderDateKeyDb(firstRow.order_date);
  const resi = str(body.resi) === str(firstRow.resi);
  const notes = str(body.notes) === str(firstRow.notes);
  return on && sid && od && resi && notes;
}

function parseNominalCairInput(body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'nominal_cair'))
    return { present: false, value: undefined };
  const raw = body.nominal_cair;
  if (raw === '' || raw == null || raw === undefined)
    return { present: true, value: null };
  return { present: true, value: Number(raw) };
}

function effectiveNominalCairAfterUpdate(body, prevGroupNominal) {
  const p = parseNominalCairInput(body);
  if (!p.present) return prevGroupNominal;
  return p.value;
}

/** @returns {{ status: number, message: string } | null} */
function assertOrderGroupUpdateAllowed(role, sortedExisting, body) {
  if (role === 'checker_pengiriman') {
    return {
      status: 403,
      message:
        'Checker pengiriman menandai kirim lewat menu Kurir gudang, bukan edit pesanan',
    };
  }
  if (role === 'owner') return null;

  const statusSet = new Set(sortedExisting.map((r) => r.status));
  if (statusSet.size !== 1) {
    return {
      status: 400,
      message: 'Status baris dalam satu pesanan tidak konsisten — hubungi owner',
    };
  }
  const prevStatus = sortedExisting[0].status;
  const first = sortedExisting[0];
  const items = body.items;
  const newStatus = body.status != null ? String(body.status) : prevStatus;
  const prevNom = sortedExisting.find((r) => r.nominal_cair != null)?.nominal_cair;
  const prevGroupNominal = prevNom != null ? Number(prevNom) : null;
  const nextNominal = effectiveNominalCairAfterUpdate(body, prevGroupNominal);

  if (role === 'karyawan') {
    const p = parseNominalCairInput(body);
    if (p.present && p.value != null)
      return { status: 403, message: 'Nominal cair hanya admin atau owner' };
    if (isShippedPhaseStatus(prevStatus)) {
      return {
        status: 403,
        message: 'Pesanan sudah dikirim/selesai — tidak dapat diubah',
      };
    }
  }

  if (role === 'admin') {
    if (!lineItemsMatchExisting(sortedExisting, items)) {
      return {
        status: 403,
        message: 'Admin tidak dapat mengubah produk, qty, atau baris dalam pesanan',
      };
    }
    if (prevStatus === 'diproses') {
      if (!['diproses', 'dikirim'].includes(newStatus)) {
        return {
          status: 403,
          message: 'Admin hanya dapat mengubah status Diproses menjadi Dikirim',
        };
      }
      if (
        nextNominal != null &&
        nextNominal !== prevGroupNominal &&
        !isShippedPhaseStatus(newStatus)
      ) {
        return {
          status: 400,
          message: 'Nominal cair hanya diisi setelah status Dikirim',
        };
      }
    } else if (prevStatus === 'dikirim') {
      if (!['dikirim', 'selesai', 'retur'].includes(newStatus)) {
        return {
          status: 403,
          message: 'Admin hanya dapat menutup pesanan ke Selesai atau Retur',
        };
      }
      if (!headerMatchesLockedFields(first, body)) {
        return {
          status: 403,
          message:
            'Untuk pesanan Dikirim admin hanya mengisi pencairan dan status selesai/retur',
        };
      }
    } else if (prevStatus === 'selesai' || prevStatus === 'retur') {
      if (newStatus !== 'selesai' && newStatus !== 'retur') {
        return {
          status: 403,
          message: 'Admin hanya dapat mengubah status antara Selesai dan Retur',
        };
      }
      if (!headerMatchesLockedFields(first, body)) {
        return {
          status: 403,
          message:
            'Header pesanan (no, toko, tanggal, resi, catatan) tidak dapat diubah admin',
        };
      }
    }

    if (nextNominal != null && !isShippedPhaseStatus(newStatus)) {
      return {
        status: 400,
        message: 'Nominal cair hanya diisi setelah status Dikirim',
      };
    }
  }

  return null;
}

/* ——— Orders ——— */
app.get('/api/orders/export', authRequired, staffExceptChecker, async (req, res) => {
  try {
    const { store_id, date_from, date_to, payout, search = '' } = req.query;
    let where =
      '(o.order_no LIKE ? OR o.product_name LIKE ? OR IFNULL(o.resi,"") LIKE ? OR IFNULL(pr.barcode,"") LIKE ?)';
    const q = `%${String(search).trim()}%`;
    const params = [q, q, q, q];
    if (store_id) {
      where += ' AND o.store_id = ?';
      params.push(store_id);
    }
    if (date_from) {
      where += ' AND o.order_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      where += ' AND o.order_date <= ?';
      params.push(date_to);
    }
    if (payout === 'belum') {
      where += ` AND NOT EXISTS (
        SELECT 1 FROM orders x
        WHERE x.order_no = o.order_no AND x.store_id = o.store_id AND DATE(x.order_date) = DATE(o.order_date)
          AND x.nominal_cair IS NOT NULL
      )`;
    } else if (payout === 'sudah') {
      where += ` AND EXISTS (
        SELECT 1 FROM orders x
        WHERE x.order_no = o.order_no AND x.store_id = o.store_id AND DATE(x.order_date) = DATE(o.order_date)
          AND x.nominal_cair IS NOT NULL
      )`;
    }

    const [rows] = await pool.query(
      `SELECT o.*, s.name AS store_name FROM orders o
       JOIN stores s ON s.id = o.store_id
       LEFT JOIN products pr ON pr.id = o.product_id
       WHERE ${where} ORDER BY o.order_date DESC, o.order_no ASC, o.id ASC`,
      params
    );

    // Group rows by order key to calculate total order modal for multi-item orders
    const orderTotals = new Map();
    const orderNominals = new Map();
    const firstRowIds = new Map();
    for (const r of rows) {
      const key = `${r.order_no}\0${r.store_id}\0${orderDateKeyDb(r.order_date)}`;
      const prevModal = orderTotals.get(key) || 0;
      orderTotals.set(key, prevModal + Number(r.qty) * Number(r.hpp_snapshot));
      if (r.nominal_cair != null) {
        orderNominals.set(key, Number(r.nominal_cair));
      }
      if (!firstRowIds.has(key)) {
        firstRowIds.set(key, r.id);
      }
    }

    const sheet = rows.map((o) => {
      const key = `${o.order_no}\0${o.store_id}\0${orderDateKeyDb(o.order_date)}`;
      const totalOrderModal = orderTotals.get(key) || 0;
      const modalThisRow = Number(o.qty) * Number(o.hpp_snapshot);
      const groupNc = orderNominals.has(key) ? orderNominals.get(key) : null;
      const isFirstRow = firstRowIds.get(key) === o.id;
      const isSudahCair = groupNc != null;

      let nominalCair = '';
      let laba = '';

      if (isFirstRow) {
        if (isSudahCair) {
          nominalCair = groupNc;
        }
        if (o.status === 'retur') {
          const nc = isSudahCair ? groupNc : 0;
          laba = Math.min(0, nc - totalOrderModal);
        } else if (isSudahCair) {
          laba = groupNc - totalOrderModal;
        }
      }

      return {
        NoPesanan: o.order_no,
        Resi: o.resi,
        Produk: o.product_name,
        Variasi: o.variasi,
        Qty: o.qty,
        HargaJual: o.selling_price,
        HPP: o.hpp_snapshot,
        TotalModal: modalThisRow,
        Toko: o.store_name,
        Tanggal: orderDateKeyDb(o.order_date),
        Status: o.status,
        NominalCair: nominalCair,
        StatusCair: isSudahCair ? 'Sudah Cair' : 'Belum Cair',
        Laba: laba,
      };
    });

    res.json({ data: sheet });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal export' });
  }
});

/** Checker / owner: tandai seluruh grup pesanan (status Diproses) menjadi Dikirim via no pesanan atau resi. */
app.post('/api/orders/mark-dikirim', authRequired, async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== 'checker_pengiriman' && role !== 'owner')
      return res.status(403).json({ message: 'Hanya checker pengiriman atau owner' });
    const code = String(req.body?.code ?? '').trim();
    if (!code) return res.status(400).json({ message: 'No pesanan atau resi wajib' });

    let [rows] = await pool.query(
      `SELECT * FROM orders WHERE order_no = ? ORDER BY id DESC LIMIT 200`,
      [code]
    );
    if (!rows.length) {
      [rows] = await pool.query(
        `SELECT * FROM orders WHERE IFNULL(resi,'') = ? ORDER BY id DESC LIMIT 200`,
        [code]
      );
    }
    if (!rows.length)
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

    const groups = new Map();
    for (const r of rows) {
      const k = `${r.order_no}\0${r.store_id}\0${orderDateKeyDb(r.order_date)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    if (groups.size > 1) {
      return res.status(400).json({
        message:
          'Kode mengenai lebih dari satu pesanan — gunakan no pesanan persis atau resi yang unik',
      });
    }
    const groupRows = [...groups.values()][0];
    const bad = groupRows.find((r) => r.status !== 'diproses');
    if (bad) {
      return res.status(400).json({
        message: `Pesanan sudah berstatus "${bad.status}", hanya Diproses yang bisa ditandai dikirim di sini`,
      });
    }
    const ids = groupRows.map((r) => r.id);
    await pool.query(
      `UPDATE orders SET status = 'dikirim' WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );

    await logActivity({
      req,
      action: 'UPDATE_ORDER_STATUS',
      entityType: 'orders',
      entityId: groupRows[0].id,
      reference: groupRows[0].order_no,
      description: `Mengubah status pengiriman pesanan (${groupRows[0].order_no}) menjadi "Dikirim" (Scan/Input: ${code})`,
      beforeData: { status: 'diproses' },
      afterData: { status: 'dikirim' },
    });

    res.json({
      ok: true,
      order_no: groupRows[0].order_no,
      line_count: ids.length,
      message: 'Status diubah ke Dikirim',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal menandai dikirim' });
  }
});

app.get('/api/orders/:id', authRequired, staffExceptChecker, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, s.name AS store_name,
        CASE WHEN o.nominal_cair IS NULL THEN 'Belum Cair' ELSE 'Sudah Cair' END AS payout_status_label
       FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.id = ? LIMIT 1`,
      [req.params.id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Tidak ada' });
    const [siblings] = await pool.query(
      `SELECT o.*, s.name AS store_name,
        CASE WHEN o.nominal_cair IS NULL THEN 'Belum Cair' ELSE 'Sudah Cair' END AS payout_status_label
       FROM orders o
       JOIN stores s ON s.id = o.store_id
       WHERE o.order_no = ? AND o.store_id = ? AND DATE(o.order_date) = DATE(?)
       ORDER BY o.id ASC`,
      [row.order_no, row.store_id, row.order_date]
    );
    const first = siblings[0];
    const groupNominalRow = siblings.find((r) => r.nominal_cair != null) || null;
    const items = siblings.map((r) => ({
      id: r.id,
      product_name: r.product_name,
      variasi: r.variasi || '',
      qty: r.qty,
      selling_price: r.selling_price,
      product_id: r.product_id,
      hpp_snapshot: Number(r.hpp_snapshot) || 0,
    }));
    res.json({
      group_line_ids: siblings.map((r) => r.id),
      order_no: first.order_no,
      resi: first.resi || '',
      store_id: first.store_id,
      store_name: first.store_name,
      order_date: orderDateKeyDb(first.order_date),
      status: first.status,
      nominal_cair: groupNominalRow ? Number(groupNominalRow.nominal_cair) : null,
      notes: first.notes || '',
      items,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat order' });
  }
});

app.get('/api/orders', authRequired, staffExceptChecker, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      store_id,
      date_from,
      date_to,
      payout,
      status,
    } = req.query;
    const { page: p, limit: l, offset } = paginate(page, limit);
    const q = `%${String(search).trim()}%`;
    let where =
      '(o.order_no LIKE ? OR o.product_name LIKE ? OR IFNULL(o.resi,"") LIKE ? OR IFNULL(pr.barcode,"") LIKE ?)';
    const params = [q, q, q, q];
    if (store_id) {
      where += ' AND o.store_id = ?';
      params.push(store_id);
    }
    if (date_from) {
      where += ' AND o.order_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      where += ' AND o.order_date <= ?';
      params.push(date_to);
    }
    if (status && ['diproses', 'dikirim', 'selesai', 'retur'].includes(status)) {
      where += ' AND o.status = ?';
      params.push(status);
    }

    let payoutHaving = '';
    if (payout === 'belum') {
      payoutHaving =
        ' HAVING SUM(CASE WHEN o.nominal_cair IS NOT NULL THEN 1 ELSE 0 END) = 0';
    } else if (payout === 'sudah') {
      payoutHaving =
        ' HAVING SUM(CASE WHEN o.nominal_cair IS NOT NULL THEN 1 ELSE 0 END) > 0';
    }

    const groupBy = 'o.order_no, o.store_id, DATE(o.order_date)';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM (
        SELECT 1 AS x
        FROM orders o
        JOIN stores s ON s.id = o.store_id
        LEFT JOIN products pr ON pr.id = o.product_id
        WHERE ${where}
        GROUP BY ${groupBy}
        ${payoutHaving}
      ) grp`,
      params
    );
    const total = countRows[0].c;

    const [rows] = await pool.query(
      `SELECT
         MIN(o.id) AS id,
         GROUP_CONCAT(o.id ORDER BY o.id SEPARATOR ',') AS line_ids_csv,
         o.order_no,
         MAX(IFNULL(o.resi,'')) AS resi,
         o.store_id,
         MAX(s.name) AS store_name,
         MIN(o.order_date) AS order_date,
         COUNT(*) AS item_count,
         SUM(o.qty) AS qty_sum,
         SUM(o.qty * o.hpp_snapshot) AS total_modal,
         GROUP_CONCAT(
           CONCAT(o.product_name, ' × ', o.qty)
           ORDER BY o.id SEPARATOR '\n'
         ) AS products_label,
         CASE
           WHEN COUNT(DISTINCT o.status) = 1 THEN MIN(o.status)
           ELSE 'campuran'
         END AS status,
         CASE
           WHEN SUM(CASE WHEN o.nominal_cair IS NOT NULL THEN 1 ELSE 0 END) = 0 THEN 'Belum Cair'
           ELSE 'Sudah Cair'
         END AS payout_status_label,
         MAX(o.nominal_cair) AS nominal_cair_value,
         CASE
           WHEN SUM(CASE WHEN o.nominal_cair IS NOT NULL THEN 1 ELSE 0 END) = 0
             AND SUM(CASE WHEN o.status = 'retur' THEN 1 ELSE 0 END) = 0
             THEN NULL
           WHEN SUM(CASE WHEN o.status = 'retur' THEN 1 ELSE 0 END) > 0
             THEN LEAST(0, IFNULL(MAX(o.nominal_cair), 0) - SUM(o.qty * o.hpp_snapshot))
           ELSE MAX(o.nominal_cair) - SUM(o.qty * o.hpp_snapshot)
         END AS laba
       FROM orders o
       JOIN stores s ON s.id = o.store_id
       LEFT JOIN products pr ON pr.id = o.product_id
       WHERE ${where}
       GROUP BY ${groupBy}
       ${payoutHaving}
       ORDER BY MIN(o.order_date) DESC, MIN(o.id) DESC
       LIMIT ? OFFSET ?`,
      [...params, l, offset]
    );

    const data = rows.map((row) => {
      const lineIds = row.line_ids_csv
        ? String(row.line_ids_csv)
          .split(',')
          .map((x) => Number(x))
          .filter((n) => n > 0)
        : [Number(row.id)];
      return {
        id: Number(row.id),
        line_ids: lineIds,
        order_no: row.order_no,
        resi: row.resi || '',
        store_id: row.store_id,
        store_name: row.store_name,
        order_date: orderDateKeyDb(row.order_date),
        item_count: Number(row.item_count),
        qty_sum: Number(row.qty_sum),
        total_modal: Number(row.total_modal),
        products_label: row.products_label || '',
        status: row.status,
        payout_status_label: row.payout_status_label,
        nominal_cair_value:
          row.nominal_cair_value != null ? Number(row.nominal_cair_value) : null,
        laba: row.laba != null ? Number(row.laba) : null,
      };
    });
    res.json({ data, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat order' });
  }
});

app.post('/api/orders', authRequired, staffExceptChecker, orderUploadMaybe, async (req, res) => {
  const body = req.body || {};
  let items = body.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = null;
    }
  }
  const isMulti = Array.isArray(items) && items.length > 0;

  const conn = await pool.getConnection();
  try {
    const role = req.user?.role;
    if (role === 'checker_pengiriman')
      return res
        .status(403)
        .json({ message: 'Checker hanya menggunakan menu Kurir gudang' });

    if (isMulti) {
      const order_no = body.order_no;
      const store_id = body.store_id;
      const order_date = body.order_date;
      if (!order_no?.trim() || !store_id || !order_date)
        return res.status(400).json({
          message: 'No pesanan, toko, dan tanggal wajib untuk order multi-produk',
        });
      const stat = body.status || 'diproses';
      const resi = body.resi?.trim() || null;
      const notes = body.notes?.trim() || null;
      const attachment_path = req.file ? `/uploads/${req.file.filename}` : null;

      const gnom =
        body.nominal_cair === '' ||
          body.nominal_cair == null ||
          body.nominal_cair === undefined
          ? null
          : Number(body.nominal_cair);
      if (role === 'karyawan' && gnom != null)
        return res.status(403).json({ message: 'Nominal cair hanya admin atau owner' });
      if (role !== 'owner' && gnom != null && !isShippedPhaseStatus(stat))
        return res.status(400).json({
          message: 'Nominal cair hanya bisa diisi setelah status Dikirim',
        });

      await conn.beginTransaction();
      const ids = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const product_name = it.product_name?.trim();
        if (!product_name) {
          await conn.rollback();
          return res.status(400).json({
            message: `Baris ${i + 1}: nama produk wajib`,
          });
        }
        const qty = Number(it.qty) || 1;
        if (qty < 1) {
          await conn.rollback();
          return res.status(400).json({
            message: `Baris ${i + 1}: qty tidak valid`,
          });
        }
        let product_id = it.product_id ? Number(it.product_id) : null;
        let productHpp = null;
        if (product_id) {
          const [prows] = await conn.query(
            'SELECT hpp, stock FROM products WHERE id = ? FOR UPDATE',
            [product_id]
          );
          const pr = prows[0];
          if (!pr) {
            await conn.rollback();
            return res.status(400).json({
              message: `Baris ${i + 1}: produk tidak ditemukan`,
            });
          }
          productHpp = Number(pr.hpp);
          if (shouldConsumeStock(stat) && pr.stock < qty) {
            await conn.rollback();
            return res.status(400).json({
              message: `Baris ${i + 1}: stok produk tidak cukup`,
            });
          }
        }
        const hpp_snapshot = orderLineHppSnapshot(req.user?.role, it, { productHpp });
        const groupNominal =
          body.nominal_cair === '' ||
            body.nominal_cair == null ||
            body.nominal_cair === undefined
            ? null
            : Number(body.nominal_cair);
        const nominal_cair = i === 0 ? groupNominal : null;
        const payout_at = i === 0 && nominal_cair != null ? new Date() : null;
        const rowAttachment = i === 0 ? attachment_path : null;

        const [ins] = await conn.query(
          `INSERT INTO orders (
            order_no, resi, product_name, variasi, qty, selling_price, hpp_snapshot,
            store_id, product_id, order_date, status, nominal_cair, payout_at, attachment_path, notes
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            order_no.trim(),
            resi,
            product_name,
            it.variasi?.trim() || null,
            qty,
            Number(it.selling_price) || 0,
            hpp_snapshot,
            store_id,
            product_id,
            order_date,
            stat,
            nominal_cair,
            payout_at,
            rowAttachment,
            notes,
          ]
        );
        ids.push(ins.insertId);
        if (product_id && shouldConsumeStock(stat)) {
          await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [
            qty,
            product_id,
          ]);
        }
      }
      await conn.commit();

      await logActivity({
        req,
        action: 'CREATE_ORDER',
        entityType: 'orders',
        entityId: ids[0],
        reference: order_no.trim(),
        description: `Membuat pesanan baru (${order_no.trim()}) dengan ${items.length} produk - status: "${stat}"`,
        beforeData: null,
        afterData: {
          order_no: order_no.trim(),
          order_date: orderDateKeyDb(order_date),
          status: stat,
          resi,
          items: items.map((it) => ({
            product_name: it.product_name?.trim() || '',
            variasi: it.variasi?.trim() || null,
            qty: Number(it.qty) || 1,
            selling_price: Number(it.selling_price) || 0,
          })),
          nominal_cair: gnom,
          notes: body.notes?.trim() || null,
        },
      });

      return res.status(201).json({ ids, count: ids.length });
    }

    const order_no = body.order_no;
    const product_name = body.product_name;
    const store_id = body.store_id;
    const order_date = body.order_date;
    if (!order_no?.trim() || !product_name?.trim() || !store_id || !order_date)
      return res
        .status(400)
        .json({ message: 'No pesanan, produk, toko, dan tanggal wajib' });

    let product_id = body.product_id ? Number(body.product_id) : null;
    const stat = body.status || 'diproses';
    let productHpp = null;

    if (product_id) {
      const [prows] = await conn.query(
        'SELECT hpp, stock FROM products WHERE id = ? FOR UPDATE',
        [product_id]
      );
      const pr = prows[0];
      if (!pr) return res.status(400).json({ message: 'Produk tidak ditemukan' });
      productHpp = Number(pr.hpp);
      const qty = Number(body.qty) || 1;
      if (shouldConsumeStock(stat) && pr.stock < qty)
        return res.status(400).json({ message: 'Stok produk tidak cukup' });
    }

    const qty = Number(body.qty) || 1;
    const nominal_cair =
      body.nominal_cair === '' ||
        body.nominal_cair == null ||
        body.nominal_cair === undefined
        ? null
        : Number(body.nominal_cair);
    if (role === 'karyawan' && nominal_cair != null)
      return res.status(403).json({ message: 'Nominal cair hanya admin atau owner' });
    if (role !== 'owner' && nominal_cair != null && !isShippedPhaseStatus(stat))
      return res.status(400).json({
        message: 'Nominal cair hanya bisa diisi setelah status Dikirim',
      });
    const payout_at = nominal_cair != null ? new Date() : null;
    const hpp_snapshot = orderLineHppSnapshot(role, body, { productHpp });

    const attachment_path = req.file ? `/uploads/${req.file.filename}` : null;

    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO orders (
        order_no, resi, product_name, variasi, qty, selling_price, hpp_snapshot,
        store_id, product_id, order_date, status, nominal_cair, payout_at, attachment_path, notes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        order_no.trim(),
        body.resi?.trim() || null,
        product_name.trim(),
        body.variasi?.trim() || null,
        qty,
        Number(body.selling_price) || 0,
        hpp_snapshot,
        store_id,
        product_id,
        order_date,
        stat,
        nominal_cair,
        payout_at,
        attachment_path,
        body.notes?.trim() || null,
      ]
    );

    if (product_id && shouldConsumeStock(stat)) {
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [
        qty,
        product_id,
      ]);
    }

    await conn.commit();

    await logActivity({
      req,
      action: 'CREATE_ORDER',
      entityType: 'orders',
      entityId: ins.insertId,
      reference: order_no.trim(),
      description: `Membuat pesanan baru (${order_no.trim()}) - ${product_name.trim()}`,
      beforeData: null,
      afterData: {
        order_no: order_no.trim(),
        order_date: orderDateKeyDb(order_date),
        product_name: product_name.trim(),
        variasi: body.variasi?.trim() || null,
        qty,
        selling_price: Number(body.selling_price) || 0,
        status: stat,
        nominal_cair,
        resi: body.resi?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });

    res.status(201).json({ id: ins.insertId });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Gagal simpan order' });
  } finally {
    conn.release();
  }
});

/** Ganti seluruh baris DB satu pesanan (multi-item): hapus line_ids lalu insert ulang seperti order baru. */
app.put('/api/orders/group', authRequired, staffExceptChecker, async (req, res) => {
  const body = req.body || {};
  let lineIds = Array.isArray(body.line_ids)
    ? body.line_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  lineIds = [...new Set(lineIds)].sort((a, b) => a - b);
  if (!lineIds.length)
    return res.status(400).json({ message: 'line_ids wajib' });

  const items = body.items;
  if (!Array.isArray(items) || !items.length)
    return res.status(400).json({ message: 'Minimal satu item' });

  const order_no = body.order_no;
  const store_id = body.store_id;
  const order_date = body.order_date;
  if (!order_no?.trim() || !store_id || !order_date)
    return res.status(400).json({
      message: 'No pesanan, toko, dan tanggal wajib',
    });

  const stat = body.status || 'diproses';
  const resi = body.resi?.trim() || null;
  const notes = body.notes?.trim() || null;

  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.query(
      `SELECT * FROM orders WHERE id IN (${lineIds.map(() => '?').join(',')})`,
      lineIds
    );
    if (existing.length !== lineIds.length) {
      return res.status(400).json({ message: 'Beberapa baris order tidak ditemukan' });
    }
    const keys = new Set(
      existing.map(
        (r) =>
          `${r.order_no}\0${r.store_id}\0${orderDateKeyDb(r.order_date)}`
      )
    );
    if (keys.size !== 1) {
      return res.status(400).json({
        message: 'line_ids harus dari satu pesanan yang sama',
      });
    }

    const sorted = [...existing].sort((a, b) => a.id - b.id);
    const permErr = assertOrderGroupUpdateAllowed(req.user?.role, sorted, body);
    if (permErr) return res.status(permErr.status).json({ message: permErr.message });

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product_name?.trim()) {
        return res.status(400).json({
          message: `Baris ${i + 1}: nama produk wajib`,
        });
      }
      const qty = Number(it.qty) || 1;
      if (qty < 1) {
        return res.status(400).json({
          message: `Baris ${i + 1}: qty tidak valid`,
        });
      }
    }

    const firstAttachment = sorted[0].attachment_path;

    await conn.beginTransaction();

    for (const row of sorted) {
      if (row.product_id && shouldConsumeStock(row.status)) {
        await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [
          row.qty,
          row.product_id,
        ]);
      }
    }

    await conn.query(
      `DELETE FROM orders WHERE id IN (${lineIds.map(() => '?').join(',')})`,
      lineIds
    );

    const ids = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const product_name = it.product_name.trim();
      const qty = Number(it.qty) || 1;
      let product_id = it.product_id ? Number(it.product_id) : null;
      let productHpp = null;
      if (product_id) {
        const [prows] = await conn.query(
          'SELECT hpp, stock FROM products WHERE id = ? FOR UPDATE',
          [product_id]
        );
        const pr = prows[0];
        if (!pr) {
          await conn.rollback();
          return res.status(400).json({
            message: `Baris ${i + 1}: produk tidak ditemukan`,
          });
        }
        productHpp = Number(pr.hpp);
        if (shouldConsumeStock(stat) && pr.stock < qty) {
          await conn.rollback();
          return res.status(400).json({
            message: `Baris ${i + 1}: stok produk tidak cukup`,
          });
        }
      }
      const hpp_snapshot = orderLineHppSnapshot(req.user?.role, it, {
        productHpp,
        prevRow: sorted[i],
      });
      const groupNominal =
        body.nominal_cair === '' ||
          body.nominal_cair == null ||
          body.nominal_cair === undefined
          ? null
          : Number(body.nominal_cair);
      const nominal_cair = i === 0 ? groupNominal : null;
      const payout_at = i === 0 && nominal_cair != null ? new Date() : null;
      const rowAttachment = i === 0 ? firstAttachment : null;

      const [ins] = await conn.query(
        `INSERT INTO orders (
            order_no, resi, product_name, variasi, qty, selling_price, hpp_snapshot,
            store_id, product_id, order_date, status, nominal_cair, payout_at, attachment_path, notes
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          order_no.trim(),
          resi,
          product_name,
          it.variasi?.trim() || null,
          qty,
          Number(it.selling_price) || 0,
          hpp_snapshot,
          store_id,
          product_id,
          order_date,
          stat,
          nominal_cair,
          payout_at,
          rowAttachment,
          notes,
        ]
      );
      ids.push(ins.insertId);
      if (product_id && shouldConsumeStock(stat)) {
        await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [
          qty,
          product_id,
        ]);
      }
    }

    await conn.commit();

    const oldOrderDate = orderDateKeyDb(sorted[0]?.order_date);
    const newOrderDate = orderDateKeyDb(order_date);
    const oldStat = sorted[0]?.status;
    const oldResi = sorted[0]?.resi || null;
    const oldNotes = sorted[0]?.notes || null;
    const oldNominalRaw = sorted.find((r) => r.nominal_cair != null)?.nominal_cair;
    const oldNominal = oldNominalRaw != null ? Number(oldNominalRaw) : null;
    const gnomVal =
      body.nominal_cair === '' || body.nominal_cair == null || body.nominal_cair === undefined
        ? null
        : Number(body.nominal_cair);

    const oldItems = sorted.map((r) => ({
      product_name: r.product_name,
      variasi: r.variasi || null,
      qty: Number(r.qty) || 1,
      selling_price: Number(r.selling_price) || 0,
    }));
    const newItems = items.map((it) => ({
      product_name: it.product_name.trim(),
      variasi: it.variasi?.trim() || null,
      qty: Number(it.qty) || 1,
      selling_price: Number(it.selling_price) || 0,
    }));

    const changes = [];
    if (oldOrderDate !== newOrderDate) {
      changes.push(`Tanggal (${oldOrderDate || '-'} → ${newOrderDate})`);
    }
    if (oldStat !== stat) {
      changes.push(`Status ("${oldStat}" → "${stat}")`);
    }
    if (oldNominal !== gnomVal) {
      changes.push(
        `Nominal WD (${oldNominal != null ? 'Rp ' + oldNominal.toLocaleString('id-ID') : '-'} → ${gnomVal != null ? 'Rp ' + gnomVal.toLocaleString('id-ID') : '-'})`
      );
    }
    if ((oldResi || '') !== (resi || '')) {
      changes.push(`Resi ("${oldResi || '-'}" → "${resi || '-'}")`);
    }
    if ((oldNotes || '') !== (notes || '')) {
      changes.push(`Catatan ("${oldNotes || '-'}" → "${notes || '-'}")`);
    }
    if (JSON.stringify(oldItems) !== JSON.stringify(newItems)) {
      changes.push('Daftar Produk/Item');
    }

    let actionType = 'UPDATE_ORDER';
    if (oldNominal !== gnomVal && gnomVal !== null && changes.length === 1) {
      actionType = 'UPDATE_STATUS_WD';
    }

    let desc = `Mengubah data pesanan (${order_no.trim()})`;
    if (changes.length === 1 && oldOrderDate !== newOrderDate) {
      desc = `Mengubah/Memundurkan tanggal pesanan (${order_no.trim()}) dari ${oldOrderDate || '-'} menjadi ${newOrderDate}`;
    } else if (changes.length > 0) {
      desc = `Mengubah pesanan (${order_no.trim()}): ${changes.join(', ')}`;
    }

    await logActivity({
      req,
      action: actionType,
      entityType: 'orders',
      entityId: ids[0],
      reference: order_no.trim(),
      description: desc,
      beforeData: {
        order_no: sorted[0]?.order_no || order_no.trim(),
        order_date: oldOrderDate,
        status: oldStat,
        nominal_cair: oldNominal,
        resi: oldResi,
        notes: oldNotes,
        items: oldItems,
      },
      afterData: {
        order_no: order_no.trim(),
        order_date: newOrderDate,
        status: stat,
        nominal_cair: gnomVal,
        resi,
        notes,
        items: newItems,
      },
    });

    res.json({ ok: true, ids, count: ids.length });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Gagal update pesanan' });
  } finally {
    conn.release();
  }
});

app.put('/api/orders/:id', authRequired, staffExceptChecker, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const prev = await getOrderById(conn, req.params.id);
    if (!prev) return res.status(404).json({ message: 'Order tidak ada' });

    const body = req.body || {};
    const stat = body.status ?? prev.status;
    const qty = Number(body.qty ?? prev.qty) || 1;
    let product_id =
      body.product_id !== undefined
        ? body.product_id
          ? Number(body.product_id)
          : null
        : prev.product_id;
    let productHpp = null;
    if (product_id) {
      const [prows] = await conn.query(
        'SELECT hpp, stock FROM products WHERE id = ? FOR UPDATE',
        [product_id]
      );
      const pr = prows[0];
      if (!pr) return res.status(400).json({ message: 'Produk tidak ditemukan' });
      productHpp = Number(pr.hpp);
    }
    const hpp_snapshot = orderLineHppSnapshot(req.user?.role, body, {
      productHpp,
      prevRow: prev,
    });

    const nominal_cair =
      body.nominal_cair === '' || body.nominal_cair === undefined
        ? prev.nominal_cair
        : body.nominal_cair == null
          ? null
          : Number(body.nominal_cair);

    let payout_at = prev.payout_at;
    if (nominal_cair != null && prev.nominal_cair == null)
      payout_at = new Date();
    if (nominal_cair == null) payout_at = null;

    const product_name_m =
      body.product_name != null
        ? String(body.product_name).trim()
        : prev.product_name;
    const variasi_m =
      body.variasi !== undefined
        ? body.variasi?.trim() || null
        : prev.variasi;
    const selling_m = Number(body.selling_price ?? prev.selling_price) || 0;
    const order_no_m =
      body.order_no != null ? String(body.order_no).trim() : prev.order_no;
    const assertBody = {
      ...body,
      status: stat,
      order_no: order_no_m,
      store_id: body.store_id ?? prev.store_id,
      order_date: body.order_date ?? prev.order_date,
      resi: body.resi !== undefined ? body.resi : prev.resi,
      notes: body.notes !== undefined ? body.notes : prev.notes,
      items: [
        {
          product_id,
          product_name: product_name_m,
          variasi: variasi_m,
          qty,
          selling_price: selling_m,
        },
      ],
    };
    const permErr = assertOrderGroupUpdateAllowed(req.user?.role, [prev], assertBody);
    if (permErr) return res.status(permErr.status).json({ message: permErr.message });

    await conn.beginTransaction();

    // stok: lepas efek order lama
    const oldConsume = shouldConsumeStock(prev.status);
    const newConsume = shouldConsumeStock(stat);
    if (prev.product_id && oldConsume) {
      await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [
        prev.qty,
        prev.product_id,
      ]);
    }
    if (product_id && newConsume) {
      const [prows2] = await conn.query(
        'SELECT stock FROM products WHERE id = ? FOR UPDATE',
        [product_id]
      );
      if (!prows2[0]) {
        await conn.rollback();
        return res.status(400).json({ message: 'Produk tidak ditemukan' });
      }
      if (prows2[0].stock < qty) {
        await conn.rollback();
        return res.status(400).json({ message: 'Stok produk tidak cukup' });
      }
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [
        qty,
        product_id,
      ]);
    }

    await conn.query(
      `UPDATE orders SET
        order_no=?, resi=?, product_name=?, variasi=?, qty=?, selling_price=?, hpp_snapshot=?,
        store_id=?, product_id=?, order_date=?, status=?, nominal_cair=?, payout_at=?, notes=?
      WHERE id=?`,
      [
        order_no_m,
        body.resi !== undefined ? body.resi?.trim() || null : prev.resi,
        product_name_m,
        variasi_m,
        qty,
        selling_m,
        hpp_snapshot,
        body.store_id ?? prev.store_id,
        product_id,
        body.order_date ?? prev.order_date,
        stat,
        nominal_cair,
        payout_at,
        body.notes !== undefined ? body.notes?.trim() || null : prev.notes,
        req.params.id,
      ]
    );

    await conn.commit();

    const oldOrderDate = orderDateKeyDb(prev.order_date);
    const newOrderDate = orderDateKeyDb(body.order_date ?? prev.order_date);
    const oldStat = prev.status;
    const oldNominal = prev.nominal_cair != null ? Number(prev.nominal_cair) : null;
    const oldResi = prev.resi || null;
    const newResi = body.resi !== undefined ? body.resi?.trim() || null : prev.resi;
    const oldNotes = prev.notes || null;
    const newNotes = body.notes !== undefined ? body.notes?.trim() || null : prev.notes;
    const oldProd = prev.product_name;
    const newProd = product_name_m;
    const oldVar = prev.variasi || null;
    const newVar = variasi_m || null;
    const oldQty = Number(prev.qty) || 1;
    const newQty = qty;
    const oldPrice = Number(prev.selling_price) || 0;
    const newPrice = selling_m;

    const changes = [];
    if (oldOrderDate !== newOrderDate) {
      changes.push(`Tanggal (${oldOrderDate || '-'} → ${newOrderDate})`);
    }
    if (oldStat !== stat) {
      changes.push(`Status ("${oldStat}" → "${stat}")`);
    }
    if (oldProd !== newProd || oldVar !== newVar) {
      changes.push(
        `Produk ("${oldProd}${oldVar ? ' - ' + oldVar : ''}" → "${newProd}${newVar ? ' - ' + newVar : ''}")`
      );
    }
    if (oldQty !== newQty) {
      changes.push(`Qty (${oldQty} → ${newQty})`);
    }
    if (oldPrice !== newPrice) {
      changes.push(
        `Harga (Rp ${oldPrice.toLocaleString('id-ID')} → Rp ${newPrice.toLocaleString('id-ID')})`
      );
    }
    if (oldNominal !== nominal_cair) {
      changes.push(
        `Nominal WD (${oldNominal != null ? 'Rp ' + oldNominal.toLocaleString('id-ID') : '-'} → ${nominal_cair != null ? 'Rp ' + Number(nominal_cair).toLocaleString('id-ID') : '-'})`
      );
    }
    if ((oldResi || '') !== (newResi || '')) {
      changes.push(`Resi ("${oldResi || '-'}" → "${newResi || '-'}")`);
    }
    if ((oldNotes || '') !== (newNotes || '')) {
      changes.push(`Catatan ("${oldNotes || '-'}" → "${newNotes || '-'}")`);
    }

    let actionType = 'UPDATE_ORDER';
    if (oldNominal !== nominal_cair && nominal_cair !== null && changes.length === 1) {
      actionType = 'UPDATE_STATUS_WD';
    }

    let desc = `Mengubah data pesanan (${order_no_m})`;
    if (changes.length === 1 && oldOrderDate !== newOrderDate) {
      desc = `Mengubah/Memundurkan tanggal pesanan (${order_no_m}) dari ${oldOrderDate || '-'} menjadi ${newOrderDate}`;
    } else if (changes.length > 0) {
      desc = `Mengubah pesanan (${order_no_m}): ${changes.join(', ')}`;
    }

    await logActivity({
      req,
      action: actionType,
      entityType: 'orders',
      entityId: req.params.id,
      reference: order_no_m,
      description: desc,
      beforeData: {
        order_no: prev.order_no,
        order_date: oldOrderDate,
        product_name: prev.product_name,
        variasi: prev.variasi,
        qty: oldQty,
        selling_price: oldPrice,
        status: oldStat,
        nominal_cair: oldNominal,
        resi: oldResi,
        notes: oldNotes,
      },
      afterData: {
        order_no: order_no_m,
        order_date: newOrderDate,
        product_name: product_name_m,
        variasi: variasi_m,
        qty: newQty,
        selling_price: newPrice,
        status: stat,
        nominal_cair,
        resi: newResi,
        notes: newNotes,
      },
    });

    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Gagal update order' });
  } finally {
    conn.release();
  }
});

app.delete('/api/orders/:id', authRequired, staffExceptChecker, ownerOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const prev = await getOrderById(conn, req.params.id);
    if (!prev) return res.status(404).json({ message: 'Order tidak ada' });
    const [siblings] = await conn.query(
      `SELECT * FROM orders
       WHERE order_no = ? AND store_id = ? AND DATE(order_date) = DATE(?)`,
      [prev.order_no, prev.store_id, prev.order_date]
    );
    await conn.beginTransaction();
    for (const r of siblings) {
      if (r.product_id && shouldConsumeStock(r.status)) {
        await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [
          r.qty,
          r.product_id,
        ]);
      }
    }
    const ids = siblings.map((r) => r.id);
    await conn.query(
      `DELETE FROM orders WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    await conn.commit();

    const siblingItems = siblings.map((r) => ({
      product_name: r.product_name,
      variasi: r.variasi || null,
      qty: Number(r.qty) || 1,
      selling_price: Number(r.selling_price) || 0,
    }));

    await logActivity({
      req,
      action: 'DELETE_ORDER',
      entityType: 'orders',
      entityId: req.params.id,
      reference: prev.order_no,
      description: `Menghapus pesanan (${prev.order_no}) - ${siblings.length > 1 ? `${siblings.length} produk` : prev.product_name}`,
      beforeData: {
        order_no: prev.order_no,
        order_date: orderDateKeyDb(prev.order_date),
        status: prev.status,
        resi: prev.resi,
        nominal_cair: prev.nominal_cair != null ? Number(prev.nominal_cair) : null,
        notes: prev.notes || null,
        items: siblingItems.length > 1 ? siblingItems : undefined,
        product_name: siblingItems.length === 1 ? prev.product_name : undefined,
        variasi: siblingItems.length === 1 ? prev.variasi : undefined,
        qty: siblingItems.length === 1 ? prev.qty : undefined,
        selling_price: siblingItems.length === 1 ? Number(prev.selling_price) || 0 : undefined,
      },
      afterData: null,
    });

    res.json({ ok: true, deleted: ids.length });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Gagal hapus order' });
  } finally {
    conn.release();
  }
});

/* ——— Dashboard ——— */
app.get('/api/dashboard', authRequired, staffExceptChecker, async (req, res) => {
  try {
    const { store_id, date_from, date_to } = req.query;
    let oWhere = '1=1';
    const params = [];
    if (store_id) {
      oWhere += ' AND store_id = ?';
      params.push(store_id);
    }
    if (date_from) {
      oWhere += ' AND order_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      oWhere += ' AND order_date <= ?';
      params.push(date_to);
    }

    const oWhereAliased = oWhere
      .replace(/\bstore_id\b/g, 'o.store_id')
      .replace(/\border_date\b/g, 'o.order_date');

    const [belumCair] = await pool.query(
      `SELECT COUNT(*) AS c FROM (
        SELECT 1 AS x
        FROM orders o
        WHERE ${oWhereAliased}
        GROUP BY o.order_no, o.store_id, DATE(o.order_date)
        HAVING SUM(CASE WHEN o.nominal_cair IS NULL THEN 1 ELSE 0 END) = COUNT(*)
      ) grp`,
      params
    );

    /* Modal nyangkut: hanya grup order yang belum ada nominal_cair sama sekali.
       Baris lanjutan multi-item sering NULL walau pembayaran tercatat di baris pertama. */
    const [modalNyangkut] = await pool.query(
      `SELECT COALESCE(SUM(o.qty * o.hpp_snapshot), 0) AS t
       FROM orders o
       WHERE ${oWhereAliased}
         AND o.status != 'retur'
         AND NOT EXISTS (
           SELECT 1 FROM orders x
           WHERE x.order_no = o.order_no
             AND x.store_id = o.store_id
             AND DATE(x.order_date) = DATE(o.order_date)
             AND x.nominal_cair IS NOT NULL
         )`,
      params
    );

    // Overall nominal cair (revenue)
    const [cairDb] = await pool.query(
      `SELECT COALESCE(SUM(nominal_cair), 0) AS t FROM orders WHERE ${oWhere} AND nominal_cair IS NOT NULL`,
      params
    );
    const totalNominalCair = Number(cairDb[0].t) || 0;

    // Overall modal cair (COGS)
    const [modalCairDb] = await pool.query(
      `SELECT COALESCE(SUM(o.qty * o.hpp_snapshot), 0) AS t
       FROM orders o
       WHERE ${oWhereAliased}
         AND (
           o.status = 'retur'
           OR EXISTS (
             SELECT 1 FROM orders x
             WHERE x.order_no = o.order_no
               AND x.store_id = o.store_id
               AND DATE(x.order_date) = DATE(o.order_date)
               AND x.nominal_cair IS NOT NULL
           )
         )`,
      params
    );
    const totalModalCair = Number(modalCairDb[0].t) || 0;

    const labaBersih = totalNominalCair - totalModalCair;

    // Overall expenses
    let expWhere = '1=1';
    const expParams = [];
    if (store_id) {
      expWhere += ' AND store_id = ?';
      expParams.push(store_id);
    }
    if (date_from) {
      expWhere += ' AND expense_date >= ?';
      expParams.push(date_from);
    }
    if (date_to) {
      expWhere += ' AND expense_date <= ?';
      expParams.push(date_to);
    }

    const [expSum] = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN category = 'operasional' THEN amount ELSE 0 END), 0) AS ops,
         COALESCE(SUM(CASE WHEN category = 'iklan' THEN amount ELSE 0 END), 0) AS ads,
         COALESCE(SUM(CASE WHEN category NOT IN ('operasional', 'iklan') THEN amount ELSE 0 END), 0) AS lain
       FROM expenses
       WHERE ${expWhere}`,
      expParams
    );
    const totalOps = Number(expSum[0].ops) || 0;
    const totalAds = Number(expSum[0].ads) || 0;
    const totalLain = Number(expSum[0].lain) || 0;
    const totalExpenses = totalOps + totalAds + totalLain;

    const [stokSummary] = await pool.query(
      `SELECT
        COALESCE(SUM(stock),0) AS total_stok_qty,
        COALESCE(SUM(stock * hpp),0) AS total_modal_stok
      FROM products`
    );

    const [topProduk] = await pool.query(
      `SELECT
        COALESCE(NULLIF(o.product_name,''), CONCAT('Produk #', o.product_id)) AS product_name,
        SUM(o.qty) AS total_keluar
      FROM orders o
      WHERE ${oWhere} AND o.status != 'retur'
      GROUP BY o.product_id, o.product_name
      ORDER BY total_keluar DESC
      LIMIT 5`,
      params
    );

    let storeList;
    if (store_id) {
      const [one] = await pool.query(
        'SELECT id, name FROM stores WHERE id = ?',
        [store_id]
      );
      storeList = one;
    } else {
      const [all] = await pool.query(
        'SELECT id, name FROM stores ORDER BY name ASC'
      );
      storeList = all;
    }

    const perTokoLaba = [];
    for (const t of storeList) {
      let ow = 'store_id = ?';
      const pparams = [t.id];
      if (date_from) {
        ow += ' AND order_date >= ?';
        pparams.push(date_from);
      }
      if (date_to) {
        ow += ' AND order_date <= ?';
        pparams.push(date_to);
      }
      const owAliased = ow
        .replace(/\bstore_id\b/g, 'o.store_id')
        .replace(/\border_date\b/g, 'o.order_date');
      const [cairSum] = await pool.query(
        `SELECT COALESCE(SUM(nominal_cair),0) AS t FROM orders WHERE ${ow} AND nominal_cair IS NOT NULL`,
        pparams
      );
      const [modalBelum] = await pool.query(
        `SELECT COALESCE(SUM(o.qty * o.hpp_snapshot), 0) AS t
         FROM orders o
         WHERE ${owAliased}
           AND o.status != 'retur'
           AND NOT EXISTS (
             SELECT 1 FROM orders x
             WHERE x.order_no = o.order_no
               AND x.store_id = o.store_id
               AND DATE(x.order_date) = DATE(o.order_date)
               AND x.nominal_cair IS NOT NULL
           )`,
        pparams
      );
      const [modalCairStore] = await pool.query(
        `SELECT COALESCE(SUM(o.qty * o.hpp_snapshot), 0) AS t
         FROM orders o
         WHERE ${owAliased}
           AND (
             o.status = 'retur'
             OR EXISTS (
               SELECT 1 FROM orders x
               WHERE x.order_no = o.order_no
                 AND x.store_id = o.store_id
                 AND DATE(x.order_date) = DATE(o.order_date)
                 AND x.nominal_cair IS NOT NULL
             )
           )`,
        pparams
      );
      const storeModalCair = Number(modalCairStore[0].t) || 0;
      const laba = Number(cairSum[0].t) - storeModalCair;

      // Store specific expenses
      let expw = 'store_id = ?';
      const expparams = [t.id];
      if (date_from) {
        expw += ' AND expense_date >= ?';
        expparams.push(date_from);
      }
      if (date_to) {
        expw += ' AND expense_date <= ?';
        expparams.push(date_to);
      }
      const [storeExpSum] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE ${expw}`,
        expparams
      );
      const storeExpense = Number(storeExpSum[0].t) || 0;

      perTokoLaba.push({
        store_id: t.id,
        name: t.name,
        total_penjualan_cair: Number(cairSum[0].t),
        modal_belum_cair: Number(modalBelum[0].t),
        laba_kotor: laba,
        total_expense: storeExpense,
        laba_bersih: laba - storeExpense,
      });
    }

    res.json({
      total_order_belum_cair: belumCair[0].c,
      total_modal_nyangkut: Number(modalNyangkut[0].t),
      laba_kotor: labaBersih,
      total_nominal_cair: totalNominalCair,
      total_modal_cair: totalModalCair,
      total_expenses_operasional: totalOps,
      total_expenses_iklan: totalAds,
      total_expenses_lainnya: totalLain,
      total_expenses: totalExpenses,
      laba_bersih: labaBersih - totalExpenses,
      total_stok_qty: Number(stokSummary[0].total_stok_qty),
      total_modal_stok: Number(stokSummary[0].total_modal_stok),
      top_produk_keluar: topProduk.map((r) => ({
        product_name: r.product_name || '-',
        total_keluar: Number(r.total_keluar) || 0,
      })),
      per_toko: perTokoLaba,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat dashboard' });
  }
});

/* ——— Users (owner) ——— */
app.get('/api/users', authRequired, staffExceptChecker, ownerOnly, async (req, res) => {
  const { page = 1, limit = 10, search = '' } = req.query;
  const { page: p, limit: l, offset } = paginate(page, limit);
  const q = `%${String(search).trim()}%`;
  const [c] = await pool.query(
    'SELECT COUNT(*) AS c FROM users WHERE name LIKE ? OR email LIKE ?',
    [q, q]
  );
  const [rows] = await pool.query(
    'SELECT id, name, email, role, created_at FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?',
    [q, q, l, offset]
  );
  res.json({ data: rows, page: p, limit: l, total: c[0].c });
});

app.put('/api/users/:id', authRequired, staffExceptChecker, ownerOnly, async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name?.trim() || !email?.trim())
    return res.status(400).json({ message: 'Nama dan email wajib' });

  const allowed = new Set(['owner', 'admin', 'karyawan', 'checker_pengiriman']);
  let r = String(role || 'karyawan').trim();
  if (!allowed.has(r)) r = 'karyawan';

  if (String(req.params.id) === String(req.user.id) && r !== req.user.role)
    return res.status(400).json({ message: 'Tidak bisa mengubah role akun sendiri' });

  const [existing] = await pool.query(
    'SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1',
    [req.params.id]
  );
  if (!existing[0]) return res.status(404).json({ message: 'User tidak ditemukan' });
  const oldUser = existing[0];

  const emailNorm = String(email).trim().toLowerCase();
  const sets = ['name = ?', 'email = ?', 'role = ?'];
  const params = [name.trim(), emailNorm, r];

  if (password != null && String(password).trim() !== '') {
    const hash = await bcrypt.hash(String(password), 10);
    sets.push('password_hash = ?');
    params.push(hash);
  }

  params.push(req.params.id);

  try {
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);

    const userChanges = [];
    if (oldUser.role !== r) {
      userChanges.push(`Role (${oldUser.role} → ${r})`);
    }
    if (oldUser.name !== name.trim()) {
      userChanges.push(`Nama ("${oldUser.name}" → "${name.trim()}")`);
    }
    if (oldUser.email !== emailNorm) {
      userChanges.push(`Email ("${oldUser.email}" → "${emailNorm}")`);
    }
    if (password != null && String(password).trim() !== '') {
      userChanges.push('Password diubah');
    }

    let userDesc = `Mengubah data user "${name.trim()}" (Role: ${r})`;
    if (oldUser.role !== r && userChanges.length === 1) {
      userDesc = `Mengubah role user "${name.trim()}" dari "${oldUser.role}" menjadi "${r}"`;
    } else if (userChanges.length > 0) {
      userDesc = `Mengubah user "${name.trim()}": ${userChanges.join(', ')}`;
    }

    await logActivity({
      req,
      action: 'UPDATE_USER',
      entityType: 'users',
      entityId: req.params.id,
      reference: emailNorm,
      description: userDesc,
      beforeData: { name: oldUser.name, email: oldUser.email, role: oldUser.role },
      afterData: { name: name.trim(), email: emailNorm, role: r },
    });

    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ message: 'Email sudah terdaftar' });
    throw e;
  }
});

app.post('/api/users', authRequired, staffExceptChecker, ownerOnly, async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ message: 'Nama, email, password wajib' });
  const allowed = new Set(['owner', 'admin', 'karyawan', 'checker_pengiriman']);
  let r = String(role || 'karyawan').trim();
  if (!allowed.has(r)) r = 'karyawan';
  const hash = await bcrypt.hash(String(password), 10);
  try {
    const [ins] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
      [name.trim(), String(email).trim().toLowerCase(), hash, r]
    );

    await logActivity({
      req,
      action: 'CREATE_USER',
      entityType: 'users',
      entityId: ins.insertId,
      reference: String(email).trim().toLowerCase(),
      description: `Menambahkan user baru "${name.trim()}" (${r})`,
      beforeData: null,
      afterData: { id: ins.insertId, name: name.trim(), email: String(email).trim().toLowerCase(), role: r },
    });

    res.status(201).json({ id: ins.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ message: 'Email sudah terdaftar' });
    throw e;
  }
});

app.delete('/api/users/:id', authRequired, staffExceptChecker, ownerOnly, async (req, res) => {
  if (String(req.params.id) === String(req.user.id))
    return res.status(400).json({ message: 'Tidak bisa hapus diri sendiri' });

  const [existing] = await pool.query(
    'SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1',
    [req.params.id]
  );
  const oldUser = existing[0];

  await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);

  if (oldUser) {
    await logActivity({
      req,
      action: 'DELETE_USER',
      entityType: 'users',
      entityId: req.params.id,
      reference: oldUser.email,
      description: `Menghapus user "${oldUser.name}" (${oldUser.email})`,
      beforeData: oldUser,
      afterData: null,
    });
  }

  res.json({ ok: true });
});

/* ——— Expenses (Keuangan) ——— */
app.get('/api/expenses', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, category, store_id, date_from, date_to, search } = req.query;
    const { page: p, limit: l, offset } = paginate(page, limit);
    let where = '1=1';
    const params = [];
    if (category) {
      where += ' AND e.category = ?';
      params.push(category);
    }
    if (store_id) {
      where += ' AND e.store_id = ?';
      params.push(store_id);
    }
    if (date_from) {
      where += ' AND e.expense_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      where += ' AND e.expense_date <= ?';
      params.push(date_to);
    }
    if (search) {
      where += ' AND e.notes LIKE ?';
      params.push(`%${String(search).trim()}%`);
    }
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM expenses e WHERE ${where}`,
      params
    );
    const total = countRows[0].c;
    const [rows] = await pool.query(
      `SELECT e.*, s.name AS store_name, u.name AS user_name 
       FROM expenses e 
       LEFT JOIN stores s ON s.id = e.store_id 
       LEFT JOIN users u ON u.id = e.created_by
       WHERE ${where} 
       ORDER BY e.expense_date DESC, e.id DESC 
       LIMIT ? OFFSET ?`,
      [...params, l, offset]
    );
    res.json({ data: rows, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat data pengeluaran' });
  }
});

app.post('/api/expenses', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const { category, amount, expense_date, store_id, notes } = req.body || {};
    if (!category || !amount || !expense_date) {
      return res.status(400).json({ message: 'Kategori, jumlah, dan tanggal wajib diisi' });
    }
    const [r] = await pool.query(
      `INSERT INTO expenses (category, amount, expense_date, store_id, notes, created_by) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        category,
        Number(amount) || 0,
        expense_date,
        store_id ? Number(store_id) : null,
        notes || null,
        req.user.id
      ]
    );

    await logActivity({
      req,
      action: 'CREATE_EXPENSE',
      entityType: 'expenses',
      entityId: r.insertId,
      reference: `Rp ${Number(amount).toLocaleString('id-ID')}`,
      description: `Menambah pengeluaran [${category}]: Rp ${Number(amount).toLocaleString('id-ID')}`,
      beforeData: null,
      afterData: {
        category,
        amount: Number(amount) || 0,
        expense_date,
        store_id: store_id ? Number(store_id) : null,
        notes: notes || null,
      },
    });

    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal menyimpan pengeluaran' });
  }
});

app.put('/api/expenses/:id', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const { category, amount, expense_date, store_id, notes } = req.body || {};
    if (!category || !amount || !expense_date) {
      return res.status(400).json({ message: 'Kategori, jumlah, dan tanggal wajib diisi' });
    }

    const [existing] = await pool.query('SELECT * FROM expenses WHERE id = ? LIMIT 1', [req.params.id]);
    const oldExpense = existing[0];

    await pool.query(
      `UPDATE expenses 
       SET category = ?, amount = ?, expense_date = ?, store_id = ?, notes = ? 
       WHERE id = ?`,
      [
        category,
        Number(amount) || 0,
        expense_date,
        store_id ? Number(store_id) : null,
        notes || null,
        req.params.id
      ]
    );

    await logActivity({
      req,
      action: 'UPDATE_EXPENSE',
      entityType: 'expenses',
      entityId: req.params.id,
      reference: `ID #${req.params.id}`,
      description: `Mengubah pengeluaran [${category}] menjadi Rp ${Number(amount).toLocaleString('id-ID')}`,
      beforeData: oldExpense,
      afterData: {
        category,
        amount: Number(amount) || 0,
        expense_date,
        store_id: store_id ? Number(store_id) : null,
        notes: notes || null,
      },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal mengubah pengeluaran' });
  }
});

app.delete('/api/expenses/:id', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM expenses WHERE id = ? LIMIT 1', [req.params.id]);
    const oldExpense = existing[0];

    await pool.query('DELETE FROM expenses WHERE id = ?', [req.params.id]);

    if (oldExpense) {
      await logActivity({
        req,
        action: 'DELETE_EXPENSE',
        entityType: 'expenses',
        entityId: req.params.id,
        reference: `Rp ${Number(oldExpense.amount).toLocaleString('id-ID')}`,
        description: `Menghapus pengeluaran [${oldExpense.category}] sebesar Rp ${Number(oldExpense.amount).toLocaleString('id-ID')}`,
        beforeData: oldExpense,
        afterData: null,
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal menghapus pengeluaran' });
  }
});

/* ——— Incomes (Pemasukan) ——— */
app.get('/api/incomes', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, category, source, date_from, date_to, search } = req.query;
    const { page: p, limit: l, offset } = paginate(page, limit);
    let where = '1=1';
    const params = [];
    if (category) {
      where += ' AND i.category = ?';
      params.push(category);
    }
    if (source) {
      where += ' AND i.source = ?';
      params.push(source);
    }
    if (date_from) {
      where += ' AND i.income_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      where += ' AND i.income_date <= ?';
      params.push(date_to);
    }
    if (search) {
      where += ' AND (i.notes LIKE ? OR i.source LIKE ?)';
      params.push(`%${String(search).trim()}%`, `%${String(search).trim()}%`);
    }
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM incomes i WHERE ${where}`,
      params
    );
    const total = countRows[0].c;
    const [rows] = await pool.query(
      `SELECT i.*, u.name AS user_name 
       FROM incomes i 
       LEFT JOIN users u ON u.id = i.created_by
       WHERE ${where} 
       ORDER BY i.income_date DESC, i.id DESC 
       LIMIT ? OFFSET ?`,
      [...params, l, offset]
    );
    res.json({ data: rows, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat data pemasukan' });
  }
});

app.post('/api/incomes', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const { category, source, amount, income_date, notes } = req.body || {};
    if (!category || !amount || !income_date) {
      return res.status(400).json({ message: 'Kategori, jumlah, dan tanggal wajib diisi' });
    }
    const [r] = await pool.query(
      `INSERT INTO incomes (category, source, amount, income_date, notes, created_by) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        category,
        source || null,
        Number(amount) || 0,
        income_date,
        notes || null,
        req.user.id
      ]
    );

    await logActivity({
      req,
      action: 'CREATE_INCOME',
      entityType: 'incomes',
      entityId: r.insertId,
      reference: `Rp ${Number(amount).toLocaleString('id-ID')}`,
      description: `Menambah pemasukan [${category}]: Rp ${Number(amount).toLocaleString('id-ID')}`,
      beforeData: null,
      afterData: {
        category,
        source: source || null,
        amount: Number(amount) || 0,
        income_date,
        notes: notes || null,
      },
    });

    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal menyimpan pemasukan' });
  }
});

app.put('/api/incomes/:id', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const { category, source, amount, income_date, notes } = req.body || {};
    if (!category || !amount || !income_date) {
      return res.status(400).json({ message: 'Kategori, jumlah, dan tanggal wajib diisi' });
    }

    const [existing] = await pool.query('SELECT * FROM incomes WHERE id = ? LIMIT 1', [req.params.id]);
    const oldIncome = existing[0];

    await pool.query(
      `UPDATE incomes 
       SET category = ?, source = ?, amount = ?, income_date = ?, notes = ? 
       WHERE id = ?`,
      [
        category,
        source || null,
        Number(amount) || 0,
        income_date,
        notes || null,
        req.params.id
      ]
    );

    await logActivity({
      req,
      action: 'UPDATE_INCOME',
      entityType: 'incomes',
      entityId: req.params.id,
      reference: `ID #${req.params.id}`,
      description: `Mengubah pemasukan [${category}] menjadi Rp ${Number(amount).toLocaleString('id-ID')}`,
      beforeData: oldIncome,
      afterData: {
        category,
        source: source || null,
        amount: Number(amount) || 0,
        income_date,
        notes: notes || null,
      },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal mengubah pemasukan' });
  }
});

app.delete('/api/incomes/:id', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM incomes WHERE id = ? LIMIT 1', [req.params.id]);
    const oldIncome = existing[0];

    await pool.query('DELETE FROM incomes WHERE id = ?', [req.params.id]);

    if (oldIncome) {
      await logActivity({
        req,
        action: 'DELETE_INCOME',
        entityType: 'incomes',
        entityId: req.params.id,
        reference: `Rp ${Number(oldIncome.amount).toLocaleString('id-ID')}`,
        description: `Menghapus pemasukan [${oldIncome.category}] sebesar Rp ${Number(oldIncome.amount).toLocaleString('id-ID')}`,
        beforeData: oldIncome,
        afterData: null,
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal menghapus pemasukan' });
  }
});

/* ——— Finance Info & Balance ——— */
app.get('/api/finances/balance', authRequired, staffExceptChecker, ownerOrAdmin, async (req, res) => {
  try {
    const [[{ total_income }]] = await pool.query(`SELECT COALESCE(SUM(amount), 0) AS total_income FROM incomes`);
    const [[{ total_expense_deductible }]] = await pool.query(`SELECT COALESCE(SUM(amount), 0) AS total_expense_deductible FROM expenses WHERE category != 'iklan'`);
    const saldo_mandiri = Number(total_income) - Number(total_expense_deductible);
    res.json({
      saldo_mandiri,
      total_income: Number(total_income),
      total_expense_deductible: Number(total_expense_deductible)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat saldo' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));


module.exports = app;