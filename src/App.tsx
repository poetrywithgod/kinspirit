import { useEffect, useState } from 'react'
import { ApiError, cacheProfile, cachedProfile, consumeAuthRedirect, currentSession, getMyProfile, signIn, signOut, signUp, type LoginResult } from './api'
import { AuthLayout } from './AuthLayout'
import { AppShell } from './app/AppShell'
import { PatternLayer } from './PatternLayer'
import { Profile } from './screens/Profile'
import { VerifyEmail } from './screens/VerifyEmail'
import { VerifyPhone } from './screens/VerifyPhone'
import { ForgotPassword } from './screens/ForgotPassword'
import { PasswordField } from './PasswordField'
import { pendingInvite } from './invite'
import { COUNTRIES, flag, guessCountry, normalizePhone, type Country } from './phone'

type Screen =
  | 'welcome'
  | 'signup'
  | 'login'
  | 'forgot'
  | 'verifyEmail'
  | 'verifyPhone'
  | 'profile'
  | 'home'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MIN_PASSWORD = 8

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
        {pendingInvite() && (
          <p className="invite-line">
            <strong>@{pendingInvite()}</strong> invited you to Kinspirit. Sign up or log in to chat with them.
          </p>
        )}
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
  const [country, setCountry] = useState<Country>(guessCountry)
  const normalized = normalizePhone(country, phone)
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
          <label className="prefix cc">
            <span aria-hidden="true">
              {flag(country.iso)} +{country.dial} ▾
            </span>
            <select
              aria-label="Country"
              value={country.iso}
              onChange={(e) => setCountry(COUNTRIES.find((c) => c.iso === e.target.value) ?? country)}
            >
              {COUNTRIES.map((c) => (
                <option key={c.iso} value={c.iso}>
                  {flag(c.iso)} {c.name} (+{c.dial})
                </option>
              ))}
            </select>
          </label>
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
          <p className="error">Enter a valid mobile number for {country.name}.</p>
        ) : (
          <p className="hint">Friends find you on Kinspirit by this number. Pick your country first.</p>
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
  onForgot,
  onDone,
}: {
  onBack: () => void
  onSignup: () => void
  onForgot: () => void
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
        <p className="switch">
          <button type="button" onClick={onForgot}>
            Forgot password?
          </button>
        </p>

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
      // Saved log-in: open the chats at once from the saved copy, then check with the server.
      const cached = cachedProfile()
      if (cached) {
        setUsername(cached.username)
        setAvatar(cached.avatar_url)
        setScreen('home')
      }
      let profile
      try {
        profile = await getMyProfile()
      } catch (e) {
        if (e instanceof ApiError && e.code === 'no_session') {
          // The server says this log-in is over.
          cacheProfile(null)
          setScreen('welcome')
          setNotice('Your session ended. Please log in again.')
        }
        return // offline or busy: stay where we are
      }
      if (profile) {
        setUsername(profile.username)
        setAvatar(profile.avatar_url)
        cacheProfile(profile)
        setScreen('home')
      } else if (!cached) {
        // Signed up but never finished the profile.
        setEmail(session.user.email ?? '')
        setPhone(String(session.user.user_metadata?.phone ?? ''))
        setScreen('verifyPhone')
      }
    })()
  }, [])

  const finishLogin = (r: LoginResult) => {
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
      cacheProfile({ username: r.username, avatar_url: r.avatar })
      setScreen('home')
    }
  }

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
          onForgot={() => setScreen('forgot')}
          onDone={finishLogin}
        />
      )
    case 'forgot':
      return <ForgotPassword onBack={() => setScreen('login')} onDone={finishLogin} />
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
            cacheProfile({ username: p.username, avatar_url: null })
            setScreen('home')
          }}
        />
      )
    case 'home':
      return (
        <AppShell
          username={username}
          avatar={avatar}
          onAvatarChange={(url) => {
            setAvatar(url)
            cacheProfile({ username, avatar_url: url })
          }}
          onUsernameChange={(u) => {
            setUsername(u)
            cacheProfile({ username: u, avatar_url: avatar })
          }}
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
