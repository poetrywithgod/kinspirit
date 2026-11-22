// Calls. One call at a time; it lives outside React so it keeps going while you move around the app.
import { useSyncExternalStore } from 'react'
import {
  AudioPresets,
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
} from 'livekit-client'
import { ApiError, callHost, callPass, callStatus, sendMessage } from './api'
import { addLocalAudio } from './library'

export type Row = { id: string; name: string; muted: boolean; speaking: boolean; host: boolean; me: boolean }
export type CallState = {
  phase: 'idle' | 'connecting' | 'live'
  open: boolean // the full call screen is showing
  cid: string
  title: string
  role: 'host' | 'member'
  micOn: boolean
  canSpeak: boolean
  locked: boolean
  people: Row[]
  startedAt: number
  recording: boolean
  recordingBy: string
  notice: string
  error: string
}

const idle: CallState = {
  phase: 'idle',
  open: false,
  cid: '',
  title: '',
  role: 'member',
  micOn: false,
  canSpeak: true,
  locked: false,
  people: [],
  startedAt: 0,
  recording: false,
  recordingBy: '',
  notice: '',
  error: '',
}
let st: CallState = idle
const subs = new Set<() => void>()
function set(p: Partial<CallState>) {
  st = { ...st, ...p }
  subs.forEach((f) => f())
}

let room: Room | null = null
const audioEls = new Map<string, HTMLMediaElement>()
let refreshTimer = 0

const roleOf = (p: Participant): 'host' | 'member' => {
  try {
    return (JSON.parse(p.metadata || '{}') as { role?: string }).role === 'host' ? 'host' : 'member'
  } catch {
    return 'member'
  }
}

function refresh() {
  if (!room) return
  window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    if (!room) return
    const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()]
    const people: Row[] = all
      .map((p) => ({
        id: p.identity,
        name: p.name || 'Guest',
        muted: !p.isMicrophoneEnabled,
        speaking: p.isSpeaking,
        host: roleOf(p) === 'host',
        me: p === room!.localParticipant,
      }))
      .sort((a, b) => Number(b.me) - Number(a.me) || Number(b.host) - Number(a.host) || a.name.localeCompare(b.name))
    let locked = false
    try {
      locked = (JSON.parse(room.metadata || '{}') as { locked?: boolean }).locked === true
    } catch {
      /* no metadata */
    }
    set({
      people,
      locked,
      micOn: room.localParticipant.isMicrophoneEnabled,
      canSpeak: room.localParticipant.permissions?.canPublish !== false,
    })
  }, 120)
}

function cleanup(reason = '') {
  window.clearTimeout(refreshTimer)
  stopMixer(true)
  audioEls.forEach((el) => el.remove())
  audioEls.clear()
  const r = room
  room = null
  void r?.disconnect()
  st = { ...idle, error: reason }
  subs.forEach((f) => f())
}

// ---------- joining and leaving ----------

export type CallTarget = { id: string; name: string; kind?: 'direct' | 'group' }

const newId = () => crypto.randomUUID()

/** Join the call for this chat. With `announce`, also posts "started a call" in the chat. */
export async function joinCall(chat: CallTarget, announce = false) {
  if (st.phase !== 'idle') {
    if (st.cid === chat.id) return set({ open: true })
    return set({ error: 'You are already in another call. Leave it first.', open: false })
  }
  set({ ...idle, phase: 'connecting', open: true, cid: chat.id, title: chat.name })
  try {
    if (announce) {
      await sendMessage({ id: newId(), conversation_id: chat.id, body: 'Started a call', kind: 'call' }).catch(() => {})
    }
    const pass = await callPass(chat.id)
    const r = new Room({
      dynacast: true,
      publishDefaults: { audioPreset: AudioPresets.speech, dtx: true, red: true },
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    room = r

    r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return
      const el = track.attach()
      el.style.display = 'none'
      document.body.appendChild(el)
      audioEls.set(track.sid ?? String(audioEls.size), el)
      mixTrack(track.sid ?? '', track.mediaStreamTrack)
    })
    r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove())
      audioEls.delete(track.sid ?? '')
      unmixTrack(track.sid ?? '')
    })
    for (const ev of [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.ParticipantPermissionsChanged,
      RoomEvent.RoomMetadataChanged,
      RoomEvent.ParticipantMetadataChanged,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
    ])
      r.on(ev, refresh)

    r.on(RoomEvent.DataReceived, (payload, from, _kind, topic) => {
      if (topic !== 'rec') return
      try {
        const d = JSON.parse(new TextDecoder().decode(payload)) as { on: boolean }
        set({ recording: d.on, recordingBy: d.on ? (from?.name ?? 'The host') : '' })
      } catch {
        /* ignore bad data */
      }
    })
    r.on(RoomEvent.Disconnected, (reason) => {
      if (room !== r) return
      cleanup(reason === DisconnectReason.PARTICIPANT_REMOVED ? 'You were removed from the call.' : 'The call ended.')
    })

    await r.connect(pass.url, pass.token, { autoSubscribe: true })
    await r.startAudio().catch(() => {})
    set({ phase: 'live', role: pass.role, startedAt: Date.now(), locked: pass.locked })
    if (pass.role === 'host' || !pass.locked) {
      await r.localParticipant.setMicrophoneEnabled(true).catch(() => {
        set({ notice: 'Microphone is blocked. Allow it in your browser to speak.' })
      })
    } else {
      set({ notice: 'The host has locked microphones.' })
    }
    refresh()
  } catch (e) {
    cleanup(e instanceof ApiError ? e.message : 'Could not join the call. Check your internet and try again.')
  }
}

