-- Migration: 004_stock_audit_history
-- Histori koreksi stok (bisa + atau −), terpisah dari stok masuk.

CREATE TABLE IF NOT EXISTS stock_audit_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  qty_before INT NOT NULL DEFAULT 0,
  qty_after INT NOT NULL DEFAULT 0,
  qty_delta INT NOT NULL,
  session_notes VARCHAR(500) DEFAULT NULL,
  audit_date DATE NOT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_audit_history_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_audit_history_user
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  KEY idx_stock_audit_history_product (product_id),
  KEY idx_stock_audit_history_audit_date (audit_date),
  KEY idx_stock_audit_history_created_at (created_at)
) ENGINE=InnoDB;
