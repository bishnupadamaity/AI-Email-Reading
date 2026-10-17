import { GitCompareArrows } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConflictCard } from '../../components/analysis/ConflictCard';
import { EmailBody } from '../../components/analysis/EmailBody';
import { PageBody } from '../../components/layout/AppShell';
import { PageHeader, TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { ScanControls } from '../../components/layout/ScanControls';
import { Badge } from '../../components/ui/Badge';
import { ButtonLink } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Kpi, KpiRow } from '../../components/ui/Kpi';
import { Panel, PanelBody, PanelHead } from '../../components/ui/Panel';
import { Drawer } from '../../components/ui/overlays';
import {
  CapabilityNotice,
  DerivedNotice,
  UnsupportedButton,
} from '../../components/ui/Unsupported';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { SearchInput, Select } from '../../components/ui/inputs';
import { DEFAULT_SCAN_LIMIT, useWorkspaceScan } from '../../hooks/use-workspace-scan';
import { FIELD_LABELS } from '../../lib/extraction';
import {
  formatDateTime,
  formatRelative,
  humanizeFieldName,
  parseSender,
  truncate,
} from '../../lib/format';
import { routes } from '../../lib/navigation';
import { conflictRows, type ConflictRow } from '../../lib/workspace';

/**
 * Conflicting values across the scanned analyses.
 *
 * A conflict is recorded, never resolved: the extraction leaves the field
 * `null` and lists the competing values, because choosing between them is a
 * business decision. This page makes the comparison easy and is explicit that
 * recording the choice needs an endpoint that does not exist.
 */
