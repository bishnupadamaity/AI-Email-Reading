import { type ReactNode } from 'react';

/** Frame shared by every route. Navigation arrives with the inbox feature. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="shell__header">
        <span className="shell__brand">Email AI Platform</span>
        <span className="shell__tag">foundation</span>
      </header>
      <main className="shell__main">{children}</main>
    </div>
  );
}
