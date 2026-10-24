import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/server";
import { buildStats, parseYear } from "@/lib/stats/server";

// GET /api/dashboard/stats?year=2025|overall — leaderboard, game records, rivalries.
export async function GET(request: Request) {
  try {
    const year = parseYear(new URL(request.url).searchParams.get("year"));
    return NextResponse.json(await buildStats(year));
  } catch (error) {
    return errorResponse(error);
  }
}
