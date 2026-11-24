import { useState } from 'react'

export function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

export function PasswordField({
  value,
  onChange,
  autoComplete,
  placeholder = 'Password',
  label = 'Password',
  className = 'pill',
}: {
  value: string
  onChange: (v: string) => void
  autoComplete: string
  placeholder?: string
  label?: string
  className?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className={className}>
      <input
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="eye" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>
        <EyeIcon off={show} />
      </button>
    </div>
  )
}
