export type StatusTone = 'ok' | 'error' | 'pending';

const LABELS: Record<StatusTone, string> = {
  ok: 'Connected',
  error: 'Unavailable',
  pending: 'Checking',
};

export function StatusBadge({ tone, label }: { tone: StatusTone; label?: string }) {
  return (
    <span className={`badge badge--${tone}`}>
      <span className="badge__dot" aria-hidden="true" />
      {label ?? LABELS[tone]}
    </span>
  );
}
