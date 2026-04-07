import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/api/server";

interface ApiPlacement {
  closed_at: string;
}

export async function GET() {
  try {
    const placements = await serverFetch<ApiPlacement[]>("/stats/history");
    const years = Array.from(
      new Set(placements.map((row) => new Date(row.closed_at).getFullYear())),
    )
      .filter((year) => Number.isFinite(year))
      .sort((a, b) => b - a);

    return NextResponse.json(years);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nem sikerült betölteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
