import { createContext, useContext } from 'react';

/**
 * Portal targets in the application header.
 *
 * Pages own their title, breadcrumb and primary action, but those belong
 * visually in the shell's header. Portals keep that ownership without pushing
 * page state up into the shell (and without an effect that re-registers JSX on
 * every render).
 */
export interface ChromeSlots {
  lead: HTMLElement | null;
  actions: HTMLElement | null;
}

export const ChromeContext = createContext<ChromeSlots>({ lead: null, actions: null });

export function useChromeSlots(): ChromeSlots {
  return useContext(ChromeContext);
}
