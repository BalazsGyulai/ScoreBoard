import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { errorResponse, serverFetch } from "@/lib/api/server";

interface ApiPlayerStat {
  id: string;
  username: string;
  wins: number;
  losses: number;
  total_rounds: number;
}

export async function GET() {
  try {
    const currentUserId = await getCurrentUserId();

    const stats = await serverFetch<ApiPlayerStat[]>("/stats");
    const current = stats.find((row) => row.id === currentUserId) ?? null;
    const wins = current?.wins ?? 0;
    const totalRounds = current?.total_rounds ?? 0;
    const winRate = totalRounds > 0 ? Math.round((wins / totalRounds) * 100) : 0;

    return NextResponse.json({
      value: `${winRate}%`,
      subLabel:
        totalRounds > 0
          ? `${wins} gyozelem / ${totalRounds} meccs`
          : "Még nincs rögzített kör",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
