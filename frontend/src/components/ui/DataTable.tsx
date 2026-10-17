import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode } from 'react';
import { Button } from './Button';
import { SkeletonTable } from './states';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  /** `shrink` keeps a column to its content, `num` right-aligns numerics. */
  cellClass?: string;
  sortable?: boolean;
  srOnlyHeader?: boolean;
}

export interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DataTableProps<Row> {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  caption: string;
  onRowClick?: (row: Row) => void;
  selectedRowId?: string | null;
  sort?: SortState | null;
  onSortChange?: (key: string) => void;
  loading?: boolean;
  empty?: ReactNode;
  /** Checkbox selection. Omitted entirely when the page has no bulk actions. */
  selection?: {
    selectedIds: ReadonlySet<string>;
    onToggle: (id: string) => void;
    onToggleAll: () => void;
    label: (row: Row) => string;
  };
}

export function DataTable<Row>({
  columns,
  rows,
  getRowId,
  caption,
  onRowClick,
  selectedRowId,
  sort,
  onSortChange,
  loading,
  empty,
  selection,
}: DataTableProps<Row>) {
  if (loading) return <SkeletonTable rows={6} columns={columns.length} />;
  if (rows.length === 0 && empty) return <>{empty}</>;

  const allSelected =
    selection != null &&
    rows.length > 0 &&
    rows.every((row) => selection.selectedIds.has(getRowId(row)));

  return (
    <div className="table-scroll">
      <table className="table table--rows">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {selection ? (
              <th className="table__checkbox" scope="col">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={selection.onToggleAll}
                  aria-label="Select all rows on this page"
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th key={column.key} className={column.cellClass} scope="col">
                {column.srOnlyHeader ? (
                  <span className="sr-only">{column.header}</span>
                ) : column.sortable && onSortChange ? (
                  <button
                    type="button"
                    className="table__sort"
                    data-active={sort?.key === column.key}
                    onClick={() => onSortChange(column.key)}
                    aria-label={`Sort by ${String(column.header)}`}
                  >
                    {column.header}
                    {sort?.key === column.key ? (
                      sort.direction === 'asc' ? (
                        <ArrowUp size={11} aria-hidden="true" />
                      ) : (
                        <ArrowDown size={11} aria-hidden="true" />
                      )
                    ) : (
                      <ArrowUpDown size={11} aria-hidden="true" opacity={0.5} />
                    )}
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            return (
              <tr
                key={id}
                data-clickable={onRowClick ? true : undefined}
                data-selected={selectedRowId === id ? true : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
              >
                {selection ? (
                  <td className="table__checkbox" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(id)}
                      onChange={() => selection.onToggle(id)}
                      aria-label={selection.label(row)}
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td key={column.key} className={column.cellClass}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'items',
  note,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  itemLabel?: string;
  note?: ReactNode;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <span>
        {total === 0 ? `No ${itemLabel}` : `${first}–${last} of ${total} ${itemLabel}`}
        {note ? <> · {note}</> : null}
      </span>
      <div className="pagination__controls">
        {onPageSizeChange ? (
          <>
            <label className="sr-only" htmlFor="page-size">
              Rows per page
            </label>
            <select
              id="page-size"
              className="select"
              style={{ width: 'auto', height: '1.75rem' }}
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </>
        ) : null}
        <Button
          size="sm"
          iconOnly
          icon={<ChevronLeft size={14} aria-hidden="true" />}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        />
        <span className="pagination__page">
          {page} / {lastPage}
        </span>
        <Button
          size="sm"
          iconOnly
          icon={<ChevronRight size={14} aria-hidden="true" />}
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        />
      </div>
    </div>
  );
}
