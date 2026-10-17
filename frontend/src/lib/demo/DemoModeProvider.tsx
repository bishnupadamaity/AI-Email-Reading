import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { DEMO_MODE_STORAGE_KEY, DemoModeContext } from './demo-mode-context';

function readInitial(): boolean {
  // `?demo=1` wins over the stored preference so a link can open the tour.
  const fromUrl = new URLSearchParams(window.location.search).get('demo');
  if (fromUrl === '1' || fromUrl === 'true') return true;
  if (fromUrl === '0' || fromUrl === 'false') return false;

  try {
    return window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Demo mode replaces every data source with the synthetic records in
 * `demo-data.ts`. It is off by default, persisted per browser, and announced by
 * a banner in the shell — no view may read demo data silently.
 */
export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(readInitial);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // A browser refusing storage is not a reason to block the toggle.
    }
  }, []);

  const value = useMemo(
    () => ({ enabled, setEnabled, toggle: () => setEnabled(!enabled) }),
    [enabled, setEnabled],
  );

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}
