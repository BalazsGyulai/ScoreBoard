// API request and response shapes — what the Rust backend sends and receives.
// These are serialisation contracts. The field names must match the Rust serde fields
// (snake_case by default with serde).
//
// Import as: import type { LoginRequest, ApiGame } from "@/types/api"

import type { Role, WinnerRule } from "./domain";

// ─── Generic envelope ────────────────────────────────────────────────────────

/** Every API error comes back as { error: "message" } */
export interface ApiError {
  error: string;
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export interface RegisterRequest {
  username:  string;
  password:  string;
  password2: string;
}

export interface RegisterResponse {
  user_id:  string;
  group_id: string;
  username: string;
  role:     Role;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token:  string;  // short-lived JWT (15 min), stored in HttpOnly cookie by the API
  refresh_token: string;  // long-lived JWT (7 days), stored in HttpOnly cookie
  user_id:       string;
  group_id:      string;
  username:      string;
  role:          Role;
}

export interface RefreshResponse {
  access_token: string;
}

/** Viewer token returned to the leader so they can share the live scoreboard */
export interface ViewerTokenResponse {
  token:     string;
  share_url: string;  // e.g. https://example.com/live/abc?token=...
}

// ─── Players ──────────────────────────────────────────────────────────────────

export interface ApiPlayer {
  id:         string;
  group_id:   string;
  username:   string;
  role:       Role;
  email:      string | null;
  created_at: string;
}

export interface AddPlayerRequest {
  username:  string;
  password:  string;
  password2: string;
}

export interface UpdateEmailRequest {
  email: string;
}

export interface UpdatePasswordRequest {
  password:  string;
  password2: string;
}

// ─── Games ────────────────────────────────────────────────────────────────────

export interface ApiGame {
  id:            string;
  group_id:      string;
  name:          string;
  winner_rule:   WinnerRule;
  icon:          string;
  current_round: number;
  status:        "open" | "closed";
  closed_at:     string | null;
  created_at:    string;
}

export interface ApiGameResult {
  user_id:     string;
  username:    string;
  total_score: number;
  place:       number;
}

export interface CloseGameResponse {
  game_id: string;
  results: ApiGameResult[];
}

export interface CreateGameRequest {
  name:        string;
  winner_rule: WinnerRule;
  icon:        string;
}

// ─── Scores ───────────────────────────────────────────────────────────────────

export interface ApiScore {
  id:          string;
  game_id:     string;
  user_id:     string;
  round:       number;
  value:       number;
  recorded_at: string;
}

/**
 * Row returned by Rust `GET /games/:id/scores`.
 * Note: the Rust API returns `username` but not `game_id`.
 */
export interface ApiScoreRow {
  id:          string;
  user_id:     string;
  username:    string;
  round:       number;
  value:       number;
  recorded_at: string;
}

export interface AddScoreRequest {
  user_id: string;
  game_id: string;
  value:   number;
  round?:  number;  // omit to use the game's current_round
}

export interface AddRoundRequest {
  scores: { player_id: string; value: number }[];
}

export interface UpdateScoreRequest {
  value: number;
}

/** Per-player row returned from GET /games/:id/scores */
export interface ApiPlayerScore {
  player: ApiPlayer;
  scores: ApiScore[];
  total:  number;
  place:  number | null;  // null = not yet ranked
}

// ─── Statistics ───────────────────────────────────────────────────────────────

/** Win/loss bar chart data for the whole group (all games combined) */
export interface ApiGroupStats {
  players: string[];  // player name list used as chart labels
  wins:    number[];  // parallel to players
  losses:  number[];  // parallel to players
}

/** Same as ApiGroupStats but scoped to one custom game */
export interface ApiGameStats extends ApiGroupStats {
  game_name: string;
}

/** Win/loss stats for a single player */
export interface ApiPlayerStats {
  wins:        number;
  losses:      number;
  total_games: number;
  win_rate:    number;  // 0–100
  loss_rate:   number;
}

/** Years that have recorded games — used to populate the year filter <select> */
export interface ApiYears {
  years: string[];
}
