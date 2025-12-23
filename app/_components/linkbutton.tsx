import Link from 'next/link'
import styles from '@/app/_components/linkbutton.module.css'

type ButtonProps = {
    type: React.ButtonHTMLAttributes<HTMLButtonElement>['type']
    text: string
    href: string
    disabled?: boolean
    children?: React.ReactNode
}

export default function LinkButton({type, disabled, text, children, href}: ButtonProps) {
    return (
        <Link href={href}>
        <button
            type={type}
            className={`${styles.button} ${disabled ? styles.disabled : ""}`}
            >
            {children}

            <span className={styles.text}>{text}</span>
        </button>
        </Link>
    )
}