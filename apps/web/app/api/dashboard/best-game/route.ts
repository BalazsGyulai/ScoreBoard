import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/api/server";
import type { ApiGame } from "@/types/api";

export async function GET() {
  try {
    const games = await serverFetch<ApiGame[]>("/games");
    const finishedGames = games.filter((game) => game.status === "closed");
    if (finishedGames.length === 0) {
      return NextResponse.json({
        value: "Nincs adat",
        subLabel: "Meg nincs lezart meccs",
      });
    }

    const topGame = finishedGames.reduce((best, current) =>
      current.current_round > best.current_round ? current : best,
    );
    const rounds = Math.max(0, topGame.current_round - 1);

    return NextResponse.json({
      value: `${topGame.name} ${topGame.icon}`,
      subLabel: `${rounds} kor lett rogzitve`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nem sikerült betölteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
