import type { MouseEventHandler, ReactElement  } from "react"
import styles from "./button.module.css"

export default function Button({text, onClick = () => {}, icon}: {
    text: string,
    onClick?: MouseEventHandler<HTMLButtonElement>,
    icon?: ReactElement<any, any>
}) {
    return (
        <button className={styles["btn-primary"]} onClick={onClick}>
            {icon && icon}
            {text}
        </button>
    )
}