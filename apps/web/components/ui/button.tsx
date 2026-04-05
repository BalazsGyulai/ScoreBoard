import { Loader2 } from "lucide-react";
import type { MouseEventHandler, ReactElement } from "react"
import styles from "./button.module.css"

export default function Button({ text, onClick = () => { }, icon, disabled = false }: {
    text: string,
    onClick?: MouseEventHandler<HTMLButtonElement>,
    icon?: ReactElement<any, any>,
    disabled?: boolean
}) {
    return (
        <button className={
            styles["btn-primary"]}
            onClick={onClick}
            disabled={disabled}>
            {disabled ?
                <Loader2 size={18} className={styles.spinner} />
                :
                <>
                    {icon && icon}
                    {text}
                </>
            }
        </button>
    )
}