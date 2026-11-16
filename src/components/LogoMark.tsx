// 雾中阁影：一檐飞起，月悬其上；柱影向下淡出，隐入雾里。
export function LogoMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <mask id="brand-moon">
          <rect width="48" height="48" fill="black" />
          <circle cx="35.8" cy="9.6" r="6.2" fill="white" />
          <circle cx="37" cy="7.8" r="5.45" fill="black" />
        </mask>
        <linearGradient id="brand-fade" x1="0" y1="30.6" x2="0" y2="41.4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" fill="var(--brand-dot)" mask="url(#brand-moon)" />
      <path
        d="M4.8 27.8C6 29.6 6.8 30.4 8.2 30.2C12.6 29.4 17.4 25.4 21 23.4L27 23.4C30.6 25.4 35.4 29.4 39.8 30.2C41.2 30.4 42 29.6 43.2 27.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 31V41.2M32 31V41.2"
        stroke="url(#brand-fade)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}