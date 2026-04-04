import Image from 'next/image'
import styles from './icon.module.css'

type IconProps = {
    src: string
    alt: string
    width?: number
    height?: number
}

export default function Icon({src, alt, width, height}: IconProps) {

    return (
        <div className={styles.icon} style={{
            width: width,
            height: height
        }}>
            <Image src={src} alt={alt} fill={true} />
        </div>
    )
}