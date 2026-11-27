// Chat inside a meeting: shown while you are in it, kept on the server with the meeting.
import { useCallback, useEffect, useRef, useState } from 'react'
import { meetingMessagesSince, sendMeetingMessage, type MeetingMessage } from './api'

/** Merges newer messages into the list: no repeats, oldest first. */
export function mergeMessages(have: MeetingMessage[], more: MeetingMessage[]): MeetingMessage[] {
  if (!more.length) return have
  const seen = new Set(have.map((m) => m.id))
  const fresh = more.filter((m) => !seen.has(m.id))
  if (!fresh.length) return have
  return [...have, ...fresh].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
}

/** Polls the meeting chat every few seconds while `enabled`. `open` = the chat panel is showing. */
export function useMeetingChat(mid: string, enabled: boolean, open: boolean, me: string) {
  const [messages, setMessages] = useState<MeetingMessage[]>([])
  const [seen, setSeen] = useState(0) // how many messages were there when the panel was last open
  const last = useRef('')
  const alive = useRef(true)

  const pull = useCallback(async () => {
    if (!mid) return
    try {
      const more = await meetingMessagesSince(mid, last.current || undefined)
      if (!alive.current || !more.length) return
      last.current = more[more.length - 1].created_at
      setMessages((have) => mergeMessages(have, more))
    } catch {
      /* the next poll tries again */
    }
  }, [mid])

  useEffect(() => {
    alive.current = true
    if (!enabled) return
    void pull()
    const t = window.setInterval(() => document.visibilityState === 'visible' && void pull(), open ? 2500 : 6000)
    return () => {
      alive.current = false
      window.clearInterval(t)
    }
  }, [enabled, open, pull])

  // A new meeting starts with an empty chat.
  useEffect(() => {
    setMessages([])
    setSeen(0)
    last.current = ''
  }, [mid])

  useEffect(() => {
    if (open) setSeen(messages.length)
  }, [open, messages.length])

  const send = async (text: string) => {
    await sendMeetingMessage(mid, text)
    await pull()
  }

  const unread = open ? 0 : messages.slice(seen).filter((m) => m.sender_id !== me).length
  return { messages, unread, send }
}
