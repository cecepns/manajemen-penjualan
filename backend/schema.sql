-- Manajemen Penjualan Marketplace — skema MySQL
-- Impor: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS manajemen_penjualan
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE manajemen_penjualan;

CREATE TABLE IF NOT EXISTS stores (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_stores_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  email VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'karyawan') NOT NULL DEFAULT 'karyawan',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB;

-- Produk: stok global (satu gudang). Toko pada order = channel penjualan, bukan lokasi stok.
CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  barcode VARCHAR(100) DEFAULT NULL,
  hpp DECIMAL(15, 2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_products_barcode (barcode)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(120) NOT NULL,
  resi VARCHAR(120) DEFAULT NULL,
  product_name VARCHAR(255) NOT NULL,
  variasi VARCHAR(255) DEFAULT NULL,
  qty INT UNSIGNED NOT NULL DEFAULT 1,
  selling_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
  hpp_snapshot DECIMAL(15, 2) NOT NULL DEFAULT 0,
  store_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED DEFAULT NULL,
  order_date DATE NOT NULL,
  status ENUM('diproses', 'dikirim', 'selesai', 'retur') NOT NULL DEFAULT 'diproses',
  nominal_cair DECIMAL(15, 2) DEFAULT NULL,
  payout_at DATETIME DEFAULT NULL,
  attachment_path VARCHAR(500) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL,
  KEY idx_orders_store (store_id),
  KEY idx_orders_date (order_date),
  KEY idx_orders_status (status),
  KEY idx_orders_cair (nominal_cair),
  KEY idx_orders_order_no (order_no)
) ENGINE=InnoDB;

INSERT INTO stores (name) VALUES ('SCM'), ('Sentra'), ('Rajawali')
ON DUPLICATE KEY UPDATE name = VALUES(name);
