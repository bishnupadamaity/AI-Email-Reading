import { X } from 'lucide-react';
import { type WorkspaceRecord } from '../../hooks/use-workspace-scan';
import {
  distinctClassifications,
  distinctSenders,
  emptyFilters,
  hasActiveFilters,
  statusCounts,
  type EmailFilters,
  type FlagFilter,
  type StatusFilter,
} from '../../lib/email-filters';
import { humanizeEnum, parseSender, truncate } from '../../lib/format';
import { Button } from '../ui/Button';
import { FilterTabs, SearchInput, Select } from '../ui/inputs';
import { UnsupportedTag } from '../ui/Unsupported';

const STATUS_TABS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unprocessed', label: 'Unprocessed' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'failed', label: 'Failed' },
];

const FLAG_OPTIONS: readonly { value: FlagFilter; label: string }[] = [
  { value: 'any', label: 'Any extraction' },
  { value: 'conflicts', label: 'Has conflicts' },
  { value: 'missing', label: 'Has missing fields' },
  { value: 'clean', label: 'Complete extraction' },
];

export function EmailStatusTabs({
  records,
  value,
  onChange,
}: {
  records: readonly WorkspaceRecord[];
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
}) {
  const counts = statusCounts(records);

  return (
    <FilterTabs
      label="Filter by analysis status"
      value={value}
      onChange={onChange}
      tabs={STATUS_TABS.map((tab) => ({ ...tab, count: counts[tab.value] }))}
    />
  );
}

/**
 * Search and secondary filters.
 *
 * Marked as unsupported server-side throughout: these controls narrow the
 * records the scan loaded, which is a different thing from querying the
 * workspace.
 */
export function EmailFilterBar({
  records,
  filters,
  onChange,
  compact,
}: {
  records: readonly WorkspaceRecord[];
  filters: EmailFilters;
  onChange: (filters: EmailFilters) => void;
  compact?: boolean;
}) {
  const senders = distinctSenders(records);
  const classifications = distinctClassifications(records);
  const active = hasActiveFilters(filters);

  return (
    <div className={`toolbar${compact ? '' : ' toolbar--sunken'}`}>
      <div className="toolbar__grow">
        <SearchInput
          value={filters.term}
          onChange={(term) => onChange({ ...filters, term })}
          label="Search loaded emails"
          placeholder="Sender, subject, body, container, reference…"
        />
      </div>

      <Select
        label="Sender"
        hideLabel
        value={filters.sender}
        onChange={(event) => onChange({ ...filters, sender: event.target.value })}
        style={{ width: 'auto', maxWidth: '12rem' }}
        options={[
          { value: 'all', label: 'All senders' },
          ...senders.map((sender) => ({
            value: sender,
            label: truncate(parseSender(sender).name, 28),
          })),
        ]}
      />

      <Select
        label="Classification"
        hideLabel
        value={filters.classification}
        onChange={(event) => onChange({ ...filters, classification: event.target.value })}
        style={{ width: 'auto' }}
        options={[
          { value: 'all', label: 'All classifications' },
          ...classifications.map((value) => ({ value, label: humanizeEnum(value) })),
        ]}
      />

      <Select
        label="Extraction flags"
        hideLabel
        value={filters.flag}
        onChange={(event) => onChange({ ...filters, flag: event.target.value as FlagFilter })}
        style={{ width: 'auto' }}
        options={FLAG_OPTIONS}
      />

      {compact ? null : (
        <>
          <label className="sr-only" htmlFor="filter-from">
            Received from
          </label>
          <input
            id="filter-from"
            className="input"
            type="date"
            style={{ width: 'auto' }}
            value={filters.from}
            onChange={(event) => onChange({ ...filters, from: event.target.value })}
          />
          <label className="sr-only" htmlFor="filter-to">
            Received to
          </label>
          <input
            id="filter-to"
            className="input"
            type="date"
            style={{ width: 'auto' }}
            value={filters.to}
            onChange={(event) => onChange({ ...filters, to: event.target.value })}
          />
        </>
      )}

      {active ? (
        <Button
          size="sm"
          variant="ghost"
          icon={<X size={13} aria-hidden="true" />}
          onClick={() => onChange(emptyFilters)}
        >
          Clear
        </Button>
      ) : null}

      <UnsupportedTag capability="serverSideFilter" />
    </div>
  );
}
