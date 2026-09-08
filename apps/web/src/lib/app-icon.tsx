import type { ReactElement } from "react";

/** Exact path data from lucide-react's "Waves" icon (viewBox 0 0 24 24) — matches the mark used in AppSidebar/landing page. */
const WAVE_PATHS = [
  "M2 12q2.5 2 5 0t5 0 5 0 5 0",
  "M2 19q2.5 2 5 0t5 0 5 0 5 0",
  "M2 5q2.5 2 5 0t5 0 5 0 5 0",
];

function WavesGlyph({ size }: { size: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {WAVE_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Rounded teal tile matching the in-app logo mark (favicon, apple-touch-icon, non-maskable manifest icons). */
export function AppIconMark({ size, radius }: { size: number; radius?: number }): ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#14b8a6",
        borderRadius: radius ?? Math.round(size * 0.22),
      }}
    >
      <WavesGlyph size={Math.round(size * 0.6)} />
    </div>
  );
}

/**
 * Full-bleed square for the "maskable" manifest icon — no rounding (Android applies its own
 * mask shape), glyph kept inside the ~80% safe zone so it survives a circular/squircle crop.
 */
export function MaskableAppIcon({ size }: { size: number }): ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#14b8a6",
      }}
    >
      <WavesGlyph size={Math.round(size * 0.5)} />
    </div>
  );
}
