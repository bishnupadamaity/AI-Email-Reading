import { type ReactNode } from 'react';
import { type Tone } from '../../lib/extraction';

export interface BadgeProps {
  tone?: Tone | 'demo' | 'plain';
  dot?: boolean;
  size?: 'sm' | 'lg';
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot, size = 'sm', icon, title, children }: BadgeProps) {
  return (
    <span className={`badge badge--${tone}${size === 'lg' ? ' badge--lg' : ''}`} title={title}>
      {dot ? <span className="badge__dot" aria-hidden="true" /> : icon}
      {children}
    </span>
  );
}

export function Count({
  value,
  tone = 'neutral',
  label,
}: {
  value: number;
  tone?: 'neutral' | 'warning' | 'danger' | 'accent';
  label?: string;
}) {
  return (
    <span
      className={`count${tone === 'neutral' ? '' : ` count--${tone}`}`}
      aria-label={label ? `${value} ${label}` : undefined}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}
