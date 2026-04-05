"use client";

import { AtSign, Shield } from "lucide-react";
import Link from "next/link";
import styles from "./login.module.css";
import Input from "@/components/ui/input";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import { useTransition, useState } from "react";
import { handleStringChange } from "@/lib/utils";

export default function LoginPage() {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState("");
    const [password, setPassw] = useState("");

    const handleLogin = () => {
        setError(null);

        const vemail = email.trim();

        if (vemail == "" || password == "") {
            setError("Email és jelszó megadása kötelező");
            return;
        }

        startTransition(async () => {
            try {
                const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email,
                        password
                    })
                });

                if (res.ok) {
                    window.location.href = "/dashboard";
                } else {
                    let message = "Belépés sikertelen";
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
    }

    return (
        <Card
            heading="Belépés a fiókomba"
        >
            <div className={styles.fields} id="regForm">

                <Input
                    id={"email"}
                    title={"Email"}
                    type={"text"}
                    placeholder={"e.g. myemail@email.com"}
                    icon={<AtSign size={16} />}
                    value={email}
                    autoComplete="email"
                    onChange={handleStringChange(setEmail)}
                />

                <Input
                    id={"password"}
                    title={"Jelszó"}
                    type={"password"}
                    placeholder={"Legalább 8 karakter"}
                    icon={<Shield size={16} />}
                    value={password}
                    autoComplete="current-password"
                    onChange={handleStringChange(setPassw)}
                />

            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
                <Button
                    text="Belépés"
                    onClick={handleLogin}
                    disabled={isPending}
                />

                <p className={styles["login-link"]}>Még nincs fiókod? <Link href="/register">Regisztrálj</Link></p>
            </div>
        </Card>
    );
}
