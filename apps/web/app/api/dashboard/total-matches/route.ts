import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/api/server";
import type { ApiGame } from "@/types/api";

interface ApiPlayerStat {
  id: string;
  username: string;
  wins: number;
  losses: number;
  total_rounds: number;
}

export async function GET() {
  try {
    const [games, stats] = await Promise.all([
      serverFetch<ApiGame[]>("/games"),
      serverFetch<ApiPlayerStat[]>("/stats"),
    ]);
    const totalMatches = stats.reduce(
      (maxRounds, row) => Math.max(maxRounds, row.total_rounds),
      0,
    );
    const distinctGames = new Set(games.map((g) => g.name.trim().toLowerCase())).size;

    return NextResponse.json({
      value: totalMatches.toString(),
      subLabel: `${distinctGames} kulonbozo jatek`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nem sikerült betölteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
