import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything is private by default (docs/architecture/01-system-architecture.md §1.2 "Auth" —
// every route requires a valid Clerk session unless explicitly public). Sign-in/sign-up and
// Clerk's own callback routes are the only exceptions.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
