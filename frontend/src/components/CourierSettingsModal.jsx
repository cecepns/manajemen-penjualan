import { useState } from 'react';
import { Plus, Trash2, Volume2, Save, X, Settings2 } from 'lucide-react';
import Modal from './Modal.jsx';
import { api, apiCall, toastApiError } from '../utils/api.js';
import { AVAILABLE_SOUNDS, playCourierSound } from '../utils/soundHelper.js';

export default function CourierSettingsModal({ open, onClose, prefixes, onRefresh }) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    courier_name: '',
    prefix: '',
    sound_file: 'SPX.mpeg',
    is_active: 1,
    sort_order: 0,
  });
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  function startAdd() {
    setIsAdding(true);
    setEditingId(null);
    setForm({
      courier_name: '',
      prefix: '',
      sound_file: 'SPX.mpeg',
      is_active: 1,
      sort_order: (prefixes?.length || 0) + 1,
    });
  }

  function startEdit(item) {
    setIsAdding(false);
    setEditingId(item.id);
    setForm({
      courier_name: item.courier_name,
      prefix: item.prefix,
      sound_file: item.sound_file,
      is_active: item.is_active ? 1 : 0,
      sort_order: item.sort_order || 0,
    });
  }

  function cancelForm() {
    setIsAdding(false);
    setEditingId(null);
  }

  async function saveItem(e) {
    e.preventDefault();
    if (!form.courier_name.trim() || !form.prefix.trim()) {
      return;
    }
    setSaving(true);
    try {
      if (isAdding) {
        await apiCall(api.post('/api/courier-settings', form), {
          success: 'Prefix ekspedisi ditambahkan',
          loading: 'Menyimpan…',
        });
      } else if (editingId) {
        await apiCall(api.put(`/api/courier-settings/${editingId}`, form), {
          success: 'Prefix ekspedisi diperbarui',
          loading: 'Menyimpan…',
        });
      }
      cancelForm();
      onRefresh?.();
    } catch (err) {
      toastApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id, name) {
    if (!window.confirm(`Hapus pengaturan prefix untuk "${name}"?`)) return;
    try {
      await apiCall(api.delete(`/api/courier-settings/${id}`), {
        success: 'Pengaturan prefix dihapus',
        loading: 'Menghapus…',
      });
      onRefresh?.();
    } catch (err) {
      toastApiError(err);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Pengaturan Prefix Ekspedisi & Suara Scan" maxWidth="max-w-3xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 leading-relaxed">
          Atur prefix resi ekspedisi dan suara audio yang dibunyikan saat scanner membaca barcode kurir di gudang.
          Prefix yang lebih panjang (contoh: <code>JY1</code> untuk J&amp;T) otomatis diprioritaskan sebelum <code>JY</code> (JNE).
        </p>

        {/* Toolbar */}
        <div className="flex justify-between items-center pt-1 border-t border-slate-100">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Daftar Ekspedisi ({prefixes?.length || 0})
          </span>
          {!isAdding && !editingId && (
            <button
              type="button"
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              onClick={startAdd}
            >
              <Plus size={16} strokeWidth={2} />
              Tambah Ekspedisi
            </button>
          )}
        </div>

        {/* Form Add / Edit */}
        {(isAdding || editingId) && (
          <form onSubmit={saveItem} className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-blue-200/60">
              <h3 className="text-sm font-bold text-blue-950 flex items-center gap-2">
                <Settings2 size={18} className="text-blue-600" />
                {isAdding ? 'Tambah Ekspedisi & Prefix Baru' : 'Edit Ekspedisi & Prefix'}
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={cancelForm}
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Nama Ekspedisi</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: J&T Cargo, SPX, Anteraja"
                  className="mt-1 w-full bg-white text-sm"
                  value={form.courier_name}
                  onChange={(e) => setForm({ ...form, courier_name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Awalan / Prefix Resi</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: SPXID, JY1, 2016, 110"
                  className="mt-1 w-full bg-white text-sm uppercase tracking-wide font-mono"
                  value={form.prefix}
                  onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })}
                />
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-slate-700">File Suara Audio</label>
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    onClick={() => playCourierSound(form.sound_file)}
                  >
                    <Volume2 size={13} />
                    Tes Suara
                  </button>
                </div>
                <select
                  className="mt-1 w-full bg-white text-sm"
                  value={form.sound_file}
                  onChange={(e) => {
                    const val = e.target.value;
                    setForm({ ...form, sound_file: val });
                    playCourierSound(val);
                  }}
                >
                  {AVAILABLE_SOUNDS.map((s) => (
                    <option key={s.file} value={s.file}>
                      {s.label} ({s.file})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4 pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    checked={!!form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })}
                  />
                  Aktifkan Prefix Ini
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={cancelForm}
                disabled={saving}
              >
                Batal
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm flex items-center gap-1.5"
                disabled={saving}
              >
                <Save size={15} />
                {saving ? 'Menyimpan…' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        )}

        {/* Table List */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
              <tr>
                <th className="py-2.5 px-3">Ekspedisi</th>
                <th className="py-2.5 px-3">Prefix Resi</th>
                <th className="py-2.5 px-3">Suara</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prefixes?.length ? (
                prefixes.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {item.courier_name}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-100 font-mono text-xs font-bold text-slate-800 border border-slate-200">
                        {item.prefix}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <button
                        type="button"
                        onClick={() => playCourierSound(item.sound_file)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
                        title="Klik untuk mendengarkan suara"
                      >
                        <Volume2 size={14} className="text-blue-600 animate-pulse" />
                        {item.sound_file}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          item.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {item.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-blue-600 text-xs px-2"
                          onClick={() => startEdit(item)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-red-600 px-2"
                          onClick={() => deleteItem(item.id, item.courier_name)}
                          aria-label={`Hapus ${item.courier_name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400 text-sm">
                    Belum ada pengaturan prefix ekspedisi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );
}
