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

function parseYear(value: string | null) {
  if (!value || value === "overall") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function bestWinningStreak(places: number[]) {
  let best = 0;
  let streak = 0;
  for (const place of places) {
    if (place === 1) {
      streak += 1;
      best = Math.max(best, streak);
    } else {
      streak = 0;
    }
  }
  return best;
}

export async function GET(request: Request) {
  try {
    const year = parseYear(new URL(request.url).searchParams.get("year"));
    const [players, placements] = await Promise.all([
      serverFetch<ApiPlayerStat[]>("/stats"),
      serverFetch<ApiPlacement[]>("/stats/history"),
    ]);

    const filteredPlacements =
      year === null
        ? placements
        : placements.filter((row) => new Date(row.closed_at).getFullYear() === year);

    const snapshotMeta = new Map<string, { playerCount: number; worstPlace: number }>();
    for (const row of filteredPlacements) {
      const current = snapshotMeta.get(row.snapshot_id) ?? { playerCount: 0, worstPlace: 0 };
      current.playerCount += 1;
      current.worstPlace = Math.max(current.worstPlace, row.place);
      snapshotMeta.set(row.snapshot_id, current);
    }

    const placesByUser = new Map<string, number[]>();
    for (const row of filteredPlacements) {
      const list = placesByUser.get(row.user_id) ?? [];
      list.push(row.place);
      placesByUser.set(row.user_id, list);
    }

    const rows = players
      .map((row) => {
        const placeHistory = placesByUser.get(row.id) ?? [];
        const totalRounds = placeHistory.length;
        const wins = placeHistory.filter((place) => place === 1).length;
        const losses = filteredPlacements.reduce((acc, placement) => {
          if (placement.user_id !== row.id) return acc;
          const meta = snapshotMeta.get(placement.snapshot_id);
          if (
            meta &&
            meta.playerCount > 1 &&
            meta.worstPlace > 1 &&
            placement.place === meta.worstPlace
          ) {
            return acc + 1;
          }
          return acc;
        }, 0);
        const winRate = totalRounds > 0 ? Math.round((wins / totalRounds) * 100) : 0;
        const trend = placeHistory.slice(-7);
        return {
          id: row.id,
          username: row.username,
          wins,
          losses,
          total_rounds: totalRounds,
          win_rate: winRate,
          streak: bestWinningStreak(placeHistory),
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
