import { useCallback, useEffect, useState } from 'react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { confirmAction } from '../utils/confirm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import PaginationBar from '../components/PaginationBar.jsx';
import ProductFormModal from '../components/ProductFormModal.jsx';
import ProductHistoryModal from '../components/ProductHistoryModal.jsx';
import ImagePreviewModal from '../components/ImagePreviewModal.jsx';
import { toBackendUrl } from '../utils/endpoints.js';

const LIMIT = 10;
/** Stok di atas 0 dan di bawah ambang ini ditandai kuning (hampir habis). */
const LOW_STOCK_MAX = 5;

function formatMoney(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

function stockCellClass(stock) {
  const s = Number(stock) || 0;
  if (s <= 0)
    return 'inline-flex min-w-[2.25rem] justify-center rounded-md bg-red-100 px-2 py-0.5 font-semibold tabular-nums text-red-800';
  if (s <= LOW_STOCK_MAX)
    return 'inline-flex min-w-[2.25rem] justify-center rounded-md bg-amber-100 px-2 py-0.5 font-semibold tabular-nums text-amber-900';
  return 'tabular-nums font-medium text-slate-900';
}

export default function ProductsPage() {
  const { isOwnerOrAdmin, canSeeHpp, isViewer } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 1000);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productEditingId, setProductEditingId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyProductId, setHistoryProductId] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [previewTitle, setPreviewTitle] = useState('Preview gambar');
  /** '' = terbaru diubah; 'asc' | 'desc' = urut stok */
  const [stockSort, setStockSort] = useState('');

  const fetchProducts = useCallback(
    async (pageOverride) => {
      const p = pageOverride ?? page;
      const params = { page: p, limit: LIMIT, search };
      if (stockSort === 'asc' || stockSort === 'desc') params.sort_stock = stockSort;
      const { data } = await api.get('/api/products', { params });
      setRows(data.data);
      setTotal(data.total);
    },
    [page, search, stockSort]
  );

  useEffect(() => {
    setPage(1);
  }, [search, stockSort]);

  useEffect(() => {
    fetchProducts().catch((e) => toastApiError(e));
  }, [fetchProducts]);

  function openNewProduct() {
    setProductEditingId(null);
    setProductModalOpen(true);
  }

  function openEditProduct(id) {
    setProductEditingId(id);
    setProductModalOpen(true);
  }

  function closeProductModal() {
    setProductModalOpen(false);
    setProductEditingId(null);
  }

  function openHistory(id) {
    setHistoryProductId(id);
    setHistoryOpen(true);
  }

  function closeHistory() {
    setHistoryOpen(false);
    setHistoryProductId(null);
  }

  function openPreview(src, title) {
    setPreviewSrc(src);
    setPreviewTitle(title || 'Preview gambar');
    setPreviewOpen(true);
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreviewSrc('');
  }

  async function handleDelete(id) {
    const ok = await confirmAction({
      message: 'Hapus produk ini?',
      confirmLabel: 'Hapus',
    });
    if (!ok) return;
    try {
      await apiCall(api.delete(`/api/products/${id}`), {
        success: 'Produk dihapus',
        loading: 'Menghapus…',
      });
      setRows((r) => r.filter((x) => x.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      /* toast */
    }
  }

  return (
    <div>
      <div className="page-title-row">
        <h1 className="page-title flex items-center gap-2">
          <Package size={28} strokeWidth={2} className="icon-title" aria-hidden />
          Produk & stok
        </h1>
        {!isViewer && (
          <button type="button" className="btn btn-primary" onClick={openNewProduct}>
            <Plus size={18} strokeWidth={2} aria-hidden />
            Produk baru
          </button>
        )}
      </div>

      <div className="card mb-4">
        <div className="form-row cols-2">
          <div>
            <label>Cari nama / barcode </label>
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Ketik…" />
          </div>
          <div>
            <label>Urutkan stok</label>
            <select
              value={stockSort}
              onChange={(e) => setStockSort(e.target.value)}
              aria-label="Urutkan berdasarkan stok"
            >
              <option value="">Terbaru diubah (default)</option>
              <option value="asc">Stok terendah dulu</option>
              <option value="desc">Stok tertinggi dulu</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card table-wrap">
        <table className="table-app">
          <thead>
            <tr>
              <th>Foto</th>
              <th>Nama</th>
              <th>Barcode</th>
              {canSeeHpp && <th>HPP</th>}
              <th>Stok</th>
              {!isViewer && <th className="w-32">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.photo_url ? (
                    <button type="button" onClick={() => openPreview(toBackendUrl(p.photo_url), p.name)} className="block">
                      <img
                        src={toBackendUrl(p.photo_url)}
                        alt={p.name}
                        className="h-12 w-12 rounded-lg border border-slate-200 bg-white object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                      —
                    </div>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="text-left font-semibold text-blue-600 hover:underline"
                    onClick={() => openHistory(p.id)}
                  >
                    {p.name}
                  </button>
                </td>
                <td className="muted">{p.barcode || '—'}</td>
                {canSeeHpp && <td>{formatMoney(p.hpp)}</td>}
                <td>
                  <span className={stockCellClass(p.stock)}>{Number(p.stock) || 0}</span>
                </td>
                {!isViewer && (
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost min-h-9 px-2.5 text-xs"
                        onClick={() => openEditProduct(p.id)}
                      >
                        <Pencil size={14} strokeWidth={2} aria-hidden />
                        Edit
                      </button>
                      {isOwnerOrAdmin && (
                        <button
                          type="button"
                          className="btn btn-danger min-h-9 px-2.5 text-xs"
                          onClick={() => handleDelete(p.id)}
                        >
                          <Trash2 size={16} strokeWidth={2} aria-hidden />
                          Hapus
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted" style={{ padding: '1rem' }}>Tidak ada data</p>}
      </div>

      <PaginationBar page={page} total={total} limit={LIMIT} onPageChange={setPage} />

      <ProductFormModal
        open={productModalOpen}
        onClose={closeProductModal}
        productId={productEditingId}
        onSaved={fetchProducts}
      />

      <ProductHistoryModal open={historyOpen} onClose={closeHistory} productId={historyProductId} />
      <ImagePreviewModal open={previewOpen} onClose={closePreview} src={previewSrc} title={previewTitle} />
    </div>
  );
}
