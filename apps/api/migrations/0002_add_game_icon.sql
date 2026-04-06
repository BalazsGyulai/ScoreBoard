-- Add icon support to custom games.
-- Existing rows get a default icon so the NOT NULL constraint is valid.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT '🎲';

