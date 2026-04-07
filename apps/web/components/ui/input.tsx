"use client";

import {useState} from "react"
import styles from "./input.module.css"
import { Eye, EyeOff } from "lucide-react";

export default function Input({ id, title, placeholder = "", icon, type = "text", autoComplete, value, defaultValue, onChange, onBlur, onKeyDown, autoFocus, min, className, naked, inputRef }: {
    id: string,
    type?: string,
    title?: string,
    placeholder?: string,
    icon?: React.ReactElement<any, any>,
    autoComplete?: string,
    value?: string,
    defaultValue?: string | number,
    onChange?: React.ChangeEventHandler<HTMLInputElement>,
    onBlur?: React.FocusEventHandler<HTMLInputElement>,
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>,
    autoFocus?: boolean,
    min?: number,
    className?: string,
    naked?: boolean,
    inputRef?: React.Ref<HTMLInputElement>,
}) {
    const isPasswordField = type === "password";
    const [showPassword, setShowPassword] = useState(false);
    const inputType = isPasswordField && showPassword ? "text" : type;

    const inputEl = (
        <input
            ref={inputRef}
            className={naked ? className : styles.input}
            type={inputType}
            id={id}
            placeholder={placeholder}
            {...(autoComplete && { autoComplete })}
            {...(value !== undefined && { value })}
            {...(defaultValue !== undefined && { defaultValue })}
            {...(onChange && { onChange })}
            {...(onBlur && { onBlur })}
            {...(onKeyDown && { onKeyDown })}
            {...(autoFocus && { autoFocus })}
            {...(min !== undefined && { min })}
        />
    );

    if (naked) return inputEl;

    return (
        <div className={styles.field}>
            {title && <label className={styles.label} htmlFor={id}>{title}</label>}
            <div className={styles["input-wrap"]}>
                {icon && <span className={styles.icon}>{icon}</span>}

                {inputEl}

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