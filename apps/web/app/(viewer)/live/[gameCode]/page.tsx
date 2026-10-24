"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import styles from "./live.module.css";

// ── Types matching the live state payload from Rust ──

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

type ConnectionStatus = "connecting" | "connected" | "polling";

// While the live stream is down, poll the read-only state endpoint instead.
const POLL_MS = 5_000;
const RECONNECT_MIN_MS = 3_000;
const RECONNECT_MAX_MS = 30_000;

export default function LiveViewerPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectDelay = useRef(RECONNECT_MIN_MS);

  // Same-origin endpoints (app/api/live/*) — no direct connection to the API needed.
  const base = token ? `/api/live/${encodeURIComponent(token)}` : null;

  const loadState = useCallback(async () => {
    if (!base) return;
    try {
      const res = await fetch(`${base}/state`, { cache: "no-store" });
      if (res.status === 404) {
        setError("A megosztás lejárt vagy ki lett kapcsolva.");
        setState(null);
        return;
      }
      if (!res.ok) return;
      setState((await res.json()) as GameState);
      setError(null);
    } catch {
      // offline — keep showing the last known state
    }
  }, [base]);

  const connect = useCallback(() => {
    if (!base) return;

    esRef.current?.close();
    clearTimeout(reconnectTimer.current);
    setStatus((prev) => (prev === "polling" ? prev : "connecting"));

    const es = new EventSource(`${base}/stream`);
    esRef.current = es;

    es.addEventListener("init", (e) => {
      try {
        setState(JSON.parse((e as MessageEvent).data) as GameState);
        setStatus("connected");
        setError(null);
        reconnectDelay.current = RECONNECT_MIN_MS;
      } catch {
        setError("Hibás adat érkezett");
      }
    });

    // Every update event means "something changed": fetch the fresh snapshot.
    es.addEventListener("update", () => {
      void loadState();
    });

    es.onerror = () => {
      es.close();
      setStatus("polling");
      void loadState();
      reconnectTimer.current = setTimeout(connect, reconnectDelay.current);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS);
    };
  }, [base, loadState]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  // Polling fallback while the stream is not connected.
  useEffect(() => {
    if (status === "connected" || !base) return;
    const id = setInterval(() => void loadState(), POLL_MS);
    return () => clearInterval(id);
  }, [status, base, loadState]);

  // Phones suspend background tabs: refresh immediately when the viewer comes back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadState();
      if (esRef.current?.readyState !== EventSource.OPEN) connect();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [connect, loadState]);

  // ── Derived data ──

  const game = state?.game;
  const players = useMemo(() => state?.players ?? [], [state]);
  const scores = useMemo(() => state?.scores ?? [], [state]);

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
        <p>Érvénytelen megosztási link — hiányzó token.</p>
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
        <p>Csatlakozás...</p>
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
              {rounds.length} kör
            </div>
            {game.status === "closed" && (
              <span className={styles["game-closed-badge"]}>Lezárt — végeredmény</span>
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
        role="status"
      >
        <span className={styles["status-dot"]} />
        {status === "connected"
          ? "Élő"
          : status === "connecting"
            ? "Csatlakozás..."
            : "Újracsatlakozás... (frissítés 5 mp-enként)"}
      </div>

      {/* Score table */}
      {players.length === 0 ? (
        <p className={styles["empty-msg"]}>Még nincs pont rögzítve.</p>
      ) : (
        <div className={styles["tbl-wrap"]} data-table-scroll>
          <table className={styles["score-tbl"]}>
            <thead>
              <tr>
                <th>Kör</th>
                {players.map((p) => (
                  <th key={p.id}>{p.username}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Totals row */}
              <tr className={styles["total-row"]}>
                <td>Össz.</td>
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
