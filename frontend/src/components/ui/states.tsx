import { Inbox, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { type ReactNode } from 'react';
import { describeApiError, isOffline } from '../../lib/api-client';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  body,
  actions,
  inline,
  tone = 'neutral',
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
  inline?: boolean;
  tone?: 'neutral' | 'warning' | 'danger';
}) {
  return (
    <div className={`state${inline ? ' state--inline' : ''}`}>
      <div className={`state__icon${tone === 'neutral' ? '' : ` state__icon--${tone}`}`}>
        {icon ?? <Inbox size={18} aria-hidden="true" />}
      </div>
      <p className="state__title">{title}</p>
      {body ? <div className="state__body">{body}</div> : null}
      {actions ? <div className="state__actions">{actions}</div> : null}
    </div>
  );
}

/**
 * Failed request. Connection failures are separated from responses the API
 * chose to send, because the operator action is different.
 */
export function ErrorState({
  error,
  onRetry,
  title,
  inline,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  inline?: boolean;
}) {
  const offline = isOffline(error);

  return (
    <div className={`state${inline ? ' state--inline' : ''}`}>
      <div className="state__icon state__icon--danger">
        {offline ? (
          <WifiOff size={18} aria-hidden="true" />
        ) : (
          <TriangleAlert size={18} aria-hidden="true" />
        )}
      </div>
      <p className="state__title">
        {title ?? (offline ? 'Cannot reach the API' : 'Request failed')}
      </p>
      <div className="state__body">{describeApiError(error)}</div>
      {onRetry ? (
        <div className="state__actions">
          <Button onClick={onRetry} icon={<RefreshCw size={13} aria-hidden="true" />}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function Skeleton({ width, height = 12 }: { width?: number | string; height?: number }) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ display: 'block', width: width ?? '100%', height }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

/** Table-shaped placeholder so the layout does not jump when rows arrive. */
export function SkeletonTable({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="table-scroll" aria-busy="true" aria-live="polite">
      <table className="table">
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }, (_, columnIndex) => (
                <td key={columnIndex}>
                  <Skeleton width={columnIndex === 0 ? '70%' : '45%'} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="stack" style={{ padding: 'var(--space-5)' }} aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="stack stack--sm">
          <Skeleton width="35%" />
          <Skeleton width="80%" height={10} />
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}
