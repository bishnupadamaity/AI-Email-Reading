import { type AnalysisStatus } from '@email-ai/contracts';
import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageBody } from '../../components/layout/AppShell';
import { PageHeader, TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { ScanControls } from '../../components/layout/ScanControls';
import { Badge } from '../../components/ui/Badge';
import { CopyButton } from '../../components/ui/CopyButton';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Kpi, KpiRow } from '../../components/ui/Kpi';
import { Panel, PanelHead } from '../../components/ui/Panel';
import { AnalysisStatusBadge } from '../../components/ui/StatusBadge';
import { CapabilityNotice, DerivedNotice } from '../../components/ui/Unsupported';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { FilterTabs, SearchInput } from '../../components/ui/inputs';
import { type WorkspaceRecord } from '../../hooks/use-workspace-scan';
import { DEFAULT_SCAN_LIMIT, useWorkspaceScan } from '../../hooks/use-workspace-scan';
import { describeFailure, tokenTotals } from '../../lib/extraction';
import {
  formatCompact,
  formatDateTime,
  formatDuration,
  humanizeEnum,
  parseSender,
  truncate,
} from '../../lib/format';
import { routes } from '../../lib/navigation';
import { summarize } from '../../lib/workspace';

type StatusTab = 'all' | AnalysisStatus;

