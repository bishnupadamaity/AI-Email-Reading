import { StatusBadge, type StatusTone } from '../components/feedback/StatusBadge';
import { useHealth } from '../hooks/use-health';
import { webEnv } from '../lib/env';

const PLANNED_FEATURES = [
  'Email ingestion and normalization',
  'Classification and structured field extraction',
  'PDF, image and spreadsheet attachment processing',
  'Validation and human review queue',
] as const;

export function HomePage() {
  const { data, error, isPending } = useHealth();

  const tone: StatusTone = isPending ? 'pending' : error ? 'error' : 'ok';

  return (
    <section className="card">
      <h1>Foundation is running</h1>
      <p className="muted">
        The monorepo scaffolding is in place. Features below are planned, not implemented.
      </p>

      <div className="row">
        <span className="row__label">API ({webEnv.apiBaseUrl})</span>
        <StatusBadge tone={tone} />
      </div>

      {data ? (
        <dl className="meta">
          <dt>Service</dt>
          <dd>{data.service}</dd>
          <dt>Version</dt>
          <dd>{data.version}</dd>
          <dt>Uptime</dt>
          <dd>{data.uptimeSeconds.toFixed(0)}s</dd>
        </dl>
      ) : null}

      {error ? (
        <p className="error">
          Could not reach the API. Start it with <code>pnpm dev:api</code>.
        </p>
      ) : null}

      <h2>Planned</h2>
      <ul className="list">
        {PLANNED_FEATURES.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </section>
  );
}
