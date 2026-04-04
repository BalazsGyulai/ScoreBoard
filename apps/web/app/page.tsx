import { redirect } from "next/navigation";

// Root route — immediately redirect.
// Middleware (middleware.ts) will handle the auth check and route to either
// /dashboard (logged in) or /login (not logged in).
// This file is a fallback in case middleware hasn't run yet.
export default function RootPage() {
  redirect("/login");
}
