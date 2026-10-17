import { type AnalysisDetail } from '@email-ai/contracts';
import { formatCompact, formatDateTime, formatDuration, humanizeEnum } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/states';

/**
 * One row per model call.
 *
 * `operations` is `null` on analyses that predate per-operation accounting and
 * on analyses that never ran; both cases are stated rather than shown as zeroes.
 */
export function OperationsTable({ analysis }: { analysis: AnalysisDetail }) {
  if (!analysis.operations) {
    return (
      <EmptyState
        inline
        title="No per-operation accounting"
        body={
          analysis.status === 'pending'
            ? 'This analysis has not run, so no model was called.'
            : 'This analysis was recorded before per-operation accounting existed. Totals come from the legacy model metadata instead.'
        }
      />
    );
  }

  return (
    <div className="table-scroll">
      <table className="table">
        <caption className="sr-only">Model operations for this analysis</caption>
        <thead>
          <tr>
            <th scope="col">Operation</th>
            <th scope="col">Model</th>
            <th scope="col">Status</th>
            <th scope="col" className="num">
              In
            </th>
            <th scope="col" className="num">
              Cached
            </th>
            <th scope="col" className="num">
              Out
            </th>
            <th scope="col" className="num">
              Reasoning
            </th>
            <th scope="col" className="num">
              Latency
            </th>
            <th scope="col">Completed</th>
          </tr>
        </thead>
        <tbody>
          {analysis.operations.map((operation, index) => (
            <tr key={`${operation.operation}-${index}`}>
              <td className="table__primary">{humanizeEnum(operation.operation)}</td>
              <td>
                <span className="mono">{operation.model}</span>
                <div className="table__secondary">{operation.provider}</div>
              </td>
              <td>
                {operation.status === 'succeeded' ? (
                  <Badge tone="success" dot>
                    Succeeded
                  </Badge>
                ) : (
                  <Badge tone="danger" dot>
                    {operation.failureCode ?? 'Failed'}
                  </Badge>
                )}
              </td>
              <td className="num">{formatCompact(operation.inputTokens)}</td>
              <td className="num">{formatCompact(operation.cachedInputTokens)}</td>
              <td className="num">{formatCompact(operation.outputTokens)}</td>
              <td className="num">{formatCompact(operation.reasoningTokens)}</td>
              <td className="num">{formatDuration(operation.latencyMs)}</td>
              <td className="shrink muted">{formatDateTime(operation.completedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
