import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything is private by default (docs/architecture/01-system-architecture.md §1.2 "Auth" —
// every route requires a valid Clerk session unless explicitly public), except the marketing
// landing page at "/" (exact — not a wildcard, so /dashboard etc. stay protected), "/pricing",
// sign-in/sign-up, the invitation-acceptance page (its own client code already handles both the
// signed-out and signed-in cases, and the token it needs must survive this redirect — see below),
// and the PWA icon/manifest routes (extension-less `ImageResponse` route handlers, so they don't
// match the static-file exclusion in `config.matcher` below — browsers and OS install prompts
// fetch these while signed out, e.g. from the landing page).
const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/accept-invitation(.*)",
  "/icon",
  "/apple-icon",
  "/icon-192",
  "/icon-512",
  "/icon-512-maskable",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // Not auth.protect(): in Next.js 16's Node.js proxy runtime, inside a pnpm/Turborepo
  // monorepo, NEXT_PUBLIC_CLERK_SIGN_IN_URL isn't reliably readable, so auth.protect()'s
  // internal redirect resolves against an empty signInUrl and bounces back to the current
  // page instead of /sign-in (https://github.com/clerk/javascript/issues/8302). Redirecting
  // explicitly sidesteps that broken internal resolution.
  const { userId } = await auth();
  if (!userId) {
    // Carry the original destination through as redirect_url (Clerk's own convention — the
    // <SignIn>/<SignUp> components already honor it over NEXT_PUBLIC_CLERK_*_FALLBACK_REDIRECT_URL
    // once it's present) so signing in from a deep link returns there instead of the app's default
    // landing page. Without this, every protected deep link opened while signed out was silently
    // dropped at this redirect.
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
