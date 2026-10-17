import { useEffect, useMemo, useRef } from 'react';
import { locateEvidence, type EvidenceSpan } from '../../lib/evidence';

/**
 * The email as it was ingested.
 *
 * Bodies are plain text (`emails.body_text`), so they are rendered as
 * pre-wrapped text, never as HTML — nothing from a message is parsed as markup.
 * Evidence spans are highlighted in place, and the selected field's span is
 * scrolled into view.
 */
export function EmailBody({
  body,
  spans = [],
  activeKey = null,
}: {
  body: string;
  spans?: readonly EvidenceSpan[];
  activeKey?: string | null;
}) {
  const { segments } = useMemo(
    () => locateEvidence(body, spans, activeKey),
    [body, spans, activeKey],
  );
  const activeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeKey]);

  return (
    <div className="email-body" tabIndex={0} role="article" aria-label="Email body">
      {segments.map((segment, index) =>
        segment.key ? (
          <mark
            key={index}
            data-active={segment.key === activeKey ? 'true' : undefined}
            ref={segment.key === activeKey ? activeRef : undefined}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </div>
  );
}
