"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./dropdown.module.css";

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  badgeColor?: "green" | "amber";
}

export default function Dropdown({
  id,
  title,
  options,
  value,
  onChange,
  placeholder = "Válassz...",
}: {
  id: string;
  title: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className={styles.field} ref={ref}>
      <label className={styles.label} htmlFor={id}>
        {title}
      </label>
      <button
        type="button"
        id={id}
        className={`${styles.trigger} ${open ? styles.open : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={styles["trigger-content"]}>
          {selected ? (
            <>
              {selected.icon && (
                <span className={styles["trigger-icon"]}>{selected.icon}</span>
              )}
              <span>{selected.label}</span>
              {selected.badge && (
                <span
                  className={`${styles.badge} ${styles[`badge-${selected.badgeColor ?? "green"}`]}`}
                >
                  {selected.badge}
                </span>
              )}
            </>
          ) : (
            <span className={styles.placeholder}>{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={`${styles.chevron} ${open ? styles["chevron-open"] : ""}`}
        />
      </button>

      {open && (
        <div className={styles.menu}>
          {options.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={`${styles.option} ${opt.value === value ? styles["option-active"] : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.icon && (
                <span className={styles["option-icon"]}>{opt.icon}</span>
              )}
              <span className={styles["option-label"]}>{opt.label}</span>
              {opt.badge && (
                <span
                  className={`${styles.badge} ${styles[`badge-${opt.badgeColor ?? "green"}`]}`}
                >
                  {opt.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
