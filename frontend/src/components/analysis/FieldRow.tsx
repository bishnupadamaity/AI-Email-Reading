import { CircleSlash, GitCompareArrows, Quote, TriangleAlert } from 'lucide-react';
import { type FieldReading } from '../../lib/extraction';
import { Badge } from '../ui/Badge';
import { CopyButton } from '../ui/CopyButton';
import { Tooltip } from '../ui/Tooltip';

const STATE_BADGE: Record<
  FieldReading['state'],
  { tone: 'success' | 'warning' | 'neutral'; label: string } | null
> = {
  extracted: null,
  conflicting: { tone: 'warning', label: 'Conflicting' },
  missing: { tone: 'warning', label: 'Reported missing' },
  not_stated: { tone: 'neutral', label: 'Not stated' },
};

/**
 * One extracted field.
 *
 * Shows the value, its state, and — when selected — the verbatim span the
 * model read it from. `evidenceLocated` is passed through from the body search:
 * a value whose evidence cannot be found in the email is flagged, because that
 * is exactly the case a reviewer needs to catch.
 */
export function FieldRow({
  field,
  selected,
  onSelect,
  evidenceLocated,
}: {
  field: FieldReading;
  selected?: boolean;
  onSelect?: (key: string) => void;
  evidenceLocated?: boolean;
}) {
  const badge = STATE_BADGE[field.state];
  const interactive = Boolean(onSelect);

  const content = (
    <>
      <span className="field-row__body">
        <span className="field-row__label">
          {field.label}
          {field.state === 'conflicting' ? <GitCompareArrows size={11} aria-hidden="true" /> : null}
        </span>

        {field.state === 'conflicting' ? (
          <span className="field-row__value">
            {field.conflict?.values.map((value, index) => (
              <span key={value}>
                {index > 0 ? <span className="muted"> vs </span> : null}
                <span className="mono">{value}</span>
              </span>
            ))}
          </span>
        ) : field.value != null ? (
          <span className="field-row__value">{field.value}</span>
        ) : (
          <span className="field-row__value field-row__value--empty">
            {field.state === 'missing'
              ? (field.missing?.reason ?? 'Reported missing')
              : 'Not stated in this email'}
          </span>
        )}

        {selected && field.evidence ? (
          <span className="field-row__evidence">
            <Quote size={10} aria-hidden="true" /> {field.evidence}
            {evidenceLocated === false ? (
              <span className="muted"> — not found verbatim in the body</span>
            ) : null}
          </span>
        ) : null}

        {selected && !field.evidence && field.value != null ? (
          <span className="field-row__evidence muted">
            The API returned no evidence span for this value.
          </span>
        ) : null}
      </span>

      <span className="field-row__side">
        {badge ? (
          <Badge tone={badge.tone}>{badge.label}</Badge>
        ) : evidenceLocated === false && field.evidence ? (
          <Tooltip label="The stored evidence span was not found in the email body" wrap>
            <Badge tone="warning" icon={<TriangleAlert size={10} aria-hidden="true" />}>
              Evidence
            </Badge>
          </Tooltip>
        ) : null}
        {field.value ? (
          <CopyButton value={field.value} label={`Copy ${field.label}`} />
        ) : (
          <Tooltip label="Nothing to copy">
            <span className="muted" style={{ display: 'inline-flex', padding: '0 0.25rem' }}>
              <CircleSlash size={11} aria-hidden="true" />
            </span>
          </Tooltip>
        )}
      </span>
    </>
  );

  if (!interactive) {
    return (
      <div className="field-row" data-state={field.state}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="field-row"
      data-interactive="true"
      data-state={field.state}
      data-selected={selected ? 'true' : undefined}
      aria-pressed={selected}
      onClick={() => onSelect?.(field.key)}
    >
      {content}
    </button>
  );
}
