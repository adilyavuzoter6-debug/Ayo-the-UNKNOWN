import type { ReactElement } from "react";

/** Piscatio's brand colors (mirrors the CSS custom properties in globals.css — this file renders
 * outside the page's stylesheet via next/og's ImageResponse, so the values are duplicated here
 * rather than referenced; keep in sync with --teal-500/--navy-900 if the palette changes). */
const BRAND_TEAL = "#00b4d8";
const BRAND_NAVY = "#0d2d5e";

/** A custom fish mark (not a stock icon) — nose right, tail fanned left, with a navy eye dot. */
function FishGlyph({ size }: { size: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        fill="white"
        d="M19 12 C15 4 9 4 4 9 L0 6 L5 12 L0 18 L4 15 C9 20 15 20 19 12 Z"
      />
      <circle cx="13.6" cy="9.7" r="1.15" fill={BRAND_NAVY} />
    </svg>
  );
}

/** Rounded gradient tile matching the in-app logo mark (favicon, apple-touch-icon, non-maskable manifest icons). */
export function AppIconMark({ size, radius }: { size: number; radius?: number }): ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${BRAND_TEAL}, ${BRAND_NAVY})`,
        borderRadius: radius ?? Math.round(size * 0.22),
      }}
    >
      <FishGlyph size={Math.round(size * 0.62)} />
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
        background: `linear-gradient(135deg, ${BRAND_TEAL}, ${BRAND_NAVY})`,
      }}
    >
      <FishGlyph size={Math.round(size * 0.5)} />
    </div>
  );
}
