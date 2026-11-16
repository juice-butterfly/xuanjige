// 未合之圆：缺口朝天，留白给未定之事；斗柄三星，圆心一点朱砂。
export function LogoMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
      <circle
        cx="24"
        cy="24"
        r="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="68.4 38.4"
        strokeDashoffset="87.6"
        transform="rotate(-90 24 24)"
        opacity="0.82"
      />
      <path
        d="M25 17.2 28.4 19.1 31.2 22.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="25" cy="17.2" r="1.3" fill="currentColor" opacity="0.9" />
      <circle cx="28.4" cy="19.1" r="1.3" fill="currentColor" opacity="0.9" />
      <circle cx="31.2" cy="22.4" r="1.3" fill="currentColor" opacity="0.9" />
      <circle cx="24" cy="24" r="2" fill="var(--brand-dot)" />
    </svg>
  )
}