import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShoppingCart,
  Store,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const links = [
  { to: '/', label: 'Dashboard', end: true, Icon: LayoutDashboard },
  { to: '/orders', label: 'Order', Icon: ShoppingCart },
  { to: '/products', label: 'Produk', Icon: Package },
  { to: '/stores', label: 'Toko', Icon: Store },
  { to: '/users', label: 'User', admin: true, Icon: Users },
];

const navLinkDesktop = ({ isActive }) =>
  [
    'flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium no-underline transition-colors',
    isActive
      ? 'bg-blue-600 text-white shadow-md shadow-blue-950/30'
      : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
  ].join(' ');

function SidebarContent({ user, isAdmin, onLinkClick, headerLeading, onLogout }) {
  return (
    <>
      <div className="mb-1 flex items-center gap-2 border-b border-slate-700/70 px-2.5 pb-5 pt-1 text-base font-bold tracking-tight text-slate-100">
        {headerLeading}
        <Store size={22} strokeWidth={2.25} className="shrink-0 text-blue-400" aria-hidden />
        <span className="min-w-0 truncate">Penjualan MP</span>
      </div>
      {links
        .filter((l) => !l.admin || isAdmin)
        .map(({ to, label, end, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={navLinkDesktop}
            onClick={() => onLinkClick?.()}
          >
            <Icon size={20} strokeWidth={2} className="shrink-0 opacity-90" aria-hidden />
            {label}
          </NavLink>
        ))}
      <div className="mt-auto border-t border-slate-700/70 px-2.5 pt-4 text-sm">
        <span className="mb-0.5 block font-semibold text-slate-100">{user?.name}</span>
        <span className="text-xs capitalize text-slate-500">{user?.role}</span>
        <button
          type="button"
          className="btn mt-2.5 w-full border border-slate-600/90 bg-slate-700/50 text-slate-200 shadow-none hover:border-slate-500 hover:bg-slate-700 hover:text-white"
          onClick={() => {
            onLinkClick?.();
            onLogout();
          }}
        >
          <LogOut size={18} strokeWidth={2} aria-hidden />
          Keluar
        </button>
      </div>
    </>
  );
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const handleLogout = () => {
    setMobileOpen(false);
    logout();
    nav('/login');
  };

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur-md md:hidden">
        <button
          type="button"
          className="btn btn-icon btn-ghost border-slate-200"
          aria-expanded={mobileOpen}
          aria-controls="mobile-sidebar"
          aria-label={mobileOpen ? 'Tutup menu' : 'Buka menu'}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X size={22} strokeWidth={2} aria-hidden /> : <Menu size={22} strokeWidth={2} aria-hidden />}
        </button>
        <span className="min-w-0 truncate text-sm font-bold text-slate-900">Penjualan MP</span>
      </header>

      <div
        className={`fixed inset-0 z-[55] md:hidden transition-[opacity,visibility] duration-200 ${
          mobileOpen ? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none'
        }`}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
          tabIndex={-1}
          aria-label="Tutup menu"
          onClick={() => setMobileOpen(false)}
        />
        <nav
          id="mobile-sidebar"
          className={`absolute left-0 top-0 flex h-full w-[min(288px,88vw)] flex-col gap-1 border-r border-slate-700/80 bg-gradient-to-b from-slate-800 via-slate-800 to-slate-950 p-3 pb-5 shadow-[8px_0_32px_rgba(15,23,42,0.25)] ring-1 ring-inset ring-white/[0.06] transition-transform duration-200 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi"
          onClick={(e) => e.stopPropagation()}
        >
          <SidebarContent
            user={user}
            isAdmin={isAdmin}
            onLinkClick={() => setMobileOpen(false)}
            onLogout={handleLogout}
            headerLeading={
              <button
                type="button"
                className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Tutup menu"
                onClick={() => setMobileOpen(false)}
              >
                <X size={22} strokeWidth={2} aria-hidden />
              </button>
            }
          />
        </nav>
      </div>

      <nav className="fixed left-0 top-0 z-40 hidden h-full w-[228px] flex-col gap-1 border-r border-slate-700/80 bg-gradient-to-b from-slate-800 via-slate-800 to-slate-950 p-3 pb-5 shadow-[4px_0_24px_rgba(15,23,42,0.12)] ring-1 ring-inset ring-white/[0.06] md:flex">
        <SidebarContent user={user} isAdmin={isAdmin} onLogout={handleLogout} />
      </nav>

      <main className="mx-auto max-w-8xl px-3 pb-6 pt-[calc(3.5rem+0.625rem)] md:pb-3.5 md:pl-[calc(228px+0.85rem)] md:pr-4 md:pt-3">
        <Outlet />
      </main>
    </>
  );
}
