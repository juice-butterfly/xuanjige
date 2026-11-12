import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TERMS } from '../content/terms'

export function Term({
  name,
  children,
  className,
}: {
  name: string
  children?: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      className={`term${className ? ` ${className}` : ''}`}
      data-term={name}
      aria-haspopup="dialog"
    >
      {children ?? name}
    </button>
  )
}

export function useTermSheet() {
  const [activeTerm, setActiveTerm] = useState<string | null>(null)

  useEffect(() => {
    if (!activeTerm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveTerm(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTerm])

  function handleTermClick(e: MouseEvent<HTMLElement>) {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-term]')
    const name = target?.dataset.term
    if (!name) return
    setActiveTerm((prev) => (prev === name ? null : name))
  }

  return { activeTerm, handleTermClick, close: () => setActiveTerm(null) }
}

export function TermSheet({ term, onClose }: { term: string | null; onClose: () => void }) {
  if (!term) return null
  return createPortal(
    <div
      className="term-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="term-sheet-title"
    >
      <div className="term-sheet-head">
        <span className="term-sheet-kicker">术语</span>
        <strong id="term-sheet-title">{term}</strong>
        <button
          type="button"
          className="term-sheet-close"
          aria-label="收起释义"
          onClick={onClose}
        >
          收起
        </button>
      </div>
      <p className="term-sheet-text" aria-live="polite">
        {TERMS[term] ?? '这一条暂无释义。'}
      </p>
    </div>,
    document.body,
  )
}
