-- Migration 010: Courier Scan Settings & Stock Audit Sessions
-- Impor manual jika diperlukan: mysql -u <user> -p <database> < 010_courier_settings_and_audit_sessions.sql

-- 1. Tabel pengaturan prefix dan suara kurir / ekspedisi
CREATE TABLE IF NOT EXISTS courier_scan_settings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  courier_name VARCHAR(100) NOT NULL,
  prefix VARCHAR(50) NOT NULL,
  sound_file VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_courier_prefix (prefix),
  KEY idx_courier_active (is_active)
) ENGINE=InnoDB;

-- Seed default ekspedisi jika kosong
INSERT INTO courier_scan_settings (courier_name, prefix, sound_file, is_active, sort_order)
SELECT * FROM (
  SELECT 'SPX' AS courier_name, 'SPXID' AS prefix, 'SPX.mpeg' AS sound_file, 1 AS is_active, 1 AS sort_order UNION ALL
  SELECT 'POS', 'SHPE', 'POS.mpeg', 1, 2 UNION ALL
  SELECT 'ID Express', 'IDS', 'ID-EXPRESS.mpeg', 1, 3 UNION ALL
  SELECT 'J&T', 'JY1', 'J&T.mpeg', 1, 4 UNION ALL
  SELECT 'JNE YES', 'JY', 'JNE-YES.mpeg', 1, 5 UNION ALL
  SELECT 'JNE Reguler', 'CM', 'JNE-REGULER.mpeg', 1, 6 UNION ALL
  SELECT 'J&T Cargo', '2016', 'J&T-CARGO.mpeg', 1, 7 UNION ALL
  SELECT 'Anteraja', '110', 'ANTERAJA.mpeg', 1, 8
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM courier_scan_settings LIMIT 1);

-- Jika tabel sudah ada dan masih menggunakan JNE.mpeg, jalankan update ini:
UPDATE courier_scan_settings SET sound_file = 'JNE-YES.mpeg' WHERE courier_name = 'JNE YES' AND sound_file = 'JNE.mpeg';
UPDATE courier_scan_settings SET sound_file = 'JNE-REGULER.mpeg' WHERE courier_name = 'JNE Reguler' AND sound_file = 'JNE.mpeg';

-- 2. Kolom tanggal terakhir diaudit pada tabel products
ALTER TABLE products ADD COLUMN last_audit_date DATE DEFAULT NULL;

-- 3. Tabel Sesi Stock Audit
CREATE TABLE IF NOT EXISTS stock_audit_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_code VARCHAR(50) NOT NULL UNIQUE,
  status ENUM('in_progress', 'pending_approval', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'in_progress',
  audit_date DATE NOT NULL,
  notes TEXT DEFAULT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  approved_by INT UNSIGNED DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_session_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_session_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL,
  KEY idx_audit_sessions_status (status),
  KEY idx_audit_sessions_date (audit_date)
) ENGINE=InnoDB;

-- 4. Tabel Item dalam Sesi Stock Audit
CREATE TABLE IF NOT EXISTS stock_audit_session_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  system_stock INT NOT NULL DEFAULT 0,
  physical_stock INT DEFAULT NULL,
  delta_stock INT DEFAULT NULL,
  item_notes VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_item_session FOREIGN KEY (session_id) REFERENCES stock_audit_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_item_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  UNIQUE KEY uk_session_product (session_id, product_id),
  KEY idx_audit_item_product (product_id)
) ENGINE=InnoDB;
