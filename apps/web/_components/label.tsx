import styles from './label.module.css'

export default function label({htmlFor, text} : {
    htmlFor: string,
    text: string
}) {
    return (
        <label className={styles.label} htmlFor={htmlFor}>{text}</label>
    )
}