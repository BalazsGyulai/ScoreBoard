import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/api/server";
import type { ApiGame } from "@/types/api";

export async function GET() {
  try {
    const games = await serverFetch<ApiGame[]>("/games");
    const distinctGames = new Set(games.map((g) => g.name.trim().toLowerCase())).size;

    return NextResponse.json({
      value: games.length.toString(),
      subLabel: `${distinctGames} kulonbozo jatek`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nem sikerült betölteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
