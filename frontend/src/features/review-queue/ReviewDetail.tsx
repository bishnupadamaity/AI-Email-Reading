import { ArrowLeft, CircleCheck, Flag, Pencil, SquareCheck, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AnalyzeButton } from '../../components/analysis/AnalyzeButton';
import { ConflictCard } from '../../components/analysis/ConflictCard';
import { EmailBody } from '../../components/analysis/EmailBody';
import { FailureNotice, ValidationIssues } from '../../components/analysis/FailureNotice';
import { FieldRow } from '../../components/analysis/FieldRow';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Panel, PanelBody, PanelFoot, PanelHead } from '../../components/ui/Panel';
import { SeverityBadge } from '../../components/ui/StatusBadge';
import { UnsupportedButton } from '../../components/ui/Unsupported';
import { locateEvidence, type EvidenceSpan } from '../../lib/evidence';
import { REVIEW_REASON_LABELS, readFields } from '../../lib/extraction';
import { formatAge, formatDateTime, parseSender } from '../../lib/format';
import { routes } from '../../lib/navigation';
import { type ReviewItem } from '../../lib/workspace';

/**
 * Review detail: the evidence next to the claim.
 *
 * Only the fields that triggered review are shown first — a reviewer's job is
 * the exceptions, not re-reading twelve correct values — with the full field
 * list below and the email body alongside for verification.
 */
export function ReviewDetail({ item, onBack }: { item: ReviewItem; onBack: () => void }) {
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const { email, analysis } = item;
  const extraction = analysis?.extractedData ?? null;
  const sender = parseSender(email.sender);

  const fields = useMemo(() => (extraction ? readFields(extraction) : []), [extraction]);
  const flagged = fields.filter(
    (field) => field.state === 'conflicting' || field.state === 'missing',
  );

  const spans = useMemo<EvidenceSpan[]>(
    () =>
      fields
        .filter((field) => field.evidence)
        .map((field) => ({ key: field.key, text: field.evidence as string })),
    [fields],
  );

  const located = useMemo(
    () => locateEvidence(email.bodyText, spans, selectedField).located,
    [email.bodyText, spans, selectedField],
  );

  return (
    <div className="page__inner">
      {/* Only reachable on narrow screens, where the detail covers the queue. */}
      <div className="review-back">
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowLeft size={13} aria-hidden="true" />}
          onClick={onBack}
        >
          Back to queue
        </Button>
      </div>

      <div className="stack stack--sm">
        <div className="inline inline--sm">
          <SeverityBadge severity={item.severity} />
          {item.signals.map((signal) => (
            <Badge key={signal.reason} tone="plain">
              {REVIEW_REASON_LABELS[signal.reason]}
              {signal.count > 1 ? ` · ${signal.count}` : ''}
            </Badge>
          ))}
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            waiting {formatAge(item.since)}
          </span>
        </div>
        <h2 className="email-head__subject">{email.subject || '(no subject)'}</h2>
        <div className="email-head__row">
          <strong>{sender.name}</strong>
          <span className="muted mono">{sender.address}</span>
          <span className="muted">· received {formatDateTime(email.receivedAt)}</span>
        </div>
      </div>

      {analysis ? (
        <FailureNotice
          analysis={analysis}
          actions={<AnalyzeButton emailId={email.id} analysis={analysis} size="xs" />}
        />
      ) : null}

      <Panel>
        <PanelHead title="Why this is in the queue" />
        <PanelBody>
          <ul className="stack stack--sm">
            {item.signals.map((signal) => (
              <li key={signal.reason} className="inline inline--sm">
                <Badge tone={signal.severity === 'high' ? 'danger' : 'warning'}>
                  {REVIEW_REASON_LABELS[signal.reason]}
                </Badge>
                <span>{signal.detail}</span>
              </li>
            ))}
          </ul>
        </PanelBody>
        <PanelFoot>
          Reasons are derived in the browser from the stored analysis. The API has no review queue,
          so nothing here is assigned, claimed or persisted.
        </PanelFoot>
      </Panel>

      {analysis?.validationErrors?.length ? (
        <Panel>
          <PanelHead title="Validation issues" meta={`${analysis.validationErrors.length}`} />
          <ValidationIssues analysis={analysis} />
        </Panel>
      ) : null}

      {extraction && extraction.conflicts.length > 0 ? (
        <div className="stack stack--sm">
          {extraction.conflicts.map((conflict) => (
            <ConflictCard
              key={conflict.field}
              conflict={conflict}
              footer="Compare against the email body below. Recording a decision needs POST /v1/analyses/:id/conflicts/:field/resolve, which does not exist."
            />
          ))}
        </div>
      ) : null}

      <div className="grid grid--2">
        <Panel>
          <PanelHead
            title="Original email"
            meta={spans.length ? `${located.size}/${spans.length} spans located` : undefined}
          />
          <PanelBody>
            <EmailBody body={email.bodyText} spans={spans} activeKey={selectedField} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHead
            title="Fields needing attention"
            meta={flagged.length ? `${flagged.length} flagged` : 'none flagged'}
          />
          {flagged.length > 0 ? (
            <div className="fields">
              {flagged.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  selected={selectedField === field.key}
                  onSelect={(key) => setSelectedField(key === selectedField ? null : key)}
                  evidenceLocated={field.evidence ? located.has(field.key) : undefined}
                />
              ))}
            </div>
          ) : (
            <PanelBody>
              <p className="muted">
                No field-level flags: this item is queued because of the analysis outcome rather
                than a specific value.
              </p>
            </PanelBody>
          )}

          {fields.length > 0 ? (
            <>
              <div className="field-group__head">
                <span>All extracted fields</span>
              </div>
              <div className="fields">
                {fields
                  .filter((field) => field.state === 'extracted')
                  .map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      selected={selectedField === field.key}
                      onSelect={(key) => setSelectedField(key === selectedField ? null : key)}
                      evidenceLocated={field.evidence ? located.has(field.key) : undefined}
                    />
                  ))}
              </div>
            </>
          ) : null}
        </Panel>
      </div>

      <Panel>
        <PanelHead title="Decision" />
        <PanelBody className="stack stack--sm">
          <div className="inline inline--sm">
            <UnsupportedButton capability="reviewDecision" icon={<CircleCheck size={12} />}>
              Approve
            </UnsupportedButton>
            <UnsupportedButton capability="fieldEdit" icon={<Pencil size={12} />}>
              Correct values
            </UnsupportedButton>
            <UnsupportedButton capability="reviewDecision" icon={<Flag size={12} />}>
              Reject
            </UnsupportedButton>
            <UnsupportedButton capability="reviewDecision" icon={<SquareCheck size={12} />}>
              Mark reviewed
            </UnsupportedButton>
            <UnsupportedButton capability="reviewerAssignment" icon={<UserPlus size={12} />}>
              Assign
            </UnsupportedButton>
          </div>
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            The contract already defines the decision vocabulary (
            <code className="inline-code">approved</code>,{' '}
            <code className="inline-code">corrected</code>,{' '}
            <code className="inline-code">rejected</code>) but no endpoint accepts it. Re-running
            the analysis is the only state change available here.
          </p>
          <div className="inline inline--sm">
            {analysis ? <AnalyzeButton emailId={email.id} analysis={analysis} /> : null}
            <ButtonLink to={routes.email(email.id)} size="sm">
              Open full workspace
            </ButtonLink>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
