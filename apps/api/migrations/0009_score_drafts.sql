-- Draft scores: what the leader has typed into the "new round" row but not saved yet.
-- Kept server-side so a reload, navigating away or the leader's other device keeps
-- the numbers. Drafts live only in this table — totals, results and every statistic
-- read scores / score_archives / game_results, so a draft can never count.
--
-- Additive and idempotent (only creates a new table); the API also runs this file on startup.

CREATE TABLE IF NOT EXISTS score_drafts (
    game_id    UUID        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    round      INT         NOT NULL,
    value      INT         NOT NULL,
    updated_by UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (game_id, user_id, round)
);
