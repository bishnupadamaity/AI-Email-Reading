import { useCallback, useState } from 'react';

/**
 * Which emails have been opened **in this browser**.
 *
 * The API has no read/unread concept — nothing in `emails` records it — so this
 * is deliberately local, and the UI says so wherever the marker appears. It is
 * a triage aid for one operator at one desk, not a shared workspace state.
 */
const STORAGE_KEY = 'mailpilot.seenEmails';
const MAX_TRACKED = 500;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function write(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_TRACKED)));
  } catch {
    // Local-only convenience; losing it changes nothing functional.
  }
}

export function useSeenEmails() {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(read()));

  const markSeen = useCallback((id: string) => {
    setSeen((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      write([...next]);
      return next;
    });
  }, []);

  const clearSeen = useCallback(() => {
    write([]);
    setSeen(new Set());
  }, []);

  return { seen, markSeen, clearSeen };
}
