/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O One-Pager é renderizado a partir de dados lidos em runtime (GENIUS.md / projects.json),
  // por isso a rota /api/projects nunca deve ser cacheada em build.
  experimental: { typedRoutes: false },
};

export default nextConfig;
