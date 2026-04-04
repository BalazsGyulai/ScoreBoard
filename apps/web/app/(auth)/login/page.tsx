"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./login.module.css";

export default function LoginPage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        startTransition(async () => {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            if (res.ok) {
                router.push("/dashboard");
                router.refresh();
            } else {
                const data = await res.json();
                setError(data.error ?? "Belépés sikertelen");
            }
        });
    };

    return (
        <div className={styles.page}>
            <form className={styles.form} onSubmit={handleSubmit}>
                <h1 className={styles.title}>Belépés</h1>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.field}>
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                    />
                </div>

                <div className={styles.field}>
                    <label htmlFor="password">Jelszó</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                    />
                </div>

                <div className={styles.actions}>
                    <button
                        type="submit"
                        className={styles.primaryBtn}
                        disabled={isPending || !email || !password}
                    >
                        {isPending ? "..." : "Belépés"}
                    </button>
                    <Link href="/register" className={styles.secondaryBtn}>
                        Regisztráció
                    </Link>
                </div>
            </form>
        </div>
    );
}
