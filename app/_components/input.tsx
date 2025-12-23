import styles from './input.module.css'

export default function Input({type, name, required}: {
    type: string,
    name: string,
    required?: boolean
}) {
    return (
        <input
            className={styles.input}
            type={type}
            name={name}
            // value={username}
            // onChange={nameChangeHandler}
            required={required}
        />
    )
}