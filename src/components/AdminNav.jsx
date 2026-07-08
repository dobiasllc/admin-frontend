/**
 * AdminLayout.jsx (exported as AdminLayout)
 * Shared sidebar layout for all admin pages.
 * Wraps page content with a fixed left sidebar navigation.
 *
 * Desktop: permanent left sidebar (w-56).
 * Mobile:  hidden sidebar + top bar with hamburger → slide-in drawer overlay.
 *
 * Usage:
 *   import AdminLayout from '../components/AdminNav';
 *   export default function AdminFoo() {
 *     return <AdminLayout><div>page content</div></AdminLayout>;
 *   }
 */
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

// NOTE: basename="/admin" is set on the Router in App.jsx, so these paths
// are relative to /admin — do NOT include /admin here or links will double-prefix.
const NAV_ITEMS = [
  { to: '/',            label: 'Dashboard', icon: '🏠', exact: true },
  { to: '/bookings',   label: 'Bookings',  icon: '📋' },
  { to: '/calendar',   label: 'Calendar',  icon: '📅' },
  { to: '/vehicles',   label: 'Vehicles',  icon: '🚗' },
  { to: '/users',      label: 'Users',     icon: '👥' },
  { to: '/guest-keys', label: 'Guest Keys',icon: '🔑' },
  { to: '/map',        label: 'Live Map',  icon: '🗺' },
];

/** The inner sidebar content — shared between desktop sidebar and mobile drawer */
function SidebarContent({ onNavClick }) {
  return (
    <>
      {/* Sidebar header */}
      <div className="px-4 py-5 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Admin</p>
        <p className="text-sm font-bold text-gray-800 mt-0.5">Fleet Portal</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV_ITEMS.map(({ to, label, icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            onClick={onNavClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <span className="text-base leading-none">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Back to main website */}
      <div className="px-2 py-3 border-t border-gray-100">
        <a
          href="https://drivedobias.com"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
        >
          <span className="text-base leading-none">←</span>
          <span>Main Website</span>
        </a>
      </div>
    </>
  );
}

export default function AdminLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-gray-200 flex-col">
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <aside className="relative z-50 w-64 bg-white flex flex-col shadow-xl">
            {/* Close button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Mobile top bar (hidden on desktop) */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-bold text-gray-800">Fleet Portal</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

    </div>
  );
}
