import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/app-icon";

/** Manifest icon (purpose: "any") — not the special `icon` file convention since the
 * manifest needs multiple explicit sizes at fixed, predictable URLs. */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(<AppIconMark size={192} radius={42} />, {
    width: 192,
    height: 192,
  });
}
