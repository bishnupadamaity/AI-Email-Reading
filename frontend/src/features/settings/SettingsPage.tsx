import { Database, KeyRound, Lock, Server, ShieldCheck } from 'lucide-react';
import { PageBody } from '../../components/layout/AppShell';
import { PageHeader, TopbarLead } from '../../components/layout/PageChrome';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Panel, PanelBody, PanelFoot, PanelHead, Section } from '../../components/ui/Panel';
import { ConnectionBadge } from '../../components/ui/StatusBadge';
import { CapabilityNotice, UnsupportedButton } from '../../components/ui/Unsupported';
import { Switch } from '../../components/ui/inputs';
import { Skeleton } from '../../components/ui/states';
import { useHealth, useReadiness } from '../../hooks/use-health';
import { OPERATION_ROUTING, SECRET_SETTINGS, TUNING_KNOBS } from '../../lib/ai-config';
import { brand } from '../../lib/brand';
import { useDemoMode } from '../../lib/demo/demo-mode-context';
import { webEnv } from '../../lib/env';
import { formatDuration, humanizeEnum } from '../../lib/format';
import { useSeenEmails } from '../../lib/seen-store';
import { useTheme } from '../../lib/theme/theme-context';

/**
 * Settings.
 *
 * Split by who owns each value. Browser preferences are real and persist in
 * localStorage. Everything AI- or infrastructure-related is environment-owned
 * and server-side: it is shown read-only, as documented defaults, and no
 * endpoint returns environment variables or credentials to this page.
 */
