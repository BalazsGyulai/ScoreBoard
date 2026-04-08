"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import useSWR from "swr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, X, Eye, Loader2, Plus, Copy, Check } from "lucide-react";
import type { ApiError, ApiGame, ApiPlayer, ApiScoreRow, ViewerTokenResponse } from "@/types/api";
import { readHiddenPlayerIds, writeHiddenPlayerIds } from "@/lib/playerVisibility";
import styles from "./sidebarSettings.module.css";

type MeResponse = { role: string };

export default function SidebarSettins({
    onClose = () => { },
}: {
    onClose?: React.MouseEventHandler<HTMLElement>;
}) {
    const pathname = usePathname();
    const [visibility, setVisibility] = useState<Record<string, boolean>>({});
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const { data: me } = useSWR<MeResponse>("/api/auth/me", fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
    });
    const canAddPlayer = me?.role === "leader";
    const [shareLoading, setShareLoading] = useState(false);
    const [shareData, setShareData] = useState<{ sharing: boolean; token?: string; share_url?: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const {
        data: players,
        isLoading: playersLoading,
        error: playersError,
    } = useSWR<ApiPlayer[]>("/api/players", fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
    });
    const { data: games } = useSWR<ApiGame[]>("/api/games", fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
    });

    const activeGame = useMemo(() => {
        const pathParts = pathname.split("/").filter(Boolean);
        const gameNameIdx = pathParts.findIndex((part) => part === "games");
        const gameSlugFromUrl = gameNameIdx >= 0 ? decodeURIComponent(pathParts[gameNameIdx + 1] ?? "") : "";

        const slugify = (name: string) => name.trim().toLowerCase();
        const gameFromSubgamePage =
            gameSlugFromUrl.length > 0
                ? games?.find((game) => slugify(game.name) === slugify(gameSlugFromUrl))
                : undefined;

        return gameFromSubgamePage ?? games?.find((game) => game.status === "open") ?? null;
    }, [games, pathname]);

    const {
        data: scoreRows,
    } = useSWR<ApiScoreRow[]>(
        activeGame ? `/api/games/${activeGame.id}/scores` : null,
        fetchJson,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: false,
            revalidateIfStale: false,
        },
    );

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
    const visiblePlayers = orderedPlayers.filter((p) => visibility[p.id] ?? true);
    const totalRounds = scoreRows ? new Set(scoreRows.map((s) => s.round)).size : 0;

    const winnerPreview = useMemo(() => {
        if (!activeGame || !scoreRows || scoreRows.length === 0 || visiblePlayers.length === 0) {
            return "Még nincs pont";
        }

        const totals = new Map<string, number>();
        for (const row of scoreRows) {
            totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.value);
        }

        const scoredVisiblePlayers = visiblePlayers
            .map((player) => ({
                username: player.username,
                total: totals.get(player.id),
            }))
            .filter((player) => typeof player.total === "number") as { username: string; total: number }[];

        if (scoredVisiblePlayers.length === 0) {
            return "Még nincs pont";
        }

        const leader = scoredVisiblePlayers.reduce((best, current) => {
            if (activeGame.winner_rule === "min") {
                return current.total < best.total ? current : best;
            }
            return current.total > best.total ? current : best;
        });

        const ruleText = activeGame.winner_rule === "min" ? "minimum" : "maximum";
        return `${leader.username} (${leader.total} pont, ${ruleText})`;
    }, [activeGame, scoreRows, visiblePlayers]);

    const formattedCreatedAt = activeGame
        ? new Date(activeGame.created_at).toLocaleDateString("hu-HU")
        : "—";

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

    // ── Sharing ──
    useEffect(() => {
        if (!activeGame || !canAddPlayer) {
            setShareData(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/games/${activeGame.id}/share`, {
                    credentials: "include",
                });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setShareData(data);
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [activeGame, canAddPlayer]);

    async function toggleSharing() {
        if (!activeGame || shareLoading) return;
        setShareLoading(true);
        try {
            if (shareData?.sharing) {
                await fetch(`/api/games/${activeGame.id}/share`, {
                    method: "DELETE",
                    credentials: "include",
                });
                setShareData({ sharing: false });
            } else {
                const res = await fetch(`/api/games/${activeGame.id}/share`, {
                    method: "POST",
                    credentials: "include",
                });
                if (res.ok) {
                    const data = await res.json();
                    setShareData({ sharing: true, token: data.token, share_url: data.share_url });
                }
            }
        } catch { /* ignore */ }
        setShareLoading(false);
    }

    function copyShareUrl() {
        if (!shareData?.share_url) return;
        const fullUrl = `${window.location.origin}${shareData.share_url}`;
        navigator.clipboard.writeText(fullUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
                        {canAddPlayer && (
                            <Link
                                href="/players/new"
                                className={styles["pt-eye"]}
                                title="Új játékos"
                                aria-label="Új játékos"
                            >
                                <Plus size={14} />
                            </Link>
                        )}
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
                <div className={styles["active-section"]}>
                    <div className={styles["s-label"]}>Aktív játék adatai</div>
                    <div className={styles["s-row"]}>
                        <span className={styles["s-row-name"]}>Játék</span>
                        <span className={`${styles["s-row-val"]} ${styles.orange}`}>
                            {activeGame ? `${activeGame.icon} ${activeGame.name}` : "Nincs aktív játék"}
                        </span>
                    </div>
                    <div className={styles["s-row"]}>
                        <span className={styles["s-row-name"]}>Szabály</span>
                        <span className={styles["s-row-val"]}>
                            {activeGame ? (activeGame.winner_rule === "min" ? "Minimum nyer" : "Maximum nyer") : "—"}
                        </span>
                    </div>
                    <div className={styles["s-row"]}>
                        <span className={styles["s-row-name"]}>Dátum</span>
                        <span className={styles["s-row-val"]}>{formattedCreatedAt}</span>
                    </div>
                    <div className={styles["s-row"]}>
                        <span className={styles["s-row-name"]}>Körök</span>
                        <span className={styles["s-row-val"]}>{totalRounds}</span>
                    </div>
                    <div className={styles["s-row"]}>
                        <span className={styles["s-row-name"]}>Várható győztes</span>
                        <span className={styles["s-row-val"]}>{winnerPreview}</span>
                    </div>
                </div>

                {/* ── Sharing ── */}
                {activeGame && canAddPlayer && (
                    <div className={styles["share-section"]}>
                        <div className={styles["s-label"]}>Megosztas</div>
                        <div className={styles["share-toggle-row"]}>
                            <span className={styles["share-toggle-label"]}>
                                {shareData?.sharing && <span className={styles["share-dot"]} />}
                                {shareData?.sharing ? "Megosztva" : "Nincs megosztva"}
                            </span>
                            <button
                                className={`${styles.toggle} ${shareData?.sharing ? styles.on : ""}`}
                                onClick={toggleSharing}
                                disabled={shareLoading}
                                title={shareData?.sharing ? "Megosztas kikapcsolasa" : "Megosztas bekapcsolasa"}
                            />
                        </div>
                        {shareData?.sharing && shareData.share_url && (
                            <div className={styles["share-url-box"]}>
                                <span className={styles["share-url-text"]}>
                                    {`${typeof window !== "undefined" ? window.location.origin : ""}${shareData.share_url}`}
                                </span>
                                <button
                                    className={`${styles["share-copy-btn"]} ${copied ? styles.copied : ""}`}
                                    onClick={copyShareUrl}
                                    title="Link masolasa"
                                >
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                </button>
                            </div>
                        )}
                    </div>
                )}

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
                            isPending ? <Loader2 size={18} className={styles.spinner} /> : <>
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
