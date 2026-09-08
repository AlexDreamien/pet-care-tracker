import qrcode from 'qrcode-generator';
import { type ReactNode, useMemo } from 'react';

/**
 * A QR code as one SVG path.
 *
 * Built module by module rather than by injecting the library's SVG string: a single path
 * of rectangles renders crisply at any size, prints without artefacts, and keeps
 * `dangerouslySetInnerHTML` out of the tree.
 */
export function QrCode({
  value,
  size = 220,
  className = '',
}: {
  value: string;
  size?: number;
  className?: string;
}): ReactNode {
  const { path, modules } = useMemo(() => {
    // Type 0 lets the library pick the smallest version that fits; M corrects about 15%
    // of damage, which is what a code on a collar will eventually need.
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();

    const count = qr.getModuleCount();
    const parts: string[] = [];

    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.isDark(row, column)) parts.push(`M${column} ${row}h1v1h-1z`);
      }
    }

    return { path: parts.join(''), modules: count };
  }, [value]);

  // A quiet zone of four modules is part of the specification, not decoration: without it
  // a scanner cannot find the code's edges.
  const quiet = 4;
  const extent = modules + quiet * 2;

  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={value}
      shapeRendering="crispEdges"
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <g transform={`translate(${quiet} ${quiet})`}>
        <path d={path} fill="#000000" />
      </g>
    </svg>
  );
}
