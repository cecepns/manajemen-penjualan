import { useEffect, useState, useMemo } from 'react';
import {
  CheckCircle,
  XCircle,
  Printer,
  Save,
  AlertTriangle,
  Lock,
  Calendar,
  User,
  CheckCircle2,
  Ban,
  Clock,
  Send,
} from 'lucide-react';
import Modal from './Modal.jsx';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PrintableAuditSheet from './PrintableAuditSheet.jsx';

function formatMoney(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

export default function AuditDetailModal({ open, onClose, sessionId, onRefresh }) {
  const { isOwner } = useAuth();
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [notes, setNotes] = useState({});
  const [sessionNotes, setSessionNotes] = useState('');
  const [savingCounts, setSavingCounts] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    if (!open || !sessionId) return;
    fetchDetail();
  }, [open, sessionId]);

  async function fetchDetail() {
    setLoading(true);
    setShowRejectForm(false);
    setRejectReason('');
    try {
      const { data } = await api.get(`/api/stock-audit-sessions/${sessionId}`);
      setSession(data.session);
      setItems(data.items || []);
      setSessionNotes(data.session?.notes || '');

      const initialCounts = {};
      const initialNotes = {};
      for (const it of data.items || []) {
        initialCounts[it.product_id] =
          it.physical_stock !== null && it.physical_stock !== undefined
            ? String(it.physical_stock)
            : '';
        initialNotes[it.product_id] = it.item_notes || '';
      }
      setCounts(initialCounts);
      setNotes(initialNotes);
    } catch (e) {
      toastApiError(e);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  function handleCountChange(productId, val) {
    setCounts((prev) => ({ ...prev, [productId]: val }));
  }

  function handleNoteChange(productId, val) {
    setNotes((prev) => ({ ...prev, [productId]: val }));
  }

  function fillAllMatchingSystem() {
    const updated = { ...counts };
    for (const it of items) {
      if (updated[it.product_id] === '' || updated[it.product_id] === undefined) {
        updated[it.product_id] = String(it.system_stock);
      }
    }
    setCounts(updated);
  }

  const summary = useMemo(() => {
    let totalItems = items.length;
    let filledCount = 0;
    let totalDeltaUnits = 0;
    let totalDeltaHpp = 0;
    let discrepancyCount = 0;

    for (const it of items) {
      const val = counts[it.product_id];
      if (val !== '' && val !== undefined && val !== null) {
        filledCount++;
        const num = Math.max(0, Math.floor(Number(val) || 0));
        const delta = num - Number(it.system_stock);
        totalDeltaUnits += delta;
        totalDeltaHpp += delta * Number(it.product_hpp || 0);
        if (delta !== 0) discrepancyCount++;
      }
    }

    return { totalItems, filledCount, totalDeltaUnits, totalDeltaHpp, discrepancyCount };
  }, [items, counts]);

  async function handleSaveCounts(e) {
    e.preventDefault();
    if (summary.filledCount === 0) {
      alert('Isi minimal satu hitungan stok fisik sebelum menyimpan');
      return;
    }
    setSavingCounts(true);
    try {
      const payloadItems = items.map((it) => ({
        product_id: it.product_id,
        physical_stock: counts[it.product_id] !== '' && counts[it.product_id] !== undefined
          ? Math.max(0, Math.floor(Number(counts[it.product_id]) || 0))
          : null,
        item_notes: notes[it.product_id] || null,
      }));

      await apiCall(
        api.put(`/api/stock-audit-sessions/${sessionId}/physical-counts`, {
          items: payloadItems,
          notes: sessionNotes,
        }),
        {
          success: 'Hitungan fisik tersimpan. Sesi diajukan ke Owner untuk Approval.',
          loading: 'Menyimpan hitungan fisik…',
        }
      );
      await fetchDetail();
      onRefresh?.();
    } catch (err) {
      toastApiError(err);
    } finally {
      setSavingCounts(false);
    }
  }

  async function handleApprove() {
    if (!window.confirm(`Setujui penyesuaian stok untuk sesi ${session?.session_code}? Stok produk akan disesuaikan dengan hitungan fisik.`)) {
      return;
    }
    setApproving(true);
    try {
      await apiCall(api.post(`/api/stock-audit-sessions/${sessionId}/approve`), {
        success: 'Sesi audit disetujui. Stok produk berhasil disesuaikan & kunci transaksi dilepas!',
        loading: 'Menyetujui & menyesuaikan stok…',
      });
      await fetchDetail();
      onRefresh?.();
    } catch (err) {
      toastApiError(err);
    } finally {
      setApproving(false);
    }
  }

  async function handleReject(e) {
    e.preventDefault();
    setRejecting(true);
    try {
      await apiCall(
        api.post(`/api/stock-audit-sessions/${sessionId}/reject`, {
          reason: rejectReason.trim() || 'Ditolak oleh Owner',
        }),
        {
          success: 'Sesi audit ditolak. Kunci transaksi produk dilepas.',
          loading: 'Memproses penolakan…',
        }
      );
      await fetchDetail();
      onRefresh?.();
    } catch (err) {
      toastApiError(err);
    } finally {
      setRejecting(false);
    }
  }

  async function handleCancelSession() {
    if (!window.confirm(`Batalkan sesi audit ${session?.session_code}? Kunci transaksi produk akan dilepas tanpa perubahan stok.`)) {
      return;
    }
    try {
      await apiCall(api.delete(`/api/stock-audit-sessions/${sessionId}`), {
        success: 'Sesi audit dibatalkan. Kunci transaksi dilepas.',
        loading: 'Membatalkan sesi…',
      });
      await fetchDetail();
      onRefresh?.();
    } catch (err) {
      toastApiError(err);
    }
  }

  const isEditable = session?.status === 'in_progress' || session?.status === 'pending_approval';
  const isApproved = session?.status === 'approved';
  const isRejected = session?.status === 'rejected';
  const isCancelled = session?.status === 'cancelled';

  return (
    <Modal open={open} onClose={onClose} title={`Sesi Audit: ${session?.session_code || '...'}`} maxWidth="max-w-5xl">
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm">Memuat detail sesi audit…</div>
      ) : session ? (
        <div className="space-y-4">
          {/* Header Info & Status */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-base text-slate-900">{session.session_code}</span>
                {session.status === 'in_progress' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                    <Clock size={13} />
                    Sedang Dihitung Fisik
                  </span>
                )}
                {session.status === 'pending_approval' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300 animate-pulse">
                    <AlertTriangle size={13} />
                    Menunggu Approval Owner
                  </span>
                )}
                {session.status === 'approved' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 size={13} />
                    Disetujui &amp; Stok Disesuaikan
                  </span>
                )}
                {session.status === 'rejected' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                    <XCircle size={13} />
                    Ditolak Owner
                  </span>
                )}
                {session.status === 'cancelled' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                    <Ban size={13} />
                    Dibatalkan
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar size={13} /> {session.audit_date}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <User size={13} /> Dibuat oleh: {session.created_by_name || 'Admin'}
                </span>
                {session.approved_by_name && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      Disetujui: {session.approved_by_name} ({session.approved_at?.slice(0, 16)})
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm flex items-center gap-1.5"
                onClick={() => setPrintOpen(true)}
              >
                <Printer size={15} />
                Cetak Form Fisik
              </button>
              {isEditable && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-red-600 hover:bg-red-50 text-xs"
                  onClick={handleCancelSession}
                >
                  Batalkan Sesi
                </button>
              )}
            </div>
          </div>

          {/* Banner Audit Lock Status */}
          {isEditable && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              <Lock size={18} className="text-amber-600 shrink-0" />
              <div>
                <strong>Proteksi Transaksi Aktif:</strong> Produk dalam sesi ini{' '}
                <span className="font-semibold underline">terkunci sementara</span> dari transaksi order &amp; stok masuk
                sampai Owner menyetujui atau membatalkan sesi audit ini.
              </div>
            </div>
          )}

          {isRejected && session.rejection_reason && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
              <strong>Alasan Penolakan:</strong> {session.rejection_reason}
            </div>
          )}

          {/* Ringkasan Perhitungan Selisih */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-3 text-center bg-slate-50/70 border border-slate-200">
              <span className="text-xs text-slate-500">Total Produk</span>
              <div className="text-lg font-bold text-slate-800">{summary.totalItems} item</div>
              <span className="text-[10px] text-slate-400">{summary.filledCount} sudah dihitung</span>
            </div>
            <div className="card p-3 text-center bg-slate-50/70 border border-slate-200">
              <span className="text-xs text-slate-500">Produk Selisih</span>
              <div className={`text-lg font-bold ${summary.discrepancyCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                {summary.discrepancyCount} item
              </div>
              <span className="text-[10px] text-slate-400">fisik ≠ sistem</span>
            </div>
            <div className="card p-3 text-center bg-slate-50/70 border border-slate-200">
              <span className="text-xs text-slate-500">Selisih Unit</span>
              <div
                className={`text-lg font-bold ${
                  summary.totalDeltaUnits > 0
                    ? 'text-emerald-600'
                    : summary.totalDeltaUnits < 0
                    ? 'text-red-600'
                    : 'text-slate-800'
                }`}
              >
                {summary.totalDeltaUnits > 0 ? `+${summary.totalDeltaUnits}` : summary.totalDeltaUnits} pcs
              </div>
              <span className="text-[10px] text-slate-400">akumulasi delta</span>
            </div>
            <div className="card p-3 text-center bg-slate-50/70 border border-slate-200">
              <span className="text-xs text-slate-500">Estimasi Nilai HPP Selisih</span>
              <div
                className={`text-sm font-bold mt-1 ${
                  summary.totalDeltaHpp > 0
                    ? 'text-emerald-600'
                    : summary.totalDeltaHpp < 0
                    ? 'text-red-600'
                    : 'text-slate-800'
                }`}
              >
                {formatMoney(summary.totalDeltaHpp)}
              </div>
              <span className="text-[10px] text-slate-400">dampak keuangan</span>
            </div>
          </div>

          {/* Form / Tabel Input Hitungan Fisik */}
          <form onSubmit={handleSaveCounts} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                Daftar Barang &amp; Hitungan Fisik
              </h3>
              {isEditable && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline font-medium"
                  onClick={fillAllMatchingSystem}
                >
                  Isi Otomatis Sesuai Stok Sistem
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-96 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase z-10">
                  <tr>
                    <th className="py-2.5 px-3">Produk</th>
                    <th className="py-2.5 px-3 text-center w-28">Stok Sistem</th>
                    <th className="py-2.5 px-3 text-center w-36">Hitungan Fisik</th>
                    <th className="py-2.5 px-3 text-center w-28">Selisih</th>
                    <th className="py-2.5 px-3 w-48">Keterangan / Kondisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it) => {
                    const val = counts[it.product_id];
                    const num = val !== '' && val !== undefined ? Math.max(0, Math.floor(Number(val) || 0)) : null;
                    const delta = num !== null ? num - Number(it.system_stock) : null;

                    return (
                      <tr key={it.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900">{it.product_name}</div>
                          <div className="text-xs text-slate-500">
                            {it.product_barcode ? `Barcode: ${it.product_barcode} • ` : ''}
                            HPP: {formatMoney(it.product_hpp)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                          {it.system_stock}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isEditable ? (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              required
                              placeholder="Ketik fisik…"
                              className="w-24 text-center font-bold font-mono py-1 px-2 border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white"
                              value={counts[it.product_id] ?? ''}
                              onChange={(e) => handleCountChange(it.product_id, e.target.value)}
                            />
                          ) : (
                            <span className="font-bold font-mono text-base text-slate-900">
                              {it.physical_stock !== null ? it.physical_stock : '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">
                          {delta !== null ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${
                                delta > 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : delta < 0
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {isEditable ? (
                            <input
                              type="text"
                              placeholder="Misal: ada rusak 1…"
                              className="w-full text-xs py-1 px-2 border rounded-lg bg-white"
                              value={notes[it.product_id] ?? ''}
                              onChange={(e) => handleNoteChange(it.product_id, e.target.value)}
                            />
                          ) : (
                            <span className="text-xs text-slate-600">{it.item_notes || '—'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {isEditable && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Catatan Sesi Audit (Opsional)</label>
                <textarea
                  rows={2}
                  className="w-full text-xs p-2.5 border rounded-lg bg-white"
                  placeholder="Contoh: Audit fisik rak A selesai, ada selisih di barang X karena barang rusak..."
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                />
              </div>
            )}

            {/* Action Bar for Admin / Staff: Save Counts */}
            {isEditable && (
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="submit"
                  className="btn btn-primary flex items-center gap-1.5 shadow-md shadow-blue-600/20"
                  disabled={savingCounts}
                >
                  <Send size={16} />
                  {savingCounts ? 'Menyimpan…' : 'Simpan Hitungan & Kirim ke Owner'}
                </button>
              </div>
            )}
          </form>

          {/* Section Khusus Owner: Review & Approval */}
          {isOwner && session.status === 'pending_approval' && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-sm text-blue-950 flex items-center gap-1.5">
                    <CheckCircle className="text-blue-600" size={18} />
                    Panel Persetujuan Owner (Approval)
                  </h4>
                  <p className="text-xs text-blue-800 mt-0.5">
                    Hitungan fisik telah diinput oleh admin. Menyetujui akan langsung memperbarui stok fisik di sistem dan melepas kunci transaksi produk.
                  </p>
                </div>
              </div>

              {!showRejectForm ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className="btn btn-primary bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 shadow"
                    onClick={handleApprove}
                    disabled={approving}
                  >
                    <CheckCircle2 size={17} />
                    {approving ? 'Memproses…' : 'Setujui Penyesuaian Stok (Approve)'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost text-red-600 hover:bg-red-50 border border-red-200 font-semibold flex items-center gap-1.5"
                    onClick={() => setShowRejectForm(true)}
                  >
                    <XCircle size={17} />
                    Tolak Audit Ini
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReject} className="space-y-2 p-3 bg-white rounded-lg border border-red-200">
                  <label className="text-xs font-semibold text-red-900">
                    Alasan Penolakan Audit:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Perlu hitung ulang, ada barang yang belum dicek di gudang 2"
                    className="w-full text-xs p-2 border border-red-300 rounded focus:ring-2 focus:ring-red-400"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="btn btn-primary bg-red-600 hover:bg-red-700 text-white btn-sm"
                      disabled={rejecting}
                    >
                      {rejecting ? 'Menolak…' : 'Konfirmasi Tolak Audit'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowRejectForm(false)}
                    >
                      Batal
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Tutup
            </button>
          </div>
        </div>
      ) : null}

      {/* Modal Cetak Format Fisik A4 */}
      <PrintableAuditSheet
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        session={session}
        items={items}
      />
    </Modal>
  );
}
