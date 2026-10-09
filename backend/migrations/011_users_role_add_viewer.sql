-- Tambah role viewer ke ENUM users.role
ALTER TABLE users
  MODIFY COLUMN role ENUM('owner', 'admin', 'karyawan', 'checker_pengiriman', 'viewer')
  NOT NULL DEFAULT 'karyawan';
