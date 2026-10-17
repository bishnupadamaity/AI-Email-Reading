import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useCachedScanSummary } from '../../hooks/use-scan-summary';
import { brand } from '../../lib/brand';
import { unsupportedReason } from '../../lib/capabilities';
import { navigation, type NavBadge, type NavItem } from '../../lib/navigation';
import { Tooltip } from '../ui/Tooltip';
import { BrandMark } from './BrandMark';

const BADGE_TONE: Record<NavBadge, 'warning' | 'danger' | 'neutral'> = {
  needsReview: 'warning',
  conflicts: 'danger',
  failed: 'danger',
  missing: 'neutral',
};

function badgeValue(
  badge: NavBadge | undefined,
  summary: ReturnType<typeof useCachedScanSummary>,
): number | null {
  if (!badge || !summary) return null;

  const value =
    badge === 'needsReview'
      ? summary.needsReview
      : badge === 'conflicts'
        ? summary.conflicts
        : badge === 'failed'
          ? summary.failed
          : summary.missingFields;

  return value > 0 ? value : null;
}

function NavEntry({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const summary = useCachedScanSummary();
  const count = badgeValue(item.badge, summary);
  const Icon = item.icon;

  const link = (
    <NavLink to={item.to} className="nav-item" end={item.to === '/'}>
      <span className="nav-item__icon">
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="nav-item__label">{item.label}</span>
      {count != null && item.badge ? (
        <span
          className="nav-item__badge"
          data-tone={BADGE_TONE[item.badge]}
          aria-label={`${count} ${item.label}`}
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </NavLink>
  );

  if (collapsed) {
    return (
      <span className="nav-item-wrap">
        <Tooltip label={count == null ? item.label : `${item.label} · ${count}`} placement="right">
          {link}
        </Tooltip>
      </span>
    );
  }

  return <span className="nav-item-wrap">{link}</span>;
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const collapseLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sidebar__head">
        <NavLink to="/" className="sidebar__brand" aria-label={`${brand.name} — overview`}>
          <span className="sidebar__mark">
            <BrandMark />
          </span>
          <span className="sidebar__wordmark">
            <span className="sidebar__name">{brand.name}</span>
            <span className="sidebar__kicker">{brand.workspaceName}</span>
          </span>
        </NavLink>
      </div>

      <div className="sidebar__nav">
        {navigation.map((group, index) => (
          <div className="nav-group" key={group.label ?? `group-${index}`}>
            {group.label ? <p className="nav-group__label">{group.label}</p> : null}
            {group.items.map((item) => (
              <NavEntry key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar__foot">
        <div className="sidebar__user">
          {/* No authentication exists: this names the workspace, not a signed-in user. */}
          <Tooltip label={unsupportedReason('auth')} placement="right" wrap>
            <span className="nav-avatar" aria-hidden="true">
              OP
            </span>
          </Tooltip>
          <span className="sidebar__user-meta">
            <span className="sidebar__user-name truncate">Operations</span>
            <span className="sidebar__user-role truncate">No sign-in required</span>
          </span>
          <Tooltip label={collapseLabel} placement="right">
            <button
              type="button"
              className="nav-btn"
              onClick={onToggleCollapsed}
              aria-label={collapseLabel}
            >
              {collapsed ? (
                <PanelLeftOpen size={14} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={14} aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </nav>
  );
}
