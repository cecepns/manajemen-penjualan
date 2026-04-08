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

function formatDateOnly(value) {
  if (!value) return '—';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, day] = s.split('-');
    return `${day}/${m}/${y}`;
  }
  return formatDateTime(value);
}

const tabs = [
  { id: 'in', label: 'Stok masuk' },
  { id: 'audit', label: 'Audit stok' },
];

export default function StockInHistoryPage() {
  const [tab, setTab] = useState('in');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 800);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const fetchRows = useCallback(
    async (pageOverride) => {
      const p = pageOverride ?? page;
      const path = tab === 'in' ? '/api/stock-in-history' : '/api/stock-audit-history';
      const { data } = await api.get(path, {
        params: { page: p, limit: LIMIT, search },
      });
      setRows(Array.isArray(data?.data) ? data.data : []);
      setTotal(Number(data?.total) || 0);
    },
    [page, search, tab]
  );

  useEffect(() => {
    setPage(1);
  }, [search, tab]);

  useEffect(() => {
    fetchRows().catch((e) => toastApiError(e));
  }, [fetchRows]);

  return (
    <div>
      <div className="page-title-row">
        <h1 className="page-title flex items-center gap-2">
          <History size={28} strokeWidth={2} className="icon-title" aria-hidden />
          History stok
        </h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100/80 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={[
              'rounded-md px-3.5 py-2 text-sm font-semibold transition',
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card mb-4">
        <label className="mb-1 block">
          {tab === 'in' ? 'Cari produk / barcode / catatan / user' : 'Cari produk / barcode / catatan audit / user'}
        </label>
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

      {tab === 'in' && (
        <div className="card table-wrap">
          <table className="table-app">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Produk</th>
                <th>Jenis</th>
                <th>Masuk</th>
                <th>Stok awal</th>
                <th>Stok akhir</th>
                <th>Oleh</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={`in-${h.id}`}>
                  <td>{formatDateTime(h.created_at)}</td>
                  <td>
                    <div className="font-medium text-slate-900">{h.product_name}</div>
                    <div className="muted text-xs">{h.product_barcode || '—'}</div>
                  </td>
                  <td>
                    <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Stok masuk
                    </span>
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
      )}

      {tab === 'audit' && (
        <div className="card table-wrap">
          <table className="table-app">
            <thead>
              <tr>
                <th>Waktu simpan</th>
                <th>Tanggal audit</th>
                <th>Produk</th>
                <th>Jenis</th>
                <th>Awal</th>
                <th>Akhir</th>
                <th>Selisih</th>
                <th>Oleh</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={`audit-${h.id}`}>
                  <td>{formatDateTime(h.created_at)}</td>
                  <td>{formatDateOnly(h.audit_date)}</td>
                  <td>
                    <div className="font-medium text-slate-900">{h.product_name}</div>
                    <div className="muted text-xs">{h.product_barcode || '—'}</div>
                  </td>
                  <td>
                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Audit
                    </span>
                  </td>
                  <td className="tabular-nums">{h.qty_before}</td>
                  <td className="tabular-nums">{h.qty_after}</td>
                  <td
                    className={`tabular-nums font-medium ${Number(h.qty_delta) > 0 ? 'text-emerald-600' : Number(h.qty_delta) < 0 ? 'text-red-600' : ''}`}
                  >
                    {Number(h.qty_delta) > 0 ? `+${h.qty_delta}` : h.qty_delta}
                  </td>
                  <td>{h.created_by_name || '—'}</td>
                  <td>{h.session_notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="muted" style={{ padding: '1rem' }}>Tidak ada data</p>}
        </div>
      )}

      <PaginationBar page={page} total={total} limit={LIMIT} onPageChange={setPage} />
    </div>
  );
}
