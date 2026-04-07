-- Archive per-round scores when games are closed.
-- This preserves round-by-round history even after clearing the live scores table.
CREATE TABLE score_archives (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_id UUID NOT NULL,
    game_id     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    round       INT  NOT NULL,
    value       INT  NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_archives_game_snapshot_round ON score_archives(game_id, snapshot_id, round);
CREATE INDEX idx_score_archives_game_user          ON score_archives(game_id, user_id);
