import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Notification, Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  IconBars,
  IconBell,
  IconBuilding,
  IconChartBar,
  IconCheckDouble,
  IconClipboardCheck,
  IconClock,
  IconDesktop,
  IconGauge,
  IconHouse,
  IconIdCard,
  IconMoon,
  IconPlane,
  IconScroll,
  IconSignOut,
  IconSliders,
  IconSun,
  IconUsers,
} from '../components/icons';
import { Button } from '../components/ui';
import { fmtDateTime, ROLE_LABEL } from '../utils/format';

interface NavItem { to: string; label: string; icon: React.ReactNode; roles?: Role[] }

const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: <IconGauge size={15} /> },
      { to: '/attendance', label: 'My attendance', icon: <IconClock size={15} /> },
      { to: '/leave', label: 'My leave', icon: <IconPlane size={15} /> },
    ],
  },
  {
    section: 'Team',
    items: [
      { to: '/team/attendance', label: 'Team attendance', icon: <IconUsers size={15} />, roles: ['OWNER', 'HR', 'REPORTING_MANAGER'] },
      { to: '/approvals', label: 'Approvals', icon: <IconClipboardCheck size={15} />, roles: ['OWNER', 'HR', 'REPORTING_MANAGER'] },
      { to: '/reports', label: 'Reports', icon: <IconChartBar size={15} />, roles: ['OWNER', 'HR', 'REPORTING_MANAGER'] },
    ],
  },
  {
    section: 'Administration',
    items: [
      { to: '/employees', label: 'Employees', icon: <IconIdCard size={15} />, roles: ['OWNER', 'HR'] },
      { to: '/policies', label: 'Policies & setup', icon: <IconSliders size={15} />, roles: ['OWNER', 'HR'] },
      { to: '/audit', label: 'Audit log', icon: <IconScroll size={15} />, roles: ['OWNER'] },
    ],
  },
];

function Bell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread: number; items: Notification[] }>({ unread: 0, items: [] });
  const box = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  const load = () => api.get<typeof data>('/notifications').then(setData).catch(() => undefined);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const click = async (n: Notification) => {
    if (!n.is_read) await api.post(`/notifications/${n.id}/read`).catch(() => undefined);
    setOpen(false);
    load();
    if (n.link) nav(n.link);
  };

  return (
    <div className="bell" ref={box}>
      <Button
        variant="ghost"
        icon
        onClick={() => { setOpen((o) => !o); load(); }}
        aria-label={`Notifications, ${data.unread} unread`}
        aria-expanded={open}
        title="Notifications"
      >
        <IconBell size={18} />
        {data.unread > 0 && <span className="dot">{data.unread > 9 ? '9+' : data.unread}</span>}
      </Button>
      {open && (
        <div className="dropdown">
          <div className="row between" style={{ padding: '10px 14px' }}>
            <strong>Notifications</strong>
            {data.unread > 0 && (
              <Button small variant="ghost" onClick={() => api.post('/notifications/read-all').then(load)}>
                <IconCheckDouble size={14} style={{ marginRight: 4 }} />
                Mark all read
              </Button>
            )}
          </div>
          {data.items.length === 0 && <div className="empty small">Nothing yet</div>}
          {data.items.map((n) => (
            <a key={n.id} href={n.link ?? '#'} className={`item${n.is_read ? '' : ' unread'}`}
              onClick={(e) => { e.preventDefault(); click(n); }}>
              <div style={{ fontWeight: 600 }}>{n.title}</div>
              {n.body && <div className="small muted">{n.body}</div>}
              <div className="small muted">{fmtDateTime(n.created_at)}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('raancom_theme') as 'light' | 'dark' | 'system') || 'system';
  });

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('raancom_theme', theme);
  }, [theme]);

  const toggle = () => {
    setTheme((t) => (t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light'));
  };

  const title = `Theme: ${theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'} (click to change)`;

  return (
    <Button
      variant="ghost"
      icon
      onClick={toggle}
      title={title}
      aria-label={title}
    >
      {theme === 'light' && <IconSun size={17} style={{ color: '#f59e0b' }} />}
      {theme === 'dark' && <IconMoon size={16} style={{ color: '#818cf8' }} />}
      {theme === 'system' && <IconDesktop size={16} />}
    </Button>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(() => {
    const saved = localStorage.getItem('raancom_sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });
  const loc = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    localStorage.setItem('raancom_sidebar_open', String(desktopOpen));
  }, [desktopOpen]);

  const toggleMenu = () => {
    if (window.innerWidth <= 860) {
      setMobileOpen((o) => !o);
    } else {
      setDesktopOpen((o) => !o);
    }
  };

  if (!user) return null;

  return (
    <div className={`shell${desktopOpen ? '' : ' sidebar-collapsed'}`}>
      <aside className={`sidebar${mobileOpen ? ' open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark">R</span> Raancom
        </div>
        {NAV.map((g, i) => {
          const items = g.items.filter((n) => !n.roles || n.roles.includes(user.role));
          if (!items.length) return null;
          return (
            <div key={i}>
              {g.section && <div className="nav-section">{g.section}</div>}
              {items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', width: 18, justifyContent: 'center' }}>{n.icon}</span> {n.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </aside>
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <div className="row" style={{ gap: 10 }}>
            <Button
              className="menu-btn"
              variant="ghost"
              icon
              onClick={toggleMenu}
              aria-label={desktopOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              title={desktopOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-expanded={desktopOpen}
            >
              <IconBars size={18} />
            </Button>
            <div className="topbar-company">
              <IconBuilding size={17} />
              <span>{user.company.name}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <ThemeToggle />
            <Bell />
            <Link to="/profile" className="topbar-user" title="My profile">
              <span className="topbar-avatar">{user.employee.full_name.charAt(0).toUpperCase()}</span>
              <div className="topbar-user-info" style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600 }}>{user.employee.full_name}</div>
                <div className="small muted">{ROLE_LABEL[user.role]}</div>
              </div>
            </Link>
            <Button small onClick={logout} title="Sign out">
              <IconSignOut size={14} style={{ marginRight: 4 }} />
              <span>Sign out</span>
            </Button>
          </div>
        </header>
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
