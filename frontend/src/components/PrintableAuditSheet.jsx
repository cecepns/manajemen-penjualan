import { useState } from 'react';
import { Printer, X, Eye, FileText, Check } from 'lucide-react';
import Modal from './Modal.jsx';

export default function PrintableAuditSheet({
  open,
  onClose,
  session,
  items = [],
  showSystemStock: initialShowSystemStock = true,
}) {
  const [showSystemStock, setShowSystemStock] = useState(initialShowSystemStock);
  const [showDifference, setShowDifference] = useState(true);

  if (!session) return null;

  function handlePrint() {
    window.print();
  }

  const statusLabels = {
    in_progress: 'Sedang Dihitung',
    pending_approval: 'Menunggu Approval Owner',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    cancelled: 'Dibatalkan',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cetak Lembar Audit Fisik Gudang (Stock Opname)"
      size="3xl"
    >
      <div className="printable-audit-modal-content">
        {/* Toolbar Kontrol Cetak (Tidak ikut tercetak) */}
        <div className="no-print pb-4 mb-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl">
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                checked={showSystemStock}
                onChange={(e) => setShowSystemStock(e.target.checked)}
              />
              <span>Tampilkan Stok Sistem</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                checked={showDifference}
                onChange={(e) => setShowDifference(e.target.checked)}
              />
              <span>Tampilkan Kolom Selisih</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-md shadow-blue-600/20 font-bold"
              onClick={handlePrint}
            >
              <Printer size={16} />
              Cetak / Simpan PDF
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
            >
              <X size={16} />
              Tutup
            </button>
          </div>
        </div>

        {/* Dokumen Lembar Cetak */}
        <div className="audit-print-document bg-white p-4 sm:p-6 rounded-lg border border-slate-200 text-slate-900 font-sans text-xs">
          {/* Header Kop Lembar Audit */}
          <div className="border-b-2 border-slate-900 pb-3 mb-4 text-center print-avoid-break">
            <h1 className="text-lg sm:text-xl font-black uppercase tracking-wider text-slate-900 m-0">
              LEMBAR AUDIT FISIK STOK GUDANG (STOCK OPNAME)
            </h1>
            <p className="text-[11px] text-slate-600 mt-1 font-medium">
              Dokumen Pemeriksaan Fisik &amp; Rekonsiliasi Stok Barang Gudang
            </p>
          </div>

          {/* Tabel Metadata Sesi */}
          <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-300 print-avoid-break text-xs">
            <div className="space-y-1">
              <div className="flex gap-2">
                <span className="font-semibold w-28 text-slate-600">No. Sesi Audit:</span>
                <span className="font-mono font-bold text-slate-900">{session.session_code || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-semibold w-28 text-slate-600">Tanggal Audit:</span>
                <span className="font-medium text-slate-900">{session.audit_date || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-semibold w-28 text-slate-600">Status Sesi:</span>
                <span className="font-semibold text-slate-800">
                  {statusLabels[session.status] || session.status || '—'}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex gap-2">
                <span className="font-semibold w-28 text-slate-600">Dibuat Oleh:</span>
                <span className="font-medium text-slate-900">{session.created_by_name || 'Admin Gudang'}</span>
              </div>
              {session.approved_by_name && (
                <div className="flex gap-2">
                  <span className="font-semibold w-28 text-slate-600">Disetujui Oleh:</span>
                  <span className="font-medium text-slate-900">{session.approved_by_name}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="font-semibold w-28 text-slate-600">Total Produk:</span>
                <span className="font-bold text-slate-900">{items?.length || 0} barang</span>
              </div>
            </div>
          </div>

          {session.notes && (
            <div className="text-xs mb-4 p-2 bg-amber-50/70 border border-amber-300 rounded text-amber-900 print-avoid-break">
              <strong>Catatan Sesi:</strong> {session.notes}
            </div>
          )}

          {/* Tabel Cek Fisik Barang */}
          <table className="w-full text-xs border-collapse border border-slate-400 mb-6">
            <thead>
              <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-400">
                <th className="border border-slate-400 py-2 px-2 text-center w-8">No</th>
                <th className="border border-slate-400 py-2 px-2 text-left w-28 sm:w-32">Barcode / SKU</th>
                <th className="border border-slate-400 py-2 px-2 text-left">Nama Produk</th>
                {showSystemStock && (
                  <th className="border border-slate-400 py-2 px-2 text-center w-20">Stok Sistem</th>
                )}
                <th className="border border-slate-400 py-2 px-2 text-center w-24 bg-blue-50/40">
                  Hitungan Fisik (Pcs)
                </th>
                {showDifference && (
                  <th className="border border-slate-400 py-2 px-2 text-center w-18">Selisih</th>
                )}
                <th className="border border-slate-400 py-2 px-2 text-left w-36 sm:w-44">
                  Keterangan / Kondisi
                </th>
              </tr>
            </thead>
            <tbody>
              {items && items.length > 0 ? (
                items.map((it, idx) => {
                  const hasPhysical = it.physical_stock !== null && it.physical_stock !== undefined && it.physical_stock !== '';
                  const delta = it.delta_stock !== null && it.delta_stock !== undefined ? Number(it.delta_stock) : null;

                  return (
                    <tr key={it.id || it.product_id || idx} className="hover:bg-slate-50">
                      <td className="border border-slate-400 py-1.5 px-2 text-center font-medium">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-400 py-1.5 px-2 font-mono font-semibold text-slate-800 text-[11px]">
                        {it.product_barcode || '—'}
                      </td>
                      <td className="border border-slate-400 py-1.5 px-2 font-medium text-slate-900 leading-tight">
                        {it.product_name}
                      </td>
                      {showSystemStock && (
                        <td className="border border-slate-400 py-1.5 px-2 text-center font-bold text-slate-700">
                          {it.system_stock}
                        </td>
                      )}
                      <td className="border border-slate-400 py-1.5 px-2 text-center bg-blue-50/20 font-bold text-sm">
                        {hasPhysical ? it.physical_stock : ''}
                      </td>
                      {showDifference && (
                        <td className="border border-slate-400 py-1.5 px-2 text-center font-bold font-mono">
                          {delta !== null ? (delta > 0 ? `+${delta}` : delta) : '—'}
                        </td>
                      )}
                      <td className="border border-slate-400 py-1.5 px-2 text-slate-700 text-[11px] leading-tight">
                        {it.item_notes || ''}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={showSystemStock ? (showDifference ? 7 : 6) : (showDifference ? 6 : 5)} className="py-6 text-center text-slate-400 italic border border-slate-400">
                    Tidak ada produk dalam sesi audit ini
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Kolom Tanda Tangan */}
          <div className="grid grid-cols-3 gap-4 text-center text-xs pt-5 pb-2 border-t-2 border-slate-300 print-avoid-break">
            <div className="flex flex-col items-center justify-between min-h-[100px]">
              <p className="font-bold text-slate-800 text-[11px] sm:text-xs">Petugas Pemeriksa (Checker)</p>
              <div className="w-full max-w-[180px] border-t border-slate-400 pt-1 mt-14">
                <span className="font-bold text-slate-900 whitespace-nowrap block truncate text-[11px] sm:text-xs">
                  ( .................................... )
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-between min-h-[100px]">
              <p className="font-bold text-slate-800 text-[11px] sm:text-xs">Petugas Input (Admin)</p>
              <div className="w-full max-w-[180px] border-t border-slate-400 pt-1 mt-14">
                <span className="font-bold text-slate-900 whitespace-nowrap block truncate text-[11px] sm:text-xs">
                  ( {session.created_by_name || '....................................'} )
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-between min-h-[100px]">
              <p className="font-bold text-slate-800 text-[11px] sm:text-xs">Menyetujui (Owner / Ka. Gudang)</p>
              <div className="w-full max-w-[180px] border-t border-slate-400 pt-1 mt-14">
                <span className="font-bold text-slate-900 whitespace-nowrap block truncate text-[11px] sm:text-xs">
                  ( {session.approved_by_name || '....................................'} )
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @page {
          size: A4 portrait;
          margin: 10mm 10mm 12mm 10mm;
        }

        @media print {
          /* 1. Global Reset & Overflows */
          html, body {
            overflow: visible !important;
            height: auto !important;
            min-height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color: #000000 !important;
          }

          /* 2. Sembunyikan aplikasi utama dan modal backdrop/chrome */
          #root {
            display: none !important;
          }

          .no-print,
          button[aria-label="Tutup"],
          button,
          nav,
          header,
          aside {
            display: none !important;
          }

          /* 3. Reset Modal Containers */
          .fixed,
          [role="dialog"],
          .overflow-y-auto,
          .overscroll-contain {
            position: static !important;
            inset: auto !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }

          /* 4. Tampilkan Area Dokumen Cetak */
          .audit-print-document {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            background: #ffffff !important;
            box-shadow: none !important;
          }

          /* 5. Pagination & Page Break Rules */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }

          thead {
            display: table-header-group !important;
          }

          tbody {
            display: table-row-group !important;
          }

          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}} />
    </Modal>
  );
}

