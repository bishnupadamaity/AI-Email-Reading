import {
  Bell,
  FlaskConical,
  GitCompareArrows,
  Menu,
  Search,
  Settings as SettingsIcon,
  SquareCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useHealth } from '../../hooks/use-health';
import { useCachedScanSummary } from '../../hooks/use-scan-summary';
import { brand } from '../../lib/brand';
import { unsupportedReason } from '../../lib/capabilities';
import { useDemoMode } from '../../lib/demo/demo-mode-context';
import { webEnv } from '../../lib/env';
import { navigation, routes } from '../../lib/navigation';
import { Button } from '../ui/Button';
import { Popover } from '../ui/Popover';
import { SearchInput, Switch } from '../ui/inputs';
import { Toaster } from '../ui/Toaster';
import { Tooltip } from '../ui/Tooltip';
import { ChromeContext } from './chrome-context';
import { Sidebar } from './Sidebar';

const SIDEBAR_STORAGE_KEY = 'mailpilot.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Fallback header label, used until a page fills the trail slot. */
function titleForPath(pathname: string): string {
  if (pathname.startsWith('/emails/')) return 'Email analysis';
  if (pathname.startsWith('/analyses/')) return 'Analysis detail';

  for (const group of navigation) {
    for (const item of group.items) {
      if (item.to === pathname) return item.label;
    }
  }
  return brand.name;
}

/**
 * Live connection state.
 *
 * This replaces the API base URL that used to sit in the navigation rail: the
 * URL was noise, whereas whether the API is answering is worth a glance. In
 * demo mode it says that instead, because no request is being made.
 */
function EnvPill() {
  const { enabled: demo } = useDemoMode();
  const { data, error, isPending } = useHealth();

  if (demo) {
    return (
      <Tooltip label="Demo data is on. Nothing is read from or written to the API." wrap>
        <span className="env-pill" data-state="demo">
          <span className="env-pill__dot" aria-hidden="true" />
          <span className="env-pill__label">Demo data</span>
        </span>
      </Tooltip>
    );
  }

  const state = isPending ? 'pending' : error ? 'down' : 'up';
  const label = isPending ? 'Connecting' : error ? 'API offline' : 'Live';

  return (
    <Tooltip
      label={
        error
          ? `Cannot reach ${webEnv.apiBaseUrl}. Start the API with \`pnpm dev:api\`.`
          : `${webEnv.apiBaseUrl}${data ? ` · ${data.service} ${data.version}` : ''}`
      }
      wrap
    >
      <span className="env-pill" data-state={state}>
        <span className="env-pill__dot" aria-hidden="true" />
        <span className="env-pill__label">{label}</span>
      </span>
    </Tooltip>
  );
}

