import { useEffect, useState } from 'react'
import { AuthLayout } from '../AuthLayout'
import { OtpInput } from '../OtpInput'
import {
  DEV_CODE,
  WHATSAPP_NUMBER,
  checkPhoneVerified,
  createPhoneChallenge,
  sendSmsCode,
  verifySmsCode,
} from '../api'
import { useCountdown } from '../useCountdown'

export function VerifyPhone({
  phone,
  onVerified,
}: {
  phone: string
  onVerified: () => void
}) {
  const [mode, setMode] = useState<'whatsapp' | 'sms'>('whatsapp')
  const [challenge, setChallenge] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [left, restart] = useCountdown(30)

  useEffect(() => {
    let cancelled = false
    void createPhoneChallenge(phone).then((c) => {
      if (!cancelled) setChallenge(c)
    })
    return () => {
      cancelled = true
    }
  }, [phone])

  const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`My Kinspirit code is ${challenge}`)}`

  const checkWhatsapp = async () => {
    setBusy(true)
    setError('')
    const ok = await checkPhoneVerified(phone)
    setBusy(false)
    if (ok) onVerified()
    else setError('We have not received your message yet. Wait a few seconds and try again.')
  }

  const submitSms = async (c: string) => {
    if (c.length < 6 || busy) return
    setBusy(true)
    setError('')
    const ok = await verifySmsCode(phone, c)
    setBusy(false)
    if (ok) onVerified()
    else {
      setError('That code is not right. Try again.')
      setCode('')
    }
  }

  if (mode === 'sms') {
    return (
      <AuthLayout title="Confirm your phone" step={2}>
        <p className="note">
          We sent a 6-digit code by SMS to <strong>{phone}</strong>.
        </p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submitSms(code)
          }}
        >
          <OtpInput
            value={code}
            disabled={busy}
            invalid={!!error}
            onChange={(v) => {
              setCode(v)
              setError('')
              if (v.length === 6) void submitSms(v)
            }}
          />
          {error && <p className="error center">{error}</p>}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Checking…' : 'Verify phone'}
          </button>
          <p className="switch">
            {left > 0 ? (
              <>Resend code in {left}s</>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void sendSmsCode(phone)
                  restart()
                }}
              >
                Resend SMS
              </button>
            )}
          </p>
          <p className="switch">
            <button type="button" onClick={() => { setMode('whatsapp'); setError('') }}>
              Use WhatsApp instead
            </button>
          </p>
          {import.meta.env.DEV && <p className="dev-note">Dev mode: the server is not connected yet, use code {DEV_CODE}.</p>}
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Confirm your phone" step={2}>
      <p className="note">
        Send this code from <strong>{phone}</strong> to Kinspirit on WhatsApp. It is free, and no SMS is needed.
      </p>
      <div className="code-card" aria-live="polite">
        {challenge || '…'}
      </div>
      {WHATSAPP_NUMBER ? (
        <a className="btn btn-wa" href={waLink} target="_blank" rel="noreferrer">
          Open WhatsApp
        </a>
      ) : (
        <p className="dev-note">
          Kinspirit&apos;s WhatsApp number is not set yet. Add it as VITE_KINSPIRIT_WHATSAPP in a .env file.
        </p>
      )}
      <button type="button" className="btn btn-quiet" disabled={busy || !challenge} onClick={() => void checkWhatsapp()}>
        {busy ? 'Checking…' : 'I have sent it'}
      </button>
      {error && <p className="error center">{error}</p>}
      <div className="spacer" />
      <p className="switch">
        No WhatsApp?{' '}
        <button
          type="button"
          onClick={() => {
            void sendSmsCode(phone)
            restart()
            setError('')
            setMode('sms')
          }}
        >
          Send me an SMS code
        </button>
      </p>
    </AuthLayout>
  )
}
