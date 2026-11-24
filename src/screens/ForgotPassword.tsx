import { useState } from 'react'
import { AuthLayout } from '../AuthLayout'
import { OtpInput } from '../OtpInput'
import { PasswordField } from '../PasswordField'
import { ApiError, EMAIL_OTP_LENGTH, requestPasswordReset, resetPassword, type LoginResult } from '../api'
import { useCountdown } from '../useCountdown'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MIN_PASSWORD = 8

export function ForgotPassword({ onBack, onDone }: { onBack: () => void; onDone: (r: LoginResult) => void }) {
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [left, restart] = useCountdown(30)

  const fail = (e: unknown, fallback: string) => setError(e instanceof ApiError ? e.message : fallback)

  const sendCode = async () => {
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.')
    setBusy(true)
    setError('')
    try {
      await requestPasswordReset(email.trim())
      restart()
      setStep('reset')
    } catch (e) {
      fail(e, 'Could not send the code. Try again.')
    }
    setBusy(false)
  }

  const reset = async () => {
    if (code.length < EMAIL_OTP_LENGTH) return setError(`Enter all ${EMAIL_OTP_LENGTH} digits.`)
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for the new password.`)
    setBusy(true)
    setError('')
    try {
      onDone(await resetPassword(email.trim(), code, password))
      return
    } catch (e) {
      if (e instanceof ApiError && e.code !== 'network' && e.status < 500 && e.code !== 'weak_password' && e.code !== 'same_password') {
        setError('That code is wrong or has expired. Check your email, or ask for a new code.')
        setCode('')
      } else fail(e, 'Something went wrong. Try again.')
    }
    setBusy(false)
  }

  if (step === 'email') {
    return (
      <AuthLayout title="Forgot password" onBack={onBack}>
        <p className="note">Enter the email you signed up with. We will send you a {EMAIL_OTP_LENGTH}-digit code to choose a new password.</p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void sendCode()
          }}
        >
          <div className="pill">
            <input type="email" inputMode="email" autoComplete="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="error center">{error}</p>}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" onBack={() => setStep('email')}>
      <p className="note">
        If <strong>{email.trim()}</strong> has an account, a {EMAIL_OTP_LENGTH}-digit code is on its way. Type it here and choose a new password.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void reset()
        }}
      >
        <OtpInput
          length={EMAIL_OTP_LENGTH}
          value={code}
          disabled={busy}
          invalid={!!error && code.length < EMAIL_OTP_LENGTH}
          onChange={(v) => {
            setCode(v)
            setError('')
          }}
        />
        <PasswordField value={password} onChange={setPassword} autoComplete="new-password" placeholder="New password" label="New password" />
        {error && <p className="error center">{error}</p>}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
        <p className="switch">
          {left > 0 ? (
            <>Resend code in {left}s</>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError('')
                requestPasswordReset(email.trim()).then(restart).catch((e: unknown) => fail(e, 'Could not resend. Try again.'))
              }}
            >
              Resend code
            </button>
          )}
        </p>
      </form>
    </AuthLayout>
  )
}
