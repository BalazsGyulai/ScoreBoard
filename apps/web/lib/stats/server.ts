// Builds the stats views from the API's raw data. Server-only (route handlers).

import { serverFetch } from "@/lib/api/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { computeStandings } from "@/lib/scoring/standings";
import type { ApiGame, ApiPlayer, ApiScoreRow } from "@/types/api";
import { bestGame, gameStats, personalBests } from "./games";
import { availableYears, groupMatches, type Match, type Placement, type PlayerRef } from "./matches";
import { buildLeaderboard, mostActive, type PlayerStats } from "./players";
import { headToHead, rivalries } from "./rivals";
import { daysAgoLabel, formatLocalDate, localMonthKey, monthWindow } from "./time";
import type { LeaderboardView, OverviewView, PlayerView, RankedPlayer, RecentItem, StatsView } from "./views";

export async function loadStatsData() {
  const [players, games, history] = await Promise.all([
    serverFetch<ApiPlayer[]>("/players"),
    serverFetch<ApiGame[]>("/games"),
    serverFetch<Placement[]>("/stats/history"),
  ]);
  return { players, games, history };
}

/** "overall" / missing → null (all time); a year → that Budapest calendar year */
export function parseYear(value: string | null): number | null {
  if (!value || value === "overall") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const toRef = (p: ApiPlayer): PlayerRef => ({ id: p.id, username: p.username });

function view(s: PlayerStats, rank: number | null): RankedPlayer {
  return {
    id: s.id,
    username: s.username,
    matches: s.matches,
    wins: s.wins,
    losses: s.losses,
    winRate: s.winRate,
    rank,
    currentWinStreak: s.currentWinStreak,
    bestWinStreak: s.bestWinStreak,
    form: s.form,
    trend: s.trend,
    lastPlayedAt: s.lastPlayedAt,
  };
}

function leaderboardView(board: ReturnType<typeof buildLeaderboard>): LeaderboardView {
  return {
    ranked: board.ranked.map((s, i) => view(s, i + 1)),
    unranked: board.unranked.map((s) => view(s, null)),
    minMatches: board.minMatches,
  };
}

const slug = (name: string) => name.trim().toLowerCase();

async function recentActivity(games: ApiGame[], matches: Match[], names: Map<string, string>): Promise<RecentItem[]> {
  const byId = new Map(games.map((g) => [g.id, g]));
  const name = (id: string) => names.get(id) ?? "Ismeretlen";

  // Games in progress first, with their current leaders (same rule as the game screen).
  const open = games.filter((g) => g.status === "open" && g.current_round > 1);
  const live = await Promise.all(
    open.map(async (g): Promise<RecentItem> => {
      const scores = await serverFetch<ApiScoreRow[]>(`/games/${g.id}/scores`);
      const standings = computeStandings(scores, g.winner_rule);
      return {
        key: `open-${g.id}`,
        slug: slug(g.name),
        name: g.name,
        icon: g.icon,
        status: "open",
        info: `${standings.roundCount} kör · Folyamatban`,
        names: standings.winners.map(name),
        playedAt: null,
      };
    }),
  );

  const finished = [...matches]
    .reverse()
    .filter((m) => byId.has(m.gameId))
    .map((m): RecentItem => {
      const g = byId.get(m.gameId)!;
      return {
        key: m.id,
        slug: slug(g.name),
        name: g.name,
        icon: g.icon,
        status: "closed",
        info: [m.roundCount > 0 ? `${m.roundCount} kör` : null, formatLocalDate(m.playedAt)].filter(Boolean).join(" · "),
        names: m.results.filter((r) => r.place === 1).map((r) => name(r.user_id)),
        playedAt: m.playedAt,
      };
    });

  return [...live, ...finished].slice(0, 5);
}

function bestGameView(matches: Match[], games: ApiGame[], userId: string | null) {
  if (!userId) return null;
  const best = bestGame(personalBests(matches, games, userId));
  return best
    ? { name: best.game.name, icon: best.game.icon, wins: best.game.wins, matches: best.game.matches, qualified: best.qualified }
    : null;
}

export async function buildOverview(): Promise<OverviewView> {
  const [{ players, games, history }, userId] = await Promise.all([loadStatsData(), getCurrentUserId()]);
  const refs = players.map(toRef);
  const names = new Map(refs.map((p) => [p.id, p.username]));
  const matches = groupMatches(history);
  const board = buildLeaderboard(matches, refs);
  const leaderboard = leaderboardView(board);
  const me = [...leaderboard.ranked, ...leaderboard.unranked].find((p) => p.id === userId);
  const active = mostActive([...board.ranked, ...board.unranked]);

  return {
    username: (userId && names.get(userId)) || "Játékos",
    totalMatches: matches.length,
    playedGames: new Set(matches.map((m) => m.gameId)).size,
    playerCount: players.length,
    lastPlayed: daysAgoLabel(matches.at(-1)?.playedAt ?? null),
    me: { matches: me?.matches ?? 0, wins: me?.wins ?? 0, winRate: me?.winRate ?? 0 },
    bestGame: bestGameView(matches, games, userId),
    mostActive: active.length > 0 ? { names: active.map((s) => s.username), matches: active[0].matches } : null,
    leaderboard,
    recent: await recentActivity(games, matches, names),
  };
}

export async function buildStats(year: number | null): Promise<StatsView> {
  const { players, games, history } = await loadStatsData();
  const refs = players.map(toRef);
  const matches = groupMatches(history, year);
  return {
    years: availableYears(history),
    year,
    totalMatches: matches.length,
    leaderboard: leaderboardView(buildLeaderboard(matches, refs)),
    games: gameStats(matches, games, refs),
    rivalries: rivalries(matches, refs, 2).slice(0, 12),
  };
}

export async function buildPlayer(playerId: string, year: number | null): Promise<PlayerView | null> {
  const { players, games, history } = await loadStatsData();
  const refs = players.map(toRef).sort((a, b) => a.username.localeCompare(b.username, "hu"));
  const index = refs.findIndex((p) => p.id === playerId);
  if (index < 0) return null;
  const player = refs[index];

  const matches = groupMatches(history, year);
  const board = leaderboardView(buildLeaderboard(matches, refs));
  const stats =
    [...board.ranked, ...board.unranked].find((p) => p.id === playerId) ??
    view(
      { id: player.id, username: player.username, matches: 0, wins: 0, losses: 0, winRate: 0, expectedWins: 0, adjustedRate: 0, currentWinStreak: 0, bestWinStreak: 0, form: [], trend: [], lastPlayedAt: null },
      null,
    );

  const counts = new Map<string, number>();
  for (const m of matches) {
    if (!m.results.some((r) => r.user_id === playerId)) continue;
    const key = localMonthKey(m.playedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return {
    player,
    years: availableYears(history),
    year,
    stats,
    minMatches: board.minMatches,
    rankedCount: board.ranked.length,
    headToHead: headToHead(matches, playerId, refs),
    bests: personalBests(matches, games, playerId),
    bestGame: bestGameView(matches, games, playerId),
    activity: monthWindow(year).map((m) => ({ ...m, count: counts.get(m.key) ?? 0 })),
    prevId: refs[(index - 1 + refs.length) % refs.length].id,
    nextId: refs[(index + 1) % refs.length].id,
  };
}
