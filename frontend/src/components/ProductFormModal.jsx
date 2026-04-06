import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import Modal from './Modal.jsx';
import { api, apiCall, toastApiError } from '../utils/api.js';

const empty = {
  name: '',
  barcode: '',
  hpp: '',
  stock: 0,
};

export default function ProductFormModal({ open, onClose, productId, onSaved }) {
  const isEdit = productId != null;
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!isEdit) {
      setForm(empty);
      return;
    }
    setLoading(true);
    api
      .get(`/api/products/${productId}`)
      .then(({ data: p }) => {
        setForm({
          name: p.name,
          barcode: p.barcode || '',
          hpp: String(p.hpp),
          stock: p.stock,
        });
      })
      .catch(() => {
        toastApiError(new Error('Produk tidak ada'));
        onClose();
      })
      .finally(() => setLoading(false));
  }, [open, productId, isEdit, onClose]);

  async function onSubmit(e) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      hpp: Number(form.hpp) || 0,
      stock: Number(form.stock) || 0,
    };
    try {
      if (isEdit) {
        await apiCall(api.put(`/api/products/${productId}`, payload), {
          success: 'Produk diperbarui',
          loading: 'Menyimpan…',
        });
      } else {
        await apiCall(api.post('/api/products', payload), {
          success: 'Produk disimpan',
          loading: 'Menyimpan…',
        });
      }
      onSaved?.();
      onClose();
    } catch {
      /* toast */
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit produk' : 'Produk baru'} size="2xl">
      {loading ? (
        <p className="muted py-8 text-center">Memuat data…</p>
      ) : (
        <form onSubmit={onSubmit}>
          {!isEdit && (
            <p className="muted mb-3 text-sm">
              Stok satu gudang bersama untuk semua channel toko di order. Toko pada order hanya menandai asal penjualan,
              bukan lokasi fisik barang.
            </p>
          )}
          <div className="form-row cols-2">
            <div>
              <label>Nama produk *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label>Barcode</label>
              <input
                value={form.barcode}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                placeholder="Untuk scan cepat"
              />
            </div>
            <div>
              <label>HPP (modal per unit) *</label>
              <input type="number" min={0} value={form.hpp} onChange={(e) => setForm((f) => ({ ...f, hpp: e.target.value }))} required />
            </div>
            <div>
              <label>Stok awal / koreksi</label>
              <input type="number" min={0} value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button type="submit" className="btn btn-primary">
              <Save size={18} strokeWidth={2} aria-hidden />
              Simpan
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Batal
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
