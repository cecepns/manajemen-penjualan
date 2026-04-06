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
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'manajemen_penjualan',
  waitForConnections: true,
  connectionLimit: 10,
});

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
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

function paginate(page, limit = 10) {
  const p = Math.max(1, parseInt(String(page), 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 10));
  return { page: p, limit: l, offset: (p - 1) * l };
}

function payoutLabel(row) {
  if (row.nominal_cair == null) return 'belum_cair';
  return 'sudah_cair';
}

function labaForRow(row) {
  const modal = Number(row.qty) * Number(row.hpp_snapshot);
  const nc = row.nominal_cair != null ? Number(row.nominal_cair) : null;
  if (row.status === 'retur') return Math.min(0, (nc ?? 0) - modal);
  if (nc == null) return null;
  return nc - modal;
}

async function ensureDefaultAdmin() {
  const [rows] = await pool.query('SELECT id FROM users LIMIT 1');
  if (rows.length) return;
  const hash = await bcrypt.hash('admin123', 10);
  await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
    ['Administrator', 'admin@local.test', hash, 'admin']
  );
  console.log('Default admin dibuat: admin@local.test / admin123');
}

function authRequired(req, res, next) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Token tidak valid' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ message: 'Hanya admin' });
  next();
}

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
    res.json({
      token,
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal login' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, role FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json(rows[0] || null);
});

/* ——— Stores ——— */
app.get('/api/stores', authRequired, async (req, res) => {
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

app.post('/api/stores', authRequired, adminOnly, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ message: 'Nama toko wajib' });
    const [r] = await pool.query('INSERT INTO stores (name) VALUES (?)', [
      name.trim(),
    ]);
    res.status(201).json({ id: r.insertId, name: name.trim() });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ message: 'Nama toko sudah ada' });
    console.error(e);
    res.status(500).json({ message: 'Gagal menyimpan toko' });
  }
});

app.put('/api/stores/:id', authRequired, adminOnly, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ message: 'Nama toko wajib' });
    await pool.query('UPDATE stores SET name = ? WHERE id = ?', [
      name.trim(),
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal update toko' });
  }
});

app.delete('/api/stores/:id', authRequired, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM stores WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal hapus toko (mungkin masih dipakai)' });
  }
});

app.get('/api/stores/all', authRequired, async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name FROM stores ORDER BY name ASC'
  );
  res.json(rows);
});

/* ——— Products ——— */
app.get('/api/products', authRequired, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const { page: p, limit: l, offset } = paginate(page, limit);
    const q = `%${String(search).trim()}%`;
    const where = '(p.name LIKE ? OR IFNULL(p.barcode,"") LIKE ?)';
    const params = [q, q];
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM products p WHERE ${where}`,
      params
    );
    const total = countRows[0].c;
    const [rows] = await pool.query(
      `SELECT p.* FROM products p
       WHERE ${where}
       ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
      [...params, l, offset]
    );
    res.json({ data: rows, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat produk' });
  }
});

app.get('/api/products/by-barcode', authRequired, async (req, res) => {
  const { barcode } = req.query;
  if (!barcode?.trim())
    return res.status(400).json({ message: 'Barcode wajib' });
  const [rows] = await pool.query(
    'SELECT p.* FROM products p WHERE p.barcode = ? LIMIT 1',
    [String(barcode).trim()]
  );
  res.json(rows[0] || null);
});

app.get('/api/products/:id', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ? LIMIT 1', [
    req.params.id,
  ]);
  if (!rows[0]) return res.status(404).json({ message: 'Tidak ada' });
  res.json(rows[0]);
});

