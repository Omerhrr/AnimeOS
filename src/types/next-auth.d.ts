import type { DefaultSession } from "next-auth";
import type { StudioRole } from "@/lib/auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: StudioRole;
    } & DefaultSession["user"];
  }
  interface User {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: string;
  }
}
