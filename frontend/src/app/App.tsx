import { QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { queryClient } from '../lib/query-client';
import { HomePage } from './HomePage';

/**
 * Routes for inbox, email details, analysis, review queue, attachments and
 * settings are added as those features land under `src/features/`.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </QueryClientProvider>
  );
}
