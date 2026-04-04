import styles from './input.module.css'

export default function Input({type, name, required, onChange, onBlur, error
}) {
    return (
        <input
            className={`${styles.input} ${error ? styles.error : ''}`}
            type={type}
            name={name}
            id={name}
            onChange={onChange}
            onBlur={onBlur}
            required={required}
        />
    )
}