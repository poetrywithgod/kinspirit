import type { ReactNode } from 'react'
import { PatternLayer } from './PatternLayer'

export function AuthLayout({
  title,
  onBack,
  step,
  children,
}: {
  title: string
  onBack?: () => void
  step?: 1 | 2 | 3
  children: ReactNode
}) {
  return (
    <main className="auth">
      <header className="auth-head">
        <PatternLayer />
        {onBack ? (
          <button type="button" className="back" onClick={onBack}>
            ← Back
          </button>
        ) : (
          <span className="back-space" />
        )}
        <span className="auth-logo" role="img" aria-label="Kinspirit logo" />
        <h1>{title}</h1>
        {step && (
          <div className="steps" role="img" aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= step ? 'on' : ''} />
            ))}
          </div>
        )}
      </header>
      <section className="auth-sheet">
        <PatternLayer />
        {children}
      </section>
    </main>
  )
}
