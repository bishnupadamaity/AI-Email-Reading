import { CircleSlash, GitCompareArrows, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type WorkspaceRecord } from '../../hooks/use-workspace-scan';
import { isDemoId } from '../../lib/demo/demo-data';
import { formatMailTime, humanizeEnum, parseSender } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { AnalysisStatusBadge } from '../ui/StatusBadge';
import { Tooltip } from '../ui/Tooltip';
import { DemoBadge } from '../ui/Unsupported';

/**
 * One email in the inbox list.
 *
 * The leading dot is a *local* read marker (see `seen-store`); the API records
 * no read state, so it is explained on hover rather than presented as a
 * workspace-wide fact.
 */
export function MailRow({
  record,
  to,
  selected,
  seen,
}: {
  record: WorkspaceRecord;
  to: string;
  selected?: boolean;
  seen: boolean;
}) {
  const { email, analysis } = record;
  const sender = parseSender(email.sender);
  const extraction = analysis?.extractedData;
  const conflicts = extraction?.conflicts.length ?? 0;
  const missing = extraction?.missingFields.length ?? 0;

  return (
    <Link className="mail-row" to={to} data-selected={selected ? 'true' : undefined}>
      <Tooltip
        label={
          seen
            ? 'Opened in this browser. Read state is local — the API stores none.'
            : 'Not opened in this browser. Read state is local — the API stores none.'
        }
        wrap
      >
        <span
          className={`mail-row__unread${seen ? ' mail-row__unread--read' : ''}`}
          aria-label={seen ? 'Opened locally' : 'Not opened locally'}
        />
      </Tooltip>

      <span className="mail-row__body">
        <span className="mail-row__top">
          <span className="mail-row__sender">{sender.name}</span>
          <span className="mail-row__time">{formatMailTime(email.receivedAt)}</span>
        </span>
        <span className="mail-row__subject">{email.subject || '(no subject)'}</span>
        <span className="mail-row__meta">
          {analysis ? <AnalysisStatusBadge status={analysis.status} /> : null}
          {extraction ? (
            <Badge tone="plain">{humanizeEnum(extraction.classification)}</Badge>
          ) : null}
          {isDemoId(email.id) ? <DemoBadge /> : null}
        </span>
      </span>

      <span className="mail-row__flags">
        {analysis?.status === 'failed' ? (
          <Tooltip label={`Analysis failed: ${analysis.failureCode ?? 'unknown'}`} wrap>
            <span className="flag flag--danger">
              <TriangleAlert size={12} aria-hidden="true" />
            </span>
          </Tooltip>
        ) : null}
        {conflicts > 0 ? (
          <Tooltip label={`${conflicts} conflicting field(s)`}>
            <span className="flag flag--warning">
              <GitCompareArrows size={12} aria-hidden="true" />
              {conflicts}
            </span>
          </Tooltip>
        ) : null}
        {missing > 0 ? (
          <Tooltip label={`${missing} field(s) reported missing`}>
            <span className="flag flag--muted">
              <CircleSlash size={12} aria-hidden="true" />
              {missing}
            </span>
          </Tooltip>
        ) : null}
      </span>
    </Link>
  );
}