export function ConflictsPage() {
  const [limit, setLimit] = useState(DEFAULT_SCAN_LIMIT);
  const [field, setField] = useState('all');
  const [term, setTerm] = useState('');
  const [openRow, setOpenRow] = useState<ConflictRow | null>(null);

  const { data, error, isPending, isFetching, refetch } = useWorkspaceScan(limit);

  const allRows = useMemo(() => (data ? conflictRows(data.records) : []), [data]);

  const fields = useMemo(
    () => [...new Set(allRows.map((row) => row.conflict.field))].sort(),
    [allRows],
  );

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return allRows
      .filter((row) => field === 'all' || row.conflict.field === field)
      .filter((row) =>
        needle
          ? [row.email.subject, row.email.sender, ...row.conflict.values, row.conflict.note ?? '']
              .join('\n')
              .toLowerCase()
              .includes(needle)
          : true,
      );
  }, [allRows, field, term]);

  const columns: readonly Column<ConflictRow>[] = [
    {
      key: 'field',
      header: 'Field',
      cellClass: 'shrink',
      render: (row) => (
        <span className="inline inline--sm inline--nowrap">
          <GitCompareArrows size={13} aria-hidden="true" style={{ color: 'var(--warning)' }} />
          <span className="table__primary">
            {FIELD_LABELS[row.conflict.field] ?? humanizeFieldName(row.conflict.field)}
          </span>
        </span>
      ),
    },
    {
      key: 'values',
      header: 'Competing values',
      render: (row) => (
        <div className="inline inline--sm">
          {row.conflict.values.map((value, index) => (
            <span key={`${value}-${index}`} className="inline inline--sm inline--nowrap">
              {index > 0 ? <span className="muted">vs</span> : null}
              <code className="inline-code">{value}</code>
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'note',
      header: 'Model note',
      render: (row) =>
        row.conflict.note ? (
          truncate(row.conflict.note, 54)
        ) : (
          <span className="muted">None given</span>
        ),
    },
    {
      key: 'email',
      header: 'Source email',
      render: (row) => (
        <>
          <div className="table__primary">{truncate(row.email.subject || '(no subject)', 42)}</div>
          <div className="table__secondary">{parseSender(row.email.sender).name}</div>
        </>
      ),
    },
    {
      key: 'detected',
      header: 'Detected',
      cellClass: 'shrink',
      render: (row) => (
        <span title={formatDateTime(row.detectedAt)}>{formatRelative(row.detectedAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Review status',
      cellClass: 'shrink',
      render: () => <Badge tone="warning">Unresolved</Badge>,
    },
  ];

  return (
    <PageBody>
      <TopbarLead title="Conflicts" />
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
        title="Conflicting values"
        description="Fields where one email stated two or more incompatible values. The extraction records every value and leaves the field empty rather than silently picking a winner."
      />

      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : null}

      {data ? (
        <>
          <KpiRow>
            <Kpi
              label="Conflicts"
              value={allRows.length}
              tone={allRows.length > 0 ? 'warning' : 'default'}
              foot="in the scanned analyses"
            />
            <Kpi
              label="Emails affected"
              value={new Set(allRows.map((row) => row.email.id)).size}
              foot="distinct source emails"
            />
            <Kpi
              label="Fields affected"
              value={fields.length}
              foot={
                fields.length ? fields.map((name) => FIELD_LABELS[name] ?? name).join(', ') : 'none'
              }
            />
            <Kpi label="Resolved" value={0} tone="muted" foot="no resolution endpoint" />
          </KpiRow>
          <DerivedNotice scanned={data.scanned} total={data.total} />
        </>
      ) : null}

      <CapabilityNotice
        capability="conflictResolution"
        title="Conflict resolution is not implemented"
      >
        The AI service reserves a <code className="inline-code">conflict_resolution</code> model for
        genuine semantic ambiguity, but nothing invokes it and no endpoint records a human decision.
      </CapabilityNotice>

      <Panel>
        <PanelHead
          title="Conflicts"
          meta={`${rows.length} shown`}
          actions={
            <div className="inline inline--sm">
              <Select
                label="Field"
                hideLabel
                value={field}
                onChange={(event) => setField(event.target.value)}
                style={{ width: 'auto' }}
                options={[
                  { value: 'all', label: 'All fields' },
                  ...fields.map((name) => ({
                    value: name,
                    label: FIELD_LABELS[name] ?? humanizeFieldName(name),
                  })),
                ]}
              />
              <div className="head-search">
                <SearchInput
                  value={term}
                  onChange={setTerm}
                  label="Search conflicts"
                  placeholder="Value, subject, sender…"
                />
              </div>
            </div>
          }
        />
        <DataTable
          caption="Conflicting extracted values"
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          loading={isPending}
          onRowClick={setOpenRow}
          empty={
            <EmptyState
              inline
              icon={<GitCompareArrows size={18} aria-hidden="true" />}
              title={allRows.length === 0 ? 'No conflicts detected' : 'No conflicts match'}
              body={
                allRows.length === 0
                  ? 'None of the scanned extractions reported two values for the same field.'
                  : 'Clear the field filter or the search term.'
              }
            />
          }
        />
      </Panel>

      {openRow ? (
        <Drawer
          title={FIELD_LABELS[openRow.conflict.field] ?? humanizeFieldName(openRow.conflict.field)}
          subtitle={`${openRow.conflict.values.length} competing values · detected ${formatRelative(openRow.detectedAt)}`}
          onClose={() => setOpenRow(null)}
          footer={
            <>
              <UnsupportedButton capability="conflictResolution">Resolve</UnsupportedButton>
              <ButtonLink to={routes.email(openRow.email.id)} size="sm" variant="primary">
                Open email workspace
              </ButtonLink>
            </>
          }
        >
          <div className="stack">
            <ConflictCard conflict={openRow.conflict} />

            <Panel>
              <PanelHead title="Source email" meta={parseSender(openRow.email.sender).name} />
              <PanelBody className="stack stack--sm">
                <strong>{openRow.email.subject || '(no subject)'}</strong>
                <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                  Received {formatDateTime(openRow.email.receivedAt)}
                </span>
              </PanelBody>
              <PanelBody>
                <EmailBody
                  body={openRow.email.bodyText}
                  spans={openRow.conflict.values.map((value) => ({
                    key: openRow.conflict.field,
                    text: value,
                  }))}
                  activeKey={openRow.conflict.field}
                />
              </PanelBody>
            </Panel>

            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              The contract stores one shared note per conflict rather than evidence per value, so
              the competing values are highlighted in the body where they appear verbatim — that is
              the only evidence available for each.
            </p>
          </div>
        </Drawer>
      ) : null}
    </PageBody>
  );
}
