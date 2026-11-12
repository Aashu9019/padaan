import { Link, NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from './Icon';

function NavButton({ to, label, icon }: { to: string; label: string; icon: 'plus' | 'settings' }) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        clsx(
          'grid size-10 place-items-center rounded-full transition-colors',
          isActive ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-2',
        )
      }
    >
      <Icon name={icon} />
    </NavLink>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-baseline gap-2 select-none">
      <span className="font-serif text-[1.4rem] leading-none tracking-tight text-ink">padaan</span>
      <span lang="ne" className="font-deva text-[0.95rem] leading-none text-ink-3">
        पडान
      </span>
    </span>
  );
}

export function AppShell() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="safe-top sticky top-0 z-20 border-b border-line/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Library" className="rounded-md py-1">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            <NavButton to="/add" label="Add a book" icon="plus" />
            <NavButton to="/settings" label="Settings" icon="settings" />
          </nav>
        </div>
      </header>
      <main className="safe-bottom mx-auto w-full max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
