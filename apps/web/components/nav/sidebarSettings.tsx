"use client";

import { useEffect, useState, useTransition } from "react";
import useSWR from "swr";
import Link from "next/link";
import { LogOut, X, Eye, Loader2, Plus } from "lucide-react";
import type { ApiError, ApiPlayer } from "@/types/api";
import { readHiddenPlayerIds, writeHiddenPlayerIds } from "@/lib/playerVisibility";
import styles from "./sidebarSettings.module.css";

export default function SidebarSettins({
    onClose = () => { },
}: {
    onClose?: React.MouseEventHandler<HTMLElement>;
}) {
    const [visibility, setVisibility] = useState<Record<string, boolean>>({});
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const {
        data: players,
        isLoading: playersLoading,
        error: playersError,
    } = useSWR<ApiPlayer[]>("/api/players", fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
    });

    useEffect(() => {
        if (!players?.length) return;
        const hiddenIds = readHiddenPlayerIds();
        setVisibility((prev) => {
            const next: Record<string, boolean> = {};
            for (const p of players) {
                next[p.id] = prev[p.id] ?? !hiddenIds.has(p.id);
            }
            return next;
        });
    }, [players]);

    const orderedPlayers = (players ?? []).slice().sort((a, b) =>
        a.username.localeCompare(b.username, "hu"),
    );

    function togglePlayer(userId: string) {
        setVisibility((prev) => {
            const next = { ...prev };
            next[userId] = !next[userId];
            const hiddenIds = new Set<string>(
                Object.entries(next)
                    .filter(([, isVisible]) => !isVisible)
                    .map(([id]) => id),
            );
            writeHiddenPlayerIds(hiddenIds);
            return next;
        });
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

    const handleSignOut = () => {
        setError(null);

        startTransition(async () => {
            try {
                const res = await fetch("/api/auth/logout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                            credentials: "include",
                });

                if (res.ok) {
                    window.location.href = "/login";
                } else {
                    let message = "Kilépés sikertelen";
                    try {
                        const data = await res.json();
                        message = data.error ?? message;
                    } catch {

                    }

                    setError(message);
                }
            } catch {
                setError("Nem sikerült csatlakozni a szerverhez");
            }
        })
    }


    return (
        <div
            className={`${styles["settings-overlay"]} ${styles.open}`}
        >
            <div className={styles["settings-bd"]} onClick={onClose} />
            <div className={styles["settings-panel"]}>
                <button className={styles["settings-close"]} onClick={onClose}>
                    <X size={13} />
                </button>
                <h2>Beállítások</h2>


                {/* ── Players ── */}
                <div className={styles["s-section"]}>
                    <div className={styles["s-label"]}>
                        <span>Játékosok</span>
                        <Link
                            href="/players/new"
                            className={styles["pt-eye"]}
                            title="Új játékos"
                            aria-label="Új játékos"
                        >
                            <Plus size={14} />
                        </Link>
                    </div>
                    {playersLoading ? (
                        <div className={styles["pt-row"]}>
                            <Loader2 size={14} className={styles.spinner} />
                            <div className={styles["pt-name"]}>Játékosok betöltése...</div>
                        </div>
                    ) : playersError ? (
                        <div className={styles["pt-row"]}>
                            <div className={styles["pt-name"]}>
                                {(playersError as Error).message || "Nem sikerült betölteni a játékosokat"}
                            </div>
                        </div>
                    ) : orderedPlayers.map((p, i) => (
                        <div className={styles["pt-row"]} key={p.id}>
                            <div
                                className={`${styles.avatar} ${styles.av36}`}
                                style={{
                                    background: "#94A3B8",
                                    color: "#fff",
                                }}
                            >
                                {p.username[0]?.toUpperCase() ?? "?"}
                            </div>
                            <div className={styles["pt-name"]}>{p.username}</div>
                            <button
                                className={`${styles["pt-eye"]} ${visibility[p.id] ? styles.on : ""}`}
                                title="Megjelenítés"
                                onClick={() => togglePlayer(p.id)}
                            >
                                <Eye size={12} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* ── Active game info ── */}
                {/* <div className={styles["active-section"]}>
                    <div className={styles["s-label"]}>Aktív játék adatai</div>
                    <div className={styles["s-row"]}>
                        <span className={styles["s-row-name"]}>Játék</span>
                        <span className={`${styles["s-row-val"]} ${styles.orange}`}>
                            Skyjo
                        </span>
                    </div>
                    <div className={styles["s-row"]}>
                        <span className={styles["s-row-name"]}>Ponthatár</span>
                        <span className={styles["s-row-val"]}>100 pont</span>
                    </div>
                    <div className={styles["s-row"]}>
                        <span className={styles["s-row-name"]}>Dátum</span>
                        <span className={styles["s-row-val"]}>2026.04.05</span>
                    </div>
                    <div className={styles["s-row"]}>
                        <span className={styles["s-row-name"]}>Körök</span>
                        <span className={styles["s-row-val"]}>4</span>
                    </div>
                </div> */}

                {/* ── Actions ── */}
                <div className={styles.actions}>
                    {/* <button
                        className={`${styles.btn} ${styles["btn-dark"]}`}
                        onClick={onClose}
                    >
                        Mentés &amp; bezárás
                    </button> */}
                    <button onClick={() => handleSignOut()} className={`${styles.btn} ${styles["btn-danger"]}`}>
                        {
                            isPending ? <Loader2 size={18} className={styles.spinner}/> : <>
                                <LogOut size={13} />
                                Kijelentkezés
                            </>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
