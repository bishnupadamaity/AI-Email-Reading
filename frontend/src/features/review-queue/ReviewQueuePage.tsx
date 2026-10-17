import { SquareCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageFill } from '../../components/layout/AppShell';
import { TopbarActions, TopbarLead } from '../../components/layout/PageChrome';
import { ScanControls } from '../../components/layout/ScanControls';
import { Badge } from '../../components/ui/Badge';
import { Panel, PanelBody, PanelHead } from '../../components/ui/Panel';
import { SeverityBadge } from '../../components/ui/StatusBadge';
import { CapabilityNotice, DerivedNotice } from '../../components/ui/Unsupported';
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/states';
import { Select } from '../../components/ui/inputs';
import { DEFAULT_SCAN_LIMIT, useWorkspaceScan } from '../../hooks/use-workspace-scan';
import {
  REVIEW_REASON_LABELS,
  type DerivedReviewReason,
  type Severity,
} from '../../lib/extraction';
import { formatAge, parseSender, truncate } from '../../lib/format';
import { reviewItems, type ReviewItem } from '../../lib/workspace';
import { ReviewDetail } from './ReviewDetail';

type ReasonFilter = 'all' | DerivedReviewReason;
type SeverityFilter = 'all' | Severity;
type AgeFilter = 'all' | '1d' | '7d' | 'older';

const REASONS: readonly { value: ReasonFilter; label: string }[] = [
  { value: 'all', label: 'All reasons' },
  { value: 'conflicting_values', label: REVIEW_REASON_LABELS.conflicting_values },
  { value: 'missing_fields', label: REVIEW_REASON_LABELS.missing_fields },
  { value: 'validation_failed', label: REVIEW_REASON_LABELS.validation_failed },
  { value: 'analysis_failed', label: REVIEW_REASON_LABELS.analysis_failed },
];

function matchesAge(item: ReviewItem, age: AgeFilter): boolean {
  if (age === 'all') return true;
  const ms = Date.now() - new Date(item.since).getTime();
  if (age === '1d') return ms < 86_400_000;
  if (age === '7d') return ms < 7 * 86_400_000;
  return ms >= 7 * 86_400_000;
}

/**
 * Human review workspace.
 *
 * The queue is derived: there is no `review_items` table, so an item is "in the
 * queue" because its stored analysis carries a conflict, a reported missing
 * field, a validation failure or a failed run — recomputed on every scan rather
 * than claimed from the server.
 */
export function ReviewQueuePage() {
  const [limit, setLimit] = useState(DEFAULT_SCAN_LIMIT);
  const [reason, setReason] = useState<ReasonFilter>('all');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [age, setAge] = useState<AgeFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Separate from `selectedId`: the two-pane layout always has a selection, but
  // on narrow screens the detail must not cover the queue until it is opened.
  const [detailOpen, setDetailOpen] = useState(false);

  const { data, error, isPending, isFetching, refetch } = useWorkspaceScan(limit);

  const items = useMemo(() => (data ? reviewItems(data.records) : []), [data]);

  const visible = useMemo(
    () =>
      items.filter((item) => {
        if (severity !== 'all' && item.severity !== severity) return false;
        if (reason !== 'all' && !item.signals.some((signal) => signal.reason === reason)) {
          return false;
        }
        return matchesAge(item, age);
      }),
    [items, reason, severity, age],
  );

  const selected = visible.find((item) => item.email.id === selectedId) ?? visible[0] ?? null;

  // Keep the selection valid when filters change under it.
  useEffect(() => {
    if (selected && selected.email.id !== selectedId) setSelectedId(selected.email.id);
  }, [selected, selectedId]);

  const move = (delta: number) => {
    if (visible.length === 0) return;
    const index = visible.findIndex((item) => item.email.id === selectedId);
    const next = Math.min(Math.max((index === -1 ? 0 : index) + delta, 0), visible.length - 1);
    setSelectedId(visible[next]!.email.id);
  };

  const open = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  return (
    <PageFill>
      <TopbarLead title="Review Queue" />
      <TopbarActions>
        <ScanControls
          limit={limit}
          onLimitChange={setLimit}
          scan={data}
          onRefresh={() => void refetch()}
          refreshing={isFetching && !isPending}
        />
      </TopbarActions>

      <div className="toolbar">
        <Select
          label="Reason"
          hideLabel
          value={reason}
          onChange={(event) => setReason(event.target.value as ReasonFilter)}
          options={REASONS}
          style={{ width: 'auto' }}
        />
        <Select
          label="Severity"
          hideLabel
          value={severity}
          onChange={(event) => setSeverity(event.target.value as SeverityFilter)}
          options={[
            { value: 'all', label: 'Any severity' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
          style={{ width: 'auto' }}
        />
        <Select
          label="Age"
          hideLabel
          value={age}
          onChange={(event) => setAge(event.target.value as AgeFilter)}
          options={[
            { value: 'all', label: 'Any age' },
            { value: '1d', label: 'Last 24 hours' },
            { value: '7d', label: 'Last 7 days' },
            { value: 'older', label: 'Older than 7 days' },
          ]}
          style={{ width: 'auto' }}
        />
        <span className="toolbar__spacer" />
        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          {visible.length} of {items.length} items · ↑ ↓ to move
        </span>
      </div>

      <div className={`split${detailOpen && selected ? ' split--detail-open' : ''}`}>
        <div
          className="split__list"
          role="listbox"
          aria-label="Review queue"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'j') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowUp' || event.key === 'k') {
              event.preventDefault();
              move(-1);
            }
          }}
        >
          {isPending ? (
            <LoadingRows rows={6} />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} inline />
          ) : visible.length === 0 ? (
            <EmptyState
              inline
              icon={<SquareCheck size={18} aria-hidden="true" />}
              title={items.length === 0 ? 'Nothing to review' : 'No items match these filters'}
              body={
                items.length === 0
                  ? 'No scanned analysis reported a conflict, a missing field, a validation failure or a failed run.'
                  : 'Relax the reason, severity or age filter.'
              }
            />
          ) : (
            <div className="mail-list">
              {visible.map((item) => {
                const sender = parseSender(item.email.sender);
                const active = item.email.id === selected?.email.id;
                return (
                  <button
                    type="button"
                    key={item.email.id}
                    className="mail-row"
                    data-selected={active ? 'true' : undefined}
                    role="option"
                    aria-selected={active}
                    onClick={() => open(item.email.id)}
                  >
                    <span aria-hidden="true" />
                    <span className="mail-row__body">
                      <span className="mail-row__top">
                        <span className="mail-row__sender">{sender.name}</span>
                        <span className="mail-row__time">{formatAge(item.since)}</span>
                      </span>
                      <span className="mail-row__subject">
                        {truncate(item.email.subject || '(no subject)', 60)}
                      </span>
                      <span className="mail-row__meta">
                        <SeverityBadge severity={item.severity} />
                        {item.signals.slice(0, 2).map((signal) => (
                          <Badge key={signal.reason} tone="plain">
                            {REVIEW_REASON_LABELS[signal.reason]}
                            {signal.count > 1 ? ` ${signal.count}` : ''}
                          </Badge>
                        ))}
                      </span>
                    </span>
                    <span aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="split__detail">
          {selected ? (
            <ReviewDetail item={selected} onBack={() => setDetailOpen(false)} />
          ) : (
            <div className="page__inner">
              <Panel>
                <PanelHead title="Review queue" />
                <PanelBody className="stack">
                  <CapabilityNotice capability="reviewQueue" />
                  {data ? <DerivedNotice scanned={data.scanned} total={data.total} /> : null}
                </PanelBody>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </PageFill>
  );
}
