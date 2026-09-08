import type { Metric } from '@pet-care-tracker/core';
import { type PointerEvent, type ReactNode, useMemo, useState } from 'react';
import type { Reading } from '../api/types';
import { useSession } from '../app/session';
import { buildChart, nearestPoint, type ChartPoint } from '../lib/chart';
import { formatDate, formatMeasurement } from '../lib/format';

const WIDTH = 640;
const HEIGHT = 220;
// The bottom band is part of the box, so the axis labels are never cropped off.
const PADDING = { top: 12, right: 16, bottom: 28, left: 48 };

/**
 * One metric over time.
 *
 * A single series, so it needs no legend — the heading names it. The target corridor is a
 * background band rather than a second series: it is context for the line, not another
 * thing to compare it with.
 */
export function MeasurementChart({
  metric,
  readings,
  target,
  unitSystem,
}: {
  metric: Metric;
  readings: Reading[];
  target: { min: number | null; max: number | null } | null;
  unitSystem: 'metric' | 'imperial';
}): ReactNode {
  const { locale } = useSession();
  const [hovered, setHovered] = useState<ChartPoint | null>(null);

  const chart = useMemo(
    () =>
      buildChart(readings, {
        width: WIDTH,
        height: HEIGHT,
        padding: PADDING,
        target,
      }),
    [readings, target],
  );

  if (chart.points.length === 0) return null;

  const last = chart.points[chart.points.length - 1] as ChartPoint;
  const active = hovered ?? last;

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    // The pointer arrives in screen pixels; the geometry lives in viewBox units.
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    setHovered(nearestPoint(chart.points, x));
  };

  const label = (value: number) => formatMeasurement(metric, value, unitSystem, locale);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={`${label(active.value)}, ${formatDate(active.measuredOn, locale)}`}
        onPointerMove={onPointer}
        onPointerLeave={() => setHovered(null)}
      >
        {/* The corridor, behind everything, at a weight that stays out of the way. */}
        {chart.band && (
          <rect
            x={PADDING.left}
            y={chart.band.y}
            width={WIDTH - PADDING.left - PADDING.right}
            height={chart.band.height}
            className="fill-brand/12"
          />
        )}

        {/* Solid hairlines: a dashed grid reads as a threshold that is not there. */}
        {chart.yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={tick.y}
              y2={tick.y}
              className="stroke-line"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 8}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-muted text-[11px] tabular-nums"
            >
              {tick.value}
            </text>
          </g>
        ))}

        {chart.xTicks.map((tick) => (
          <text
            key={tick.date}
            x={tick.x}
            y={HEIGHT - 8}
            textAnchor={tick.x < WIDTH / 2 ? 'start' : 'end'}
            className="fill-muted text-[11px]"
          >
            {formatDate(tick.date, locale)}
          </text>
        ))}

        <path d={chart.path} fill="none" className="stroke-brand" strokeWidth={2} />

        {chart.points.map((point) => (
          <circle
            key={point.measuredOn + String(point.value)}
            cx={point.x}
            cy={point.y}
            r={point === active ? 6 : 4}
            className="fill-brand stroke-surface"
            strokeWidth={2}
          />
        ))}

        {/* Crosshair on the reading under the pointer. */}
        {hovered && (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={PADDING.top}
            y2={HEIGHT - PADDING.bottom}
            className="stroke-muted/40"
            strokeWidth={1}
          />
        )}

        {/* Only the active point is labelled; a number on every dot goes unread. */}
        <text
          x={Math.min(active.x + 10, WIDTH - PADDING.right)}
          y={Math.max(active.y - 10, PADDING.top + 10)}
          textAnchor={active.x > WIDTH - 120 ? 'end' : 'start'}
          className="fill-ink text-[12px] font-medium"
        >
          {label(active.value)}
        </text>
      </svg>

      <figcaption className="sr-only">
        {readings.length} readings from {formatDate(chart.points[0]!.measuredOn, locale)} to{' '}
        {formatDate(last.measuredOn, locale)}
      </figcaption>
    </figure>
  );
}
