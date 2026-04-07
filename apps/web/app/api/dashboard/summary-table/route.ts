import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/api/server";

interface ApiPlayerStat {
  id: string;
  username: string;
  wins: number;
  losses: number;
  total_rounds: number;
}

interface ApiPlacement {
  snapshot_id: string;
  user_id: string;
  place: number;
  closed_at: string;
}

function currentWinningStreak(places: number[]) {
  let streak = 0;
  for (let i = places.length - 1; i >= 0; i -= 1) {
    if (places[i] !== 1) break;
    streak += 1;
  }
  return streak;
}

export async function GET() {
  try {
    const [stats, placements] = await Promise.all([
      serverFetch<ApiPlayerStat[]>("/stats"),
      serverFetch<ApiPlacement[]>("/stats/history"),
    ]);

    const placesByUser = new Map<string, number[]>();
    for (const row of placements) {
      const list = placesByUser.get(row.user_id) ?? [];
      list.push(row.place);
      placesByUser.set(row.user_id, list);
    }

    const rows = stats
      .map((row) => {
        const winRate =
          row.total_rounds > 0
            ? Math.round((row.wins / row.total_rounds) * 100)
            : 0;
        const placeHistory = placesByUser.get(row.id) ?? [];
        const trend = placeHistory.slice(-7);
        return {
          id: row.id,
          username: row.username,
          wins: row.wins,
          losses: row.losses,
          total_rounds: row.total_rounds,
          win_rate: winRate,
          streak: currentWinningStreak(placeHistory),
          trend,
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