/** Starts a call (or joins it if one is already running in this chat). */
export async function startCall(chat: CallTarget) {
  if (st.phase !== 'idle') return void joinCall(chat)
  let active = false
  try {
    active = (await callStatus(chat.id)).active
  } catch (e) {
    return set({ error: e instanceof ApiError ? e.message : 'Could not start the call.' })
  }
  await joinCall(chat, !active)
}

export function leaveCall() {
  if (st.phase === 'idle') return
  cleanup()
}

export const showCall = (open: boolean) => set({ open })
export const clearCallError = () => set({ error: '', notice: '' })

export async function toggleMic() {
  if (!room || !st.canSpeak) return
  try {
    await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled)
  } catch {
    set({ notice: 'Microphone is blocked. Allow it in your browser to speak.' })
  }
  refresh()
}

// ---------- host controls ----------

export async function hostAction(action: 'mute_all' | 'lock_all' | 'unlock_all' | 'remove', identity?: string) {
  if (!st.cid || st.role !== 'host') return
  try {
    await callHost(st.cid, action, identity)
    set({
      notice:
        action === 'mute_all'
          ? 'Everyone has been muted.'
          : action === 'lock_all'
            ? 'Microphones locked. Only hosts can speak.'
            : action === 'unlock_all'
              ? 'Microphones unlocked.'
              : 'Person removed.',
    })
  } catch (e) {
    set({ notice: e instanceof ApiError ? e.message : 'That did not work. Try again.' })
  }
}

// ---------- recording (host, saved on this phone) ----------

let ctx: AudioContext | null = null
let dest: MediaStreamAudioDestinationNode | null = null
let mixer: MediaRecorder | null = null
let chunks: Blob[] = []
let recStarted = 0
const sources = new Map<string, MediaStreamAudioSourceNode>()

function mixTrack(key: string, t: MediaStreamTrack) {
  if (!ctx || !dest) return
  try {
    const src = ctx.createMediaStreamSource(new MediaStream([t]))
    src.connect(dest)
    sources.set(key, src)
  } catch {
    /* track not ready */
  }
}
function unmixTrack(key: string) {
  sources.get(key)?.disconnect()
  sources.delete(key)
}

function announceRecording(on: boolean) {
  void room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ on })), { reliable: true, topic: 'rec' })
}

export function startRecording() {
  if (!room || st.role !== 'host' || mixer) return
  if (typeof MediaRecorder === 'undefined') return set({ notice: 'Recording is not supported on this browser.' })
  ctx = new AudioContext()
  dest = ctx.createMediaStreamDestination()
  // A silent source keeps the recording running even when nobody is talking.
  const keep = ctx.createOscillator()
  const mute = ctx.createGain()
  mute.gain.value = 0
  keep.connect(mute).connect(dest)
  keep.start()
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.audioTrackPublications.values()) {
      if (pub.track?.mediaStreamTrack) mixTrack(pub.trackSid, pub.track.mediaStreamTrack)
    }
  }
  const mine = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack
  if (mine) mixTrack('local', mine)
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t))
  chunks = []
  mixer = new MediaRecorder(dest.stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 })
  mixer.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
  recStarted = Date.now()
  mixer.start(2000)
  set({ recording: true, recordingBy: 'You' })
  announceRecording(true)
}

function stopMixer(save: boolean) {
  const m = mixer
  const title = st.title
  const cid = st.cid
  const seconds = (Date.now() - recStarted) / 1000
  mixer = null
  const finish = () => {
    sources.forEach((s) => s.disconnect())
    sources.clear()
    void ctx?.close().catch(() => {})
    ctx = null
    dest = null
  }
  if (!m) return finish()
  m.onstop = () => {
    finish()
    if (!save || chunks.length === 0) return
    const blob = new Blob(chunks, { type: m.mimeType || 'audio/webm' })
    chunks = []
    const when = new Date()
    void addLocalAudio(
      {
        id: `rec-${when.getTime()}`,
        name: `Call recording – ${title} – ${when.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        from: 'you',
        conversation_id: cid,
        size: blob.size,
        duration: seconds,
        added_at: Date.now(),
      },
      blob,
    ).catch(() => {})
  }
  if (m.state !== 'inactive') m.stop()
  else m.onstop(new Event('stop'))
}

export function stopRecording() {
  if (!mixer) return
  stopMixer(true)
  set({ recording: false, recordingBy: '', notice: 'Recording saved in your Audio tab.' })
  if (room && room.state === ConnectionState.Connected) announceRecording(false)
}

// ---------- reading the state ----------

export const useCall = (): CallState =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => st,
  )

export const inCallWith = (cid: string) => st.phase !== 'idle' && st.cid === cid
