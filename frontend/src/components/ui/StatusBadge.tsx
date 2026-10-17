import { type AnalysisStatus, type EmailStatus } from '@email-ai/contracts';
import {
  ANALYSIS_STATUS_LABELS,
  ANALYSIS_STATUS_TONE,
  SEVERITY_TONE,
  type Severity,
  type Tone,
} from '../../lib/extraction';
import { humanizeEnum } from '../../lib/format';
import { Badge } from './Badge';

/** Analysis lifecycle: the status the API recorded for a run. */
export function AnalysisStatusBadge({
  status,
  size,
}: {
  status: AnalysisStatus;
  size?: 'sm' | 'lg';
}) {
  return (
    <Badge tone={ANALYSIS_STATUS_TONE[status]} dot size={size}>
      {ANALYSIS_STATUS_LABELS[status]}
    </Badge>
  );
}

const EMAIL_STATUS_TONE: Record<EmailStatus, Tone> = {
  received: 'neutral',
  queued: 'neutral',
  analyzing: 'info',
  analyzed: 'success',
  needs_review: 'warning',
  failed: 'danger',
};

/** Email processing lifecycle. Today the API only ever sets `received`. */
export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return (
    <Badge tone={EMAIL_STATUS_TONE[status]} dot>
      {humanizeEnum(status)}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{humanizeEnum(severity)}</Badge>;
}

export type ConnectionTone = 'ok' | 'error' | 'pending' | 'disabled';

const CONNECTION: Record<ConnectionTone, { tone: Tone; label: string }> = {
  ok: { tone: 'success', label: 'Connected' },
  error: { tone: 'danger', label: 'Unavailable' },
  pending: { tone: 'neutral', label: 'Checking' },
  disabled: { tone: 'neutral', label: 'Disabled' },
};

/** Service/dependency reachability, used by the health surfaces. */
export function ConnectionBadge({ tone, label }: { tone: ConnectionTone; label?: string }) {
  const preset = CONNECTION[tone];
  return (
    <Badge tone={preset.tone} dot>
      {label ?? preset.label}
    </Badge>
  );
}
