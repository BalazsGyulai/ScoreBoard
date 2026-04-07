"use client";

import Link from "next/link";
import styles from "./games.module.css";
import type { ApiGame, ApiError } from "@/types/api";
import useSWR from "swr";

const GAMES_CACHE_KEY = "/api/games";

async function fetchGames(url: string): Promise<ApiGame[]> {
    const res = await fetch(url, {
        method: "GET",
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
        throw new Error(message);
    }

    return res.json() as Promise<ApiGame[]>;
}

export default function GamesPage() {
    const { data: games, isLoading, error } = useSWR<ApiGame[]>(
        GAMES_CACHE_KEY,
        fetchGames,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: false,
            revalidateIfStale: false,
            dedupingInterval: 60_000,
        },
    );

    return (
        <div className="view">
            <div className={styles["dash-top"]}>
                <h1>Játékok</h1>
                <p>Válassz egy meccset, vagy indíts újat a + gombbal</p>
            </div>
            <div className={styles["games-grid"]}>
                {isLoading ? (
                    <div style={{ color: "var(--slate-500)", fontSize: 14 }}>
                        Betöltés...
                    </div>
                ) : error ? (
                    <div style={{ color: "var(--danger)", fontSize: 14 }}>
                        {(error as Error).message || "Hiba történt"}
                    </div>
                ) : !games || games.length === 0 ? (
                    <div style={{ color: "var(--slate-500)", fontSize: 14 }}>
                        Még nincs játék. Hozz létre egyet a + gombbal.
                    </div>
                ) : (
                    games.map((g) => (
                        <Link
                            href={`/games/${encodeURIComponent(g.name.toLowerCase())}`}
                            key={g.id}
                            className={`${styles.card} ${styles["game-card"]}`}
                        >
                            <div className={styles["game-card-icon"]}>{g.icon}</div>
                            <h3>{g.name}</h3>
                            <div className={styles["gc-meta"]}>
                                Kör: {g.current_round} · Szabály:{" "}
                                {g.winner_rule === "min" ? "Minimum" : "Maximum"}
                            </div>
                            <span className={`${styles.badge} ${g.status === "closed" ? styles["badge-green"] : styles["badge-amber"]}`}>
                                {g.status === "closed" ? "✓ Lezárt" : "● Aktív"}
                                
                            </span>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
