// Core business domain types.
// These mirror the PostgreSQL schema in apps/api/migrations/0001_init.sql.
// Import in components and lib/api/* as: import type { Player, Game, Score } from "@/types/domain"

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type Role = "leader" | "member" | "viewer";

export interface Session {
  userId:   string;
  groupId:  string;
  username: string;
  role:     Role;
  /** Viewer tokens have a restricted scope — they can only read */
  scope:    ("read" | "write")[];
}

// ─── Group ────────────────────────────────────────────────────────────────────

export interface Group {
  id:        string;
  createdAt: string; // ISO 8601
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface Player {
  id:        string;
  groupId:   string;
  username:  string;
  role:      Role;
  email:     string | null;
  createdAt: string;
  /** Security code shown in the UI: displayed as #XXXX, used as a login hint */
  securityCode?: number;
}

// ─── Game ─────────────────────────────────────────────────────────────────────

/** "min" = lowest cumulative score wins, "max" = highest wins */
export type WinnerRule = "min" | "max";

export interface Game {
  id:           string;
  groupId:      string;
  name:         string;
  winnerRule:   WinnerRule;
  currentRound: number;
  createdAt:    string;
}

// ─── Score ────────────────────────────────────────────────────────────────────

export interface Score {
  id:         string;
  gameId:     string;
  userId:     string;
  round:      number;
  value:      number;
  recordedAt: string;
}

// ─── Player score (denormalised view used in the scoring UI) ──────────────────

/** Per-player view of scores in the current round of a custom game */
export interface PlayerScore {
  player:   Player;
  scores:   Score[];   // individual round entries, newest first
  total:    number;    // sum of all values in the current round
  place:    number | "-"; // leaderboard position for this round (or "-" if unranked)
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export interface PlayerOverallStats {
  player:       Player;
  wins:         number;
  losses:       number;
  totalGames:   number;
  winRate:      number; // 0–100
  lossRate:     number;
}

export interface PlayerGameStats extends PlayerOverallStats {
  game:             Game;
  /** Cumulative score totals per round — used for the line chart */
  sumChartLabels:   string[];
  sumChartValues:   number[];
}

export interface GroupStats {
  players:    string[];          // ordered player name list (chart labels)
  wins:       number[];          // win count per player (parallel array)
  losses:     number[];          // loss count per player
  gameName?:  string;            // if present, stats are scoped to one game
}
