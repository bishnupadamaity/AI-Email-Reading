import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ActivityLogPage } from '../features/activity/ActivityLogPage';
import { AnalysesPage } from '../features/analyses/AnalysesPage';
import { AnalysisDetailPage } from '../features/analyses/AnalysisDetailPage';
import { ConflictsPage } from '../features/conflicts/ConflictsPage';
import { DocumentsPage } from '../features/documents/DocumentsPage';
import { EmailWorkspacePage } from '../features/email-workspace/EmailWorkspacePage';
import { AllEmailsPage } from '../features/emails/AllEmailsPage';
import { EvaluationsPage } from '../features/evaluations/EvaluationsPage';
import { InboxPage } from '../features/inbox/InboxPage';
import { MissingInformationPage } from '../features/missing-information/MissingInformationPage';
import { NotFoundPage } from '../features/not-found/NotFoundPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { ReviewQueuePage } from '../features/review-queue/ReviewQueuePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { DemoModeProvider } from '../lib/demo/DemoModeProvider';
import { queryClient } from '../lib/query-client';
import { ThemeProvider } from '../lib/theme/ThemeProvider';
import { ToastProvider } from '../lib/toast/ToastProvider';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DemoModeProvider>
          <ToastProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/inbox/:emailId" element={<InboxPage />} />
                <Route path="/emails" element={<AllEmailsPage />} />
                <Route path="/emails/:emailId" element={<EmailWorkspacePage />} />
                <Route path="/analyses" element={<AnalysesPage />} />
                <Route path="/analyses/:analysisId" element={<AnalysisDetailPage />} />
                <Route path="/review" element={<ReviewQueuePage />} />
                <Route path="/conflicts" element={<ConflictsPage />} />
                <Route path="/missing-information" element={<MissingInformationPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/evaluations" element={<EvaluationsPage />} />
                <Route path="/activity" element={<ActivityLogPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </ToastProvider>
        </DemoModeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
