import { ImageResponse } from "next/og";
import { MaskableAppIcon } from "@/lib/app-icon";

/** Manifest icon (purpose: "maskable") — Android crops this to its own shape, so it's full-bleed. */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(<MaskableAppIcon size={512} />, {
    width: 512,
    height: 512,
  });
}
