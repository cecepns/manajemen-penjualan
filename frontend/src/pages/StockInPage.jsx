import { useState } from 'react';
import AsyncSelect from 'react-select/async';
import { PackagePlus, Save } from 'lucide-react';
import { api, apiCall } from '../utils/api.js';
import { selectStyles } from '../components/selectTheme.js';

const SEARCH_LIMIT = 20;

async function loadProductOptions(inputValue) {
  try {
    const { data } = await api.get('/api/products', {
      params: { page: 1, limit: SEARCH_LIMIT, search: inputValue || '' },
    });
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((p) => ({
      value: p.id,
      label: [p.name, p.barcode?.trim() || '—', `stok ${p.stock}`].join(' · '),
      product: p,
    }));
  } catch {
    return [];
  }
}

export default function StockInPage() {
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const id = selected?.value;
    const n = Number(qty);
    if (!id) {
      const { toast } = await import('sonner');
      toast.error('Pilih produk');
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      const { toast } = await import('sonner');
      toast.error('Jumlah stok masuk harus lebih dari 0');
      return;
    }
    setSaving(true);
    try {
      await apiCall(api.post(`/api/products/${id}/stock-in`, { qty: n, notes: notes.trim() || null }), {
        success: 'Stok masuk tersimpan',
        loading: 'Menyimpan…',
      });
      setSelected(null);
      setQty('');
      setNotes('');
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-title-row">
        <h1 className="page-title flex items-center gap-2">
          <PackagePlus size={28} strokeWidth={2} className="icon-title" aria-hidden />
          Tambah stok masuk
        </h1>
      </div>

      <div className="card max-w-2xl">
        <form onSubmit={onSubmit} className="form-row space-y-3">
          <div>
            <label>Pilih produk</label>
            <AsyncSelect
              cacheOptions
              defaultOptions
              isClearable
              placeholder="Cari nama atau barcode…"
              styles={selectStyles()}
              value={selected}
              onChange={setSelected}
              loadOptions={(input) => loadProductOptions(input)}
              noOptionsMessage={({ inputValue }) =>
                inputValue ? 'Tidak ada hasil' : 'Ketik untuk mencari (maks. 20 produk)'
              }
              loadingMessage={() => 'Memuat…'}
            />
            <p className="muted mt-1 text-xs">Pencarian memakai API yang sama dengan daftar produk; hasil dibatasi {SEARCH_LIMIT} item.</p>
          </div>
          <div>
            <label>Jumlah masuk *</label>
            <input
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Contoh: 10"
              required
            />
          </div>
          <div>
            <label>Catatan</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsional"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={18} strokeWidth={2} aria-hidden />
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
