import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Code2,
  Download,
  Eye,
  Filter,
  History,
  Layers,
  ListTree,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Tag,
  User,
  X,
} from 'lucide-react';
import { api, toastApiError } from '../utils/api.js';

function formatFullDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const min = pad(d.getMinutes());
  const sec = pad(d.getSeconds());
  return `${day}/${month}/${year} ${hours}:${min}:${sec}`;
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 60) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m lalu`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}j lalu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}h lalu`;
}

const actionBadges = {
  LOGIN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LOGOUT: 'bg-slate-100 text-slate-700 border-slate-200',
  CREATE_ORDER: 'bg-blue-50 text-blue-700 border-blue-200',
  UPDATE_ORDER: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  UPDATE_ORDER_STATUS: 'bg-amber-50 text-amber-700 border-amber-200',
  UPDATE_STATUS_WD: 'bg-teal-50 text-teal-700 border-teal-200',
  DELETE_ORDER: 'bg-rose-50 text-rose-700 border-rose-200',
  CREATE_PRODUCT: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  UPDATE_PRODUCT: 'bg-sky-50 text-sky-700 border-sky-200',
  DELETE_PRODUCT: 'bg-rose-50 text-rose-700 border-rose-200',
  STOCK_IN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  STOCK_AUDIT: 'bg-purple-50 text-purple-700 border-purple-200',
  CREATE_EXPENSE: 'bg-orange-50 text-orange-700 border-orange-200',
  UPDATE_EXPENSE: 'bg-amber-50 text-amber-700 border-amber-200',
  DELETE_EXPENSE: 'bg-rose-50 text-rose-700 border-rose-200',
  CREATE_INCOME: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  UPDATE_INCOME: 'bg-teal-50 text-teal-700 border-teal-200',
  DELETE_INCOME: 'bg-rose-50 text-rose-700 border-rose-200',
  CREATE_STORE: 'bg-blue-50 text-blue-700 border-blue-200',
  UPDATE_STORE: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  DELETE_STORE: 'bg-rose-50 text-rose-700 border-rose-200',
  CREATE_USER: 'bg-violet-50 text-violet-700 border-violet-200',
  UPDATE_USER: 'bg-purple-50 text-purple-700 border-purple-200',
  DELETE_USER: 'bg-rose-50 text-rose-700 border-rose-200',
};

const entityLabels = {
  orders: 'Order',
  products: 'Produk',
  expenses: 'Pengeluaran',
  incomes: 'Pemasukan',
  stores: 'Toko',
  users: 'User',
  auth: 'Autentikasi',
};

const FIELD_LABELS = {
  order_date: 'Tgl Pesanan',
  order_no: 'No Pesanan',
  status: 'Status',
  nominal_cair: 'Nominal WD',
  product_name: 'Produk',
  variasi: 'Variasi',
  qty: 'Qty',
  selling_price: 'Harga Jual',
  resi: 'No Resi',
  notes: 'Catatan',
  items: 'Daftar Item',
  total_items: 'Total Item',
  name: 'Nama User',
  email: 'Email',
  role: 'Role',
  stock: 'Stok',
  hpp: 'HPP',
  amount: 'Nominal',
  category: 'Kategori',
  happened_at: 'Tanggal',
  description: 'Keterangan',
};

