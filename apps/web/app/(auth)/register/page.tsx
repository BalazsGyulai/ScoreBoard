"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./register.module.css";

export default function RegisterPage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");
    const [error, setError] = useState<string | null>(null);

    const passwordsMatch = password === password2 || password2 === "";
    const canSubmit = username && email && password.length >= 8 && password === password2;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        startTransition(async () => {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password, password2 }),
            });

            if (res.ok) {
                router.push("/dashboard");
                router.refresh();
            } else {
                const data = await res.json();
                setError(data.error ?? "Regisztráció sikertelen");
            }
        });
    };

    return (
        <div className={styles.page}>
            <form className={styles.form} onSubmit={handleSubmit}>
                <h1 className={styles.title}>Regisztráció</h1>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.field}>
                    <label htmlFor="username">Felhasználónév</label>
                    <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        autoComplete="username"
                    />
                </div>

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
                        minLength={8}
                        autoComplete="new-password"
                    />
                    <span className={styles.hint}>Legalább 8 karakter</span>
                </div>

                <div className={styles.field}>
                    <label htmlFor="password2">Jelszó újra</label>
                    <input
                        id="password2"
                        type="password"
                        value={password2}
                        onChange={(e) => setPassword2(e.target.value)}
                        required
                        autoComplete="new-password"
                        className={!passwordsMatch ? styles.inputError : ""}
                    />
                    {!passwordsMatch && (
                        <span className={styles.errorHint}>A jelszók nem egyeznek</span>
                    )}
                </div>

                <div className={styles.actions}>
                    <button
                        type="submit"
                        className={styles.primaryBtn}
                        disabled={isPending || !canSubmit}
                    >
                        {isPending ? "..." : "Regisztráció"}
                    </button>
                    <Link href="/login" className={styles.secondaryBtn}>
                        Belépés
                    </Link>
                </div>
            </form>
        </div>
    );
}
