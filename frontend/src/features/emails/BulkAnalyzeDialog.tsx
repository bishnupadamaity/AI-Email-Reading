import { type AnalysisDetail } from '@email-ai/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/overlays';
import { AnalysisStatusBadge } from '../../components/ui/StatusBadge';
import { asApiError } from '../../lib/api-client';
import { analyzeEmail } from '../../lib/api/emails';
import { describeFailure } from '../../lib/extraction';
import { useToast } from '../../lib/toast/toast-context';

interface Outcome {
  emailId: string;
  subject: string;
  status: AnalysisDetail['status'] | 'error';
  detail: string;
}

/**
 * Runs extraction over several emails.
 *
 * Sequential on purpose: each call is a synchronous model call, and firing a
 * page of them at once would queue behind the browser's connection limit while
 * holding the API's threads. The run is stoppable, and every outcome is
 * reported individually — a `200` with `status: 'failed'` counts as a failure.
 */
export function BulkAnalyzeDialog({
  emails,
  onClose,
}: {
  emails: readonly { id: string; subject: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  const done = outcomes.length;
  const finished = done === emails.length || stopped;

  const start = async () => {
    setRunning(true);
    setStopped(false);
    let shouldStop = false;

    for (const email of emails) {
      if (shouldStop) break;

      try {
        const analysis = await analyzeEmail(email.id);
        setOutcomes((current) => [
          ...current,
          {
            emailId: email.id,
            subject: email.subject,
            status: analysis.status,
            detail:
              analysis.status === 'failed'
                ? (analysis.failureMessage ?? describeFailure(analysis).label)
                : analysis.extractedData
                  ? `${analysis.extractedData.conflicts.length} conflict(s), ${analysis.extractedData.missingFields.length} missing`
                  : 'Stored',
          },
        ]);
      } catch (error) {
        const apiError = asApiError(error);
        setOutcomes((current) => [
          ...current,
          { emailId: email.id, subject: email.subject, status: 'error', detail: apiError.message },
        ]);
        // An unconfigured AI service will reject every remaining email too.
        if (apiError.statusCode === 503) {
          shouldStop = true;
          setStopped(true);
          push({
            tone: 'error',
            title: 'Stopped: AI is not configured',
            description: apiError.message,
          });
        }
      }
    }

    setRunning(false);
    void queryClient.invalidateQueries({ queryKey: ['emails'] });
    void queryClient.invalidateQueries({ queryKey: ['workspace-scan'] });
  };

  return (
    <Dialog
      title={`Run analysis on ${emails.length} ${emails.length === 1 ? 'email' : 'emails'}`}
      onClose={running ? () => undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            {finished && done > 0 ? 'Close' : 'Cancel'}
          </Button>
          {running ? (
            <Button variant="danger" onClick={() => setStopped(true)}>
              Stop after current
            </Button>
          ) : done === 0 ? (
            <Button variant="primary" onClick={() => void start()}>
              Run {emails.length} analyses
            </Button>
          ) : null}
        </>
      }
    >
      <div className="stack">
        {done === 0 ? (
          <>
            <p>
              Each email is analysed with one synchronous model call, one after another. This spends
              provider tokens and cannot be undone.
            </p>
            <p className="muted">
              Emails whose analysis has already completed are skipped by the API, which returns the
              stored result without calling the provider again.
            </p>
          </>
        ) : null}

        {done > 0 ? (
          <>
            <div className="meter" aria-hidden="true">
              <span className="meter__fill" style={{ width: `${(done / emails.length) * 100}%` }} />
            </div>
            <p className="muted">
              {done} of {emails.length} processed
              {running ? ' — running' : stopped ? ' — stopped' : ' — finished'}
            </p>
            <div className="table-scroll" style={{ maxHeight: '16rem' }}>
              <table className="table">
                <caption className="sr-only">Bulk analysis outcomes</caption>
                <tbody>
                  {outcomes.map((outcome) => (
                    <tr key={outcome.emailId}>
                      <td className="truncate" style={{ maxWidth: '14rem' }}>
                        {outcome.subject || '(no subject)'}
                      </td>
                      <td className="shrink">
                        {outcome.status === 'error' ? (
                          <span className="badge badge--danger">Request failed</span>
                        ) : (
                          <AnalysisStatusBadge status={outcome.status} />
                        )}
                      </td>
                      <td className="muted">{outcome.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
