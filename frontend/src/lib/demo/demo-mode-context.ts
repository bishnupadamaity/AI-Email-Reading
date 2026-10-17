import { createContext, useContext } from 'react';

export interface DemoModeValue {
  /** True when every view is reading synthetic records instead of the API. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

export const DemoModeContext = createContext<DemoModeValue | null>(null);

export function useDemoMode(): DemoModeValue {
  const value = useContext(DemoModeContext);
  if (!value) throw new Error('useDemoMode must be used inside <DemoModeProvider>');
  return value;
}

export const DEMO_MODE_STORAGE_KEY = 'mailpilot.demoMode';
