import { GroupIcon } from './icons'

export function Avatar({
  src,
  name,
  size = 48,
  group = false,
}: {
  src: string | null | undefined
  name: string
  size?: number
  group?: boolean
}) {
  return (
    <span
      className={`avatar-s${group ? ' group' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {group ? <GroupIcon /> : src ? <img src={src} alt="" loading="lazy" /> : <span>{name.replace(/^@/, '').slice(0, 1).toUpperCase()}</span>}
    </span>
  )
}
