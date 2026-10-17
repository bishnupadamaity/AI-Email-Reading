import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useToast, type ToastTone } from '../../lib/toast/toast-context';
import { Button } from './Button';

const ICONS: Record<ToastTone, typeof Info> = {
  success: CircleCheck,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone];
        return (
          <div
            key={toast.id}
            className={`toast toast--${toast.tone}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="toast__icon">
              <Icon size={15} aria-hidden="true" />
            </span>
            <div className="toast__body">
              <p className="toast__title">{toast.title}</p>
              {toast.description ? <p className="toast__text">{toast.description}</p> : null}
            </div>
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              icon={<X size={13} aria-hidden="true" />}
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            />
          </div>
        );
      })}
    </div>
  );
}
