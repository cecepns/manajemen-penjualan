import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import Modal from './Modal.jsx';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { toBackendUrl } from '../utils/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import ImagePreviewModal from './ImagePreviewModal.jsx';

const empty = {
  name: '',
  barcode: '',
  hpp: '',
  stock: 0,
};

export default function ProductFormModal({ open, onClose, productId, onSaved }) {
  const { isOwnerOrAdmin, canSeeHpp } = useAuth();
  const isEdit = productId != null;
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const photoPreviewUrl = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : ''),
    [photoFile]
  );

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);
  useEffect(() => {
    if (!open) return;
    setPhotoFile(null);
    setRemovePhoto(false);
    if (!isEdit) {
      setForm(empty);
      setPhotoUrl('');
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
        setPhotoUrl(p.photo_url || '');
      })
      .catch(() => {
        toastApiError(new Error('Produk tidak ada'));
        onClose();
      })
      .finally(() => setLoading(false));
  }, [open, productId, isEdit, onClose]);

  async function onSubmit(e) {
    e.preventDefault();
    const payload = new FormData();
    payload.append('name', form.name.trim());
    payload.append('barcode', form.barcode.trim());
    payload.append('hpp', String(Number(form.hpp) || 0));
    payload.append('stock', String(Number(form.stock) || 0));
    if (photoFile) payload.append('photo', photoFile);
    if (removePhoto) payload.append('remove_photo', '1');
    try {
      if (isEdit) {
        await apiCall(api.put(`/api/products/${productId}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } }), {
          success: 'Produk diperbarui',
          loading: 'Menyimpan…',
        });
      } else {
        await apiCall(api.post('/api/products', payload, { headers: { 'Content-Type': 'multipart/form-data' } }), {
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
              <label>Foto produk</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setPhotoFile(f);
                  if (f) setRemovePhoto(false);
                }}
              />
              {(photoFile || photoUrl) && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {photoFile ? (
                      <button type="button" className="block h-full w-full" onClick={() => setPreviewOpen(true)}>
                        <img
                          src={photoPreviewUrl}
                          alt="Preview foto baru"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <button type="button" className="block h-full w-full" onClick={() => setPreviewOpen(true)}>
                        <img src={toBackendUrl(photoUrl)} alt={form.name || 'Foto produk'} className="h-full w-full object-cover" />
                      </button>
                    )}
                  </div>
                  {isEdit && photoUrl && (
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={removePhoto}
                        onChange={(e) => setRemovePhoto(e.target.checked)}
                        disabled={!!photoFile}
                      />
                      Hapus foto saat simpan
                    </label>
                  )}
                </div>
              )}
            </div>
            {canSeeHpp && (
              <div>
                <label>HPP (modal per unit) *</label>
                <input
                  type="number"
                  min={0}
                  value={form.hpp}
                  onChange={(e) => setForm((f) => ({ ...f, hpp: e.target.value }))}
                  required
                  disabled={isEdit && !isOwnerOrAdmin}
                  readOnly={isEdit && !isOwnerOrAdmin}
                />
                {isEdit && !isOwnerOrAdmin && (
                  <p className="muted mt-1 text-xs">HPP hanya dapat diubah oleh admin atau owner.</p>
                )}
              </div>
            )}
            <div>
              <label>Stok awal / koreksi</label>
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                disabled={isEdit}
              />
              {isEdit && (
                <p className="muted mt-1 text-xs">
                  Tambah stok masuk lewat menu <strong className="font-medium text-slate-600">Tambah stok masuk</strong> di sidebar.
                </p>
              )}
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
      <ImagePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        src={photoFile ? photoPreviewUrl : toBackendUrl(photoUrl)}
        title={form.name || 'Preview gambar'}
      />
    </Modal>
  );
}
