import { useEffect, useRef, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import Select from 'react-select';
import Modal from './Modal.jsx';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { selectStyles } from './selectTheme.js';

/** Menu select produk di portal agar tidak terpotong overflow modal (z di atas dialog). */
const productSelectStyles = {
  ...selectStyles(),
  menuPortal: (base) => ({ ...base, zIndex: 10050 }),
};

const statusOptions = [
  { value: 'diproses', label: 'Diproses' },
  { value: 'dikirim', label: 'Dikirim' },
  { value: 'selesai', label: 'Selesai' },
  { value: 'retur', label: 'Retur' },
];

const emptyHeader = {
  order_no: '',
  resi: '',
  store_id: null,
  order_date: new Date().toISOString().slice(0, 10),
  status: 'diproses',
  notes: '',
};

const emptyLine = () => ({
  product_name: '',
  variasi: '',
  qty: 1,
  selling_price: '',
  product_id: null,
  nominal_cair: '',
});

function formatMoneyIdr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function labaPreview(qty, hppSnap, nominalStr, status) {
  const modal = Number(qty) * Number(hppSnap);
  const raw = nominalStr === '' || nominalStr == null ? null : Number(nominalStr);
  const nc = Number.isFinite(raw) ? raw : null;
  if (status === 'retur') return Math.min(0, (nc ?? 0) - modal);
  if (nc == null) return null;
  return nc - modal;
}

/** Satu baris order (edit / legacy) */
const emptySingle = {
  ...emptyHeader,
  product_name: '',
  variasi: '',
  qty: 1,
  selling_price: '',
  product_id: null,
  nominal_cair: '',
};

function productToOption(p) {
  return {
    value: p.id,
    label: `${p.name} (stok ${p.stock})`,
    raw: p,
  };
}

export default function OrderFormModal({ open, onClose, orderId, onSaved }) {
  const isEdit = orderId != null;
  const [stores, setStores] = useState([]);
  const [form, setForm] = useState(emptySingle);
  const [lines, setLines] = useState([emptyLine()]);
  const [file, setFile] = useState(null);
  const [productOptions, setProductOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  /** HPP untuk pratinjau laba di mode edit (snapshot + update saat ganti produk). */
  const [editHppSnapshot, setEditHppSnapshot] = useState(0);
  const initialHppSnapshotRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    api.get('/api/stores/all').then(({ data }) => setStores(data)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setProductOptions([]);
    if (!isEdit) {
      setForm({ ...emptySingle });
      setLines([emptyLine()]);
      setEditHppSnapshot(0);
      initialHppSnapshotRef.current = 0;
      return;
    }
    setLoading(true);
    api
      .get(`/api/orders/${orderId}`)
      .then(({ data: row }) => {
        const hpp = Number(row.hpp_snapshot) || 0;
        initialHppSnapshotRef.current = hpp;
        setEditHppSnapshot(hpp);
        setForm({
          order_no: row.order_no,
          resi: row.resi || '',
          product_name: row.product_name,
          variasi: row.variasi || '',
          qty: row.qty,
          selling_price: String(row.selling_price),
          store_id: row.store_id,
          product_id: row.product_id,
          order_date: row.order_date?.slice?.(0, 10) || row.order_date,
          status: row.status,
          nominal_cair: row.nominal_cair != null ? String(row.nominal_cair) : '',
          notes: row.notes || '',
        });
        api
          .get('/api/products', {
            params: { page: 1, limit: 100, search: '' },
          })
          .then(({ data }) => {
            setProductOptions(data.data.map(productToOption));
          })
          .catch(() => {});
      })
      .catch(() => {
        toastApiError(new Error('Order tidak ditemukan'));
        onClose();
      })
      .finally(() => setLoading(false));
  }, [open, orderId, isEdit, onClose]);

  const storeOptions = stores.map((s) => ({ value: s.id, label: s.name }));

  /** Daftar produk — stok satu gudang; toko order = channel penjualan. */
  async function loadProductsBySearch(q) {
    try {
      const { data } = await api.get('/api/products', {
        params: { page: 1, limit: 100, search: q },
      });
      setProductOptions(data.data.map(productToOption));
    } catch {
      setProductOptions([]);
    }
  }

  /** react-select: onInputChange harus mengembalikan string, bukan Promise (async loader). */
  function handleProductInputChange(newValue, actionMeta) {
    if (actionMeta.action === 'input-change') {
      void loadProductsBySearch(newValue);
    }
    return newValue;
  }

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function setLine(i, patch) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addProductLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeProductLine(i) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.store_id) {
      const { toast } = await import('sonner');
      toast.error('Pilih toko');
      return;
    }

    try {
      if (isEdit) {
        const payload = {
          order_no: form.order_no,
          resi: form.resi || null,
          product_name: form.product_name,
          variasi: form.variasi || null,
          qty: Number(form.qty) || 1,
          selling_price: Number(form.selling_price) || 0,
          store_id: form.store_id,
          product_id: form.product_id || null,
          order_date: form.order_date,
          status: form.status,
          nominal_cair: form.nominal_cair === '' ? null : Number(form.nominal_cair),
          notes: form.notes || null,
        };
        await apiCall(api.put(`/api/orders/${orderId}`, payload), {
          success: 'Order diperbarui',
          loading: 'Menyimpan…',
        });
      } else {
        const items = lines.map((l) => ({
          product_name: l.product_name.trim(),
          variasi: l.variasi?.trim() || null,
          qty: Number(l.qty) || 1,
          selling_price: Number(l.selling_price) || 0,
          product_id: l.product_id || null,
          nominal_cair:
            l.nominal_cair === '' || l.nominal_cair == null ? null : Number(l.nominal_cair),
        }));
        if (items.some((it) => !it.product_name)) {
          const { toast } = await import('sonner');
          toast.error('Setiap baris produk wajib punya nama');
          return;
        }
        if (items.some((it) => it.qty < 1)) {
          const { toast } = await import('sonner');
          toast.error('Qty tiap baris minimal 1');
          return;
        }

        const common = {
          order_no: form.order_no,
          resi: form.resi || null,
          store_id: form.store_id,
          order_date: form.order_date,
          status: form.status,
          notes: form.notes || null,
          items,
        };

        if (file) {
          const fd = new FormData();
          fd.append('items', JSON.stringify(items));
          fd.append('order_no', common.order_no);
          fd.append('store_id', String(common.store_id));
          fd.append('order_date', common.order_date);
          fd.append('status', common.status);
          if (common.resi) fd.append('resi', common.resi);
          if (common.notes) fd.append('notes', common.notes);
          fd.append('file', file);
          await apiCall(
            api.post('/api/orders', fd, {
              headers: { 'Content-Type': 'multipart/form-data' },
            }),
            {
              success: (r) =>
                r.data?.count > 1
                  ? `Order disimpan (${r.data.count} produk)`
                  : 'Order disimpan',
              loading: 'Menyimpan…',
            }
          );
        } else {
          await apiCall(api.post('/api/orders', common), {
            success: (r) =>
              r.data?.count > 1
                ? `Order disimpan (${r.data.count} produk)`
                : 'Order disimpan',
            loading: 'Menyimpan…',
          });
        }
      }
      onSaved?.();
      onClose();
    } catch {
      /* toast */
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit order' : 'Order baru'}
      size="3xl"
    >
      {loading ? (
        <p className="muted py-8 text-center">Memuat data…</p>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="form-row cols-2">
            <div>
              <label>No pesanan *</label>
              <input value={form.order_no} onChange={(e) => setField('order_no', e.target.value)} required />
            </div>
            <div>
              <label>No resi</label>
              <input value={form.resi} onChange={(e) => setField('resi', e.target.value)} />
            </div>
            <div>
              <label>Toko (channel penjualan) *</label>
              <Select
                options={storeOptions}
                value={storeOptions.find((o) => o.value === form.store_id) || null}
                onChange={(o) => {
                  const sid = o?.value ?? null;
                  setField('store_id', sid);
                  if (!isEdit) {
                    setField('product_id', null);
                    setLines([emptyLine()]);
                  } else {
                    setField('product_id', null);
                  }
                  setProductOptions([]);
                  void loadProductsBySearch('');
                }}
                placeholder="Pilih toko"
                styles={selectStyles()}
              />
            </div>
            <div>
              <label>Tanggal *</label>
              <input type="date" value={form.order_date} onChange={(e) => setField('order_date', e.target.value)} required />
            </div>
          </div>

          {!isEdit && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Produk dalam pesanan</h3>
                  <p className="muted mt-0.5 text-xs">Satu nomor pesanan bisa berisi beberapa baris produk.</p>
                </div>
                <button type="button" className="btn btn-ghost text-sm" onClick={addProductLine}>
                  <Plus size={18} strokeWidth={2} aria-hidden />
                  Tambah produk
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Baris {idx + 1}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost min-h-8 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          onClick={() => removeProductLine(idx)}
                        >
                          <Trash2 size={14} strokeWidth={2} aria-hidden />
                          Hapus
                        </button>
                      )}
                    </div>
                    <div className="form-row cols-2">
                      <div className="sm:col-span-2">
                        <label className="text-xs">Hubungkan produk (stok)</label>
                        <div className="mt-1">
                          <Select
                            isClearable
                            placeholder="Cari produk (ketik di dropdown)"
                            options={productOptions}
                            onInputChange={handleProductInputChange}
                            onMenuOpen={() => {
                              void loadProductsBySearch('');
                            }}
                            menuPortalTarget={
                              typeof document !== 'undefined' ? document.body : null
                            }
                            menuPosition="fixed"
                            value={
                              line.product_id
                                ? productOptions.find((o) => o.value === line.product_id) || {
                                    value: line.product_id,
                                    label: `ID ${line.product_id}`,
                                  }
                                : null
                            }
                            onChange={(o) => {
                              const raw = o?.raw;
                              setLine(idx, {
                                product_id: o?.value ?? null,
                                product_name: raw?.name ?? line.product_name,
                              });
                            }}
                            styles={productSelectStyles}
                          />
                        </div>
                      </div>
                      <div>
                        <label>Nama produk *</label>
                        <input
                          value={line.product_name}
                          onChange={(e) => setLine(idx, { product_name: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label>Variasi</label>
                        <input
                          value={line.variasi}
                          onChange={(e) => setLine(idx, { variasi: e.target.value })}
                        />
                      </div>
                      <div>
                        <label>Qty *</label>
                        <input
                          type="number"
                          min={1}
                          value={line.qty}
                          onChange={(e) => setLine(idx, { qty: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label>Harga jual</label>
                        <input
                          type="number"
                          min={0}
                          value={line.selling_price}
                          onChange={(e) => setLine(idx, { selling_price: e.target.value })}
                        />
                      </div>
                      <div>
                        <label>Nominal cair</label>
                        <input
                          type="number"
                          min={0}
                          value={line.nominal_cair}
                          onChange={(e) => setLine(idx, { nominal_cair: e.target.value })}
                          placeholder="Kosong = belum cair"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isEdit && (
            <>
              <div className="mt-4">
                <label>Hubungkan produk (opsional — stok otomatis)</label>
                <div className="mt-1.5">
                  <Select
                    isClearable
                    placeholder="Cari produk (ketik di dropdown)"
                    options={productOptions}
                    onInputChange={handleProductInputChange}
                    onMenuOpen={() => {
                      void loadProductsBySearch('');
                    }}
                    menuPortalTarget={
                      typeof document !== 'undefined' ? document.body : null
                    }
                    menuPosition="fixed"
                    value={
                      form.product_id
                        ? productOptions.find((o) => o.value === form.product_id) || {
                            value: form.product_id,
                            label: `ID ${form.product_id}`,
                          }
                        : null
                    }
                    onChange={(o) => {
                      setField('product_id', o?.value ?? null);
                      if (o?.raw) {
                        setField('product_name', o.raw.name);
                        setEditHppSnapshot(Number(o.raw.hpp) || 0);
                      } else if (!o) {
                        setEditHppSnapshot(initialHppSnapshotRef.current);
                      }
                    }}
                    styles={productSelectStyles}
                  />
                </div>
              </div>

              <div className="form-row cols-2 mt-4">
                <div>
                  <label>Nama produk *</label>
                  <input value={form.product_name} onChange={(e) => setField('product_name', e.target.value)} required />
                </div>
                <div>
                  <label>Variasi</label>
                  <input value={form.variasi} onChange={(e) => setField('variasi', e.target.value)} />
                </div>
                <div>
                  <label>Qty *</label>
                  <input type="number" min={1} value={form.qty} onChange={(e) => setField('qty', e.target.value)} required />
                </div>
                <div>
                  <label>Harga jual</label>
                  <input type="number" min={0} value={form.selling_price} onChange={(e) => setField('selling_price', e.target.value)} />
                </div>
                <div>
                  <label>Status</label>
                  <Select
                    options={statusOptions}
                    value={statusOptions.find((o) => o.value === form.status)}
                    onChange={(o) => setField('status', o?.value || 'diproses')}
                    styles={selectStyles()}
                  />
                </div>
                <div>
                  <label>Nominal cair (kosongkan = belum cair)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.nominal_cair}
                    onChange={(e) => setField('nominal_cair', e.target.value)}
                    placeholder="Opsional"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-sm">
                <p className="mb-2 font-semibold text-slate-800">Perhitungan (pratinjau)</p>
                <ul className="muted space-y-1 text-xs">
                  <li>
                    HPP (modal per unit, snapshot):{' '}
                    <span className="font-medium text-slate-700">{formatMoneyIdr(editHppSnapshot)}</span>
                  </li>
                  <li>
                    Total modal (qty × HPP):{' '}
                    <span className="font-medium text-slate-700">
                      {formatMoneyIdr(Number(form.qty) * Number(editHppSnapshot))}
                    </span>
                  </li>
                  <li>
                    Laba (nominal cair − total modal; retur: min 0 vs rugi):{' '}
                    <span className="font-semibold text-slate-900">
                      {formatMoneyIdr(labaPreview(form.qty, editHppSnapshot, form.nominal_cair, form.status))}
                    </span>
                  </li>
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  Isi nominal cair untuk melihat laba. Tanpa nominal, laba di daftar tetap &quot;—&quot; sampai diisi.
                </p>
              </div>
            </>
          )}

          {!isEdit && (
            <div className="form-row cols-2 mt-4">
              <div>
                <label>Status</label>
                <Select
                  options={statusOptions}
                  value={statusOptions.find((o) => o.value === form.status)}
                  onChange={(o) => setField('status', o?.value || 'diproses')}
                  styles={selectStyles()}
                />
              </div>
              <div>
                <label>Lampiran (opsional, terpasang ke baris pertama)</label>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>
          )}

          <div className="mt-4">
            <label>Catatan</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
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
