import { type AnalysisDetail } from '@email-ai/contracts';
import { Play, RefreshCw } from 'lucide-react';
import { asApiError } from '../../lib/api-client';
import { useDemoMode } from '../../lib/demo/demo-mode-context';
import { describeFailure } from '../../lib/extraction';
import { useToast } from '../../lib/toast/toast-context';
import { useAnalyzeEmail } from '../../hooks/use-emails';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';

/**
 * Runs or retries extraction for one email.
 *
 * The outcome is read from the returned analysis, not from the HTTP status: a
 * `200` carrying `status: 'failed'` is reported as a failure, which is the
 * single most important honesty rule on this screen.
 *
 * Completed analyses are not re-runnable — the API deliberately returns the
 * stored result instead of spending tokens again — so the button says so
 * rather than appearing to do nothing.
 */
export function AnalyzeButton({
  emailId,
  analysis,
  size = 'sm',
  variant = 'primary',
}: {
  emailId: string;
  analysis: AnalysisDetail | null;
  size?: 'sm' | 'xs' | 'md';
  variant?: 'primary' | 'secondary';
}) {
  const mutation = useAnalyzeEmail();
  const { push } = useToast();
  const { enabled: demo } = useDemoMode();

  const status = analysis?.status ?? 'pending';
  const isRetry = status === 'failed';

  const disabledReason = demo
    ? 'Demo data is on. Switch to live data to run a real analysis — nothing is sent to the API in demo mode.'
    : status === 'completed'
      ? 'This analysis has completed. The API does not re-run a completed analysis: it would spend tokens on an accidental double-click, so the stored result is returned instead.'
      : status === 'processing'
        ? 'An analysis for this email is already in progress. The API allows one at a time per email.'
        : null;

  const run = () => {
    mutation.mutate(emailId, {
      onSuccess: (result) => {
        if (result.status === 'failed') {
          const failure = describeFailure(result);
          push({
            tone: 'error',
            title: `Analysis failed · ${failure.label}`,
            description: result.failureMessage ?? failure.hint,
          });
          return;
        }

        const extraction = result.extractedData;
        push({
          tone: 'success',
          title: 'Analysis completed',
          description: extraction
            ? `${extraction.conflicts.length} conflict(s), ${extraction.missingFields.length} missing field(s) reported.`
            : undefined,
        });
      },
      onError: (error) => {
        const apiError = asApiError(error);
        push({
          tone: 'error',
          title:
            apiError.statusCode === 503
              ? 'AI is not configured'
              : apiError.statusCode === 409
                ? 'Analysis already in progress'
                : 'Could not run analysis',
          description:
            apiError.statusCode === 503
              ? `${apiError.message} Set AI_SERVICE_ENABLED=true and configure the AI service, then try again.`
              : apiError.message,
        });
      },
    });
  };

  const button = (
    <Button
      variant={variant}
      size={size === 'md' ? undefined : size}
      disabled={disabledReason != null}
      loading={mutation.isPending}
      onClick={run}
      icon={
        isRetry ? <RefreshCw size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />
      }
    >
      {mutation.isPending ? 'Analysing…' : isRetry ? 'Retry analysis' : 'Run analysis'}
    </Button>
  );

  if (disabledReason) {
    return (
      <Tooltip label={disabledReason} wrap>
        {button}
      </Tooltip>
    );
  }

  return button;
}
