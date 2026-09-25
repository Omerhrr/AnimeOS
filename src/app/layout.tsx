import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { StudioSessionProvider } from "@/components/auth/session-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Animation OS - AI-Native Production Platform",
  description:
    "DSH is the brain. The production tools execute. The engine builds the world. A persistent animated universe for donghua, anime, manhwa-inspired and general animation.",
  keywords: ["animation", "donghua", "anime", "AI director", "production pipeline", "blender", "three.js"],
  authors: [{ name: "Animation OS" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Animation OS - AI-Native Production Platform",
    description: "Persistent animated universes, orchestrated by an AI director.",
    siteName: "Animation OS",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <StudioSessionProvider>{children}</StudioSessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
