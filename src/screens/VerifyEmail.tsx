import { useEffect, useState } from 'react'
import { AuthLayout } from '../AuthLayout'
import { OtpInput } from '../OtpInput'
import { ApiError, EMAIL_OTP_LENGTH, onSessionFromOtherTab, sendEmailCode, verifyEmailCode } from '../api'
import { useCountdown } from '../useCountdown'

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(name.length - 1, 5)))}@${domain}`
}

export function VerifyEmail({
  email,
  onBack,
  onVerified,
}: {
  email: string
  onBack: () => void
  onVerified: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [left, restart] = useCountdown(30)

  // If the person taps "Confirm my email" in the message, this screen moves on by itself.
  useEffect(() => onSessionFromOtherTab(email, onVerified), [email, onVerified])

  const submit = async (c: string) => {
    if (c.length < EMAIL_OTP_LENGTH || busy) return
    setBusy(true)
    setError('')
    try {
      const ok = await verifyEmailCode(email, c)
      if (ok) {
        onVerified()
        return
      }
      setError('That code is wrong or has expired. Check your email and try again.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
    }
    setBusy(false)
    setCode('')
  }

  return (
    <AuthLayout title="Check your email" onBack={onBack} step={1}>
      <p className="note">
        We sent a {EMAIL_OTP_LENGTH}-digit code to <strong>{maskEmail(email)}</strong>. Type it here, or tap <strong>Confirm my email</strong> in the message and this page moves on by itself.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (code.length < EMAIL_OTP_LENGTH) setError(`Enter all ${EMAIL_OTP_LENGTH} digits.`)
          else void submit(code)
        }}
      >
        <OtpInput
          length={EMAIL_OTP_LENGTH}
          value={code}
          disabled={busy}
          invalid={!!error}
          onChange={(v) => {
            setCode(v)
            setError('')
            if (v.length === EMAIL_OTP_LENGTH) void submit(v)
          }}
        />
        {error && <p className="error center">{error}</p>}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Checking…' : 'Verify email'}
        </button>
        <p className="switch">
          {left > 0 ? (
            <>Resend code in {left}s</>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError('')
                sendEmailCode(email)
                  .then(restart)
                  .catch((e: unknown) =>
                    setError(e instanceof ApiError ? e.message : 'Could not resend. Try again.'),
                  )
              }}
            >
              Resend code
            </button>
          )}
        </p>
        <p className="switch">
          Wrong email?{' '}
          <button type="button" onClick={onBack}>
            Change it
          </button>
        </p>
      </form>
    </AuthLayout>
  )
}
