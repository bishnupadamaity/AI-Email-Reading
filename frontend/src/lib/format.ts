/** Presentation-only formatting. No business rules live here. */

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const timeOnly = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

const dayMonth = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date);
}

export function formatDayMonth(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dayMonth.format(date);
}

/**
 * Inbox-style timestamp: clock time for today, day and month inside the year,
 * full date beyond it.
 */
export function formatMailTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) return timeOnly.format(date);
  if (date.getFullYear() === now.getFullYear()) return dayMonth.format(date);
  return dateOnly.format(date);
}

const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const deltaMs = date.getTime() - Date.now();
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(deltaMs) >= ms) {
      return relative.format(Math.round(deltaMs / ms), unit);
    }
  }
  return 'just now';
}

/** Compact age for queue rows: `4h`, `3d`. */
export function formatAge(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

/** Token counts get a compact form so KPI rows stay on one line. */
export function formatCompact(value: number | null | undefined): string {
  if (value == null) return '—';
  if (Math.abs(value) < 1000) return String(value);
  if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  return value == null ? '—' : `${(value * 100).toFixed(digits)}%`;
}

/** Splits `Name <addr@example.com>` into its parts without losing the raw form. */
export function parseSender(sender: string): { name: string; address: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(sender);
  if (match?.[1] && match[2]) return { name: match[1], address: match[2] };
  if (match?.[2]) return { name: match[2], address: match[2] };
  return { name: sender.trim(), address: sender.trim() };
}

/** Turns `containerNumber` or `shipment_reference` into `Container number`. */
export function humanizeFieldName(field: string): string {
  const spaced = field
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `shipment_update` → `Shipment update`. */
export function humanizeEnum(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Local date key (`YYYY-MM-DD`) used to bucket activity by day. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
