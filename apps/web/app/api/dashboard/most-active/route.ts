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
    if (stats.length === 0) {
      return NextResponse.json({
        value: "Nincs adat",
        subLabel: "Meg nincs aktivitas",
      });
    }

    const mostActive = stats.reduce((best, current) =>
      current.total_rounds > best.total_rounds ? current : best,
    );

    return NextResponse.json({
      value: mostActive.username,
      subLabel: `${mostActive.total_rounds} korban szerepelt`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nem sikerült betölteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
