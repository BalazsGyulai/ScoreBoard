import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverFetch } from "@/lib/api/server";
import type { ApiGame, ApiPlayer } from "@/types/api";

interface ApiPlayerStat {
  id: string;
  username: string;
  wins: number;
  losses: number;
  total_rounds: number;
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

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadBase64.padEnd(
      payloadBase64.length + ((4 - (payloadBase64.length % 4)) % 4),
      "=",
    );
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const jar = await cookies();
    const token = jar.get("hg_access_token")?.value;
    const claims = token ? decodeJwtPayload(token) : null;
    const currentUserId =
      claims && typeof claims.sub === "string" ? claims.sub : null;

    const [games, players, stats] = await Promise.all([
      serverFetch<ApiGame[]>("/games"),
      serverFetch<ApiPlayer[]>("/players"),
      serverFetch<ApiPlayerStat[]>("/stats"),
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

    const totalMatches = stats.reduce(
      (maxRounds, row) => Math.max(maxRounds, row.total_rounds),
      0,
    );

    return NextResponse.json({
      username: currentUser,
      games: totalMatches,
      players: players.length,
      lastPlayed: formatLastPlayed(latestPlayed),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nem sikerult betolteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
