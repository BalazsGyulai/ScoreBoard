import styles from './formField.module.css'
import Input from '@/app/_components/input'
import Label from '@/app/_components/label'

export default function FormField({className, text, type, name, onChange, error, errorMsg}) {
    return (
        <div className={className}>
            <Label htmlFor={type} text={text} />
            <Input
                type={type}
                name={name}
                onChange={onChange}
                error={error}

            />
            {error && <div className={styles.error}>{errorMsg}</div>}
        </div>
    )
}