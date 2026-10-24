import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { errorResponse, serverFetch } from "@/lib/api/server";
import type { ApiGame, ApiPlayer } from "@/types/api";

interface ApiPlacement {
  snapshot_id: string;
  closed_at: string;
}

function formatLastPlayed(date: Date | null) {
  if (!date) return "nincs adat";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "ma";
  if (diffDays === 1) return "tegnap";
  return `${diffDays} napja`;
}

export async function GET() {
  try {
    const currentUserId = await getCurrentUserId();

    const [games, players, placements] = await Promise.all([
      serverFetch<ApiGame[]>("/games"),
      serverFetch<ApiPlayer[]>("/players"),
      serverFetch<ApiPlacement[]>("/stats/history"),
    ]);

    const finishedGames = games.filter((game) => game.status === "closed");
    const latestPlayed =
      finishedGames
        .map((game) => (game.closed_at ? new Date(game.closed_at) : null))
        .filter((d): d is Date => d !== null)
        .reduce<Date | null>((best, current) => {
          if (!best) return current;
          return current.getTime() > best.getTime() ? current : best;
        }, null) ?? null;
    const currentUser =
      players.find((player) => player.id === currentUserId)?.username ??
      "Jatekos";

    const totalMatches = new Set(placements.map((p) => p.snapshot_id)).size;

    return NextResponse.json({
      username: currentUser,
      games: totalMatches,
      players: players.length,
      lastPlayed: formatLastPlayed(latestPlayed),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
