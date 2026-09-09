import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Search,
  Trash2,
  Printer,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Dices,
  Plus,
  ArrowRight,
  Filter,
  Lock,
  ListOrdered,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useAuth } from '../context/AuthContext.jsx';
import AuditDetailModal from '../components/AuditDetailModal.jsx';
import PrintableAuditSheet from '../components/PrintableAuditSheet.jsx';
import PaginationBar from '../components/PaginationBar.jsx';

function formatMoney(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

function formatDateIndo(dStr) {
  if (!dStr) return 'Belum pernah';
  try {
    const d = new Date(dStr);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dStr;
  }
}

function todayIsoDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function StockAuditPage() {
  const { isOwner } = useAuth();
  const [activeTab, setActiveTab] = useState('sessions'); // 'sessions' | 'create'

  // ——— State Sesi Audit List ———
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionLimit] = useState(10);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionStatusFilter, setSessionStatusFilter] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const sessionSearchDebounced = useDebouncedValue(sessionSearch, 400);

  // Modal Detail & Print
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printData, setPrintData] = useState({ session: null, items: [] });

  // ——— State Buat Sesi Baru ———
  const [auditDate, setAuditDate] = useState(todayIsoDate);
  const [sessionNotes, setSessionNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const productSearchDebounced = useDebouncedValue(productSearch, 350);
  const [filterAuditStatus, setFilterAuditStatus] = useState('all'); // 'all' | 'never' | 'audited'
  const [productHits, setProductHits] = useState([]);
  const [hitsLoading, setHitsLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [startingAudit, setStartingAudit] = useState(false);
  const [randomCount, setRandomCount] = useState(10);
  const [randomLoading, setRandomLoading] = useState(false);

  // Fetch Sesi List
  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const { data } = await api.get('/api/stock-audit-sessions', {
        params: {
          page: sessionPage,
          limit: sessionLimit,
          status: sessionStatusFilter,
          search: sessionSearchDebounced,
        },
      });
      setSessions(Array.isArray(data?.data) ? data.data : []);
      setSessionTotal(Number(data?.total) || 0);
    } catch (e) {
      toastApiError(e);
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [sessionPage, sessionLimit, sessionStatusFilter, sessionSearchDebounced]);

  useEffect(() => {
    if (activeTab === 'sessions') {
      fetchSessions().catch(() => {});
    }
  }, [activeTab, fetchSessions]);

  // Fetch Products untuk Buat Sesi Baru
  const fetchProducts = useCallback(async () => {
    setHitsLoading(true);
    try {
      const { data } = await api.get('/api/products', {
        params: {
          page: 1,
          limit: 25,
          search: productSearchDebounced,
          sort_audit: 'asc',
          filter_audit: filterAuditStatus === 'all' ? undefined : filterAuditStatus,
        },
      });
      setProductHits(Array.isArray(data?.data) ? data.data : []);
    } catch (e) {
      toastApiError(e);
      setProductHits([]);
    } finally {
      setHitsLoading(false);
    }
  }, [productSearchDebounced, filterAuditStatus]);

  useEffect(() => {
    if (activeTab === 'create') {
      fetchProducts().catch(() => {});
    }
  }, [activeTab, fetchProducts]);

  const selectedIds = useMemo(
    () => new Set(selectedProducts.map((p) => p.id)),
    [selectedProducts]
  );

  function addProduct(p) {
    if (selectedIds.has(p.id)) return;
    if (p.is_locked_audit) {
      alert(`Produk "${p.name}" sedang dalam proses audit aktif (${p.active_audit_session}).`);
      return;
    }
    setSelectedProducts((prev) => [...prev, p]);
  }

  function removeProduct(productId) {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId));
  }

  // Pilih Acak Produk (Randomizer)
  async function pickRandomProducts(count) {
    setRandomLoading(true);
    try {
      const { data } = await api.get('/api/products', {
        params: {
          page: 1,
          limit: count * 2,
          random: '1',
          filter_audit: filterAuditStatus === 'never' ? 'never' : undefined,
        },
      });
      const candidates = (Array.isArray(data?.data) ? data.data : []).filter(
        (p) => !p.is_locked_audit && !selectedIds.has(p.id)
      );

      const picked = candidates.slice(0, count);
      if (!picked.length) {
        alert('Tidak ada produk tersedia untuk dipilih secara acak');
        return;
      }

      setSelectedProducts((prev) => [...prev, ...picked]);
    } catch (e) {
      toastApiError(e);
    } finally {
      setRandomLoading(false);
    }
  }

  // Mulai Sesi Audit & Buka Lembar Cetak
  async function handleStartAudit(e) {
    e.preventDefault();
    if (!selectedProducts.length) {
      alert('Pilih minimal satu produk untuk diaudit');
      return;
    }

    setStartingAudit(true);
    try {
      const res = await apiCall(
        api.post('/api/stock-audit-sessions', {
          product_ids: selectedProducts.map((p) => p.id),
          audit_date: auditDate,
          notes: sessionNotes.trim() || null,
        }),
        {
          success: 'Sesi audit dimulai! Produk terkunci dari transaksi.',
          loading: 'Membuat sesi audit…',
        }
      );

      const newId = res?.data?.id;
      if (newId) {
        // Ambil detail sesi untuk dicetak langsung
        const { data } = await api.get(`/api/stock-audit-sessions/${newId}`);
        setPrintData({ session: data.session, items: data.items || [] });
        setPrintModalOpen(true);
      }

      // Reset form
      setSelectedProducts([]);
      setSessionNotes('');
      setAuditDate(todayIsoDate());
      setActiveTab('sessions');
      setSessionPage(1);
      fetchSessions().catch(() => {});
    } catch (err) {
      toastApiError(err);
    } finally {
      setStartingAudit(false);
    }
  }

  async function openSessionDetail(id) {
    setSelectedSessionId(id);
    setDetailModalOpen(true);
  }

  async function openPrintSheet(id) {
    try {
      const { data } = await api.get(`/api/stock-audit-sessions/${id}`);
      setPrintData({ session: data.session, items: data.items || [] });
      setPrintModalOpen(true);
    } catch (e) {
      toastApiError(e);
    }
  }

  return (
    <div className="space-y-4">
      {/* Title & Tab Switcher */}
      <div className="page-title-row flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title flex items-center gap-2.5">
          <ClipboardList size={28} strokeWidth={2} className="icon-title" aria-hidden />
          Stock Opname &amp; Audit Fisik
        </h1>

        <div className="flex rounded-xl border border-slate-200 bg-slate-100/90 p-1 text-xs font-semibold text-slate-600 shadow-inner">
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${
              activeTab === 'sessions'
                ? 'bg-white text-blue-700 shadow-sm font-bold'
                : 'hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('sessions')}
          >
            <ListOrdered size={15} />
            Daftar Sesi &amp; Approval
            {sessions.some((s) => s.status === 'pending_approval') && (
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${
              activeTab === 'create'
                ? 'bg-white text-blue-700 shadow-sm font-bold'
                : 'hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('create')}
          >
            <Plus size={15} />
            Buat Sesi Audit Baru
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DAFTAR SESI & APPROVAL */}
      {/* ========================================================================= */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px]">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Cari no sesi / catatan / user…"
                  className="w-full !pl-8 text-xs py-1.5"
                  value={sessionSearch}
                  onChange={(e) => {
                    setSessionSearch(e.target.value);
                    setSessionPage(1);
                  }}
                />
              </div>

              <div className="flex items-center gap-1">
                <Filter size={14} className="text-slate-400" />
                <select
                  className="text-xs py-1.5 pr-8 bg-white border border-slate-200 rounded-lg"
                  value={sessionStatusFilter}
                  onChange={(e) => {
                    setSessionStatusFilter(e.target.value);
                    setSessionPage(1);
                  }}
                >
                  <option value="">Semua Status</option>
                  <option value="in_progress">Sedang Dihitung (in_progress)</option>
                  <option value="pending_approval">Menunggu Approval (pending)</option>
                  <option value="approved">Disetujui (approved)</option>
                  <option value="rejected">Ditolak (rejected)</option>
                  <option value="cancelled">Dibatalkan (cancelled)</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              onClick={() => setActiveTab('create')}
            >
              <Plus size={16} />
              Mulai Audit Baru
            </button>
          </div>

          {/* Table Sessions */}
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="py-3 px-4">No. Sesi</th>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Status &amp; Proteksi</th>
                    <th className="py-3 px-4 text-center">Item</th>
                    <th className="py-3 px-4 text-center">Selisih Unit</th>
                    <th className="py-3 px-4">Pembuat &amp; Approver</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessionsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                        Memuat data sesi audit…
                      </td>
                    </tr>
                  ) : sessions.length ? (
                    sessions.map((s) => {
                      const isPending = s.status === 'pending_approval';
                      const isInProgress = s.status === 'in_progress';
                      const isApproved = s.status === 'approved';
                      const isRejected = s.status === 'rejected';

                      return (
                        <tr
                          key={s.id}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          onClick={() => openSessionDetail(s.id)}
                        >
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {s.session_code}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-slate-700">
                            {s.audit_date}
                          </td>
                          <td className="py-3 px-4">
                            {isInProgress && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock size={12} /> Cek Fisik (Terkunci)
                              </span>
                            )}
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">
                                <AlertTriangle size={12} /> Butuh Approval
                              </span>
                            )}
                            {isApproved && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 size={12} /> Disetujui
                              </span>
                            )}
                            {isRejected && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                                Ditolak
                              </span>
                            )}
                            {s.status === 'cancelled' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                                Dibatalkan
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-semibold text-slate-800">{s.total_items}</span>
                            <span className="text-xs text-slate-400"> ({s.counted_items} diisi)</span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold">
                            {s.counted_items > 0 ? (
                              <span
                                className={`font-mono text-xs px-2 py-0.5 rounded ${
                                  Number(s.total_delta) > 0
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : Number(s.total_delta) < 0
                                    ? 'bg-red-50 text-red-700'
                                    : 'text-slate-600'
                                }`}
                              >
                                {Number(s.total_delta) > 0 ? `+${s.total_delta}` : s.total_delta} pcs
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            <div>Dibuat: {s.created_by_name || 'Admin'}</div>
                            {s.approved_by_name && (
                              <div className="text-slate-500 font-medium">
                                Approve: {s.approved_by_name}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm text-xs py-1 px-2.5 flex items-center gap-1"
                                onClick={() => openPrintSheet(s.id)}
                                title="Cetak lembar formulir fisik kertas"
                              >
                                <Printer size={14} /> Cetak
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm text-xs py-1 px-2.5 flex items-center gap-1 ${
                                  isPending && isOwner
                                    ? 'btn-primary font-bold bg-blue-600'
                                    : 'btn-ghost text-blue-700 hover:bg-blue-50'
                                }`}
                                onClick={() => openSessionDetail(s.id)}
                              >
                                {isPending && isOwner ? 'Review / Approve' : 'Detail'}
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                        Belum ada sesi audit stok. Klik tombol &ldquo;Mulai Audit Baru&rdquo; untuk memulai.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {sessionTotal > sessionLimit && (
              <div className="p-3 border-t border-slate-100">
                <PaginationBar
                  page={sessionPage}
                  limit={sessionLimit}
                  total={sessionTotal}
                  onPageChange={setSessionPage}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: BUAT SESI AUDIT BARU */}
      {/* ========================================================================= */}
      {activeTab === 'create' && (
        <form onSubmit={handleStartAudit} className="space-y-4">
          {/* Header Form Input Tanggal & Info */}
          <div className="card p-4 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-slate-50 to-blue-50/40 border border-blue-200/60">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="text-blue-600" size={20} />
                Pilih Produk untuk Audit Stok Fisik
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                Pilih produk yang akan diperiksa fisiknya di rak gudang. Produk yang masuk ke sesi ini
                akan <strong>dikunci sementara dari transaksi penjualan &amp; penambahan stok</strong> agar
                hasil hitungan akurat dan tidak berubah saat checker melakukan penghitungan fisik.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                <Calendar size={15} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-700">Tgl Audit:</span>
                <input
                  type="date"
                  className="!border-none !p-0 text-xs font-semibold text-slate-900 focus:ring-0"
                  value={auditDate}
                  onChange={(e) => setAuditDate(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary flex items-center gap-2 shadow-lg shadow-blue-600/20 font-semibold"
                disabled={startingAudit || selectedProducts.length === 0}
              >
                <Printer size={17} />
                {startingAudit ? 'Membuat Sesi…' : `Mulai Audit & Cetak Form (${selectedProducts.length})`}
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            {/* Panel Kiri: Pencarian & Randomizer Produk (7 cols) */}
            <div className="card flex flex-col min-h-[480px] lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800">Daftar Produk Gudang</h3>

                {/* Filter Status Audit */}
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500">Filter:</span>
                  <select
                    className="text-xs py-1 px-2 border rounded-md bg-slate-50"
                    value={filterAuditStatus}
                    onChange={(e) => setFilterAuditStatus(e.target.value)}
                  >
                    <option value="all">Semua Produk</option>
                    <option value="never">Belum Pernah Diaudit</option>
                    <option value="audited">Pernah Diaudit</option>
                  </select>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="w-full !pl-10 text-sm"
                  placeholder="Cari nama produk atau barcode…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>

              {/* Fitur Tombol Pilih Acak (Randomizer) */}
              <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-indigo-950">
                  <Dices size={20} className="text-indigo-600" />
                  <div>
                    <div className="text-xs font-bold">Pilih Acak (Sampling Fisik Acak)</div>
                    <div className="text-[11px] text-indigo-800">
                      Ambil sampel acak produk yang belum / paling lama tidak diaudit
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {[5, 10, 20].map((num) => (
                    <button
                      key={num}
                      type="button"
                      disabled={randomLoading}
                      className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white text-indigo-700 border border-indigo-300 hover:bg-indigo-600 hover:text-white transition shadow-sm"
                      onClick={() => pickRandomProducts(num)}
                    >
                      + {num} Acak
                    </button>
                  ))}
                </div>
              </div>

              {/* List Produk untuk Dipilih */}
              <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 divide-y divide-slate-100 max-h-[380px]">
                {hitsLoading ? (
                  <p className="p-4 text-center text-xs text-slate-400">Memuat produk…</p>
                ) : productHits.length ? (
                  productHits.map((p) => {
                    const isSelected = selectedIds.has(p.id);
                    const isLocked = !!p.is_locked_audit;

                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isSelected || isLocked}
                        className={`flex w-full items-center justify-between p-3 text-left transition ${
                          isSelected
                            ? 'bg-blue-50/50 opacity-60 cursor-not-allowed'
                            : isLocked
                            ? 'bg-amber-50/50 cursor-not-allowed opacity-75'
                            : 'hover:bg-white'
                        }`}
                        onClick={() => addProduct(p)}
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="font-semibold text-slate-900 text-sm truncate">{p.name}</div>
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                            {p.barcode && (
                              <span className="font-mono bg-slate-200/70 px-1 rounded text-slate-700">
                                {p.barcode}
                              </span>
                            )}
                            <span>HPP: {formatMoney(p.hpp)}</span>
                            <span>•</span>
                            <span
                              className={`font-semibold ${
                                p.last_audit_date ? 'text-slate-700' : 'text-amber-700 font-bold'
                              }`}
                            >
                              Terakhir audit: {formatDateIndo(p.last_audit_date)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="text-right">
                            <span className="text-xs text-slate-400 block">Stok Sistem</span>
                            <span className="font-mono font-bold text-slate-800">{p.stock}</span>
                          </div>

                          {isSelected ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800">
                              Dipilih
                            </span>
                          ) : isLocked ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-200 text-amber-900 flex items-center gap-1">
                              <Lock size={11} /> Sedang Diaudit
                            </span>
                          ) : (
                            <span className="btn btn-secondary btn-sm !py-1 !px-2 text-xs font-semibold flex items-center gap-1 text-blue-700">
                              <Plus size={14} /> Pilih
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="p-8 text-center text-xs text-slate-400">Tidak ada produk ditemukan</p>
                )}
              </div>
            </div>

            {/* Panel Kanan: Daftar Produk Terpilih (5 cols) */}
            <div className="card flex flex-col min-h-[480px] lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  Produk Terpilih ({selectedProducts.length})
                </h3>
                {selectedProducts.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => setSelectedProducts([])}
                  >
                    Hapus Semua
                  </button>
                )}
              </div>

              {/* Box Info Proteksi Transaksi */}
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
                <Lock size={15} className="text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Saat audit dimulai, barang di bawah ini akan terkunci dari transaksi keluar sampai selesai dihitung &amp; diapprove.
                </span>
              </div>

              {/* List Produk Terpilih */}
              <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white max-h-[300px]">
                {selectedProducts.length ? (
                  <ul className="divide-y divide-slate-100">
                    {selectedProducts.map((p, idx) => (
                      <li key={p.id} className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {idx + 1}. {p.name}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Stok: {p.stock} • {p.barcode || '—'}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-red-500 hover:text-red-700 p-1"
                          onClick={() => removeProduct(p.id)}
                          aria-label={`Hapus ${p.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Belum ada produk yang dipilih. Pilih produk dari daftar sebelah kiri atau gunakan tombol 🎲 Pilih Acak.
                  </div>
                )}
              </div>

              {/* Catatan Sesi */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Catatan Audit (Opsional)</label>
                <textarea
                  rows={2}
                  className="w-full text-xs p-2 border rounded-lg bg-white"
                  placeholder="Misal: Audit fisik rak display A & rak cadangan..."
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="btn btn-primary w-full py-2.5 font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
                disabled={startingAudit || selectedProducts.length === 0}
              >
                <ArrowRight size={17} />
                {startingAudit ? 'Membuat Sesi…' : 'Mulai Sesi Audit & Cetak Form'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Modal Detail & Input Sesi */}
      <AuditDetailModal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        sessionId={selectedSessionId}
        onRefresh={fetchSessions}
      />

      {/* Modal Cetak Format Fisik A4 */}
      <PrintableAuditSheet
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        session={printData.session}
        items={printData.items}
      />
    </div>
  );
}
