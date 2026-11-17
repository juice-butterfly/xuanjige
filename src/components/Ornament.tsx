import { useId } from 'react'

export function Ornament({
  variant,
  className,
}: {
  variant: 'cn' | 've'
  className?: string
}) {
  return (
    <div
      className={`ornament ornament--${variant}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {variant === 'cn' ? <CnDivider /> : <VeDivider />}
    </div>
  )
}

function CnDivider() {
  const raw = useId()
  const id = `cn-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg viewBox="0 0 240 26" preserveAspectRatio="none" focusable="false">
      <defs>
        <pattern id={id} width="26" height="26" patternUnits="userSpaceOnUse">
          <path
            d="M0 23h9V10h8v13h9M4 23V14h5v4h3"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
          />
        </pattern>
      </defs>
      <rect x="24" y="1" width="192" height="24" fill={`url(#${id})`} />
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        <path d="M7 7h13M7 13h13M7 19h13" />
        <path d="M220 7h13M220 13h6M227 13h6M220 19h13" />
      </g>
    </svg>
  )
}

function VeDivider() {
  const raw = useId()
  const id = `ve-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const arc = (t: number) => {
    const x = 10 + 220 * t
    const y = 30 - 72 * t * (1 - t)
    return { x, y }
  }
  const ticks = Array.from({ length: 13 }, (_, i) => ({ ...arc(i / 12), i }))
  const glyphs: Array<{ t: number; glyph: string }> = [
    { t: 0.12, glyph: '☉' },
    { t: 0.28, glyph: '☽' },
    { t: 0.44, glyph: '☿' },
    { t: 0.6, glyph: '♀' },
    { t: 0.76, glyph: '♂' },
    { t: 0.9, glyph: '♃' },
  ]
  return (
    <svg viewBox="0 0 240 34" preserveAspectRatio="none" focusable="false">
      <defs>
        <path id={id} d="M10 30Q120 -6 230 30" />
      </defs>
      <use href={`#${id}`} fill="none" stroke="currentColor" strokeWidth="0.9" />
      {ticks.map((tick) => (
        <line
          key={tick.i}
          x1={tick.x}
          y1={tick.y}
          x2={tick.x}
          y2={tick.y - 4}
          stroke="currentColor"
          strokeWidth="0.8"
        />
      ))}
      {glyphs.map((item) => {
        const point = arc(item.t)
        return (
          <text
            key={item.glyph}
            x={point.x}
            y={point.y - 8}
            fill="currentColor"
            fontSize="9"
            textAnchor="middle"
          >
            {item.glyph}
          </text>
        )
      })}
    </svg>
  )
}

export function CompassArt() {
  return (
    <svg className="form-aside-art" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor">
        <circle cx="100" cy="100" r="82" strokeWidth="1" />
        <circle cx="100" cy="100" r="66" strokeWidth="0.6" strokeDasharray="2 5" />
        <circle cx="100" cy="100" r="38" strokeWidth="0.8" />
        <rect x="62" y="62" width="76" height="76" strokeWidth="0.7" transform="rotate(45 100 100)" />
        <path d="M100 12v24M100 164v24M12 100h24M164 100h24" strokeWidth="1" />
      </g>
      {Array.from({ length: 24 }, (_, i) => {
        const angle = (i * Math.PI) / 12
        const long = i % 3 === 0
        const r1 = long ? 74 : 78
        return (
          <line
            key={i}
            x1={100 + Math.sin(angle) * r1}
            y1={100 - Math.cos(angle) * r1}
            x2={100 + Math.sin(angle) * 82}
            y2={100 - Math.cos(angle) * 82}
            stroke="currentColor"
            strokeWidth={long ? 0.9 : 0.5}
          />
        )
      })}
      <text
        x="100"
        y="108"
        textAnchor="middle"
        fill="currentColor"
        fontSize="30"
        fontFamily="var(--font-kai)"
      >
        玄
      </text>
      <text x="100" y="34" textAnchor="middle" fill="currentColor" fontSize="9">
        子
      </text>
      <text x="100" y="176" textAnchor="middle" fill="currentColor" fontSize="9">
        午
      </text>
      <text x="28" y="104" textAnchor="middle" fill="currentColor" fontSize="9">
        卯
      </text>
      <text x="172" y="104" textAnchor="middle" fill="currentColor" fontSize="9">
        酉
      </text>
    </svg>
  )
}

export function Enso() {
  return (
    <svg className="master-enso" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <path
        d="M62 14a47 47 0 1 1 -1 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="268 30"
      />
      <path
        d="M40 20a44 44 0 0 0 -18 26"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  )
}