export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { enabled: demo, setEnabled: setDemo } = useDemoMode();
  const { seen, clearSeen } = useSeenEmails();
  const liveness = useHealth();
  const readiness = useReadiness();

  return (
    <PageBody>
      <TopbarLead title="Settings" />

      <PageHeader
        title="Settings"
        description="Browser preferences are saved locally. AI, processing and infrastructure settings are owned by the server environment and shown read-only — no endpoint exposes configuration or secrets to the browser, by design."
      />

      <Section
        title="Workspace preferences"
        description="Stored in this browser only. Nothing is sent to the API."
      >
        <Panel>
          <PanelBody className="stack">
            <Switch
              checked={theme === 'dark'}
              onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              label={
                <span>
                  Dark theme
                  <span className="muted" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                    Light is the product default. Saved per browser.
                  </span>
                </span>
              }
            />
            <hr className="divider" />
            <Switch
              checked={demo}
              onChange={setDemo}
              label={
                <span>
                  Demo data
                  <span className="muted" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                    Replaces every view with synthetic records built from the repository's contract
                    fixtures. A banner stays visible while it is on, and no request is sent to the
                    API.
                  </span>
                </span>
              }
            />
            <hr className="divider" />
            <div className="inline inline--between">
              <span>
                Local read markers
                <span className="muted" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                  {seen.size} {seen.size === 1 ? 'email' : 'emails'} marked as opened in this
                  browser. The API stores no read state.
                </span>
              </span>
              <Button size="sm" onClick={clearSeen} disabled={seen.size === 0}>
                Clear
              </Button>
            </div>
          </PanelBody>
          <PanelFoot>Workspace name and product branding are set in code ({brand.name}).</PanelFoot>
        </Panel>
      </Section>

      <Section
        title="AI provider and model configuration"
        description="Read-only. Each operation routes to its own model in the AI service; there is no global model setting."
      >
        <CapabilityNotice capability="modelConfigRead" title="Model configuration is server-side" />

        <Panel>
          <PanelHead title="Operation models" meta="documented defaults" />
          <div className="table-scroll">
            <table className="table">
              <caption className="sr-only">Model configured per AI operation</caption>
              <thead>
                <tr>
                  <th scope="col">Operation</th>
                  <th scope="col">Environment variable</th>
                  <th scope="col">Default model id</th>
                  <th scope="col">Implementation</th>
                  <th scope="col">Verified here</th>
                </tr>
              </thead>
              <tbody>
                {OPERATION_ROUTING.map((entry) => (
                  <tr key={entry.operation}>
                    <td className="table__primary">{humanizeEnum(entry.operation)}</td>
                    <td className="mono">{entry.variable}</td>
                    <td className="mono">{entry.defaultModel}</td>
                    <td>
                      {entry.implemented ? (
                        <Badge tone="success">Has a caller</Badge>
                      ) : (
                        <Badge tone="plain">Configured, no caller</Badge>
                      )}
                    </td>
                    <td>
                      <Badge tone="warning">Not verified</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PanelFoot>
            The AI service validates every configured model at startup and reports the routing table
            on its own <code className="inline-code">GET /health/ready</code> — which is internal
            and not reachable from the browser. "Not verified" means exactly that: this page cannot
            confirm what is configured. There is no fallback model; a bad id fails the request with
            a 503 naming the model and operation.
          </PanelFoot>
        </Panel>

        <Panel>
          <PanelHead title="Timeouts and limits" meta="owned by the environment" />
          <div className="table-scroll">
            <table className="table">
              <caption className="sr-only">Timeout and token limit settings</caption>
              <thead>
                <tr>
                  <th scope="col">Variable</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Purpose</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {TUNING_KNOBS.map((knob) => (
                  <tr key={knob.variable}>
                    <td className="mono">{knob.variable}</td>
                    <td>
                      <Badge tone="plain">{knob.owner}</Badge>
                    </td>
                    <td className="muted">{knob.purpose}</td>
                    <td className="muted">Not exposed</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PanelFoot>
            For reference, this dashboard waits {formatDuration(180_000)} for an analysis request —
            above the server's own deadline so the API's answer, including a recorded failure, is
            what decides the outcome.
          </PanelFoot>
        </Panel>
      </Section>

      <Section title="Email processing and review rules">
        <div className="grid grid--2">
          <Panel>
            <PanelHead title="Processing preferences" />
            <PanelBody className="stack stack--sm">
              <p>
                There are none to set. Analysis runs only when requested, one email at a time, and
                ingestion stores a pending analysis without dispatching anything.
              </p>
              <dl className="dl">
                <dt>Trigger</dt>
                <dd>Manual, via POST /v1/emails/:id/analyze</dd>
                <dt>Concurrency</dt>
                <dd>One analysis per email, enforced by a unique in-flight index</dd>
                <dt>Re-runs</dt>
                <dd>A completed analysis is never re-run; a failed one starts a new run</dd>
                <dt>Queue or worker</dt>
                <dd className="muted">Not implemented — no background pipeline exists</dd>
              </dl>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="Review rules" />
            <PanelBody className="stack stack--sm">
              <p className="muted">
                No rules engine exists. This dashboard decides what "needs review" in the browser: a
                conflict, a reported missing field, invalid model output or a failed run.
              </p>
              <div className="inline inline--sm">
                <UnsupportedButton capability="reviewDecision" icon={<Lock size={12} />}>
                  Configure thresholds
                </UnsupportedButton>
              </div>
            </PanelBody>
            <PanelFoot>
              The contract defines a confidence field and review reasons for a future queue, but
              extraction returns evidence rather than confidence scores, so no threshold applies
              today.
            </PanelFoot>
          </Panel>
        </div>
      </Section>

      <Section title="Integrations">
        <Panel>
          <PanelBody className="stack stack--sm">
            <div className="inline inline--between">
              <span>
                <strong>Mailbox connection</strong>
                <span className="muted" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                  None. Emails arrive only through the ingestion endpoint; there is no provider
                  sync, so the dashboard never shows a "last synced" time.
                </span>
              </span>
              <Badge tone="plain">Not connected</Badge>
            </div>
            <hr className="divider" />
            <div className="inline inline--between">
              <span>
                <strong>AI service</strong>
                <span className="muted" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                  Python/FastAPI service called by the API over an internal HTTP contract. Its
                  status is not part of the API's readiness response, so it cannot be shown here.
                </span>
              </span>
              <Badge tone="plain">Status unknown</Badge>
            </div>
            <hr className="divider" />
            <div className="inline inline--between">
              <span>
                <strong>Object storage, OCR, webhooks</strong>
                <span className="muted" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                  Not implemented.
                </span>
              </span>
              <Badge tone="plain">None</Badge>
            </div>
          </PanelBody>
        </Panel>
      </Section>

      <Section title="API and service health" description="Live, from the API's own probes.">
        <div className="grid grid--2">
          <Panel>
            <PanelHead
              title={
                <span className="inline inline--sm">
                  <Server size={13} aria-hidden="true" />
                  API
                </span>
              }
              actions={
                <ConnectionBadge
                  tone={liveness.isPending ? 'pending' : liveness.error ? 'error' : 'ok'}
                />
              }
            />
            <PanelBody>
              {liveness.isPending ? (
                <Skeleton width="60%" />
              ) : liveness.error ? (
                <p className="muted">
                  Could not reach <code className="inline-code">{webEnv.apiBaseUrl}/health</code>.
                  Start the API with <code className="inline-code">pnpm dev:api</code> and make sure
                  this origin is in <code className="inline-code">CORS_ORIGINS</code>.
                </p>
              ) : (
                <dl className="dl">
                  <dt>Base URL</dt>
                  <dd className="mono">{webEnv.apiBaseUrl}</dd>
                  <dt>Service</dt>
                  <dd>{liveness.data?.service}</dd>
                  <dt>Version</dt>
                  <dd>{liveness.data?.version}</dd>
                  <dt>Uptime</dt>
                  <dd>{formatDuration((liveness.data?.uptimeSeconds ?? 0) * 1000)}</dd>
                </dl>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead
              title={
                <span className="inline inline--sm">
                  <Database size={13} aria-hidden="true" />
                  Dependencies
                </span>
              }
              actions={
                <ConnectionBadge
                  tone={
                    readiness.isPending
                      ? 'pending'
                      : readiness.error
                        ? 'error'
                        : readiness.data?.status === 'ok'
                          ? 'ok'
                          : 'error'
                  }
                  label={
                    readiness.isPending
                      ? undefined
                      : readiness.data?.status === 'ok'
                        ? 'Ready'
                        : 'Not ready'
                  }
                />
              }
            />
            <PanelBody>
              {readiness.isPending ? (
                <Skeleton width="50%" />
              ) : readiness.error ? (
                <p className="muted">Readiness probe unreachable.</p>
              ) : (
                <dl className="dl">
                  {Object.entries(readiness.data?.dependencies ?? {}).map(([name, status]) => (
                    <div key={name} style={{ display: 'contents' }}>
                      <dt>{humanizeEnum(name)}</dt>
                      <dd>
                        <ConnectionBadge
                          tone={
                            status === 'up' ? 'ok' : status === 'disabled' ? 'disabled' : 'error'
                          }
                          label={humanizeEnum(status)}
                        />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </PanelBody>
            <PanelFoot>
              The probe reports each dependency as up, down or disabled, and answers 503 when an
              enabled one is unreachable.
            </PanelFoot>
          </Panel>
        </div>
      </Section>

      <Section title="Security and access control">
        <div className="grid grid--2">
          <Panel>
            <PanelHead
              title={
                <span className="inline inline--sm">
                  <ShieldCheck size={13} aria-hidden="true" />
                  Access
                </span>
              }
            />
            <PanelBody>
              <CapabilityNotice capability="auth" title="There is no authentication" />
            </PanelBody>
            <PanelFoot>
              Every request from this dashboard is anonymous. Do not expose this deployment to an
              untrusted network.
            </PanelFoot>
          </Panel>

          <Panel>
            <PanelHead
              title={
                <span className="inline inline--sm">
                  <KeyRound size={13} aria-hidden="true" />
                  Secrets
                </span>
              }
            />
            <div className="table-scroll">
              <table className="table">
                <caption className="sr-only">Secret settings and where they live</caption>
                <thead>
                  <tr>
                    <th scope="col">Variable</th>
                    <th scope="col">Held by</th>
                    <th scope="col">Visible here</th>
                  </tr>
                </thead>
                <tbody>
                  {SECRET_SETTINGS.map((secret) => (
                    <tr key={secret.variable}>
                      <td className="mono">{secret.variable}</td>
                      <td>
                        <Badge tone="plain">{secret.owner}</Badge>
                      </td>
                      <td>
                        <Badge tone="success">Never</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PanelFoot>
              No masked values either: there is no endpoint that returns environment variables, and
              adding one would be a regression. Only <code className="inline-code">VITE_</code>
              -prefixed variables reach this bundle — today just the API base URL.
            </PanelFoot>
          </Panel>
        </div>
      </Section>
    </PageBody>
  );
}
