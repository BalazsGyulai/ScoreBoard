// Standings of one game session — the TypeScript twin of apps/api/src/scoring.rs.
// Both are tested against packages/scoring/standings-cases.json, so the live game
// screen, the live viewer and the official result on close always agree.
//
// Rules:
// 1. Participants are the players with at least one score (never scored = not ranked).
// 2. More rounds played ranks first; with equal rounds the total decides (lowest wins
//    for "min", highest for "max"). A missing round never counts as 0 points.
// 3. Equal rounds and equal total share the place (1, 1, 3). Everyone on place 1 wins.
// 4. The last place loses — only if there is more than one place.

export type WinnerRule = "min" | "max";

export interface ScoreEntry {
  user_id: string;
  round: number;
  value: number;
}

export interface Standing {
  userId: string;
  total: number;
  roundsPlayed: number;
  place: number;
}

export interface Standings {
  /** ordered by place, then user id */
  rows: Standing[];
  byPlayer: Map<string, Standing>;
  /** number of distinct rounds that have at least one score */
  roundCount: number;
  winners: string[];
  losers: string[];
}

function compareKey(a: Standing, b: Standing, rule: WinnerRule): number {
  if (a.roundsPlayed !== b.roundsPlayed) return b.roundsPlayed - a.roundsPlayed;
  return rule === "min" ? a.total - b.total : b.total - a.total;
}

export function computeStandings(scores: readonly ScoreEntry[], rule: WinnerRule): Standings {
  const totals = new Map<string, { total: number; rounds: number }>();
  const rounds = new Set<number>();
  for (const s of scores) {
    rounds.add(s.round);
    const t = totals.get(s.user_id) ?? { total: 0, rounds: 0 };
    t.total += s.value;
    t.rounds += 1;
    totals.set(s.user_id, t);
  }

  const rows: Standing[] = [...totals.entries()].map(([userId, t]) => ({
    userId,
    total: t.total,
    roundsPlayed: t.rounds,
    place: 0,
  }));
  rows.sort((a, b) => compareKey(a, b, rule) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  rows.forEach((row, i) => {
    row.place = i > 0 && compareKey(row, rows[i - 1], rule) === 0 ? rows[i - 1].place : i + 1;
  });

  const worst = rows.reduce((max, r) => Math.max(max, r.place), 1);
  return {
    rows,
    byPlayer: new Map(rows.map((r) => [r.userId, r])),
    roundCount: rounds.size,
    winners: rows.filter((r) => r.place === 1).map((r) => r.userId),
    losers: worst > 1 ? rows.filter((r) => r.place === worst).map((r) => r.userId) : [],
  };
}

/** "Anna" / "Anna és Béla" / "Anna, Béla és Cili" — alphabetical, so ties read the same everywhere. */
export function joinNames(names: readonly string[]): string {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "hu"));
  if (sorted.length <= 1) return sorted[0] ?? "";
  return `${sorted.slice(0, -1).join(", ")} és ${sorted[sorted.length - 1]}`;
}

export interface LeaderboardRow extends Standing {
  /** rounds fewer than the leader (0 = same number of rounds) */
  roundsBehind: number;
  /** points behind the leader; null when the rounds differ (totals are not comparable) */
  pointsBehind: number | null;
}

/**
 * The running leaderboard of a session: standings plus the gap to the leader.
 * "Behind" always means worse: for a min game the leader has the lowest total,
 * so a player behind has more points; for a max game, fewer.
 */
export function leaderboardRows(standings: Standings, rule: WinnerRule): LeaderboardRow[] {
  const leader = standings.rows[0];
  if (!leader) return [];
  return standings.rows.map((row) => {
    const roundsBehind = leader.roundsPlayed - row.roundsPlayed;
    return {
      ...row,
      roundsBehind,
      pointsBehind: roundsBehind === 0 ? (rule === "min" ? row.total - leader.total : leader.total - row.total) : null,
    };
  });
}

/** "Vezet" / "Holtverseny az élen" / "4 ponttal lemaradva" / "1 körrel kevesebb" */
export function gapLabel(row: LeaderboardRow, tiedLeaders: number): string {
  if (row.place === 1) return tiedLeaders > 1 ? "Holtverseny az élen" : "Vezet";
  if (row.roundsBehind > 0) return `${row.roundsBehind} körrel kevesebb`;
  return `${row.pointsBehind} ponttal lemaradva`;
}
