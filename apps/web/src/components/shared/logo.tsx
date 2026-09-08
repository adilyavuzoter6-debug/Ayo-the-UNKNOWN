import { AppIconMark } from "@/lib/app-icon";
import { cn } from "@/lib/utils";

/** The single source of truth for the Piscatio mark everywhere it appears in-app (sidebar,
 * landing/pricing headers, onboarding, auth pages) — built on the exact same AppIconMark used
 * to generate the favicon/PWA icons, so the two can never visually drift apart. */
export function Logo({
  size = 32,
  wordmark = true,
  wordmarkClassName,
  className,
}: {
  size?: number;
  wordmark?: boolean;
  wordmarkClassName?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <AppIconMark size={size} />
      {wordmark ? (
        <span
          className={cn(
            "font-display text-lg font-bold tracking-tight whitespace-nowrap",
            wordmarkClassName,
          )}
        >
          Piscatio
        </span>
      ) : null}
    </span>
  );
}
