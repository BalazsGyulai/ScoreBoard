// Per-player records and the leaderboard.
//
// Ranking and sample size: a raw win % ranks someone with 1 win out of 2 above a
// regular with 14 out of 30. Two safeguards:
//  1. Only players with at least `minMatches` matches in the period are ranked;
//     the others are listed separately ("kevés meccs") with their numbers.
//  2. The ranked order uses an adjusted win rate that starts every player at their
//     *expected* rate (1 / players in each match they played — a 4-player match
//     is harder to win than a 2-player one) and moves towards the real rate as
//     matches accumulate: (wins + K·expected) / (matches + K), K = PRIOR_MATCHES.
// The displayed percentage is always the plain wins / matches.

import { outcome, type Match, type Outcome, type PlayerRef } from "./matches";

export const MIN_MATCHES_TO_RANK = 5;
export const PRIOR_MATCHES = 4;

export interface PlayerStats {
  id: string;
  username: string;
  matches: number;
  wins: number;
  losses: number;
  /** plain win % (0–100, rounded) */
  winRate: number;
  /** sum of 1 / players over the player's matches */
  expectedWins: number;
  /** win rate shrunk towards the expected rate (0–1), used for ordering */
  adjustedRate: number;
  currentWinStreak: number;
  bestWinStreak: number;
  /** last 5 results, oldest first */
  form: Outcome[];
  /** last 7 places, oldest first */
  trend: number[];
  lastPlayedAt: string | null;
}

export interface Leaderboard {
  ranked: PlayerStats[];
  /** played, but fewer than minMatches — not ranked */
  unranked: PlayerStats[];
  minMatches: number;
}

export function computePlayerStats(matches: readonly Match[], player: PlayerRef): PlayerStats {
  let wins = 0;
  let losses = 0;
  let expectedWins = 0;
  let streak = 0;
  let bestStreak = 0;
  const outcomes: Outcome[] = [];
  const places: number[] = [];
  let lastPlayedAt: string | null = null;

  for (const match of matches) {
    const result = match.results.find((r) => r.user_id === player.id);
    if (!result) continue;
    const o = outcome(match, result);
    outcomes.push(o);
    places.push(result.place);
    expectedWins += 1 / match.playerCount;
    lastPlayedAt = match.playedAt;
    if (o === "W") {
      wins += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
      if (o === "L") losses += 1;
    }
  }

  const n = outcomes.length;
  const expectedRate = n > 0 ? expectedWins / n : 0;
  return {
    id: player.id,
    username: player.username,
    matches: n,
    wins,
    losses,
    winRate: n > 0 ? Math.round((wins / n) * 100) : 0,
    expectedWins,
    adjustedRate: n > 0 ? (wins + PRIOR_MATCHES * expectedRate) / (n + PRIOR_MATCHES) : 0,
    currentWinStreak: streak,
    bestWinStreak: bestStreak,
    form: outcomes.slice(-5),
    trend: places.slice(-7),
    lastPlayedAt,
  };
}

/** Minimum matches to be ranked: 5, or fewer while nobody has played that many yet. */
export function rankingThreshold(stats: readonly PlayerStats[]): number {
  const most = stats.reduce((max, s) => Math.max(max, s.matches), 0);
  return Math.max(1, Math.min(MIN_MATCHES_TO_RANK, most));
}

const byName = (a: PlayerStats, b: PlayerStats) => a.username.localeCompare(b.username, "hu");

export function buildLeaderboard(matches: readonly Match[], players: readonly PlayerRef[]): Leaderboard {
  const stats = players.map((p) => computePlayerStats(matches, p)).filter((s) => s.matches > 0);
  const minMatches = rankingThreshold(stats);

  const ranked = stats
    .filter((s) => s.matches >= minMatches)
    .sort(
      (a, b) =>
        b.adjustedRate - a.adjustedRate || b.winRate - a.winRate || b.matches - a.matches || byName(a, b),
    );
  const unranked = stats.filter((s) => s.matches < minMatches).sort((a, b) => b.matches - a.matches || byName(a, b));
  return { ranked, unranked, minMatches };
}

/** Players with the most matches (all of them on a tie). */
export function mostActive(stats: readonly PlayerStats[]): PlayerStats[] {
  const most = stats.reduce((max, s) => Math.max(max, s.matches), 0);
  return most > 0 ? stats.filter((s) => s.matches === most).sort(byName) : [];
}
