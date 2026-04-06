import { useCallback, useEffect, useState } from 'react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { confirmAction } from '../utils/confirm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import PaginationBar from '../components/PaginationBar.jsx';
import ProductFormModal from '../components/ProductFormModal.jsx';

const LIMIT = 10;

function formatMoney(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

export default function ProductsPage() {
  const { isAdmin } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 1000);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productEditingId, setProductEditingId] = useState(null);

  const fetchProducts = useCallback(
    async (pageOverride) => {
      const p = pageOverride ?? page;
      const params = { page: p, limit: LIMIT, search };
      const { data } = await api.get('/api/products', { params });
      setRows(data.data);
      setTotal(data.total);
    },
    [page, search]
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

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
        <button type="button" className="btn btn-primary" onClick={openNewProduct}>
          <Plus size={18} strokeWidth={2} aria-hidden />
          Produk baru
        </button>
      </div>

      <div className="card mb-4">
        <div>
          <label>Cari nama / barcode </label>
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Ketik…" />
        </div>
      </div>

      <div className="card table-wrap">
        <table className="table-app">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Barcode</th>
              <th>HPP</th>
              <th>Stok</th>
              <th className="w-32">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <button
                    type="button"
                    className="text-left font-semibold text-blue-600 hover:underline"
                    onClick={() => openEditProduct(p.id)}
                  >
                    {p.name}
                  </button>
                </td>
                <td className="muted">{p.barcode || '—'}</td>
                <td>{formatMoney(p.hpp)}</td>
                <td>{p.stock}</td>
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
                    {isAdmin && (
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
    </div>
  );
}
