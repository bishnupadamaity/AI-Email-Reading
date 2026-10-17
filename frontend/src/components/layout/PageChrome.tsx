import { ChevronRight } from 'lucide-react';
import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useChromeSlots } from './chrome-context';

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * The header's breadcrumb trail, ending in the current page.
 *
 * One line, so the header stays 3.5rem tall and nothing stacks or clips. The
 * trail is the persistent wayfinding; the page's own serif title is the
 * editorial anchor below it.
 */
export function TopbarLead({ title, crumbs = [] }: { title: string; crumbs?: readonly Crumb[] }) {
  const { lead } = useChromeSlots();
  if (!lead) return null;

  return createPortal(
    <nav className="trail" aria-label="Breadcrumb">
      {crumbs.map((crumb, index) => (
        <span className="trail__item" key={`${crumb.label}-${index}`}>
          {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
          <ChevronRight size={11} className="trail__sep" aria-hidden="true" />
        </span>
      ))}
      <span className="trail__item trail__item--current">
        <span className="trail__current" aria-current="page">
          {title}
        </span>
      </span>
    </nav>,
    lead,
  );
}

/** Page-owned primary action(s), rendered into the shell header. */
export function TopbarActions({ children }: { children: ReactNode }) {
  const { actions } = useChromeSlots();
  if (!actions) return null;
  return createPortal(children, actions);
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
