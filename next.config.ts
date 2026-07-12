import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Permite restaurar backups grandes (upload do JSON via Server Action).
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
