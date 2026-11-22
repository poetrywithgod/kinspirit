const KEY = 'kinspirit.theme'
export type ThemePref = 'system' | 'light' | 'dark'

export function getTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref: ThemePref) {
  const el = document.documentElement
  if (pref === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', pref)
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // storage blocked: the choice lasts until the page closes
  }
}
