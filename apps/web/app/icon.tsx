import { ImageResponse } from 'next/og'

export const size = {
    width: 32,
    height: 32,
}
export const contentType = 'image/png'

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: '#0F172A',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                }}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                >
                    <path d="M7 21h10a2 2 0 0 0 2-2v-1H5v1a2 2 0 0 0 2 2Z" fill="#F1F5F9" />
                    <path d="M8 18h8l-1-8H9l-1 8Z" fill="#F1F5F9" />
                    <path d="M8 4h2v3H8zM11 4h2v3h-2zM14 4h2v3h-2z" fill="#F1F5F9" />
                    <path d="M7 7h10v2a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7Z" fill="#F1F5F9" />
                </svg>
            </div>
        ),
        {
            ...size,
        }
    )
}