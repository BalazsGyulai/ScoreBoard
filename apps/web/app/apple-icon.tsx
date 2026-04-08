import { ImageResponse } from 'next/og'

export const size = {
  width: 180,
  height: 180,
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
          borderRadius: '24px',
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="130"
          height="130"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#F1F5F9"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
          <path d="M10 2v2" />
          <path d="M14 2v2" />
          <path d="m17 18-1-9" />
          <path d="M6 2v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2" />
          <path d="M6 4h12" />
          <path d="m7 18 1-9" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  )
}