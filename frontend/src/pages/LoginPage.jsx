import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LogIn, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api, apiCall } from '../utils/api.js';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { user, setUserFromLogin } = useAuth();
  const nav = useNavigate();

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    try {
      const { data } = await apiCall(api.post('/api/auth/login', { email, password }), {
        loading: 'Masuk…',
        success: 'Selamat datang',
      });
      setUserFromLogin(data.user, data.token);
      nav('/', { replace: true });
    } catch {
      /* toast dari apiCall */
    }
  }

  return (
    <div className="login-page">
      <div className="card w-full max-w-md">
        <div className="mb-1 flex items-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Store size={24} strokeWidth={2} aria-hidden />
          </div>
          <h1 className="m-0 text-xl font-bold tracking-tight text-slate-900">Manajemen Penjualan</h1>
        </div>
        <p className="muted mb-5">
          Marketplace · pencairan fleksibel
        </p>
        <form onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="pw" className="mt-3">
            Password
          </label>
          <input
            id="pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary mt-5 w-full">
            <LogIn size={18} strokeWidth={2} aria-hidden />
            Masuk
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          Default: admin@local.test / admin123 (setelah DB & server jalan)
        </p>
      </div>
    </div>
  );
}
