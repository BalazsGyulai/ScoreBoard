"use client";

// Draft scores of the round being entered, autosaved to the API (score_drafts).
//
// - Inputs are controlled by `entries`. Typing marks a player "dirty" and schedules
//   a debounced save of the dirty players only (so two devices typing different
//   columns do not overwrite each other).
// - Server drafts (reload, other device) fill every input the user is not editing.
// - Leaving the page flushes pending changes with a keep-alive request.
// - Drafts are never scores: the round counts only when "Kör mentése" submits it.

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetchJson } from "@/lib/api/client";

export const DRAFT_SAVE_DELAY_MS = 600;

type DraftsResponse = { round: number | null; drafts: { player_id: string; value: number }[] };
export type DraftStatus = "idle" | "saving" | "saved" | "error" | "stale";

function toValue(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export function useScoreDrafts(gameId: string | null, enabled: boolean, onStale: () => void) {
  const key = gameId && enabled ? `/api/games/${gameId}/drafts` : null;
  const { data, mutate } = useSWR<DraftsResponse>(key, fetchJson, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });

  const [entries, setEntries] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<DraftStatus>("idle");
  const dirty = useRef(new Set<string>());
  const entriesRef = useRef(entries);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const round = data?.round ?? null;

  entriesRef.current = entries;

  // Server → inputs, for every player the user is not currently editing.
  useEffect(() => {
    if (!data) return;
    setEntries((prev) => {
      const next: Record<string, string> = {};
      for (const id of dirty.current) if (prev[id] !== undefined) next[id] = prev[id];
      for (const d of data.drafts) if (!dirty.current.has(d.player_id)) next[d.player_id] = String(d.value);
      return next;
    });
  }, [data]);

  const buildBody = useCallback(() => {
    if (round === null || dirty.current.size === 0) return null;
    const values = [...dirty.current]
      .filter((id) => {
        const raw = entriesRef.current[id] ?? "";
        return raw.trim() === "" || toValue(raw) !== null; // skip half-typed "-"
      })
      .map((id) => ({ player_id: id, value: toValue(entriesRef.current[id] ?? "") }));
    return values.length > 0 ? { round, values } : null;
  }, [round]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const body = buildBody();
    if (!key || !body) return;
    const sent = new Set(body.values.map((v) => v.player_id));
    const sentValues = new Map(body.values.map((v) => [v.player_id, entriesRef.current[v.player_id] ?? ""]));
    setStatus("saving");
    try {
      const res = await apiFetch(key, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        // The round was saved on another device: these numbers belong to a finished round.
        dirty.current.clear();
        setEntries({});
        setStatus("stale");
        await mutate();
        onStale();
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      // still dirty only if the user typed again while this request was in flight
      for (const id of sent) if ((entriesRef.current[id] ?? "") === sentValues.get(id)) dirty.current.delete(id);
      setStatus(dirty.current.size > 0 ? "saving" : "saved");
      if (dirty.current.size > 0) timer.current = setTimeout(() => void flush(), DRAFT_SAVE_DELAY_MS);
    } catch {
      setStatus("error");
    }
  }, [buildBody, key, mutate, onStale]);

  const setEntry = useCallback(
    (playerId: string, raw: string) => {
      setEntries((prev) => ({ ...prev, [playerId]: raw }));
      entriesRef.current = { ...entriesRef.current, [playerId]: raw };
      dirty.current.add(playerId);
      setStatus("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DRAFT_SAVE_DELAY_MS);
    },
    [flush],
  );

  const clearAll = useCallback(
    (playerIds: string[]) => {
      for (const id of playerIds) {
        dirty.current.add(id);
        entriesRef.current = { ...entriesRef.current, [id]: "" };
      }
      setEntries((prev) => Object.fromEntries(Object.keys(prev).map((id) => [id, playerIds.includes(id) ? "" : prev[id]])));
      void flush();
    },
    [flush],
  );

  /** After a successful submit the API has already deleted the drafts. */
  const resetAfterSubmit = useCallback(async () => {
    clearTimeout(timer.current);
    dirty.current.clear();
    setEntries({});
    setStatus("idle");
    await mutate();
  }, [mutate]);

  // Leaving the page / app: send what is pending even though the page goes away.
  useEffect(() => {
    const sendNow = () => {
      const body = buildBody();
      if (!key || !body) return;
      clearTimeout(timer.current);
      void fetch(key, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify(body),
      });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") sendNow();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", sendNow);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", sendNow);
      sendNow(); // client-side navigation away from the game
    };
  }, [buildBody, key]);

  return { entries, setEntry, clearAll, resetAfterSubmit, flush, status, round };
}
