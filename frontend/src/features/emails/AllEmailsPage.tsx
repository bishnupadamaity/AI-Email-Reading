import { type EmailSummary } from '@email-ai/contracts';
import { Play, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageBody } from '../../components/layout/AppShell';
import { PageHeader, TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { Button } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { DataTable, Pagination, type Column, type SortState } from '../../components/ui/DataTable';
import { Panel, PanelHead } from '../../components/ui/Panel';
import { EmailStatusBadge } from '../../components/ui/StatusBadge';
import { LiveNotice, UnsupportedTag } from '../../components/ui/Unsupported';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { SearchInput } from '../../components/ui/inputs';
import { Tooltip } from '../../components/ui/Tooltip';
import { useEmailsPage } from '../../hooks/use-emails';
import { isDemoId } from '../../lib/demo/demo-data';
import { useDemoMode } from '../../lib/demo/demo-mode-context';
import { formatDateTime, formatMailTime, parseSender, truncate } from '../../lib/format';
import { routes } from '../../lib/navigation';
import { BulkAnalyzeDialog } from './BulkAnalyzeDialog';
import { IngestEmailDialog } from '../ingest/IngestEmailDialog';

/**
 * The full table, on the API's own pagination.
 *
 * Unlike the inbox this reads `GET /v1/emails` directly, so it scales to any
 * number of rows — at the cost of the list projection carrying no analysis and
 * no body. Both limits are stated rather than papered over with per-row
 * requests.
 */
export function AllEmailsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<SortState | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [ingestOpen, setIngestOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const { enabled: demo } = useDemoMode();
  const term = searchParams.get('q') ?? '';
  const { data, error, isPending, isFetching, refetch } = useEmailsPage(page, pageSize);

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const needle = term.trim().toLowerCase();

    const filtered = needle
      ? items.filter(
          (item) =>
            item.sender.toLowerCase().includes(needle) ||
            item.subject.toLowerCase().includes(needle),
        )
      : items;

    if (!sort) return filtered;

    const sorted = [...filtered].sort((left, right) => {
      switch (sort.key) {
        case 'sender':
          return left.sender.localeCompare(right.sender);
        case 'subject':
          return left.subject.localeCompare(right.subject);
        case 'processingStatus':
          return left.processingStatus.localeCompare(right.processingStatus);
        default:
          return new Date(left.receivedAt).getTime() - new Date(right.receivedAt).getTime();
      }
    });

    return sort.direction === 'desc' ? sorted.reverse() : sorted;
  }, [data, term, sort]);

  const selectedEmails = useMemo(
    () => (data?.items ?? []).filter((item) => selectedIds.has(item.id)),
    [data, selectedIds],
  );

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'receivedAt' ? 'desc' : 'asc' },
    );
  };

  const columns: readonly Column<EmailSummary>[] = [
    {
      key: 'sender',
      header: 'Sender',
      sortable: true,
      render: (row) => {
        const sender = parseSender(row.sender);
        return (
          <>
            <div className="table__primary">{truncate(sender.name, 34)}</div>
            <div className="table__secondary mono">{truncate(sender.address, 34)}</div>
          </>
        );
      },
    },
    {
      key: 'subject',
      header: 'Subject',
      sortable: true,
      render: (row) => (
        <div className="inline inline--sm">
          <span>{row.subject || <span className="muted">(no subject)</span>}</span>
          {isDemoId(row.id) ? <span className="badge badge--demo">Demo</span> : null}
        </div>
      ),
    },
    {
      key: 'receivedAt',
      header: 'Received',
      sortable: true,
      cellClass: 'shrink',
      render: (row) => (
        <span title={formatDateTime(row.receivedAt)}>{formatMailTime(row.receivedAt)}</span>
      ),
    },
    {
      key: 'processingStatus',
      header: 'Email status',
      sortable: true,
      cellClass: 'shrink',
      render: (row) => <EmailStatusBadge status={row.processingStatus} />,
    },
    {
      key: 'id',
      header: 'Id',
      cellClass: 'shrink mono',
      render: (row) => (
        <span className="inline inline--sm inline--nowrap">
          {row.id.slice(0, 8)}
          <CopyButton value={row.id} label="Copy email id" />
        </span>
      ),
    },
  ];

  return (
    <PageBody>
      <TopbarLead title="All Emails" />
      <TopbarActions>
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
        title="All emails"
        description="Every ingested email, newest first, paginated by the API. This table reads the list projection: it has no body and no analysis, so searching here covers sender and subject on the current page only."
      />

      <LiveNotice>
        <strong>Straight from the API</strong> · <code className="inline-code">GET /v1/emails</code>{' '}
        with the server's own ordering and page size. No client-side aggregation on this page.
      </LiveNotice>

      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : null}

      <Panel>
        <PanelHead
          title="Emails"
          meta={data ? `${data.total} total` : undefined}
          actions={
            <div className="inline inline--sm">
              <div style={{ width: '18rem' }}>
                <SearchInput
                  value={term}
                  onChange={(value) =>
                    setSearchParams(value ? { q: value } : {}, { replace: true })
                  }
                  label="Search this page"
                  placeholder="Sender or subject on this page"
                />
              </div>
              <UnsupportedTag capability="serverSideSearch" />
            </div>
          }
        />

        {selectedIds.size > 0 ? (
          <div className="bulkbar">
            <span>{selectedIds.size} selected on this page</span>
            {demo ? (
              <Tooltip
                label="Demo data is on. Switch to live data to run analyses — nothing is sent to the API in demo mode."
                wrap
              >
                <Button size="sm" variant="primary" disabled icon={<Play size={12} />}>
                  Run analysis
                </Button>
              </Tooltip>
            ) : (
              <Button
                size="sm"
                variant="primary"
                icon={<Play size={12} aria-hidden="true" />}
                onClick={() => setBulkOpen(true)}
              >
                Run analysis
              </Button>
            )}
            <CopyButton
              value={JSON.stringify(
                selectedEmails.map((item) => item.id),
                null,
                2,
              )}
              label="Copy selected ids as JSON"
              size="sm"
              variant="secondary"
              withText="Copy ids"
            />
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
        ) : null}

        <DataTable
          caption="All ingested emails"
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          loading={isPending}
          sort={sort}
          onSortChange={toggleSort}
          onRowClick={(row) => navigate(routes.email(row.id))}
          selection={{
            selectedIds,
            onToggle: (id) =>
              setSelectedIds((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              }),
            onToggleAll: () =>
              setSelectedIds((current) =>
                current.size === rows.length ? new Set() : new Set(rows.map((row) => row.id)),
              ),
            label: (row) => `Select ${row.subject || 'email'}`,
          }}
          empty={
            <EmptyState
              inline
              title={term ? 'No match on this page' : 'No emails ingested'}
              body={
                term
                  ? 'The API cannot search across pages, so only this page was checked. Try another page or clear the search.'
                  : 'Ingest an email, or seed three samples with `pnpm --filter @email-ai/api seed`.'
              }
              actions={
                term ? (
                  <Button size="sm" onClick={() => setSearchParams({}, { replace: true })}>
                    Clear search
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => setIngestOpen(true)}>
                    Ingest email
                  </Button>
                )
              }
            />
          }
        />

        {data ? (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={(next) => {
              setPage(next);
              setSelectedIds(new Set());
            }}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
              setSelectedIds(new Set());
            }}
            itemLabel="emails"
            note={
              <>
                server-side pagination
                {isFetching && !isPending ? ' · refreshing' : ''}
                {term ? ` · ${rows.length} shown after local search` : ''}
              </>
            }
          />
        ) : null}
      </Panel>

      {ingestOpen ? <IngestEmailDialog onClose={() => setIngestOpen(false)} /> : null}
      {bulkOpen ? (
        <BulkAnalyzeDialog
          emails={selectedEmails.map((item) => ({ id: item.id, subject: item.subject }))}
          onClose={() => setBulkOpen(false)}
        />
      ) : null}
    </PageBody>
  );
}
