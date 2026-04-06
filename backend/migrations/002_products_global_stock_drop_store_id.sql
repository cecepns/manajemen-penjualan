-- Migration: 002_products_global_stock_drop_store_id
-- Stok produk satu gudang bersama; toko di order = channel penjualan saja, tidak mengikat lokasi stok.
--
-- Jika DROP FOREIGN KEY gagal (nama beda), cek:
--   SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND CONSTRAINT_TYPE = 'FOREIGN KEY';

ALTER TABLE products DROP FOREIGN KEY fk_products_store;

ALTER TABLE products DROP INDEX idx_products_store;

ALTER TABLE products DROP INDEX idx_products_barcode;

ALTER TABLE products ADD INDEX idx_products_barcode (barcode);

ALTER TABLE products DROP COLUMN store_id;
