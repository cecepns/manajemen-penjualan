-- Migration: Add expenses table for financial management
CREATE TABLE IF NOT EXISTS expenses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category ENUM('operasional', 'iklan', 'lainnya') NOT NULL DEFAULT 'operasional',
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL,
  store_id INT UNSIGNED DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_expenses_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE SET NULL,
  CONSTRAINT fk_expenses_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  KEY idx_expenses_category (category),
  KEY idx_expenses_date (expense_date),
  KEY idx_expenses_store (store_id)
) ENGINE=InnoDB;
