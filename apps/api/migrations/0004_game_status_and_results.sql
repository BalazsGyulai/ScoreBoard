-- Add game status tracking and results snapshot table.
-- Existing games default to 'open' so nothing breaks.

-- New enum for game lifecycle
CREATE TYPE game_status AS ENUM ('open', 'closed');

-- Add status + closed_at to existing games table
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS status    game_status NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL DEFAULT NULL;

-- Snapshot of final standings, written once when a game is closed.
-- Avoids recalculating SUM(scores) on every read.
CREATE TABLE game_results (
    game_id     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_score INT  NOT NULL,
    place       INT  NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (game_id, user_id)
);

CREATE INDEX idx_game_results_game ON game_results(game_id);
