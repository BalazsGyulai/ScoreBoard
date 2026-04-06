import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone" packages only the files needed to run the app.
  // This is what makes the Docker image small — no dev dependencies, no source maps.
  // Required for the Docker multi-stage build to work correctly.
  // Only enabled in production — in dev mode it can conflict with Node.js 22's
  // file-based localStorage, causing "localStorage.getItem is not a function" errors.
  ...(process.env.NODE_ENV === "production" && { output: "standalone" }),

  // Enables TypeScript-level type checking for <Link href="..."> values.
  // Next.js will error at build time if you link to a route that doesn't exist.
  experimental: {
    typedRoutes: true,
  },

  // Point Next.js at the Rust API for server-side fetches.
  // Set this in .env.local for dev and in Docker environment for prod.
  // Usage in lib/api/*.ts: fetch(`${process.env.API_URL}/games`)
  env: {
    API_URL: process.env.API_URL ?? "http://localhost:8080",
  },

  // Rewrites let the browser call /api/sse/... without knowing the Rust server's address.
  // The Next.js server proxies it internally — the Rust URL never leaks to the client.
  async rewrites() {
    const API_URL = process.env.API_URL ?? "http://localhost:8080";
    return [
      {
        // Proxy the routes the frontend calls directly.
        // `/api/auth/*` is intentionally left to Next.js route handlers
        // (they copy Set-Cookie from Rust to the browser).
        source: "/api/games",
        destination: `${API_URL}/games`,
      },
      {
        source: "/api/games/:id",
        destination: `${API_URL}/games/:id`,
      },
      {
        source: "/api/games/:id/scores",
        destination: `${API_URL}/games/:id/scores`,
      },
      {
        source: "/api/scores/:id",
        destination: `${API_URL}/scores/:id`,
      },
      {
        source: "/api/players",
        destination: `${API_URL}/players`,
      },
    ];
  },
};

export default nextConfig;
