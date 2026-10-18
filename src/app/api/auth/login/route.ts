// ─────────────────────────────────────────────────────────────
// DIRECT SESSION MINT (the preview-proof login route)
//
// WHY THIS EXISTS: the studio's standard Auth.js credentials flow
// works on localhost but breaks behind the preview edge - the
// platform proxy rewrites Host to localhost:3000, so Auth.js
// derives its base URL as http://localhost:3000 and answers a
// successful sign-in with `Location: http://localhost:3000/`,
// which the member's browser cannot follow (their own machine has
// nothing on :3000). The session cookie was actually set on that
// same 302, but the client fetch dies before the redirect lands
// and the UI reports a generic failure forever.
//
// This route mints the SAME session token Auth.js would (the JWE
// `encode` from next-auth/jwt, secret = the shared AUTH_SECRET,
// salt = the exact cookie name the read side derives) and sets it
// on a JSON response - no redirect for the browser to chase, no
// CSRF cookie dance, no origin derivation to get wrong. The read
// side is untouched: proxy.ts and sessionUser() keep decoding
// `authjs.session-token` via getToken, and /api/auth/session
// (SessionProvider) keeps answering from the same cookie, because
// the token, the secret and the salt all match by construction.
//
// The standard Auth.js handlers stay intact and remain the flow
// every E2E suite drives against localhost.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import { db } from "@/lib/db";
import { authSecret, type StudioRole } from "@/lib/auth";

// Must equal the cookie name getToken() derives with secureCookie
// unset (proxy.ts and lib/auth sessionUser never pass it) - the
// salt IS this string, so encode/decode always agree.
const SESSION_COOKIE = "authjs.session-token";
const SEVEN_DAYS_SECONDS = 7 * 24 * 3600;

// ─────────────────────────────────────────────────────────────
// THE COOKIE CONTEXT LAW
//
// Behind the preview edge the studio renders inside a CROSS-SITE
// iframe, and a SameSite=Lax session cookie is third-party there:
// the browser stores nothing on the mint, sends nothing on the
// ride, every /api call reads 401, and the shell spins on
// "Initializing production environment…" forever (the live smoke
// this law answers - the login itself rode 200, the chain after
// it starved).
//
// So the attributes follow the request's context: behind an HTTPS
// edge (x-forwarded-proto) the session rides
// SameSite=None; Secure; Partitioned - the CHIPS jar a cross-site
// frame may keep (Chrome/Edge/Firefox). On plain localhost dev
// (http, no forwarded proto) it stays Lax, because SameSite=None
// without Secure is rejected outright.
// The read side is untouched: proxy.ts getToken() reads whatever
// cookie the context delivers; only the jar's label changed.
// ─────────────────────────────────────────────────────────────
function sessionCookieAttrs(req: Request, maxAge: number) {
  const proto = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
  if (proto === "https") {
    return { httpOnly: true, sameSite: "none" as const, secure: true, partitioned: true, path: "/", maxAge };
  }
  return { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge };
}

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email } });
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) {
    // Same shape as the Auth.js authorize() refusal - the UI reads error.
    return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = {
    sub: user.id,
    uid: user.id,
    role: (user.role as StudioRole) ?? "VIEWER",
    name: user.name,
    email: user.email,
    iat: now,
    exp: now + SEVEN_DAYS_SECONDS,
  };
  const jwt = await encode({ token, secret: authSecret(), salt: SESSION_COOKIE });

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, jwt, sessionCookieAttrs(req, SEVEN_DAYS_SECONDS));
  // The stale callback-url cookie (Auth.js kept writing the derived
  // localhost origin into it) is dead weight - clear it on the way in,
  // under the same context law so the clear actually lands.
  res.cookies.set("authjs.callback-url", "", sessionCookieAttrs(req, 0));
  return res;
}

// Sign-out without the Auth.js signout redirect (same preview-proof
// reasoning): expire the session cookie, the client navigates itself.
export async function DELETE(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", sessionCookieAttrs(req, 0));
  res.cookies.set("authjs.callback-url", "", sessionCookieAttrs(req, 0));
  return res;
}
