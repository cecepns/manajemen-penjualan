import { useCallback, useEffect, useState } from 'react';
import { FileDown, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import Select from 'react-select';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { confirmAction } from '../utils/confirm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import OrderFormModal from '../components/OrderFormModal.jsx';
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

export default function OrdersPage() {
  const { isAdmin } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 1000);
  const [page, setPage] = useState(1);
  const [storeId, setStoreId] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [payout, setPayout] = useState('');
  const [status, setStatus] = useState('');
  const [stores, setStores] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderEditingId, setOrderEditingId] = useState(null);

  const fetchOrders = useCallback(
    async (pageOverride) => {
      const p = pageOverride ?? page;
      const params = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT),
        search,
      });
      if (storeId) params.set('store_id', storeId);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
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

  async function handleExport() {
    const params = new URLSearchParams({ search });
    if (storeId) params.set('store_id', storeId);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
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
      message: 'Hapus order ini? Stok akan dikembalikan jika terhubung produk.',
      confirmLabel: 'Hapus',
    });
    if (!ok) return;
    try {
      await apiCall(api.delete(`/api/orders/${id}`), {
        success: 'Order dihapus',
        loading: 'Menghapus…',
      });
      setRows((r) => r.filter((x) => x.id !== id));
      setTotal((t) => Math.max(0, t - 1));
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
        <button type="button" className="btn btn-ghost" onClick={handleExport}>
          <FileDown size={18} strokeWidth={2} aria-hidden />
          Export Excel
        </button>
      </div>

      <div className="card mb-4">
        <div className="form-row">
          <div>
            <label>Cari (no pesanan, produk, resi) </label>
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
                <label>Dari</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label>Sampai</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card table-wrap">
        <table className="table-app">
          <thead>
            <tr>
              <th>No</th>
              <th>Produk</th>
              <th>Qty</th>
              <th>Toko</th>
              <th>Tgl</th>
              <th>Status order</th>
              <th className="min-w-[9rem] whitespace-normal leading-tight">
                Pencairan
                <span className="mt-0.5 block text-xs font-normal text-slate-400">Status · nominal cair</span>
              </th>
              <th className="whitespace-normal leading-tight">
                Total modal
                <span className="mt-0.5 block text-xs font-normal text-slate-400">qty × HPP</span>
              </th>
              <th className="whitespace-normal leading-tight">
                Laba
                <span className="mt-0.5 block text-xs font-normal text-slate-400">cair − modal</span>
              </th>
              <th className="w-36">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>
                  <button
                    type="button"
                    className="text-left font-semibold text-blue-600 hover:underline"
                    onClick={() => openEditOrder(o.id)}
                  >
                    {o.order_no}
                  </button>
                  <div className="muted text-xs">{o.resi || '—'}</div>
                </td>
                <td>{o.product_name}</td>
                <td>{o.qty}</td>
                <td>{o.store_name}</td>
                <td>{o.order_date}</td>
                <td>
                  <OrderStatusBadge status={o.status} />
                </td>
                <td>
                  <span className="font-medium text-slate-700" style={{ fontSize: '0.75rem' }}>
                    {o.payout_status_label ?? '—'}
                  </span>
                  <div className="tabular-nums">{formatMoney(o.nominal_cair)}</div>
                </td>
                <td className="tabular-nums text-slate-700">
                  {formatMoney(Number(o.qty) * Number(o.hpp_snapshot ?? 0))}
                </td>
                <td className="tabular-nums font-medium text-slate-900">{formatMoney(o.laba)}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="btn btn-ghost min-h-9 px-2.5 text-xs"
                      onClick={() => openEditOrder(o.id)}
                    >
                      <Pencil size={14} strokeWidth={2} aria-hidden />
                      Edit
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-danger min-h-9 px-2.5 text-xs"
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
    </div>
  );
}
