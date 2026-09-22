"use client";

import dynamic from "next/dynamic";

const StudioShell = dynamic(
  () => import("@/components/studio/studio-shell").then((m) => m.StudioShell),
  { ssr: false, loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a10] text-neutral-400">
      <span className="text-sm tracking-wide animate-pulse">Loading Animation OS…</span>
    </div>
  ) }
);

export default function Home() {
  return <StudioShell />;
}
