import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

function useDismissOnEscape(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
}

/** Moves focus into the overlay on open and restores it on close. */
function useFocusOnOpen(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const previous = document.activeElement;
    const focusable = ref.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? ref.current)?.focus();

    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [ref]);
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDismissOnEscape(onClose);
  useFocusOnOpen(ref);

  return (
    <div
      className="overlay overlay--center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        tabIndex={-1}
      >
        <div className="dialog__header">
          <h2 className="dialog__title" id={titleId}>
            {title}
          </h2>
        </div>
        <div className="dialog__body">{children}</div>
        {footer ? <div className="dialog__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDismissOnEscape(onClose);
  useFocusOnOpen(ref);

  return (
    <div
      className="overlay overlay--right"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        tabIndex={-1}
      >
        <div className="drawer__header">
          <div>
            <h2 className="drawer__title" id={titleId}>
              {title}
            </h2>
            {subtitle ? <p className="drawer__subtitle">{subtitle}</p> : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X size={15} aria-hidden="true" />}
            onClick={onClose}
            aria-label="Close panel"
          />
        </div>
        <div className="drawer__body">{children}</div>
        {footer ? <div className="drawer__footer">{footer}</div> : null}
      </aside>
    </div>
  );
}
