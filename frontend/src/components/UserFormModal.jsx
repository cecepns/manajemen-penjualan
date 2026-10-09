import { useEffect, useState } from 'react';
import { Save, UserPlus } from 'lucide-react';
import Select from 'react-select';
import Modal from './Modal.jsx';
import { api, apiCall } from '../utils/api.js';
import { selectStyles } from './selectTheme.js';

const roleOptions = [
  { value: 'karyawan', label: 'Karyawan' },
  { value: 'admin', label: 'Admin (order: pencairan & status selesai/retur; tanpa ubah isi barang)' },
  { value: 'viewer', label: 'Viewer (lihat dashboard, produk, order & hpp; tanpa ubah data)' },
  { value: 'checker_pengiriman', label: 'Checker pengiriman (hanya menu Kurir gudang)' },
  { value: 'owner', label: 'Owner (akses penuh)' },
];

const empty = { name: '', email: '', password: '', role: 'karyawan' };

export default function UserFormModal({ open, onClose, editingUser, onSaved }) {
  const isEdit = editingUser != null;
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setForm({
        name: editingUser.name || '',
        email: editingUser.email || '',
        password: '',
        role: editingUser.role || 'karyawan',
      });
    } else {
      setForm(empty);
    }
  }, [open, isEdit, editingUser]);

  async function onSubmit(e) {
    e.preventDefault();
    try {
      if (isEdit) {
        const payload = {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
        };
        if (form.password.trim()) payload.password = form.password;
        await apiCall(api.put(`/api/users/${editingUser.id}`, payload), {
          success: 'User diperbarui',
          loading: 'Menyimpan…',
        });
      } else {
        await apiCall(api.post('/api/users', form), {
          success: 'User ditambah',
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
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit user' : 'Tambah user'} size="2xl">
      <form onSubmit={onSubmit}>
        <div className="form-row cols-2">
          <div>
            <label>Nama</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div>
            <label>{isEdit ? 'Password baru (kosongkan jika tidak diubah)' : 'Password'}</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required={!isEdit}
              autoComplete={isEdit ? 'new-password' : 'new-password'}
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
            {isEdit ? (
              <>
                <Save size={18} strokeWidth={2} aria-hidden />
                Simpan perubahan
              </>
            ) : (
              <>
                <UserPlus size={18} strokeWidth={2} aria-hidden />
                Simpan user
              </>
            )}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
        </div>
      </form>
    </Modal>
  );
}
