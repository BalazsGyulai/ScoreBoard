import { mutate } from "swr";

/** Refetch every stats view (dashboard, stats page, player pages) after a result changed. */
export function revalidateStats() {
  return mutate((key) => typeof key === "string" && key.startsWith("/api/dashboard/"));
}
