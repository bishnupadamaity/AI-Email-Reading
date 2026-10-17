import { FileText, Paperclip } from 'lucide-react';
import { PageBody } from '../../components/layout/AppShell';
import { PageHeader, TopbarLead } from '../../components/layout/PageChrome';
import { ButtonLink } from '../../components/ui/Button';
import { Panel, PanelBody, PanelFoot, PanelHead, Section } from '../../components/ui/Panel';
import { CapabilityNotice } from '../../components/ui/Unsupported';
import { EmptyState } from '../../components/ui/states';
import { capabilities } from '../../lib/capabilities';
import { routes } from '../../lib/navigation';

/**
 * Documents and attachments — not implemented anywhere in the platform.
 *
 * There is no `attachments` table, no storage, no parsing and no endpoint, and
 * ingestion accepts a plain-text body only. Rather than render an empty table
 * that implies attachments merely have not arrived yet, this page states what
 * is missing and what would have to exist.
 */
export function DocumentsPage() {
  return (
    <PageBody>
      <TopbarLead title="Documents" />

      <PageHeader
        title="Documents and attachments"
        description="Email attachments — packing lists, bills of lading, invoices, customs paperwork — are not part of the platform yet. This page exists so the gap is visible rather than implied."
      />

      <CapabilityNotice capability="attachments" title="Attachments are not ingested or stored" />

      <div className="grid grid--2">
        <Section title="What is missing">
          <Panel>
            <PanelBody>
              <dl className="dl dl--stacked">
                <dt>Database</dt>
                <dd>
                  No <code className="inline-code">attachments</code> table. The data model lists it
                  as planned, related to <code className="inline-code">emails</code> one-to-many.
                </dd>
                <dt>Ingestion</dt>
                <dd>
                  <code className="inline-code">POST /v1/emails</code> accepts{' '}
                  <code className="inline-code">bodyText</code> only — a message's attachments are
                  never transferred, so no stored email has one.
                </dd>
                <dt>Storage</dt>
                <dd>No object store or file service is configured in any workspace.</dd>
                <dt>Extraction</dt>
                <dd>
                  No OCR or document parsing exists. The AI service extracts from email text and
                  rejects any request naming another operation.
                </dd>
              </dl>
            </PanelBody>
            <PanelFoot>
              Endpoints required:{' '}
              <code className="inline-code">{capabilities.attachments.endpoint}</code> and{' '}
              <code className="inline-code">{capabilities.documentExtraction.endpoint}</code>.
            </PanelFoot>
          </Panel>
        </Section>

        <Section title="What this page will show">
          <Panel>
            <PanelHead
              title={
                <span className="inline inline--sm">
                  <Paperclip size={13} aria-hidden="true" />
                  Planned columns
                </span>
              }
            />
            <PanelBody>
              <dl className="dl">
                <dt>File</dt>
                <dd>Name, media type and size as stored</dd>
                <dt>Email</dt>
                <dd>The message it arrived on</dd>
                <dt>Received</dt>
                <dd>Ingestion timestamp</dd>
                <dt>Processing</dt>
                <dd>Queued, processing, processed or failed</dd>
                <dt>Extraction</dt>
                <dd>OCR or parse status, with a retry for failures</dd>
                <dt>Error</dt>
                <dd>Operator-safe failure reason</dd>
              </dl>
            </PanelBody>
            <PanelFoot>
              The layout is deliberately not rendered as a table of zeroes: an empty table reads as
              "no documents yet", which would be a different claim.
            </PanelFoot>
          </Panel>
        </Section>
      </div>

      <Panel>
        <EmptyState
          icon={<FileText size={18} aria-hidden="true" />}
          title="Nothing to list"
          body="Until attachments are ingested there is no document inventory to show. Email text extraction is fully implemented and available in the analysis workspace."
          actions={
            <ButtonLink to={routes.inbox} variant="primary">
              Go to the inbox
            </ButtonLink>
          }
        />
      </Panel>
    </PageBody>
  );
}
