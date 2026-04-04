import styles from '@/app/_components/linkbutton.module.css'

type ButtonProps = {
    type: React.ButtonHTMLAttributes<HTMLButtonElement>['type']
    text: string
    disabled?: boolean
    children?: React.ReactNode
}

export default function Button({ type, disabled, text, children }: ButtonProps) {
    return (

        <button
            type={type}
            className={` ${disabled ? styles.disabled : styles.enabled} ${styles.button}`}
        >
            {children}

            <span className={styles.text}>{text}</span>
        </button>

    )
}