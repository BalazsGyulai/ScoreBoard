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
    const totalWins = stats.reduce((sum, row) => sum + row.wins, 0);
    const totalRounds = stats.reduce((sum, row) => sum + row.total_rounds, 0);
    const winRate = totalRounds > 0 ? Math.round((totalWins / totalRounds) * 100) : 0;

    return NextResponse.json({
      value: `${winRate}%`,
      subLabel:
        totalRounds > 0
          ? `${totalWins} nyertes kör / ${totalRounds} összes kör`
          : "Még nincs rögzített kör",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nem sikerült betölteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
