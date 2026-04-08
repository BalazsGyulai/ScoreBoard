"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import styles from "./live.module.css";

// ── Types matching the SSE payload from Rust ──

interface GameInfo {
  id: string;
  name: string;
  icon: string;
  winner_rule: string; // "min" | "max"
  current_round: number;
  status: string; // "open" | "closed"
}

interface PlayerInfo {
  id: string;
  username: string;
}

interface ScoreRow {
  id: string;
  user_id: string;
  username: string;
  round: number;
  value: number;
}

interface GameState {
  game: GameInfo;
  players: PlayerInfo[];
  scores: ScoreRow[];
}

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export default function LiveViewerPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (!token) return;

    // Clean up previous connection
    esRef.current?.close();
    clearTimeout(reconnectTimer.current);
    setStatus("connecting");

    // Connect directly to the Rust API for SSE streaming.
    // Next.js rewrites buffer responses, which breaks SSE.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
    const es = new EventSource(`${apiUrl}/live/${token}/stream`);
    esRef.current = es;

    es.addEventListener("init", (e) => {
      try {
        const data: GameState = JSON.parse(e.data);
        setState(data);
        setStatus("connected");
        setError(null);
      } catch {
        setError("Hibas adat erkezett");
      }
    });

    es.addEventListener("update", (e) => {
      try {
        const event = JSON.parse(e.data);
        // On any update event, refetch full state by reconnecting.
        // This is simple and correct — the init event always sends full state.
        if (
          event.type === "scores_updated" ||
          event.type === "game_closed" ||
          event.type === "game_restarted"
        ) {
          es.close();
          // Small delay to let the server process the change
          reconnectTimer.current = setTimeout(connect, 300);
        }
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      es.close();
      setStatus("disconnected");
      // Auto-reconnect after 3 seconds
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      clearTimeout(reconnectTimer.current);
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
      map.get(s.round)!.set(s.user_id, s.value);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [scores]);

  // Totals per player
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of scores) {
      map.set(s.user_id, (map.get(s.user_id) ?? 0) + s.value);
    }
    return map;
  }, [scores]);

  // Winner/loser detection
  const { winnerId, loserId } = useMemo(() => {
    if (!game || totals.size === 0) return { winnerId: null, loserId: null };
    let best: { id: string; total: number } | null = null;
    let worst: { id: string; total: number } | null = null;
    for (const [id, total] of totals) {
      if (!best || (game.winner_rule === "min" ? total < best.total : total > best.total)) {
        best = { id, total };
      }
      if (!worst || (game.winner_rule === "min" ? total > worst.total : total < worst.total)) {
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
        <p>Csatlakozas...</p>
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
              {game.winner_rule === "min" ? "Minimum nyer" : "Maximum nyer"}
              {" · "}
              {rounds.length} kor
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
          ? "Elo"
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
                      style={{ textAlign: "center", padding: "24px", color: "var(--slate-400)" }}
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
