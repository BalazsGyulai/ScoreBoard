"use client";

import { fetchJson } from "@/lib/api/client";

import Link from "next/link";
import styles from "./games.module.css";
import type { ApiGame } from "@/types/api";
import useSWR from "swr";

const GAMES_CACHE_KEY = "/api/games";


export default function GamesPage() {
    const { data: games, isLoading, error } = useSWR<ApiGame[]>(
        GAMES_CACHE_KEY,
        fetchJson,
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
                    // games in progress first, then alphabetical
                    [...games]
                        .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name, "hu") : a.status === "open" ? -1 : 1))
                        .map((g) => (
                        <Link
                            href={`/games/${encodeURIComponent(g.name.toLowerCase())}`}
                            key={g.id}
                            className={`${styles.card} ${styles["game-card"]}`}
                        >
                            <div className={styles["game-card-icon"]}>{g.icon}</div>
                            <h3>{g.name}</h3>
                            <div className={styles["gc-meta"]}>
                                {g.status === "open"
                                    ? g.current_round > 1
                                        ? `${g.current_round - 1} kör lejátszva`
                                        : "Még nincs kör"
                                    : "Lezárva"}{" "}
                                · {g.winner_rule === "min" ? "kevesebb nyer" : "több nyer"}
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
