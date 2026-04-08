import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Save, Search, Trash2 } from 'lucide-react';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';

const SEARCH_LIMIT = 20;

function formatMoney(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function StockAuditPage() {
  const [auditDate, setAuditDate] = useState(todayIsoDate);
  const [searchInput, setSearchInput] = useState('');
  const searchDebounced = useDebouncedValue(searchInput, 400);
  const [hits, setHits] = useState([]);
  const [hitsLoading, setHitsLoading] = useState(false);
  /** @type {Array<{ product: object, baseline: number, newQty: string }>} */
  const [lines, setLines] = useState([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchHits = useCallback(async (q) => {
    setHitsLoading(true);
    try {
      const { data } = await api.get('/api/products', {
        params: { page: 1, limit: SEARCH_LIMIT, search: q },
      });
      setHits(Array.isArray(data?.data) ? data.data : []);
    } catch (e) {
      toastApiError(e);
      setHits([]);
    } finally {
      setHitsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHits(searchDebounced).catch(() => {});
  }, [searchDebounced, fetchHits]);

  const selectedIds = useMemo(() => new Set(lines.map((l) => l.product.id)), [lines]);

  function addProduct(p) {
    if (selectedIds.has(p.id)) return;
    const baseline = Number(p.stock) || 0;
    setLines((prev) => [...prev, { product: p, baseline, newQty: String(baseline) }]);
  }

  function removeLine(productId) {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }

  function setLineQty(productId, v) {
    setLines((prev) =>
      prev.map((l) => (l.product.id === productId ? { ...l, newQty: v } : l))
    );
  }

  const summary = useMemo(() => {
    let deltaSum = 0;
    let changed = 0;
    for (const l of lines) {
      const next = Math.max(0, Math.floor(Number(l.newQty) || 0));
      const d = next - l.baseline;
      if (d !== 0) {
        changed += 1;
        deltaSum += d;
      }
    }
    return { itemCount: lines.length, deltaSum, changed };
  }, [lines]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!lines.length) {
      const { toast } = await import('sonner');
      toast.error('Tambah minimal satu produk');
      return;
    }
    const items = lines.map((l) => ({
      product_id: l.product.id,
      new_qty: Math.max(0, Math.floor(Number(l.newQty) || 0)),
    }));
    if (!summary.changed) {
      const { toast } = await import('sonner');
      toast.error('Ubah stok baru salah satu produk dulu');
      return;
    }
    setSaving(true);
    try {
      await apiCall(
        api.post('/api/stock-audit', {
          items,
          notes: sessionNotes.trim() || null,
          audit_date: auditDate,
        }),
        {
          success: 'Audit stok tersimpan',
          loading: 'Menyimpan…',
        }
      );
      setLines([]);
      setSessionNotes('');
      setAuditDate(todayIsoDate());
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  }

  const visibleHits = hits.filter((p) => !selectedIds.has(p.id));

  return (
    <div>
      <div className="page-title-row flex flex-wrap items-start gap-3">
        <h1 className="page-title flex flex-1 flex-wrap items-center gap-3">
          <ClipboardList size={28} strokeWidth={2} className="icon-title" aria-hidden />
          Stok audit
          <span className="flex items-center gap-2 text-sm font-normal text-slate-600">
            <span className="whitespace-nowrap">Tanggal</span>
            <input
              type="date"
              className="!w-auto min-w-[9.5rem]"
              value={auditDate}
              onChange={(e) => setAuditDate(e.target.value)}
            />
          </span>
        </h1>
        <button
          type="submit"
          form="stock-audit-form"
          className="btn btn-primary"
          disabled={saving || !summary.changed}
        >
          <Save size={18} strokeWidth={2} aria-hidden />
          Simpan
        </button>
      </div>

      <form id="stock-audit-form" onSubmit={onSubmit}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card flex min-h-[320px] flex-col">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Pilih barang</h2>
            <div className="relative mb-3">
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
                placeholder="Cari dari nama / barcode"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80">
              {hitsLoading && <p className="muted p-3 text-sm">Memuat…</p>}
              {!hitsLoading && !visibleHits.length && (
                <p className="muted p-3 text-sm">
                  {hits.length && selectedIds.size ? 'Semua hasil sudah dipilih' : 'Tidak ada produk'}
                </p>
              )}
              <ul className="divide-y divide-slate-100">
                {visibleHits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 p-3 text-left transition hover:bg-white"
                      onClick={() => addProduct(p)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-snug text-slate-900">{p.name}</div>
                        <div className="muted text-xs">
                          {formatMoney(p.hpp)}
                          {p.barcode ? ` · ${p.barcode}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tabular-nums font-semibold text-slate-800">{p.stock}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <p className="muted mt-2 text-xs">Menampilkan hingga {SEARCH_LIMIT} produk per pencarian.</p>
          </div>

          <div className="card flex min-h-[320px] flex-col">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Ringkasan audit</h2>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-100">
              {!lines.length && <p className="muted p-3 text-sm">Belum ada barang — pilih dari kiri.</p>}
              <ul className="divide-y divide-slate-100">
                {lines.map((l) => {
                  const p = l.product;
                  const next = Math.max(0, Math.floor(Number(l.newQty) || 0));
                  const delta = next - l.baseline;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-snug text-slate-900">{p.name}</div>
                        <div className="muted text-xs">
                          {formatMoney(p.hpp)}
                          {p.barcode ? ` · ${p.barcode}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right text-xs text-slate-500">
                          <div>Asli {l.baseline}</div>
                          {delta !== 0 && (
                            <div className={delta > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                              {delta > 0 ? `+${delta}` : delta}
                            </div>
                          )}
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="w-24 tabular-nums"
                          value={l.newQty}
                          onChange={(e) => setLineQty(p.id, e.target.value)}
                          aria-label={`Stok baru ${p.name}`}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon min-h-9 w-9 text-red-600"
                          onClick={() => removeLine(p.id)}
                          aria-label={`Hapus ${p.name}`}
                        >
                          <Trash2 size={16} strokeWidth={2} aria-hidden />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700">
              <div className="flex justify-between gap-2">
                <span className="muted">Jumlah barang</span>
                <span className="font-medium tabular-nums">{summary.itemCount}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="muted">Total selisih stok</span>
                <span
                  className={`font-medium tabular-nums ${summary.deltaSum > 0 ? 'text-emerald-600' : summary.deltaSum < 0 ? 'text-red-600' : ''}`}
                >
                  {summary.deltaSum > 0 ? `+${summary.deltaSum}` : summary.deltaSum}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card mt-4">
          <label>Catatan</label>
          <textarea
            rows={3}
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder="Tambahkan catatan (selisih fisik, barang cacat, koreksi salah input, …)"
          />
        </div>
      </form>
    </div>
  );
}