function NotificationsMenu() {
  const summary = useCachedScanSummary();

  const signals = [
    {
      label: 'Analyses needing review',
      value: summary?.needsReview ?? 0,
      to: routes.review,
      icon: SquareCheck,
    },
    {
      label: 'Conflicting values',
      value: summary?.conflicts ?? 0,
      to: routes.conflicts,
      icon: GitCompareArrows,
    },
    {
      label: 'Failed analyses',
      value: summary?.failed ?? 0,
      to: routes.analyses,
      icon: TriangleAlert,
    },
  ];

  const hasSignals = signals.some((signal) => signal.value > 0);

  return (
    <Popover
      label="Attention signals"
      width={23}
      trigger={({ toggle }) => (
        <button type="button" className="icon-btn" onClick={toggle} aria-label="Attention signals">
          <Bell size={15} aria-hidden="true" />
          {hasSignals ? <span className="icon-btn__dot" aria-hidden="true" /> : null}
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <div className="panel__head">
            <h3 className="panel__title">Attention signals</h3>
          </div>
          {summary ? (
            <ul>
              {signals.map((signal) => {
                const Icon = signal.icon;
                return (
                  <li key={signal.label}>
                    <Link
                      to={signal.to}
                      className="attention-row"
                      onClick={close}
                      data-severity={signal.value > 0 ? 'medium' : undefined}
                    >
                      <span
                        className={`attention-row__icon attention-row__icon--${
                          signal.value > 0 ? 'warning' : 'neutral'
                        }`}
                      >
                        <Icon size={13} aria-hidden="true" />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className="attention-row__title">{signal.label}</span>
                        <span className="attention-row__meta">
                          {signal.value > 0 ? 'in the current scan' : 'none found'}
                        </span>
                      </span>
                      <span className="attention-row__side tnum">{signal.value}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="panel__body">
              <p className="muted" style={{ fontSize: 'var(--text-base)' }}>
                Open the Overview or Review Queue to compute attention signals.
              </p>
            </div>
          )}
          <div className="panel__foot">{unsupportedReason('notifications')}</div>
        </div>
      )}
    </Popover>
  );
}

function UserMenu() {
  const { enabled: demo, setEnabled } = useDemoMode();

  return (
    <Popover
      label="Workspace"
      width={22}
      trigger={({ toggle }) => (
        <button
          type="button"
          className="icon-btn"
          onClick={toggle}
          aria-label="Workspace and preferences"
        >
          <span className="avatar avatar--sm" aria-hidden="true">
            OP
          </span>
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <div className="panel__body stack stack--sm">
            <div>
              <p style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)' }}>
                {brand.workspaceName}
              </p>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                Anonymous access — the API has no authentication.
              </p>
            </div>
            <hr className="divider" />
            <Switch
              checked={demo}
              onChange={setEnabled}
              label={
                <span>
                  Demo data
                  <span className="muted" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                    Replace every view with synthetic records
                  </span>
                </span>
              }
            />
            <hr className="divider" />
            <Link
              to={routes.settings}
              onClick={close}
              className="inline inline--sm"
              style={{ fontSize: 'var(--text-base)' }}
            >
              <SettingsIcon size={13} aria-hidden="true" /> Settings and service health
            </Link>
          </div>
        </div>
      )}
    </Popover>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = term.trim();
    navigate(trimmed ? `${routes.emails}?q=${encodeURIComponent(trimmed)}` : routes.emails);
  };

  return (
    <form className="topbar__search" onSubmit={submit} role="search">
      <SearchInput
        value={term}
        onChange={setTerm}
        label="Search emails"
        placeholder="Search sender, subject, container…"
      />
    </form>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lead, setLead] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const { pathname } = useLocation();
  const { enabled: demo, setEnabled: setDemo } = useDemoMode();

  // Navigating must close the off-canvas drawer, or the next page is hidden.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.title = `${titleForPath(pathname)} · ${brand.name}`;
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? 'on' : 'off');
      } catch {
        // Preference is not essential.
      }
      return next;
    });
  };

  return (
    <div className="shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      {mobileOpen ? (
        <button
          type="button"
          className="sidebar__scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="main">
        <header className={`topbar${searchOpen ? ' topbar--search-open' : ''}`}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<Menu size={16} aria-hidden="true" />}
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="topbar__menu"
          />

          {/* The fallback trail hides itself in CSS once a page fills the slot. */}
          <div className="topbar__lead">
            <div className="topbar__lead-slot" ref={setLead} />
            <nav className="trail topbar__title--fallback" aria-label="Breadcrumb">
              <span className="trail__item trail__item--current">
                <span className="trail__current">{titleForPath(pathname)}</span>
              </span>
            </nav>
          </div>

          <GlobalSearch />

          <div className="topbar__actions">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              className="topbar__search-toggle"
              icon={
                searchOpen ? (
                  <X size={16} aria-hidden="true" />
                ) : (
                  <Search size={16} aria-hidden="true" />
                )
              }
              onClick={() => setSearchOpen((value) => !value)}
              aria-label={searchOpen ? 'Close search' : 'Search'}
            />
            <EnvPill />
            <NotificationsMenu />
            {/* Page-owned primary actions land here. */}
            <div ref={setActions} className="topbar__actions" />
            <span className="topbar__sep" aria-hidden="true" />
            <UserMenu />
          </div>
        </header>

        {demo ? (
          <div className="demo-banner" role="status">
            <FlaskConical size={14} aria-hidden="true" />
            <span className="demo-banner__text">
              <strong>Demo data.</strong> Every figure, email and extraction on screen is synthetic
              and comes from the repository's contract fixtures. Nothing is read from or written to
              the API while this is on.
            </span>
            <Button size="xs" variant="secondary" onClick={() => setDemo(false)}>
              Use live data
            </Button>
          </div>
        ) : null}

        <ChromeContext.Provider value={{ lead, actions }}>
          <Outlet />
        </ChromeContext.Provider>
      </div>

      <Toaster />
    </div>
  );
}

/** Wrapper for pages that scroll their own body. */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <div className="page__inner">{children}</div>
    </div>
  );
}

/** Wrapper for pages that fill the viewport (inbox, analysis workspace). */
export function PageFill({ children }: { children: ReactNode }) {
  return <div className="page page--fill">{children}</div>;
}
