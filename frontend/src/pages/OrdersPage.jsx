import { useCallback, useEffect, useState } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale/id';
import { Eye, FileDown, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import Select from 'react-select';

registerLocale('id', localeId);
import { api, apiCall, toastApiError } from '../utils/api.js';
import { confirmAction } from '../utils/confirm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import OrderFormModal from '../components/OrderFormModal.jsx';
import Modal from '../components/Modal.jsx';
import PaginationBar from '../components/PaginationBar.jsx';
import OrderStatusBadge from '../components/OrderStatusBadge.jsx';
import { selectStyles } from '../components/selectTheme.js';

const LIMIT = 10;

const payoutOptions = [
  { value: '', label: 'Semua pencairan' },
  { value: 'belum', label: 'Belum cair' },
  { value: 'sudah', label: 'Sudah cair' },
];

const statusOptions = [
  { value: '', label: 'Semua status' },
  { value: 'diproses', label: 'Diproses' },
  { value: 'dikirim', label: 'Dikirim' },
  { value: 'selesai', label: 'Selesai' },
  { value: 'retur', label: 'Retur' },
];

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function formatDate(value) {
  if (!value) return '—';
  // Jika backend kirim 'YYYY-MM-DD', tampilkan apa adanya (lebih aman, tidak kena timezone)
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return value;
  }
  // Jika ISO / format lain, fallback ke tanggal lokal Indonesia (tanpa jam)
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('id-ID');
}

/** Nominal cair di list grup: jika semua baris belum ada nominal, tampilkan — */
function formatGroupNominalCair(o) {
  if (o.payout_status_label === 'Belum Cair') return '—';
  return formatMoney(o.nominal_cair_sum);
}

