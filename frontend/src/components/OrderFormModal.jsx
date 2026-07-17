import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import Select from 'react-select';
import Modal from './Modal.jsx';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { toBackendUrl } from '../utils/endpoints.js';
import { selectStyles } from './selectTheme.js';
import { useAuth } from '../context/AuthContext.jsx';

const SHIPPED_PHASE = ['dikirim', 'selesai', 'retur'];

function isShippedPhase(s) {
  return SHIPPED_PHASE.includes(s);
}

function getLocalDateString() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

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
  order_date: getLocalDateString(),
  status: 'diproses',
  nominal_cair: '',
  notes: '',
};

const emptyLine = () => ({
  product_name: '',
  variasi: '',
  qty: 1,
  selling_price: '',
  hpp_snapshot: '',
  product_id: null,
});

function productToOption(p) {
  const bc = p.barcode?.trim();
  const bits = [p.name];
  if (bc) bits.push(bc);
  bits.push(`stok ${p.stock}`);
  return {
    value: p.id,
    label: bits.join(' · '),
    raw: p,
  };
}

function renderProductOptionLabel(option) {
  const photoUrl = option?.raw?.photo_url ? toBackendUrl(option.raw.photo_url) : '';
  return (
    <div className="flex items-center gap-2">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={option?.raw?.name || option.label}
          className="h-7 w-7 rounded-md border border-slate-200 bg-white object-cover"
        />
      ) : null}
      <span className="truncate">{option.label}</span>
    </div>
  );
}

