import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import Modal from './Modal.jsx';
import { api, apiCall } from '../utils/api.js';

export default function StoreFormModal({ open, onClose, editingStore, onSaved }) {
  const isEdit = editingStore != null;
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(isEdit ? editingStore.name : '');
  }, [open, isEdit, editingStore]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      if (isEdit) {
        await apiCall(api.put(`/api/stores/${editingStore.id}`, { name: name.trim() }), {
          success: 'Toko diperbarui',
          loading: 'Menyimpan…',
        });
      } else {
        await apiCall(api.post('/api/stores', { name: name.trim() }), {
          success: 'Toko ditambah',
          loading: 'Menyimpan…',
        });
      }
      onSaved?.();
      onClose();
    } catch {
      /* toast */
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit toko' : 'Tambah toko'} size="sm">
      <form onSubmit={onSubmit}>
        <label>Nama toko</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="contoh: SCM" required autoFocus />
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button type="submit" className="btn btn-primary">
            <Save size={18} strokeWidth={2} aria-hidden />
            Simpan
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
        </div>
      </form>
    </Modal>
  );
}
