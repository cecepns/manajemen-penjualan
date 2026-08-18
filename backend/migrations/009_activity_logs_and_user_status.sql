-- Migrasi 009: Activity Logs dan Pelacakan Status Online User
-- Tabel activity_logs mencatat format WHO -> WHAT -> WHEN -> BEFORE -> AFTER -> REFERENCE

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

-- Tambah kolom status online ke tabel users jika belum ada
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at DATETIME DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at DATETIME DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_logout_at DATETIME DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_start_at DATETIME DEFAULT NULL;
