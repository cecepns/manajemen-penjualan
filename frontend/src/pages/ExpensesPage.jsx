import { useCallback, useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import { format, parseISO } from 'date-fns';
import { Coins, Filter, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import Select from 'react-select';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { confirmAction } from '../utils/confirm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import PaginationBar from '../components/PaginationBar.jsx';
import { selectStyles } from '../components/selectTheme.js';

const LIMIT = 10;

function formatMoney(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

const CATEGORY_OPTIONS = [
  { value: 'operasional', label: 'Operasional Gudang / Saldo Cash' },
  { value: 'iklan', label: 'Biaya Iklan (Marketing)' },
  { value: 'lainnya', label: 'Lainnya' },
];

export default function ExpensesPage() {
  const { isOwnerOrAdmin } = useAuth();
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [storeFilter, setStoreFilter] = useState(null);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [search, setSearch] = useState('');
  
  // Data
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stores, setStores] = useState([]);
  
  // Summary
  const [summary, setSummary] = useState({ total: 0, ops: 0, ads: 0, lain: 0 });
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  
  // Form fields
  const [formCategory, setFormCategory] = useState('operasional');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(new Date());
  const [formStoreId, setFormStoreId] = useState(null);
  const [formNotes, setFormNotes] = useState('');

  const fetchStores = useCallback(async () => {
    try {
      const { data } = await api.get('/api/stores/all');
      setStores(data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const params = {
        page,
        limit: LIMIT,
      };
      if (categoryFilter) params.category = categoryFilter;
      if (storeFilter) params.store_id = storeFilter;
      if (dateFrom) params.date_from = format(dateFrom, 'yyyy-MM-dd');
      if (dateTo) params.date_to = format(dateTo, 'yyyy-MM-dd');
      if (search.trim()) params.search = search;

      const { data } = await api.get('/api/expenses', { params });
      setRows(data.data || []);
      setTotal(data.total || 0);

      // Fetch summary statistics based on active filters (re-using the dashboard endpoints or summing loaded page/all)
      // For precision, let's fetch summary from `/api/dashboard` or perform a summary query.
      // Wait, `/api/dashboard` already returns expenses overall. Let's make an ad-hoc dashboard-style query to get the filtered summary or calculate it locally.
      // To get the exact sum of filtered records, let's calculate from all filtered data, or simply request stats.
      // We can query with a high limit or just use the backend data.
      // Actually, since we want summary cards of the current filter range:
      const sumParams = { ...params, limit: 100000, page: 1 };
      const { data: allFiltered } = await api.get('/api/expenses', { params: sumParams });
      const stats = { total: 0, ops: 0, ads: 0, lain: 0 };
      if (allFiltered?.data) {
        allFiltered.data.forEach(item => {
          const amt = Number(item.amount) || 0;
          stats.total += amt;
          if (item.category === 'operasional') stats.ops += amt;
          else if (item.category === 'iklan') stats.ads += amt;
          else stats.lain += amt;
        });
      }
      setSummary(stats);

    } catch (e) {
      toastApiError(e);
    }
  }, [page, categoryFilter, storeFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, storeFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleOpenCreate = () => {
    setEditingExpense(null);
    setFormCategory('operasional');
    setFormAmount('');
    setFormDate(new Date());
    setFormStoreId(null);
    setFormNotes('');
    setModalOpen(true);
  };

  const handleOpenEdit = (exp) => {
    setEditingExpense(exp);
    setFormCategory(exp.category);
    setFormAmount(String(exp.amount));
    setFormDate(exp.expense_date ? parseISO(exp.expense_date) : new Date());
    setFormStoreId(exp.store_id);
    setFormNotes(exp.notes || '');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formAmount || Number(formAmount) <= 0) {
      alert('Jumlah pengeluaran harus lebih besar dari 0');
      return;
    }
    
    const payload = {
      category: formCategory,
      amount: Number(formAmount),
      expense_date: format(formDate, 'yyyy-MM-dd'),
      store_id: formCategory === 'iklan' ? formStoreId : null, // Store is typically for Ads costs
      notes: formNotes,
    };

    try {
      if (editingExpense) {
        await apiCall(api.put(`/api/expenses/${editingExpense.id}`, payload), {
          success: 'Pengeluaran berhasil diubah',
          loading: 'Menyimpan…',
        });
      } else {
        await apiCall(api.post('/api/expenses', payload), {
          success: 'Pengeluaran berhasil ditambahkan',
          loading: 'Menyimpan…',
        });
      }
      setModalOpen(false);
      fetchExpenses();
    } catch (err) {
      toastApiError(err);
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirmAction({
      message: 'Hapus pengeluaran ini?',
      confirmLabel: 'Hapus',
    });
    if (!ok) return;

    try {
      await apiCall(api.delete(`/api/expenses/${id}`), {
        success: 'Pengeluaran dihapus',
        loading: 'Menghapus…',
      });
      fetchExpenses();
    } catch (err) {
      toastApiError(err);
    }
  };

  const storeOptions = stores.map(s => ({ value: s.id, label: s.name }));

  return (
    <div>
      <div className="page-title-row">
        <h1 className="page-title flex items-center gap-2">
          <Wallet size={28} strokeWidth={2} className="icon-title" aria-hidden />
          Keuangan & Pengeluaran
        </h1>
        {isOwnerOrAdmin && (
          <button type="button" className="btn btn-primary" onClick={handleOpenCreate}>
            <Plus size={18} strokeWidth={2} aria-hidden />
            Tambah Pengeluaran
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 mb-4 md:grid-cols-4">
        <div className="stat">
          <div className="stat-icon bg-red-50 text-red-600">
            <Coins size={20} strokeWidth={2} aria-hidden />
          </div>
          <span className="stat-label">Total Pengeluaran</span>
          <strong>{formatMoney(summary.total)}</strong>
        </div>
        <div className="stat">
          <div className="stat-icon bg-blue-50 text-blue-600">
            <Wallet size={20} strokeWidth={2} aria-hidden />
          </div>
          <span className="stat-label">Operasional Gudang/Cash</span>
          <strong>{formatMoney(summary.ops)}</strong>
        </div>
        <div className="stat">
          <div className="stat-icon bg-amber-50 text-amber-600">
            <Coins size={20} strokeWidth={2} aria-hidden />
          </div>
          <span className="stat-label">Biaya Iklan (Ads)</span>
          <strong>{formatMoney(summary.ads)}</strong>
        </div>
        <div className="stat">
          <div className="stat-icon bg-slate-50 text-slate-600">
            <Wallet size={20} strokeWidth={2} aria-hidden />
          </div>
          <span className="stat-label">Pengeluaran Lainnya</span>
          <strong>{formatMoney(summary.lain)}</strong>
        </div>
      </div>

      {/* Filters Card */}
      <div className="card mb-4">
        <div className="mb-2.5 flex items-center gap-2">
          <Filter size={18} strokeWidth={2} className="text-slate-500" aria-hidden />
          <span className="text-sm font-semibold text-slate-900">Filter Pencarian</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
          <div>
            <label>Kategori</label>
            <Select
              isClearable
              placeholder="Semua Kategori"
              options={CATEGORY_OPTIONS}
              value={CATEGORY_OPTIONS.find(o => o.value === categoryFilter) || null}
              onChange={(o) => setCategoryFilter(o?.value ?? null)}
              styles={selectStyles()}
            />
          </div>
          <div>
            <label>Toko (Khusus Iklan)</label>
            <Select
              isClearable
              placeholder="Semua Toko"
              options={storeOptions}
              value={storeOptions.find(o => o.value === storeFilter) || null}
              onChange={(o) => setStoreFilter(o?.value ?? null)}
              styles={selectStyles()}
            />
          </div>
          <div>
            <label>Dari Tanggal</label>
            <DatePicker
              locale="id"
              selected={dateFrom}
              onChange={d => setDateFrom(d)}
              dateFormat="dd/MM/yyyy"
              placeholderText="Tanggal awal"
              isClearable
              maxDate={dateTo ?? undefined}
              className="field-input w-full"
              wrapperClassName="w-full"
              popperClassName="datepicker-popper-z"
              showPopperArrow={false}
              autoComplete="off"
            />
          </div>
          <div>
            <label>Sampai Tanggal</label>
            <DatePicker
              locale="id"
              selected={dateTo}
              onChange={d => setDateTo(d)}
              dateFormat="dd/MM/yyyy"
              placeholderText="Tanggal akhir"
              isClearable
              minDate={dateFrom ?? undefined}
              className="field-input w-full"
              wrapperClassName="w-full"
              popperClassName="datepicker-popper-z"
              showPopperArrow={false}
              autoComplete="off"
            />
          </div>
          <div>
            <label>Cari Catatan</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Keyword catatan..."
              className="field-input w-full"
            />
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="card table-wrap">
        <table className="table-app">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Kategori</th>
              <th>Toko</th>
              <th>Jumlah</th>
              <th>Catatan</th>
              <th>Pencatat</th>
              {isOwnerOrAdmin && <th className="w-40">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((exp) => (
              <tr key={exp.id}>
                <td>{exp.expense_date ? format(parseISO(exp.expense_date), 'dd MMMM yyyy') : '-'}</td>
                <td>
                  <span className={`badge ${
                    exp.category === 'operasional' ? 'badge-blue' : exp.category === 'iklan' ? 'badge-amber' : 'badge-slate'
                  }`}>
                    {exp.category === 'operasional' ? 'Operasional' : exp.category === 'iklan' ? 'Iklan' : 'Lainnya'}
                  </span>
                </td>
                <td>{exp.store_name || '-'}</td>
                <td className="font-semibold text-red-600">{formatMoney(exp.amount)}</td>
                <td>{exp.notes || '-'}</td>
                <td className="text-xs text-slate-500">{exp.user_name || '-'}</td>
                {isOwnerOrAdmin && (
                  <td className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost min-h-9 px-2.5 text-xs"
                        onClick={() => handleOpenEdit(exp)}
                      >
                        <Pencil size={16} strokeWidth={2} aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger min-h-9 px-2.5 text-xs"
                        onClick={() => handleDelete(exp.id)}
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
        {!rows.length && <p className="muted p-4 text-center">Belum ada data pengeluaran</p>}
      </div>

      <PaginationBar page={page} total={total} limit={LIMIT} onPageChange={setPage} />

      {/* Form Modal */}
      {modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-window max-w-lg">
            <div className="modal-header">
              <h3 className="modal-title">
                {editingExpense ? 'Edit Pengeluaran' : 'Tambah Pengeluaran Baru'}
              </h3>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Kategori</label>
                  <Select
                    options={CATEGORY_OPTIONS}
                    value={CATEGORY_OPTIONS.find(o => o.value === formCategory)}
                    onChange={o => setFormCategory(o.value)}
                    styles={selectStyles()}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Jumlah (Rp)</label>
                  <input
                    type="number"
                    required
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    placeholder="Contoh: 150000"
                    className="field-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Tanggal Pengeluaran</label>
                  <DatePicker
                    selected={formDate}
                    onChange={d => setFormDate(d || new Date())}
                    dateFormat="dd/MM/yyyy"
                    required
                    className="field-input w-full"
                    wrapperClassName="w-full"
                  />
                </div>

                {formCategory === 'iklan' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Toko Terkait</label>
                    <Select
                      isClearable
                      placeholder="Pilih Toko"
                      options={storeOptions}
                      value={storeOptions.find(o => o.value === formStoreId) || null}
                      onChange={o => setFormStoreId(o?.value ?? null)}
                      styles={selectStyles()}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Catatan / Keterangan</label>
                  <textarea
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Beli ATK, token listrik, dll..."
                    rows={3}
                    className="field-input w-full"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
