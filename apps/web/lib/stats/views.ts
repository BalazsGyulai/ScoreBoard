// Response shapes of the /api/dashboard/* routes (shared by route handlers and pages).

import type { Outcome } from "./matches";
import type { GameStats, PersonalBest } from "./games";
import type { Duel } from "./rivals";

export interface RankedPlayer {
  id: string;
  username: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  /** 1-based position, or null when below the minimum matches */
  rank: number | null;
  currentWinStreak: number;
  bestWinStreak: number;
  form: Outcome[];
  trend: number[];
  lastPlayedAt: string | null;
}

export interface LeaderboardView {
  ranked: RankedPlayer[];
  unranked: RankedPlayer[];
  minMatches: number;
}

export interface RecentItem {
  key: string;
  slug: string;
  name: string;
  icon: string;
  status: "open" | "closed";
  /** "3 kör · 2025. 03. 14." */
  info: string;
  /** winners of a finished match, leaders of an open one */
  names: string[];
  /** finished matches: when; open games: null */
  playedAt: string | null;
}

export interface OverviewView {
  username: string;
  totalMatches: number;
  playedGames: number;
  playerCount: number;
  lastPlayed: string;
  me: { matches: number; wins: number; winRate: number };
  bestGame: { name: string; icon: string; wins: number; matches: number; qualified: boolean } | null;
  mostActive: { names: string[]; matches: number } | null;
  leaderboard: LeaderboardView;
  recent: RecentItem[];
}

export interface RivalryView {
  a: { id: string; username: string };
  b: { id: string; username: string };
  played: number;
  aWins: number;
  bWins: number;
  draws: number;
}

export interface StatsView {
  years: number[];
  year: number | null;
  totalMatches: number;
  leaderboard: LeaderboardView;
  games: GameStats[];
  rivalries: RivalryView[];
}

export interface PlayerView {
  player: { id: string; username: string };
  years: number[];
  year: number | null;
  stats: RankedPlayer;
  minMatches: number;
  rankedCount: number;
  headToHead: Duel[];
  bests: PersonalBest[];
  bestGame: { name: string; icon: string; wins: number; matches: number; qualified: boolean } | null;
  activity: { key: string; label: string; count: number }[];
  /** neighbours in the all-players list, for prev/next navigation */
  prevId: string | null;
  nextId: string | null;
}
