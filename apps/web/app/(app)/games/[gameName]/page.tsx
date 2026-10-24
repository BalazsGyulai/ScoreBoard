"use client";

import { apiFetch, errorMessage, fetchJson } from "@/lib/api/client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Check, Plus, PlusIcon, Undo2 } from "lucide-react";
import ActionButton from "@/components/ui/actionButton";
import StandingsList from "@/components/game/standingsList";
import { useToast } from "@/components/toast/toastProvider";
import styles from "./game.module.css";
import { useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { revalidateStats } from "@/lib/dashboard/cacheKeys";
import { HIDDEN_PLAYERS_CHANGED_EVENT, isPlayerVisible, readHiddenPlayerIds } from "@/lib/playerVisibility";
import { computeStandings, joinNames } from "@/lib/scoring/standings";
import { useScoreDrafts, type DraftStatus } from "@/hooks/use-score-drafts";
import type { AddRoundRequest, ApiGame, ApiPlayer, ApiScoreRow, ApiScoreSnapshot } from "@/types/api";

type MeResponse = { role: string };
type PendingAction =
  | { kind: "close" }
  | { kind: "restart" }
  | { kind: "undo" }
  | { kind: "partial"; missing: string[]; scores: AddRoundRequest["scores"] }
  | null;

const swrOptions = { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false };

function slugify(name: string) {
  return name.trim().toLowerCase();
}

function buildScoreMap(scores: ApiScoreRow[]) {
  const scoreMap = new Map<number, Map<string, ApiScoreRow>>();
  for (const s of scores) {
    if (!scoreMap.has(s.round)) scoreMap.set(s.round, new Map());
    scoreMap.get(s.round)!.set(s.user_id, s);
  }
  return scoreMap;
}

function parseScore(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export default function ActiveGamePage() {
  const { showToast } = useToast();
  const params = useParams<{ gameName: string }>();
  const slug = decodeURIComponent(params.gameName ?? "");
  const [editingCell, setEditingCell] = useState<{ round: number; userId: string } | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const [hiddenPlayerIds, setHiddenPlayerIds] = useState<Set<string>>(new Set());
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Use the cached games list to resolve slug -> game id.
  const { data: games } = useSWR<ApiGame[]>("/api/games", fetchJson, swrOptions);
  const game = games?.find((g) => slugify(g.name) === slugify(slug));
  const isOpen = game?.status === "open";

  const { data: me } = useSWR<MeResponse>("/api/auth/me", fetchJson, swrOptions);
  const { data: players, isLoading: playersLoading, error: playersError } = useSWR<ApiPlayer[]>(
    "/api/players",
    fetchJson,
    swrOptions,
  );

  const { data: scoreSnapshots } = useSWR<ApiScoreSnapshot[]>(
    game?.status === "closed" ? `/api/games/${game.id}/score-snapshots` : null,
    fetchJson,
    swrOptions,
  );

  const selectedSnapshotId =
    game?.status === "closed" && scoreSnapshots && scoreSnapshots.length > 0
      ? scoreSnapshots[Math.min(snapshotIndex, scoreSnapshots.length - 1)]?.snapshot_id ?? null
      : null;

  const scoresKey = game
    ? game.status === "closed" && selectedSnapshotId
      ? `/api/games/${game.id}/scores?snapshot_id=${encodeURIComponent(selectedSnapshotId)}`
      : `/api/games/${game.id}/scores`
    : null;

  const { data: scoreRows, isLoading: scoresLoading, error: scoresError } = useSWR<ApiScoreRow[]>(
    scoresKey,
    fetchJson,
    {
      ...swrOptions,
      // several phones at the table: pick up rounds saved on another device
      refreshInterval: isOpen && !editingCell ? 15_000 : 0,
    },
  );

  useEffect(() => {
    const syncHiddenPlayers = () => setHiddenPlayerIds(readHiddenPlayerIds());
    syncHiddenPlayers();
    const events = ["storage", "focus", HIDDEN_PLAYERS_CHANGED_EVENT];
    events.forEach((e) => window.addEventListener(e, syncHiddenPlayers));
    return () => events.forEach((e) => window.removeEventListener(e, syncHiddenPlayers));
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (game?.status !== "closed" || !scoreSnapshots || scoreSnapshots.length === 0) {
      setSnapshotIndex(0);
      return;
    }
    setSnapshotIndex((prev) => Math.min(prev, scoreSnapshots.length - 1));
  }, [game?.id, game?.status, scoreSnapshots]);

  const rows = useMemo(() => scoreRows ?? [], [scoreRows]);
  const standings = useMemo(
    () => computeStandings(rows, game?.winner_rule ?? "max"),
    [rows, game?.winner_rule],
  );

  // Columns: everyone who has scores in this session (hiding never hides a result),
  // plus the visible players who can still join an open game.
  const columns = useMemo(() => {
    const scored = new Set(rows.map((r) => r.user_id));
    return (players ?? [])
      .filter((p) => scored.has(p.id) || (isOpen && isPlayerVisible(p.id, hiddenPlayerIds)))
      .sort((a, b) => a.username.localeCompare(b.username, "hu"));
  }, [players, rows, isOpen, hiddenPlayerIds]);
  const nameOf = (id: string) => players?.find((p) => p.id === id)?.username ?? "?";

  const scoreMap = buildScoreMap(rows);
  const roundNumbers = [...new Set(rows.map((s) => s.round))].sort((a, b) => a - b);
  const winners = standings.winners.map(nameOf);
  const winnerTotal = standings.rows[0]?.total ?? null;
  const incompleteCount = standings.rows.filter((r) => r.roundsPlayed < standings.roundCount).length;
  const canManageGame = me?.role === "leader";
  const canEdit = canManageGame && isOpen;

  async function refreshAfterChange() {
    if (!game) return;
    await mutate(`/api/games/${game.id}/scores`);
    void mutate("/api/games");
  }

  // Typed numbers are autosaved as drafts (not scores) until the round is submitted.
  const drafts = useScoreDrafts(game?.id ?? null, canEdit, () => {
    showToast("Ezt a kört egy másik eszközön már elmentették.", "info");
    void refreshAfterChange();
  });

  function inputFor(playerId: string) {
    return document.getElementById(`inp_${playerId}`) as HTMLInputElement | null;
  }

  function clearInputRow() {
    drafts.clearAll(columns.map((p) => p.id));
  }

  function commitRound() {
    if (!game || !canEdit || isSaving) return;

    const scores: AddRoundRequest["scores"] = [];
    const missing: string[] = [];
    for (const p of columns) {
      const raw = drafts.entries[p.id] ?? "";
      const value = parseScore(raw);
      if (raw.trim() !== "" && value === null) {
        showToast(`${p.username}: csak egész szám adható meg.`);
        inputFor(p.id)?.focus();
        return;
      }
      if (value === null) missing.push(p.username);
      else scores.push({ player_id: p.id, value });
    }

    if (scores.length === 0) {
      showToast("Adj meg legalább egy pontszámot!");
      return;
    }
    // A missing score is "did not play this round", not 0 points — confirm it.
    if (missing.length > 0) {
      setPendingAction({ kind: "partial", missing, scores });
      return;
    }
    void saveRound(scores);
  }

  async function saveRound(scores: AddRoundRequest["scores"]) {
    if (!game) return;
    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/games/${game.id}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores } satisfies AddRoundRequest),
      });
      if (!res.ok) {
        showToast(await errorMessage(res));
        return;
      }
      await drafts.resetAfterSubmit();
      await refreshAfterChange();
      if (columns[0]) inputFor(columns[0].id)?.focus({ preventScroll: true });
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(round: number, userId: string) {
    if (!canEdit) return;
    setEditingCell({ round, userId });
    setTimeout(() => editRef.current?.select(), 0);
  }

  async function saveEdit(round: number, userId: string, prevValue: number | null) {
    const raw = editRef.current?.value ?? "";
    const nextValue = parseScore(raw);
    if (!game || nextValue === null || nextValue === prevValue) {
      setEditingCell(null);
      return;
    }

    const res = await apiFetch(`/api/games/${game.id}/scores/${round}/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: nextValue }),
    });
    setEditingCell(null);
    if (!res.ok) {
      showToast(await errorMessage(res));
      return;
    }
    await refreshAfterChange();
  }

  async function runAction(path: string, method: "POST" | "DELETE", okMessage?: string) {
    if (!game || !canManageGame) return;
    setIsSubmittingAction(true);
    try {
      const res = await apiFetch(path, { method, headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        showToast(await errorMessage(res));
        return;
      }
      await mutate("/api/games");
      await mutate(`/api/games/${game.id}/score-snapshots`);
      await mutate(`/api/games/${game.id}/scores`);
      await revalidateStats();
      if (okMessage) showToast(okMessage, "success");
      setPendingAction(null);
    } finally {
      setIsSubmittingAction(false);
    }
  }

  async function confirmPendingAction() {
    if (!game || !pendingAction) return;
    switch (pendingAction.kind) {
      case "close":
        return runAction(`/api/games/${game.id}/close`, "POST");
      case "restart":
        return runAction(`/api/games/${game.id}/restart`, "POST");
      case "undo":
        return runAction(`/api/games/${game.id}/rounds/last`, "DELETE", "Az utolsó kör törölve.");
      case "partial":
        setPendingAction(null);
        return saveRound(pendingAction.scores);
    }
  }

  const dialog = pendingAction && {
    close: {
      title: "Meccs lezárása",
      body:
        winners.length > 0
          ? `${winners.length > 1 ? "Holtverseny — győztesek" : "Győztes"}: ${joinNames(winners)} (${winnerTotal} pont). Lezárod a meccset?`
          : "Biztosan le akarod zárni a meccset?",
      confirm: "Lezárás",
      variant: "amber" as const,
    },
    restart: {
      title: "Új játék indítása",
      body: "Új játékot indítasz – a korábbi eredmények megmaradnak. Folytatod?",
      confirm: "Új játék",
      variant: "dark" as const,
    },
    undo: {
      title: "Utolsó kör törlése",
      body: `A(z) ${roundNumbers.at(-1)}. kör összes pontja törlődik. Folytatod?`,
      confirm: "Törlés",
      variant: "danger" as const,
    },
    partial: {
      title: "Hiányzó pontok",
      body:
        pendingAction.kind === "partial"
          ? `${joinNames(pendingAction.missing)} nem kap pontot ebben a körben. Ez nem 0 pont: aki kevesebb kört játszik, a sorrendben hátrébb kerül. A hiányzó pont később pótolható.`
          : "",
      confirm: "Mentés így",
      variant: "dark" as const,
    },
  }[pendingAction.kind];

  return (
    <div className="view">
      {/* ── Header ── */}
      <div className={styles["game-pg-hdr"]}>
        <div className={styles["game-pg-hdr-left"]}>
          <Link href="/games" className={styles.back}>
            ← Vissza a játékokhoz
          </Link>
          <h1>{game ? `${game.icon} ${game.name}` : games ? "Nincs ilyen játék" : "Játék betöltése..."}</h1>
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
                <span>
                  {game.winner_rule === "min" ? "Kevesebb pont nyer" : "Több pont nyer"} ·{" "}
                  {isOpen ? `Következik: ${roundNumbers.length + 1}. kör` : `Lezárva · ${roundNumbers.length} kör`}
                  {game.status === "closed" && scoreSnapshots && scoreSnapshots.length > 1 && (
                    <> · Archívum {snapshotIndex + 1}/{scoreSnapshots.length}</>
                  )}
                </span>
                <span className={styles["leader-line"]} data-testid="leader-line">
                  {winners.length > 0 ? (
                    <span className={styles.orange}>
                      🏆 {isOpen ? (winners.length > 1 ? "Holtverseny" : "Vezet") : winners.length > 1 ? "Győztesek" : "Győztes"}:{" "}
                      {joinNames(winners)} ({winnerTotal} pont)
                    </span>
                  ) : (
                    <span>Még nincs pont rögzítve</span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>
        <div className={styles["game-actions"]}>
          {game?.status === "closed" && scoreSnapshots && scoreSnapshots.length > 1 && (
            <>
              <ActionButton
                text="Előző"
                variant="ghost"
                icon={<ChevronLeft size={13} />}
                onClick={() => setSnapshotIndex((prev) => prev + 1)}
                disabled={snapshotIndex >= scoreSnapshots.length - 1}
              />
              <ActionButton
                text="Következő"
                variant="ghost"
                icon={<ChevronRight size={13} />}
                onClick={() => setSnapshotIndex((prev) => Math.max(0, prev - 1))}
                disabled={snapshotIndex <= 0}
              />
            </>
          )}
          {canManageGame && game?.status === "closed" && (
            <ActionButton
              text="Új játék"
              variant="ghost"
              icon={<PlusIcon size={13} />}
              onClick={() => setPendingAction({ kind: "restart" })}
            />
          )}
          {canEdit && (
            <ActionButton
              text="Meccs lezárása"
              variant="amber"
              icon={<Check size={13} />}
              onClick={() => setPendingAction({ kind: "close" })}
              disabled={roundNumbers.length === 0}
            />
          )}
        </div>
      </div>

      {/* ── Score table ──
          .tbl-scroll is the horizontal scroll container; the card around it only
          rounds the corners. The footer stays outside so it never scrolls away. */}
      <div className={styles["tbl-wrap"]}>
        <div className={styles["tbl-scroll"]} data-table-scroll>
          <table className={styles["score-tbl"]}>
            <thead>
              <tr>
                <th className={styles["col-round"]}>Kör</th>
                {columns.map((p) => (
                  <th key={p.id}>{p.username}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Total row */}
              <tr className={styles["total-row"]}>
                <td>Összesen</td>
                {columns.map((p) => {
                  const s = standings.byPlayer.get(p.id);
                  if (!s) {
                    return (
                      <td key={p.id} className={styles.muted}>
                        —
                      </td>
                    );
                  }
                  const isWinner = standings.winners.includes(p.id);
                  const isLoser = standings.losers.includes(p.id);
                  const incomplete = s.roundsPlayed < standings.roundCount;
                  return (
                    <td
                      key={p.id}
                      className={isWinner ? styles["winner-col"] : isLoser ? styles["loser-col"] : ""}
                      data-place={s.place}
                    >
                      {s.total}
                      {isWinner ? " 🏆" : ""}
                      <span className={styles["place-note"]}>
                        {s.place}. hely
                        {incomplete && ` · ${s.roundsPlayed}/${standings.roundCount} kör`}
                      </span>
                    </td>
                  );
                })}
              </tr>

              {/* Input row — only for open games */}
              {canEdit && (
                <tr className={styles["input-row"]}>
                  <td>Új kör</td>
                  {columns.map((p, i) => (
                    <td key={p.id}>
                      <input
                        className={styles["round-inp"]}
                        type="number"
                        step={1}
                        id={`inp_${p.id}`}
                        placeholder="—"
                        value={drafts.entries[p.id] ?? ""}
                        onChange={(e) => drafts.setEntry(p.id, e.target.value)}
                        aria-label={`${p.username} pontja`}
                        enterKeyHint={i === columns.length - 1 ? "done" : "next"}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          const next = columns[i + 1];
                          if (next) inputFor(next.id)?.focus();
                          else commitRound();
                        }}
                      />
                    </td>
                  ))}
                </tr>
              )}

              {/* Data rows */}
              {roundNumbers.map((roundNo) => (
                <tr key={roundNo}>
                  <td>{roundNo}. kör</td>
                  {columns.map((p) => {
                    const score = scoreMap.get(roundNo)?.get(p.id);
                    const isEditing = editingCell?.round === roundNo && editingCell?.userId === p.id;

                    if (isEditing) {
                      return (
                        <td key={p.id}>
                          <input
                            ref={editRef}
                            className={styles["cell-edit"]}
                            type="number"
                            aria-label={`${p.username}, ${roundNo}. kör`}
                            defaultValue={score?.value ?? ""}
                            onBlur={() => void saveEdit(roundNo, p.id, score?.value ?? null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            autoFocus
                          />
                        </td>
                      );
                    }
                    if (canEdit) {
                      return (
                        <td key={p.id}>
                          <button
                            type="button"
                            className={`${styles["cell-val"]} ${styles["cell-btn"]} ${score ? "" : styles["cell-missing"]}`}
                            onClick={() => startEdit(roundNo, p.id)}
                            title={score ? "Szerkesztés" : "Hiányzó pont pótlása"}
                            aria-label={
                              score
                                ? `${p.username}, ${roundNo}. kör: ${score.value} — szerkesztés`
                                : `${p.username}, ${roundNo}. kör: hiányzik — pótlás`
                            }
                          >
                            {score ? score.value : "—"}
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={p.id}>
                        {score ? (
                          <span className={styles["cell-val"]}>{score.value}</span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className={styles["tbl-foot"]}>
          <span className={styles["tbl-foot-info"]}>
            <strong>{roundNumbers.length}</strong> kör lejátszva
            {incompleteCount > 0 && <> · {incompleteCount} játékosnál hiányzik pont</>}
            {canEdit && <DraftIndicator status={drafts.status} />}
          </span>
          <div className={styles["tbl-foot-actions"]}>
            {canEdit && (
              <>
                {roundNumbers.length > 0 && (
                  <ActionButton
                    text="Utolsó kör"
                    variant="ghost"
                    icon={<Undo2 size={13} />}
                    onClick={() => setPendingAction({ kind: "undo" })}
                  />
                )}
                <ActionButton text="Ürít" variant="ghost" onClick={clearInputRow} />
                <ActionButton
                  text={isSaving ? "Mentés..." : "Kör mentése"}
                  variant="dark"
                  icon={<Plus size={13} />}
                  onClick={commitRound}
                  disabled={isSaving}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {game && (
        <StandingsList
          standings={standings}
          rule={game.winner_rule}
          names={new Map((players ?? []).map((p) => [p.id, p.username]))}
          final={!isOpen}
        />
      )}

      {isClient && pendingAction && dialog && createPortal((
        <div
          className={styles["confirm-overlay"]}
          onClick={() => {
            if (!isSubmittingAction) setPendingAction(null);
          }}
        >
          <div
            className={styles["confirm-modal"]}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-modal-title">{dialog.title}</h3>
            <p>{dialog.body}</p>
            <div className={styles["confirm-actions"]}>
              <ActionButton
                text="Mégse"
                variant="ghost"
                onClick={() => setPendingAction(null)}
                disabled={isSubmittingAction}
              />
              <ActionButton
                text={dialog.confirm}
                variant={dialog.variant}
                onClick={() => void confirmPendingAction()}
                disabled={isSubmittingAction}
              />
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

const draftText: Partial<Record<DraftStatus, string>> = {
  saving: "Vázlat mentése…",
  saved: "Vázlat mentve ✓",
  error: "A vázlatot nem sikerült menteni",
};

/** Where the typed (not yet submitted) numbers are. */
function DraftIndicator({ status }: { status: DraftStatus }) {
  const text = draftText[status];
  if (!text) return null;
  return (
    <span className={`${styles["draft-status"]} ${status === "error" ? styles["draft-error"] : ""}`} role="status" data-testid="draft-status">
      {text}
    </span>
  );
}
