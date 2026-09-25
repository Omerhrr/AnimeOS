// ─────────────────────────────────────────────────────────────
// MULTI-USER STUDIO AUTH (NextAuth v4, credentials + JWT)
//
// The studio is a shared workspace with role-gated WRITES:
//   VIEWER  read-only (every mutating API call is refused)
//   EDITOR  can direct DSH, edit productions, generate, export
//   OWNER   everything EDITOR can do + manages the roster itself
//
// Enforcement lives on two layers:
//   1. src/proxy.ts - the coarse gate: signed-in or redirected,
//      VIEWERs blocked from every mutating /api call (JWT role claim).
//   2. src/lib/auth.ts sessionUser() - the fine gate used by
//      sensitive routes: re-reads the user row fresh from the DB on
//      EVERY call, so a role change lands immediately (no re-login
//      needed for the DB-backed checks; the proxy claim catches up
//      on the member's next sign-in).
// ─────────────────────────────────────────────────────────────

import { NextAuthOptions, getServerSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export type StudioRole = "OWNER" | "EDITOR" | "VIEWER";

export const STUDIO_ROLES: StudioRole[] = ["OWNER", "EDITOR", "VIEWER"];

export const ROLE_RANK: Record<StudioRole, number> = {
  OWNER: 2,
  EDITOR: 1,
  VIEWER: 0,
};

export const MIN_ROLE_LABEL: Record<StudioRole, string> = {
  OWNER: "an OWNER",
  EDITOR: "EDITOR or OWNER",
  VIEWER: "any signed-in member",
};

// Dev fallback so the studio boots without .env edits (the dev
// server reads .env once at start). Production deployments should
// set NEXTAUTH_SECRET and this fallback stops mattering.
const AUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "animeos-studio-dev-secret-rotate-me";

export function authSecret(): string {
  return AUTH_SECRET;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: StudioRole;
}

export const authOptions: NextAuthOptions = {
  secret: AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 7 * 24 * 3600 }, // 7 days
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      name: "Studio account",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role } as never;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id: string }).id;
        token.role = (user as { role?: string }).role ?? "VIEWER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.role = (token.role as StudioRole) ?? "VIEWER";
      }
      return session;
    },
  },
};

// ─── The fine gate: fresh-from-DB identity for route handlers ──
// Accepts the incoming Request (route handlers pass it straight
// through), verifies the studio JWT and re-reads the user row so
// role changes apply on the very next call. Optionally bumps
// lastSeenAt for the roster's liveness readout (fire-and-forget).

export async function sessionUser(req?: Request, opts?: { touch?: boolean }): Promise<SessionUser | null> {
  try {
    if (req) {
      const token = await getToken({ req: req as never, secret: AUTH_SECRET });
      if (!token?.uid) return null;
      const row = await db.user.findUnique({ where: { id: String(token.uid) } });
      if (!row) return null;
      if (opts?.touch) {
        db.user.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
      }
      return { id: row.id, email: row.email, name: row.name, role: (row.role as StudioRole) ?? "VIEWER" };
    }
    // No request object (server components): fall back to the cached
    // session claim - good enough for reads, never used for writes.
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    return { id: session.user.id, email: session.user.email ?? "", name: session.user.name ?? "", role: session.user.role ?? "VIEWER" };
  } catch {
    return null;
  }
}

export type AuthGuard =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401 | 403; error: string };

export async function requireUser(req?: Request): Promise<AuthGuard> {
  const user = await sessionUser(req, { touch: true });
  if (!user) return { ok: false, status: 401, error: "Sign in to use the studio" };
  return { ok: true, user };
}

export async function requireRole(req: Request | undefined, min: StudioRole): Promise<AuthGuard> {
  const user = await sessionUser(req, { touch: true });
  if (!user) return { ok: false, status: 401, error: "Sign in to use the studio" };
  if (ROLE_RANK[user.role] < ROLE_RANK[min]) {
    return {
      ok: false,
      status: 403,
      error: `${user.role} cannot do this - needs ${MIN_ROLE_LABEL[min]}`,
    };
  }
  return { ok: true, user };
}

export function authGuardResponse(guard: AuthGuard): Response | null {
  if (guard.ok) return null;
  return Response.json({ error: guard.error }, { status: guard.status });
}

// How many OWNERs exist - used to make the last OWNER irreplaceable
// (the roster can always be administered by somebody).
export async function countOwners(): Promise<number> {
  return db.user.count({ where: { role: "OWNER" } });
}
