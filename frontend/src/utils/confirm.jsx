import { toast } from 'sonner';
import { Trash2, X } from 'lucide-react';

/**
 * Konfirmasi hapus/aksi berbahaya memakai Sonner (aksi di toast).
 * @returns {Promise<boolean>}
 */
export function confirmAction({
  message = 'Yakin?',
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  duration = 12000,
}) {
  return new Promise((resolve) => {
    toast.custom(
      (t) => (
        <div className="min-w-[280px] rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-xl shadow-slate-900/10">
          <div className="mb-3 leading-snug">{message}</div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost min-h-[38px] px-3.5 text-[13px]"
              onClick={() => {
                toast.dismiss(t);
                resolve(false);
              }}
            >
              <X size={16} strokeWidth={2} aria-hidden />
              {cancelLabel}
            </button>
            <button
              type="button"
              className="btn btn-danger min-h-[38px] px-3.5 text-[13px]"
              onClick={() => {
                toast.dismiss(t);
                resolve(true);
              }}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden />
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      { duration }
    );
  });
}
