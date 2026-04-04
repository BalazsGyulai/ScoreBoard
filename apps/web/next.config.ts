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
    return [
      {
        // Proxy everything under /api/ to Rust EXCEPT /api/auth/*
        // Auth routes have Next.js Route Handlers that must run first
        // (they copy the Set-Cookie headers from Rust to the browser response)
        source: "/api/((?!auth/).*)",
        destination: `${process.env.API_URL ?? "http://localhost:8080"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
