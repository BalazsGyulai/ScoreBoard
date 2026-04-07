const HIDDEN_PLAYERS_STORAGE_KEY = "hg_hidden_player_ids";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readHiddenPlayerIds(): Set<string> {
  if (!canUseStorage()) return new Set<string>();
  try {
    const raw = window.localStorage.getItem(HIDDEN_PLAYERS_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set<string>();
  }
}

export function writeHiddenPlayerIds(hiddenIds: Iterable<string>) {
  if (!canUseStorage()) return;
  const unique = [...new Set(Array.from(hiddenIds))];
  window.localStorage.setItem(HIDDEN_PLAYERS_STORAGE_KEY, JSON.stringify(unique));
}

export function isPlayerVisible(playerId: string, hiddenIds: Set<string>) {
  return !hiddenIds.has(playerId);
}

