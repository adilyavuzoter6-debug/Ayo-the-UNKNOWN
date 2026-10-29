import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AppIconMark } from "@/lib/app-icon";

// The card WhatsApp, LinkedIn, X and others show when a link to the site is shared. Fonts are
// bundled because the default one lacks ğ, ş and İ.

export const alt = "Piscatio — Alabalık çiftliğinizi tek yerden yönetin";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const [soraBold, interMedium] = await Promise.all([
  readFile(join(process.cwd(), "assets/fonts/Sora-Bold.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Inter-Medium.ttf")),
]);

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #050e1d 0%, #0d2d5e 60%, #143d7a 100%)",
          color: "white",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <AppIconMark size={72} />
          <span style={{ fontFamily: "Sora", fontSize: 44 }}>Piscatio</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Sora", fontSize: 68, lineHeight: 1.1 }}>
            <span>Alabalık çiftliğinizi&nbsp;</span>
            <span style={{ color: "#22d3ee" }}>tek yerden</span>
            <span>&nbsp;yönetin</span>
          </div>
          <div style={{ fontSize: 30, color: "#cbd5e1" }}>
            Üretim, yemleme, sağlık, su kalitesi, hasat ve maliyet — bağlantı olmadan da.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#94a3b8" }}>piscatiotechnologies.com</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Sora", data: soraBold, style: "normal", weight: 700 },
        { name: "Inter", data: interMedium, style: "normal", weight: 500 },
      ],
    },
  );
}
