import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // The studio is previewed inside the platform's chat frame (the app
  // document lives on *.space-z.ai while the dev server derives
  // localhost) - without this, every /_next subresource logs a
  // "Cross origin request detected" warning and future Next majors
  // will hard-block the asset loads.
  allowedDevOrigins: ["*.space-z.ai", "preview-chat-c6d2aad2-b7df-4ebe-8a72-249d5ab32be2.space-z.ai"],
};

export default nextConfig;
