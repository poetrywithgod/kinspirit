import { useEffect, useRef } from 'react'

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  invalid,
}: {
  value: string
  onChange: (v: string) => void
  length?: number
  disabled?: boolean
  invalid?: boolean
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  // Focus the first box on arrival and again after the code is cleared.
  useEffect(() => {
    if (value === '' && !disabled) refs.current[0]?.focus()
  }, [value, disabled])

  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus()

  const setAt = (i: number, d: string) => {
    const next = digits.slice()
    next[i] = d
    onChange(next.join(''))
  }

  return (
    <div className={`otp${invalid ? ' otp-invalid' : ''}${length > 6 ? ' otp-long' : ''}`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="otp-box"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          disabled={disabled}
          value={d}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1)
            setAt(i, v)
            if (v) focus(i + 1)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i]) {
              e.preventDefault()
              setAt(Math.max(0, i - 1), '')
              focus(i - 1)
            } else if (e.key === 'ArrowLeft') focus(i - 1)
            else if (e.key === 'ArrowRight') focus(i + 1)
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
            if (!text) return
            e.preventDefault()
            onChange(text)
            focus(text.length >= length ? length - 1 : text.length)
          }}
        />
      ))}
    </div>
  )
}
