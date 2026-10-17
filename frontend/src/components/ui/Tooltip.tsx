import { useId, useState, type ReactNode } from 'react';

/**
 * Hover/focus tooltip.
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
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="tooltip-anchor"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} style={{ display: 'inline-flex' }}>
        {children}
      </span>
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={`tooltip tooltip--${placement}${wrap ? ' tooltip--wrap' : ''}`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
