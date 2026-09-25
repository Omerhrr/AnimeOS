"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function StudioSessionProvider({ children }: { children: ReactNode }) {
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
