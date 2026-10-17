import { ArrowLeft, Inbox, Maximize2, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EmailFilterBar, EmailStatusTabs } from '../../components/email/EmailFilterBar';
import { MailRow } from '../../components/email/MailRow';
import { PageFill } from '../../components/layout/AppShell';
import { TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { ScanControls } from '../../components/layout/ScanControls';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Panel, PanelBody, PanelHead } from '../../components/ui/Panel';
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/states';
import { DerivedNotice } from '../../components/ui/Unsupported';
import { DEFAULT_SCAN_LIMIT, useWorkspaceScan } from '../../hooks/use-workspace-scan';
import { emptyFilters, filterRecords, type EmailFilters } from '../../lib/email-filters';
import { routes } from '../../lib/navigation';
import { useSeenEmails } from '../../lib/seen-store';
import { EmailPreview } from './EmailPreview';
import { IngestEmailDialog } from '../ingest/IngestEmailDialog';

/**
 * Triage view: a dense list on the left, a preview on the right.
 *
 * The list is built from a workspace scan rather than the plain list endpoint,
 * because an operator triaging work needs each email's analysis state — and
 * the list projection carries none.
 */
export function InboxPage() {
  const { emailId } = useParams<{ emailId: string }>();
  const navigate = useNavigate();
  const [limit, setLimit] = useState(DEFAULT_SCAN_LIMIT);
  const [filters, setFilters] = useState<EmailFilters>(emptyFilters);
  const [ingestOpen, setIngestOpen] = useState(false);
  const { seen, markSeen } = useSeenEmails();

  const { data, error, isPending, isFetching, refetch } = useWorkspaceScan(limit);

  const records = useMemo(() => data?.records ?? [], [data]);
  const visible = useMemo(() => filterRecords(records, filters), [records, filters]);
  const selected = useMemo(
    () => (emailId ? records.find((record) => record.email.id === emailId) : undefined),
    [records, emailId],
  );

  useEffect(() => {
    if (emailId) markSeen(emailId);
  }, [emailId, markSeen]);

  return (
    <PageFill>
      <TopbarLead title="Email Inbox" />
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

      <div className="toolbar">
        <EmailStatusTabs
          records={records}
          value={filters.status}
          onChange={(status) => setFilters({ ...filters, status })}
        />
      </div>

      <EmailFilterBar records={records} filters={filters} onChange={setFilters} compact />

      <div className={`split${emailId ? ' split--detail-open' : ''}`}>
        <div className="split__list">
          {isPending ? (
            <LoadingRows rows={7} />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} inline />
          ) : visible.length === 0 ? (
            <EmptyState
              inline
              icon={<Inbox size={18} aria-hidden="true" />}
              title={records.length === 0 ? 'No emails ingested' : 'No emails match these filters'}
              body={
                records.length === 0
                  ? 'Ingest an email, or seed three samples with `pnpm --filter @email-ai/api seed`.'
                  : 'Filters apply to the emails this scan loaded. Increase the scan depth to look further back.'
              }
              actions={
                records.length === 0 ? (
                  <Button variant="primary" size="sm" onClick={() => setIngestOpen(true)}>
                    Ingest email
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setFilters(emptyFilters)}>
                    Clear filters
                  </Button>
                )
              }
            />
          ) : (
            <div className="mail-list">
              {visible.map((record) => (
                <MailRow
                  key={record.email.id}
                  record={record}
                  to={`${routes.inbox}/${record.email.id}`}
                  selected={record.email.id === emailId}
                  seen={seen.has(record.email.id)}
                />
              ))}
            </div>
          )}

          {data ? (
            <div className="pagination">
              <span>
                {visible.length} of {data.scanned} scanned · {data.total} in the workspace
              </span>
            </div>
          ) : null}
        </div>

        <div className="split__detail">
          {selected ? (
            <div className="page__inner">
              <div className="inline inline--between">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ArrowLeft size={13} aria-hidden="true" />}
                  onClick={() => navigate(routes.inbox)}
                >
                  Back to list
                </Button>
                <ButtonLink
                  to={routes.email(selected.email.id)}
                  size="sm"
                  variant="primary"
                  icon={<Maximize2 size={13} aria-hidden="true" />}
                >
                  Open analysis workspace
                </ButtonLink>
              </div>
              <EmailPreview record={selected} />
            </div>
          ) : (
            <div className="page__inner">
              <Panel>
                <PanelHead title="Select an email" />
                <PanelBody>
                  <EmptyState
                    inline
                    icon={<Inbox size={18} aria-hidden="true" />}
                    title="Nothing selected"
                    body="Choose an email to preview its content and extraction, or open the full analysis workspace from the preview."
                  />
                </PanelBody>
              </Panel>
              {data ? (
                <DerivedNotice scanned={data.scanned} total={data.total}>
                  Search and filters above run in the browser over these records.
                </DerivedNotice>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {ingestOpen ? <IngestEmailDialog onClose={() => setIngestOpen(false)} /> : null}
    </PageFill>
  );
}
