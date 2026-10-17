import { FlaskConical, Gauge } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageBody } from '../../components/layout/AppShell';
import { PageHeader, TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { ScanControls } from '../../components/layout/ScanControls';
import { Badge } from '../../components/ui/Badge';
import { Kpi, KpiRow } from '../../components/ui/Kpi';
import { Panel, PanelBody, PanelFoot, PanelHead, Section } from '../../components/ui/Panel';
import { CapabilityNotice, DerivedNotice } from '../../components/ui/Unsupported';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { DEFAULT_SCAN_LIMIT, useWorkspaceScan } from '../../hooks/use-workspace-scan';
import { OPERATION_ROUTING } from '../../lib/ai-config';
import { FAILURE_CODE_INFO } from '../../lib/extraction';
import { formatCompact, formatDuration, formatPercent, humanizeEnum } from '../../lib/format';
import { modelUsage, summarize } from '../../lib/workspace';

/**
 * AI quality.
 *
 * Split deliberately in two. What is *observed* — token cost, latency, failure
 * codes, how often extraction succeeded — comes from stored analyses and is
 * real. What needs a labelled dataset — accuracy, per-field precision and
 * recall, missing-field and conflict-detection performance, model comparison —
 * has no harness, no dataset and no endpoint, and is therefore left empty.
 * A fabricated accuracy number here would be worse than none.
 */
export function EvaluationsPage() {
  const [limit, setLimit] = useState(DEFAULT_SCAN_LIMIT);
  const { data, error, isPending, isFetching, refetch } = useWorkspaceScan(limit);

  const summary = useMemo(() => (data ? summarize(data.records, data.total) : null), [data]);
  const usage = useMemo(() => (data ? modelUsage(data.records) : []), [data]);

  const failureCodes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of data?.records ?? []) {
      const code = record.analysis?.failureCode;
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [data]);

  const validationFailures = useMemo(
    () =>
      (data?.records ?? []).filter(
        (record) => (record.analysis?.validationErrors?.length ?? 0) > 0,
      ),
    [data],
  );

  return (
    <PageBody>
      <TopbarLead title="Evaluations" />
      <TopbarActions>
        <ScanControls
          limit={limit}
          onLimitChange={setLimit}
          scan={data}
          onRefresh={() => void refetch()}
          refreshing={isFetching && !isPending}
        />
      </TopbarActions>

      <PageHeader
        title="AI quality and evaluation"
        description="Two different things, kept apart: what the platform has observed while running, and what would need a labelled evaluation set to know."
      />

      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : null}

      <Section
        title="Observed while running"
        description="From stored analyses. Real, but a record of what happened — not a measure of correctness."
      >
        {summary ? (
          <>
            <KpiRow>
              <Kpi
                label="Runs observed"
                value={summary.ran}
                foot="completed or failed"
                tone={summary.ran === 0 ? 'muted' : 'default'}
              />
              <Kpi
                label="Completed without failure"
                value={summary.extractionRate == null ? '—' : formatPercent(summary.extractionRate)}
                foot={
                  summary.extractionRate == null
                    ? 'no run to measure'
                    : `${summary.completed} of ${summary.ran}`
                }
                tone={summary.extractionRate == null ? 'muted' : 'success'}
              />
              <Kpi
                label="Flagged a conflict"
                value={summary.conflictedEmails}
                foot="of completed extractions"
              />
              <Kpi
                label="Flagged a missing field"
                value={summary.emailsMissingInformation}
                foot="of completed extractions"
              />
              <Kpi
                label="Invalid model output"
                value={validationFailures.length}
                foot="rejected by the shared schema"
                tone={validationFailures.length > 0 ? 'warning' : 'default'}
              />
            </KpiRow>
            <DerivedNotice scanned={summary.scanned} total={summary.totalEmails}>
              A rate over a client-side scan is not a service-level metric.
            </DerivedNotice>
          </>
        ) : null}

        <Panel>
          <PanelHead title="Token usage and latency by operation and model" />
          {usage.length === 0 ? (
            <PanelBody>
              <EmptyState
                inline
                icon={<Gauge size={18} aria-hidden="true" />}
                title="No model calls in the scan"
                body="Per-operation accounting appears once an analysis calls a provider."
              />
            </PanelBody>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <caption className="sr-only">
                  Token usage and latency by operation and model
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Operation</th>
                    <th scope="col">Model</th>
                    <th scope="col" className="num">
                      Calls
                    </th>
                    <th scope="col" className="num">
                      Succeeded
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
                      Reasoning
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
                      <td className="mono">{row.model}</td>
                      <td className="num">{row.calls}</td>
                      <td className="num">{row.succeeded}</td>
                      <td className="num">{formatCompact(row.inputTokens)}</td>
                      <td className="num">{formatCompact(row.cachedInputTokens)}</td>
                      <td className="num">{formatCompact(row.outputTokens)}</td>
                      <td className="num">{formatCompact(row.reasoningTokens)}</td>
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
            The model column is the id the provider reported serving, so an alias resolving to a
            dated snapshot is shown as what actually ran.
          </PanelFoot>
        </Panel>

        <Panel>
          <PanelHead title="Failure codes observed" />
          {failureCodes.length === 0 ? (
            <PanelBody>
              <EmptyState inline title="No failures in the scan" />
            </PanelBody>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <caption className="sr-only">Failure codes observed</caption>
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Kind</th>
                    <th scope="col" className="num">
                      Count
                    </th>
                    <th scope="col">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {failureCodes.map(([code, count]) => {
                    const info = FAILURE_CODE_INFO[code];
                    return (
                      <tr key={code}>
                        <td>
                          <code className="inline-code">{code}</code>
                        </td>
                        <td>
                          <Badge tone={info?.kind === 'provider' ? 'warning' : 'plain'}>
                            {info?.kind ?? 'unknown'}
                          </Badge>
                        </td>
                        <td className="num">{count}</td>
                        <td className="muted">{info?.hint ?? 'Unrecognised code.'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </Section>

      <Section
        title="Evaluation harness"
        description="Needed to say anything about accuracy. None of it exists yet."
      >
        <CapabilityNotice capability="evaluations" title="No evaluation runs exist" />

        <div className="grid grid--2">
          <Panel>
            <PanelHead title="Dataset" />
            <PanelBody>
              <dl className="dl">
                <dt>Labelled cases</dt>
                <dd>
                  0 — <code className="inline-code">test/evaluation-dataset/</code> is an empty
                  placeholder
                </dd>
                <dt>Contract fixtures</dt>
                <dd>
                  6 extraction fixtures exist under{' '}
                  <code className="inline-code">test/fixtures/extraction/</code>, used to test the
                  schema rather than to score a model
                </dd>
                <dt>Ground truth</dt>
                <dd>None recorded: no human-approved extraction can be stored</dd>
              </dl>
            </PanelBody>
            <PanelFoot>
              Field-level precision and recall need approved values to compare against, which is the
              same gap that disables review decisions.
            </PanelFoot>
          </Panel>

          <Panel>
            <PanelHead title="Metrics that need a harness" />
            <PanelBody>
              <ul className="stack stack--sm">
                {[
                  'Extraction accuracy per field',
                  'Precision and recall per field',
                  'Missing-field detection performance',
                  'Conflict detection performance',
                  'Model comparison across operations',
                  'Regression between model versions',
                ].map((metric) => (
                  <li key={metric} className="inline inline--sm">
                    <Badge tone="plain">No data</Badge>
                    <span>{metric}</span>
                  </li>
                ))}
              </ul>
            </PanelBody>
            <PanelFoot>
              Deliberately empty. Showing a plausible-looking percentage here would be the most
              damaging thing this dashboard could do.
            </PanelFoot>
          </Panel>
        </div>

        <Panel>
          <PanelHead
            title={
              <span className="inline inline--sm">
                <FlaskConical size={13} aria-hidden="true" />
                Operation routing
              </span>
            }
            meta="documented defaults"
          />
          <div className="table-scroll">
            <table className="table">
              <caption className="sr-only">Operation to model routing</caption>
              <thead>
                <tr>
                  <th scope="col">Operation</th>
                  <th scope="col">Environment variable</th>
                  <th scope="col">Default model</th>
                  <th scope="col">Status</th>
                  <th scope="col">Observed calls</th>
                </tr>
              </thead>
              <tbody>
                {OPERATION_ROUTING.map((entry) => {
                  const observed = usage
                    .filter((row) => row.operation === entry.operation)
                    .reduce((total, row) => total + row.calls, 0);
                  return (
                    <tr key={entry.operation}>
                      <td className="table__primary">{humanizeEnum(entry.operation)}</td>
                      <td className="mono">{entry.variable}</td>
                      <td className="mono">{entry.defaultModel}</td>
                      <td>
                        {entry.implemented ? (
                          <Badge tone="success">Implemented</Badge>
                        ) : (
                          <Badge tone="plain">Configured, no caller</Badge>
                        )}
                      </td>
                      <td className="num">{observed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PanelFoot>
            Defaults from the AI service's registry, shown because no endpoint exposes this
            deployment's configuration to the browser. The "observed calls" column is real — it
            counts per-operation records on the scanned analyses.
          </PanelFoot>
        </Panel>
      </Section>
    </PageBody>
  );
}