app.post('/api/products', authRequired, async (req, res) => {
  try {
    const { name, barcode, hpp, stock } = req.body || {};
    if (!name?.trim())
      return res.status(400).json({ message: 'Nama produk wajib' });
    const [r] = await pool.query(
      'INSERT INTO products (name, barcode, hpp, stock) VALUES (?,?,?,?)',
      [
        name.trim(),
        barcode?.trim() || null,
        Number(hpp) || 0,
        Number(stock) || 0,
      ]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal simpan produk' });
  }
});

app.put('/api/products/:id', authRequired, async (req, res) => {
  try {
    const { name, barcode, hpp, stock } = req.body || {};
    if (!name?.trim())
      return res.status(400).json({ message: 'Nama produk wajib' });
    await pool.query(
      'UPDATE products SET name=?, barcode=?, hpp=?, stock=? WHERE id=?',
      [
        name.trim(),
        barcode?.trim() || null,
        Number(hpp) || 0,
        Number(stock) || 0,
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal update produk' });
  }
});

app.delete('/api/products/:id', authRequired, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
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

/* ——— Orders ——— */
app.get('/api/orders/export', authRequired, async (req, res) => {
  try {
    const { store_id, date_from, date_to, payout, search = '' } = req.query;
    let where =
      '(o.order_no LIKE ? OR o.product_name LIKE ? OR IFNULL(o.resi,"") LIKE ?)';
    const q = `%${String(search).trim()}%`;
    const params = [q, q, q];
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
    if (payout === 'belum') where += ' AND o.nominal_cair IS NULL';
    else if (payout === 'sudah') where += ' AND o.nominal_cair IS NOT NULL';

    const [rows] = await pool.query(
      `SELECT o.*, s.name AS store_name FROM orders o
       JOIN stores s ON s.id = o.store_id WHERE ${where} ORDER BY o.order_date DESC, o.id DESC`,
      params
    );

    const sheet = rows.map((o) => ({
      NoPesanan: o.order_no,
      Resi: o.resi,
      Produk: o.product_name,
      Variasi: o.variasi,
      Qty: o.qty,
      HargaJual: o.selling_price,
      HPP: o.hpp_snapshot,
      TotalModal: Number(o.qty) * Number(o.hpp_snapshot),
      Toko: o.store_name,
      Tanggal: o.order_date,
      Status: o.status,
      NominalCair: o.nominal_cair,
      StatusCair: o.nominal_cair == null ? 'Belum Cair' : 'Sudah Cair',
      Laba: labaForRow(o) == null ? '' : labaForRow(o),
    }));

    res.json({ data: sheet });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal export' });
  }
});

app.get('/api/orders/:id', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, s.name AS store_name,
        CASE WHEN o.nominal_cair IS NULL THEN 'Belum Cair' ELSE 'Sudah Cair' END AS payout_status_label
       FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.id = ? LIMIT 1`,
      [req.params.id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Tidak ada' });
    res.json({
      ...row,
      payout_status: payoutLabel(row),
      laba: labaForRow(row),
      total_modal: Number(row.qty) * Number(row.hpp_snapshot),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat order' });
  }
});

app.get('/api/orders', authRequired, async (req, res) => {
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
      '(o.order_no LIKE ? OR o.product_name LIKE ? OR IFNULL(o.resi,"") LIKE ?)';
    const params = [q, q, q];
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
    if (payout === 'belum') where += ' AND o.nominal_cair IS NULL';
    else if (payout === 'sudah') where += ' AND o.nominal_cair IS NOT NULL';
    if (status && ['diproses', 'dikirim', 'selesai', 'retur'].includes(status)) {
      where += ' AND o.status = ?';
      params.push(status);
    }
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM orders o WHERE ${where}`,
      params
    );
    const total = countRows[0].c;
    const [rows] = await pool.query(
      `SELECT o.*, s.name AS store_name,
        CASE WHEN o.nominal_cair IS NULL THEN 'Belum Cair' ELSE 'Sudah Cair' END AS payout_status_label
       FROM orders o
       JOIN stores s ON s.id = o.store_id
       WHERE ${where}
       ORDER BY o.order_date DESC, o.id DESC
       LIMIT ? OFFSET ?`,
      [...params, l, offset]
    );
    const data = rows.map((row) => ({
      ...row,
      payout_status: payoutLabel(row),
      laba: labaForRow(row),
      total_modal: Number(row.qty) * Number(row.hpp_snapshot),
    }));
    res.json({ data, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat order' });
  }
});

app.post('/api/orders', authRequired, orderUploadMaybe, async (req, res) => {
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
        let hpp_snapshot = Number(it.hpp_snapshot) || 0;
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
          hpp_snapshot = Number(pr.hpp);
          if (shouldConsumeStock(stat) && pr.stock < qty) {
            await conn.rollback();
            return res.status(400).json({
              message: `Baris ${i + 1}: stok produk tidak cukup`,
            });
          }
        }
        const nominal_cair =
          it.nominal_cair === '' ||
          it.nominal_cair == null ||
          it.nominal_cair === undefined
            ? null
            : Number(it.nominal_cair);
        const payout_at = nominal_cair != null ? new Date() : null;
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

    let hpp_snapshot = Number(body.hpp_snapshot) || 0;
    let product_id = body.product_id ? Number(body.product_id) : null;
    const stat = body.status || 'diproses';

    if (product_id) {
      const [prows] = await conn.query(
        'SELECT hpp, stock FROM products WHERE id = ? FOR UPDATE',
        [product_id]
      );
      const pr = prows[0];
      if (!pr) return res.status(400).json({ message: 'Produk tidak ditemukan' });
      hpp_snapshot = Number(pr.hpp);
      const qty = Number(body.qty) || 1;
      if (shouldConsumeStock(stat) && pr.stock < qty)
        return res.status(400).json({ message: 'Stok produk tidak cukup' });
    }

    const qty = Number(body.qty) || 1;
    const nominal_cair =
      body.nominal_cair === '' || body.nominal_cair == null
        ? null
        : Number(body.nominal_cair);
    const payout_at = nominal_cair != null ? new Date() : null;

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
    res.status(201).json({ id: ins.insertId });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Gagal simpan order' });
  } finally {
    conn.release();
  }
});

app.put('/api/orders/:id', authRequired, async (req, res) => {
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
    let hpp_snapshot =
      body.hpp_snapshot != null
        ? Number(body.hpp_snapshot)
        : Number(prev.hpp_snapshot);

    if (product_id) {
      const [prows] = await conn.query(
        'SELECT hpp, stock FROM products WHERE id = ? FOR UPDATE',
        [product_id]
      );
      const pr = prows[0];
      if (!pr) return res.status(400).json({ message: 'Produk tidak ditemukan' });
      hpp_snapshot = Number(pr.hpp);
    }

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

    const order_no =
      body.order_no != null ? String(body.order_no).trim() : prev.order_no;
    const product_name =
      body.product_name != null
        ? String(body.product_name).trim()
        : prev.product_name;

    await conn.query(
      `UPDATE orders SET
        order_no=?, resi=?, product_name=?, variasi=?, qty=?, selling_price=?, hpp_snapshot=?,
        store_id=?, product_id=?, order_date=?, status=?, nominal_cair=?, payout_at=?, notes=?
      WHERE id=?`,
      [
        order_no,
        body.resi !== undefined ? body.resi?.trim() || null : prev.resi,
        product_name,
        body.variasi !== undefined
          ? body.variasi?.trim() || null
          : prev.variasi,
        qty,
        Number(body.selling_price ?? prev.selling_price) || 0,
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
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Gagal update order' });
  } finally {
    conn.release();
  }
});

app.delete('/api/orders/:id', authRequired, adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const prev = await getOrderById(conn, req.params.id);
    if (!prev) return res.status(404).json({ message: 'Order tidak ada' });
    await conn.beginTransaction();
    if (prev.product_id && shouldConsumeStock(prev.status)) {
      await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [
        prev.qty,
        prev.product_id,
      ]);
    }
    await conn.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Gagal hapus order' });
  } finally {
    conn.release();
  }
});

