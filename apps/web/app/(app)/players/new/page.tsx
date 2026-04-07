"use client";

import { useState, useTransition } from "react";
import { User, AtSign, Shield } from "lucide-react";
import { mutate } from "swr";
import Card from "@/components/ui/card";
import Input from "@/components/ui/input";
import Button from "@/components/ui/button";
import { handleStringChange } from "@/lib/utils";
import styles from "../../games/new/new.module.css";

export default function NewPlayerPage() {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");

    const handleCreate = () => {
        setError(null);

        if (!username.trim() || !email.trim() || !password || !password2) {
            setError("Minden mező kitöltése kötelező.");
            return;
        }

        if (password !== password2) {
            setError("A jelszók nem egyeznek.");
            return;
        }

        if (password.length < 8) {
            setError("A jelszónak legalább 8 karakter hosszúnak kell lennie.");
            return;
        }

        startTransition(async () => {
            try {
                const res = await fetch("/api/players", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        username: username.trim(),
                        email: email.trim(),
                        password,
                    }),
                });

                if (res.ok) {
                    void mutate("/api/players");
                    window.location.href = "/dashboard";
                } else {
                    let message = "Játékos hozzáadása sikertelen";
                    try {
                        const data = await res.json();
                        message = data.error ?? message;
                    } catch {}
                    setError(message);
                }
            } catch {
                setError("Nem sikerült csatlakozni a szerverhez");
            }
        });
    };

    return (
        <div className="view">
            <div className={styles.center}>
                <Card heading="Új játékos" subHeading="Adj hozzá egy új játékost a csoporthoz.">
                    <div className={styles.fields}>
                        <Input
                            id="username"
                            title="Felhasználónév"
                            type="text"
                            placeholder="e.g. kovacs.janos"
                            icon={<User size={16} />}
                            value={username}
                            onChange={handleStringChange(setUsername)}
                        />

                        <Input
                            id="email"
                            title="Email"
                            type="email"
                            placeholder="e.g. myemail@email.com"
                            icon={<AtSign size={16} />}
                            value={email}
                            onChange={handleStringChange(setEmail)}
                        />

                        <Input
                            id="password"
                            title="Jelszó"
                            type="password"
                            placeholder="Legalább 8 karakter"
                            icon={<Shield size={16} />}
                            value={password}
                            onChange={handleStringChange(setPassword)}
                        />

                        <Input
                            id="password2"
                            title="Jelszó megerősítése"
                            type="password"
                            placeholder="Legalább 8 karakter"
                            icon={<Shield size={16} />}
                            value={password2}
                            onChange={handleStringChange(setPassword2)}
                        />
                    </div>

                    {error && <p className={styles.error}>{error}</p>}

                    <div className={styles.actions}>
                        <Button text="Játékos hozzáadása" onClick={handleCreate} disabled={isPending} />
                    </div>
                </Card>
            </div>
        </div>
    );
}
