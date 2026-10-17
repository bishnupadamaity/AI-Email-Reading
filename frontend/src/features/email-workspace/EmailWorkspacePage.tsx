import { type AnalysisDetail } from '@email-ai/contracts';
import { ChevronDown, ChevronUp, History, Info, Paperclip, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnalyzeButton } from '../../components/analysis/AnalyzeButton';
import { EmailBody } from '../../components/analysis/EmailBody';
import { ExtractionPanel } from '../../components/analysis/ExtractionPanel';
import { FailureNotice, ValidationIssues } from '../../components/analysis/FailureNotice';
import { OperationsTable } from '../../components/analysis/OperationsTable';
import { PageFill } from '../../components/layout/AppShell';
import { TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { Panel, PanelBody, PanelFoot, PanelHead } from '../../components/ui/Panel';
import { AnalysisStatusBadge, EmailStatusBadge } from '../../components/ui/StatusBadge';
import { CapabilityNotice, DemoBadge, UnsupportedButton } from '../../components/ui/Unsupported';
import { EmptyState, ErrorState, SkeletonText } from '../../components/ui/states';
import { useAnalysis, useEmail } from '../../hooks/use-emails';
import { isDemoId } from '../../lib/demo/demo-data';
import { locateEvidence, type EvidenceSpan } from '../../lib/evidence';
import { readFields, tokenTotals } from '../../lib/extraction';
import {
  formatCompact,
  formatDateTime,
  formatDuration,
  parseSender,
  truncate,
} from '../../lib/format';
import { routes } from '../../lib/navigation';

/**
 * The analysis workspace: the email on the left, the AI's reading on the right.
 *
 * Selecting a field highlights the span the value was read from, in the body,
 * so a reviewer can check the model's work without re-reading the message.
 */
export function EmailWorkspacePage() {
  const { emailId } = useParams<{ emailId: string }>();
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);

  const emailQuery = useEmail(emailId);
  const email = emailQuery.data;
  const analysisQuery = useAnalysis(email?.latestAnalysis?.id);
  const analysis = analysisQuery.data ?? null;

  const extraction = analysis?.extractedData ?? null;

  const spans = useMemo<EvidenceSpan[]>(() => {
    if (!extraction) return [];
    return readFields(extraction)
      .filter((field) => field.evidence)
      .map((field) => ({ key: field.key, text: field.evidence as string }));
  }, [extraction]);

  const located = useMemo(
    () =>
      email ? locateEvidence(email.bodyText, spans, selectedField).located : new Set<string>(),
    [email, spans, selectedField],
  );

  const tokens = analysis ? tokenTotals(analysis) : null;
  const sender = email ? parseSender(email.sender) : null;

  if (emailQuery.isPending) {
    return (
      <PageFill>
        <TopbarLead title="Email analysis" />
        <div className="page__inner">
          <SkeletonText lines={6} />
        </div>
      </PageFill>
    );
  }

  if (emailQuery.error || !email) {
    return (
      <PageFill>
        <TopbarLead title="Email analysis" crumbs={[{ label: 'Inbox', to: routes.inbox }]} />
        <div className="page__inner">
          <ErrorState
            error={emailQuery.error}
            onRetry={() => void emailQuery.refetch()}
            title="Could not load this email"
          />
        </div>
      </PageFill>
    );
  }

  return (
    <PageFill>
      <TopbarLead
        title={truncate(email.subject || '(no subject)', 60)}
        crumbs={[{ label: 'Inbox', to: routes.inbox }, { label: sender?.name ?? email.sender }]}
      />
      <TopbarActions>
        {analysis ? (
          <ButtonLink to={routes.analysis(analysis.id)} size="sm">
            Analysis detail
          </ButtonLink>
        ) : null}
        <AnalyzeButton emailId={email.id} analysis={analysis} />
      </TopbarActions>

      <div className="workspace">
        <div className="workspace__primary">
          <div className="page__inner">
            <div className="email-head">
              <div className="inline inline--sm">
                {analysis ? <AnalysisStatusBadge status={analysis.status} size="lg" /> : null}
                <EmailStatusBadge status={email.processingStatus} />
                {isDemoId(email.id) ? <DemoBadge /> : null}
              </div>
              <h1 className="email-head__subject">{email.subject || '(no subject)'}</h1>
              <div className="email-head__row">
                <strong>{sender?.name}</strong>
                <span className="muted mono">{sender?.address}</span>
                <CopyButton value={email.sender} label="Copy sender" />
              </div>
              <div className="email-head__row">
                <span className="muted">Received {formatDateTime(email.receivedAt)}</span>
                <span className="muted">· Ingested {formatDateTime(email.createdAt)}</span>
              </div>
            </div>

            {analysis ? (
              <FailureNotice
                analysis={analysis}
                actions={<AnalyzeButton emailId={email.id} analysis={analysis} size="xs" />}
              />
            ) : null}

            <Panel>
              <PanelHead
                title="Headers and metadata"
                actions={
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setMetaOpen((value) => !value)}
                    icon={
                      metaOpen ? (
                        <ChevronUp size={13} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={13} aria-hidden="true" />
                      )
                    }
                    aria-expanded={metaOpen}
                  >
                    {metaOpen ? 'Hide' : 'Show'}
                  </Button>
                }
              />
              {metaOpen ? (
                <PanelBody>
                  <dl className="dl">
                    <dt>Email id</dt>
                    <dd className="mono">
                      {email.id} <CopyButton value={email.id} label="Copy email id" />
                    </dd>
                    <dt>Provider message id</dt>
                    <dd className="mono">{email.externalMessageId ?? '—'}</dd>
                    <dt>Email account</dt>
                    <dd>
                      {email.emailAccountId ?? (
                        <span className="muted">
                          None — accounts and tenancy are not implemented
                        </span>
                      )}
                    </dd>
                    <dt>Recipients</dt>
                    <dd className="muted">
                      Not stored. The ingestion contract records the sender only, so no To/Cc can be
                      shown.
                    </dd>
                    <dt>Processing status</dt>
                    <dd>
                      <EmailStatusBadge status={email.processingStatus} />
                    </dd>
                    <dt>Updated</dt>
                    <dd>{formatDateTime(email.updatedAt)}</dd>
                  </dl>
                </PanelBody>
              ) : null}
            </Panel>

            <Panel>
              <PanelHead
                title="Original email"
                meta={
                  spans.length > 0
                    ? `${located.size} of ${spans.length} evidence spans located`
                    : 'Plain text, as ingested'
                }
                actions={
                  <CopyButton value={email.bodyText} label="Copy email body" withText="Copy" />
                }
              />
              <PanelBody>
                <EmailBody body={email.bodyText} spans={spans} activeKey={selectedField} />
              </PanelBody>
              {spans.length > 0 ? (
                <PanelFoot>
                  Highlights are verbatim evidence spans returned by the extraction. Selecting a
                  field on the right scrolls to and emphasises its span.
                </PanelFoot>
              ) : null}
            </Panel>

            <Panel>
              <PanelHead
                title={
                  <span className="inline inline--sm">
                    <Paperclip size={13} aria-hidden="true" />
                    Attachments
                  </span>
                }
              />
              <PanelBody>
                <CapabilityNotice capability="attachments" title="Attachments are not ingested">
                  This email may have had attachments on the mail server; the platform never
                  received them.
                </CapabilityNotice>
              </PanelBody>
            </Panel>
          </div>
        </div>

        <div className="workspace__secondary">
          {analysisQuery.isPending && email.latestAnalysis ? (
            <div className="panel__body">
              <SkeletonText lines={8} />
            </div>
          ) : analysisQuery.error ? (
            <div className="panel__body">
              <ErrorState
                error={analysisQuery.error}
                onRetry={() => void analysisQuery.refetch()}
                title="Could not load the analysis"
                inline
              />
            </div>
          ) : !analysis ? (
            <div className="panel__body">
              <EmptyState
                title="No analysis record"
                body="Ingestion normally creates a pending analysis in the same transaction, so this is unexpected."
              />
            </div>
          ) : extraction ? (
            <>
              <ExtractionPanel
                analysis={analysis}
                selectedField={selectedField}
                onSelectField={(key) => setSelectedField(key === selectedField ? null : key)}
                locatedKeys={located}
              />
              <AnalysisMeta analysis={analysis} tokens={tokens} />
            </>
          ) : (
            <>
              <div className="panel__head">
                <div className="inline inline--sm">
                  <Sparkles size={14} aria-hidden="true" style={{ color: 'var(--accent)' }} />
                  <h2 className="panel__title">AI extraction</h2>
                  <AnalysisStatusBadge status={analysis.status} />
                </div>
              </div>
              <div className="panel__body stack">
                <EmptyState
                  inline
                  title={
                    analysis.status === 'failed'
                      ? 'No extraction was stored'
                      : analysis.status === 'processing'
                        ? 'Analysis in progress'
                        : 'Not analysed yet'
                  }
                  body={
                    analysis.status === 'failed'
                      ? 'The run was recorded as failed, so there is nothing to review. Retrying starts a new run and keeps this attempt as history.'
                      : analysis.status === 'processing'
                        ? 'One analysis runs at a time per email. Reload once it finishes.'
                        : 'Running extraction calls the configured model once, synchronously, and stores what it returns.'
                  }
                  actions={<AnalyzeButton emailId={email.id} analysis={analysis} />}
                />
                {analysis.validationErrors?.length ? (
                  <Panel>
                    <PanelHead
                      title="Validation issues"
                      meta={`${analysis.validationErrors.length} reported`}
                    />
                    <ValidationIssues analysis={analysis} />
                  </Panel>
                ) : null}
              </div>
              <AnalysisMeta analysis={analysis} tokens={tokens} />
            </>
          )}
        </div>
      </div>
    </PageFill>
  );
}

