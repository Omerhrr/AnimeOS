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
  res.cookies.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SEVEN_DAYS_SECONDS,
  });
  // The stale callback-url cookie (Auth.js kept writing the derived
  // localhost origin into it) is dead weight - clear it on the way in.
  res.cookies.set("authjs.callback-url", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

// Sign-out without the Auth.js signout redirect (same preview-proof
// reasoning): expire the session cookie, the client navigates itself.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set("authjs.callback-url", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
