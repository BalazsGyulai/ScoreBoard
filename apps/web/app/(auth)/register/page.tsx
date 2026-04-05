"use client";

import Link from "next/link";
import styles from "../login/login.module.css";
import Card from "@/components/ui/card";
import Input from "@/components/ui/input";
import Button from "@/components/ui/button";
import { User, AtSign, Shield, MoveRight } from "lucide-react";

export default function RegisterPage() {

    return (
        <Card
            heading="Fiók létrehozása"
            subHeading={`Már van fiókod? ${<Link href="#" className={styles["inline-link"]}>Lépj be {<MoveRight size={8} />}</Link>}`}
        >
            <div className={styles.fields} id="regForm">

                <Input
                    id={"username"}
                    title={"Felhasználónév"}
                    type={"text"}
                    placeholder={"e.g. kovacs.janos"}
                    icon={<User size={16} />}
                />

                <Input
                    id={"email"}
                    title={"Email"}
                    type={"text"}
                    placeholder={"e.g. myemail@email.com"}
                    icon={<AtSign size={16} />}
                />

                <Input
                    id={"password"}
                    title={"Jelszó"}
                    type={"password"}
                    placeholder={"Legalább 8 karakter"}
                    icon={<Shield size={16} />}
                />

                <Input
                    id={"password"}
                    title={"Jelszó"}
                    type={"password"}
                    placeholder={"Legalább 8 karakter"}
                    icon={<Shield size={16} />}
                />


                {/* <div className="field">
                    <label htmlFor="confirm">Jelszó megerősítése</label>
                    <div className="input-wrap">
                        <span className="icon">
                            {/* <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                        </span>
                        {/* <input type="password" id="confirm" placeholder="Ismételd meg a jelszót" oninput="checkMatch()" /> */}
                {/* <button type="button" className="toggle-pw" onClick="togglePw('confirm', this)" aria-label="Jelszó megjelenítése">
                            <svg id="eye-confirm" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                    </div>
                    <span className="hint" id="matchHint"></span>
                </div> */}

            </div>

            <div className={styles.actions}>
                <Button
                    text="Regisztráció"
                />

                <p className={styles["login-link"]}>Már van fiókod? <Link href="/login">Jelentkezz be</Link></p>
            </div>
        </Card>
    );
}