function AnalysisMeta({
  analysis,
  tokens,
}: {
  analysis: AnalysisDetail;
  tokens: ReturnType<typeof tokenTotals> | null;
}) {
  return (
    <>
      <div className="field-group__head">
        <span>Run details</span>
      </div>
      <div className="panel__body">
        <dl className="dl">
          <dt>Status</dt>
          <dd>
            <AnalysisStatusBadge status={analysis.status} />
          </dd>
          <dt>Model</dt>
          <dd className="mono">{analysis.modelName ?? '—'}</dd>
          <dt>Provider</dt>
          <dd>{analysis.modelMetadata?.provider ?? '—'}</dd>
          <dt>Tokens</dt>
          <dd>
            {tokens && (tokens.input != null || tokens.output != null) ? (
              <span className="inline inline--sm">
                <Badge tone="plain">in {formatCompact(tokens.input)}</Badge>
                <Badge tone="plain">out {formatCompact(tokens.output)}</Badge>
                {tokens.cached ? (
                  <Badge tone="plain">cached {formatCompact(tokens.cached)}</Badge>
                ) : null}
                {tokens.reasoning ? (
                  <Badge tone="plain">reasoning {formatCompact(tokens.reasoning)}</Badge>
                ) : null}
              </span>
            ) : (
              <span className="muted">Not reported</span>
            )}
          </dd>
          <dt>Latency</dt>
          <dd>{formatDuration(tokens?.latencyMs ?? null)}</dd>
          <dt>Started</dt>
          <dd>{formatDateTime(analysis.startedAt)}</dd>
          <dt>Completed</dt>
          <dd>{formatDateTime(analysis.completedAt)}</dd>
          <dt>Stop reason</dt>
          <dd>{analysis.modelMetadata?.stopReason ?? '—'}</dd>
        </dl>
      </div>

      {analysis.operations?.length ? (
        <>
          <div className="field-group__head">
            <span>Operations · {analysis.operations.length}</span>
          </div>
          <OperationsTable analysis={analysis} />
        </>
      ) : null}

      <div className="field-group__head">
        <span>History</span>
      </div>
      <div className="panel__body stack stack--sm">
        <div className="inline inline--sm">
          <UnsupportedButton capability="analysisHistory" icon={<History size={12} />}>
            View previous attempts
          </UnsupportedButton>
        </div>
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          <Info size={11} aria-hidden="true" /> Failed attempts are kept as separate rows, but no
          endpoint lists an email's analyses — only the latest is reachable.
        </p>
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          Analysing an email makes one model call, on the extraction model. Classification,
          summarization and conflict resolution are configured in the AI service but have no caller.
        </p>
      </div>
    </>
  );
}
