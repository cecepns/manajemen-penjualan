import { useEffect, useState } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale/id';
import { CalendarRange, ClipboardList, Coins, LayoutDashboard, Package, PiggyBank, Store, TrendingUp, Wallet } from 'lucide-react';
import Select from 'react-select';
import { api, toastApiError } from '../utils/api.js';
import { selectStyles } from '../components/selectTheme.js';

registerLocale('id', localeId);

function formatMoney(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export default function DashboardPage() {
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(null);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [dash, setDash] = useState(null);

  useEffect(() => {
    api
      .get('/api/stores/all')
      .then(({ data }) => setStores(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (storeId) params.set('store_id', storeId);
    if (dateFrom) params.set('date_from', format(dateFrom, 'yyyy-MM-dd'));
    if (dateTo) params.set('date_to', format(dateTo, 'yyyy-MM-dd'));
    api
      .get(`/api/dashboard?${params}`)
      .then(({ data }) => setDash(data))
      .catch((e) => toastApiError(e));
  }, [storeId, dateFrom, dateTo]);

  const storeOptions = stores.map((s) => ({ value: s.id, label: s.name }));

  return (
    <div>
      <div className="page-title-row">
        <h1 className="page-title flex items-center gap-2">
          <LayoutDashboard size={28} strokeWidth={2} className="icon-title" aria-hidden />
          Dashboard
        </h1>
      </div>

      <div className="card mb-4">
        <div className="mb-2.5 flex items-center gap-2">
          <CalendarRange size={18} strokeWidth={2} className="text-slate-500" aria-hidden />
          <span className="text-sm font-semibold text-slate-900">Filter</span>
        </div>
        <div className="form-row cols-2">
          <div>
            <label>Toko</label>
            <Select
              isClearable
              placeholder="Semua toko"
              options={storeOptions}
              value={storeOptions.find((o) => o.value === storeId) || null}
              onChange={(o) => setStoreId(o?.value ?? null)}
              styles={selectStyles()}
            />
          </div>
          <div className="form-row cols-2">
            <div>
              <label htmlFor="dash-date-from">Dari tanggal</label>
              <DatePicker
                id="dash-date-from"
                locale="id"
                selected={dateFrom}
                onChange={(d) => setDateFrom(d)}
                dateFormat="dd/MM/yyyy"
                placeholderText="Pilih tanggal mulai"
                isClearable
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                maxDate={dateTo ?? undefined}
                className="field-input w-full"
                wrapperClassName="w-full"
                popperClassName="datepicker-popper-z"
                showPopperArrow={false}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="dash-date-to">Sampai tanggal</label>
              <DatePicker
                id="dash-date-to"
                locale="id"
                selected={dateTo}
                onChange={(d) => setDateTo(d)}
                dateFormat="dd/MM/yyyy"
                placeholderText="Pilih tanggal akhir"
                isClearable
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                minDate={dateFrom ?? undefined}
                className="field-input w-full"
                wrapperClassName="w-full"
                popperClassName="datepicker-popper-z"
                showPopperArrow={false}
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      </div>

      {dash && (
        <>
          {/* Inventory & Operational Stats */}
          <div className="grid grid-cols-1 gap-3 mb-4 md:grid-cols-4">
            <div className="stat">
              <div className="stat-icon bg-blue-50 text-blue-600">
                <ClipboardList size={20} strokeWidth={2} aria-hidden />
              </div>
              <span className="stat-label">Order belum cair</span>
              <strong>{dash.total_order_belum_cair}</strong>
            </div>
            <div className="stat">
              <div className="stat-icon bg-orange-50 text-orange-600">
                <PiggyBank size={20} strokeWidth={2} aria-hidden />
              </div>
              <span className="stat-label">Modal nyangkut</span>
              <strong>{formatMoney(dash.total_modal_nyangkut)}</strong>
            </div>
            <div className="stat">
              <div className="stat-icon bg-slate-50 text-slate-600">
                <PiggyBank size={20} strokeWidth={2} aria-hidden />
              </div>
              <span className="stat-label">Total modal stok</span>
              <strong>{formatMoney(dash.total_modal_stok)}</strong>
            </div>
            <div className="stat">
              <div className="stat-icon bg-indigo-50 text-indigo-600">
                <Package size={20} strokeWidth={2} aria-hidden />
              </div>
              <span className="stat-label">Total stok (qty)</span>
              <strong>{dash.total_stok_qty ?? 0}</strong>
            </div>
          </div>

          {/* Financial summary */}
          <div className="grid grid-cols-1 gap-3 mb-4 md:grid-cols-5">
            <div className="stat border-l-4 border-blue-500">
              <div className="stat-icon bg-blue-50 text-blue-600">
                <Coins size={20} strokeWidth={2} aria-hidden />
              </div>
              <span className="stat-label">Total Nominal Cair</span>
              <strong>{formatMoney(dash.total_nominal_cair)}</strong>
            </div>
            <div className="stat border-l-4 border-slate-500">
              <div className="stat-icon bg-slate-50 text-slate-600">
                <PiggyBank size={20} strokeWidth={2} aria-hidden />
              </div>
              <span className="stat-label">Modal Order (COGS)</span>
              <strong>{formatMoney(dash.total_modal_cair)}</strong>
            </div>
            <div className="stat border-l-4 border-amber-500">
              <div className="stat-icon bg-amber-50 text-amber-600">
                <TrendingUp size={20} strokeWidth={2} aria-hidden />
              </div>
              <span className="stat-label">Laba Kotor</span>
              <strong>{formatMoney(dash.laba_kotor)}</strong>
            </div>
            <div className="stat border-l-4 border-red-500">
              <div className="stat-icon bg-red-50 text-red-600">
                <Wallet size={20} strokeWidth={2} aria-hidden />
              </div>
              <span className="stat-label">Total Pengeluaran</span>
              <strong className="text-red-600">{formatMoney(dash.total_expenses)}</strong>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                Ops: {formatMoney(dash.total_expenses_operasional)} | Ads: {formatMoney(dash.total_expenses_iklan)}
              </div>
            </div>
            <div className="stat border-l-4 border-green-500 bg-green-50/20">
              <div className="stat-icon bg-green-50 text-green-600">
                <Coins size={20} strokeWidth={2} aria-hidden />
              </div>
              <span className="stat-label font-bold text-green-800">Laba Bersih</span>
              <strong className="text-green-700">{formatMoney(dash.laba_bersih)}</strong>
            </div>
          </div>

          <div className="card mb-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
              <TrendingUp size={18} strokeWidth={2} aria-hidden />
              Top 5 produk paling sering keluar
            </h2>
            <div className="table-wrap">
              <table className="table-app">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>Qty keluar</th>
                  </tr>
                </thead>
                <tbody>
                  {(dash.top_produk_keluar || []).map((p, i) => (
                    <tr key={`${p.product_name}-${i}`}>
                      <td>{p.product_name}</td>
                      <td>{p.total_keluar}</td>
                    </tr>
                  ))}
                  {!dash.top_produk_keluar?.length && (
                    <tr>
                      <td colSpan={2} className="muted">
                        Belum ada data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
              <Store size={18} strokeWidth={2} aria-hidden />
              Per toko
            </h2>
            <div className="table-wrap">
              <table className="table-app">
                <thead>
                  <tr>
                    <th>Toko</th>
                    <th>Total cair</th>
                    <th>Modal belum cair</th>
                    <th>Laba Kotor</th>
                    <th>Biaya Iklan (Ads)</th>
                    <th>Laba Bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.per_toko.map((t) => (
                    <tr key={t.store_id}>
                      <td>{t.name}</td>
                      <td>{formatMoney(t.total_penjualan_cair)}</td>
                      <td>{formatMoney(t.modal_belum_cair)}</td>
                      <td className="font-semibold text-slate-800">{formatMoney(t.laba_kotor)}</td>
                      <td className="text-red-600">{formatMoney(t.total_expense)}</td>
                      <td className="font-semibold text-green-600">{formatMoney(t.laba_bersih)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
