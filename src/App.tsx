import { useEffect, useState } from 'react'
import { ApiError, consumeAuthRedirect, currentSession, getMyProfile, signIn, signOut, signUp, type LoginResult } from './api'
import { AuthLayout } from './AuthLayout'
import { Home } from './Home'
import { PatternLayer } from './PatternLayer'
import { Profile } from './screens/Profile'
import { VerifyEmail } from './screens/VerifyEmail'
import { VerifyPhone } from './screens/VerifyPhone'

type Screen =
  | 'welcome'
  | 'signup'
  | 'login'
  | 'verifyEmail'
  | 'verifyPhone'
  | 'profile'
  | 'home'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MIN_PASSWORD = 8

// Accepts 0803 123 4567, 803 123 4567 or +234 803 123 4567.
// Returns the number in +234 form, or null when it is not a valid Nigerian mobile number.
export function normalizeNigerianNumber(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('+234')) digits = digits.slice(4)
  else if (digits.startsWith('234')) digits = digits.slice(3)
  else if (digits.startsWith('0')) digits = digits.slice(1)
  return /^[789][01]\d{8}$/.test(digits) ? `+234${digits}` : null
}

function Welcome({
  notice,
  onSignup,
  onLogin,
}: {
  notice: string
  onSignup: () => void
  onLogin: () => void
}) {
  return (
    <main className="screen-welcome">
      <PatternLayer />
      <div className="welcome-top">
        <span className="logo-mark" role="img" aria-label="Kinspirit logo" />
        <h1 className="welcome-title">
          Welcome to
          <br />
          Kinspirit
        </h1>
      </div>
      <div className="welcome-gap" />
      <div className="welcome-bottom">
        {notice && (
          <p className="notice" role="alert">
            {notice}
          </p>
        )}
        <p className="tagline">
          Made for communities.
          <br />
          Light on data.
        </p>
        <div className="stack">
          <button type="button" className="btn welcome-btn" onClick={onSignup}>
            Get started
          </button>
          <button
            type="button"
            className="btn welcome-btn-ghost"
            onClick={onLogin}
          >
            I already have an account
          </button>
          <p className="fine-print">
            By continuing you agree to the Terms and Privacy Policy.
          </p>
        </div>
      </div>
    </main>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

function PasswordField({
  value,
  onChange,
  autoComplete,
  placeholder = 'Password',
}: {
  value: string
  onChange: (v: string) => void
  autoComplete: string
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="pill">
      <input
        id="password"
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-label="Password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="eye"
        aria-label={show ? 'Hide password' : 'Show password'}
        onClick={() => setShow((s) => !s)}
      >
        <EyeIcon off={show} />
      </button>
    </div>
  )
}

function Legal() {
  return (
    <p className="legal">
      By continuing you agree to the <a href="#terms">Terms of Service</a> and{' '}
      <a href="#privacy">Privacy Policy</a>.
    </p>
  )
}

function Signup({
  onBack,
  onLogin,
  onNext,
}: {
  onBack: () => void
  onLogin: () => void
  onNext: (email: string, phone: string, confirmed: boolean) => void
}) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const emailOk = EMAIL_RE.test(email.trim())
  const normalized = normalizeNigerianNumber(phone)
  const passwordOk = password.length >= MIN_PASSWORD

  return (
    <AuthLayout title="Create an account" onBack={onBack}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          setFormError('')
          if (!(emailOk && normalized && passwordOk) || busy) return
          setBusy(true)
          signUp(email.trim(), password, normalized)
            .then((r) => onNext(email.trim(), normalized, r === 'confirmed'))
            .catch((err: unknown) =>
              setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.'),
            )
            .finally(() => setBusy(false))
        }}
      >
        <div className="pill">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {touched && !emailOk && (
          <p className="error">Enter a valid email address.</p>
        )}

        <div className="pill">
          <span className="prefix" aria-hidden="true">
            🇳🇬 +234
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="Phone number"
            aria-label="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {touched && normalized === null ? (
          <p className="error">Enter a valid Nigerian mobile number.</p>
        ) : (
          <p className="hint">Friends find you on Kinspirit by this number.</p>
        )}

        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        {touched && !passwordOk ? (
          <p className="error">Use at least {MIN_PASSWORD} characters.</p>
        ) : null}

        {formError && <p className="error center">{formError}</p>}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <Legal />
        <div className="spacer" />
        <p className="switch">
          Have an account?{' '}
          <button type="button" onClick={onLogin}>
            Log in here
          </button>
        </p>
      </form>
    </AuthLayout>
  )
}

