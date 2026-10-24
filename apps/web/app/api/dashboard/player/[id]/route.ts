import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/server";
import { buildPlayer, parseYear } from "@/lib/stats/server";

// GET /api/dashboard/player/:id?year=2025|overall — one player's profile.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const year = parseYear(new URL(request.url).searchParams.get("year"));
    const view = await buildPlayer(id, year);
    if (!view) return NextResponse.json({ error: "Nincs ilyen játékos" }, { status: 404 });
    return NextResponse.json(view);
  } catch (error) {
    return errorResponse(error);
  }
}
