import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ts-ignore
  allowedDevOrigins: ["5.128.164.38"],
  async rewrites() {
    return [
      {
        source: "/api/tts/:path*",
        destination: "http://127.0.0.1:8000/api/tts/:path*",
      },
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:4173/api/:path*",
      },
    ];
  },
};

export default nextConfig;
