// Per-game records: most played, champions, best match totals and best rounds —
// for the whole group and per player (personal bests).
//
// "Best" follows the game's rule: lowest for "min" games, highest for "max".
// Match totals only count for players who played every round of that match; a
// partial total (e.g. a late joiner in a min game) is not a record.

import { outcome, playedFullMatch, type GameRef, type Match, type PlayerRef, type WinnerRule } from "./matches";

export interface Record {
  value: number;
  /** everyone who holds the record (ties) */
  holders: string[];
  playedAt: string;
}

export interface GameStats {
  gameId: string;
  name: string;
  icon: string;
  winnerRule: WinnerRule;
  matches: number;
  lastPlayedAt: string;
  avgPlayers: number;
  /** most wins in this game (ties: all of them) */
  champions: { names: string[]; wins: number } | null;
  bestTotal: Record | null;
  bestRound: Record | null;
}

export interface PersonalBest {
  gameId: string;
  name: string;
  icon: string;
  winnerRule: WinnerRule;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  bestTotal: number | null;
  bestRound: number | null;
}

const better = (rule: WinnerRule, a: number, b: number) => (rule === "min" ? a < b : a > b);

function track(record: Record | null, rule: WinnerRule, value: number, holder: string, playedAt: string): Record {
  if (!record || better(rule, value, record.value)) return { value, holders: [holder], playedAt };
  if (value === record.value && !record.holders.includes(holder)) record.holders.push(holder);
  return record;
}

export function gameStats(matches: readonly Match[], games: readonly GameRef[], players: readonly PlayerRef[]): GameStats[] {
  const names = new Map(players.map((p) => [p.id, p.username]));
  const name = (id: string) => names.get(id) ?? "Ismeretlen";
  const out: GameStats[] = [];

  for (const game of games) {
    const played = matches.filter((m) => m.gameId === game.id);
    if (played.length === 0) continue;
    const rule = played[0].winnerRule;
    const wins = new Map<string, number>();
    let bestTotal: Record | null = null;
    let bestRound: Record | null = null;

    for (const m of played) {
      for (const r of m.results) {
        if (r.place === 1) wins.set(r.user_id, (wins.get(r.user_id) ?? 0) + 1);
        if (playedFullMatch(m, r)) bestTotal = track(bestTotal, rule, r.total_score, name(r.user_id), m.playedAt);
        if (r.best_round !== null) bestRound = track(bestRound, rule, r.best_round, name(r.user_id), m.playedAt);
      }
    }

    const topWins = Math.max(0, ...wins.values());
    out.push({
      gameId: game.id,
      name: game.name,
      icon: game.icon,
      winnerRule: rule,
      matches: played.length,
      lastPlayedAt: played[played.length - 1].playedAt,
      avgPlayers: Math.round((played.reduce((s, m) => s + m.playerCount, 0) / played.length) * 10) / 10,
      champions:
        topWins > 0
          ? {
              wins: topWins,
              names: [...wins.entries()]
                .filter(([, w]) => w === topWins)
                .map(([id]) => name(id))
                .sort((a, b) => a.localeCompare(b, "hu")),
            }
          : null,
      bestTotal,
      bestRound,
    });
  }
  return out.sort((a, b) => b.matches - a.matches || (a.lastPlayedAt < b.lastPlayedAt ? 1 : -1));
}

export function personalBests(matches: readonly Match[], games: readonly GameRef[], userId: string): PersonalBest[] {
  const out: PersonalBest[] = [];
  for (const game of games) {
    let n = 0;
    let wins = 0;
    let losses = 0;
    let bestTotal: number | null = null;
    let bestRound: number | null = null;
    const rule = game.winner_rule;
    for (const m of matches) {
      if (m.gameId !== game.id) continue;
      const r = m.results.find((x) => x.user_id === userId);
      if (!r) continue;
      n += 1;
      const o = outcome(m, r);
      if (o === "W") wins += 1;
      if (o === "L") losses += 1;
      if (playedFullMatch(m, r) && (bestTotal === null || better(rule, r.total_score, bestTotal))) bestTotal = r.total_score;
      if (r.best_round !== null && (bestRound === null || better(rule, r.best_round, bestRound))) bestRound = r.best_round;
    }
    if (n === 0) continue;
    out.push({
      gameId: game.id,
      name: game.name,
      icon: game.icon,
      winnerRule: rule,
      matches: n,
      wins,
      losses,
      winRate: Math.round((wins / n) * 100),
      bestTotal,
      bestRound,
    });
  }
  return out.sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.name.localeCompare(b.name, "hu"));
}

/**
 * A player's best game: highest win rate among games played at least `minMatches`
 * times (ties: more matches). Falls back to the most played game.
 */
export function bestGame(bests: readonly PersonalBest[], minMatches = 3): { game: PersonalBest; qualified: boolean } | null {
  if (bests.length === 0) return null;
  const qualified = bests
    .filter((b) => b.matches >= minMatches)
    .sort((a, b) => b.wins / b.matches - a.wins / a.matches || b.matches - a.matches);
  if (qualified.length > 0) return { game: qualified[0], qualified: true };
  return { game: [...bests].sort((a, b) => b.matches - a.matches)[0], qualified: false };
}
