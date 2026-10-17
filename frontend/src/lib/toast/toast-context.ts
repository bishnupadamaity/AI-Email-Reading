import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

export interface ToastValue {
  toasts: readonly Toast[];
  /** Returns the id so a long-running action can replace its own toast. */
  push: (toast: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
}

export const ToastContext = createContext<ToastValue | null>(null);

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value;
}
