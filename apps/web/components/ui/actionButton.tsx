import type { MouseEventHandler, ReactElement } from "react";
import styles from "./actionButton.module.css";

type Variant = "ghost" | "dark" | "amber" | "danger";

export default function ActionButton({
  text,
  onClick,
  icon,
  disabled = false,
  variant = "ghost",
  size,
}: {
  text: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  icon?: ReactElement;
  disabled?: boolean;
  variant?: Variant;
  size?: "sm";
}) {
  const cls = [
    styles.btn,
    styles[`btn-${variant}`],
    size === "sm" ? styles["btn-sm"] : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      {icon}
      {text}
    </button>
  );
}
