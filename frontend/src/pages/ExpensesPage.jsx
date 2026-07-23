import { useCallback, useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import { format, parseISO } from 'date-fns';
import { Coins, Filter, Pencil, Plus, Trash2, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Select from 'react-select';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { confirmAction } from '../utils/confirm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import PaginationBar from '../components/PaginationBar.jsx';
import { selectStyles } from '../components/selectTheme.js';
import Modal from '../components/Modal.jsx';

const LIMIT = 10;

function formatMoney(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

const CATEGORY_OPTIONS = [
  { value: 'operasional', label: 'Operasional Gudang' },
  { value: 'iklan', label: 'Biaya Iklan (Marketing)' },
  { value: 'belanja_supplier', label: 'Belanja Supplier' },
  { value: 'refund_manual', label: 'Refund Manual' },
  { value: 'lainnya', label: 'Lainnya' },
];

const INCOME_CATEGORY_OPTIONS = [
  { value: 'hasil_penjualan', label: 'Hasil Penjualan' },
  { value: 'penambahan_modal', label: 'Penambahan Modal' },
];

export default function ExpensesPage() {
  const { isOwnerOrAdmin } = useAuth();
  
  // Navigation tab: 'expenses' or 'incomes'
  const [activeTab, setActiveTab] = useState('expenses');

  // Filters (shared & tab-specific)
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [storeFilter, setStoreFilter] = useState(null); // specific to expenses (ads)
  const [sourceFilter, setSourceFilter] = useState(null); // specific to incomes
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [search, setSearch] = useState('');
  
  // Data
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stores, setStores] = useState([]);
  const [saldoMandiri, setSaldoMandiri] = useState(0);
  
  // Summary
  const [summary, setSummary] = useState({ total: 0, ops: 0, ads: 0, lain: 0 });
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('expense'); // 'expense' or 'income'
  const [editingItem, setEditingItem] = useState(null);
  
  // Form fields (Expenses)
  const [formCategory, setFormCategory] = useState('operasional');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(new Date());
  const [formStoreId, setFormStoreId] = useState(null);
  const [formNotes, setFormNotes] = useState('');

  // Form fields (Incomes)
  const [formIncomeCategory, setFormIncomeCategory] = useState('hasil_penjualan');
  const [formIncomeSource, setFormIncomeSource] = useState('Manual Order');
  const [formCustomSource, setFormCustomSource] = useState('');
  const [formIncomeAmount, setFormIncomeAmount] = useState('');
  const [formIncomeDate, setFormIncomeDate] = useState(new Date());
  const [formIncomeNotes, setFormIncomeNotes] = useState('');

  // Dynamic source options derived from backend stores
  const incomeSourceOptions = [
    { value: 'Manual Order', label: 'Manual Order' },
    ...stores.map(s => ({ value: s.name, label: s.name })),
    { value: 'Lainnya', label: 'Lainnya (Kustom)' }
  ];

  const fetchStores = useCallback(async () => {
    try {
      const { data } = await api.get('/api/stores/all');
      setStores(data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchSaldo = useCallback(async () => {
    try {
      const { data } = await api.get('/api/finances/balance');
      setSaldoMandiri(data.saldo_mandiri || 0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const params = {
        page,
        limit: LIMIT,
      };
      if (categoryFilter) params.category = categoryFilter;
      if (dateFrom) params.date_from = format(dateFrom, 'yyyy-MM-dd');
      if (dateTo) params.date_to = format(dateTo, 'yyyy-MM-dd');
      if (search.trim()) params.search = search;

      if (activeTab === 'expenses') {
        if (storeFilter) params.store_id = storeFilter;
        const { data } = await api.get('/api/expenses', { params });
        setRows(data.data || []);
        setTotal(data.total || 0);

        // Fetch stats summary (using large page to sum up filtered records)
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
      } else {
        if (sourceFilter) params.source = sourceFilter;
        const { data } = await api.get('/api/incomes', { params });
        setRows(data.data || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      toastApiError(e);
    }
  }, [page, activeTab, categoryFilter, storeFilter, sourceFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    setPage(1);
    setCategoryFilter(null);
    setStoreFilter(null);
    setSourceFilter(null);
  }, [activeTab]);

  useEffect(() => {
    fetchData();
    fetchSaldo();
  }, [fetchData, fetchSaldo]);

  const handleOpenCreateExpense = () => {
    setModalType('expense');
    setEditingItem(null);
    setFormCategory('operasional');
    setFormAmount('');
    setFormDate(new Date());
    setFormStoreId(null);
    setFormNotes('');
    setModalOpen(true);
  };

  const handleOpenCreateIncome = () => {
    setModalType('income');
    setEditingItem(null);
    setFormIncomeCategory('hasil_penjualan');
    setFormIncomeSource('Manual Order');
    setFormCustomSource('');
    setFormIncomeAmount('');
    setFormIncomeDate(new Date());
    setFormIncomeNotes('');
    setModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    if (activeTab === 'expenses') {
      setModalType('expense');
      setFormCategory(item.category);
      setFormAmount(String(item.amount));
      setFormDate(item.expense_date ? parseISO(item.expense_date) : new Date());
      setFormStoreId(item.store_id);
      setFormNotes(item.notes || '');
    } else {
      setModalType('income');
      setFormIncomeCategory(item.category);
      const isStandardSource = ['Manual Order', ...stores.map(s => s.name)].includes(item.source);
      if (isStandardSource) {
        setFormIncomeSource(item.source);
        setFormCustomSource('');
      } else {
        setFormIncomeSource('Lainnya');
        setFormCustomSource(item.source || '');
      }
      setFormIncomeAmount(String(item.amount));
      setFormIncomeDate(item.income_date ? parseISO(item.income_date) : new Date());
      setFormIncomeNotes(item.notes || '');
    }
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    
    if (modalType === 'expense') {
      if (!formAmount || Number(formAmount) <= 0) {
        alert('Jumlah pengeluaran harus lebih besar dari 0');
        return;
      }
      const payload = {
        category: formCategory,
        amount: Number(formAmount),
        expense_date: format(formDate, 'yyyy-MM-dd'),
        store_id: formCategory === 'iklan' ? formStoreId : null,
        notes: formNotes,
      };

      try {
        if (editingItem) {
          await apiCall(api.put(`/api/expenses/${editingItem.id}`, payload), {
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
        fetchData();
        fetchSaldo();
      } catch (err) {
        toastApiError(err);
      }
    } else {
      if (!formIncomeAmount || Number(formIncomeAmount) <= 0) {
        alert('Jumlah pemasukan harus lebih besar dari 0');
        return;
      }
      const sourceVal = formIncomeCategory === 'hasil_penjualan'
        ? (formIncomeSource === 'Lainnya' ? formCustomSource : formIncomeSource)
        : null;

      const payload = {
        category: formIncomeCategory,
        source: sourceVal,
        amount: Number(formIncomeAmount),
        income_date: format(formIncomeDate, 'yyyy-MM-dd'),
        notes: formIncomeNotes,
      };

      try {
        if (editingItem) {
          await apiCall(api.put(`/api/incomes/${editingItem.id}`, payload), {
            success: 'Pemasukan berhasil diubah',
            loading: 'Menyimpan…',
          });
        } else {
          await apiCall(api.post('/api/incomes', payload), {
            success: 'Pemasukan berhasil ditambahkan',
            loading: 'Menyimpan…',
          });
        }
        setModalOpen(false);
        fetchData();
        fetchSaldo();
      } catch (err) {
        toastApiError(err);
      }
    }
  };

  const handleDelete = async (id) => {
    const isExpense = activeTab === 'expenses';
    const ok = await confirmAction({
      message: isExpense ? 'Hapus pengeluaran ini?' : 'Hapus pemasukan ini?',
      confirmLabel: 'Hapus',
    });
    if (!ok) return;

    try {
      if (isExpense) {
        await apiCall(api.delete(`/api/expenses/${id}`), {
          success: 'Pengeluaran dihapus',
          loading: 'Menghapus…',
        });
      } else {
        await apiCall(api.delete(`/api/incomes/${id}`), {
          success: 'Pemasukan dihapus',
          loading: 'Menghapus…',
        });
      }
      fetchData();
      fetchSaldo();
    } catch (err) {
      toastApiError(err);
    }
  };

  const handleExport = async () => {
    if (!dateFrom || !dateTo) {
      alert('Silakan pilih rentang tanggal (Dari Tanggal & Sampai Tanggal) terlebih dahulu.');
      return;
    }

    try {
      const fromStr = format(dateFrom, 'yyyy-MM-dd');
      const toStr = format(dateTo, 'yyyy-MM-dd');
      
      const { data: expRes } = await api.get('/api/expenses', {
        params: { date_from: fromStr, date_to: toStr, limit: 100000, page: 1 }
      });
      
      const { data: incRes } = await api.get('/api/incomes', {
        params: { date_from: fromStr, date_to: toStr, limit: 100000, page: 1 }
      });

      const expenseList = (expRes.data || []).map(item => ({
        'Tanggal': item.expense_date,
        'Kategori': CATEGORY_OPTIONS.find(o => o.value === item.category)?.label || item.category,
        'Toko': item.store_name || '-',
        'Jumlah (Rp)': Number(item.amount) || 0,
        'Catatan': item.notes || '-',
        'Pencatat': item.user_name || '-'
      }));

      const incomeList = (incRes.data || []).map(item => ({
        'Tanggal': item.income_date,
        'Kategori': INCOME_CATEGORY_OPTIONS.find(o => o.value === item.category)?.label || item.category,
        'Sumber / Channel': item.source || '-',
        'Jumlah (Rp)': Number(item.amount) || 0,
        'Catatan': item.notes || '-',
        'Pencatat': item.user_name || '-'
      }));

      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseList), 'Pengeluaran');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incomeList), 'Pemasukan');
      
      const fileName = `laporan-keuangan-${fromStr}-to-${toStr}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      const { toast } = await import('sonner');
      toast.success('Laporan berhasil diexport ke Excel');
    } catch (e) {
      toastApiError(e);
    }
  };

  const storeOptions = stores.map(s => ({ value: s.id, label: s.name }));
  const filteredCategoryOptions = activeTab === 'expenses' ? CATEGORY_OPTIONS : INCOME_CATEGORY_OPTIONS;

  return (
    <div>
      <div className="page-title-row">
        <h1 className="page-title flex items-center gap-2">
          <Wallet size={28} strokeWidth={2} className="icon-title" aria-hidden />
          Keuangan &amp; Kas
        </h1>
        {isOwnerOrAdmin && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost border-slate-300 border bg-white" onClick={handleExport}>
              Export Excel
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleOpenCreateIncome}>
              <Plus size={18} strokeWidth={2} aria-hidden />
              Tambah Pemasukan
            </button>
            <button type="button" className="btn btn-primary" onClick={handleOpenCreateExpense}>
              <Plus size={18} strokeWidth={2} aria-hidden />
              Tambah Pengeluaran
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4">
        <button
          className={`py-2 px-4 font-semibold text-sm border-b-2 transition-all ${
            activeTab === 'expenses'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('expenses')}
        >
          Pengeluaran (Expenses)
        </button>
        <button
          className={`py-2 px-4 font-semibold text-sm border-b-2 transition-all ${
            activeTab === 'incomes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('incomes')}
        >
          Pemasukan (Incomes)
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 mb-4 md:grid-cols-5">
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
          <span className="stat-label">Operasional Gudang</span>
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
        <div className="stat border-2 border-emerald-100 bg-emerald-50/20">
          <div className="stat-icon bg-emerald-50 text-emerald-600">
            <Coins size={20} strokeWidth={2} aria-hidden />
          </div>
          <span className="stat-label text-emerald-800 font-semibold">Saldo Mandiri</span>
          <strong className="text-emerald-700">{formatMoney(saldoMandiri)}</strong>
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
              options={filteredCategoryOptions}
              value={filteredCategoryOptions.find(o => o.value === categoryFilter) || null}
              onChange={(o) => setCategoryFilter(o?.value ?? null)}
              styles={selectStyles()}
            />
          </div>
          {activeTab === 'expenses' ? (
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
          ) : (
            <div>
              <label>Sumber / Channel</label>
              <Select
                isClearable
                placeholder="Semua Sumber"
                options={incomeSourceOptions}
                value={incomeSourceOptions.find(o => o.value === sourceFilter) || null}
                onChange={(o) => setSourceFilter(o?.value ?? null)}
                styles={selectStyles()}
              />
            </div>
          )}
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

      {/* Main Table */}
      <div className="card table-wrap">
        <table className="table-app">
          <thead>
            {activeTab === 'expenses' ? (
              <tr>
                <th>Tanggal</th>
                <th>Kategori</th>
                <th>Toko</th>
                <th>Jumlah</th>
                <th>Catatan</th>
                <th>Pencatat</th>
                {isOwnerOrAdmin && <th className="w-40">Aksi</th>}
              </tr>
            ) : (
              <tr>
                <th>Tanggal</th>
                <th>Kategori</th>
                <th>Sumber / Channel</th>
                <th>Jumlah</th>
                <th>Catatan</th>
                <th>Pencatat</th>
                {isOwnerOrAdmin && <th className="w-40">Aksi</th>}
              </tr>
            )}
          </thead>
          <tbody>
            {activeTab === 'expenses' ? (
              rows.map((exp) => (
                <tr key={exp.id}>
                  <td>{exp.expense_date ? format(parseISO(exp.expense_date), 'dd MMMM yyyy') : '-'}</td>
                  <td>
                    <span className={`badge ${
                      exp.category === 'operasional' ? 'badge-blue' : exp.category === 'iklan' ? 'badge-amber' : 'badge-slate'
                    }`}>
                      {CATEGORY_OPTIONS.find(o => o.value === exp.category)?.label || exp.category}
                    </span>
                  </td>
                  <td>{exp.store_name || '-'}</td>
                  <td className="font-semibold text-red-600 flex items-center gap-1">
                    <ArrowDownRight size={14} className="text-red-500" />
                    {formatMoney(exp.amount)}
                  </td>
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
              ))
            ) : (
              rows.map((inc) => (
                <tr key={inc.id}>
                  <td>{inc.income_date ? format(parseISO(inc.income_date), 'dd MMMM yyyy') : '-'}</td>
                  <td>
                    <span className={`badge ${
                      inc.category === 'hasil_penjualan' ? 'badge-green' : 'badge-purple'
                    }`}>
                      {INCOME_CATEGORY_OPTIONS.find(o => o.value === inc.category)?.label || inc.category}
                    </span>
                  </td>
                  <td>{inc.source || '-'}</td>
                  <td className="font-semibold text-emerald-600 flex items-center gap-1">
                    <ArrowUpRight size={14} className="text-emerald-500" />
                    {formatMoney(inc.amount)}
                  </td>
                  <td>{inc.notes || '-'}</td>
                  <td className="text-xs text-slate-500">{inc.user_name || '-'}</td>
                  {isOwnerOrAdmin && (
                    <td className="whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost min-h-9 px-2.5 text-xs"
                          onClick={() => handleOpenEdit(inc)}
                        >
                          <Pencil size={16} strokeWidth={2} aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger min-h-9 px-2.5 text-xs"
                          onClick={() => handleDelete(inc.id)}
                        >
                          <Trash2 size={16} strokeWidth={2} aria-hidden />
                          Hapus
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!rows.length && (
          <p className="muted p-4 text-center">
            {activeTab === 'expenses' ? 'Belum ada data pengeluaran' : 'Belum ada data pemasukan'}
          </p>
        )}
      </div>

      <PaginationBar page={page} total={total} limit={LIMIT} onPageChange={setPage} />

      {/* Form Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          modalType === 'expense'
            ? (editingItem ? 'Edit Pengeluaran' : 'Tambah Pengeluaran Baru')
            : (editingItem ? 'Edit Pemasukan' : 'Tambah Pemasukan Baru')
        }
      >
        <form onSubmit={handleSave}>
          <div className="space-y-4">
            {modalType === 'expense' ? (
              <>
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
                    placeholder="Beli ATK, refund barang kosong, belanja supplier..."
                    rows={3}
                    className="field-input w-full"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Kategori Pemasukan</label>
                  <Select
                    options={INCOME_CATEGORY_OPTIONS}
                    value={INCOME_CATEGORY_OPTIONS.find(o => o.value === formIncomeCategory)}
                    onChange={o => setFormIncomeCategory(o.value)}
                    styles={selectStyles()}
                  />
                </div>

                {formIncomeCategory === 'hasil_penjualan' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Sumber / Channel</label>
                      <Select
                        options={incomeSourceOptions}
                        value={incomeSourceOptions.find(o => o.value === formIncomeSource)}
                        onChange={o => setFormIncomeSource(o.value)}
                        styles={selectStyles()}
                      />
                    </div>

                    {formIncomeSource === 'Lainnya' && (
                      <div>
                        <label className="block text-sm font-medium mb-1">Nama Sumber Kustom</label>
                        <input
                          type="text"
                          required
                          value={formCustomSource}
                          onChange={e => setFormCustomSource(e.target.value)}
                          placeholder="Contoh: Shopee Pay, M-Banking, dll"
                          className="field-input w-full"
                        />
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Jumlah (Rp)</label>
                  <input
                    type="number"
                    required
                    value={formIncomeAmount}
                    onChange={e => setFormIncomeAmount(e.target.value)}
                    placeholder="Contoh: 1000000"
                    className="field-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Tanggal Pemasukan</label>
                  <DatePicker
                    selected={formIncomeDate}
                    onChange={d => setFormIncomeDate(d || new Date())}
                    dateFormat="dd/MM/yyyy"
                    required
                    className="field-input w-full"
                    wrapperClassName="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Catatan / Keterangan</label>
                  <textarea
                    value={formIncomeNotes}
                    onChange={e => setFormIncomeNotes(e.target.value)}
                    placeholder="Keterangan penambahan modal atau penarikan saldo..."
                    rows={3}
                    className="field-input w-full"
                  />
                </div>
              </>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary">
              Simpan
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
