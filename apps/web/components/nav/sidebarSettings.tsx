"use client";

import { useState, useTransition } from "react";
import { LogOut, X, Eye, Loader2 } from "lucide-react";
import { players, avatarColors } from "@/lib/mockData";
import styles from "./sidebarSettings.module.css";

export default function SidebarSettins({
    onClose = () => { },
}: {
    onClose?: React.MouseEventHandler<HTMLElement>;
}) {
    const [visibility, setVisibility] = useState<boolean[]>(
        players.map(() => true),
    );
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function togglePlayer(idx: number) {
        setVisibility((prev) => {
            const next = [...prev];
            next[idx] = !next[idx];
            return next;
        });
    }

    const handleSignOut = () => {
        setError(null);

        startTransition(async () => {
            try {
                const res = await fetch("/api/auth/logout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
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
                    <div className={styles["s-label"]}>Játékosok</div>
                    {players.map((p, i) => (
                        <>
                        <div className={styles["pt-row"]} key={p.id}>
                            <div
                                className={`${styles.avatar} ${styles.av36}`}
                                style={{
                                    background: avatarColors[i],
                                    color: "#fff",
                                }}
                            >
                                {p.name[0]}
                            </div>
                            <div className={styles["pt-name"]}>{p.name}</div>
                            <button
                                className={`${styles["pt-eye"]} ${visibility[i] ? styles.on : ""}`}
                                title="Megjelenítés"
                                onClick={() => togglePlayer(i)}
                            >
                                <Eye size={12} />
                            </button>
                        </div>
                        </>
                    ))}
                </div>

                {/* ── Active game info ── */}
                <div className={styles["active-section"]}>
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
                </div>

                {/* ── Actions ── */}
                <div className={styles.actions}>
                    <button
                        className={`${styles.btn} ${styles["btn-dark"]}`}
                        onClick={onClose}
                    >
                        Mentés &amp; bezárás
                    </button>
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
