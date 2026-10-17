import { type WorkspaceSummary } from '../../lib/workspace';

type Stage = 'pending' | 'processing' | 'completed' | 'failed';

const STAGE_LABELS: Record<Stage, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

/**
 * The analysis lifecycle as one segmented bar.
 *
 * The four stages partition the analyses exactly — every scanned email has one
 * analysis row in one of these states — so a single proportional bar is
 * truthful in a way that four separate tiles is not. "Received" is the bar's
 * total, shown beside it rather than as a fifth segment.
 *
 * No percentages: the figures come from a bounded client-side scan, and a
 * percentage would invite reading it as a workspace-wide rate.
 */
export function PipelineFlow({ summary }: { summary: WorkspaceSummary }) {
  const stages: readonly { stage: Stage; count: number }[] = [
    { stage: 'pending', count: summary.pending },
    { stage: 'processing', count: summary.processing },
    { stage: 'completed', count: summary.completed },
    { stage: 'failed', count: summary.failed },
  ];

  const total = stages.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="stack">
      <div
        className="pipebar"
        role="img"
        aria-label={
          total === 0
            ? 'No analyses in the scan'
            : stages
                .filter((entry) => entry.count > 0)
                .map((entry) => `${STAGE_LABELS[entry.stage]}: ${entry.count}`)
                .join(', ')
        }
      >
        {total === 0 ? (
          <span className="pipebar__empty" />
        ) : (
          stages
            .filter((entry) => entry.count > 0)
            .map((entry) => (
              <span
                key={entry.stage}
                className="pipebar__seg"
                data-stage={entry.stage}
                style={{ flexGrow: entry.count }}
              />
            ))
        )}
      </div>

      <div className="pipelegend">
        <div className="pipelegend__item">
          <span className="pipelegend__head">
            <span className="pipelegend__swatch" data-stage="received" aria-hidden="true" />
            Received
          </span>
          <span className="pipelegend__value">{summary.scanned}</span>
        </div>
        {stages.map((entry) => (
          <div className="pipelegend__item" key={entry.stage}>
            <span className="pipelegend__head">
              <span className="pipelegend__swatch" data-stage={entry.stage} aria-hidden="true" />
              {STAGE_LABELS[entry.stage]}
            </span>
            <span className="pipelegend__value" data-zero={entry.count === 0 ? 'true' : undefined}>
              {entry.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
