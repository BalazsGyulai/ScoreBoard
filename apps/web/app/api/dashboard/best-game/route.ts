import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/api/server";
import type { ApiGame } from "@/types/api";

export async function GET() {
  try {
    const games = await serverFetch<ApiGame[]>("/games");
    if (games.length === 0) {
      return NextResponse.json({
        value: "Nincs adat",
        subLabel: "Meg nincs elinditott jatek",
      });
    }

    const topGame = games.reduce((best, current) =>
      current.current_round > best.current_round ? current : best,
    );

    return NextResponse.json({
      value: `${topGame.name} ${topGame.icon}`,
      subLabel: `${topGame.current_round} kor lett rogzitve`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nem sikerült betölteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
