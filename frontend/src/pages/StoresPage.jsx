import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Store, Trash2 } from 'lucide-react';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { confirmAction } from '../utils/confirm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import PaginationBar from '../components/PaginationBar.jsx';
import StoreFormModal from '../components/StoreFormModal.jsx';

const LIMIT = 10;

export default function StoresPage() {
  const { isAdmin } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 1000);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState(null);

  const fetchStores = useCallback(async () => {
    const { data } = await api.get('/api/stores', { params: { page, limit: LIMIT, search } });
    setRows(data.data);
    setTotal(data.total);
  }, [page, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    fetchStores().catch((e) => toastApiError(e));
  }, [fetchStores]);

  function openCreateStore() {
    setEditingStore(null);
    setStoreModalOpen(true);
  }

  function openEditStore(s) {
    setEditingStore({ id: s.id, name: s.name });
    setStoreModalOpen(true);
  }

  function closeStoreModal() {
    setStoreModalOpen(false);
    setEditingStore(null);
  }

  async function handleDelete(id) {
    const ok = await confirmAction({ message: 'Hapus toko ini?', confirmLabel: 'Hapus' });
    if (!ok) return;
    try {
      await apiCall(api.delete(`/api/stores/${id}`), {
        success: 'Toko dihapus',
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
          <Store size={28} strokeWidth={2} className="icon-title" aria-hidden />
          Master toko
        </h1>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={openCreateStore}>
            <Plus size={18} strokeWidth={2} aria-hidden />
            Tambah toko
          </button>
        )}
      </div>

      <div className="card mb-4">
        <label>Cari </label>
        <input
          className="mt-1.5"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Nama toko"
        />
      </div>

      <div className="card table-wrap">
        <table className="table-app">
          <thead>
            <tr>
              <th>Nama</th>
              {isAdmin && <th className="w-40">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                </td>
                {isAdmin && (
                  <td className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost min-h-9 px-2.5 text-xs"
                        onClick={() => openEditStore(s)}
                      >
                        <Pencil size={16} strokeWidth={2} aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger min-h-9 px-2.5 text-xs"
                        onClick={() => handleDelete(s.id)}
                      >
                        <Trash2 size={16} strokeWidth={2} aria-hidden />
                        Hapus
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted p-4">Tidak ada data</p>}
      </div>

      <PaginationBar page={page} total={total} limit={LIMIT} onPageChange={setPage} />

      {isAdmin && (
        <StoreFormModal
          open={storeModalOpen}
          onClose={closeStoreModal}
          editingStore={editingStore}
          onSaved={fetchStores}
        />
      )}
    </div>
  );
}
