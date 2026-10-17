import { ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBody } from '../../components/layout/AppShell';
import { PageHeader, TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { ScanControls } from '../../components/layout/ScanControls';
import { Badge } from '../../components/ui/Badge';
import { Panel, PanelBody, PanelFoot, PanelHead } from '../../components/ui/Panel';
import { CapabilityNotice, DerivedNotice } from '../../components/ui/Unsupported';
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/states';
import { FilterTabs, SearchInput } from '../../components/ui/inputs';
import { DEFAULT_SCAN_LIMIT, useWorkspaceScan } from '../../hooks/use-workspace-scan';
import { formatDateTime, formatRelative, parseSender, truncate } from '../../lib/format';
import { routes } from '../../lib/navigation';
import { activityEvents, type ActivityKind } from '../../lib/workspace';

type Category = 'all' | 'ingestion' | 'analysis' | 'failures';

const KIND_LABEL: Record<ActivityKind, string> = {
  email_ingested: 'Email ingested',
  analysis_created: 'Analysis queued',
  analysis_started: 'Analysis started',
  analysis_completed: 'Analysis completed',
  analysis_failed: 'Analysis failed',
};

const KIND_TONE: Record<ActivityKind, 'neutral' | 'accent' | 'success' | 'danger'> = {
  email_ingested: 'neutral',
  analysis_created: 'neutral',
  analysis_started: 'accent',
  analysis_completed: 'success',
  analysis_failed: 'danger',
};

const CATEGORY_KINDS: Record<Category, readonly ActivityKind[]> = {
  all: [
    'email_ingested',
    'analysis_created',
    'analysis_started',
    'analysis_completed',
    'analysis_failed',
  ],
  ingestion: ['email_ingested'],
  analysis: ['analysis_created', 'analysis_started', 'analysis_completed'],
  failures: ['analysis_failed'],
};

/**
 * Activity reconstructed from stored timestamps.
 *
 * There is no audit log. Everything here is inferred from `emails.created_at`
 * and the analysis `created_at`/`started_at`/`completed_at` columns, which is
 * all the database keeps. Review actions, extraction edits and configuration
 * changes cannot appear, because nothing records them.
 */
export function ActivityLogPage() {
  const [limit, setLimit] = useState(DEFAULT_SCAN_LIMIT);
  const [category, setCategory] = useState<Category>('all');
  const [term, setTerm] = useState('');

  const { data, error, isPending, isFetching, refetch } = useWorkspaceScan(limit);

  const events = useMemo(() => (data ? activityEvents(data.records) : []), [data]);

  const counts = useMemo(
    () =>
      ({
        all: events.length,
        ingestion: events.filter((event) => CATEGORY_KINDS.ingestion.includes(event.kind)).length,
        analysis: events.filter((event) => CATEGORY_KINDS.analysis.includes(event.kind)).length,
        failures: events.filter((event) => CATEGORY_KINDS.failures.includes(event.kind)).length,
      }) satisfies Record<Category, number>,
    [events],
  );

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return events
      .filter((event) => CATEGORY_KINDS[category].includes(event.kind))
      .filter((event) =>
        needle
          ? [event.subject, event.sender, event.detail ?? '', KIND_LABEL[event.kind]]
              .join('\n')
              .toLowerCase()
              .includes(needle)
          : true,
      );
  }, [events, category, term]);

  return (
    <PageBody>
      <TopbarLead title="Activity Log" />
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
        title="Activity log"
        description="Ingestion and analysis events for the scanned emails, in the order they happened."
      />

      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : null}

      <CapabilityNotice capability="auditLog" title="This is not an audit log" />

      {data ? <DerivedNotice scanned={data.scanned} total={data.total} /> : null}

      <Panel>
        <PanelHead
          title="Events"
          meta={`${visible.length} shown`}
          actions={
            <div style={{ width: '18rem' }}>
              <SearchInput
                value={term}
                onChange={setTerm}
                label="Search activity"
                placeholder="Subject, sender, model, failure code…"
              />
            </div>
          }
        />
        <div className="toolbar toolbar--sunken">
          <FilterTabs
            label="Filter by event category"
            value={category}
            onChange={setCategory}
            tabs={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'ingestion', label: 'Ingestion', count: counts.ingestion },
              { value: 'analysis', label: 'Analysis', count: counts.analysis },
              { value: 'failures', label: 'Failures', count: counts.failures },
            ]}
          />
        </div>

        {isPending ? (
          <LoadingRows rows={8} />
        ) : visible.length === 0 ? (
          <PanelBody>
            <EmptyState
              inline
              icon={<ScrollText size={18} aria-hidden="true" />}
              title={events.length === 0 ? 'No activity recorded' : 'No events match'}
              body={
                events.length === 0
                  ? 'Ingest an email to produce the first events.'
                  : 'Try another category or clear the search.'
              }
            />
          </PanelBody>
        ) : (
          <div className="table-scroll">
            <table className="table table--rows">
              <caption className="sr-only">Activity events</caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Sender</th>
                  <th scope="col">Detail</th>
                  <th scope="col">When</th>
                  <th scope="col">Entity</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((event) => (
                  <tr key={event.id}>
                    <td className="shrink">
                      <Badge tone={KIND_TONE[event.kind]} dot>
                        {KIND_LABEL[event.kind]}
                      </Badge>
                    </td>
                    <td>
                      <Link to={routes.email(event.emailId)}>
                        {truncate(event.subject || '(no subject)', 44)}
                      </Link>
                    </td>
                    <td className="muted">{truncate(parseSender(event.sender).name, 24)}</td>
                    <td className="muted">{event.detail ?? '—'}</td>
                    <td className="shrink" title={formatDateTime(event.at)}>
                      {formatRelative(event.at)}
                    </td>
                    <td className="shrink">
                      {event.analysisId ? (
                        <Link to={routes.analysis(event.analysisId)} className="mono">
                          {event.analysisId.slice(0, 8)}
                        </Link>
                      ) : (
                        <Link to={routes.email(event.emailId)} className="mono">
                          {event.emailId.slice(0, 8)}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PanelFoot>
          Human review actions, extraction corrections and configuration changes are absent by
          necessity: no table records them.
        </PanelFoot>
      </Panel>
    </PageBody>
  );
}
