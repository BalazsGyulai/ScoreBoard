-- Keep immutable history for each close/restart cycle.
-- game_results must store snapshots, not one mutable row-set per game.
ALTER TABLE game_results
  ADD COLUMN snapshot_id UUID;

-- Backfill existing rows.
-- Prior schema allowed only one result set per game, so game_id is a safe snapshot key.
UPDATE game_results
SET snapshot_id = game_id
WHERE snapshot_id IS NULL;

ALTER TABLE game_results
  ALTER COLUMN snapshot_id SET NOT NULL;

ALTER TABLE game_results
  DROP CONSTRAINT game_results_pkey;

ALTER TABLE game_results
  ADD PRIMARY KEY (snapshot_id, user_id);
