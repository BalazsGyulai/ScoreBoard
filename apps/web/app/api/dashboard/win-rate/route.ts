import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverFetch } from "@/lib/api/server";

interface ApiPlayerStat {
  id: string;
  username: string;
  wins: number;
  losses: number;
  total_rounds: number;
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
    const message = error instanceof Error ? error.message : "Nem sikerült betölteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
