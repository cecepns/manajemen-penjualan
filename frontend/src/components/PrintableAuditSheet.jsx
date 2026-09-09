import { Printer, X } from 'lucide-react';
import Modal from './Modal.jsx';

export default function PrintableAuditSheet({ open, onClose, session, items, showSystemStock = true }) {
  if (!session) return null;

  function handlePrint() {
    window.print();
  }

  return (
    <Modal open={open} onClose={onClose} title="Cetak Lembar Form Audit Fisik (Stock Opname)" maxWidth="max-w-4xl">
      <div>
        <div className="no-print flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
          <p className="text-xs text-slate-500">
            Gunakan tombol cetak di samping untuk mencetak lembar cek fisik ke printer atau simpan sebagai PDF.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm flex items-center gap-1.5" onClick={handlePrint}>
              <Printer size={16} />
              Cetak Sekarang
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              <X size={16} />
              Tutup
            </button>
          </div>
        </div>

        {/* Area yang akan dicetak */}
        <div className="print-area bg-white p-6 rounded-lg border border-slate-200 text-slate-900 font-sans">
          {/* Header Kop */}
          <div className="border-b-2 border-slate-800 pb-3 mb-4 text-center">
            <h1 className="text-xl font-bold uppercase tracking-wider text-slate-900">
              Lembar Stock Opname / Audit Fisik Gudang
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Dokumen pemeriksaan fisik persediaan barang gudang untuk rekonsiliasi stok
            </p>
          </div>

          {/* Info Sesi */}
          <div className="grid grid-cols-2 gap-4 text-xs mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <div className="flex gap-2 mb-1">
                <span className="font-semibold w-28 text-slate-600">No. Sesi Audit:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{session.session_code}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-semibold w-28 text-slate-600">Tanggal Audit:</span>
                <span className="font-medium text-slate-900">{session.audit_date}</span>
              </div>
            </div>
            <div>
              <div className="flex gap-2 mb-1">
                <span className="font-semibold w-28 text-slate-600">Dibuat Oleh:</span>
                <span className="font-medium text-slate-900">{session.created_by_name || 'Admin Gudang'}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-semibold w-28 text-slate-600">Total Produk:</span>
                <span className="font-bold text-slate-900">{items?.length || 0} barang</span>
              </div>
            </div>
          </div>

          {session.notes && (
            <div className="text-xs mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-amber-900">
              <strong>Catatan Sesi:</strong> {session.notes}
            </div>
          )}

          {/* Tabel Cek Fisik */}
          <table className="w-full text-xs border-collapse border border-slate-400 mb-6">
            <thead>
              <tr className="bg-slate-100 text-slate-800">
                <th className="border border-slate-400 py-2 px-2 text-center w-8">No</th>
                <th className="border border-slate-400 py-2 px-3 text-left w-36">Barcode</th>
                <th className="border border-slate-400 py-2 px-3 text-left">Nama Produk</th>
                {showSystemStock && (
                  <th className="border border-slate-400 py-2 px-2 text-center w-24">Stok Sistem</th>
                )}
                <th className="border border-slate-400 py-2 px-3 text-center w-28 bg-blue-50/50">
                  Hitungan Fisik (Pcs)
                </th>
                <th className="border border-slate-400 py-2 px-2 text-center w-20">Selisih</th>
                <th className="border border-slate-400 py-2 px-3 text-left w-40">Keterangan / Kondisi Fisik</th>
              </tr>
            </thead>
            <tbody>
              {items?.map((it, idx) => (
                <tr key={it.id || idx} className="h-10">
                  <td className="border border-slate-400 py-1.5 px-2 text-center">{idx + 1}</td>
                  <td className="border border-slate-400 py-1.5 px-3 font-mono font-semibold text-slate-800">
                    {it.product_barcode || '—'}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-3 font-medium text-slate-900">
                    {it.product_name}
                  </td>
                  {showSystemStock && (
                    <td className="border border-slate-400 py-1.5 px-2 text-center font-semibold text-slate-700">
                      {it.system_stock}
                    </td>
                  )}
                  <td className="border border-slate-400 py-1.5 px-3 text-center bg-blue-50/20 font-bold text-sm">
                    {it.physical_stock !== null && it.physical_stock !== undefined ? it.physical_stock : ''}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2 text-center font-bold">
                    {it.delta_stock !== null && it.delta_stock !== undefined ? (
                      it.delta_stock > 0 ? `+${it.delta_stock}` : it.delta_stock
                    ) : ''}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-3 text-slate-600">
                    {it.item_notes || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Kolom Tanda Tangan */}
          <div className="grid grid-cols-3 gap-4 text-center text-xs pt-4 border-t border-slate-300">
            <div>
              <p className="font-semibold text-slate-700">Pemeriksa Fisik (Checker)</p>
              <div className="h-16"></div>
              <p className="font-bold border-t border-slate-400 inline-block px-6 pt-1 text-slate-900">
                ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Penerima & Input (Admin)</p>
              <div className="h-16"></div>
              <p className="font-bold border-t border-slate-400 inline-block px-6 pt-1 text-slate-900">
                ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Menyetujui (Owner)</p>
              <div className="h-16"></div>
              <p className="font-bold border-t border-slate-400 inline-block px-6 pt-1 text-slate-900">
                ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )
              </p>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />
    </Modal>
  );
}
