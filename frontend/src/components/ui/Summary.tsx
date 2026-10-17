import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type SummaryTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';
export type StatTone = 'default' | 'muted' | 'warning' | 'danger' | 'success';

/**
 * The operational summary: one lead metric and a ruled grid of supporting
 * ones.
 *
 * Deliberately not a row of identical cards. A dashboard where every number
 * has the same visual weight makes the operator do the triage that the
 * interface should have done — so the lead slot is chosen from real status
 * counts, and everything else stays quiet.
 */
export function SummaryBoard({ children }: { children: ReactNode }) {
  return <div className="summary">{children}</div>;
}

export function SummaryLead({
  label,
  value,
  note,
  tone = 'neutral',
  action,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: SummaryTone;
  action?: ReactNode;
}) {
  return (
    <div className="summary__lead" data-tone={tone === 'neutral' ? undefined : tone}>
      <span className="summary__lead-label">{label}</span>
      <span className="summary__lead-value">{value}</span>
      {note ? <span className="summary__lead-note">{note}</span> : null}
      {action ? <div className="summary__lead-action">{action}</div> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="summary__stats">{children}</div>;
}

export function Stat({
  label,
  value,
  note,
  tone = 'default',
  to,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: StatTone;
  to?: string;
}) {
  const body = (
    <>
      <span className="stat__label">{label}</span>
      <span className="stat__value" data-tone={tone === 'default' ? undefined : tone}>
        {value}
      </span>
      <span className="stat__note">{note}</span>
    </>
  );

  if (to) {
    return (
      <Link className="stat" to={to}>
        {body}
      </Link>
    );
  }

  return <div className="stat">{body}</div>;
}