export default function OrdersPage() {
  const { isAdmin } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 1000);
  const [page, setPage] = useState(1);
  const [storeId, setStoreId] = useState(null);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [payout, setPayout] = useState('');
  const [status, setStatus] = useState('');
  const [stores, setStores] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderEditingId, setOrderEditingId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  /** ID baris representatif (sama yang dipakai GET /api/orders/:id) untuk buka form edit dari modal. */
  const [detailListRowId, setDetailListRowId] = useState(null);

  const fetchOrders = useCallback(
    async (pageOverride) => {
      const p = pageOverride ?? page;
      const params = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT),
        search,
      });
      if (storeId) params.set('store_id', storeId);
      if (dateFrom) params.set('date_from', format(dateFrom, 'yyyy-MM-dd'));
      if (dateTo) params.set('date_to', format(dateTo, 'yyyy-MM-dd'));
      if (payout) params.set('payout', payout);
      if (status) params.set('status', status);
      const { data } = await api.get(`/api/orders?${params}`);
      setRows(data.data);
      setTotal(data.total);
    },
    [page, search, storeId, dateFrom, dateTo, payout, status]
  );

  useEffect(() => {
    api.get('/api/stores/all').then(({ data }) => setStores(data)).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, storeId, dateFrom, dateTo, payout, status]);

  useEffect(() => {
    fetchOrders().catch((e) => toastApiError(e));
  }, [fetchOrders]);

  function openNewOrder() {
    setOrderEditingId(null);
    setOrderModalOpen(true);
  }

  function openEditOrder(id) {
    setOrderEditingId(id);
    setOrderModalOpen(true);
  }

  function closeOrderModal() {
    setOrderModalOpen(false);
    setOrderEditingId(null);
  }

  function closeDetailModal() {
    setDetailOpen(false);
    setDetailData(null);
    setDetailListRowId(null);
  }

  async function openOrderDetail(id) {
    setDetailListRowId(id);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const { data } = await api.get(`/api/orders/${id}`);
      setDetailData(data);
    } catch (e) {
      toastApiError(e);
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleExport() {
    const params = new URLSearchParams({ search });
    if (storeId) params.set('store_id', storeId);
    if (dateFrom) params.set('date_from', format(dateFrom, 'yyyy-MM-dd'));
    if (dateTo) params.set('date_to', format(dateTo, 'yyyy-MM-dd'));
    if (payout) params.set('payout', payout);
    try {
      const { data } = await api.get(`/api/orders/export?${params}`);
      const rows = Array.isArray(data?.data) ? data.data : [];
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Orders');
      XLSX.writeFile(wb, 'orders-export.xlsx');
      const { toast } = await import('sonner');
      toast.success('Export berhasil');
    } catch (e) {
      toastApiError(e);
    }
  }

  async function handleDelete(id) {
    const ok = await confirmAction({
      message:
        'Hapus pesanan ini beserta semua item di dalamnya? Stok akan dikembalikan jika terhubung produk.',
      confirmLabel: 'Hapus',
    });
    if (!ok) return;
    try {
      await apiCall(api.delete(`/api/orders/${id}`), {
        success: 'Pesanan dihapus',
        loading: 'Menghapus…',
      });
      await fetchOrders();
    } catch {
      /* toast */
    }
  }

  const storeOptions = stores.map((s) => ({ value: s.id, label: s.name }));

  return (
    <div>
      <div className="page-title-row">
        <h1 className="page-title flex items-center gap-2">
          <ShoppingCart size={28} strokeWidth={2} className="icon-title" aria-hidden />
          Order
        </h1>
        <button type="button" className="btn btn-primary" onClick={openNewOrder}>
          <Plus size={18} strokeWidth={2} aria-hidden />
          Order baru
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleExport}>
          <FileDown size={18} strokeWidth={2} aria-hidden />
          Export Excel
        </button>
      </div>

      <div className="card mb-4">
        <div className="form-row">
          <div>
            <label>Cari (no pesanan, nama produk, barcode, resi)</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Ketik lalu tunggu…"
            />
          </div>
          <div className="form-row cols-2">
            <div>
              <label>Toko</label>
              <Select
                isClearable
                placeholder="Semua"
                options={storeOptions}
                value={storeOptions.find((o) => o.value === storeId) || null}
                onChange={(o) => setStoreId(o?.value ?? null)}
                styles={selectStyles()}
              />
            </div>
            <div>
              <label>Pencairan</label>
              <Select
                options={payoutOptions}
                value={payoutOptions.find((o) => o.value === payout)}
                onChange={(o) => setPayout(o?.value ?? '')}
                styles={selectStyles()}
              />
            </div>
            <div>
              <label>Status order</label>
              <Select
                options={statusOptions}
                value={statusOptions.find((o) => o.value === status)}
                onChange={(o) => setStatus(o?.value ?? '')}
                styles={selectStyles()}
              />
            </div>
            <div className="form-row cols-2">
              <div>
                <label htmlFor="orders-date-from">Dari</label>
                <DatePicker
                  id="orders-date-from"
                  locale="id"
                  selected={dateFrom}
                  onChange={(d) => setDateFrom(d)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="Tanggal mulai"
                  isClearable
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select"
                  maxDate={dateTo ?? undefined}
                  className="field-input w-full"
                  wrapperClassName="w-full"
                  popperClassName="datepicker-popper-z"
                  showPopperArrow={false}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="orders-date-to">Sampai</label>
                <DatePicker
                  id="orders-date-to"
                  locale="id"
                  selected={dateTo}
                  onChange={(d) => setDateTo(d)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="Tanggal akhir"
                  isClearable
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select"
                  minDate={dateFrom ?? undefined}
                  className="field-input w-full"
                  wrapperClassName="w-full"
                  popperClassName="datepicker-popper-z"
                  showPopperArrow={false}
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card table-wrap">
        <table className="table-app">
          <thead>
            <tr>
              <th>Pesanan</th>
              <th className="text-center align-middle">Qty</th>
              <th className="text-center align-middle">Toko</th>
              <th className="text-center align-middle">Tgl</th>
              <th className="text-center align-middle">Status order</th>
              <th>Pencairan</th>
              <th>Total modal</th>
              <th>Laba</th>
              <th className="min-w-[12rem]">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="align-top">
                  {o.item_count > 1 && (
                    <span className="mb-1 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-blue-800">
                      {o.item_count} item
                    </span>
                  )}
                  <div className="font-semibold text-slate-900">{o.order_no}</div>
                  <div className="muted text-xs">{o.resi || '—'}</div>
                </td>
                <td className="tabular-nums align-middle text-center">{o.qty_sum}</td>
                <td className="align-middle text-center">{o.store_name}</td>
                <td className="align-middle text-center">{formatDate(o.order_date)}</td>
                <td className="align-middle text-center">
                  <OrderStatusBadge status={o.status} />
                </td>
                <td>
                  <span className="font-medium text-slate-700" style={{ fontSize: '0.75rem' }}>
                    {o.payout_status_label ?? '—'}
                  </span>
                  <div className="tabular-nums">{formatGroupNominalCair(o)}</div>
                </td>
                <td className="tabular-nums text-slate-700">{formatMoney(o.total_modal)}</td>
                <td className="tabular-nums font-medium text-slate-900">{formatMoney(o.laba)}</td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="btn btn-secondary min-h-9 px-2.5 text-xs"
                      onClick={() => openOrderDetail(o.id)}
                    >
                      <Eye size={14} strokeWidth={2} aria-hidden />
                      Lihat detail
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary min-h-9 px-2.5 text-xs"
                      onClick={() => openEditOrder(o.id)}
                    >
                      <Pencil size={14} strokeWidth={2} aria-hidden />
                      Edit
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn min-h-9 border-0 bg-red-600 px-2.5 text-xs text-white shadow-sm hover:bg-red-700"
                        onClick={() => handleDelete(o.id)}
                      >
                        <Trash2 size={16} strokeWidth={2} aria-hidden />
                        Hapus
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted" style={{ padding: '1rem' }}>Tidak ada data</p>}
      </div>

      <PaginationBar page={page} total={total} limit={LIMIT} onPageChange={setPage} />

      <OrderFormModal
        open={orderModalOpen}
        onClose={closeOrderModal}
        orderId={orderEditingId}
        onSaved={fetchOrders}
      />

      <Modal
        open={detailOpen}
        onClose={closeDetailModal}
        title={detailData?.order_no ? `Pesanan ${detailData.order_no}` : 'Detail pesanan'}
        size="2xl"
      >
        {detailLoading && <p className="muted py-6 text-center">Memuat…</p>}
        {!detailLoading && detailData && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <span className="muted text-xs">No resi</span>
                <div className="font-medium text-slate-900">{detailData.resi || '—'}</div>
              </div>
              <div>
                <span className="muted text-xs">Toko</span>
                <div className="font-medium text-slate-900">{detailData.store_name ?? '—'}</div>
              </div>
              <div>
                <span className="muted text-xs">Tanggal</span>
                <div className="font-medium text-slate-900">{formatDate(detailData.order_date)}</div>
              </div>
              <div>
                <span className="muted text-xs">Status</span>
                <div className="mt-1">
                  <OrderStatusBadge status={detailData.status} />
                </div>
              </div>
            </div>
            {detailData.notes ? (
              <div>
                <span className="muted text-xs">Catatan</span>
                <p className="mt-0.5 whitespace-pre-wrap text-slate-800">{detailData.notes}</p>
              </div>
            ) : null}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Item
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="table-app text-sm">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th>Variasi</th>
                      <th>Qty</th>
                      <th>Harga jual</th>
                      <th>Nominal cair</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailData.items || []).map((it) => (
                      <tr key={it.id}>
                        <td className="font-medium text-slate-800">{it.product_name}</td>
                        <td>{it.variasi || '—'}</td>
                        <td className="tabular-nums">{it.qty}</td>
                        <td className="tabular-nums">{formatMoney(it.selling_price)}</td>
                        <td className="tabular-nums">
                          {it.nominal_cair != null ? formatMoney(it.nominal_cair) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" className="btn btn-secondary px-4" onClick={closeDetailModal}>
                Tutup
              </button>
              <button
                type="button"
                className="btn btn-primary px-4"
                onClick={() => {
                  if (detailListRowId != null) {
                    closeDetailModal();
                    openEditOrder(detailListRowId);
                  }
                }}
              >
                <Pencil size={16} strokeWidth={2} aria-hidden />
                Edit pesanan
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
