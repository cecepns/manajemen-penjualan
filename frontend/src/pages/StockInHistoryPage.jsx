import { useCallback, useEffect, useState } from 'react';
import { History, Search } from 'lucide-react';
import { api, toastApiError } from '../utils/api.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import PaginationBar from '../components/PaginationBar.jsx';

const LIMIT = 10;

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('id-ID');
}

export default function StockInHistoryPage() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 800);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const fetchRows = useCallback(
    async (pageOverride) => {
      const p = pageOverride ?? page;
      const { data } = await api.get('/api/stock-in-history', {
        params: { page: p, limit: LIMIT, search },
      });
      setRows(Array.isArray(data?.data) ? data.data : []);
      setTotal(Number(data?.total) || 0);
    },
    [page, search]
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    fetchRows().catch((e) => toastApiError(e));
  }, [fetchRows]);

  return (
    <div>
      <div className="page-title-row">
        <h1 className="page-title flex items-center gap-2">
          <History size={28} strokeWidth={2} className="icon-title" aria-hidden />
          History stok masuk
        </h1>
      </div>

      <div className="card mb-4">
        <label className="mb-1 block">Cari produk / barcode / catatan / user</label>
        <div className="relative">
          <Search
            size={16}
            strokeWidth={2}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="w-full !pl-10"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Ketik kata kunci…"
          />
        </div>
      </div>

      <div className="card table-wrap">
        <table className="table-app">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Produk</th>
              <th>Masuk</th>
              <th>Stok awal</th>
              <th>Stok akhir</th>
              <th>Oleh</th>
              <th>Catatan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td>{formatDateTime(h.created_at)}</td>
                <td>
                  <div className="font-medium text-slate-900">{h.product_name}</div>
                  <div className="muted text-xs">{h.product_barcode || '—'}</div>
                </td>
                <td className="tabular-nums">+{h.qty_added}</td>
                <td className="tabular-nums">{h.qty_before}</td>
                <td className="tabular-nums">{h.qty_after}</td>
                <td>{h.created_by_name || '—'}</td>
                <td>{h.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted" style={{ padding: '1rem' }}>Tidak ada data</p>}
      </div>

      <PaginationBar page={page} total={total} limit={LIMIT} onPageChange={setPage} />
    </div>
  );
}
