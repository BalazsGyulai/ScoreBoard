"use client";

import {useState} from "react"
import styles from "./input.module.css"
import { Eye, EyeOff } from "lucide-react";

export default function Input({ id, title, placeholder, icon, type, autoComplete }: {
    id: string,
    type: string,
    title: string,
    placeholder: string,
    icon?: React.ReactElement<any, any>,
    autoComplete?: string,
}) {
    const isPasswordField = type === "password";
    const [showPassword, setShowPassword] = useState(false);
    const inputType = isPasswordField && showPassword ? "text" : type;

    return (
        <div className={styles.field}>
            <label className={styles.label} htmlFor={id}>{title}</label>
            <div className={styles["input-wrap"]}>
                {icon && <span className={styles.icon}>{icon}</span>}

                <input
                    className={styles.input}
                    type={inputType}
                    id={id}
                    placeholder={placeholder}
                    {...(autoComplete && { autoComplete })}
                />

                {isPasswordField && (
                    <button
                        type="button"
                        className={styles["toggle-pw"]}
                        onClick={() => setShowPassword(prev => !prev)}
                        aria-label={showPassword ? "Jelszó elrejtése" : "Jelszó megjelenítése"}
                        tabIndex={-1}
                    >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                )}
            </div>
        </div>
    );
}