/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No revelar la pila tecnológica en las respuestas.
  poweredByHeader: false,

  // Cabeceras de seguridad para todo el sitio (panel y portal). No se incluye
  // Content-Security-Policy porque el layout usa un script inline para el tema
  // y estilos inline; una CSP estricta lo rompería sin un nonce por petición.
  async headers() {
    const seguridad = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    ];
    return [{ source: "/:path*", headers: seguridad }];
  },
};

export default nextConfig;
