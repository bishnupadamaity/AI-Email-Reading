import { type Conflict } from '@email-ai/contracts';
import { GitCompareArrows } from 'lucide-react';
import { type ReactNode } from 'react';
import { FIELD_LABELS } from '../../lib/extraction';
import { humanizeFieldName } from '../../lib/format';
import { CopyButton } from '../ui/CopyButton';

/**
 * Two or more incompatible values for one field, side by side.
 *
 * No value is ever preselected or styled as the winner: the extraction
 * deliberately leaves the field `null` because choosing is a human decision,
 * and the API has no endpoint to record that choice.
 *
 * The contract carries one shared `note` per conflict rather than evidence per
 * value, so per-value evidence cannot be shown — the email body alongside is
 * the evidence.
 */
export function ConflictCard({
  conflict,
  actions,
  footer,
}: {
  conflict: Conflict;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  const label = FIELD_LABELS[conflict.field] ?? humanizeFieldName(conflict.field);

  return (
    <div className="conflict">
      <div className="conflict__head">
        <span className="conflict__field">
          <GitCompareArrows size={14} aria-hidden="true" />
          {label}
          <span className="muted" style={{ fontWeight: 'var(--weight-normal)' }}>
            · {conflict.values.length} competing values
          </span>
        </span>
        {actions ? <span className="inline inline--sm">{actions}</span> : null}
      </div>

      <div className="conflict__values">
        {conflict.values.map((value, index) => (
          <div className="conflict__value" key={`${value}-${index}`}>
            <span className="conflict__value-label">Value {index + 1}</span>
            <span className="conflict__value-text">
              {value}
              <CopyButton value={value} label={`Copy value ${index + 1}`} />
            </span>
          </div>
        ))}
      </div>

      {conflict.note ? <p className="conflict__note">Model note: {conflict.note}</p> : null}
      {footer ? <div className="conflict__note">{footer}</div> : null}
    </div>
  );
}
