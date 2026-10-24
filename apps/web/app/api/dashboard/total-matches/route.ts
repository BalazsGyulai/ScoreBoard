import { NextResponse } from "next/server";
import { errorResponse, serverFetch } from "@/lib/api/server";
import type { ApiGame } from "@/types/api";

interface ApiPlacement {
  snapshot_id: string;
  user_id: string;
  place: number;
  closed_at: string;
}

export async function GET() {
  try {
    const [games, placements] = await Promise.all([
      serverFetch<ApiGame[]>("/games"),
      serverFetch<ApiPlacement[]>("/stats/history"),
    ]);
    const totalMatches = new Set(placements.map((p) => p.snapshot_id)).size;
    const distinctGames = new Set(games.map((g) => g.name.trim().toLowerCase())).size;

    return NextResponse.json({
      value: totalMatches.toString(),
      subLabel: `${distinctGames} kulonbozo jatek`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
