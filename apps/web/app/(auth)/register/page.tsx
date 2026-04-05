"use client";

import Link from "next/link";
import styles from "../login/login.module.css";
import Card from "@/components/ui/card";
import Input from "@/components/ui/input";
import Button from "@/components/ui/button";
import { User, AtSign, Shield, MoveRight } from "lucide-react";
import { useTransition, useState } from "react";
import { handleStringChange } from "@/lib/utils";

export default function RegisterPage() {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");

    const handleRegistration = () => {
        setError(null);

        const vusername = username.trim();
        const vemail = email.trim();

        if (vusername == "" || vemail == "" || password == "" || password2 == "") {
            setError("Minden mező kitöltése kötelező");
            return;
        }

        if (password !== password2) {
            setError("A jelszók nem egyeznek");
            return;
        }

        if (password.length < 8) {
            setError("A jelszónak legalább 8 karakter hosszúnak kell lennie");
            return;
        }

        startTransition(async () => {
            try {
                const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, email, password, password2 }),
                });

                if (res.ok) {
                    window.location.href = "/dashboard";
                } else {
                    let message = "Regisztráció sikertelen";
                    try {
                        const data = await res.json();
                        message = data.error ?? message;
                    } catch { }
                    setError(message);
                }
            } catch {
                setError("Nem sikerült csatlakozni a szerverhez");
            }
        })
    }

    return (
        <Card
            heading="Fiók létrehozása"
            subHeading={<>Már van fiókod?{" "}<Link href="#" className={styles["inline-link"]}>Lépj be {<MoveRight size={8} />}</Link></>}
        >
            <div className={styles.fields} id="regForm">

                <Input
                    id={"username"}
                    title={"Felhasználónév"}
                    type={"text"}
                    placeholder={"e.g. kovacs.janos"}
                    icon={<User size={16} />}
                    value={username}
                    onChange={handleStringChange(setUsername)}
                    autoComplete="username"
                />

                <Input
                    id={"email"}
                    title={"Email"}
                    type={"text"}
                    placeholder={"e.g. myemail@email.com"}
                    icon={<AtSign size={16} />}
                    value={email}
                    onChange={handleStringChange(setEmail)}
                    autoComplete="email"
                />

                <Input
                    id={"password"}
                    title={"Jelszó"}
                    type={"password"}
                    placeholder={"Legalább 8 karakter"}
                    icon={<Shield size={16} />}
                    value={password}
                    onChange={handleStringChange(setPassword)}
                    autoComplete="new-password"
                />

                <Input
                    id={"password2"}
                    title={"Jelszó"}
                    type={"password"}
                    placeholder={"Legalább 8 karakter"}
                    icon={<Shield size={16} />}
                    value={password2}
                    onChange={handleStringChange(setPassword2)}
                    autoComplete="new-password"
                />

            </div>

            <div className={styles.actions}>
                <Button
                    text="Regisztráció"
                    disabled={isPending}
                    onClick={handleRegistration}
                />

                <p className={styles["login-link"]}>Már van fiókod? <Link href="/login">Jelentkezz be</Link></p>
            </div>
        </Card>
    );
}
