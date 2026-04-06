import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import Select from 'react-select';
import Modal from './Modal.jsx';
import { api, apiCall } from '../utils/api.js';
import { selectStyles } from './selectTheme.js';

const roleOptions = [
  { value: 'karyawan', label: 'Karyawan (input, tanpa hapus penting)' },
  { value: 'admin', label: 'Admin (full)' },
];

const empty = { name: '', email: '', password: '', role: 'karyawan' };

export default function UserFormModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (open) setForm(empty);
  }, [open]);

  async function onSubmit(e) {
    e.preventDefault();
    try {
      await apiCall(api.post('/api/users', form), {
        success: 'User ditambah',
        loading: 'Menyimpan…',
      });
      onSaved?.();
      onClose();
    } catch {
      /* toast */
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah user" size="2xl">
      <form onSubmit={onSubmit}>
        <div className="form-row cols-2">
          <div>
            <label>Nama</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div>
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          <div>
            <label>Role</label>
            <Select
              options={roleOptions}
              value={roleOptions.find((o) => o.value === form.role)}
              onChange={(o) => setForm((f) => ({ ...f, role: o?.value || 'karyawan' }))}
              styles={selectStyles()}
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button type="submit" className="btn btn-primary">
            <UserPlus size={18} strokeWidth={2} aria-hidden />
            Simpan user
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
        </div>
      </form>
    </Modal>
  );
}
