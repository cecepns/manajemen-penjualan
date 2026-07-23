-- Migration: Add incomes table and update expense categories
ALTER TABLE expenses MODIFY COLUMN category ENUM('operasional', 'iklan', 'lainnya', 'belanja_supplier', 'refund_manual') NOT NULL DEFAULT 'operasional';

CREATE TABLE IF NOT EXISTS incomes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category ENUM('hasil_penjualan', 'penambahan_modal') NOT NULL,
  source VARCHAR(120) DEFAULT NULL, -- 'manual_order', 'scm', 'sentra', etc.
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  income_date DATE NOT NULL,
  notes TEXT DEFAULT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_incomes_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  KEY idx_incomes_category (category),
  KEY idx_incomes_date (income_date)
) ENGINE=InnoDB;
