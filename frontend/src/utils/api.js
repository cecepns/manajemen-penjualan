import axios from 'axios';
import { toast } from 'sonner';

const TOKEN_KEY = 'mp_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err.response?.data?.message ||
      err.message ||
      'Terjadi kesalahan jaringan';
    if (err.response?.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event('mp:unauthorized'));
    }
    return Promise.reject(new Error(msg));
  }
);

/**
 * Wrapper API: sukses → toast success; gagal → toast error (throw).
 */
export async function apiCall(promise, messages = {}) {
  const {
    success = 'Berhasil',
    loading = 'Memproses…',
    errorPrefix = '',
  } = messages;
  // Sonner: toast.promise mengembalikan { unwrap }, bukan nilai axios — tanpa unwrap(), await salah isi (login stuck, dll).
  const pending = toast.promise(promise, {
    loading,
    success: (data) =>
      typeof success === 'function' ? success(data) : success,
    error: (e) =>
      `${errorPrefix}${e instanceof Error ? e.message : 'Gagal'}`,
  });
  return pending.unwrap();
}

export function toastApiError(err, fallback = 'Gagal') {
  const m = err instanceof Error ? err.message : fallback;
  toast.error(m);
}

export function toastSuccess(msg) {
  toast.success(msg);
}
