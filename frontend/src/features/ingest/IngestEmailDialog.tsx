import { type CreateEmail, type EmailDetail } from '@email-ai/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/overlays';
import { TextArea, TextInput } from '../../components/ui/inputs';
import { describeApiError } from '../../lib/api-client';
import { createEmail } from '../../lib/api/emails';
import { useDemoMode } from '../../lib/demo/demo-mode-context';
import { routes } from '../../lib/navigation';
import { useToast } from '../../lib/toast/toast-context';

/** `datetime-local` gives no offset, so the browser's zone is applied explicitly. */
function toIso(localValue: string): string {
  return new Date(localValue).toISOString();
}

function defaultLocalNow(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

/**
 * Ingests an email through `POST /v1/emails`.
 *
 * This is the only write the API accepts, and the only way to get content into
 * the platform: there is no mailbox connection, so the dashboard does not
 * pretend to synchronise one.
 */
export function IngestEmailDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { push } = useToast();
  const { enabled: demo } = useDemoMode();

  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [receivedAt, setReceivedAt] = useState(defaultLocalNow);
  const [externalMessageId, setExternalMessageId] = useState('');

  const mutation = useMutation({
    mutationFn: (body: CreateEmail): Promise<EmailDetail> => createEmail(body),
    onSuccess: (email) => {
      void queryClient.invalidateQueries({ queryKey: ['emails'] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-scan'] });
      push({
        tone: 'success',
        title: 'Email ingested',
        description: 'Stored with a pending analysis. No analysis has run yet.',
      });
      onClose();
      navigate(routes.email(email.id));
    },
  });

  const canSubmit =
    sender.trim().length >= 3 &&
    bodyText.length > 0 &&
    receivedAt.length > 0 &&
    !mutation.isPending;

  const submit = () => {
    mutation.mutate({
      sender: sender.trim(),
      subject: subject.trim(),
      bodyText,
      receivedAt: toIso(receivedAt),
      externalMessageId: externalMessageId.trim() || null,
      emailAccountId: null,
    });
  };

  return (
    <Dialog
      title="Ingest an email"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={!canSubmit}
            loading={mutation.isPending}
          >
            Ingest
          </Button>
        </>
      }
    >
      <div className="stack">
        {demo ? (
          <div className="notice notice--warning">
            <div className="notice__body">
              <p className="notice__text">
                Demo data is on. Ingestion still writes to the real API, and the new email will only
                be visible once demo data is switched off.
              </p>
            </div>
          </div>
        ) : null}

        <p>
          Stores the email and a <code className="inline-code">pending</code> analysis in one
          transaction. Analysis is not started: run it from the email's workspace.
        </p>

        <TextInput
          label="Sender"
          placeholder="Acme Logistics &lt;dispatch@acme-logistics.example&gt;"
          value={sender}
          onChange={(event) => setSender(event.target.value)}
          required
          hint="Verbatim From header: a bare address or a Name <addr> form."
        />
        <TextInput
          label="Subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <TextArea
          label="Body (plain text)"
          value={bodyText}
          onChange={(event) => setBodyText(event.target.value)}
          placeholder={'Container MSCU7654321 departs Rotterdam on 2 February 2026.'}
          rows={8}
        />
        <TextInput
          label="Received at"
          type="datetime-local"
          value={receivedAt}
          onChange={(event) => setReceivedAt(event.target.value)}
          hint="When the provider received it. Sent as an ISO-8601 timestamp with offset."
        />
        <TextInput
          label="Provider message id (optional)"
          value={externalMessageId}
          onChange={(event) => setExternalMessageId(event.target.value)}
          hint="Used for de-duplication. Re-posting the same id for this account returns 409."
        />

        {mutation.isError ? (
          <div className="notice notice--danger">
            <div className="notice__body">
              <p className="notice__title">Ingestion failed</p>
              <p className="notice__text">{describeApiError(mutation.error)}</p>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
