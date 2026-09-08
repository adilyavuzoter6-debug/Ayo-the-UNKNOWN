import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/app-icon";

/** Manifest icon (purpose: "any"). See icon-192/route.tsx for why this isn't the `icon` file convention. */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(<AppIconMark size={512} radius={112} />, {
    width: 512,
    height: 512,
  });
}