export default function OrderFormModal({ open, onClose, orderId, onSaved }) {
  const isEdit = orderId != null;
  const { isOwner, isAdmin, isKaryawan, isOwnerOrAdmin } = useAuth();
  const canEditHpp = isOwnerOrAdmin;
  const [stores, setStores] = useState([]);
  const [form, setForm] = useState(emptyHeader);
  const [lines, setLines] = useState([emptyLine()]);
  const [file, setFile] = useState(null);
  const [productOptions, setProductOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  /** ID baris DB yang akan diganti saat simpan edit (satu pesanan multi-item). */
  const [groupLineIds, setGroupLineIds] = useState([]);
  /** Status saat load (untuk batasan role). */
  const [initialStatus, setInitialStatus] = useState(null);

  useEffect(() => {
    if (!open) return;
    api.get('/api/stores/all').then(({ data }) => setStores(data)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setProductOptions([]);
    if (!isEdit) {
      setForm({ ...emptyHeader });
      setLines([emptyLine()]);
      setGroupLineIds([]);
      setInitialStatus(null);
      return;
    }
    setLoading(true);
    api
      .get(`/api/orders/${orderId}`)
      .then(({ data: bundle }) => {
        const ids = Array.isArray(bundle.group_line_ids) ? bundle.group_line_ids : [];
        setGroupLineIds(ids);
        setForm({
          order_no: bundle.order_no,
          resi: bundle.resi || '',
          store_id: bundle.store_id,
          order_date: bundle.order_date?.slice?.(0, 10) || bundle.order_date,
          status: bundle.status,
          nominal_cair:
            bundle.nominal_cair != null && bundle.nominal_cair !== ''
              ? String(bundle.nominal_cair)
              : '',
          notes: bundle.notes || '',
        });
        setInitialStatus(bundle.status || null);
        const items = Array.isArray(bundle.items) ? bundle.items : [];
        setLines(
          items.length
            ? items.map((it) => ({
                product_name: it.product_name,
                variasi: it.variasi || '',
                qty: it.qty,
                selling_price:
                  it.selling_price != null ? String(it.selling_price) : '',
                hpp_snapshot:
                  it.hpp_snapshot != null ? String(it.hpp_snapshot) : '',
                product_id: it.product_id,
              }))
            : [emptyLine()]
        );
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

  const fullFormLock = isEdit && isKaryawan && initialStatus && isShippedPhase(initialStatus);
  const lineLock = isEdit && isAdmin;
  const headerLock =
    fullFormLock ||
    (isEdit && isAdmin && initialStatus && isShippedPhase(initialStatus));

  const statusSelectOptions = useMemo(() => {
    if (isOwner) return statusOptions;
    if (!isEdit) {
      if (isAdmin)
        return statusOptions.filter((o) => ['diproses', 'dikirim'].includes(o.value));
      return statusOptions;
    }
    if (isKaryawan && initialStatus && isShippedPhase(initialStatus)) return [];
    if (isAdmin && initialStatus === 'diproses')
      return statusOptions.filter((o) => ['diproses', 'dikirim'].includes(o.value));
    if (isAdmin && initialStatus === 'dikirim')
      return statusOptions.filter((o) => ['dikirim', 'selesai', 'retur'].includes(o.value));
    if (isAdmin && (initialStatus === 'selesai' || initialStatus === 'retur'))
      return statusOptions.filter((o) => ['selesai', 'retur'].includes(o.value));
    return statusOptions;
  }, [isOwner, isAdmin, isKaryawan, isEdit, initialStatus]);

  const showNominalField =
    !isKaryawan &&
    (isOwner ||
      (isAdmin &&
        (isShippedPhase(form.status) || (!!initialStatus && isShippedPhase(initialStatus)))));

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
    if (fullFormLock) return;
    if (!form.store_id) {
      const { toast } = await import('sonner');
      toast.error('Pilih toko');
      return;
    }

    try {
      if (isEdit) {
        if (!groupLineIds.length) {
          const { toast } = await import('sonner');
          toast.error('Data pesanan tidak valid. Tutup dan buka lagi dari daftar.');
          return;
        }
        const items = lines.map((l) => {
          const row = {
            product_name: l.product_name.trim(),
            variasi: l.variasi?.trim() || null,
            qty: Number(l.qty) || 1,
            selling_price: Number(l.selling_price) || 0,
            product_id: l.product_id || null,
          };
          if (canEditHpp && !row.product_id)
            row.hpp_snapshot = Number(l.hpp_snapshot) || 0;
          return row;
        });
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
        const payload = {
          line_ids: groupLineIds,
          order_no: form.order_no,
          resi: form.resi || null,
          store_id: form.store_id,
          order_date: form.order_date,
          status: form.status,
          nominal_cair:
            form.nominal_cair === '' || form.nominal_cair == null
              ? null
              : Number(form.nominal_cair),
          notes: form.notes || null,
          items,
        };
        await apiCall(api.put('/api/orders/group', payload), {
          success: 'Pesanan diperbarui',
          loading: 'Menyimpan…',
        });
      } else {
        const items = lines.map((l) => {
          const row = {
            product_name: l.product_name.trim(),
            variasi: l.variasi?.trim() || null,
            qty: Number(l.qty) || 1,
            selling_price: Number(l.selling_price) || 0,
            product_id: l.product_id || null,
          };
          if (canEditHpp && !row.product_id)
            row.hpp_snapshot = Number(l.hpp_snapshot) || 0;
          return row;
        });
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
          nominal_cair:
            form.nominal_cair === '' || form.nominal_cair == null
              ? null
              : Number(form.nominal_cair),
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
          {fullFormLock ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Pesanan sudah dalam tahap pengiriman/selesai — akun karyawan tidak dapat mengubah data ini.
            </p>
          ) : null}
          <div className="form-row cols-2">
            <div>
              <label>No pesanan *</label>
              <input
                value={form.order_no}
                onChange={(e) => setField('order_no', e.target.value)}
                required
                disabled={headerLock}
              />
            </div>
            <div>
              <label>
                No resi
                <span className="ml-1 font-normal text-slate-500">(satu resi untuk seluruh barang)</span>
              </label>
              <input
                value={form.resi}
                onChange={(e) => setField('resi', e.target.value)}
                placeholder="Opsional — sama untuk semua produk di bawah"
                disabled={headerLock}
              />
            </div>
            <div>
              <label>Toko (channel penjualan) *</label>
              <Select
                options={storeOptions}
                value={storeOptions.find((o) => o.value === form.store_id) || null}
                onChange={(o) => {
                  const sid = o?.value ?? null;
                  setField('store_id', sid);
                  if (!isEdit) setLines([emptyLine()]);
                  setProductOptions([]);
                  void loadProductsBySearch('');
                }}
                placeholder="Pilih toko"
                styles={selectStyles()}
                isDisabled={headerLock}
              />
            </div>
            <div>
              <label>Tanggal *</label>
              <input
                type="date"
                value={form.order_date}
                onChange={(e) => setField('order_date', e.target.value)}
                required
                disabled={headerLock}
              />
            </div>
            {showNominalField ? (
              <div>
                <label>Nominal cair (1 pesanan / 1 resi)</label>
                <input
                  type="number"
                  min={0}
                  value={form.nominal_cair}
                  onChange={(e) => setField('nominal_cair', e.target.value)}
                  placeholder="Kosong = belum cair"
                  disabled={!isOwner && !isAdmin}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {isEdit ? 'Item dalam pesanan ini' : 'Produk dalam pesanan'}
                  </h3>
                  <p className="muted mt-0.5 text-xs">
                    {isEdit
                      ? 'Semua baris di bawah disimpan bersama satu nomor pesanan dan resi. Mengubah resi hanya memperbarui pesanan ini, tanpa membuat data baru.'
                      : 'Satu nomor pesanan dan satu no. resi = satu kiriman. Tambahkan beberapa baris untuk banyak jenis barang dalam kiriman yang sama — bukan satu resi per produk.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  onClick={addProductLine}
                  disabled={lineLock || fullFormLock}
                >
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
                          disabled={lineLock || fullFormLock}
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
                            placeholder="Ketik nama atau barcode…"
                            options={productOptions}
                            formatOptionLabel={renderProductOptionLabel}
                            onInputChange={handleProductInputChange}
                            onMenuOpen={() => {
                              void loadProductsBySearch('');
                            }}
                            menuPortalTarget={
                              typeof document !== 'undefined' ? document.body : null
                            }
                            menuPosition="fixed"
                            filterOption={() => true}
                            isDisabled={lineLock || fullFormLock}
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
                                hpp_snapshot:
                                  raw?.hpp != null ? String(raw.hpp) : line.hpp_snapshot,
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
                          disabled={lineLock || fullFormLock}
                        />
                      </div>
                      <div>
                        <label>Variasi</label>
                        <input
                          value={line.variasi}
                          onChange={(e) => setLine(idx, { variasi: e.target.value })}
                          disabled={lineLock || fullFormLock}
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
                          disabled={lineLock || fullFormLock}
                        />
                      </div>
                      <div>
                        <label>Harga jual</label>
                        <input
                          type="number"
                          min={0}
                          value={line.selling_price}
                          onChange={(e) => setLine(idx, { selling_price: e.target.value })}
                          disabled={lineLock || fullFormLock}
                        />
                      </div>
                      <div>
                        <label>HPP (modal per unit)</label>
                        <input
                          type="number"
                          min={0}
                          value={line.hpp_snapshot}
                          onChange={(e) => setLine(idx, { hpp_snapshot: e.target.value })}
                          disabled={
                            lineLock ||
                            fullFormLock ||
                            !canEditHpp ||
                            !!line.product_id
                          }
                          readOnly={!canEditHpp || !!line.product_id}
                        />
                        {!canEditHpp && (
                          <p className="muted mt-1 text-xs">
                            HPP hanya dapat diubah oleh admin atau owner.
                          </p>
                        )}
                        {canEditHpp && line.product_id && (
                          <p className="muted mt-1 text-xs">
                            Mengikuti HPP produk terhubung.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          <div className="form-row cols-2 mt-4">
            <div>
              <label>Status order</label>
              {statusSelectOptions.length ? (
                <Select
                  options={statusSelectOptions}
                  value={statusSelectOptions.find((o) => o.value === form.status)}
                  onChange={(o) => setField('status', o?.value || 'diproses')}
                  styles={selectStyles()}
                  isDisabled={fullFormLock}
                />
              ) : (
                <p className="muted mt-1 text-sm">Status tidak dapat diubah untuk akun ini.</p>
              )}
            </div>
            {!isEdit ? (
              <div>
                <label>Lampiran (opsional, terpasang ke baris pertama)</label>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
            ) : (
              <div className="muted text-sm leading-snug">
                Lampiran hanya bisa ditambahkan saat buat order baru.
              </div>
            )}
          </div>

          <div className="mt-4">
            <label>Catatan</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              disabled={headerLock}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button type="submit" className="btn btn-primary" disabled={fullFormLock}>
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
