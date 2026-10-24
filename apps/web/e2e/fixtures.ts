import fs from "node:fs";
import path from "node:path";

export const AUTH_FILE = path.join(__dirname, ".auth", "leader.json");
export const SEED_FILE = path.join(__dirname, ".auth", "seed.json");

export type Seed = {
  leaderEmail: string;
  password: string;
  leaderId: string;
  playerId: string;
  openGameId: string;
  openGameSlug: string;
  closedGameSlug: string;
  shareUrl: string;
};

export function seed(): Seed {
  return JSON.parse(fs.readFileSync(SEED_FILE, "utf8")) as Seed;
}
