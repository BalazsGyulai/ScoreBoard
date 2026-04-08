-- Game sharing: one share token per game for live viewer access
CREATE TABLE game_shares (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id    UUID NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
    token      VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_shares_token ON game_shares(token);
