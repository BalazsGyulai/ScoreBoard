-- Prevent duplicate score entries for the same player in the same game round.

ALTER TABLE scores
  ADD CONSTRAINT scores_one_per_player_round UNIQUE (game_id, user_id, round);

