-- HomeGame — initial PostgreSQL schema
-- Run with: sqlx migrate run
-- This replaces the legacy MySQL schema (_legacy_mysql_dump.sql).
--
-- Key changes from MySQL:
--   • UUID primary keys instead of integer AUTO_INCREMENT
--   • Proper FKs with ON DELETE CASCADE
--   • wins/loses are COMPUTED from scores — no separate tables
--   • TIMESTAMPTZ instead of varchar dates
--   • membership is an ENUM type
--   • game names are stored in the `games` table (not repeated in jatekok)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Roles ────────────────────────────────────────────────────────────────────
CREATE TYPE membership AS ENUM ('leader', 'member', 'viewer');

-- ─── Groups ───────────────────────────────────────────────────────────────────
-- A group is the unit of isolation — every player, game, and score belongs to one group.
-- The user who registers creates a new group and becomes its leader.
CREATE TABLE groups (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id   UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    username   TEXT        NOT NULL,
    pass_hash  TEXT        NOT NULL,  -- bcrypt hash
    role       membership  NOT NULL DEFAULT 'member',
    email      TEXT        NOT NULL UNIQUE,  -- login credential, globally unique
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, username)              -- display names are unique within a group
);

-- ─── Games ────────────────────────────────────────────────────────────────────
-- Custom games created by the group leader (e.g. Skyjo, Póker, UNO).
CREATE TABLE games (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    -- winner_rule: "min" = lowest score wins, "max" = highest score wins
    winner_rule   TEXT NOT NULL CHECK (winner_rule IN ('min', 'max')),
    current_round INT  NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, name)
);

-- ─── Scores ───────────────────────────────────────────────────────────────────
-- Each row is one score entry (one player, one round, one game).
-- Wins and losses are derived from this table — no separate wins/loses tables.
CREATE TABLE scores (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    round       INT  NOT NULL,
    value       INT  NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Refresh tokens ───────────────────────────────────────────────────────────
-- Stores hashed refresh tokens so they can be invalidated on logout.
CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_scores_game_round ON scores(game_id, round);
CREATE INDEX idx_scores_user       ON scores(user_id);
CREATE INDEX idx_users_group       ON users(group_id);
CREATE INDEX idx_games_group       ON games(group_id);
CREATE INDEX idx_refresh_user      ON refresh_tokens(user_id);
