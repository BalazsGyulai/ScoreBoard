"use client";

import { useState, useTransition } from "react";
import { Dices, Star } from "lucide-react";
import useSWR, { mutate } from "swr";
import Card from "@/components/ui/card";
import Input from "@/components/ui/input";
import Dropdown from "@/components/ui/dropdown";
import IconPicker from "@/components/ui/iconPicker";
import Button from "@/components/ui/button";
import { handleStringChange } from "@/lib/utils";
import styles from "./new.module.css";

const winnerRuleOptions = [
    {
        value: "min",
        label: "Kevesebb pont nyer",
        icon: <Star size={14} />,
        badge: "Minimum",
        badgeColor: "green" as const,
    },
    {
        value: "max",
        label: "Több pont nyer",
        icon: <Star size={14} />,
        badge: "Maximum",
        badgeColor: "amber" as const,
    },
];

type MeResponse = { role: string };

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(`Hiba (${res.status})`);
    }
    return res.json() as Promise<T>;
}

export default function NewGamePage() {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [gameName, setGameName] = useState("");
    const [winnerRule, setWinnerRule] = useState("min");
    const [iconEmoji, setIconEmoji] = useState("");
    const [iconName, setIconName] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);
    const { data: me, isLoading: meLoading } = useSWR<MeResponse>("/api/auth/me", fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
    });
    const canCreate = me?.role === "leader";

    const handleCreate = () => {
        setError(null);

        if (!gameName.trim()) {
            setError("Adja meg a játék nevét.");
            return;
        }

        if (!iconEmoji.trim()) {
            setError("Adja meg a játék iconját.");
            return;
        }

        if (!winnerRule.trim()) {
            setError("Adja meg a játék iconját.");
            return;
        }

        startTransition(async () => {
            try {
                const res = await fetch("/api/games", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        name: gameName.trim(),
                        winner_rule: winnerRule.trim(),
                        icon: iconEmoji.trim()
                    })
                });

                if (res.ok) {
                    // Refresh the cached games list once, so the /games page shows the new one.
                    void mutate("/api/games");
                    window.location.href = "/games";
                } else {
                    let message = "Játék létrehozása";
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
        });


    };

    return (
        <>
            <div className="view">
                <div className={styles.center}>
                    <Card heading="Új játék" subHeading="Hozz létre egy játékot.">
                        {meLoading ? (
                            <p>Betöltés...</p>
                        ) : !canCreate ? (
                            <p className={styles.error}>Csak a leader hozhat létre új játékot.</p>
                        ) : (
                            <>
                        <div className={styles.fields}>
                            <Input
                                id="gameName"
                                title="Játék neve"
                                type="text"
                                placeholder="e.g. Sakk"
                                icon={<Dices size={16} />}
                                value={gameName}
                                onChange={handleStringChange(setGameName)}
                            />

                            {/* Icon picker trigger styled as a field */}
                            <div className={styles.field}>
                                <label className={styles.label}>Játék ikonja</label>
                                <button
                                    type="button"
                                    className={styles.iconTrigger}
                                    onClick={() => setPickerOpen(true)}
                                >
                                    <span className={styles.iconPreview}>
                                        {iconEmoji || "?"}
                                    </span>
                                    <span className={iconName ? styles.iconLabel : styles.iconPlaceholder}>
                                        {iconName || "Válassz ikont..."}
                                    </span>
                                    <span className={styles.iconArrow}>▼</span>
                                </button>
                            </div>

                            <Dropdown
                                id="winnerRule"
                                title="Győztes feltétel"
                                options={winnerRuleOptions}
                                value={winnerRule}
                                onChange={setWinnerRule}
                            />
                        </div>

                        {error && <p className={styles.error}>{error}</p>}

                        <div className={styles.actions}>
                            <Button text="Játék létrehozása" onClick={handleCreate} disabled={isPending} />
                        </div>
                            </>
                        )}
                    </Card>
                </div>

            </div>
            <IconPicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                value={iconEmoji}
                onChange={(emoji, name) => {
                    setIconEmoji(emoji);
                    setIconName(name);
                }}
            />
        </>
    );
}
