import {
  ArrowRight,
  CircleCheck,
  CircleSlash,
  FlaskConical,
  GitCompareArrows,
  Inbox,
  Plus,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PipelineFlow } from '../../components/charts/PipelineFlow';
import { VolumeChart, VolumeTable } from '../../components/charts/VolumeChart';
import { PageBody } from '../../components/layout/AppShell';
import { PageHeader, TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { ScanControls } from '../../components/layout/ScanControls';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Panel, PanelBody, PanelFoot, Section } from '../../components/ui/Panel';
import { Stat, StatGrid, SummaryBoard, SummaryLead } from '../../components/ui/Summary';
import { DerivedNotice } from '../../components/ui/Unsupported';
import { Segmented } from '../../components/ui/inputs';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/states';
import { DEFAULT_SCAN_LIMIT, useWorkspaceScan } from '../../hooks/use-workspace-scan';
import { useDemoMode } from '../../lib/demo/demo-mode-context';
import {
  formatCompact,
  formatDuration,
  formatPercent,
  formatRelative,
  humanizeEnum,
} from '../../lib/format';
import { routes } from '../../lib/navigation';
import {
  activityEvents,
  attentionItems,
  modelUsage,
  summarize,
  volumeSeries,
  type ActivityKind,
  type AttentionKind,
  type WorkspaceSummary,
} from '../../lib/workspace';
import { IngestEmailDialog } from '../ingest/IngestEmailDialog';

const RANGES = [
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
  { value: '30', label: '30d' },
] as const;

const ATTENTION_ICON: Record<AttentionKind, typeof TriangleAlert> = {
  conflict: GitCompareArrows,
  missing: CircleSlash,
  failed: TriangleAlert,
  awaiting_review: Inbox,
  not_analyzed: Sparkles,
};

const ATTENTION_LABEL: Record<AttentionKind, string> = {
  conflict: 'Conflicting details',
  missing: 'Missing information',
  failed: 'Failed analysis',
  awaiting_review: 'Waiting for review',
  not_analyzed: 'Not analysed',
};

const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  email_ingested: 'Email ingested',
  analysis_created: 'Analysis queued',
  analysis_started: 'Analysis started',
  analysis_completed: 'Analysis completed',
  analysis_failed: 'Analysis failed',
};

const ACTIVITY_DOT: Record<ActivityKind, string> = {
  email_ingested: '',
  analysis_created: '',
  analysis_started: 'timeline__dot--accent',
  analysis_completed: 'timeline__dot--success',
  analysis_failed: 'timeline__dot--danger',
};

/**
 * The lead metric is always "needs attention" — the one number that decides
 * whether an operator has work to do — but its tone and wording come from what
 * is actually in it, so an all-clear workspace reads calm rather than alarming.
 */
function leadFor(summary: WorkspaceSummary): {
  tone: 'danger' | 'warning' | 'success';
  note: string;
} {
  if (summary.failed > 0) {
    return {
      tone: 'danger',
      note:
        summary.failed === 1
          ? '1 analysis failed and needs a retry or a fix.'
          : `${summary.failed} analyses failed and need a retry or a fix.`,
    };
  }

  if (summary.needsReview > 0) {
    const parts: string[] = [];
    if (summary.conflicts > 0) parts.push(`${summary.conflicts} conflicting`);
    if (summary.missingFields > 0) parts.push(`${summary.missingFields} missing`);
    return {
      tone: 'warning',
      note: parts.length
        ? `${parts.join(', ')} ${parts.length === 1 ? 'value' : 'values'} across the scanned emails.`
        : 'Analyses flagged for a human decision.',
    };
  }

  return { tone: 'success', note: 'No conflicts, gaps or failures in the scanned emails.' };
}

