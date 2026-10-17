import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hover/focus tooltip, rendered into `document.body` and positioned from the
 * anchor's viewport rect.
 *
 * It must not live inside the anchor's scroll container. An absolutely
 * positioned tooltip is part of its ancestor's scrollable overflow, so hovering
 * one near an edge grew the page's scroll area — which is what made the layout
 * drift sideways and jump while scrolling. Panels also clip their content
 * (`overflow: hidden`), so a tooltip inside one was cut off.
 *
 * The wrapper carries the listeners rather than the child, because disabled
 * buttons do not emit pointer events — and explaining *why* a control is
 * disabled is this tooltip's main job.
 */
export function Tooltip({
  label,
  placement = 'top',
  wrap,
  children,
}: {
  label: ReactNode;
  placement?: 'top' | 'right';
  /** Allow multi-line text, for capability explanations. */
  wrap?: boolean;
  children: ReactNode;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const id = useId();

  const show = useCallback(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;

    // Keep the panel on screen without measuring it: the CSS max-widths below
    // bound how far it can reach from its anchor point.
    const reach = wrap ? 148 : 110;
    const clampedLeft = Math.min(
      Math.max(rect.left + rect.width / 2, reach + 8),
      window.innerWidth - reach - 8,
    );

    setCoords(
      placement === 'right'
        ? { top: rect.top + rect.height / 2, left: rect.right + 10 }
        : { top: rect.top - 8, left: clampedLeft },
    );
  }, [placement, wrap]);

  const hide = useCallback(() => setCoords(null), []);

  // A fixed-position tooltip cannot follow its anchor, so dismiss it instead of
  // letting it drift away from the thing it describes.
  useEffect(() => {
    if (!coords) return;

    window.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('resize', hide, { passive: true });
    return () => {
      window.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('resize', hide);
    };
  }, [coords, hide]);

  return (
    <span
      className="tooltip-anchor"
      ref={anchor}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      <span aria-describedby={coords ? id : undefined} style={{ display: 'inline-flex' }}>
        {children}
      </span>
      {coords
        ? createPortal(
            <span
              role="tooltip"
              id={id}
              className={`tooltip tooltip--${placement}${wrap ? ' tooltip--wrap' : ''}`}
              style={{ top: coords.top, left: coords.left }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
