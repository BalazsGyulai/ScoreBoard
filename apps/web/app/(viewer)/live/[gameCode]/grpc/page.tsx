"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { create } from "@bufbuild/protobuf";
import { gameStreamClient } from "@/lib/grpc/client";
import { WatchGameRequestSchema } from "@/lib/grpc/gen/homegame_pb";
import styles from "../live.module.css";

// ── Types matching the gRPC protobuf messages ──

interface GameInfo {
  id: string;
  name: string;
  icon: string;
  winnerRule: string;
  currentRound: number;
  status: string;
}

interface PlayerInfo {
  id: string;
  username: string;
}

interface ScoreRow {
  id: string;
  userId: string;
  username: string;
  round: number;
  value: number;
}

interface GameState {
  game: GameInfo | null;
  players: PlayerInfo[];
  scores: ScoreRow[];
}

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export default function GrpcLiveViewerPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    if (!token) return;

    // Clean up previous connection
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setStatus("connecting");

    try {
      const request = create(WatchGameRequestSchema, { token });

      for await (const event of gameStreamClient.watchGame(request, {
        signal: abort.signal,
      })) {
        const ev = event.event;
        if (!ev) continue;

        switch (ev.case) {
          case "init": {
            const snapshot = ev.value;
            const game = snapshot.game;
            setState({
              game: game
                ? {
                    id: game.id,
                    name: game.name,
                    icon: game.icon,
                    winnerRule: game.winnerRule,
                    currentRound: game.currentRound,
                    status: game.status,
                  }
                : null,
              players: snapshot.players.map((p) => ({
                id: p.id,
                username: p.username,
              })),
              scores: snapshot.scores.map((s) => ({
                id: s.id,
                userId: s.userId,
                username: s.username,
                round: s.round,
                value: s.value,
              })),
            });
            setStatus("connected");
            setError(null);
            break;
          }
          case "scoresUpdated":
          case "gameClosed":
          case "gameRestarted": {
            // Reconnect to get fresh state (same approach as SSE)
            abort.abort();
            setTimeout(() => connect(), 300);
            return;
          }
        }
      }
    } catch (e: unknown) {
      if (abort.signal.aborted) return; // intentional disconnect
      setStatus("disconnected");
      setError(e instanceof Error ? e.message : "Kapcsolodasi hiba");
      // Auto-reconnect
      setTimeout(() => connect(), 3000);
    }
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      abortRef.current?.abort();
    };
  }, [connect]);

  // ── Derived data ──

  const players = state?.players ?? [];
  const scores = state?.scores ?? [];
  const game = state?.game;

  // Group scores by round
  const rounds = useMemo(() => {
    const map = new Map<number, Map<string, number>>();
    for (const s of scores) {
      if (!map.has(s.round)) map.set(s.round, new Map());
      map.get(s.round)!.set(s.userId, s.value);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [scores]);

  // Totals per player
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of scores) {
      map.set(s.userId, (map.get(s.userId) ?? 0) + s.value);
    }
    return map;
  }, [scores]);

  // Winner/loser detection
  const { winnerId, loserId } = useMemo(() => {
    if (!game || totals.size === 0) return { winnerId: null, loserId: null };
    let best: { id: string; total: number } | null = null;
    let worst: { id: string; total: number } | null = null;
    for (const [id, total] of totals) {
      if (
        !best ||
        (game.winnerRule === "min" ? total < best.total : total > best.total)
      ) {
        best = { id, total };
      }
      if (
        !worst ||
        (game.winnerRule === "min" ? total > worst.total : total < worst.total)
      ) {
        worst = { id, total };
      }
    }
    return { winnerId: best?.id ?? null, loserId: worst?.id ?? null };
  }, [game, totals]);

  // ── Error states ──

  if (!token) {
    return (
      <div className={styles["center-msg"]}>
        <p>Ervenytelen megosztas link — hianyzo token.</p>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className={styles["center-msg"]}>
        <p>{error}</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className={styles["center-msg"]}>
        <Loader2 size={24} className={styles.spinner} />
        <p>Csatlakozas (gRPC)...</p>
      </div>
    );
  }

  return (
    <div className={styles["live-wrap"]}>
      {/* Header */}
      <div className={styles["live-hdr"]}>
        {game && (
          <>
            <span className={styles.icon}>{game.icon}</span>
            <h1>{game.name}</h1>
            <div className={styles["live-sub"]}>
              {game.winnerRule === "min" ? "Minimum nyer" : "Maximum nyer"}
              {" · "}
              {rounds.length} kor
              {" · "}
              <strong>gRPC</strong>
            </div>
            {game.status === "closed" && (
              <span className={styles["game-closed-badge"]}>Lezart</span>
            )}
          </>
        )}
      </div>

      {/* Connection status */}
      <div
        className={`${styles["status-bar"]} ${
          status === "connected"
            ? styles["status-connected"]
            : status === "connecting"
              ? styles["status-connecting"]
              : styles["status-disconnected"]
        }`}
      >
        <span className={styles["status-dot"]} />
        {status === "connected"
          ? "Elo (gRPC)"
          : status === "connecting"
            ? "Csatlakozas..."
            : "Kapcsolodas..."}
      </div>

      {/* Score table */}
      {players.length > 0 && (
        <div className={styles["tbl-wrap"]}>
          <div className={styles["scroll-hint"]}>
            <table className={styles["score-tbl"]}>
              <thead>
                <tr>
                  <th>Kor</th>
                  {players.map((p) => (
                    <th key={p.id}>{p.username}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Totals row */}
                <tr className={styles["total-row"]}>
                  <td>Ossz.</td>
                  {players.map((p) => {
                    const t = totals.get(p.id) ?? 0;
                    const cls =
                      p.id === winnerId
                        ? styles["winner-col"]
                        : p.id === loserId
                          ? styles["loser-col"]
                          : "";
                    return (
                      <td key={p.id} className={cls}>
                        {t}
                      </td>
                    );
                  })}
                </tr>

                {/* Score rows */}
                {rounds.map(([round, scoreMap]) => (
                  <tr key={round}>
                    <td>{round}.</td>
                    {players.map((p) => (
                      <td key={p.id}>{scoreMap.get(p.id) ?? "—"}</td>
                    ))}
                  </tr>
                ))}

                {rounds.length === 0 && (
                  <tr>
                    <td
                      colSpan={players.length + 1}
                      style={{
                        textAlign: "center",
                        padding: "24px",
                        color: "var(--slate-400)",
                      }}
                    >
                      Meg nincs pont
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
