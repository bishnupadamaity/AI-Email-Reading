import { Sparkles } from 'lucide-react';
import { AnalyzeButton } from '../../components/analysis/AnalyzeButton';
import { EmailBody } from '../../components/analysis/EmailBody';
import { FailureNotice } from '../../components/analysis/FailureNotice';
import { FieldRow } from '../../components/analysis/FieldRow';
import { Badge } from '../../components/ui/Badge';
import { Panel, PanelBody, PanelFoot, PanelHead } from '../../components/ui/Panel';
import { AnalysisStatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/states';
import { type WorkspaceRecord } from '../../hooks/use-workspace-scan';
import { readFields } from '../../lib/extraction';
import { formatDateTime, humanizeEnum, parseSender } from '../../lib/format';

/** Read-only preview of one email and the headline of its extraction. */
export function EmailPreview({ record }: { record: WorkspaceRecord }) {
  const { email, analysis } = record;
  const sender = parseSender(email.sender);
  const extraction = analysis?.extractedData;
  const fields = extraction
    ? readFields(extraction).filter((field) => field.state !== 'not_stated')
    : [];

  return (
    <div className="stack stack--lg">
      <Panel>
        <PanelBody>
          <div className="email-head">
            <h2 className="email-head__subject">{email.subject || '(no subject)'}</h2>
            <div className="email-head__row">
              <strong>{sender.name}</strong>
              <span className="muted mono">{sender.address}</span>
            </div>
            <div className="email-head__row">
              <span className="muted">Received {formatDateTime(email.receivedAt)}</span>
              {analysis ? <AnalysisStatusBadge status={analysis.status} /> : null}
              {extraction ? (
                <Badge tone="info">{humanizeEnum(extraction.classification)}</Badge>
              ) : null}
            </div>
          </div>
        </PanelBody>
      </Panel>

      {analysis ? (
        <FailureNotice
          analysis={analysis}
          actions={<AnalyzeButton emailId={email.id} analysis={analysis} />}
        />
      ) : null}

      <Panel>
        <PanelHead title="Email body" meta="Plain text, as ingested" />
        <PanelBody>
          <EmailBody body={email.bodyText} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHead
          title={
            <span className="inline inline--sm">
              <Sparkles size={13} aria-hidden="true" style={{ color: 'var(--accent)' }} />
              AI extraction
            </span>
          }
          meta={extraction ? `${fields.length} fields with a value or flag` : undefined}
          actions={
            analysis ? (
              <AnalyzeButton emailId={email.id} analysis={analysis} size="xs" variant="secondary" />
            ) : null
          }
        />
        {extraction ? (
          <>
            <PanelBody>
              <p>{extraction.summary}</p>
            </PanelBody>
            <div className="fields">
              {fields.map((field) => (
                <FieldRow key={field.key} field={field} />
              ))}
            </div>
            <PanelFoot>
              Model output, unreviewed. Open the analysis workspace to inspect evidence per field.
            </PanelFoot>
          </>
        ) : (
          <PanelBody>
            <EmptyState
              inline
              title={
                analysis?.status === 'failed'
                  ? 'No extraction was stored'
                  : 'This email has not been analysed'
              }
              body={
                analysis?.status === 'failed'
                  ? 'The run failed before an extraction could be validated and stored. Retrying starts a new run.'
                  : 'Extraction runs on demand. Running it calls the configured model once and stores the result.'
              }
            />
          </PanelBody>
        )}
      </Panel>
    </div>
  );
}
