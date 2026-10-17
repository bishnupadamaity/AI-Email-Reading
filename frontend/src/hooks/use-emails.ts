import {
  type AnalysisDetail,
  type EmailDetail,
  type Paginated,
  type EmailSummary,
} from '@email-ai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAnalysis } from '../lib/api/analyses';
import { analyzeEmail, fetchEmail, fetchEmails } from '../lib/api/emails';
import { useDemoMode } from '../lib/demo/demo-mode-context';
import { demoEmails, findDemoAnalysis, findDemoEmail } from '../lib/demo/demo-data';

/**
 * Query keys. Demo mode is part of the key so switching sources can never
 * show one mode's data under the other's loading state.
 */
export const queryKeys = {
  emails: (page: number, pageSize: number, demo: boolean) =>
    ['emails', { page, pageSize, demo }] as const,
  email: (id: string, demo: boolean) => ['email', id, { demo }] as const,
  analysis: (id: string, demo: boolean) => ['analysis', id, { demo }] as const,
  scan: (limit: number, demo: boolean) => ['workspace-scan', { limit, demo }] as const,
};

function demoPage(page: number, pageSize: number): Paginated<EmailSummary> {
  const start = (page - 1) * pageSize;
  return {
    items: demoEmails.slice(start, start + pageSize),
    page,
    pageSize,
    total: demoEmails.length,
  };
}

export function useEmailsPage(page: number, pageSize: number) {
  const { enabled: demo } = useDemoMode();

  return useQuery({
    queryKey: queryKeys.emails(page, pageSize, demo),
    queryFn: () => (demo ? demoPage(page, pageSize) : fetchEmails({ page, pageSize })),
  });
}

export function useEmail(id: string | undefined) {
  const { enabled: demo } = useDemoMode();

  return useQuery({
    queryKey: queryKeys.email(id ?? '', demo),
    enabled: Boolean(id),
    queryFn: (): Promise<EmailDetail> => {
      if (!id) throw new Error('Missing email id');
      if (demo) {
        const found = findDemoEmail(id);
        if (!found) throw new Error('No such demo email');
        return Promise.resolve(found);
      }
      return fetchEmail(id);
    },
  });
}

export function useAnalysis(id: string | null | undefined) {
  const { enabled: demo } = useDemoMode();

  return useQuery({
    queryKey: queryKeys.analysis(id ?? '', demo),
    enabled: Boolean(id),
    queryFn: (): Promise<AnalysisDetail> => {
      if (!id) throw new Error('Missing analysis id');
      if (demo) {
        const found = findDemoAnalysis(id);
        if (!found) throw new Error('No such demo analysis');
        return Promise.resolve(found);
      }
      return fetchAnalysis(id);
    },
  });
}

/**
 * Runs extraction on one email.
 *
 * A `200` carrying `status: 'failed'` is a recorded failure, not a success, so
 * callers inspect the returned analysis rather than relying on `onSuccess`
 * meaning "it worked".
 */
export function useAnalyzeEmail() {
  const queryClient = useQueryClient();
  const { enabled: demo } = useDemoMode();

  return useMutation({
    mutationFn: (emailId: string): Promise<AnalysisDetail> => {
      if (demo) {
        // Demo mode never issues writes; the UI disables this path instead.
        return Promise.reject(new Error('Demo mode is active: no request was sent.'));
      }
      return analyzeEmail(emailId);
    },
    onSuccess: (analysis) => {
      queryClient.setQueryData(queryKeys.analysis(analysis.id, demo), analysis);
      void queryClient.invalidateQueries({ queryKey: ['email', analysis.emailId] });
      void queryClient.invalidateQueries({ queryKey: ['emails'] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-scan'] });
    },
  });
}
