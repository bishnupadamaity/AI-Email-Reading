/**
 * Locating evidence spans inside an email body.
 *
 * The extraction contract stores `evidence` as a verbatim span of the email, so
 * finding it is a plain substring search. When a span cannot be found the UI
 * says so rather than highlighting an approximation — a reviewer checking the
 * model's work must not be shown a guess.
 */

export interface EvidenceSpan {
  /** Field key the span belongs to. */
  key: string;
  text: string;
}

export interface BodySegment {
  text: string;
  /** Field key when this segment is highlighted evidence. */
  key: string | null;
}

export interface LocatedBody {
  segments: readonly BodySegment[];
  /** Field keys whose evidence was found verbatim in the body. */
  located: ReadonlySet<string>;
}

interface Range {
  start: number;
  end: number;
  key: string;
}

/**
 * Splits a body into plain and highlighted segments.
 *
 * `priorityKey` wins when two spans overlap, so selecting a field always shows
 * that field's evidence even if another span covers the same text.
 */
export function locateEvidence(
  body: string,
  spans: readonly EvidenceSpan[],
  priorityKey?: string | null,
): LocatedBody {
  const located = new Set<string>();
  const ranges: Range[] = [];

  for (const span of spans) {
    const needle = span.text.trim();
    if (needle.length < 3) continue;

    const start = body.indexOf(needle);
    if (start === -1) continue;

    located.add(span.key);
    ranges.push({ start, end: start + needle.length, key: span.key });
  }

  // Longest-first so a prioritised or wider span survives the overlap filter.
  ranges.sort((left, right) => {
    if (priorityKey) {
      if (left.key === priorityKey && right.key !== priorityKey) return -1;
      if (right.key === priorityKey && left.key !== priorityKey) return 1;
    }
    return right.end - right.start - (left.end - left.start);
  });

  const kept: Range[] = [];
  for (const range of ranges) {
    const overlaps = kept.some((other) => range.start < other.end && other.start < range.end);
    if (!overlaps) kept.push(range);
  }

  kept.sort((left, right) => left.start - right.start);

  const segments: BodySegment[] = [];
  let cursor = 0;
  for (const range of kept) {
    if (range.start > cursor) {
      segments.push({ text: body.slice(cursor, range.start), key: null });
    }
    segments.push({ text: body.slice(range.start, range.end), key: range.key });
    cursor = range.end;
  }
  if (cursor < body.length) segments.push({ text: body.slice(cursor), key: null });

  return { segments, located };
}
