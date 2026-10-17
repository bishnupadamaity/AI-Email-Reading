import { Braces, Mail } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { FailureNotice, ValidationIssues } from '../../components/analysis/FailureNotice';
import { FieldRow } from '../../components/analysis/FieldRow';
import { OperationsTable } from '../../components/analysis/OperationsTable';
import { PageBody } from '../../components/layout/AppShell';
import { PageHeader, TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { Badge } from '../../components/ui/Badge';
import { ButtonLink } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { Kpi, KpiRow } from '../../components/ui/Kpi';
import { Panel, PanelBody, PanelFoot, Section } from '../../components/ui/Panel';
import { AnalysisStatusBadge } from '../../components/ui/StatusBadge';
import { CapabilityNotice } from '../../components/ui/Unsupported';
import { EmptyState, ErrorState, SkeletonText } from '../../components/ui/states';
import { Segmented } from '../../components/ui/inputs';
import { useAnalysis, useEmail } from '../../hooks/use-emails';
import { readFields, tokenTotals } from '../../lib/extraction';
import { formatCompact, formatDateTime, formatDuration, humanizeEnum } from '../../lib/format';
import { routes } from '../../lib/navigation';

/** One analysis run in full: output, cost, failure detail and timestamps. */
export function AnalysisDetailPage() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const [view, setView] = useState<'fields' | 'json'>('fields');

  const analysisQuery = useAnalysis(analysisId);
  const analysis = analysisQuery.data;
  const emailQuery = useEmail(analysis?.emailId);

  if (analysisQuery.isPending) {
    return (
      <PageBody>
        <TopbarLead title="Analysis detail" />
        <SkeletonText lines={8} />
      </PageBody>
    );
  }

  if (analysisQuery.error || !analysis) {
    return (
      <PageBody>
        <TopbarLead
          title="Analysis detail"
          crumbs={[{ label: 'AI Analyses', to: routes.analyses }]}
        />
        <ErrorState
          error={analysisQuery.error}
          onRetry={() => void analysisQuery.refetch()}
          title="Could not load this analysis"
        />
      </PageBody>
    );
  }

  const tokens = tokenTotals(analysis);
  const extraction = analysis.extractedData;
  const fields = extraction ? readFields(extraction) : [];

  return (
    <PageBody>
      <TopbarLead
        title={`Analysis ${analysis.id.slice(0, 8)}`}
        crumbs={[{ label: 'AI Analyses', to: routes.analyses }]}
      />
      <TopbarActions>
        <ButtonLink
          to={routes.email(analysis.emailId)}
          size="sm"
          variant="primary"
          icon={<Mail size={13} aria-hidden="true" />}
        >
          Open email workspace
        </ButtonLink>
      </TopbarActions>

      <PageHeader
        title={
          <span className="inline inline--sm">
            Analysis run
            <span className="mono" style={{ color: 'var(--text-tertiary)' }}>
              {analysis.id.slice(0, 8)}
            </span>
            <CopyButton value={analysis.id} label="Copy full analysis id" />
          </span>
        }
        description={
          emailQuery.data
            ? `For "${emailQuery.data.subject || '(no subject)'}" from ${emailQuery.data.sender}.`
            : 'The related email is loading.'
        }
        actions={<AnalysisStatusBadge status={analysis.status} size="lg" />}
      />

      <FailureNotice analysis={analysis} />

      <KpiRow>
        <Kpi
          label="Input tokens"
          value={formatCompact(tokens.input)}
          foot={tokens.cached ? `${formatCompact(tokens.cached)} from cache` : 'no cache reported'}
          tone={tokens.input == null ? 'muted' : 'default'}
        />
        <Kpi
          label="Output tokens"
          value={formatCompact(tokens.output)}
          foot={tokens.reasoning ? `${formatCompact(tokens.reasoning)} reasoning` : ' '}
          tone={tokens.output == null ? 'muted' : 'default'}
        />
        <Kpi
          label="Latency"
          value={formatDuration(tokens.latencyMs)}
          foot="provider call time"
          tone={tokens.latencyMs == null ? 'muted' : 'default'}
        />
        <Kpi
          label="Operations"
          value={analysis.operations?.length ?? 0}
          foot={analysis.operations ? 'model calls recorded' : 'no accounting'}
          tone={analysis.operations?.length ? 'default' : 'muted'}
        />
      </KpiRow>

      <Section
        title="Extracted output"
        actions={
          extraction ? (
            <div className="inline inline--sm">
              <Segmented
                label="Output view"
                value={view}
                onChange={setView}
                options={[
                  { value: 'fields', label: 'Fields' },
                  { value: 'json', label: 'JSON' },
                ]}
              />
              <CopyButton
                value={JSON.stringify(extraction, null, 2)}
                label="Copy extraction JSON"
                size="sm"
                variant="secondary"
                withText="Copy JSON"
              />
            </div>
          ) : null
        }
      >
        <Panel>
          {extraction ? (
            view === 'fields' ? (
              <>
                <PanelBody>
                  <div className="inline inline--sm">
                    <Badge tone="info" size="lg">
                      {humanizeEnum(extraction.classification)}
                    </Badge>
                    <span>{extraction.summary}</span>
                  </div>
                </PanelBody>
                <div className="fields">
                  {fields.map((field) => (
                    <FieldRow key={field.key} field={field} />
                  ))}
                </div>
                <PanelFoot>
                  Model output as stored. Values and their evidence are immutable over the API.
                </PanelFoot>
              </>
            ) : (
              <PanelBody>
                <pre className="code-block">{JSON.stringify(extraction, null, 2)}</pre>
              </PanelBody>
            )
          ) : (
            <PanelBody>
              <EmptyState
                inline
                icon={<Braces size={18} aria-hidden="true" />}
                title="No extraction stored"
                body={
                  analysis.status === 'pending'
                    ? 'This analysis has not run. `extractedData` stays null until a run completes.'
                    : 'The run did not produce a validated extraction, so nothing was written.'
                }
              />
            </PanelBody>
          )}
        </Panel>
      </Section>

      {analysis.validationErrors?.length ? (
        <Section
          title="Validation errors"
          description="Why the model's output was rejected. Nothing is repaired: the analysis fails instead."
        >
          <Panel>
            <ValidationIssues analysis={analysis} />
          </Panel>
        </Section>
      ) : null}

      <Section title="Per-operation metadata">
        <Panel>
          <OperationsTable analysis={analysis} />
          {analysis.modelMetadata ? (
            <PanelFoot>
              Legacy totals: {analysis.modelMetadata.provider} · {analysis.modelMetadata.model} ·{' '}
              {formatDuration(analysis.modelMetadata.latencyMs)} · stop reason{' '}
              {analysis.modelMetadata.stopReason ?? '—'}
            </PanelFoot>
          ) : null}
        </Panel>
      </Section>

      <div className="grid grid--2">
        <Section title="Status transitions">
          <Panel>
            <PanelBody>
              <dl className="dl">
                <dt>Created</dt>
                <dd>{formatDateTime(analysis.createdAt)}</dd>
                <dt>Started</dt>
                <dd>
                  {analysis.startedAt ? (
                    formatDateTime(analysis.startedAt)
                  ) : (
                    <span className="muted">Never started</span>
                  )}
                </dd>
                <dt>Completed</dt>
                <dd>
                  {analysis.completedAt ? (
                    formatDateTime(analysis.completedAt)
                  ) : (
                    <span className="muted">Not finished</span>
                  )}
                </dd>
                <dt>Updated</dt>
                <dd>{formatDateTime(analysis.updatedAt)}</dd>
                <dt>Email</dt>
                <dd className="mono">{analysis.emailId}</dd>
              </dl>
            </PanelBody>
            <PanelFoot>
              Only these four timestamps are stored; there is no transition log, so intermediate
              state changes cannot be shown.
            </PanelFoot>
          </Panel>
        </Section>

        <Section title="Previous attempts">
          <Panel>
            <PanelBody>
              <CapabilityNotice capability="analysisHistory">
                A failed run is kept as its own row and a retry creates a new one, so this email may
                well have earlier attempts in the database.
              </CapabilityNotice>
            </PanelBody>
          </Panel>
        </Section>
      </div>
    </PageBody>
  );
}