/* ——— Dashboard ——— */
app.get('/api/dashboard', authRequired, async (req, res) => {
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

    const [belumCair] = await pool.query(
      `SELECT COUNT(*) AS c FROM orders WHERE ${oWhere} AND nominal_cair IS NULL`,
      params
    );

    const [modalNyangkut] = await pool.query(
      `SELECT COALESCE(SUM(qty * hpp_snapshot),0) AS t FROM orders WHERE ${oWhere} AND nominal_cair IS NULL AND status != 'retur'`,
      params
    );

    const [labaRows] = await pool.query(
      `SELECT nominal_cair, qty, hpp_snapshot, status FROM orders WHERE ${oWhere} AND nominal_cair IS NOT NULL`,
      params
    );
    let labaBersih = 0;
    for (const row of labaRows) {
      const l = labaForRow(row);
      if (l != null) labaBersih += l;
    }

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
      const [cairSum] = await pool.query(
        `SELECT COALESCE(SUM(nominal_cair),0) AS t FROM orders WHERE ${ow} AND nominal_cair IS NOT NULL`,
        pparams
      );
      const [modalBelum] = await pool.query(
        `SELECT COALESCE(SUM(qty * hpp_snapshot),0) AS t FROM orders WHERE ${ow} AND nominal_cair IS NULL AND status != 'retur'`,
        pparams
      );
      const [lr] = await pool.query(
        `SELECT nominal_cair, qty, hpp_snapshot, status FROM orders WHERE ${ow} AND nominal_cair IS NOT NULL`,
        pparams
      );
      let laba = 0;
      for (const row of lr) {
        const l = labaForRow(row);
        if (l != null) laba += l;
      }
      perTokoLaba.push({
        store_id: t.id,
        name: t.name,
        total_penjualan_cair: Number(cairSum[0].t),
        modal_belum_cair: Number(modalBelum[0].t),
        laba,
      });
    }

    res.json({
      total_order_belum_cair: belumCair[0].c,
      total_modal_nyangkut: Number(modalNyangkut[0].t),
      laba_bersih: labaBersih,
      per_toko: perTokoLaba,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal memuat dashboard' });
  }
});

/* ——— Users (admin) ——— */
app.get('/api/users', authRequired, adminOnly, async (req, res) => {
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

app.post('/api/users', authRequired, adminOnly, async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ message: 'Nama, email, password wajib' });
  const hash = await bcrypt.hash(String(password), 10);
  try {
    const [r] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
      [
        name.trim(),
        String(email).trim().toLowerCase(),
        hash,
        role === 'admin' ? 'admin' : 'karyawan',
      ]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ message: 'Email sudah terdaftar' });
    throw e;
  }
});

app.delete('/api/users/:id', authRequired, adminOnly, async (req, res) => {
  if (String(req.params.id) === String(req.user.id))
    return res.status(400).json({ message: 'Tidak bisa hapus diri sendiri' });
  await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, async () => {
  try {
    await ensureDefaultAdmin();
  } catch (e) {
    console.error('DB error — pastikan MySQL jalan dan schema.sql sudah diimpor:', e.message);
  }
  console.log(`API http://localhost:${PORT}`);
});
