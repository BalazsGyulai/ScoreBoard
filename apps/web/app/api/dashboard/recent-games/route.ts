import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/api/server";
import type { ApiGame, ApiScoreRow } from "@/types/api";

type WinnerRule = "min" | "max";

function pickWinner(
  scores: ApiScoreRow[],
  winnerRule: WinnerRule,
): { username: string; total: number } | null {
  if (!scores.length) return null;
  const totals = new Map<string, { username: string; total: number }>();
  for (const row of scores) {
    const current = totals.get(row.user_id);
    if (!current) {
      totals.set(row.user_id, { username: row.username, total: row.value });
      continue;
    }
    current.total += row.value;
  }
  const all = [...totals.values()];
  if (!all.length) return null;
  return all.reduce((best, current) => {
    if (winnerRule === "min") return current.total < best.total ? current : best;
    return current.total > best.total ? current : best;
  });
}

export async function GET() {
  try {
    const games = await serverFetch<ApiGame[]>("/games");
    const latest = [...games]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, 5);

    const items = await Promise.all(
      latest.map(async (game) => {
        const scores = await serverFetch<ApiScoreRow[]>(`/games/${game.id}/scores`);
        const winner = pickWinner(scores, game.winner_rule);
        return {
          id: game.id,
          slug: game.name.trim().toLowerCase(),
          name: game.name,
          icon: game.icon,
          info: `${game.current_round - 1} kor · ${game.status === "closed" ? "Lezarva" : "Folyamatban"}`,
          winner: winner ? winner.username : "Nincs adat",
        };
      }),
    );

    return NextResponse.json(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nem sikerült betölteni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
