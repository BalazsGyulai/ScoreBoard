// Finished matches, grouped from the API's /stats/history rows.
// A "match" is one closed game session (one results snapshot). Its places were
// fixed by the API when the game was closed (apps/api/src/scoring.rs).

import { localYear } from "./time";

export type WinnerRule = "min" | "max";

/** One row of GET /stats/history (one player in one finished match). */
export interface Placement {
  snapshot_id: string;
  game_id: string;
  user_id: string;
  place: number;
  total_score: number;
  rounds_played: number;
  best_round: number | null;
  winner_rule: WinnerRule;
  played_at: string;
}

export interface Match {
  id: string;
  gameId: string;
  playedAt: string;
  winnerRule: WinnerRule;
  results: Placement[];
  playerCount: number;
  worstPlace: number;
  /** rounds of the match (most rounds any player has); 0 if no round data was kept */
  roundCount: number;
}

export interface PlayerRef {
  id: string;
  username: string;
}

export interface GameRef {
  id: string;
  name: string;
  icon: string;
  winner_rule: WinnerRule;
}

export type Outcome = "W" | "L" | "D";

/** Group rows into matches (oldest first), optionally only one Budapest calendar year. */
export function groupMatches(rows: readonly Placement[], year: number | null = null): Match[] {
  const byId = new Map<string, Placement[]>();
  for (const row of rows) {
    const list = byId.get(row.snapshot_id) ?? [];
    list.push(row);
    byId.set(row.snapshot_id, list);
  }

  const matches: Match[] = [];
  for (const [id, results] of byId) {
    const playedAt = results.reduce((min, r) => (r.played_at < min ? r.played_at : min), results[0].played_at);
    if (year !== null && localYear(playedAt) !== year) continue;
    results.sort((a, b) => a.place - b.place || (a.user_id < b.user_id ? -1 : 1));
    matches.push({
      id,
      gameId: results[0].game_id,
      playedAt,
      winnerRule: results[0].winner_rule,
      results,
      playerCount: results.length,
      worstPlace: Math.max(...results.map((r) => r.place)),
      roundCount: Math.max(0, ...results.map((r) => r.rounds_played)),
    });
  }
  return matches.sort((a, b) => (a.playedAt < b.playedAt ? -1 : a.playedAt > b.playedAt ? 1 : a.id < b.id ? -1 : 1));
}

/** Years with at least one match, newest first. */
export function availableYears(rows: readonly Placement[]): number[] {
  return [...new Set(rows.map((r) => localYear(r.played_at)))].sort((a, b) => b - a);
}

/**
 * W = shared or sole first place. L = last place, when the match had more than one
 * place (if everyone ties, everyone wins and nobody loses). D = anything in between.
 */
export function outcome(match: Match, result: Placement): Outcome {
  if (result.place === 1) return "W";
  if (match.worstPlace > 1 && result.place === match.worstPlace) return "L";
  return "D";
}

export function resultOf(match: Match, userId: string): Placement | undefined {
  return match.results.find((r) => r.user_id === userId);
}

/** Did this player play every round of the match? (Totals of incomplete players are not records.) */
export function playedFullMatch(match: Match, result: Placement): boolean {
  return match.roundCount === 0 || result.rounds_played === match.roundCount;
}
