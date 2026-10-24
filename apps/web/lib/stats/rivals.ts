// Head-to-head: in every match two players both finished, the better place wins
// the duel; the same place is a draw.

import type { Match, PlayerRef } from "./matches";

export interface Duel {
  opponentId: string;
  opponent: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** (wins + draws / 2) / played, 0–100 rounded */
  score: number;
}

export interface Rivalry {
  a: PlayerRef;
  b: PlayerRef;
  played: number;
  aWins: number;
  bWins: number;
  draws: number;
}

function duelScore(wins: number, draws: number, played: number) {
  return played > 0 ? Math.round(((wins + draws / 2) / played) * 100) : 0;
}

/** One player's record against every opponent, most played first. */
export function headToHead(matches: readonly Match[], playerId: string, players: readonly PlayerRef[]): Duel[] {
  const names = new Map(players.map((p) => [p.id, p.username]));
  const duels = new Map<string, Duel>();

  for (const match of matches) {
    const me = match.results.find((r) => r.user_id === playerId);
    if (!me) continue;
    for (const other of match.results) {
      if (other.user_id === playerId) continue;
      const d = duels.get(other.user_id) ?? {
        opponentId: other.user_id,
        opponent: names.get(other.user_id) ?? "Ismeretlen",
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        score: 0,
      };
      d.played += 1;
      if (me.place < other.place) d.wins += 1;
      else if (me.place === other.place) d.draws += 1;
      else d.losses += 1;
      duels.set(other.user_id, d);
    }
  }

  return [...duels.values()]
    .map((d) => ({ ...d, score: duelScore(d.wins, d.draws, d.played) }))
    .sort((x, y) => y.played - x.played || y.score - x.score || x.opponent.localeCompare(y.opponent, "hu"));
}

/** Every pair that met at least `minPlayed` times; most played, then closest, first. */
export function rivalries(matches: readonly Match[], players: readonly PlayerRef[], minPlayed = 1): Rivalry[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const pairs = new Map<string, Rivalry>();

  for (const match of matches) {
    const results = match.results.filter((r) => byId.has(r.user_id));
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const [x, y] = results[i].user_id < results[j].user_id ? [results[i], results[j]] : [results[j], results[i]];
        const key = `${x.user_id}|${y.user_id}`;
        const r = pairs.get(key) ?? { a: byId.get(x.user_id)!, b: byId.get(y.user_id)!, played: 0, aWins: 0, bWins: 0, draws: 0 };
        r.played += 1;
        if (x.place < y.place) r.aWins += 1;
        else if (x.place > y.place) r.bWins += 1;
        else r.draws += 1;
        pairs.set(key, r);
      }
    }
  }

  return [...pairs.values()]
    .filter((r) => r.played >= minPlayed)
    .sort(
      (x, y) =>
        y.played - x.played ||
        Math.abs(x.aWins - x.bWins) - Math.abs(y.aWins - y.bWins) ||
        x.a.username.localeCompare(y.a.username, "hu"),
    );
}
