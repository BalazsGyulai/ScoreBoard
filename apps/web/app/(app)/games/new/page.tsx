"use client";

import { useState } from "react";
import { Dices, Star } from "lucide-react";
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

export default function NewGamePage() {
    const [gameName, setGameName] = useState("");
    const [winnerRule, setWinnerRule] = useState("min");
    const [iconEmoji, setIconEmoji] = useState("");
    const [iconName, setIconName] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);

    const handleCreate = () => {
        if (!gameName.trim()) {
            alert("Add meg a játék nevét!");
            return;
        }
        // TODO: POST /api/games
        console.log({ gameName, winnerRule, iconEmoji });
    };

    return (
        <>
            <div className="view">
                <div className={styles.center}>
                    <Card heading="Új játék" subHeading="Hozz létre egy játékot.">
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

                        <div className={styles.actions}>
                            <Button text="Játék létrehozása" onClick={handleCreate} />
                        </div>
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
