import { CircleSlash } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBody } from '../../components/layout/AppShell';
import { PageHeader, TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { ScanControls } from '../../components/layout/ScanControls';
import { Badge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Kpi, KpiRow } from '../../components/ui/Kpi';
import { Panel, PanelBody, PanelFoot, PanelHead } from '../../components/ui/Panel';
import { DerivedNotice } from '../../components/ui/Unsupported';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { SearchInput, Segmented, Select } from '../../components/ui/inputs';
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
import { missingRows, type MissingRow } from '../../lib/workspace';

type Grouping = 'none' | 'shipment' | 'field';

/**
 * Fields the model reported as missing.
 *
 * "Missing" is the model's own claim — a field the email should have carried
 * for its classification and did not — stored in `missingFields` with the
 * reason it gave. It is not the same as a field simply left `null`, and the
 * difference is preserved here.
 *
 * No criticality column: nothing in the platform defines which shipment fields
 * are business-critical, so ranking them would be invention.
 */
export function MissingInformationPage() {
  const [limit, setLimit] = useState(DEFAULT_SCAN_LIMIT);
  const [grouping, setGrouping] = useState<Grouping>('shipment');
  const [fieldFilter, setFieldFilter] = useState('all');
  const [term, setTerm] = useState('');

  const { data, error, isPending, isFetching, refetch } = useWorkspaceScan(limit);

  const allRows = useMemo(() => (data ? missingRows(data.records) : []), [data]);

  const fields = useMemo(
    () => [...new Set(allRows.map((row) => row.missing.field))].sort(),
    [allRows],
  );

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return allRows
      .filter((row) => fieldFilter === 'all' || row.missing.field === fieldFilter)
      .filter((row) =>
        needle
          ? [
              row.email.subject,
              row.email.sender,
              row.shipmentReference ?? '',
              row.missing.reason ?? '',
            ]
              .join('\n')
              .toLowerCase()
              .includes(needle)
          : true,
      );
  }, [allRows, fieldFilter, term]);

  const groups = useMemo(() => {
    if (grouping === 'none') return null;

    const map = new Map<string, MissingRow[]>();
    for (const row of rows) {
      const key =
        grouping === 'shipment' ? (row.shipmentReference ?? '__none__') : row.missing.field;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }

    return [...map.entries()].sort((left, right) => right[1].length - left[1].length);
  }, [rows, grouping]);

  const columns: readonly Column<MissingRow>[] = [
    {
      key: 'field',
      header: 'Missing field',
      cellClass: 'shrink',
      render: (row) => (
        <span className="table__primary">
          {FIELD_LABELS[row.missing.field] ?? humanizeFieldName(row.missing.field)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason given',
      render: (row) =>
        row.missing.reason ? row.missing.reason : <span className="muted">No reason given</span>,
    },
    {
      key: 'shipment',
      header: 'Shipment reference',
      cellClass: 'shrink',
      render: (row) =>
        row.shipmentReference ? (
          <code className="inline-code">{row.shipmentReference}</code>
        ) : (
          <span className="muted">Not extracted</span>
        ),
    },
    {
      key: 'email',
      header: 'Source email',
      render: (row) => (
        <>
          <Link to={routes.email(row.email.id)} className="table__primary">
            {truncate(row.email.subject || '(no subject)', 40)}
          </Link>
          <div className="table__secondary">{parseSender(row.email.sender).name}</div>
        </>
      ),
    },
    {
      key: 'received',
      header: 'Received',
      cellClass: 'shrink',
      render: (row) => (
        <span title={formatDateTime(row.email.receivedAt)}>
          {formatRelative(row.email.receivedAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Review status',
      cellClass: 'shrink',
      render: () => <Badge tone="plain">Not reviewed</Badge>,
    },
  ];

  return (
    <PageBody>
      <TopbarLead title="Missing Information" />
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
        title="Missing information"
        description="Shipment details the extraction reported as absent, with the reason the model gave. Chase these with the sender — nothing here can be filled in from the email."
      />

      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : null}

      {data ? (
        <>
          <KpiRow>
            <Kpi label="Missing entries" value={allRows.length} foot="across scanned analyses" />
            <Kpi
              label="Emails affected"
              value={new Set(allRows.map((row) => row.email.id)).size}
              foot="with at least one gap"
            />
            <Kpi
              label="Shipments affected"
              value={new Set(allRows.map((row) => row.shipmentReference).filter(Boolean)).size}
              foot="distinct references"
            />
            <Kpi
              label="Most common"
              value={
                fields.length === 0
                  ? '—'
                  : (FIELD_LABELS[
                      [...fields].sort(
                        (left, right) =>
                          allRows.filter((row) => row.missing.field === right).length -
                          allRows.filter((row) => row.missing.field === left).length,
                      )[0]!
                    ] ?? '—')
              }
              tone={fields.length === 0 ? 'muted' : 'default'}
              foot="field reported missing"
            />
          </KpiRow>
          <DerivedNotice scanned={data.scanned} total={data.total} />
        </>
      ) : null}

      <Panel>
        <PanelHead
          title="Reported gaps"
          meta={`${rows.length} shown`}
          actions={
            <div className="inline inline--sm">
              <Segmented
                label="Grouping"
                value={grouping}
                onChange={setGrouping}
                options={[
                  { value: 'shipment', label: 'By shipment' },
                  { value: 'field', label: 'By field' },
                  { value: 'none', label: 'Flat' },
                ]}
              />
              <Select
                label="Field"
                hideLabel
                value={fieldFilter}
                onChange={(event) => setFieldFilter(event.target.value)}
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
                  label="Search missing information"
                  placeholder="Reference, subject, reason…"
                />
              </div>
            </div>
          }
        />

        {rows.length === 0 ? (
          <PanelBody>
            <EmptyState
              inline
              icon={<CircleSlash size={18} aria-hidden="true" />}
              title={allRows.length === 0 ? 'No missing information reported' : 'No entries match'}
              body={
                allRows.length === 0
                  ? 'Either every scanned email carried what its classification expects, or no analysis has completed yet.'
                  : 'Clear the field filter or search term.'
              }
            />
          </PanelBody>
        ) : groups ? (
          <div>
            {groups.map(([key, groupRows]) => (
              <div key={key}>
                <div className="field-group__head">
                  <span>
                    {grouping === 'shipment'
                      ? key === '__none__'
                        ? 'No shipment reference extracted'
                        : `Shipment ${key}`
                      : (FIELD_LABELS[key] ?? humanizeFieldName(key))}
                  </span>
                  <span>
                    {groupRows.length} {groupRows.length === 1 ? 'gap' : 'gaps'}
                  </span>
                </div>
                <DataTable
                  caption={`Missing information for ${key}`}
                  columns={columns.filter((column) =>
                    grouping === 'shipment' ? column.key !== 'shipment' : column.key !== 'field',
                  )}
                  rows={groupRows}
                  getRowId={(row) => row.id}
                />
              </div>
            ))}
          </div>
        ) : (
          <DataTable
            caption="Missing information"
            columns={columns}
            rows={rows}
            getRowId={(row) => row.id}
            loading={isPending}
          />
        )}

        <PanelFoot>
          No criticality column: no business rule in this platform marks any shipment field as
          required, so the dashboard does not rank these.
        </PanelFoot>
      </Panel>
    </PageBody>
  );
}
