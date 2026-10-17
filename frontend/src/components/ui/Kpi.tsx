import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type KpiTone = 'default' | 'muted' | 'success' | 'warning' | 'danger';

export interface KpiProps {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode;
  tone?: KpiTone;
  /** When set, the whole tile navigates — KPIs are the fastest route to work. */
  to?: string;
}

export function Kpi({ label, value, foot, tone = 'default', to }: KpiProps) {
  const body = (
    <>
      <span className="kpi__label">{label}</span>
      <span className={`kpi__value${tone === 'default' ? '' : ` kpi__value--${tone}`}`}>
        {value}
      </span>
      <span className="kpi__foot">{foot}</span>
    </>
  );

  if (to) {
    return (
      <Link className="kpi" to={to}>
        {body}
      </Link>
    );
  }

  return <div className="kpi">{body}</div>;
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="kpis">{children}</div>;
}
