import { type AnalysisDetail } from '@email-ai/contracts';
import { TriangleAlert } from 'lucide-react';
import { type ReactNode } from 'react';
import { describeFailure } from '../../lib/extraction';
import { Badge } from '../ui/Badge';

const KIND_LABELS: Record<string, string> = {
  configuration: 'Configuration',
  provider: 'Provider',
  output: 'Invalid model output',
  internal: 'Internal',
};

/**
 * Why an analysis failed, in the terms the API recorded.
 *
 * `failureMessage` is written for operators and never contains email content,
 * prompts or credentials — so it is safe to show verbatim. Stack traces and
 * provider payloads never reach the browser at all.
 */
export function FailureNotice({
  analysis,
  actions,
}: {
  analysis: AnalysisDetail;
  actions?: ReactNode;
}) {
  if (analysis.status !== 'failed') return null;

  const failure = describeFailure(analysis);

  return (
    <div className="notice notice--danger">
      <span className="notice__icon">
        <TriangleAlert size={15} aria-hidden="true" />
      </span>
      <div className="notice__body">
        <div className="inline inline--sm" style={{ marginBottom: 'var(--space-1)' }}>
          <p className="notice__title">Analysis failed · {failure.label}</p>
          <Badge tone="plain">{KIND_LABELS[failure.kind] ?? failure.kind}</Badge>
          {analysis.failureCode ? (
            <code className="inline-code">{analysis.failureCode}</code>
          ) : null}
        </div>
        {analysis.failureMessage ? <p className="notice__text">{analysis.failureMessage}</p> : null}
        <p className="notice__text" style={{ marginTop: 'var(--space-1)' }}>
          {failure.hint}
        </p>
        {actions ? (
          <div className="inline inline--sm" style={{ marginTop: 'var(--space-3)' }}>
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Schema violations the API persisted alongside a rejected extraction. */
export function ValidationIssues({ analysis }: { analysis: AnalysisDetail }) {
  if (!analysis.validationErrors?.length) return null;

  return (
    <div className="table-scroll">
      <table className="table">
        <caption className="sr-only">Validation issues</caption>
        <thead>
          <tr>
            <th scope="col">Path</th>
            <th scope="col">Problem</th>
          </tr>
        </thead>
        <tbody>
          {analysis.validationErrors.map((issue, index) => (
            <tr key={`${issue.path}-${index}`}>
              <td className="mono shrink">{issue.path}</td>
              <td>{issue.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
