"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Plus,
  PlusIcon,
} from "lucide-react";
import ActionButton from "@/components/ui/actionButton";
import Input from "@/components/ui/input";
import styles from "./game.module.css";
import { useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { dashboardCacheKeys } from "@/lib/dashboard/cacheKeys";
import { isPlayerVisible, readHiddenPlayerIds } from "@/lib/playerVisibility";
import type {
  AddRoundRequest,
  ApiError,
  ApiGame,
  ApiPlayer,
  ApiScoreRow,
  UpdateScoreRequest,
} from "@/types/api";

type MeResponse = { role: string };

function slugify(name: string) {
  return name.trim().toLowerCase();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Hiba (${res.status})`;
    try {
      const data = (await res.json()) as Partial<ApiError>;
      message = data.error ?? message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

function buildScoreMap(scores: ApiScoreRow[]) {
  const scoreMap = new Map<number, Map<string, ApiScoreRow>>();
  for (const s of scores) {
    if (!scoreMap.has(s.round)) scoreMap.set(s.round, new Map());
    scoreMap.get(s.round)!.set(s.user_id, s);
  }
  return scoreMap;
}

export default function ActiveGamePage() {
  const params = useParams<{ gameName: string }>();
  const slug = decodeURIComponent(params.gameName ?? "");
  const [editingCell, setEditingCell] = useState<{ round: number; userId: string } | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const [hiddenPlayerIds, setHiddenPlayerIds] = useState<Set<string>>(new Set());

  // Use the cached games list to resolve slug -> game id.
  const { data: games } = useSWR<ApiGame[]>("/api/games", fetchJson, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });
  const game = games?.find((g) => slugify(g.name) === slugify(slug));

  const {
    data: me,
  } = useSWR<MeResponse>("/api/auth/me", fetchJson, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });
  const {
    data: players,
    isLoading: playersLoading,
    error: playersError,
  } = useSWR<ApiPlayer[]>("/api/players", fetchJson, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });

  const {
    data: scoreRows,
    isLoading: scoresLoading,
    error: scoresError,
  } = useSWR<ApiScoreRow[]>(
    game ? `/api/games/${game.id}/scores` : null,
    fetchJson,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    },
  );

  useEffect(() => {
    const syncHiddenPlayers = () => {
      setHiddenPlayerIds(readHiddenPlayerIds());
    };

    syncHiddenPlayers();
    window.addEventListener("storage", syncHiddenPlayers);
    window.addEventListener("focus", syncHiddenPlayers);
    return () => {
      window.removeEventListener("storage", syncHiddenPlayers);
      window.removeEventListener("focus", syncHiddenPlayers);
    };
  }, []);

  const orderedPlayers = (players ?? [])
    .filter((player) => isPlayerVisible(player.id, hiddenPlayerIds))
    .slice()
    .sort((a, b) =>
    a.username.localeCompare(b.username, "hu"),
  );

  const scoreMap = scoreRows ? buildScoreMap(scoreRows) : new Map<number, Map<string, ApiScoreRow>>();
  const roundNumbers = scoreRows
    ? [...new Set(scoreRows.map((s) => s.round))].sort((a, b) => a - b)
    : [];
  const rounds = roundNumbers.map((r) =>
    orderedPlayers.map((p) => scoreMap.get(r)?.get(p.id)?.value ?? null),
  );

  const totals = orderedPlayers.map((_, pi) =>
    rounds.reduce((s, r) => s + (r[pi] ?? 0), 0),
  );

  const nonZeroTotals = totals
    .map((t, idx) => ({ t, idx }))
    .filter((x) => x.t > 0);

  const leaderIdx =
    !game || nonZeroTotals.length === 0
      ? null
      : nonZeroTotals.reduce((a, b) => {
        if (game.winner_rule === "min") return a.t <= b.t ? a : b;
        return a.t >= b.t ? a : b;
      }).idx;

  const leaderName = leaderIdx === null ? null : orderedPlayers[leaderIdx]?.username ?? null;
  const leaderTotal = leaderIdx === null ? null : totals[leaderIdx] ?? null;

  const bestTotal =
    !game || nonZeroTotals.length === 0
      ? null
      : (game.winner_rule === "min"
        ? Math.min(...nonZeroTotals.map((x) => x.t))
        : Math.max(...nonZeroTotals.map((x) => x.t)));
  const worstTotal =
    nonZeroTotals.length === 0 ? null : Math.max(...nonZeroTotals.map((x) => x.t));
  const canManageGame = me?.role === "leader";

  async function commitRound() {
    if (!game) return;
    if (!canManageGame) return;
    if (!orderedPlayers.length) return;

    const scores: AddRoundRequest["scores"] = [];

    for (let i = 0; i < orderedPlayers.length; i++) {
      const p = orderedPlayers[i];
      const el = document.getElementById(`inp_${p.id}`) as HTMLInputElement | null;
      const v = el ? parseInt(el.value) : NaN;
      if (!isNaN(v)) {
        scores.push({ player_id: p.id, value: v });
      }
    }

    if (scores.length === 0) {
      alert("Adj meg legalább egy pontszámot!");
      return;
    }

    const res = await fetch(`/api/games/${game.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ scores } satisfies AddRoundRequest),
    });

    if (!res.ok) {
      let message = `Hiba (${res.status})`;
      try {
        const data = (await res.json()) as Partial<ApiError>;
        message = data.error ?? message;
      } catch {
        // ignore parse errors
      }
      alert(message);
      return;
    }

    // Clear inputs
    for (const p of orderedPlayers) {
      const el = document.getElementById(`inp_${p.id}`) as HTMLInputElement | null;
      if (el) el.value = "";
    }

    // Refresh scores (and the cached games list, since current_round advances)
    await mutate(`/api/games/${game.id}/scores`);
    void mutate("/api/games");
  }

  function startEdit(round: number, userId: string) {
    if (!canManageGame) return;
    if (game?.status === "closed") return;
    setEditingCell({ round, userId });
    setTimeout(() => editRef.current?.select(), 0);
  }

  async function saveEdit(scoreId: string, prevValue: number) {
    if (!canManageGame) return;
    const raw = editRef.current?.value ?? "";
    const nextValue = parseInt(raw, 10);
    if (Number.isNaN(nextValue)) {
      setEditingCell(null);
      return;
    }

    if (nextValue === prevValue) {
      setEditingCell(null);
      return;
    }

    const res = await fetch(`/api/scores/${scoreId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ value: nextValue } satisfies UpdateScoreRequest),
    });

    if (!res.ok) {
      let message = `Hiba (${res.status})`;
      try {
        const data = (await res.json()) as Partial<ApiError>;
        message = data.error ?? message;
      } catch {
        // ignore parse errors
      }
      alert(message);
      setEditingCell(null);
      return;
    }

    setEditingCell(null);
    if (game) {
      await mutate(`/api/games/${game.id}/scores`);
    }
  }

  function clearInputRow() {
    for (const p of orderedPlayers) {
      const el = document.getElementById(`inp_${p.id}`) as HTMLInputElement | null;
      if (el) el.value = "";
    }
  }

  async function finishGame() {
    if (!game) return;
    if (!canManageGame) return;
    if (!confirm("Biztosan le akarod zárni a meccset?")) return;

    const res = await fetch(`/api/games/${game.id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      let message = `Hiba (${res.status})`;
      try {
        const data = (await res.json()) as Partial<ApiError>;
        message = data.error ?? message;
      } catch {
        // ignore parse errors
      }
      alert(message);
      return;
    }

    // Refresh game data (status will now be 'closed') and related caches
    await mutate("/api/games");
    await mutate(`/api/games/${game.id}/scores`);
    await mutate("/api/stats");
    await Promise.all(dashboardCacheKeys.map((key) => mutate(key)));
  }

  async function restartGame() {
    if (!game) return;
    if (!canManageGame) return;
    if (!confirm("Új játékot indítasz — a korábbi eredmények megmaradnak. Folytatod?")) return;

    const res = await fetch(`/api/games/${game.id}/restart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      let message = `Hiba (${res.status})`;
      try {
        const data = (await res.json()) as Partial<ApiError>;
        message = data.error ?? message;
      } catch {
        // ignore parse errors
      }
      alert(message);
      return;
    }

    // Refresh everything — game is open again with no scores
    await mutate("/api/games");
    if (game) await mutate(`/api/games/${game.id}/scores`);
    await Promise.all(dashboardCacheKeys.map((key) => mutate(key)));
  }

  return (
    <div className="view">
      {/* ── Header ── */}
      <div className={styles["game-pg-hdr"]}>
        <div className={styles["game-pg-hdr-left"]}>
          <Link href="/games" className={styles.back}>
            ← Vissza a játékokhoz
          </Link>
          <h1>
            {game ? (
              <>
                {game.icon} {game.name}{" "}
                <span className={styles.orange}>#{game.current_round}</span>
              </>
            ) : (
              "Játék betöltése..."
            )}
          </h1>
          <div className={styles["game-pg-sub"]}>
            {playersLoading || scoresLoading ? (
              "Betöltés..."
            ) : playersError || scoresError ? (
              <span style={{ color: "var(--danger)" }}>
                {((playersError ?? scoresError) as Error).message || "Hiba történt"}
              </span>
            ) : !game ? (
              "Nincs ilyen játék ebben a csoportban."
            ) : (
              <>
                {orderedPlayers.length} játékos · {game?.status === "closed" ? "Lezárva" : "Folyamatban"} &nbsp;·&nbsp;{" "}
                {leaderName && leaderTotal !== null ? (
                  <span className={styles.orange} style={{ fontWeight: 500 }}>
                    🏆 Vezet: {leaderName} ({leaderTotal} pont)
                  </span>
                ) : (
                  <span style={{ color: "var(--slate-500)" }}>
                    Még nincs pont rögzítve
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className={styles["game-actions"]}>
          {/* <ActionButton
            text="Töröl"
            variant="danger"
            icon={<Trash2 size={13} />}
          /> */}

          {canManageGame && game?.status === "closed" && (
            <ActionButton
              text="Új játék"
              variant="ghost"
              icon={<PlusIcon size={13} />}
              onClick={restartGame}
            />
          )}
          {canManageGame && game?.status !== "closed" && (
            <ActionButton
              text="Meccs lezárása"
              variant="amber"
              icon={<Check size={13} />}
              onClick={finishGame}
            />
          )}
        </div>
      </div>

      {/* ── Score table ── */}
      <div className={styles["scroll-hint"]}>
        <div className={styles["tbl-wrap"]}>
          <table className={styles["score-tbl"]}>
            <thead>
              <tr>
                <th className={styles["col-round"]}>Kör</th>
                {orderedPlayers.map((p) => (
                  <th key={p.id}>
                    <span className={styles.pid}></span>
                    {p.username}
                  </th>
                ))}
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {/* Total row */}
              <tr className={styles["total-row"]}>
                <td>Összesen</td>
                {totals.map((t, i) => {
                  const isWinner =
                    bestTotal !== null && t === bestTotal && t > 0;
                  const isLoser =
                    worstTotal !== null && t === worstTotal && t > 0;
                  const cls = isWinner
                    ? styles["winner-col"]
                    : isLoser
                      ? styles["loser-col"]
                      : "";
                  return (
                    <td key={i} className={cls}>
                      {t}
                      {isWinner ? " 🏆" : ""}
                    </td>
                  );
                })}
                <td />
              </tr>

              {/* Input row — only for open games */}
              {canManageGame && game?.status !== "closed" && (
                <tr className={styles["input-row"]}>
                  <td>Új kör</td>
                  {orderedPlayers.map((p) => (
                    <td key={p.id}>
                      <Input
                        naked
                        className={styles["round-inp"]}
                        type="number"
                        id={`inp_${p.id}`}
                        placeholder="—"
                        min={0}
                      />
                    </td>
                  ))}
                  <td />
                </tr>
              )}

              {/* Data rows */}
              {roundNumbers.map((roundNo, ri) => (
                <tr key={roundNo}>
                  <td>{roundNo}. kör</td>
                  {orderedPlayers.map((p, pi) => {
                    const score = scoreMap.get(roundNo)?.get(p.id);
                    const isEditing =
                      editingCell?.round === roundNo && editingCell?.userId === p.id;
                    const val = score?.value ?? null;

                    return (
                      <td key={p.id}>
                        {score ? (
                          isEditing ? (
                            <Input
                              id={`edit_${score.id}`}
                              naked
                              inputRef={editRef}
                              className={styles["cell-edit"]}
                              type="number"
                              defaultValue={score.value}
                              onBlur={() => void saveEdit(score.id, score.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.currentTarget as HTMLInputElement).blur();
                                }
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              autoFocus
                            />
                          ) : canManageGame && game?.status !== "closed" ? (
                            <span
                              className={styles["cell-val"]}
                              onClick={() => startEdit(roundNo, p.id)}
                              title="Szerkesztés"
                            >
                              {score.value}
                            </span>
                          ) : (
                            <span className={styles["cell-val"]}>{score.value}</span>
                          )
                        ) : val === null ? (
                          <span style={{ color: "var(--slate-200)" }}>—</span>
                        ) : (
                          <span className={styles["cell-val"]}>{val}</span>
                        )}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div className={styles["tbl-foot"]}>
            <span className={styles["tbl-foot-info"]}>
              <strong>{rounds.length}</strong> kör lejátszva
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {canManageGame && game?.status !== "closed" && (
                <>
                  <ActionButton
                    text="Mégse"
                    variant="ghost"
                    onClick={clearInputRow}
                  />
                  <ActionButton
                    text="Kör mentése"
                    variant="dark"
                    icon={<Plus size={13} />}
                    onClick={commitRound}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
