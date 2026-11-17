const CN_DIGITS = '〇一二三四五六七八九'

export function localISODate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function cnNumber(n: number): string {
  if (n === 0) return '〇'
  if (n < 10) return CN_DIGITS[n]
  if (n < 20) return `十${n % 10 ? CN_DIGITS[n % 10] : ''}`
  return `${CN_DIGITS[Math.floor(n / 10)]}十${n % 10 ? CN_DIGITS[n % 10] : ''}`
}

export function cnPadded(n: number, len = 2): string {
  return String(n)
    .padStart(len, '0')
    .split('')
    .map((d) => CN_DIGITS[Number(d)])
    .join('')
}

export function cnDate(iso: string): string {
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return iso
  const [y, m, d] = parts
  return `${cnPadded(y, 4)}年${cnNumber(m)}月${cnNumber(d)}日`
}

export function cnTime(value: string | null): string {
  if (!value) return '时辰不详'
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return value
  return `${cnNumber(h)}时${cnPadded(m)}分`
}

export function plainDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${y} 年 ${m} 月 ${d} 日`
}

const SHICHEN = '子丑寅卯辰巳午未申酉戌亥'

export function shichen(value: string): string {
  const h = Number(value.split(':')[0])
  if (Number.isNaN(h)) return ''
  return `${SHICHEN[Math.floor(((h + 1) % 24) / 2)]}时`
}

export function coordsLabel(lat: number, lon: number): string {
  return `北纬 ${lat.toFixed(2)}° · 东经 ${lon.toFixed(2)}°`
}