function Login({
  onBack,
  onSignup,
  onDone,
}: {
  onBack: () => void
  onSignup: () => void
  onDone: (r: LoginResult) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const emailOk = EMAIL_RE.test(email.trim())
  const passwordOk = password.length > 0

  return (
    <AuthLayout title="Welcome back" onBack={onBack}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          setFormError('')
          if (!(emailOk && passwordOk) || busy) return
          setBusy(true)
          signIn(email.trim(), password)
            .then(onDone)
            .catch((err: unknown) =>
              setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.'),
            )
            .finally(() => setBusy(false))
        }}
      >
        <div className="pill">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {touched && !emailOk && (
          <p className="error">Enter a valid email address.</p>
        )}

        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {touched && !passwordOk && (
          <p className="error">Enter your password.</p>
        )}

        {formError && <p className="error center">{formError}</p>}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <Legal />
        <div className="spacer" />
        <p className="switch">
          New here?{' '}
          <button type="button" onClick={onSignup}>
            Create an account
          </button>
        </p>
      </form>
    </AuthLayout>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  // On start: handle the "Confirm my email" link, then pick up where a saved log-in left off.
  useEffect(() => {
    void (async () => {
      const { session: fromLink, error } = await consumeAuthRedirect().catch(() => ({
        session: null,
        error: 'Could not confirm your email. Log in or sign up again.',
      }))
      if (error) setNotice(error)
      const session = fromLink ?? currentSession()
      if (!session) return
      const profile = await getMyProfile().catch((e: unknown) => (e instanceof ApiError && e.code === 'network' ? undefined : null))
      if (profile === undefined) return // offline: stay on the welcome screen
      if (profile) {
        setUsername(profile.username)
        setAvatar(profile.avatar_url)
        setScreen('home')
      } else if (fromLink) {
        setEmail(session.user.email ?? '')
        setPhone(String(session.user.user_metadata?.phone ?? ''))
        setScreen('verifyPhone')
      }
    })()
  }, [])

  switch (screen) {
    case 'welcome':
      return (
        <Welcome
          notice={notice}
          onSignup={() => setScreen('signup')}
          onLogin={() => setScreen('login')}
        />
      )
    case 'signup':
      return (
        <Signup
          onBack={() => setScreen('welcome')}
          onLogin={() => setScreen('login')}
          onNext={(e, p, confirmed) => {
            setEmail(e)
            setPhone(p)
            setScreen(confirmed ? 'verifyPhone' : 'verifyEmail')
          }}
        />
      )
    case 'login':
      return (
        <Login
          onBack={() => setScreen('welcome')}
          onSignup={() => setScreen('signup')}
          onDone={(r) => {
            if (r.kind === 'verify-email') {
              setEmail(r.email)
              setScreen('verifyEmail')
            } else if (r.kind === 'onboard') {
              setEmail(r.email)
              setPhone(r.phone)
              setScreen('verifyPhone')
            } else {
              setUsername(r.username)
              setAvatar(r.avatar)
              setScreen('home')
            }
          }}
        />
      )
    case 'verifyEmail':
      return (
        <VerifyEmail
          email={email}
          onBack={() => setScreen('signup')}
          onVerified={() => setScreen('verifyPhone')}
        />
      )
    case 'verifyPhone':
      return <VerifyPhone phone={phone} onVerified={() => setScreen('profile')} />
    case 'profile':
      return (
        <Profile
          phone={phone}
          onDone={(p) => {
            setUsername(p.username)
            setAvatar(p.photo)
            setScreen('home')
          }}
        />
      )
    case 'home':
      return (
        <Home
          username={username}
          avatar={avatar}
          onLogout={() => {
            void signOut().finally(() => {
              setAvatar(null)
              setUsername('')
              setScreen('welcome')
            })
          }}
        />
      )
  }
}
