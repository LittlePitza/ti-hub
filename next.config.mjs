/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Do not advertise the tech stack in the responses.
  poweredByHeader: false,

  // `sharp` is a native module (image recompression on archive): it is kept out
  // of the server bundle so it loads its binary directly.
  serverExternalPackages: ["sharp"],

  experimental: {
    // Report photos are compressed in the browser before upload, but the Server
    // Action body can still exceed the 1 MB default; this leaves ample room.
    serverActions: { bodySizeLimit: "12mb" },
  },

  // Security headers for the whole site (panel and portal). Content-Security-Policy
  // is deliberately absent: the root layout uses an inline script for the theme
  // and inline styles, and a strict CSP would break both without a per-request
  // nonce.
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
