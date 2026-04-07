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

    const rows = players
      .map((row) => {
        let wins = 0;
        let losses = 0;
        let totalRounds = 0;

        for (const placement of filteredPlacements) {
          if (placement.user_id !== row.id) continue;
          totalRounds += 1;
          if (placement.place === 1) {
            wins += 1;
            continue;
          }
          const meta = snapshotMeta.get(placement.snapshot_id);
          if (
            meta &&
            meta.playerCount > 1 &&
            meta.worstPlace > 1 &&
            placement.place === meta.worstPlace
          ) {
            losses += 1;
          }
        }

        const winRate = totalRounds > 0 ? Math.round((wins / totalRounds) * 100) : 0;
        return {
          id: row.id,
          username: row.username,
          wins,
          losses,
          total_rounds: totalRounds,
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