export function OverviewPage() {
  const [limit, setLimit] = useState(DEFAULT_SCAN_LIMIT);
  const [range, setRange] = useState<'7' | '14' | '30'>('14');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [ingestOpen, setIngestOpen] = useState(false);
  const { enabled: demo, setEnabled: setDemo } = useDemoMode();

  const { data, error, isPending, isFetching, refetch } = useWorkspaceScan(limit);

  const summary = useMemo(() => (data ? summarize(data.records, data.total) : null), [data]);
  const attention = useMemo(() => (data ? attentionItems(data.records).slice(0, 7) : []), [data]);
  const activity = useMemo(() => (data ? activityEvents(data.records).slice(0, 6) : []), [data]);
  const usage = useMemo(() => (data ? modelUsage(data.records) : []), [data]);
  const volume = useMemo(
    () => (data ? volumeSeries(data.records, Number(range)) : []),
    [data, range],
  );

  const lead = summary ? leadFor(summary) : null;
  const emptyRange = volume.every((point) => point.received + point.completed + point.failed === 0);

  return (
    <PageBody>
      <TopbarLead title="Overview" />
      <TopbarActions>
        <ScanControls
          limit={limit}
          onLimitChange={setLimit}
          scan={data}
          onRefresh={() => void refetch()}
          refreshing={isFetching && !isPending}
        />
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={13} aria-hidden="true" />}
          onClick={() => setIngestOpen(true)}
        >
          Ingest email
        </Button>
      </TopbarActions>

      <PageHeader
        title="Operations overview"
        description="What has arrived, what needs a decision, and how the extraction is behaving. Every figure traces back to a stored email or analysis."
      />

      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : null}

      {isPending ? (
        <div className="summary">
          <div className="summary__lead">
            <Skeleton width="50%" height={10} />
            <Skeleton width="30%" height={32} />
            <Skeleton width="80%" height={10} />
          </div>
          <StatGrid>
            {Array.from({ length: 6 }, (_, index) => (
              <div className="stat" key={index}>
                <Skeleton width="60%" height={9} />
                <Skeleton width="35%" height={18} />
                <Skeleton width="70%" height={9} />
              </div>
            ))}
          </StatGrid>
        </div>
      ) : null}

      {summary && data && lead ? (
        <>
          <SummaryBoard>
            <SummaryLead
              label={
                <>
                  {lead.tone === 'success' ? (
                    <CircleCheck size={12} aria-hidden="true" />
                  ) : (
                    <TriangleAlert size={12} aria-hidden="true" />
                  )}
                  Needs attention
                </>
              }
              value={summary.needsReview}
              note={lead.note}
              tone={lead.tone}
              action={
                summary.needsReview > 0 ? (
                  <ButtonLink
                    to={routes.review}
                    size="sm"
                    variant="primary"
                    icon={<ArrowRight size={13} aria-hidden="true" />}
                  >
                    Open review queue
                  </ButtonLink>
                ) : (
                  <ButtonLink to={routes.inbox} size="sm">
                    Go to inbox
                  </ButtonLink>
                )
              }
            />
            <StatGrid>
              <Stat
                label="Emails ingested"
                value={summary.totalEmails}
                note="server total"
                to={routes.emails}
              />
              <Stat
                label="Pending"
                value={summary.pending}
                note="never analysed"
                tone={summary.pending > 0 ? 'warning' : 'muted'}
                to={routes.analyses}
              />
              <Stat
                label="Conflicts"
                value={summary.conflicts}
                note={
                  summary.conflictedEmails > 0
                    ? `across ${summary.conflictedEmails} ${summary.conflictedEmails === 1 ? 'email' : 'emails'}`
                    : 'none detected'
                }
                tone={summary.conflicts > 0 ? 'danger' : 'muted'}
                to={routes.conflicts}
              />
              <Stat
                label="Missing fields"
                value={summary.missingFields}
                note={
                  summary.emailsMissingInformation > 0
                    ? `across ${summary.emailsMissingInformation} ${summary.emailsMissingInformation === 1 ? 'email' : 'emails'}`
                    : 'none reported'
                }
                tone={summary.missingFields > 0 ? 'warning' : 'muted'}
                to={routes.missing}
              />
              <Stat
                label="Failed"
                value={summary.failed}
                note={summary.failed > 0 ? 'recorded failures' : 'none in scan'}
                tone={summary.failed > 0 ? 'danger' : 'muted'}
                to={routes.analyses}
              />
              <Stat
                label="Extraction quality"
                value={summary.extractionRate == null ? '—' : formatPercent(summary.extractionRate)}
                note={
                  summary.extractionRate == null
                    ? 'no analysis has run'
                    : `${summary.completed} of ${summary.ran} runs completed`
                }
                tone={summary.extractionRate == null ? 'muted' : 'success'}
                to={routes.evaluations}
              />
            </StatGrid>
          </SummaryBoard>

          <DerivedNotice scanned={summary.scanned} total={summary.totalEmails} />

          {summary.totalEmails === 0 ? (
            <Panel>
              <EmptyState
                icon={<Inbox size={18} aria-hidden="true" />}
                title="No emails have been ingested"
                body={
                  <>
                    The database is empty, so there is nothing to analyse yet. Ingest an email, run{' '}
                    <code className="inline-code">pnpm --filter @email-ai/api seed</code> for three
                    sample business emails, or switch on demo data to explore the interface with
                    synthetic records.
                  </>
                }
                actions={
                  <>
                    <Button
                      variant="primary"
                      icon={<Plus size={13} aria-hidden="true" />}
                      onClick={() => setIngestOpen(true)}
                    >
                      Ingest email
                    </Button>
                    {demo ? null : (
                      <Button
                        icon={<FlaskConical size={13} aria-hidden="true" />}
                        onClick={() => setDemo(true)}
                      >
                        Turn on demo data
                      </Button>
                    )}
                  </>
                }
              />
            </Panel>
          ) : (
            <>
              <div className="grid grid--main-aside">
                <Section title="Needs attention">
                  <Panel>
                    {attention.length === 0 ? (
                      <EmptyState
                        inline
                        icon={<CircleCheck size={18} aria-hidden="true" />}
                        title="Nothing is waiting on a human"
                        body="No conflicting values, reported gaps or failed runs were found in the scanned emails."
                      />
                    ) : (
                      <ul>
                        {attention.map((item) => {
                          const Icon = ATTENTION_ICON[item.kind];
                          return (
                            <li key={item.id}>
                              <Link
                                to={routes.email(item.emailId)}
                                className="attention-row"
                                data-severity={item.severity}
                              >
                                <span
                                  className={`attention-row__icon attention-row__icon--${
                                    item.severity === 'high'
                                      ? 'danger'
                                      : item.severity === 'medium'
                                        ? 'warning'
                                        : 'neutral'
                                  }`}
                                >
                                  <Icon size={13} aria-hidden="true" />
                                </span>
                                <span style={{ minWidth: 0 }}>
                                  <span className="attention-row__title">{item.title}</span>
                                  <span className="attention-row__meta">
                                    {ATTENTION_LABEL[item.kind]} · {item.detail}
                                  </span>
                                </span>
                                <span className="attention-row__side">
                                  {formatRelative(item.at)}
                                  <ArrowRight size={12} aria-hidden="true" />
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <PanelFoot>
                      <span className="inline inline--between">
                        <span>Prioritised by severity, then recency.</span>
                        <ButtonLink to={routes.review} size="xs">
                          Review queue
                        </ButtonLink>
                      </span>
                    </PanelFoot>
                  </Panel>
                </Section>

                <div className="stack stack--lg">
                  <Section title="Processing status">
                    <Panel>
                      <PanelBody>
                        <PipelineFlow summary={summary} />
                      </PanelBody>
                    </Panel>
                  </Section>

                  <Section title="Recent activity">
                    <Panel>
                      <PanelBody>
                        {activity.length === 0 ? (
                          <EmptyState inline title="No activity recorded" />
                        ) : (
                          <div className="timeline">
                            {activity.map((event) => (
                              <div className="timeline__item" key={event.id}>
                                <span className="timeline__rail">
                                  <span
                                    className={`timeline__dot ${ACTIVITY_DOT[event.kind]}`}
                                    aria-hidden="true"
                                  />
                                </span>
                                <span className="timeline__body">
                                  <span className="timeline__title">
                                    {ACTIVITY_LABEL[event.kind]}
                                  </span>
                                  <span className="timeline__meta">
                                    <Link to={routes.email(event.emailId)} className="truncate">
                                      {event.subject || '(no subject)'}
                                    </Link>
                                  </span>
                                  <span className="timeline__meta">
                                    {formatRelative(event.at)}
                                    {event.detail ? ` · ${event.detail}` : ''}
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </PanelBody>
                      <PanelFoot>
                        <span className="inline inline--between">
                          <span>From stored timestamps.</span>
                          <ButtonLink to={routes.activity} size="xs">
                            Full log
                          </ButtonLink>
                        </span>
                      </PanelFoot>
                    </Panel>
                  </Section>
                </div>
              </div>

              <Section
                title="Processing activity"
                description="Emails received and analyses finished, by day."
                actions={
                  <div className="inline inline--sm">
                    <Segmented
                      options={RANGES}
                      value={range}
                      onChange={setRange}
                      label="Time range"
                    />
                    <Segmented
                      options={[
                        { value: 'chart', label: 'Chart' },
                        { value: 'table', label: 'Table' },
                      ]}
                      value={view}
                      onChange={setView}
                      label="Chart or table view"
                    />
                  </div>
                }
              >
                <Panel>
                  {emptyRange ? (
                    <EmptyState
                      inline
                      title="No activity in this range"
                      body="Nothing was received or analysed in the selected window. Widen the range, or scan further back."
                    />
                  ) : view === 'chart' ? (
                    <PanelBody>
                      <VolumeChart points={volume} />
                    </PanelBody>
                  ) : (
                    <VolumeTable points={volume} />
                  )}
                  <PanelFoot>
                    Only scanned emails appear. An analysis is placed on the day it finished, which
                    can differ from the day its email arrived.
                  </PanelFoot>
                </Panel>
              </Section>

              <Section
                title="Model usage"
                description="Summed from per-operation accounting on the scanned analyses."
              >
                <Panel>
                  {usage.length === 0 ? (
                    <EmptyState
                      inline
                      icon={<Sparkles size={18} aria-hidden="true" />}
                      title="No model has run on these emails"
                      body="Token and latency figures appear once an analysis calls a provider. Nothing is estimated."
                    />
                  ) : (
                    <div className="table-scroll">
                      <table className="table">
                        <caption className="sr-only">Model usage by operation</caption>
                        <thead>
                          <tr>
                            <th scope="col">Operation</th>
                            <th scope="col">Model</th>
                            <th scope="col" className="num">
                              Calls
                            </th>
                            <th scope="col" className="num">
                              Failed
                            </th>
                            <th scope="col" className="num">
                              Input
                            </th>
                            <th scope="col" className="num">
                              Cached
                            </th>
                            <th scope="col" className="num">
                              Output
                            </th>
                            <th scope="col" className="num">
                              Mean latency
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {usage.map((row) => (
                            <tr key={row.key}>
                              <td className="table__primary">{humanizeEnum(row.operation)}</td>
                              <td>
                                <span className="mono">{row.model}</span>
                                <div className="table__secondary">{row.provider}</div>
                              </td>
                              <td className="num">{row.calls}</td>
                              <td className="num">
                                {row.failed > 0 ? <Badge tone="danger">{row.failed}</Badge> : '0'}
                              </td>
                              <td className="num">{formatCompact(row.inputTokens)}</td>
                              <td className="num">{formatCompact(row.cachedInputTokens)}</td>
                              <td className="num">{formatCompact(row.outputTokens)}</td>
                              <td className="num">
                                {formatDuration(Math.round(row.totalLatencyMs / row.calls))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <PanelFoot>
                    {data.demo
                      ? 'Demo records: no provider was called.'
                      : `This scan cost ${data.requestCount} API requests.`}
                  </PanelFoot>
                </Panel>
              </Section>
            </>
          )}
        </>
      ) : null}

      {ingestOpen ? <IngestEmailDialog onClose={() => setIngestOpen(false)} /> : null}
    </PageBody>
  );
}
