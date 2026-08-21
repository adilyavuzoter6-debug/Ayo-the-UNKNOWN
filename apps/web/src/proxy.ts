import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything is private by default (docs/architecture/01-system-architecture.md §1.2 "Auth" —
// every route requires a valid Clerk session unless explicitly public), except the marketing
// landing page at "/" (exact — not a wildcard, so /dashboard etc. stay protected), "/pricing",
// and sign-in/sign-up.
const isPublicRoute = createRouteMatcher(["/", "/pricing", "/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // Not auth.protect(): in Next.js 16's Node.js proxy runtime, inside a pnpm/Turborepo
  // monorepo, NEXT_PUBLIC_CLERK_SIGN_IN_URL isn't reliably readable, so auth.protect()'s
  // internal redirect resolves against an empty signInUrl and bounces back to the current
  // page instead of /sign-in (https://github.com/clerk/javascript/issues/8302). Redirecting
  // explicitly sidesteps that broken internal resolution.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
