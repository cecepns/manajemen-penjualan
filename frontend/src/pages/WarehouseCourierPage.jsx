import { useEffect, useRef, useState, useCallback } from 'react';
import { Truck, Volume2, VolumeX, Settings, CheckCircle2, PackageCheck } from 'lucide-react';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  playCourierSound,
  matchCourierPrefix,
  setScanMuted,
  getScanMuted,
} from '../utils/soundHelper.js';
import CourierSettingsModal from '../components/CourierSettingsModal.jsx';

export default function WarehouseCourierPage() {
  const { isOwner, user } = useAuth();
  const [code, setCode] = useState('');
  const [lastOk, setLastOk] = useState(null);
  const [lastCourier, setLastCourier] = useState(null);
  const [isMuted, setIsMutedState] = useState(getScanMuted);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefixes, setPrefixes] = useState([]);
  const inputRef = useRef(null);

  const fetchPrefixes = useCallback(async () => {
    try {
      const { data } = await api.get('/api/courier-settings');
      setPrefixes(Array.isArray(data?.data) ? data.data : []);
    } catch {
      // fallback jika gagal load
    }
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    fetchPrefixes().catch(() => {});
  }, [fetchPrefixes]);

  function toggleMute() {
    const next = !isMuted;
    setIsMutedState(next);
    setScanMuted(next);
  }

  async function submit() {
    const c = code.trim();
    if (!c) return;
    setLastOk(null);
    setLastCourier(null);

    // Pre-match lokal untuk kesiapan instan
    const localMatch = matchCourierPrefix(c, prefixes);

    try {
      const res = await apiCall(api.post('/api/orders/mark-dikirim', { code: c }), {
        success: (data) => data?.data?.message || 'Status Dikirim',
        loading: 'Memproses…',
      });
      const d = res?.data;

      const courierInfo = d?.courier || localMatch;
      setLastCourier(courierInfo);

      // Putar suara ekspedisi yang terdeteksi
      if (courierInfo?.sound_file) {
        playCourierSound(courierInfo.sound_file);
      }

      setLastOk({
        order_no: d?.order_no || 'Berhasil',
        resi: d?.resi || c,
        line_count: d?.line_count ?? 0,
        message: d?.message || 'Dikirim',
        courier: courierInfo,
      });

      setCode('');
      inputRef.current?.focus();
    } catch (e) {
      toastApiError(e);
      inputRef.current?.focus();
    }
  }

  const canManage = isOwner || user?.role === 'admin';

  return (
    <div>
      <div className="page-title-row flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title flex items-center gap-2">
          <Truck size={28} strokeWidth={2} className="icon-title" aria-hidden />
          Kurir gudang
        </h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`btn btn-sm flex items-center gap-1.5 ${
              isMuted ? 'bg-slate-100 text-slate-600 border border-slate-300' : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}
            onClick={toggleMute}
            title={isMuted ? 'Suara di-mute (Klik untuk aktifkan)' : 'Suara aktif (Klik untuk mute)'}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} className="text-blue-600" />}
            <span className="text-xs font-semibold">{isMuted ? 'Suara: OFF' : 'Suara: ON'}</span>
          </button>

          {canManage && (
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={16} />
              <span className="text-xs font-semibold">Pengaturan Prefix & Suara</span>
            </button>
          )}
        </div>
      </div>

      <div className="card max-w-xl space-y-4">
        <p className="muted text-sm leading-relaxed">
          Scan barcode <strong>no. pesanan</strong> atau <strong>no. resi</strong>, atau ketik manual lalu Enter /
          klik tandai. Suara konfirmasi ekspedisi akan otomatis berbunyi sesuai awalan resi yang discan.
        </p>

        {/* Input Barcode */}
        <div className="space-y-1.5">
          <label htmlFor="courier-code" className="font-semibold text-slate-800 text-sm">
            Scan No. Pesanan atau Resi
          </label>
          <div className="relative">
            <input
              id="courier-code"
              ref={inputRef}
              className="w-full text-lg py-3 px-4 font-mono font-bold tracking-wide border-2 border-blue-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 rounded-xl transition"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Arahkan scanner barcode ke sini…"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn btn-primary px-6 py-2.5 font-semibold text-base shadow-lg shadow-blue-600/20"
            onClick={() => void submit()}
          >
            Tandai Dikirim
          </button>

          {prefixes.length > 0 && (
            <span className="text-xs text-slate-500">
              {prefixes.filter((p) => p.is_active).length} ekspedisi aktif terpantau
            </span>
          )}
        </div>

        {/* Status Box Hasil Scan */}
        {lastOk && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-950 font-bold text-base">
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                <span>Pesanan {lastOk.order_no}</span>
              </div>
              {lastCourier ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-sm">
                  <Volume2 size={13} />
                  {lastCourier.name || lastCourier.courier_name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-200 text-emerald-900">
                  <PackageCheck size={14} />
                  Dikirim
                </span>
              )}
            </div>

            <div className="text-xs text-emerald-800 space-y-0.5 pl-7">
              <div>
                <strong>Resi:</strong> <span className="font-mono">{lastOk.resi}</span>
              </div>
              <div>
                <strong>Total baris:</strong> {lastOk.line_count} baris
              </div>
              {lastCourier?.sound_file && (
                <div className="text-emerald-700 flex items-center gap-1 mt-1">
                  <span>Suara:</span>
                  <button
                    type="button"
                    className="underline hover:text-emerald-950 font-medium"
                    onClick={() => playCourierSound(lastCourier.sound_file)}
                  >
                    Putar Ulang ({lastCourier.sound_file})
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Pengaturan Prefix */}
      <CourierSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefixes={prefixes}
        onRefresh={fetchPrefixes}
      />
    </div>
  );
}
