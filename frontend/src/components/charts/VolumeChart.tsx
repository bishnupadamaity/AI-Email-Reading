import { useState } from 'react';
import { formatDayMonth } from '../../lib/format';
import { type VolumePoint } from '../../lib/workspace';

/**
 * Daily processing volume.
 *
 * Two bars per day: an outlined "received" bar, and beside it a stacked bar of
 * the analyses that finished that day. Only two hues carry data — teal for
 * completed, red for failed — because a third categorical hue cannot be
 * separated from them under colour-vision deficiency. "Received" is therefore
 * a neutral outline rather than a colour, which also reads correctly as
 * context rather than outcome.
 *
 * Validated with the design system's palette checker: teal against red
 * separates at ΔE 9.8 (deuteranopia) and 26.2 (normal vision), both passes.
 * Success-green against red, the obvious first choice, separates at ΔE 1.4
 * under deuteranopia — indistinguishable — which is why it is not used.
 */
const SERIES_LABELS = {
  received: 'Emails received',
  completed: 'Analyses completed',
  failed: 'Analyses failed',
} as const;

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 136;
const PAD = { top: 16, right: 4, bottom: 20, left: 26 } as const;

/** A rectangle with its top corners rounded, anchored to the baseline. */
function barPath(x: number, y: number, width: number, height: number, radius = 2.5): string {
  if (height <= 0) return '';
  const r = Math.min(radius, width / 2, height);
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    'Z',
  ].join(' ');
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export function VolumeChart({ points }: { points: readonly VolumePoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const plotWidth = VIEW_WIDTH - PAD.left - PAD.right;
  const plotHeight = VIEW_HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotHeight;

  const max = niceMax(
    Math.max(1, ...points.map((point) => Math.max(point.received, point.completed + point.failed))),
  );

  const bandWidth = plotWidth / Math.max(points.length, 1);
  // Two slots per day with a 2px gap, inside a 4px band inset.
  const slotWidth = Math.max(2.5, (bandWidth - 6) / 2 - 1);

  const scale = (value: number) => (value / max) * plotHeight;
  const labelEvery = Math.max(1, Math.round(points.length / 7));
  const hoveredPoint = hovered == null ? null : points[hovered];

  return (
    <div className="chart-wrap">
      <div className="chart">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          role="img"
          aria-label={`Emails received and analyses finished per day, last ${points.length} days`}
        >
          <text className="chart__axis-title" x={0} y={8}>
            Count / day
          </text>

          {[0, 0.5, 1].map((fraction) => {
            const y = baseline - fraction * plotHeight;
            return (
              <g key={fraction}>
                <line
                  className="chart__grid-line"
                  x1={PAD.left}
                  x2={VIEW_WIDTH - PAD.right}
                  y1={y}
                  y2={y}
                />
                <text className="chart__axis-label" x={PAD.left - 6} y={y + 3} textAnchor="end">
                  {Math.round(fraction * max)}
                </text>
              </g>
            );
          })}

          {points.map((point, index) => {
            const bandX = PAD.left + index * bandWidth;
            const receivedHeight = scale(point.received);
            const completedHeight = scale(point.completed);
            const failedHeight = scale(point.failed);
            const dim = hovered != null && hovered !== index;
            // 2px surface gap between stacked segments, per the mark spec.
            const gap = completedHeight > 0 && failedHeight > 0 ? 2 : 0;

            return (
              <g
                key={point.day}
                className="chart__band"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              >
                <rect
                  className="chart__band-bg"
                  x={bandX}
                  y={PAD.top}
                  width={bandWidth}
                  height={plotHeight}
                  fill="transparent"
                />

                {point.received > 0 ? (
                  <path
                    d={barPath(bandX + 3, baseline - receivedHeight, slotWidth, receivedHeight)}
                    fill="var(--chart-ghost-fill)"
                    stroke="var(--chart-ghost)"
                    strokeWidth={1}
                    opacity={dim ? 0.5 : 1}
                  />
                ) : null}

                {failedHeight > 0 ? (
                  <path
                    d={barPath(
                      bandX + 5 + slotWidth,
                      baseline - failedHeight,
                      slotWidth,
                      failedHeight,
                    )}
                    fill="var(--chart-danger)"
                    opacity={dim ? 0.45 : 1}
                  />
                ) : null}

                {completedHeight > 0 ? (
                  <path
                    d={barPath(
                      bandX + 5 + slotWidth,
                      baseline - failedHeight - gap - completedHeight,
                      slotWidth,
                      completedHeight,
                    )}
                    fill="var(--chart-primary)"
                    opacity={dim ? 0.45 : 1}
                  />
                ) : null}

                {index % labelEvery === 0 ? (
                  <text
                    className="chart__axis-label"
                    x={bandX + bandWidth / 2}
                    y={baseline + 13}
                    textAnchor="middle"
                  >
                    {formatDayMonth(`${point.day}T12:00:00.000Z`)}
                  </text>
                ) : null}
              </g>
            );
          })}

          <line
            className="chart__axis-line"
            x1={PAD.left}
            x2={VIEW_WIDTH - PAD.right}
            y1={baseline}
            y2={baseline}
          />
        </svg>
      </div>

      {hoveredPoint && hovered != null ? (
        <div
          className="chart__tooltip"
          style={{
            left: `${((PAD.left + (hovered + 0.5) * bandWidth) / VIEW_WIDTH) * 100}%`,
            top: `${(PAD.top / VIEW_HEIGHT) * 100}%`,
          }}
        >
          <strong>{formatDayMonth(`${hoveredPoint.day}T12:00:00.000Z`)}</strong>
          <div className="chart__tooltip-row">
            <span
              className="chart__tooltip-swatch"
              style={{
                background: 'var(--chart-ghost-fill)',
                border: '1px solid var(--chart-ghost)',
              }}
            />
            {SERIES_LABELS.received}: {hoveredPoint.received}
          </div>
          <div className="chart__tooltip-row">
            <span
              className="chart__tooltip-swatch"
              style={{ background: 'var(--chart-primary)' }}
            />
            {SERIES_LABELS.completed}: {hoveredPoint.completed}
          </div>
          <div className="chart__tooltip-row">
            <span className="chart__tooltip-swatch" style={{ background: 'var(--chart-danger)' }} />
            {SERIES_LABELS.failed}: {hoveredPoint.failed}
          </div>
        </div>
      ) : null}

      <div className="chart__legend" style={{ marginTop: 'var(--space-3)' }}>
        <span className="chart__legend-item">
          <span className="chart__swatch chart__swatch--ghost" aria-hidden="true" />
          {SERIES_LABELS.received}
        </span>
        <span className="chart__legend-item">
          <span
            className="chart__swatch"
            style={{ background: 'var(--chart-primary)' }}
            aria-hidden="true"
          />
          {SERIES_LABELS.completed}
        </span>
        <span className="chart__legend-item">
          <span
            className="chart__swatch"
            style={{ background: 'var(--chart-danger)' }}
            aria-hidden="true"
          />
          {SERIES_LABELS.failed}
        </span>
      </div>
    </div>
  );
}

/** The same numbers as a table, for screen readers and exact reading. */
export function VolumeTable({ points }: { points: readonly VolumePoint[] }) {
  const rows = [...points]
    .reverse()
    .filter((point) => point.received + point.completed + point.failed > 0);

  return (
    <div className="table-scroll">
      <table className="table">
        <caption className="sr-only">Daily email and analysis volume</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col" className="num">
              Received
            </th>
            <th scope="col" className="num">
              Completed
            </th>
            <th scope="col" className="num">
              Failed
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">
                No activity in this range.
              </td>
            </tr>
          ) : (
            rows.map((point) => (
              <tr key={point.day}>
                <td>{formatDayMonth(`${point.day}T12:00:00.000Z`)}</td>
                <td className="num">{point.received}</td>
                <td className="num">{point.completed}</td>
                <td className="num">{point.failed}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
