import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/api/server";

interface ApiPlayerStat {
  id: string;
  username: string;
  wins: number;
  losses: number;
  total_rounds: number;
}

export async function GET() {
  try {
    const stats = await serverFetch<ApiPlayerStat[]>("/stats");
    const rows = stats
      .map((row) => {
        const winRate =
          row.total_rounds > 0
            ? Math.round((row.wins / row.total_rounds) * 100)
            : 0;
        return {
          id: row.id,
          username: row.username,
          wins: row.wins,
          losses: row.losses,
          total_rounds: row.total_rounds,
          win_rate: winRate,
        };
      })
      .sort((a, b) => {
        if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.losses - b.losses;
      });

    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nem sikerült betölteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