const TABS: readonly { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

interface AnalysisRow {
  record: WorkspaceRecord;
  analysisId: string;
}

/**
 * Analysis history across the scanned emails.
 *
 * There is no `GET /v1/analyses` collection, so this table is assembled from
 * each email's latest analysis. Earlier attempts exist as rows in the database
 * but no endpoint returns them.
 */
export function AnalysesPage() {
  const [limit, setLimit] = useState(DEFAULT_SCAN_LIMIT);
  const [tab, setTab] = useState<StatusTab>('all');
  const [term, setTerm] = useState('');
  const navigate = useNavigate();

  const { data, error, isPending, isFetching, refetch } = useWorkspaceScan(limit);

  const summary = useMemo(() => (data ? summarize(data.records, data.total) : null), [data]);

  const rows = useMemo<AnalysisRow[]>(() => {
    const all = (data?.records ?? [])
      .filter((record) => record.analysis !== null)
      .map((record) => ({ record, analysisId: record.analysis!.id }));

    const needle = term.trim().toLowerCase();

    return all
      .filter((row) => tab === 'all' || row.record.analysis?.status === tab)
      .filter((row) => {
        if (!needle) return true;
        const analysis = row.record.analysis!;
        return [
          analysis.id,
          analysis.modelName ?? '',
          analysis.failureCode ?? '',
          row.record.email.subject,
          row.record.email.sender,
        ]
          .join('\n')
          .toLowerCase()
          .includes(needle);
      })
      .sort(
        (left, right) =>
          new Date(right.record.analysis!.createdAt).getTime() -
          new Date(left.record.analysis!.createdAt).getTime(),
      );
  }, [data, tab, term]);

  const counts = useMemo(() => {
    const records = data?.records ?? [];
    const withAnalysis = records.filter((record) => record.analysis);
    return {
      all: withAnalysis.length,
      pending: withAnalysis.filter((record) => record.analysis?.status === 'pending').length,
      processing: withAnalysis.filter((record) => record.analysis?.status === 'processing').length,
      completed: withAnalysis.filter((record) => record.analysis?.status === 'completed').length,
      failed: withAnalysis.filter((record) => record.analysis?.status === 'failed').length,
    } satisfies Record<StatusTab, number>;
  }, [data]);

  const columns: readonly Column<AnalysisRow>[] = [
    {
      key: 'analysis',
      header: 'Analysis',
      cellClass: 'shrink',
      render: ({ record }) => (
        <span className="inline inline--sm inline--nowrap">
          <span className="mono">{record.analysis!.id.slice(0, 8)}</span>
          <CopyButton value={record.analysis!.id} label="Copy analysis id" />
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: ({ record }) => (
        <>
          <div className="table__primary">
            {truncate(record.email.subject || '(no subject)', 48)}
          </div>
          <div className="table__secondary">{parseSender(record.email.sender).name}</div>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cellClass: 'shrink',
      render: ({ record }) => <AnalysisStatusBadge status={record.analysis!.status} />,
    },
    {
      key: 'model',
      header: 'Model',
      render: ({ record }) =>
        record.analysis!.modelName ? (
          <>
            <div className="mono">{record.analysis!.modelName}</div>
            <div className="table__secondary">
              {record.analysis!.operations?.map((op) => humanizeEnum(op.operation)).join(', ') ??
                record.analysis!.modelMetadata?.provider ??
                '—'}
            </div>
          </>
        ) : (
          <span className="muted">Never ran</span>
        ),
    },
    {
      key: 'tokens',
      header: 'Tokens',
      cellClass: 'num shrink',
      render: ({ record }) => {
        const tokens = tokenTotals(record.analysis!);
        if (tokens.input == null && tokens.output == null) return <span className="muted">—</span>;
        return (
          <span className="mono">
            {formatCompact(tokens.input)} / {formatCompact(tokens.output)}
          </span>
        );
      },
    },
    {
      key: 'duration',
      header: 'Duration',
      cellClass: 'num shrink',
      render: ({ record }) => formatDuration(tokenTotals(record.analysis!).latencyMs),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: ({ record }) => {
        const analysis = record.analysis!;
        if (analysis.status === 'failed') {
          const failure = describeFailure(analysis);
          return (
            <>
              <div className="inline inline--sm">
                <Badge tone="danger">{failure.label}</Badge>
                <code className="inline-code">{analysis.failureCode}</code>
              </div>
              <div className="table__secondary">{truncate(analysis.failureMessage ?? '', 60)}</div>
            </>
          );
        }
        const extraction = analysis.extractedData;
        if (!extraction) return <span className="muted">No extraction stored</span>;
        return (
          <div className="inline inline--sm">
            {extraction.conflicts.length > 0 ? (
              <Badge tone="warning">{extraction.conflicts.length} conflict</Badge>
            ) : null}
            {extraction.missingFields.length > 0 ? (
              <Badge tone="plain">{extraction.missingFields.length} missing</Badge>
            ) : null}
            {extraction.conflicts.length === 0 && extraction.missingFields.length === 0 ? (
              <Badge tone="success">Complete</Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'created',
      header: 'Created',
      cellClass: 'shrink muted',
      render: ({ record }) => formatDateTime(record.analysis!.createdAt),
    },
  ];

  return (
    <PageBody>
      <TopbarLead title="AI Analyses" />
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
        title="AI analyses"
        description="One row per email's latest analysis run: model, cost, duration and outcome, with configuration, provider, output and internal failures distinguished."
      />

      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : null}

      {summary ? (
        <>
          <KpiRow>
            <Kpi label="Runs recorded" value={summary.ran} foot="completed or failed" />
            <Kpi
              label="Completed"
              value={summary.completed}
              tone={summary.completed > 0 ? 'success' : 'muted'}
              foot="extraction stored"
            />
            <Kpi
              label="Failed"
              value={summary.failed}
              tone={summary.failed > 0 ? 'danger' : 'default'}
              foot="recorded failures"
            />
            <Kpi
              label="Pending"
              value={summary.pending}
              tone={summary.pending > 0 ? 'warning' : 'default'}
              foot="never run"
            />
          </KpiRow>
          <DerivedNotice scanned={summary.scanned} total={summary.totalEmails} />
        </>
      ) : null}

      <CapabilityNotice capability="analysisList" title="No analyses collection endpoint" />

      <Panel>
        <PanelHead
          title="Latest analysis per email"
          actions={
            <div style={{ width: '18rem' }}>
              <SearchInput
                value={term}
                onChange={setTerm}
                label="Search analyses"
                placeholder="Id, model, failure code, subject…"
              />
            </div>
          }
        />
        <div className="toolbar toolbar--sunken">
          <FilterTabs
            label="Filter by analysis status"
            value={tab}
            onChange={setTab}
            tabs={TABS.map((entry) => ({ ...entry, count: counts[entry.value] }))}
          />
        </div>
        <DataTable
          caption="Analyses for the scanned emails"
          columns={columns}
          rows={rows}
          getRowId={(row) => row.analysisId}
          loading={isPending}
          onRowClick={(row) => navigate(routes.analysis(row.analysisId))}
          empty={
            <EmptyState
              inline
              icon={<Sparkles size={18} aria-hidden="true" />}
              title={counts.all === 0 ? 'No analyses in the scan' : 'No analyses match'}
              body={
                counts.all === 0
                  ? 'Ingesting an email creates a pending analysis record. Run one from an email workspace to see a result here.'
                  : 'Try another status tab, clear the search, or scan more emails.'
              }
            />
          }
        />
      </Panel>
    </PageBody>
  );
}
