import { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  Eye,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { api, toastApiError } from '../utils/api.js';

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Belum pernah aktif';
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 60) return 'Aktif sekarang';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} hari lalu`;
}

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

const roleLabels = {
  owner: 'Owner',
  admin: 'Admin',
  karyawan: 'Staff',
  checker_pengiriman: 'Checker',
};

const avatarColors = [
  'bg-blue-600 text-white',
  'bg-emerald-600 text-white',
  'bg-violet-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
  'bg-cyan-600 text-white',
  'bg-indigo-600 text-white',
];

function getAvatarColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export default function StatusOnlinePage() {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({
    online: 0,
    idle: 0,
    offline: 0,
    total_user: 0,
    active_today: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userLogs, setUserLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [nextRefreshSec, setNextRefreshSec] = useState(60);

  const fetchOnlineUsers = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const { data: res } = await api.get('/api/user-status/online-users', {
          params: {
            page,
            limit,
            search: search.trim(),
            role: roleFilter,
            status: statusFilter,
          },
        });
        setData(res.data || []);
        if (res.summary) setSummary(res.summary);
        setTotal(res.total || 0);
        setNextRefreshSec(60);
      } catch (err) {
        toastApiError(err, 'Gagal memuat status online user');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, limit, search, roleFilter, statusFilter]
  );

  useEffect(() => {
    fetchOnlineUsers();
  }, [fetchOnlineUsers]);

  // Auto refresh timer tiap 60 detik
  useEffect(() => {
    const timer = setInterval(() => {
      setNextRefreshSec((prev) => {
        if (prev <= 1) {
          fetchOnlineUsers();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [fetchOnlineUsers]);

  // Load user specific activity summary when modal opened
  const handleOpenDetail = async (user) => {
    setSelectedUser(user);
    setUserLogs([]);
    setLoadingLogs(true);
    try {
      const { data: res } = await api.get('/api/activity-logs', {
        params: {
          user_id: user.id,
          limit: 5,
        },
      });
      setUserLogs(res.data || []);
    } catch {
      // ignore if non-owner doesn't have access to full logs
    } finally {
      setLoadingLogs(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const startIdx = total === 0 ? 0 : (page - 1) * limit + 1;
  const endIdx = Math.min(page * limit, total);

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Dashboard</span>
            <span>›</span>
            <span className="text-slate-700">Status Online User</span>
          </div>
          <div className="mt-1 flex items-center gap-2.5">
            <Radio size={24} className="text-emerald-600 animate-pulse" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Status Online User
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm">
            <RefreshCw
              size={13}
              className={`text-slate-500 ${refreshing ? 'animate-spin' : ''}`}
            />
            <span>Refresh Otomatis tiap 1 menit ({nextRefreshSec}s)</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm flex items-center gap-1.5 shadow-sm"
            onClick={() => fetchOnlineUsers(true)}
            disabled={refreshing}
            title="Refresh Sekarang"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Card 1: Online */}
        <div className="relative overflow-hidden rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Online
              </p>
              <h3 className="mt-1.5 text-3xl font-extrabold tracking-tight text-emerald-950">
                {summary.online}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
              <UserCheck size={26} strokeWidth={2.2} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700/90 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Sedang aktif sekarang</span>
          </div>
        </div>

        {/* Card 2: Offline */}
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/70 to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Offline
              </p>
              <h3 className="mt-1.5 text-3xl font-extrabold tracking-tight text-slate-800">
                {summary.offline}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
              <UserX size={26} strokeWidth={2.2} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span>Tidak terhubung</span>
          </div>
        </div>

        {/* Card 3: Total User */}
        <div className="relative overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                Total User
              </p>
              <h3 className="mt-1.5 text-3xl font-extrabold tracking-tight text-blue-950">
                {summary.total_user}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600">
              <Users size={26} strokeWidth={2.2} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-700/90 font-medium">
            <ShieldCheck size={14} />
            <span>Terdaftar di sistem</span>
          </div>
        </div>

        {/* Card 4: Aktif Hari Ini */}
        <div className="relative overflow-hidden rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/70 to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Aktif Hari Ini
              </p>
              <h3 className="mt-1.5 text-3xl font-extrabold tracking-tight text-amber-950">
                {summary.active_today}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
              <Clock size={26} strokeWidth={2.2} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700/90 font-medium">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Login / ada aktivitas hari ini</span>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        {/* Search & Filter Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-200/80 p-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              className="input w-full pl-9 pr-3 text-sm"
              placeholder="Cari user berdasarkan nama atau email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              className="input text-xs py-1.5 px-3 min-w-[130px]"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Role</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="karyawan">Staff</option>
              <option value="checker_pengiriman">Checker</option>
            </select>

            <select
              className="input text-xs py-1.5 px-3 min-w-[130px]"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Status</option>
              <option value="online">🟢 Online</option>
              <option value="idle">🟡 Idle</option>
              <option value="offline">🔴 Offline</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3.5">User</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Last Active</th>
                <th className="px-4 py-3.5">Login Terakhir</th>
                <th className="px-4 py-3.5 text-center">Durasi Session</th>
                <th className="px-4 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Loader2 size={24} className="mx-auto animate-spin text-blue-600 mb-2" />
                    Memuat status user…
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <UserX size={32} className="mx-auto text-slate-300 mb-2" />
                    Tidak ada data user ditemukan.
                  </td>
                </tr>
              ) : (
                data.map((u) => {
                  const initial = (u.name || 'U').charAt(0).toUpperCase();
                  const avatarBg = getAvatarColor(u.name);

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* User Column */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-sm shadow-sm ${avatarBg}`}
                          >
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {u.name}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role Column */}
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                          {roleLabels[u.role] || u.role}
                        </span>
                      </td>

                      {/* Status Column */}
                      <td className="px-4 py-3.5">
                        {u.status === 'online' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200/60 shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Online
                          </span>
                        )}
                        {u.status === 'idle' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-200/60 shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            Idle
                          </span>
                        )}
                        {u.status === 'offline' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 border border-rose-200/60 shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-rose-400" />
                            Offline
                          </span>
                        )}
                      </td>

                      {/* Last Active Column */}
                      <td className="px-4 py-3.5">
                        <div title={formatFullDateTime(u.last_active_at)}>
                          <span className="font-medium text-slate-800">
                            {formatRelativeTime(u.last_active_at)}
                          </span>
                          {u.last_active_at && (
                            <p className="text-[11px] text-slate-400">
                              {formatFullDateTime(u.last_active_at).split(' ')[1]} WIB
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Login Terakhir Column */}
                      <td className="px-4 py-3.5 text-xs text-slate-600 font-mono">
                        {formatFullDateTime(u.last_login_at)}
                      </td>

                      {/* Durasi Session Column */}
                      <td className="px-4 py-3.5 text-center font-mono text-xs font-semibold text-slate-700">
                        <span className="rounded bg-slate-100 px-2 py-0.5 border border-slate-200">
                          {u.session_duration || '00:00:00'}
                        </span>
                      </td>

                      {/* Aksi Column */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition"
                          title="Lihat Detail & Aktivitas"
                          onClick={() => handleOpenDetail(u)}
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

        {/* Footer & Pagination matching screenshot */}
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              className="input py-1 px-2 text-xs"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center gap-4">
            <span>
              {startIdx}-{endIdx} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-sm btn-ghost px-2 disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage(1)}
                title="Halaman Pertama"
              >
                &laquo;
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost px-2.5 disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title="Halaman Sebelumnya"
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
                title="Halaman Berikutnya"
              >
                &rsaquo;
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost px-2 disabled:opacity-30"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                title="Halaman Terakhir"
              >
                &raquo;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Detail User Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/75 px-6 py-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full font-bold text-base shadow-sm ${getAvatarColor(
                    selectedUser.name
                  )}`}
                >
                  {(selectedUser.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedUser.name}
                  </h3>
                  <p className="text-xs text-slate-500">{selectedUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setSelectedUser(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-sm text-slate-700 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <span className="text-xs text-slate-400 block font-medium">Status</span>
                  <div className="mt-1 flex items-center gap-1.5 font-semibold">
                    {selectedUser.status === 'online' && (
                      <span className="text-emerald-600 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Online
                      </span>
                    )}
                    {selectedUser.status === 'idle' && (
                      <span className="text-amber-600 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        Idle
                      </span>
                    )}
                    {selectedUser.status === 'offline' && (
                      <span className="text-rose-600 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        Offline
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <span className="text-xs text-slate-400 block font-medium">Role Akun</span>
                  <span className="mt-1 block font-semibold text-slate-800">
                    {roleLabels[selectedUser.role] || selectedUser.role}
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <span className="text-xs text-slate-400 block font-medium">Aktivitas Terakhir</span>
                  <span className="mt-1 block font-semibold text-slate-800">
                    {formatRelativeTime(selectedUser.last_active_at)}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {formatFullDateTime(selectedUser.last_active_at)}
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <span className="text-xs text-slate-400 block font-medium">Durasi Sesi</span>
                  <span className="mt-1 block font-mono font-bold text-slate-900 text-base">
                    {selectedUser.session_duration || '00:00:00'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                <span className="text-xs text-slate-400 block font-medium">Login Terakhir</span>
                <span className="mt-1 block font-mono font-medium text-slate-800 text-xs">
                  {formatFullDateTime(selectedUser.last_login_at)}
                </span>
              </div>

              {/* Recent Activity summary for this user */}
              <div className="pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Aktivitas Terbaru User Ini
                </h4>
                {loadingLogs ? (
                  <div className="py-4 text-center text-xs text-slate-400">
                    <Loader2 size={16} className="mx-auto animate-spin mb-1 text-blue-600" />
                    Memuat riwayat...
                  </div>
                ) : userLogs.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg text-center">
                    Belum ada catatan log aktivitas untuk user ini.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {userLogs.map((lg) => (
                      <div
                        key={lg.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="font-semibold text-slate-700">
                            {lg.action}
                          </span>
                          <span>{formatRelativeTime(lg.created_at)}</span>
                        </div>
                        <p className="text-slate-800 font-medium">{lg.description}</p>
                        {lg.reference && (
                          <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-mono text-blue-700">
                            Ref: {lg.reference}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-right">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => setSelectedUser(null)}
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