function formatFieldValue(key, val) {
  if (val == null || val === '') return '-';
  if (
    key === 'nominal_cair' ||
    key === 'selling_price' ||
    key === 'amount' ||
    key === 'hpp'
  ) {
    const n = Number(val);
    if (!isNaN(n)) return `Rp ${n.toLocaleString('id-ID')}`;
  }
  if (key === 'items' && Array.isArray(val)) {
    if (!val.length) return '-';
    return val
      .map(
        (it) =>
          `${it.product_name || 'Item'}${it.variasi ? ` (${it.variasi})` : ''} x${it.qty || 1}${
            it.selling_price
              ? ` @Rp ${Number(it.selling_price).toLocaleString('id-ID')}`
              : ''
          }`
      )
      .join('; ');
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return String(val);
}

function RenderDiffValue({ val, isChanged, isAfter, isDate }) {
  if (val == null || val === '') {
    return <span className="text-slate-400 italic text-[11px]">-</span>;
  }

  let text = String(val);
  if (typeof val === 'object') {
    text = JSON.stringify(val);
  }

  return (
    <span
      className={`font-semibold text-xs break-words inline-block ${
        isChanged
          ? isAfter
            ? 'text-emerald-800 bg-emerald-100/90 px-1.5 py-0.5 rounded font-bold'
            : 'text-rose-800 bg-rose-100/90 px-1.5 py-0.5 rounded line-through decoration-rose-500'
          : 'text-slate-700'
      }`}
    >
      {isDate && <Calendar size={11} className="inline mr-1 -mt-0.5" />}
      {text}
    </span>
  );
}

function RenderDataCard({ data, compareData, isAfter }) {
  if (data == null) {
    return <span className="text-slate-400 italic text-xs">Tidak ada data</span>;
  }
  if (typeof data !== 'object') {
    return <span className="font-medium text-slate-800 break-words text-xs">{String(data)}</span>;
  }

  const entries = Object.entries(data);
  if (!entries.length) {
    return <span className="text-slate-400 italic text-xs">-</span>;
  }

  return (
    <div className="space-y-1 text-xs">
      {entries.map(([k, v]) => {
        const compareVal = compareData ? compareData[k] : undefined;
        const isChanged =
          compareData !== null &&
          compareData !== undefined &&
          JSON.stringify(v) !== JSON.stringify(compareVal);
        const label = FIELD_LABELS[k] || k;
        const formatted = formatFieldValue(k, v);
        const isDateKey = k === 'order_date' || k === 'happened_at';

        return (
          <div key={k} className="flex items-start gap-1.5 py-0.5 border-b border-slate-100/60 last:border-0">
            <span
              className={`text-[11px] shrink-0 ${
                isChanged
                  ? isAfter
                    ? 'text-emerald-700 font-bold'
                    : 'text-rose-700 font-bold'
                  : 'text-slate-500'
              }`}
            >
              {label}:
            </span>
            <RenderDiffValue
              val={formatted}
              isChanged={isChanged}
              isAfter={isAfter}
              isDate={isDateKey}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function ActivityLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);
  const [usersList, setUsersList] = useState([]);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [modalTab, setModalTab] = useState('diff'); // 'diff' | 'json'

  // Load list user untuk opsi filter
  useEffect(() => {
    api
      .get('/api/users')
      .then((res) => setUsersList(res.data.data || []))
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const { data: res } = await api.get('/api/activity-logs', {
          params: {
            page,
            limit,
            search: search.trim(),
            entity_type: entityType,
            action,
            user_id: userId,
            start_date: startDate,
            end_date: endDate,
          },
        });
        setLogs(res.data || []);
        setTotal(res.total || 0);
      } catch (err) {
        toastApiError(err, 'Gagal memuat activity log');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, limit, search, entityType, action, userId, startDate, endDate]
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExportCsv = () => {
    if (!logs.length) return;
    const headers = [
      'ID',
      'Waktu',
      'User (WHO)',
      'Role',
      'Aksi (WHAT)',
      'Modul',
      'Referensi',
      'Deskripsi',
      'Before Data',
      'After Data',
      'IP Address',
    ];

    const rows = logs.map((l) => [
      l.id,
      formatFullDateTime(l.created_at),
      `"${l.user_name}"`,
      l.user_role,
      l.action,
      l.entity_type,
      `"${l.reference || ''}"`,
      `"${(l.description || '').replace(/"/g, '""')}"`,
      `"${(l.before_data || '').replace(/"/g, '""')}"`,
      `"${(l.after_data || '').replace(/"/g, '""')}"`,
      l.ip_address || '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Activity_Logs_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const startIdx = total === 0 ? 0 : (page - 1) * limit + 1;
  const endIdx = Math.min(page * limit, total);

  // Helper untuk modal detail perbandingan
  function getComparisonRows(log) {
    if (!log) return [];
    const beforeObj = log.before_parsed || (typeof log.before_data === 'object' ? log.before_data : null);
    const afterObj = log.after_parsed || (typeof log.after_data === 'object' ? log.after_data : null);

    if (!beforeObj && !afterObj) return [];

    const keys = new Set([
      ...Object.keys(beforeObj || {}),
      ...Object.keys(afterObj || {}),
    ]);

    return Array.from(keys).map((k) => {
      const bVal = beforeObj ? beforeObj[k] : undefined;
      const aVal = afterObj ? afterObj[k] : undefined;
      const bStr = formatFieldValue(k, bVal);
      const aStr = formatFieldValue(k, aVal);
      const isChanged = JSON.stringify(bVal) !== JSON.stringify(aVal);
      let status = 'Tetap';
      if (bVal === undefined && aVal !== undefined) status = 'Ditambahkan';
      else if (bVal !== undefined && aVal === undefined) status = 'Dihapus';
      else if (isChanged) status = 'Diubah';

      return {
        key: k,
        label: FIELD_LABELS[k] || k,
        beforeVal: bStr,
        afterVal: aStr,
        isChanged,
        status,
      };
    });
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Dashboard</span>
            <span>›</span>
            <span>Activity</span>
            <span>›</span>
            <span className="text-slate-700">Activity Log</span>
          </div>
          <div className="mt-1 flex items-center gap-2.5">
            <History size={24} className="text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Activity Log (Audit Trail)
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="btn btn-secondary btn-sm flex items-center gap-1.5 shadow-sm"
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>Segarkan</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm"
            onClick={handleExportCsv}
            disabled={!logs.length}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Info Concept Callout */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 shadow-sm text-xs text-blue-900 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Shield size={18} className="text-blue-600 shrink-0" />
          <span>
            Pencatatan Audit Trail Standar:{' '}
            <strong className="font-mono text-blue-950">
              WHO → WHAT → WHEN → BEFORE → AFTER → REFERENCE
            </strong>
          </span>
        </div>
        <span className="rounded bg-blue-100/70 px-2 py-0.5 font-medium text-blue-700">
          Khusus Akses Owner
        </span>
      </div>

      {/* Filter Toolbar Card */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search Box */}
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              className="input w-full pl-8 pr-3 text-xs"
              placeholder="Cari deskripsi / no ref…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* User Filter */}
          <div>
            <select
              className="input w-full text-xs py-1.5 px-3"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua User (WHO)</option>
              {usersList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Module Filter */}
          <div>
            <select
              className="input w-full text-xs py-1.5 px-3"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Menu / Modul</option>
              <option value="orders">Orders</option>
              <option value="products">Produk & Stok</option>
              <option value="expenses">Pengeluaran</option>
              <option value="incomes">Pemasukan</option>
              <option value="stores">Toko</option>
              <option value="users">User Management</option>
              <option value="auth">Autentikasi / Sesi</option>
            </select>
          </div>

          {/* Action Filter */}
          <div>
            <select
              className="input w-full text-xs py-1.5 px-3"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Tipe Aksi (WHAT)</option>
              <option value="LOGIN">LOGIN</option>
              <option value="LOGOUT">LOGOUT</option>
              <option value="CREATE_ORDER">CREATE ORDER</option>
              <option value="UPDATE_ORDER">UPDATE ORDER</option>
              <option value="UPDATE_STATUS_WD">UPDATE STATUS WD</option>
              <option value="UPDATE_ORDER_STATUS">UPDATE ORDER STATUS</option>
              <option value="DELETE_ORDER">DELETE ORDER</option>
              <option value="CREATE_PRODUCT">CREATE PRODUCT</option>
              <option value="UPDATE_PRODUCT">UPDATE PRODUCT</option>
              <option value="STOCK_IN">STOCK IN</option>
              <option value="STOCK_AUDIT">STOCK AUDIT</option>
              <option value="CREATE_EXPENSE">CREATE EXPENSE</option>
              <option value="UPDATE_EXPENSE">UPDATE EXPENSE</option>
              <option value="DELETE_EXPENSE">DELETE EXPENSE</option>
              <option value="CREATE_INCOME">CREATE INCOME</option>
              <option value="UPDATE_INCOME">UPDATE INCOME</option>
              <option value="UPDATE_USER">UPDATE USER</option>
            </select>
          </div>

          {/* Date Range Picker */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              className="input w-1/2 text-xs py-1.5 px-2"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              title="Dari Tanggal"
            />
            <span className="text-slate-400 text-xs">-</span>
            <input
              type="date"
              className="input w-1/2 text-xs py-1.5 px-2"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              title="Sampai Tanggal"
            />
          </div>
        </div>

        {(search || entityType || action || userId || startDate || endDate) && (
          <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
            <span>Filter aktif</span>
            <button
              type="button"
              className="text-blue-600 hover:underline font-medium"
              onClick={() => {
                setSearch('');
                setEntityType('');
                setAction('');
                setUserId('');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
            >
              Reset Semua Filter
            </button>
          </div>
        )}
      </div>

      {/* Main Table Card */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3.5">WHO</th>
                <th className="px-4 py-3.5">WHAT (Aktivitas)</th>
                <th className="px-4 py-3.5">WHEN</th>
                <th className="px-4 py-3.5 min-w-[280px]">BEFORE → AFTER</th>
                <th className="px-4 py-3.5">REFERENCE</th>
                <th className="px-4 py-3.5 text-center">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Loader2 size={24} className="mx-auto animate-spin text-blue-600 mb-2" />
                    Memuat log aktivitas…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <History size={32} className="mx-auto text-slate-300 mb-2" />
                    Tidak ada catatan aktivitas sesuai filter yang dipilih.
                  </td>
                </tr>
              ) : (
                logs.map((l) => {
                  const badgeClass =
                    actionBadges[l.action] ||
                    'bg-slate-100 text-slate-700 border-slate-200';

                  const beforeData = l.before_parsed || l.before_data;
                  const afterData = l.after_parsed || l.after_data;

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* WHO */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 font-bold text-xs">
                            {(l.user_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight">
                              {l.user_name}
                            </p>
                            <span className="text-[10px] text-slate-400 capitalize">
                              {l.user_role}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* WHAT */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-1 max-w-xs sm:max-w-md">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold border ${badgeClass}`}
                          >
                            {l.action}
                          </span>
                          <p className="text-xs font-medium text-slate-800 leading-snug">
                            {l.description}
                          </p>
                        </div>
                      </td>

                      {/* WHEN */}
                      <td className="px-4 py-3.5 align-top text-xs">
                        <div className="font-mono text-slate-700">
                          {formatFullDateTime(l.created_at)}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {formatRelativeTime(l.created_at)}
                        </span>
                      </td>

                      {/* BEFORE -> AFTER */}
                      <td className="px-4 py-3.5 align-top text-xs">
                        <div className="flex items-start gap-2 max-w-md">
                          {/* BEFORE */}
                          <div className="flex-1 rounded-lg border border-rose-100 bg-rose-50/60 p-2 text-xs">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-600 mb-1">
                              BEFORE
                            </span>
                            <RenderDataCard
                              data={beforeData}
                              compareData={afterData}
                              isAfter={false}
                            />
                          </div>

                          <ArrowRight
                            size={14}
                            className="text-slate-400 shrink-0 mt-3"
                          />

                          {/* AFTER */}
                          <div className="flex-1 rounded-lg border border-emerald-100 bg-emerald-50/60 p-2 text-xs">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
                              AFTER
                            </span>
                            <RenderDataCard
                              data={afterData}
                              compareData={beforeData}
                              isAfter={true}
                            />
                          </div>
                        </div>
                      </td>

                      {/* REFERENCE */}
                      <td className="px-4 py-3.5 align-top">
                        {l.reference ? (
                          <span className="inline-block rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-800 border border-slate-200">
                            {l.reference}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>

                      {/* DETAIL INSPECT */}
                      <td className="px-4 py-3.5 align-top text-center">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition"
                          title="Inspeksi Detail Data"
                          onClick={() => {
                            setSelectedDetail(l);
                            setModalTab('diff');
                          }}
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Baris per halaman:</span>
            <select
              className="input py-1 px-2 text-xs"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center gap-4">
            <span>
              {startIdx}-{endIdx} dari {total} log
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-sm btn-ghost px-2 disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage(1)}
              >
                &laquo;
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost px-2.5 disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                &lsaquo;
              </button>
              <span className="font-semibold text-slate-800 px-1">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost px-2.5 disabled:opacity-30"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                &rsaquo;
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost px-2 disabled:opacity-30"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                &raquo;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal Inspector */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
              <div>
                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                  Detail Audit Trail #{selectedDetail.id}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedDetail.description}
                </h3>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setSelectedDetail(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 text-sm text-slate-700 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 block">Pelaku (WHO)</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">
                    {selectedDetail.user_name}
                  </span>
                  <span className="text-[10px] text-slate-500 capitalize">
                    {selectedDetail.user_role}
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 block">Aksi (WHAT)</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">
                    {selectedDetail.action}
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 block">Waktu (WHEN)</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block font-mono">
                    {formatFullDateTime(selectedDetail.created_at)}
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 block">Referensi</span>
                  <span className="font-mono font-bold text-blue-700 mt-0.5 block truncate">
                    {selectedDetail.reference || '-'}
                  </span>
                </div>
              </div>

              {/* Inspector View Tab Switcher */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2 pt-1">
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    modalTab === 'diff'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  onClick={() => setModalTab('diff')}
                >
                  <ListTree size={14} />
                  <span>Tabel Perbandingan (Diff)</span>
                </button>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    modalTab === 'json'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  onClick={() => setModalTab('json')}
                >
                  <Code2 size={14} />
                  <span>Data Mentah (JSON)</span>
                </button>
              </div>

              {modalTab === 'diff' ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  {getComparisonRows(selectedDetail).length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Tidak ada detail perubahan data spesifik.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="px-3.5 py-2.5 w-1/4">Field / Parameter</th>
                          <th className="px-3.5 py-2.5 w-1/3 text-rose-700 bg-rose-50/50">Sebelum (BEFORE)</th>
                          <th className="px-3.5 py-2.5 w-1/3 text-emerald-700 bg-emerald-50/50">Sesudah (AFTER)</th>
                          <th className="px-3.5 py-2.5 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {getComparisonRows(selectedDetail).map((row) => (
                          <tr
                            key={row.key}
                            className={row.isChanged ? 'bg-amber-50/30' : 'hover:bg-slate-50'}
                          >
                            <td className="px-3.5 py-2.5 font-medium text-slate-800 align-top">
                              <span className="block font-semibold">{row.label}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{row.key}</span>
                            </td>
                            <td className="px-3.5 py-2.5 align-top text-slate-700">
                              <span
                                className={
                                  row.isChanged && row.beforeVal !== '-'
                                    ? 'text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded font-medium'
                                    : ''
                                }
                              >
                                {row.beforeVal}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 align-top text-slate-700">
                              <span
                                className={
                                  row.isChanged && row.afterVal !== '-'
                                    ? 'text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded font-bold'
                                    : ''
                                }
                              >
                                {row.afterVal}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-center align-top">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  row.status === 'Diubah'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : row.status === 'Ditambahkan'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : row.status === 'Dihapus'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                /* Before & After JSON / Text Inspector */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-1.5 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Data Sebelum (BEFORE)
                    </h4>
                    <pre className="rounded-lg bg-slate-900 p-3.5 text-xs text-rose-300 font-mono overflow-x-auto max-h-56 leading-relaxed">
                      {selectedDetail.before_parsed
                        ? JSON.stringify(selectedDetail.before_parsed, null, 2)
                        : selectedDetail.before_data || 'null'}
                    </pre>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1.5 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Data Sesudah (AFTER)
                    </h4>
                    <pre className="rounded-lg bg-slate-900 p-3.5 text-xs text-emerald-300 font-mono overflow-x-auto max-h-56 leading-relaxed">
                      {selectedDetail.after_parsed
                        ? JSON.stringify(selectedDetail.after_parsed, null, 2)
                        : selectedDetail.after_data || 'null'}
                    </pre>
                  </div>
                </div>
              )}

              {/* Technical Meta */}
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 text-xs space-y-1 text-slate-600">
                <div className="flex items-center justify-between">
                  <span>IP Address:</span>
                  <span className="font-mono font-medium">
                    {selectedDetail.ip_address || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>User Agent / Browser:</span>
                  <span className="font-mono truncate max-w-sm" title={selectedDetail.user_agent}>
                    {selectedDetail.user_agent || '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-right">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => setSelectedDetail(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
