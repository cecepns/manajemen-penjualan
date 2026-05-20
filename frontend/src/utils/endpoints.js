const DEFAULT_BACKEND_BASE_URL = 'https://api.kingcreativestudio.my.id/manajemen-penjualan';

function normalizeBaseUrl(url) {
  return String(url || DEFAULT_BACKEND_BASE_URL).replace(/\/+$/, '');
}

export const BACKEND_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_BACKEND_BASE_URL);

export function toBackendUrl(path = '') {
  if (!path) return BACKEND_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${BACKEND_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

