// ─────────────────────────────────────────────────────────────
// STUDIO GATE (Next.js 16 proxy - the middleware convention)
//
// The coarse gate, one layer of the studio's two-layer auth:
//   1. here      - every page needs a session; every mutating API
//                  call needs a role above VIEWER (JWT role claim).
//   2. lib/auth  - sensitive routes re-read the user row from the
//                  DB (requireUser / requireRole) so role changes
//                  land immediately where it matters.
//
// Public passthroughs: NextAuth's own endpoints, the sign-in page
// and the static media directories (panels, sheets, renders...).
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const AUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "animeos-studio-dev-secret-rotate-me";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// The workplace exceptions - the ONLY mutations a VIEWER may send.
// Both are speaking/lens acts, not direction; each route still
// enforces its own per-action rules on top:
//   1. /api/comments            - speak (the exact path, not a prefix)
//   2. PATCH .../projects/x/members - retune your OWN craft lens
//     (the members route refuses a PATCH for anyone but yourself or
//     an OWNER, and its add/remove stay OWNER-only regardless)
const VIEWER_MUTABLE = new Set(["/api/comments"]);
const VIEWER_LENS_PATCH = /^\/api\/projects\/[^/]+\/members$/;

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // NextAuth handles its own endpoints (signin/signout/callback/csrf).
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const token = await getToken({ req, secret: AUTH_SECRET });

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in to use the studio" }, { status: 401 });
    }
    // The sign-in page itself must pass through (no loop).
    if (pathname === "/signin") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  const role = (token.role as string) ?? "VIEWER";

  const viewerMayMutate =
    VIEWER_MUTABLE.has(pathname) || (req.method === "PATCH" && VIEWER_LENS_PATCH.test(pathname));

  if (pathname.startsWith("/api/") && MUTATING.has(req.method) && role === "VIEWER" && !viewerMayMutate) {
    return NextResponse.json(
      { error: "VIEWER is read-only - an OWNER can promote you from the roster" },
      { status: 403 },
    );
  }

  // Signed-in members have no business on the sign-in page.
  if (pathname === "/signin") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and the public media directories - those are
  // either static files or image/audio GETs served straight from public/.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|panels/|sheets/|renders/|voices/|auditions/|assets-blender/|subtitles/).*)",
  ],
};
