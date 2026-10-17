import { CircleSlash, Database, FlaskConical, Info, Lock, Server } from 'lucide-react';
import { type ReactNode } from 'react';
import { capabilities, unsupportedReason, type CapabilityId } from '../../lib/capabilities';
import { Badge } from './Badge';
import { Button, type ButtonProps } from './Button';
import { Tooltip } from './Tooltip';

/**
 * An action the API cannot perform.
 *
 * Always disabled, always explained. This is the only way the dashboard
 * presents a write it cannot make: no optimistic UI, no local-only "saved"
 * state, no silently ignored click.
 */
export function UnsupportedButton({
  capability,
  children,
  icon,
  size = 'sm',
  variant = 'secondary',
}: {
  capability: CapabilityId;
  children: ReactNode;
  icon?: ReactNode;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}) {
  return (
    <Tooltip label={unsupportedReason(capability)} wrap>
      <Button
        variant={variant}
        size={size}
        disabled
        icon={icon ?? <Lock size={12} aria-hidden="true" />}
        aria-label={`${capabilities[capability].label} — not supported by the API`}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

/** Inline marker for a column or control whose backing endpoint is missing. */
export function UnsupportedTag({ capability }: { capability: CapabilityId }) {
  return (
    <Tooltip label={unsupportedReason(capability)} wrap>
      <Badge tone="plain" icon={<CircleSlash size={10} aria-hidden="true" />}>
        No API
      </Badge>
    </Tooltip>
  );
}

/**
 * Page- or section-level statement that a feature is not implemented, naming
 * the endpoint that would back it.
 */
export function CapabilityNotice({
  capability,
  title,
  children,
}: {
  capability: CapabilityId;
  title?: string;
  children?: ReactNode;
}) {
  const entry = capabilities[capability];

  return (
    <div className="notice notice--warning">
      <span className="notice__icon">
        <Info size={15} aria-hidden="true" />
      </span>
      <div className="notice__body">
        <p className="notice__title">{title ?? `${entry.label} is not implemented`}</p>
        <p className="notice__text">{entry.reason}</p>
        {children ? (
          <p className="notice__text" style={{ marginTop: 'var(--space-2)' }}>
            {children}
          </p>
        ) : null}
        <p className="notice__text" style={{ marginTop: 'var(--space-2)' }}>
          Required endpoint: <code className="inline-code">{entry.endpoint}</code>
        </p>
      </div>
    </div>
  );
}

/**
 * Where the numbers came from.
 *
 * This was a full-width tinted banner, which outranked the data it described.
 * It is now a single quiet line with the detail on hover — the claim still has
 * to be made (these are client-side figures, not server totals), but it should
 * not be the loudest thing on the page.
 */
export function DerivedNotice({
  scanned,
  total,
  children,
}: {
  scanned: number;
  total: number;
  children?: ReactNode;
}) {
  const partial = total > scanned;

  const detail = `${
    partial
      ? `Computed in the browser from the ${scanned} most recent of ${total} emails, so the figures describe that subset only. A deeper scan costs two requests per email.`
      : `Computed in the browser from all ${total} ${total === 1 ? 'email' : 'emails'} and their latest analyses.`
  } The API has no aggregate endpoint, so nothing here is a server-side total.`;

  return (
    <p className="provenance">
      <span className="provenance__icon">
        <Database size={12} aria-hidden="true" />
      </span>
      <span className="provenance__text">
        <strong>
          {partial ? `${scanned} of ${total} emails scanned` : `${total} emails scanned`}
        </strong>{' '}
        · derived in the browser{' '}
        <Tooltip label={detail} wrap>
          <button type="button" className="provenance__more" aria-label={detail}>
            why?
          </button>
        </Tooltip>
        {children ? <> {children}</> : null}
      </span>
    </p>
  );
}

/** States that a figure came straight from an endpoint, not from a scan. */
export function LiveNotice({ children }: { children: ReactNode }) {
  return (
    <p className="provenance">
      <span className="provenance__icon">
        <Server size={12} aria-hidden="true" />
      </span>
      <span className="provenance__text">{children}</span>
    </p>
  );
}

/** Marks a record that came from demo mode rather than the API. */
export function DemoBadge() {
  return (
    <Badge
      tone="demo"
      icon={<FlaskConical size={10} aria-hidden="true" />}
      title="Synthetic demo record — not from the backend"
    >
      Demo
    </Badge>
  );
}
